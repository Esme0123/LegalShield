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
 *   3. CREATE TABLE IF NOT EXISTS de las 8 tablas relacionales
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
     is_active           BOOLEAN NOT NULL DEFAULT TRUE,
     deactivated_at      DATETIME,
     password_updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
     created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
     updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
     CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE RESTRICT,
     CONSTRAINT chk_failed_attempts CHECK (failed_attempts >= 0),
     INDEX idx_users_role (role_id),
     INDEX idx_users_active (is_active)
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
  // Catalogo atomico (17) replicando PERMISSIONS del frontend (seed.js).
  ['CASES_CREATE', 'Crear expedientes'],
  ['CASES_READ', 'Leer expedientes'],
  ['CASES_WRITE', 'Editar expedientes'],
  ['CASES_ARCHIVE', 'Archivar expedientes'],
  ['DOCS_REVEAL', 'Revelar documentos restringidos'],
  ['DOCS_DOWNLOAD', 'Descargar documentos'],
  ['LOGS_VIEW', 'Ver logs de auditoria'],
  ['LOGS_EXPORT', 'Exportar logs'],
  ['AUDIT_RECEIPT', 'Emitir comprobantes'],
  ['RBAC_MANAGE', 'Administrar matriz RBAC'],
  ['TOKEN_RESET', 'Emitir tokens de reseteo'],
  ['RISK_ASSESS', 'Modificar evaluacion de riesgo'],
  ['USERS_READ', 'Ver lista y detalles de usuarios'],
  ['USERS_CREATE', 'Registrar usuarios (User ID nombre.apellido)'],
  ['USERS_UPDATE', 'Editar datos, rol o estado de usuarios'],
  ['USERS_DELETE', 'Dar de baja (desactivar) usuarios'],
  ['USERS_UNLOCK', 'Desbloquear usuarios y resetear clave'],
]

const RBAC_MATRIX = {
  socio: PERMISSIONS.map(([code]) => code),
  abogado: ['CASES_CREATE', 'CASES_READ', 'CASES_WRITE', 'DOCS_REVEAL', 'LOGS_VIEW', 'AUDIT_RECEIPT', 'RISK_ASSESS', 'USERS_READ'],
  asistente: ['CASES_CREATE', 'CASES_READ', 'CASES_WRITE', 'AUDIT_RECEIPT'],
  cliente: ['CASES_READ'],
}

/** Catalogos obsoletos del seed previo: se limpian para alinear la matriz. */
const OBSOLETE_PERMISSIONS = ['CASES_UPDATE', 'ROLES_MANAGE']

/** Personas civiles de demostracion: replican DIRECTORY/USER_PROFILES (seed.js). */
const DEMO_USERS = [
  {
    userCode: 'LEG-2026-0001',
    username: 'mariana.solis',
    email: 'mariana.solis@vidalpenalto.co',
    role: 'socio',
    firm: 'Vidal & Penalto Bufetes',
    department: 'Direccion Juridica',
    phone: '+57 601 742 1180',
  },
  {
    userCode: 'LEG-2026-0142',
    username: 'diego.ferrer',
    email: 'diego.ferrer@vidalpenalto.co',
    role: 'abogado',
    firm: 'Vidal & Penalto Bufetes',
    department: 'Litigacion',
    phone: '+57 300 552 8841',
  },
  {
    userCode: 'LEG-2026-0277',
    username: 'lucia.ampara',
    email: 'lucia.ampara@vidalpenalto.co',
    role: 'asistente',
    firm: 'Vidal & Penalto Bufetes',
    department: 'Tramitacion',
    phone: '+57 315 409 2277',
  },
  {
    userCode: 'LEG-2026-0390',
    username: 'andres.quintero',
    email: 'andres.quintero@metalurgiaandes.co',
    role: 'cliente',
    firm: 'Metalurgia Andes S.A.S.',
    department: 'Externo',
    phone: '+57 310 228 4419',
  },
  {
    userCode: 'LEG-2026-0411',
    username: 'paula.sandoval',
    email: 'paula.sandoval@vidalpenalto.co',
    role: 'asistente',
    firm: 'Vidal & Penalto Bufetes',
    department: 'Archivo',
    phone: '+57 320 771 3390',
  },
]

