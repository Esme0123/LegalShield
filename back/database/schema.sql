-- ============================================================================
-- LegalShield · Esquema relacional de la API REST
-- Compatible con PostgreSQL 14+ (scriptExtensions = psql)
--
-- Convenciones:
--   · PK autoincremental en SERIAL
--   · Timestamps en TIMESTAMPTZ (UTC) con DEFAULT now()
--   · Booleanos con NOT NULL DEFAULT para evitar NULL logico
--   · Indices sobre FKs y columnas de filtrado frecuente
--   · TRIGGER en security_logs para bloquear UPDATE/DELETE (bitacora inmutable)
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. roles
--    Catálogo de roles del despacho. `code` es el identificador estable que
--    consume el frontend (socio, abogado, asistente, cliente...).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
  id          SERIAL PRIMARY KEY,
  code        VARCHAR(40)  NOT NULL UNIQUE,
  name        VARCHAR(80)  NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE  roles IS 'Catalogo de roles del despacho';
COMMENT ON COLUMN roles.code IS 'Identificador estable usado por la aplicacion';

-- ---------------------------------------------------------------------------
-- 2. permissions
--    Permisos atomicos del RBAC (mismo catalogo que PERMISSIONS en el frontend).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS permissions (
  id          SERIAL PRIMARY KEY,
  code        VARCHAR(40)  NOT NULL UNIQUE,
  description TEXT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE permissions IS 'Permisos atomicos del control de acceso';

-- ---------------------------------------------------------------------------
-- 3. role_permissions
--    Tabla puente N:M. PK compuesta evita duplicados al hacer UPSERT.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id       INTEGER NOT NULL REFERENCES roles(id)       ON DELETE CASCADE,
  permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  granted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  granted_by    VARCHAR(32),
  CONSTRAINT pk_role_permissions PRIMARY KEY (role_id, permission_id)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_permission ON role_permissions(permission_id);

COMMENT ON TABLE role_permissions IS 'Asignaciones rol -> permiso (matriz SIS-321)';

-- ---------------------------------------------------------------------------
-- 4. users
--    `user_code` es el User ID institucional con formato LEG-2026-XXXX.
--    `role_id` referencia el rol asignado; el nombre exacto de la columna de rol
--    se mantiene como rol_id para no colisionar con la tabla roles.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id                  SERIAL PRIMARY KEY,
  user_code           VARCHAR(20)  NOT NULL UNIQUE,
  username            VARCHAR(80)  NOT NULL UNIQUE,
  email               VARCHAR(160) NOT NULL UNIQUE,
  password_hash       VARCHAR(255) NOT NULL,
  role_id             INTEGER      NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  firm                VARCHAR(160),
  department          VARCHAR(120),
  phone               VARCHAR(40),
  failed_attempts     INTEGER      NOT NULL DEFAULT 0,
  is_locked           BOOLEAN      NOT NULL DEFAULT FALSE,
  locked_at           TIMESTAMPTZ,
  password_updated_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT chk_user_code_format CHECK (user_code ~ '^LEG-[0-9]{4}-[0-9]{4}$'),
  CONSTRAINT chk_failed_attempts    CHECK (failed_attempts >= 0)
);

CREATE INDEX IF NOT EXISTS idx_users_role   ON users(role_id);
CREATE INDEX IF NOT EXISTS idx_users_locked ON users(is_locked) WHERE is_locked = TRUE;

COMMENT ON COLUMN users.user_code     IS 'User ID estandarizado LEG-AAAA-NNNN';
COMMENT ON COLUMN users.is_locked     IS 'Bloqueo por politica anti-fuerza bruta';
COMMENT ON TABLE  users               IS 'Cuentas de acceso al expediente electronico';

