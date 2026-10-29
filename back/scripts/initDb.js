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
 *   3. CREATE TABLE IF NOT EXISTS de las tablas relacionales
 *   4. Triggers + vista de conveniencia (idempotentes)
 *   5. Seed: roles (incluye OSI), permisos, matriz rol x permiso y usuarios
 *   6. Mensaje final + process.exit(0) para no dejar el terminal colgado
 *
 * Es idempotente: puede ejecutarse cuantas veces sea sin duplicar datos.
 *
 * Uso: npm run init-db   (o: node scripts/initDb.js)
 */

require('dotenv').config()

const crypto = require('crypto')
const mysql = require('mysql2/promise')
const bcrypt = require('bcryptjs')
const { logger } = require('../utils/logger')
const { RBAC_MATRIX } = require('../config/rbacBaseline')

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
     lock_count          INT NOT NULL DEFAULT 0,
     is_locked           BOOLEAN NOT NULL DEFAULT FALSE,
     locked_at           DATETIME,
     locked_until        DATETIME,
     status              VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',
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

  // 3.5b user_permissions · excepciones por usuario sobre su rol. granted=TRUE
  //      concede un permiso extra; granted=FALSE se lo retira solo a esa cuenta.
  `CREATE TABLE IF NOT EXISTS user_permissions (
     user_id       INT NOT NULL,
     permission_id INT NOT NULL,
     granted       BOOLEAN NOT NULL,
     granted_by    VARCHAR(20),
     granted_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
     PRIMARY KEY (user_id, permission_id),
     CONSTRAINT fk_up_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
     CONSTRAINT fk_up_permission FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 3.6 legal_cases
  `CREATE TABLE IF NOT EXISTS legal_cases (
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
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 3.6b case_documents · prueba documental del expediente. El contenido
  //      sensible solo se entrega con DOCS_REVEAL via endpoint de revelacion.
  `CREATE TABLE IF NOT EXISTS case_documents (
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
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 3.7 security_logs · eventos de acceso y control (ciberseguridad), visibles
  //     unicamente para el rol OSI en el modulo de Auditoria de Seguridad.
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

  // 3.8 activity_logs · acciones de negocio del despacho (operativas), visibles
  //     en Dashboard y Expedientes para Socios y Abogados.
  `CREATE TABLE IF NOT EXISTS activity_logs (
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
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 3.9 user_notifications · avisos de seguridad dirigidos al titular de la cuenta
  //     (bloqueo, emision de OTP, reactivacion). Cada usuario solo ve los propios.
  `CREATE TABLE IF NOT EXISTS user_notifications (
     id         INT AUTO_INCREMENT PRIMARY KEY,
     user_id    INT NOT NULL,
     type       VARCHAR(40)  NOT NULL,
     title      VARCHAR(200) NOT NULL,
     message    TEXT NOT NULL,
     is_read    BOOLEAN NOT NULL DEFAULT FALSE,
     created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
     CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
     INDEX idx_notif_user_unread (user_id, is_read, created_at)
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
  ['osi', 'OSI', 'Oficial de Seguridad de la Informacion. ABM de usuarios, matriz RBAC y bitacora de seguridad.'],
  ['socio', 'Socio', 'Direccion legal. Expedientes, asignacion de abogados y metricas del despacho.'],
  ['abogado', 'Abogado', 'Gestiona los expedientes asignados.'],
  ['asistente', 'Asistente', 'Lectura y apoyo administrativo.'],
  ['cliente', 'Cliente', 'Consulta limitada desde el portal.'],
]

const PERMISSIONS = [
  // Catalogo atomico (22) replicando PERMISSIONS del frontend (seed.js).
  ['CASES_CREATE', 'Crear expedientes'],
  ['CASES_READ', 'Leer expedientes'],
  ['CASES_WRITE', 'Editar expedientes'],
  ['CASES_ARCHIVE', 'Archivar expedientes'],
  ['CASES_READ_ALL', 'Ver y operar todos los expedientes del despacho (alcance transversal)'],
  ['DOCS_REVEAL', 'Revelar documentos restringidos'],
  ['DOCS_DOWNLOAD', 'Descargar documentos'],
  ['DOCS_UPLOAD', 'Subir prueba documental a sus expedientes'],
  ['LOGS_VIEW', 'Ver logs de aplicacion (actividad del despacho)'],
  ['LOGS_EXPORT', 'Exportar logs de aplicacion'],
  ['AUDIT_VIEW', 'Ver la seccion Auditoria (bitacora de actividad del despacho)'],
  ['AUDIT_RECEIPT', 'Emitir comprobantes'],
  ['TOKEN_RESET', 'Emitir tokens de reseteo'],
  ['RISK_ASSESS', 'Modificar evaluacion de riesgo'],
  ['USERS_READ', 'Ver lista y detalles de usuarios'],
  ['USERS_CREATE', 'Registrar usuarios (User ID nombre.apellido)'],
  ['USERS_UPDATE', 'Editar datos, rol o estado de usuarios'],
  ['USERS_DELETE', 'Dar de baja (desactivar) usuarios'],
  ['USERS_UNLOCK', 'Desbloquear usuarios (sin reset de clave)'],
  // Segregacion OSI: estos cuatro permisos son exclusivos del rol OSI.
  ['USERS_MANAGE', 'Gestionar el ABM completo de usuarios'],
  ['ROLES_MANAGE', 'Modificar la matriz de roles y permisos'],
  ['ACCOUNT_UNLOCK', 'Desbloquear cuentas inhabilitadas temporalmente'],
  ['SECURITY_LOGS_VIEW', 'Ver la bitacora de seguridad (eventos de acceso y control)'],
]

/**
 * Catalogos obsoletos: se limpian para alinear la matriz. RBAC_MANAGE duplicaba
 * a ROLES_MANAGE (ambos abrian la misma matriz): queda solo ROLES_MANAGE.
 */
const OBSOLETE_PERMISSIONS = ['CASES_UPDATE', 'RBAC_MANAGE']

/** Personas civiles de demostracion: replican DIRECTORY/USER_PROFILES (seed.js). */
const DEMO_USERS = [
  {
    userCode: 'LEG-2026-0002',
    username: 'osi.seguridad',
    email: 'osi@legalshield.bo',
    role: 'osi',
    firm: 'LegalShield Bufetes',
    department: 'Seguridad de la Informacion',
    phone: '+591 2 244 1199',
  },
  {
    userCode: 'LEG-2026-0001',
    username: 'mariana.solis',
    email: 'mariana.solis@legalshield.bo',
    role: 'socio',
    firm: 'LegalShield Bufetes',
    department: 'Direccion Juridica',
    phone: '+591 2 244 1180',
  },
  {
    userCode: 'LEG-2026-0142',
    username: 'diego.ferrer',
    email: 'diego.ferrer@legalshield.bo',
    role: 'abogado',
    firm: 'LegalShield Bufetes',
    department: 'Litigacion',
    phone: '+591 3 552 8841',
  },
  {
    userCode: 'LEG-2026-0411',
    username: 'paula.sando',
    email: 'paula.sando@legalshield.bo',
    role: 'asistente',
    firm: 'LegalShield Bufetes',
    department: 'Archivo',
    phone: '+591 3 771 3390',
  },
  {
    userCode: 'LEG-2026-0390',
    username: 'carlos.cliente',
    email: 'carlos.cliente@gmail.com',
    role: 'cliente',
    firm: 'Cliente Externo',
    department: 'Externo',
    phone: '+591 3 228 4419',
  },
]

/**
 * Cuentas de pruebas del equipo LegalShield. Cada integrante tiene su cuenta OSI
 * (nombre.apellido) y una cuenta por rol operativo (nombre.rol), para que cada
 * uno haga sus pruebas sin depender de que otra cuenta este bloqueada.
 * Se crean una sola vez con la clave inicial y must_change_password = TRUE:
 * re-ejecutar init-db NO las sobrescribe (cada titular ya cambio su clave).
 */
const TEAM_MEMBERS = [
  { first: 'luis', last: 'paredes', fullName: 'Luis Angel Paredes Torrez' },
  { first: 'rodny', last: 'siles', fullName: 'Rodny Gerald Siles Barrenechea' },
  { first: 'carlos', last: 'pinell', fullName: 'Carlos Fernando Pinell Mealla' },
  { first: 'fabricio', last: 'condarco', fullName: 'Fabricio Condarco Poma' },
  { first: 'esmeralda', last: 'medina', fullName: 'Esmeralda Paula Medina Paredes' },
  { first: 'joan', last: 'riveros', fullName: 'Joan Marcelo Riveros Soria' },
]

const TEAM_ROLES = [
  { role: 'osi', suffix: null, firm: 'LegalShield Bufetes', department: 'Seguridad de la Informacion' },
  { role: 'socio', suffix: 'socio', firm: 'LegalShield Bufetes', department: 'Direccion Juridica' },
  { role: 'abogado', suffix: 'abogado', firm: 'LegalShield Bufetes', department: 'Litigacion' },
  { role: 'asistente', suffix: 'asistente', firm: 'LegalShield Bufetes', department: 'Archivo' },
  { role: 'cliente', suffix: 'cliente', firm: 'Cliente Externo', department: 'Externo' },
]

/** "carlos.cliente" ya es la cuenta demo LEG-2026-0390: se aplica la regla 9.1 (sufijo 1). */
const TEAM_USERNAME_OVERRIDES = { 'carlos.cliente': 'carlos.cliente1' }

/** User ID fijo por integrante y rol: LEG-2026-05<integrante><rol> (0511..0565). */
const TEAM_USERS = TEAM_MEMBERS.flatMap((member, i) =>
  TEAM_ROLES.map((r, j) => {
    const base = `${member.first}.${r.suffix ?? member.last}`
    const username = TEAM_USERNAME_OVERRIDES[base] ?? base
    return {
      userCode: `LEG-2026-05${i + 1}${j + 1}`,
      username,
      email: `${username}@legalshield.bo`,
      role: r.role,
      firm: r.firm,
      department: r.department,
      fullName: member.fullName,
    }
  }),
)

const DEMO_CASES = [
  {
    caseNumber: 'EXP-2026-0014',
    title: 'Despido disciplinario · Metalurgia Andes',
    clientName: 'Metalurgia Andes S.R.L.',
    lawyerCode: 'LEG-2026-0142',
    assistantCode: 'LEG-2026-0411', // paula.sando
    clientCode: 'LEG-2026-0390', // carlos.cliente
    status: 'en_tramite',
    matter: 'Laboral',
    court: 'Juzgado Publico de Trabajo y Seguridad Social 2.o de La Paz',
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
    court: 'Tribunal Departamental de Justicia de Cochabamba',
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
    lawyerCode: 'LEG-2026-0142',
    assistantCode: 'LEG-2026-0411',
    status: 'en_tramite',
    matter: 'Administrativo',
    court: 'Ministerio de Salud y Deportes',
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
    court: 'Juzgado Publico de Familia 3.o de Santa Cruz',
    stage: 'Peritaje',
    riskLevel: 'baja',
    progress: 47,
    deadline: '2026-11-18',
    isPrivileged: true,
  },
  {
    caseNumber: 'EXP-2026-0058',
    title: 'Propiedad industrial · Trademark Falcon',
    clientName: 'Falcon Studio S.R.L.',
    lawyerCode: 'LEG-2026-0142',
    status: 'en_tramite',
    matter: 'Comercial',
    court: 'SENAPI - Direccion de Propiedad Industrial',
    stage: 'Ejecucion',
    riskLevel: 'alta',
    progress: 71,
    deadline: '2026-10-27',
    isPrivileged: false,
  },
]

/** Prueba documental de demostracion: 2 publicos + 1 privilegiado por expediente. */
const DEMO_DOCUMENTS = [
  {
    caseNumber: 'EXP-2026-0014',
    code: 'DOC-2026-0014-01',
    filename: 'Peticion_Formal.pdf',
    classification: 'Publica',
    isPrivileged: false,
    pages: 6,
    content: 'Peticion formal presentada ante el Juzgado Publico de Trabajo 2.o de La Paz. Documento de demostracion.',
  },
  {
    caseNumber: 'EXP-2026-0014',
    code: 'DOC-2026-0014-02',
    filename: 'Poder_Representacion.pdf',
    classification: 'Publica',
    isPrivileged: false,
    pages: 3,
    content: 'Poder notarial otorgado a la firma para representar a Metalurgia Andes S.R.L. Documento de demostracion.',
  },
  {
    caseNumber: 'EXP-2026-0014',
    code: 'DOC-2026-0014-03',
    filename: 'Dictamen_Estrategico_Secreto.pdf',
    classification: 'Confidencial',
    isPrivileged: true,
    pages: 18,
    content: 'Dictamen reservado sobre la estrategia probatoria y exposicion patrimonial. Documento de demostracion.',
  },
  {
    caseNumber: 'EXP-2026-0021',
    code: 'DOC-2026-0021-01',
    filename: 'Demanda_Nulidad.pdf',
    classification: 'Publica',
    isPrivileged: false,
    pages: 22,
    content: 'Demanda de nulidad contractual presentada ante el Tribunal Superior. Documento de demostracion.',
  },
  {
    caseNumber: 'EXP-2026-0021',
    code: 'DOC-2026-0021-02',
    filename: 'Poder_Representacion.pdf',
    classification: 'Publica',
    isPrivileged: false,
    pages: 4,
    content: 'Poder especial para actuar en el proceso de nulidad contractual. Documento de demostracion.',
  },
  {
    caseNumber: 'EXP-2026-0021',
    code: 'DOC-2026-0021-03',
    filename: 'Auditoria_Financiera.pdf',
    classification: 'Confidencial',
    isPrivileged: true,
    pages: 31,
    content: 'Auditoria financiera reservada del consorcio y analisis de riesgo de credito. Documento de demostracion.',
  },
  {
    caseNumber: 'EXP-2026-0033',
    code: 'DOC-2026-0033-01',
    filename: 'Peticion_Formal.pdf',
    classification: 'Publica',
    isPrivileged: false,
    pages: 5,
    content: 'Derecho de peticion radicado ante el Ministerio de Salud. Documento de demostracion.',
  },
  {
    caseNumber: 'EXP-2026-0033',
    code: 'DOC-2026-0033-02',
    filename: 'Acuse_Recibido.pdf',
    classification: 'Publica',
    isPrivileged: false,
    pages: 2,
    content: 'Acuse de recibo y constancia de radicacion ministerial. Documento de demostracion.',
  },
  {
    caseNumber: 'EXP-2026-0033',
    code: 'DOC-2026-0033-03',
    filename: 'Informe_Reservado_Prensa.pdf',
    classification: 'Confidencial',
    isPrivileged: true,
    pages: 12,
    content: 'Informe reservado sobre fuentes periodisticas y proteccion de identidad. Documento de demostracion.',
  },
  {
    caseNumber: 'EXP-2026-0047',
    code: 'DOC-2026-0047-01',
    filename: 'Solicitud_Sucesion.pdf',
    classification: 'Publica',
    isPrivileged: false,
    pages: 8,
    content: 'Solicitud de apertura del proceso de sucesion intestada. Documento de demostracion.',
  },
  {
    caseNumber: 'EXP-2026-0047',
    code: 'DOC-2026-0047-02',
    filename: 'Poder_Representacion.pdf',
    classification: 'Publica',
    isPrivileged: false,
    pages: 3,
    content: 'Poder de representacion de los herederos reconocidos. Documento de demostracion.',
  },
  {
    caseNumber: 'EXP-2026-0047',
    code: 'DOC-2026-0047-03',
    filename: 'Avaluo_Patrimonial_Confidencial.pdf',
    classification: 'Confidencial',
    isPrivileged: true,
    pages: 26,
    content: 'Avaluo patrimonial reservado de bienes relictos y pasivos declarados. Documento de demostracion.',
  },
  {
    caseNumber: 'EXP-2026-0058',
    code: 'DOC-2026-0058-01',
    filename: 'Solicitud_Registro_Marca.pdf',
    classification: 'Publica',
    isPrivileged: false,
    pages: 7,
    content: 'Solicitud de registro de marca presentada ante la SIC. Documento de demostracion.',
  },
  {
    caseNumber: 'EXP-2026-0058',
    code: 'DOC-2026-0058-02',
    filename: 'Poder_Representacion.pdf',
    classification: 'Publica',
    isPrivileged: false,
    pages: 4,
    content: 'Poder para tramitar la oposicion y el registro marcario. Documento de demostracion.',
  },
  {
    caseNumber: 'EXP-2026-0058',
    code: 'DOC-2026-0058-03',
    filename: 'Dictamen_Colision_Marcaria.pdf',
    classification: 'Confidencial',
    isPrivileged: true,
    pages: 19,
    content: 'Dictamen reservado sobre riesgo de confusion y estrategia de defensa marcaria. Documento de demostracion.',
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
  // 4c. Migracion del bloqueo persistente: `locked_until` sostiene el tiempo de
  //     inhabilitacion en MySQL y `status` refleja el estado de la cuenta.
  if (!(await columnExists('users', 'locked_until'))) {
    await run('ALTER TABLE users ADD COLUMN locked_until DATETIME AFTER locked_at')
    logger.info('Columna agregada: users.locked_until')
  }
  if (!(await columnExists('users', 'status'))) {
    await run("ALTER TABLE users ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' AFTER is_locked")
    await run(
      `UPDATE users
          SET status = CASE
                        WHEN is_active = FALSE THEN 'DISABLED'
                        WHEN is_locked  = TRUE  THEN 'LOCKED'
                        ELSE 'ACTIVE'
                       END`,
    )
    logger.info('Columna agregada: users.status (sincronizada con is_locked/is_active)')
  }
  if (!(await columnExists('users', 'unlock_token'))) {
    await run("ALTER TABLE users ADD COLUMN unlock_token VARCHAR(12) AFTER password_updated_at")
    logger.info('Columna agregada: users.unlock_token')
  }
  if (!(await columnExists('users', 'unlock_token_expires_at'))) {
    await run('ALTER TABLE users ADD COLUMN unlock_token_expires_at DATETIME AFTER unlock_token')
    logger.info('Columna agregada: users.unlock_token_expires_at')
  }
  if (!(await columnExists('users', 'unlock_token_used'))) {
    await run('ALTER TABLE users ADD COLUMN unlock_token_used BOOLEAN NOT NULL DEFAULT FALSE AFTER unlock_token_expires_at')
    logger.info('Columna agregada: users.unlock_token_used')
  }

  // 4d. Recuperacion de cuentas: el OTP se guarda como HMAC-SHA256 (64 hex), por lo que
  //     no se indexa el secreto; se agregan contador de intentos del OTP, cambio de clave
  //     obligatorio y contador de bloqueos para el bloqueo progresivo (OWASP A07, ISO 27001 A.8.5).
  await run('ALTER TABLE users MODIFY COLUMN unlock_token CHAR(64) NULL DEFAULT NULL')
  // Los tokens previos estaban en claro: se invalidan al migrar.
  await run('UPDATE users SET unlock_token = NULL, unlock_token_expires_at = NULL WHERE CHAR_LENGTH(unlock_token) <> 64')
  if (await indexExists('users', 'idx_users_unlock_token')) {
    await run('DROP INDEX idx_users_unlock_token ON users')
    logger.info('Indice retirado: users.idx_users_unlock_token (no se indexan secretos)')
  }
  if (!(await columnExists('users', 'unlock_token_attempts'))) {
    await run('ALTER TABLE users ADD COLUMN unlock_token_attempts INT NOT NULL DEFAULT 0 AFTER unlock_token_used')
    logger.info('Columna agregada: users.unlock_token_attempts')
  }
  // 4e. Reinicio de contrasena: token propio (HMAC con contexto "reset:") separado del de
  //     desbloqueo, para que emitir uno no invalide el otro y no sean intercambiables.
  if (!(await columnExists('users', 'reset_token'))) {
    await run('ALTER TABLE users ADD COLUMN reset_token CHAR(64) NULL DEFAULT NULL AFTER unlock_token_attempts')
    logger.info('Columna agregada: users.reset_token')
  }
  if (!(await columnExists('users', 'reset_token_expires_at'))) {
    await run('ALTER TABLE users ADD COLUMN reset_token_expires_at DATETIME AFTER reset_token')
    logger.info('Columna agregada: users.reset_token_expires_at')
  }
  if (!(await columnExists('users', 'reset_token_used'))) {
    await run('ALTER TABLE users ADD COLUMN reset_token_used BOOLEAN NOT NULL DEFAULT FALSE AFTER reset_token_expires_at')
    logger.info('Columna agregada: users.reset_token_used')
  }
  if (!(await columnExists('users', 'reset_token_attempts'))) {
    await run('ALTER TABLE users ADD COLUMN reset_token_attempts INT NOT NULL DEFAULT 0 AFTER reset_token_used')
    logger.info('Columna agregada: users.reset_token_attempts')
  }
  if (!(await columnExists('users', 'must_change_password'))) {
    await run('ALTER TABLE users ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT FALSE AFTER password_updated_at')
    logger.info('Columna agregada: users.must_change_password')
  }
  if (!(await columnExists('users', 'lock_count'))) {
    await run('ALTER TABLE users ADD COLUMN lock_count INT NOT NULL DEFAULT 0 AFTER failed_attempts')
    logger.info('Columna agregada: users.lock_count')
  }

  // Equipo del expediente: el asistente de apoyo y el cliente vinculado ven el
  // caso igual que su abogado titular (alcance por asignacion, A01:2021).
  for (const [column, after, fk, index] of [
    ['assistant_id', 'assigned_lawyer_id', 'fk_cases_assistant', 'idx_cases_assistant'],
    ['client_user_id', 'assistant_id', 'fk_cases_client', 'idx_cases_client'],
  ]) {
    if (!(await columnExists('legal_cases', column))) {
      await run(`ALTER TABLE legal_cases ADD COLUMN ${column} INT NULL AFTER ${after}`)
      await run(`ALTER TABLE legal_cases ADD CONSTRAINT ${fk} FOREIGN KEY (${column}) REFERENCES users(id) ON DELETE SET NULL`)
      logger.info(`Columna agregada: legal_cases.${column}`)
    }
    if (!(await indexExists('legal_cases', index))) {
      await run(`ALTER TABLE legal_cases ADD INDEX ${index} (${column})`)
    }
  }

  // Prueba documental subida por los abogados: el archivo vive en disco
  // (back/storage/documents) y la fila guarda su ruta, tamano y autor.
  for (const [column, ddl] of [
    ['file_path', 'VARCHAR(255) NULL AFTER content'],
    ['size_bytes', 'INT NULL AFTER file_path'],
    ['uploaded_by', 'VARCHAR(20) NULL AFTER size_bytes'],
  ]) {
    if (!(await columnExists('case_documents', column))) {
      await run(`ALTER TABLE case_documents ADD COLUMN ${column} ${ddl}`)
      logger.info(`Columna agregada: case_documents.${column}`)
    }
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
  // matriz rol x permiso exacta (el catalogo PERMISSIONS de este archivo).
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

  // Sincronizacion estricta: retira toda concesion que no pertenezca a la
  // matriz vigente (socios sin ABM de usuarios, permisos OSI exclusivos, etc.).
  const allowedPairs = Object.entries(RBAC_MATRIX)
    .map(
      ([roleCode, codes]) =>
        `(r.code = '${roleCode}' AND p.code IN (${codes.map((c) => `'${c}'`).join(', ')}))`,
    )
    .join('\n           OR ')
  await run(
    `DELETE rp FROM role_permissions rp
       JOIN roles       r ON r.id = rp.role_id
       JOIN permissions p ON p.id = rp.permission_id
      WHERE NOT (${allowedPairs})`,
  )
  logger.info('Segregacion estricta aplicada: concesiones fuera de matriz revocadas')

  // security_logs es inmutable (ISO 27001 A.8.15): los triggers de UPDATE y DELETE
  // nunca se retiran, ni siquiera durante una migracion. Las filas heredadas de
  // eventos de negocio permanecen donde fueron escritas.

  // Personas civiles de demostracion (mismas cuentas que DIRECTORY en el
  // frontend). El usuario previo "admin" colisionaba en LEG-2026-0001, asi que
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
         locked_until = NULL,
         status = 'ACTIVE',
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

  // Cuentas de pruebas del equipo: alta unica (nunca se sobrescribe la clave que
  // el titular ya cambio). must_change_password obliga al cambio en el 1.er acceso.
  for (const user of TEAM_USERS) {
    const [result] = await run(
      `INSERT IGNORE INTO users
         (user_code, username, email, password_hash, role_id, firm, department, phone, password_updated_at, must_change_password)
       VALUES (?, ?, ?, ?, (SELECT id FROM roles WHERE code = ?), ?, ?, NULL, NOW(), TRUE)`,
      [user.userCode, user.username, user.email, passwordHash, user.role, user.firm, user.department],
    )
    if (result.affectedRows > 0) {
      await run(
        `INSERT INTO password_history (user_id, password_hash)
         SELECT u.id, ? FROM users u WHERE u.user_code = ?`,
        [passwordHash, user.userCode],
      )
      logger.info(`Cuenta de equipo creada: ${user.userCode} / ${user.username} (${user.role})`)
    }
  }

  // La cuenta tecnica "admin" (socio con clave de demostracion conocida) violaba
  // el menor privilegio: se retira tambien de las bases creadas con seeds previos.
  // Sus claves, historial y avisos caen por ON DELETE CASCADE; los expedientes
  // que tuviera asignados quedan sin abogado (ON DELETE SET NULL). La bitacora
  // de seguridad conserva sus eventos, que son inmutables.
  const [staleAdmin] = await run("SELECT id FROM users WHERE user_code = 'LEG-2026-0000' AND username = 'admin'")
  if (staleAdmin.length > 0) {
    await run('DELETE FROM users WHERE id = ?', [staleAdmin[0].id])
    logger.info('Cuenta tecnica retirada: LEG-2026-0000 / admin')
  }

  // Expedientes de demostracion (CASES del frontend), idempotentes.
  for (const c of DEMO_CASES) {
    await run(
      `INSERT INTO legal_cases
         (case_number, title, client_name, assigned_lawyer_id, assistant_id, client_user_id,
          status, matter, court, stage, risk_level, progress, deadline, is_privileged)
       VALUES (?, ?, ?,
               (SELECT id FROM users WHERE user_code = ?),
               (SELECT id FROM users WHERE user_code = ?),
               (SELECT id FROM users WHERE user_code = ?),
               ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         title = VALUES(title),
         client_name = VALUES(client_name),
         assigned_lawyer_id = VALUES(assigned_lawyer_id),
         assistant_id = VALUES(assistant_id),
         client_user_id = VALUES(client_user_id),
         court = VALUES(court),
         status = VALUES(status),
         progress = VALUES(progress),
         deadline = VALUES(deadline)`,
      [
        c.caseNumber, c.title, c.clientName, c.lawyerCode, c.assistantCode ?? null, c.clientCode ?? null,
        c.status, c.matter, c.court, c.stage, c.riskLevel, c.progress, c.deadline, c.isPrivileged,
      ],
    )
  }
  logger.info(`Expedientes de demostracion listos: ${DEMO_CASES.length}`)

  // Prueba documental de demostracion (2 publicos + 1 privilegiado por caso).
  for (const doc of DEMO_DOCUMENTS) {
    const checksum = crypto.createHash('sha256').update(`${doc.code}|legalshield-enterprise`).digest('hex')
    await run(
      `INSERT INTO case_documents
         (case_id, document_code, filename, classification, is_privileged, mime_type, page_count, checksum, content)
       VALUES ((SELECT id FROM legal_cases WHERE case_number = ?), ?, ?, ?, ?, 'application/pdf', ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         filename = VALUES(filename),
         classification = VALUES(classification),
         is_privileged = VALUES(is_privileged),
         page_count = VALUES(page_count),
         checksum = VALUES(checksum),
         content = VALUES(content)`,
      [
        doc.caseNumber, doc.code, doc.filename, doc.classification, doc.isPrivileged,
        doc.pages, checksum, doc.content,
      ],
    )
  }
  logger.info(`Documentos de demostracion listos: ${DEMO_DOCUMENTS.length}`)

  // 6. Verificacion final: tablas visibles en phpMyAdmin.
  const [tables] = await conn.query(
    'SELECT table_name AS nombre FROM information_schema.tables WHERE table_schema = ? ORDER BY table_name',
    [DB_NAME],
  )
  const [[{ total: roleCount }]] = await conn.query('SELECT COUNT(*) AS total FROM roles')
  const [[{ total: permCount }]] = await conn.query('SELECT COUNT(*) AS total FROM permissions')
  const [[{ total: grantCount }]] = await conn.query('SELECT COUNT(*) AS total FROM role_permissions')
  const [[{ total: userCount }]] = await conn.query('SELECT COUNT(*) AS total FROM users')
  const [[{ total: documentCount }]] = await conn.query('SELECT COUNT(*) AS total FROM case_documents')

  logger.info(`Tablas creadas (${tables.length}): ${tables.map((t) => t.nombre).join(', ')}`)
  logger.info('Seed verificado', {
    roles: roleCount,
    permisos: permCount,
    asignaciones: grantCount,
    usuarios: userCount,
    documentos: documentCount,
  })

  await conn.end()
  conn = null

  console.log(`[OK] Base de datos e instructivos creados exitosamente (${DB_NAME}, ${tables.length} tablas)`)
  console.log('')
  console.log('========================================================')
  console.log('[OK] BASE DE DATOS INICIALIZADA CON SEGREGACIÓN OSI')
  console.log('• osi.seguridad    (OSI - Único con acceso a ABM de Usuarios)')
  console.log('• mariana.solis    (Socio - Dirección Legal y Expedientes)')
  console.log('• diego.ferrer     (Abogado - Gestión de Casos)')
  console.log('• paula.sando      (Asistente - Lectura y Apoyo)')
  console.log('• carlos.cliente   (Cliente - Consulta de Casos Propios)')
  console.log('Contraseña universal: Juris2026!Abg')
  console.log('========================================================')
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