const DEMO_CASES = [
  {
    caseNumber: 'EXP-2026-0014',
    title: 'Despido disciplinario · Metalurgia Andes',
    clientName: 'Metalurgia Andes S.A.S.',
    lawyerCode: 'LEG-2026-0142',
    status: 'en_tramite',
    matter: 'Laboral',
    court: 'Juzgado 12 Laboral de Bogota',
    stage: 'Prueba',
    riskLevel: 'alta',
    progress: 62,
    deadline: '2026-10-21',
    isPrivileged: true,
  },
  {
    caseNumber: 'EXP-2026-0021',
    title: 'Nulidad contractual · Consorcion Vento',
    clientName: 'Consorcion Vento S.A.',
    lawyerCode: 'LEG-2026-0001',
    status: 'abierto',
    matter: 'Civil',
    court: 'Tribunal Superior',
    stage: 'Contestacion',
    riskLevel: 'critica',
    progress: 38,
    deadline: '2026-10-09',
    isPrivileged: false,
  },
  {
    caseNumber: 'EXP-2026-0033',
    title: 'Derecho de peticion · Ministerio de Salud',
    clientName: 'Redaccion Norte (periodista)',
    lawyerCode: 'LEG-2026-0277',
    status: 'en_tramite',
    matter: 'Administrativo',
    court: 'Ministerio de Salud',
    stage: 'Seguimiento',
    riskLevel: 'media',
    progress: 84,
    deadline: '2026-11-02',
    isPrivileged: false,
  },
  {
    caseNumber: 'EXP-2026-0047',
    title: 'Sucesion intestada · Familia Ortegas',
    clientName: 'Familia Ortega Medina',
    lawyerCode: 'LEG-2026-0001',
    status: 'abierto',
    matter: 'Familia',
    court: 'Juzgado 3 de Sucesiones',
    stage: 'Peritaje',
    riskLevel: 'baja',
    progress: 47,
    deadline: '2026-11-18',
    isPrivileged: true,
  },
  {
    caseNumber: 'EXP-2026-0058',
    title: 'Propiedad industrial · Trademark Falcon',
    clientName: 'Falcon Studio SAS',
    lawyerCode: 'LEG-2026-0142',
    status: 'en_tramite',
    matter: 'Comercial',
    court: 'SIC - Decision 3',
    stage: 'Ejecucion',
    riskLevel: 'alta',
    progress: 71,
    deadline: '2026-10-27',
    isPrivileged: false,
  },
]

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

/** Migracion idempotente: ADD COLUMN IF NOT EXISTS no existe en MySQL 8. */
async function columnExists(table, column) {
  const [rows] = await conn.query(
    'SELECT COUNT(*) AS total FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    [DB_NAME, table, column],
  )
  return Number(rows[0].total) > 0
}

async function indexExists(table, index) {
  const [rows] = await conn.query(
    'SELECT COUNT(*) AS total FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?',
    [DB_NAME, table, index],
  )
  return Number(rows[0].total) > 0
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

  // 4b. Migracion idempotente: bases creadas por seeds previos no tienen baja
  //     logica (is_active / deactivated_at). Se agrega columna por columna.
  if (!(await columnExists('users', 'is_active'))) {
    await run('ALTER TABLE users ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE AFTER locked_at')
    logger.info('Columna agregada: users.is_active')
  }
  if (!(await columnExists('users', 'deactivated_at'))) {
    await run('ALTER TABLE users ADD COLUMN deactivated_at DATETIME AFTER is_active')
    logger.info('Columna agregada: users.deactivated_at')
  }
  if (!(await indexExists('users', 'idx_users_active'))) {
    await run('CREATE INDEX idx_users_active ON users (is_active)')
    logger.info('Indice agregado: users.idx_users_active')
  }

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
  // Catalogo previo desalineado con el frontend: se retira para mantener la
  // matriz rol x permiso exacta (17 permisos atomicos de seed.js / seed.sql).
  for (const code of OBSOLETE_PERMISSIONS) {
    await run('DELETE FROM permissions WHERE code = ?', [code])
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

  // Personas civiles de demostracion (mismas cuentas que DIRECTORY en el
  // frontend). El usuario previo "admin" colisiona en LEG-2026-0001, asi que
  // ON DUPLICATE KEY UPDATE lo transforma en mariana.solis (socio).
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, BCRYPT_ROUNDS)
  for (const user of DEMO_USERS) {
    await run(
      `INSERT INTO users
         (user_code, username, email, password_hash, role_id, firm, department, phone, password_updated_at)
       VALUES (?, ?, ?, ?, (SELECT id FROM roles WHERE code = ?), ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         username = VALUES(username),
         email = VALUES(email),
         password_hash = VALUES(password_hash),
         role_id = VALUES(role_id),
         firm = VALUES(firm),
         department = VALUES(department),
         phone = VALUES(phone),
         failed_attempts = 0,
         is_locked = FALSE,
         locked_at = NULL,
         is_active = TRUE,
         deactivated_at = NULL,
         password_updated_at = NOW()`,
      [user.userCode, user.username, user.email, passwordHash, user.role, user.firm, user.department, user.phone],
    )
    await run(
      `INSERT INTO password_history (user_id, password_hash)
       SELECT u.id, ? FROM users u
        WHERE u.user_code = ?
          AND NOT EXISTS (SELECT 1 FROM password_history ph WHERE ph.user_id = u.id)`,
      [passwordHash, user.userCode],
    )
    logger.info(`Usuario de demostracion listo: ${user.userCode} / ${user.username} (${user.role})`)
  }

  // Expedientes de demostracion (CASES del frontend), idempotentes.
  for (const c of DEMO_CASES) {
    await run(
      `INSERT INTO legal_cases
         (case_number, title, client_name, assigned_lawyer_id, status, matter, court, stage, risk_level, progress, deadline, is_privileged)
       VALUES (?, ?, ?, (SELECT id FROM users WHERE user_code = ?), ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         title = VALUES(title),
         status = VALUES(status),
         progress = VALUES(progress),
         deadline = VALUES(deadline)`,
      [
        c.caseNumber, c.title, c.clientName, c.lawyerCode, c.status, c.matter, c.court,
        c.stage, c.riskLevel, c.progress, c.deadline, c.isPrivileged,
      ],
    )
  }
  logger.info(`Expedientes de demostracion listos: ${DEMO_CASES.length}`)

  // 6. Verificacion final: 8 tablas visibles en phpMyAdmin.
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
