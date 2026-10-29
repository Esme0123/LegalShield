-- ============================================================================
-- LegalShield · Esquema relacional de la API REST (MySQL / XAMPP phpMyAdmin)
--
-- Compatible con MySQL 5.7+ / MariaDB 10.4+. Importable directamente desde
-- phpMyAdmin: crea la base `legalshield_db` si no existe.
--
-- ADVERTENCIA: este script solo crea (CREATE TABLE IF NOT EXISTS) y no migra una
-- base existente. Para migrar una BD ya creada use `npm run init-db`.
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
  lock_count          INT NOT NULL DEFAULT 0,
  is_locked           BOOLEAN NOT NULL DEFAULT FALSE,
  locked_at           DATETIME,
  locked_until        DATETIME,
  status              VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  deactivated_at      DATETIME,
  password_updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  unlock_token        CHAR(64),
  unlock_token_expires_at DATETIME,
  unlock_token_used   BOOLEAN NOT NULL DEFAULT FALSE,
  unlock_token_attempts INT NOT NULL DEFAULT 0,
  reset_token         CHAR(64) NULL DEFAULT NULL,
  reset_token_expires_at DATETIME,
  reset_token_used    BOOLEAN NOT NULL DEFAULT FALSE,
  reset_token_attempts INT NOT NULL DEFAULT 0,
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
-- 5b. user_permissions
--     Excepciones por usuario sobre su rol: granted=TRUE concede un permiso
--     extra, granted=FALSE lo retira solo a esa cuenta.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_permissions (
  user_id       INT NOT NULL,
  permission_id INT NOT NULL,
  granted       BOOLEAN NOT NULL,
  granted_by    VARCHAR(20),
  granted_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, permission_id),
  CONSTRAINT fk_up_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_up_permission FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
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
  assistant_id       INT,
  client_user_id     INT,
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
  CONSTRAINT fk_cases_assistant FOREIGN KEY (assistant_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_cases_client FOREIGN KEY (client_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT chk_case_status CHECK (status IN ('abierto', 'en_tramite', 'suspendido', 'archivado', 'cerrado')),
  CONSTRAINT chk_case_risk   CHECK (risk_level IN ('baja', 'media', 'alta', 'critica')),
  CONSTRAINT chk_case_progress CHECK (progress >= 0 AND progress <= 100),
  INDEX idx_cases_lawyer (assigned_lawyer_id),
  INDEX idx_cases_assistant (assistant_id),
  INDEX idx_cases_client (client_user_id),
  INDEX idx_cases_status (status),
  INDEX idx_cases_created (created_at DESC)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- 6b. case_documents
--     Prueba documental del expediente. El contenido sensible solo se entrega
--     via POST /api/cases/:id/documents/reveal (permiso DOCS_REVEAL).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS case_documents (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  case_id        INT NOT NULL,
  document_code  VARCHAR(40)  NOT NULL UNIQUE,
  filename       VARCHAR(200) NOT NULL,
  classification VARCHAR(30)  NOT NULL DEFAULT 'Publica',
  is_privileged  BOOLEAN      NOT NULL DEFAULT FALSE,
  mime_type      VARCHAR(100) NOT NULL DEFAULT 'application/pdf',
  page_count     INT          NOT NULL DEFAULT 1,
  checksum       CHAR(64),
  content        LONGTEXT,
  file_path      VARCHAR(255),
  size_bytes     INT,
  uploaded_by    VARCHAR(20),
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_docs_case FOREIGN KEY (case_id) REFERENCES legal_cases(id) ON DELETE CASCADE,
  CONSTRAINT chk_doc_classification CHECK (classification IN ('Publica', 'Uso interno', 'Restringida', 'Confidencial')),
  CONSTRAINT chk_doc_pages CHECK (page_count >= 1),
  INDEX idx_docs_case (case_id),
  INDEX idx_docs_privileged (case_id, is_privileged)
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
-- 7b. activity_logs
--     Bitacora de ACTIVIDAD de negocio (expedientes, documentos, perfil).
--     Separada de security_logs: no contiene eventos de acceso y control, y a
--     diferencia de aquella no es inmutable (permite depuracion/archivado).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS activity_logs (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_code  VARCHAR(20),
  action     VARCHAR(60) NOT NULL,
  ip_address VARCHAR(45),
  status     VARCHAR(20) NOT NULL DEFAULT 'INFO',
  details    LONGTEXT,
  timestamp  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_activity_status CHECK (status IN ('INFO', 'WARN', 'CRITICO')),
  INDEX idx_activity_timestamp (timestamp DESC),
  INDEX idx_activity_action (action),
  INDEX idx_activity_user (user_code)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- 7c. user_notifications
--     Avisos de seguridad dirigidos al titular de la cuenta (bloqueo, emision
--     de OTP, reactivacion). Cada usuario solo consulta los propios.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_notifications (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NOT NULL,
  type       VARCHAR(40)  NOT NULL,
  title      VARCHAR(200) NOT NULL,
  message    TEXT NOT NULL,
  is_read    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_notif_user_unread (user_id, is_read, created_at)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Triggers: inmovilizan la bitacora (UPDATE y DELETE lanzan excepcion).
-- Se crean solo si faltan: la bitacora nunca queda sin proteccion, ni siquiera
-- durante una reimportacion (ISO 27001 A.8.15).
-- ---------------------------------------------------------------------------
CREATE TRIGGER IF NOT EXISTS trg_security_logs_no_update
BEFORE UPDATE ON security_logs
FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'security_logs es inmutable: UPDATE no permitido';

CREATE TRIGGER IF NOT EXISTS trg_security_logs_no_delete
BEFORE DELETE ON security_logs
FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'security_logs es inmutable: DELETE no permitido';

-- ---------------------------------------------------------------------------
-- Triggers: actualizan updated_at automaticamente en users y legal_cases.
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_users_updated_at;
DROP TRIGGER IF EXISTS trg_cases_updated_at;
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
  (4, 'cliente',   'Cliente',   'Consulta portal'),
  (5, 'osi',       'OSI',       'Oficial de Seguridad de la Informacion: ABM de usuarios, matriz RBAC y bitacora de seguridad');

INSERT IGNORE INTO permissions (code, description) VALUES
  ('CASES_CREATE',  'Crear expedientes'),
  ('CASES_READ',    'Leer expedientes'),
  ('CASES_WRITE',   'Editar expedientes'),
  ('CASES_ARCHIVE', 'Archivar expedientes'),
  ('CASES_READ_ALL', 'Ver y operar todos los expedientes del despacho (alcance transversal)'),
  ('DOCS_REVEAL',   'Revelar documentos restringidos'),
  ('DOCS_DOWNLOAD', 'Descargar documentos'),
  ('LOGS_VIEW',     'Ver logs de aplicacion (actividad del despacho)'),
  ('LOGS_EXPORT',   'Exportar logs de aplicacion'),
  ('AUDIT_RECEIPT', 'Emitir comprobantes'),
  ('DOCS_UPLOAD',   'Subir prueba documental a sus expedientes'),
  ('TOKEN_RESET',   'Emitir tokens de reseteo'),
  ('RISK_ASSESS',   'Modificar evaluacion de riesgo'),
  ('USERS_READ',    'Ver lista y detalles de usuarios'),
  ('USERS_CREATE',  'Registrar usuarios (User ID nombre.apellido)'),
  ('USERS_UPDATE',  'Editar datos, rol o estado de usuarios'),
  ('USERS_DELETE',  'Dar de baja (desactivar) usuarios'),
  ('USERS_UNLOCK',  'Desbloquear usuarios (sin reset de clave)'),
  ('USERS_MANAGE',  'Gestionar el ABM completo de usuarios'),
  ('ROLES_MANAGE',  'Modificar la matriz de roles y permisos'),
  ('ACCOUNT_UNLOCK', 'Desbloquear cuentas inhabilitadas temporalmente'),
  ('SECURITY_LOGS_VIEW', 'Ver la bitacora de seguridad (eventos de acceso y control)');