-- ============================================================================
-- LegalShield · Esquema relacional de la API REST (MySQL / XAMPP phpMyAdmin)
--
-- Compatible con MySQL 5.7+ / MariaDB 10.4+. Importable directamente desde
-- phpMyAdmin: crea la base `legalshield_db` si no existe.
--
-- Convenciones:
--   · PK AUTO_INCREMENT
--   · Timestamps en DATETIME con DEFAULT CURRENT_TIMESTAMP
--   · Booleanos como BOOLEAN (TINYINT(1)) con DEFAULT FALSE
--   · Indices sobre FKs y columnas de filtrado frecuente
--   · TRIGGER en security_logs para bloquear UPDATE/DELETE (bitacora inmutable)
-- ============================================================================

CREATE DATABASE IF NOT EXISTS legalshield_db
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE legalshield_db;

-- ---------------------------------------------------------------------------
-- 1. roles
--    Catalogo de roles del despacho. `code` es el identificador estable que
--    consume el frontend (socio, abogado, asistente, cliente...).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  code        VARCHAR(40)  NOT NULL UNIQUE,
  name        VARCHAR(80)  NOT NULL,
  description TEXT,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- 2. permissions
--    Permisos atomicos del RBAC (mismo catalogo que PERMISSIONS en el frontend).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS permissions (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  code        VARCHAR(40)  NOT NULL UNIQUE,
  description TEXT,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- 3. role_permissions
--    Tabla puente N:M. PK compuesta evita duplicados al hacer UPSERT (INSERT
--    IGNORE). `granted_by` conserva el User ID del administrador que aplico.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id       INT NOT NULL,
  permission_id INT NOT NULL,
  granted_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  granted_by    VARCHAR(32),
  PRIMARY KEY (role_id, permission_id),
  CONSTRAINT fk_rp_role       FOREIGN KEY (role_id)       REFERENCES roles(id)       ON DELETE CASCADE,
  CONSTRAINT fk_rp_permission FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE,
  INDEX idx_rp_permission (permission_id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- 4. users
--    `user_code` es el User ID institucional con formato LEG-AAAA-NNNN.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  user_code           VARCHAR(20)  NOT NULL UNIQUE,
  username            VARCHAR(80)  NOT NULL UNIQUE,
  email               VARCHAR(160) NOT NULL UNIQUE,
  password_hash       VARCHAR(255) NOT NULL,
  role_id             INT NOT NULL,
  firm                VARCHAR(160),
  department          VARCHAR(120),
  phone               VARCHAR(40),
  failed_attempts     INT NOT NULL DEFAULT 0,
  is_locked           BOOLEAN NOT NULL DEFAULT FALSE,
  locked_at           DATETIME,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  deactivated_at      DATETIME,
  password_updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE RESTRICT,
  CONSTRAINT chk_failed_attempts CHECK (failed_attempts >= 0),
  INDEX idx_users_role (role_id),
  INDEX idx_users_active (is_active)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- 5. password_history
--    Historico de contrasenas para impedir la reutilizacion (ISO 27001 9.3).
--    Solo se conservan las ultimas PASSWORD_HISTORY_LIMIT (5) filas por usuario.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS password_history (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  user_id       INT NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ph_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_password_history_user (user_id, created_at DESC)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- 6. legal_cases
--    Expedientes judiciales. assigned_lawyer_id aplica control de acceso
--    por ambito (A01:2021): un abogado solo lee los expedientes asignados.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS legal_cases (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  case_number        VARCHAR(40)   NOT NULL UNIQUE,
  title              VARCHAR(200)  NOT NULL,
  client_name        VARCHAR(160)  NOT NULL,
  assigned_lawyer_id INT,
  status             VARCHAR(30)   NOT NULL DEFAULT 'abierto',
  matter             VARCHAR(40),
  court              VARCHAR(160),
  stage              VARCHAR(40),
  risk_level         VARCHAR(20)   NOT NULL DEFAULT 'media',
  progress           INT           NOT NULL DEFAULT 0,
  deadline           DATE,
  is_privileged      BOOLEAN       NOT NULL DEFAULT FALSE,
  created_at         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_at        DATETIME,
  CONSTRAINT fk_cases_lawyer FOREIGN KEY (assigned_lawyer_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT chk_case_status CHECK (status IN ('abierto', 'en_tramite', 'suspendido', 'archivado', 'cerrado')),
  CONSTRAINT chk_case_risk   CHECK (risk_level IN ('baja', 'media', 'alta', 'critica')),
  CONSTRAINT chk_case_progress CHECK (progress >= 0 AND progress <= 100),
  INDEX idx_cases_lawyer (assigned_lawyer_id),
  INDEX idx_cases_status (status),
  INDEX idx_cases_created (created_at DESC)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- 7. security_logs
--    Bitacora inmutable de seguridad. Solo admite INSERT (ver triggers).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS security_logs (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_code  VARCHAR(20),
  action     VARCHAR(60) NOT NULL,
  ip_address VARCHAR(45),
  status     VARCHAR(20) NOT NULL DEFAULT 'INFO',
  details    LONGTEXT,
  timestamp  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_log_status CHECK (status IN ('INFO', 'WARN', 'CRITICO')),
  INDEX idx_logs_timestamp (timestamp DESC),
  INDEX idx_logs_action (action),
  INDEX idx_logs_user (user_code)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Triggers: inmovilizan la bitacora (UPDATE y DELETE lanzan excepcion).
-- ---------------------------------------------------------------------------
CREATE TRIGGER trg_security_logs_no_update
BEFORE UPDATE ON security_logs
FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'security_logs es inmutable: UPDATE no permitido';

CREATE TRIGGER trg_security_logs_no_delete
BEFORE DELETE ON security_logs
FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'security_logs es inmutable: DELETE no permitido';

-- ---------------------------------------------------------------------------
-- Triggers: actualizan updated_at automaticamente en users y legal_cases.
-- ---------------------------------------------------------------------------
CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
SET NEW.updated_at = NOW();

CREATE TRIGGER trg_cases_updated_at
BEFORE UPDATE ON legal_cases
FOR EACH ROW
SET NEW.updated_at = NOW();

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

-- ---------------------------------------------------------------------------
-- Datos base: roles y permisos iniciales (idempotente).
-- ---------------------------------------------------------------------------
INSERT IGNORE INTO roles (id, code, name, description) VALUES
  (1, 'socio',     'Socio',     'Administrador total'),
  (2, 'abogado',   'Abogado',   'Gestiona casos asignados'),
  (3, 'asistente', 'Asistente', 'Lectura y apoyo'),
  (4, 'cliente',   'Cliente',   'Consulta portal');

INSERT IGNORE INTO permissions (code, description) VALUES
  ('CASES_CREATE',  'Crear expedientes'),
  ('CASES_READ',    'Leer expedientes'),
  ('CASES_WRITE',   'Editar expedientes'),
  ('CASES_ARCHIVE', 'Archivar expedientes'),
  ('DOCS_REVEAL',   'Revelar documentos restringidos'),
  ('DOCS_DOWNLOAD', 'Descargar documentos'),
  ('LOGS_VIEW',     'Ver logs de auditoria'),
  ('LOGS_EXPORT',   'Exportar logs'),
  ('AUDIT_RECEIPT', 'Emitir comprobantes'),
  ('RBAC_MANAGE',   'Administrar matriz RBAC'),
  ('TOKEN_RESET',   'Emitir tokens de reseteo'),
  ('RISK_ASSESS',   'Modificar evaluacion de riesgo'),
  ('USERS_READ',    'Ver lista y detalles de usuarios'),
  ('USERS_CREATE',  'Registrar usuarios (User ID nombre.apellido)'),
  ('USERS_UPDATE',  'Editar datos, rol o estado de usuarios'),
  ('USERS_DELETE',  'Dar de baja (desactivar) usuarios'),
  ('USERS_UNLOCK',  'Desbloquear usuarios y resetear clave');