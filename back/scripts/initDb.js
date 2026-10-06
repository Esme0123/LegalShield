'use strict'

/**
 * scripts/initDb.js
 *
 * Inicializacion automatica de la base de datos para XAMPP / phpMyAdmin.
 * Se conecta SIN base seleccionada (root sin clave por defecto) y ejecuta de
 * forma secuencial:
 *
 *   1. CREATE DATABASE IF NOT EXISTS legalshield_db (utf8mb4 / unicode_ci)
 *   2. USE legalshield_db
 *   3. CREATE TABLE IF NOT EXISTS de las 7 tablas relacionales
 *   4. Triggers + vista de conveniencia (idempotentes)
 *   5. Seed: roles, permisos, matriz rol x permiso y usuario Admin
 *   6. Mensaje final + process.exit(0) para no dejar el terminal colgado
 *
 * Es idempotente: puede ejecutarse cuantas veces sea sin duplicar datos.
 *
 * Uso: npm run init-db   (o: node scripts/initDb.js)
 */

require('dotenv').config()

const mysql = require('mysql2/promise')
const bcrypt = require('bcryptjs')
const { logger } = require('../utils/logger')

const DB_NAME = process.env.DB_NAME || 'legalshield_db'
const DB_HOST = process.env.DB_HOST || 'localhost'
const DB_PORT = Number(process.env.DB_PORT || 3306)
const DB_USER = process.env.DB_USER || 'root'
const DB_PASSWORD = process.env.DB_PASSWORD || ''
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || 12)
const ADMIN_PASSWORD = process.env.DEMO_PASSWORD || 'Juris2026!Abg'

/* -------------------------------------------------------------------------- */
/* 3. Tablas relacionales                                                     */
/* -------------------------------------------------------------------------- */

