-- ============================================================================
-- LegalShield · Datos iniciales (MySQL / MariaDB)
-- Roles, permisos y matriz SIS-321 replicando el frontend (src/data/seed.js).
-- Ejecutar despues de schema.sql. Es idempotente (INSERT IGNORE).
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Roles del despacho (4 roles, alineados con ROLES del frontend)
-- ---------------------------------------------------------------------------
INSERT IGNORE INTO roles (code, name, description) VALUES
  ('socio',      'Socio',      'Direccion del despacho. Responsabilidad final sobre el cierre de expedientes.'),
  ('abogado',    'Abogado',    'Practicante principal con firma procesal y acceso a la prueba documental.'),
  ('asistente',  'Asistente',  'Soporte administrativo. Opera expedientes sin acceso a material restringido.'),
  ('cliente',    'Cliente',    'Acceso externo limitado al seguimiento de su propio expediente.');

-- ---------------------------------------------------------------------------
-- Permisos atomicos (12 permisos, alineados con PERMISSIONS del frontend)
-- ---------------------------------------------------------------------------
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
  ('RISK_ASSESS',   'Modificar evaluacion de riesgo');

-- ---------------------------------------------------------------------------
-- Matriz inicial rol -> permisos (INITIAL_RBAC del frontend)
-- ---------------------------------------------------------------------------
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON 1 = 1
WHERE (r.code = 'socio' AND p.code IN (
  'CASES_CREATE', 'CASES_READ', 'CASES_WRITE', 'CASES_ARCHIVE', 'DOCS_REVEAL',
  'DOCS_DOWNLOAD', 'LOGS_VIEW', 'LOGS_EXPORT', 'AUDIT_RECEIPT', 'RBAC_MANAGE',
  'TOKEN_RESET', 'RISK_ASSESS'
))
   OR (r.code = 'abogado' AND p.code IN (
  'CASES_CREATE', 'CASES_READ', 'CASES_WRITE', 'DOCS_REVEAL', 'LOGS_VIEW',
  'AUDIT_RECEIPT', 'RISK_ASSESS'
))
   OR (r.code = 'asistente' AND p.code IN (
  'CASES_CREATE', 'CASES_READ', 'CASES_WRITE', 'AUDIT_RECEIPT'
))
   OR (r.code = 'cliente' AND p.code IN ('CASES_READ'));

-- ---------------------------------------------------------------------------
-- Usuarios de demostracion
-- El hash placeholder lo regenera scripts/seedDatabase.js con bcrypt real
-- (contrasena 'Juris2026!Abg'); nunca usar un hash precalculado en produccion.
-- ---------------------------------------------------------------------------
INSERT IGNORE INTO users (user_code, username, email, password_hash, role_id, firm, department, phone)
VALUES
  ('LEG-2026-0001', 'Mariana Solis',
   'mariana.solis@vidalpenalto.co',
   '$2a$12$demo.hashed.placeholder.replace.in.setup.script.0000000000000000000000',
   (SELECT id FROM roles WHERE code = 'socio'),
   'Vidal & Penalto Bufetes', 'Direccion Juridica', '+57 601 742 1180'),

  ('LEG-2026-0142', 'Diego Ferrer',
   'diego.ferrer@vidalpenalto.co',
   '$2a$12$demo.hashed.placeholder.replace.in.setup.script.0000000000000000000000',
   (SELECT id FROM roles WHERE code = 'abogado'),
   'Vidal & Penalto Bufetes', 'Litigacion', '+57 300 552 8841'),

  ('LEG-2026-0277', 'Lucia Ampara',
   'lucia.ampara@vidalpenalto.co',
   '$2a$12$demo.hashed.placeholder.replace.in.setup.script.0000000000000000000000',
   (SELECT id FROM roles WHERE code = 'asistente'),
   'Vidal & Penalto Bufetes', 'Tramitacion', '+57 315 409 2277'),

  ('LEG-2026-0390', 'Andres Quintero',
   'andres.quintero@metalurgiaandes.co',
   '$2a$12$demo.hashed.placeholder.replace.in.setup.script.0000000000000000000000',
   (SELECT id FROM roles WHERE code = 'cliente'),
   'Metalurgia Andes S.A.S.', 'Externo', '+57 310 228 4419'),

  ('LEG-2026-0411', 'Paula Sandoval',
   'paula.sandoval@vidalpenalto.co',
   '$2a$12$demo.hashed.placeholder.replace.in.setup.script.0000000000000000000000',
   (SELECT id FROM roles WHERE code = 'asistente'),
   'Vidal & Penalto Bufetes', 'Archivo', '+57 320 771 3390');

-- El historico de contrasenas lo crea scripts/seedDatabase.js una vez que
-- genera los hashes bcrypt reales: seed.sql no debe insertar hashes falsos.

-- ---------------------------------------------------------------------------
-- Expedientes de demostracion (CASES del frontend)
-- assigned_lawyer_id se resuelve por user_code.
-- ---------------------------------------------------------------------------
INSERT IGNORE INTO legal_cases
  (case_number, title, client_name, assigned_lawyer_id, status, matter, court, stage, risk_level, progress, deadline, is_privileged)
VALUES
  ('EXP-2026-0014', 'Despido disciplinario · Metalurgia Andes', 'Metalurgia Andes S.A.S.',
   (SELECT id FROM users WHERE user_code = 'LEG-2026-0142'),
   'en_tramite', 'Laboral', 'Juzgado 12 Laboral de Bogota', 'Prueba', 'alta', 62, '2026-10-21', TRUE),

  ('EXP-2026-0021', 'Nulidad contractual · Consorcion Vento', 'Consorcion Vento S.A.',
   (SELECT id FROM users WHERE user_code = 'LEG-2026-0001'),
   'abierto', 'Civil', 'Tribunal Superior', 'Contestacion', 'critica', 38, '2026-10-09', FALSE),

  ('EXP-2026-0033', 'Derecho de peticion · Ministerio de Salud', 'Redaccion Norte (periodista)',
   (SELECT id FROM users WHERE user_code = 'LEG-2026-0277'),
   'en_tramite', 'Administrativo', 'Ministerio de Salud', 'Seguimiento', 'media', 84, '2026-11-02', FALSE),

  ('EXP-2026-0047', 'Sucesion intestada · Familia Ortegas', 'Familia Ortega Medina',
   (SELECT id FROM users WHERE user_code = 'LEG-2026-0001'),
   'abierto', 'Familia', 'Juzgado 3 de Sucesiones', 'Peritaje', 'baja', 47, '2026-11-18', TRUE),

  ('EXP-2026-0058', 'Propiedad industrial · Trademark Falcon', 'Falcon Studio SAS',
   (SELECT id FROM users WHERE user_code = 'LEG-2026-0142'),
   'en_tramite', 'Comercial', 'SIC - Decision 3', 'Ejecucion', 'alta', 71, '2026-10-27', FALSE);

COMMIT;