-- ---------------------------------------------------------------------------
-- 5. password_history
--    Historico de contrasenas para impedir la reutilizacion (ISO 27001 9.3).
--    Solo se conservan las ultimas PASSWORD_HISTORY_LIMIT (5) filas por usuario.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS password_history (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  password_hash VARCHAR(255) NOT NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_history_user
  ON password_history(user_id, created_at DESC);

COMMENT ON TABLE password_history IS 'Historico de contrasenas para bloquear reutilizacion';

-- ---------------------------------------------------------------------------
-- 6. legal_cases
--    Expedientes judiciales. assigned_lawyer_id aplica control de acceso
--    por ambito (A01:2021): un abogado solo lee los expedientes asignados.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS legal_cases (
  id                 SERIAL PRIMARY KEY,
  case_number        VARCHAR(40)   NOT NULL UNIQUE,
  title              VARCHAR(200)  NOT NULL,
  client_name        VARCHAR(160)  NOT NULL,
  assigned_lawyer_id INTEGER       REFERENCES users(id) ON DELETE SET NULL,
  status             VARCHAR(30)   NOT NULL DEFAULT 'abierto',
  matter             VARCHAR(40),
  court              VARCHAR(160),
  stage              VARCHAR(40),
  risk_level         VARCHAR(20)   NOT NULL DEFAULT 'media',
  progress           INTEGER       NOT NULL DEFAULT 0,
  deadline           DATE,
  is_privileged      BOOLEAN       NOT NULL DEFAULT FALSE,
  created_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),
  archived_at        TIMESTAMPTZ,
  CONSTRAINT chk_case_status CHECK (
    status IN ('abierto', 'en_tramite', 'suspendido', 'archivado', 'cerrado')
  ),
  CONSTRAINT chk_case_risk   CHECK (risk_level IN ('baja', 'media', 'alta', 'critica')),
  CONSTRAINT chk_case_progress CHECK (progress >= 0 AND progress <= 100)
);

CREATE INDEX IF NOT EXISTS idx_cases_lawyer  ON legal_cases(assigned_lawyer_id);
CREATE INDEX IF NOT EXISTS idx_cases_status  ON legal_cases(status);
CREATE INDEX IF NOT EXISTS idx_cases_created ON legal_cases(created_at DESC);

COMMENT ON COLUMN legal_cases.assigned_lawyer_id IS
  'Titular del expediente; base del control de acceso por ambito (A01:2021)';

-- ---------------------------------------------------------------------------
-- 7. security_logs
--    Bitacora inmutable de seguridad. Solo admite INSERT (ver trigger).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS security_logs (
  id         SERIAL PRIMARY KEY,
  user_code  VARCHAR(20),
  action     VARCHAR(60) NOT NULL,
  ip_address VARCHAR(45),
  status     VARCHAR(20) NOT NULL DEFAULT 'INFO',
  details    JSONB,
  timestamp  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_log_status CHECK (status IN ('INFO', 'WARN', 'CRITICO'))
);

CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON security_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_logs_action    ON security_logs(action);
CREATE INDEX IF NOT EXISTS idx_logs_user      ON security_logs(user_code);

COMMENT ON TABLE security_logs IS 'Historial inmutable de eventos de seguridad';

-- ---------------------------------------------------------------------------
-- Trigger: inmoviliza la bitacora. UPDATE y DELETE lanzan excepcion.
-- La retencion se resuelve con expiracion de Logs en el servidor, nunca con DELETE.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_forbid_log_mutation() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'security_logs es inmutable: % no permitido', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_security_logs_immutable ON security_logs;
CREATE TRIGGER trg_security_logs_immutable
  BEFORE UPDATE OR DELETE ON security_logs
  FOR EACH ROW EXECUTE FUNCTION fn_forbid_log_mutation();

-- ---------------------------------------------------------------------------
-- Trigger: actualiza users.updated_at automaticamente
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

DROP TRIGGER IF EXISTS trg_cases_updated_at ON legal_cases;
CREATE TRIGGER trg_cases_updated_at
  BEFORE UPDATE ON legal_cases
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ---------------------------------------------------------------------------
-- Vista de conveniencia: matriz rol x permiso lista para GET /api/roles/matrix
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_role_permission_matrix AS
SELECT
  r.code AS role_code,
  r.name AS role_name,
  p.code AS permission_code,
  p.description AS permission_description,
  rp.granted_at,
  rp.granted_by
FROM role_permissions rp
JOIN roles       r ON r.id = rp.role_id
JOIN permissions p ON p.id = rp.permission_id;

COMMIT;