const TABLES = [
  // 3.1 roles
  `CREATE TABLE IF NOT EXISTS roles (
     id          INT AUTO_INCREMENT PRIMARY KEY,
     code        VARCHAR(40)  NOT NULL UNIQUE,
     name        VARCHAR(80)  NOT NULL,
     description TEXT,
     created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 3.2 permissions
  `CREATE TABLE IF NOT EXISTS permissions (
     id          INT AUTO_INCREMENT PRIMARY KEY,
     code        VARCHAR(40)  NOT NULL UNIQUE,
     description TEXT,
     created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 3.3 role_permissions
  `CREATE TABLE IF NOT EXISTS role_permissions (
     role_id       INT NOT NULL,
     permission_id INT NOT NULL,
     granted_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
     granted_by    VARCHAR(32),
     PRIMARY KEY (role_id, permission_id),
     CONSTRAINT fk_rp_role       FOREIGN KEY (role_id)       REFERENCES roles(id)       ON DELETE CASCADE,
     CONSTRAINT fk_rp_permission FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE,
     INDEX idx_rp_permission (permission_id)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 3.4 users
  `CREATE TABLE IF NOT EXISTS users (
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
     password_updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
     created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
     updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
     CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE RESTRICT,
     CONSTRAINT chk_failed_attempts CHECK (failed_attempts >= 0),
     INDEX idx_users_role (role_id)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 3.5 password_history
  `CREATE TABLE IF NOT EXISTS password_history (
     id            INT AUTO_INCREMENT PRIMARY KEY,
     user_id       INT NOT NULL,
     password_hash VARCHAR(255) NOT NULL,
     created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
     CONSTRAINT fk_ph_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
     INDEX idx_password_history_user (user_id, created_at DESC)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 3.6 legal_cases
  `CREATE TABLE IF NOT EXISTS legal_cases (
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
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 3.7 security_logs
  `CREATE TABLE IF NOT EXISTS security_logs (
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
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
]

const TRIGGERS = [
  `CREATE TRIGGER trg_security_logs_no_update
     BEFORE UPDATE ON security_logs FOR EACH ROW
     SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'security_logs es inmutable: UPDATE no permitido'`,
  `CREATE TRIGGER trg_security_logs_no_delete
     BEFORE DELETE ON security_logs FOR EACH ROW
     SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'security_logs es inmutable: DELETE no permitido'`,
  `CREATE TRIGGER trg_users_updated_at
     BEFORE UPDATE ON users FOR EACH ROW
     SET NEW.updated_at = NOW()`,
  `CREATE TRIGGER trg_cases_updated_at
     BEFORE UPDATE ON legal_cases FOR EACH ROW
     SET NEW.updated_at = NOW()`,
]

const VIEW = `CREATE OR REPLACE VIEW vw_role_permission_matrix AS
  SELECT r.code AS role_code,
         r.name AS role_name,
         p.code AS permission_code,
         p.description AS permission_description,
         rp.granted_at,
         rp.granted_by
    FROM role_permissions rp
    JOIN roles       r ON r.id = rp.role_id
    JOIN permissions p ON p.id = rp.permission_id`

/* -------------------------------------------------------------------------- */
/* 4. Seed data                                                               */
/* -------------------------------------------------------------------------- */

const ROLES = [
  ['socio', 'Socio', 'Administrador total. Direccion del despacho.'],
  ['abogado', 'Abogado', 'Gestiona los expedientes asignados.'],
  ['asistente', 'Asistente', 'Lectura y apoyo administrativo.'],
  ['cliente', 'Cliente', 'Consulta limitada desde el portal.'],
]

const PERMISSIONS = [
  ['CASES_CREATE', 'Crear expedientes'],
  ['CASES_READ', 'Leer expedientes'],
  ['CASES_UPDATE', 'Actualizar expedientes'],
  ['ROLES_MANAGE', 'Administrar roles y permisos'],
  ['LOGS_VIEW', 'Ver logs de auditoria'],
  // Catalogo completo que exige la API (rbacMiddleware / casesRoutes).
  ['CASES_WRITE', 'Editar expedientes'],
  ['CASES_ARCHIVE', 'Archivar expedientes'],
  ['DOCS_REVEAL', 'Revelar documentos restringidos'],
  ['DOCS_DOWNLOAD', 'Descargar documentos'],
  ['LOGS_EXPORT', 'Exportar logs'],
  ['AUDIT_RECEIPT', 'Emitir comprobantes'],
  ['RBAC_MANAGE', 'Administrar matriz RBAC'],
  ['TOKEN_RESET', 'Emitir tokens de reseteo'],
  ['RISK_ASSESS', 'Modificar evaluacion de riesgo'],
]

const RBAC_MATRIX = {
  socio: [
    'CASES_CREATE', 'CASES_READ', 'CASES_UPDATE', 'CASES_WRITE', 'CASES_ARCHIVE',
    'DOCS_REVEAL', 'DOCS_DOWNLOAD', 'LOGS_VIEW', 'LOGS_EXPORT', 'AUDIT_RECEIPT',
    'ROLES_MANAGE', 'RBAC_MANAGE', 'TOKEN_RESET', 'RISK_ASSESS',
  ],
  abogado: ['CASES_CREATE', 'CASES_READ', 'CASES_UPDATE', 'CASES_WRITE', 'DOCS_REVEAL', 'LOGS_VIEW', 'AUDIT_RECEIPT', 'RISK_ASSESS'],
  asistente: ['CASES_CREATE', 'CASES_READ', 'CASES_UPDATE', 'CASES_WRITE', 'AUDIT_RECEIPT'],
  cliente: ['CASES_READ'],
}

const ADMIN = {
  userCode: 'LEG-2026-0001',
  username: 'admin',
  email: 'admin@legalshield.local',
}

/* -------------------------------------------------------------------------- */
/* Ejecucion                                                                   */
/* -------------------------------------------------------------------------- */

let conn = null

async function run(sql, params) {
  return conn.query(sql, params ?? [])
}

async function triggerExists(name) {
  const [rowsResult] = await conn.query(
    'SELECT COUNT(*) AS total FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = ? AND TRIGGER_NAME = ?',
    [DB_NAME, name],
  )
  return Number(rowsResult[0].total) > 0
}

async function main() {
  // 1. Base de datos (conexion SIN base seleccionada).
  conn = await mysql.createConnection({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT_MS || 10000),
    multipleStatements: false,
    dateStrings: false,
  })

  logger.info(`Conectado a ${DB_USER}@${DB_HOST}:${DB_PORT}`)
  await run(
    `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  )
  logger.info(`Base de datos "${DB_NAME}" verificada`)

  // 2. Seleccionar la base de datos.
  await run(`USE \`${DB_NAME}\``)

  // 3. Tablas relacionales.
  for (const ddl of TABLES) {
    const name = /CREATE TABLE IF NOT EXISTS (\w+)/.exec(ddl)[1]
    await run(ddl)
    logger.info(`Tabla lista: ${name}`)
  }

  // 4. Triggers idempotentes (MySQL no admite IF NOT EXISTS en CREATE TRIGGER)
  //    y vista de conveniencia para la matriz rol x permiso.
  for (const ddl of TRIGGERS) {
    const name = /CREATE TRIGGER (\w+)/.exec(ddl)[1]
    if (await triggerExists(name)) continue
    await run(ddl)
    logger.info(`Trigger creado: ${name}`)
  }
  await run(VIEW)
  logger.info('Vista vw_role_permission_matrix creada/actualizada')

  // 5. Seed data.
  for (const [code, name, description] of ROLES) {
    await run(
      'INSERT INTO roles (code, name, description) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description)',
      [code, name, description],
    )
  }
  logger.info(`Roles insertados: ${ROLES.length}`)

  for (const [code, description] of PERMISSIONS) {
    await run(
      'INSERT INTO permissions (code, description) VALUES (?, ?) ON DUPLICATE KEY UPDATE description = VALUES(description)',
      [code, description],
    )
  }
  logger.info(`Permisos insertados: ${PERMISSIONS.length}`)

  for (const [roleCode, codes] of Object.entries(RBAC_MATRIX)) {
    for (const permCode of codes) {
      await run(
        `INSERT IGNORE INTO role_permissions (role_id, permission_id)
         SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
          WHERE r.code = ? AND p.code = ?`,
        [roleCode, permCode],
      )
    }
  }
  logger.info('Matriz rol x permiso aplicada')

  // Usuario Admin por defecto (hash bcrypt real, nunca texto plano).
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, BCRYPT_ROUNDS)
  await run(
    `INSERT INTO users (user_code, username, email, password_hash, role_id, firm, department, failed_attempts, is_locked, password_updated_at)
     VALUES (?, ?, ?, ?, (SELECT id FROM roles WHERE code = 'socio'), 'LegalShield Bufetes', 'Direccion Juridica', 0, FALSE, NOW())
     ON DUPLICATE KEY UPDATE
       username = VALUES(username),
       email = VALUES(email),
       password_hash = VALUES(password_hash),
       role_id = VALUES(role_id),
       failed_attempts = 0,
       is_locked = FALSE,
       locked_at = NULL,
       password_updated_at = NOW()`,
    [ADMIN.userCode, ADMIN.username, ADMIN.email, passwordHash],
  )
  await run(
    `INSERT INTO password_history (user_id, password_hash)
     SELECT u.id, ? FROM users u
      WHERE u.user_code = ?
        AND NOT EXISTS (SELECT 1 FROM password_history ph WHERE ph.user_id = u.id)`,
    [passwordHash, ADMIN.userCode],
  )
  logger.info(`Usuario Admin creado: ${ADMIN.userCode} / ${ADMIN.username}`)

  // 6. Verificacion final: 7 tablas visibles en phpMyAdmin.
  const [tables] = await conn.query(
    'SELECT table_name AS nombre FROM information_schema.tables WHERE table_schema = ? ORDER BY table_name',
    [DB_NAME],
  )
  const [[{ total: roleCount }]] = await conn.query('SELECT COUNT(*) AS total FROM roles')
  const [[{ total: permCount }]] = await conn.query('SELECT COUNT(*) AS total FROM permissions')
  const [[{ total: grantCount }]] = await conn.query('SELECT COUNT(*) AS total FROM role_permissions')
  const [[{ total: userCount }]] = await conn.query('SELECT COUNT(*) AS total FROM users')

  logger.info(`Tablas creadas (${tables.length}): ${tables.map((t) => t.nombre).join(', ')}`)
  logger.info('Seed verificado', {
    roles: roleCount,
    permisos: permCount,
    asignaciones: grantCount,
    usuarios: userCount,
  })

  await conn.end()
  conn = null

  console.log(`[OK] Base de datos e instructivos creados exitosamente (${DB_NAME}, ${tables.length} tablas)`)
  process.exit(0)
}

main().catch(async (err) => {
  logger.error('Fallo la inicializacion de la base de datos', {
    message: err.message,
    code: err.code,
    errno: err.errno,
  })
  console.error(`[ERROR] ${err.message}`)
  try {
    if (conn) await conn.end()
  } catch {
    /* la conexion ya estaba cerrada */
  }
  process.exit(1)
})
