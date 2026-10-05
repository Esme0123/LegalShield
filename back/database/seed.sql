-- ============================================================================
-- LegalShield · Datos iniciales
-- Roles, permisos y matriz SIS-321 replicando el frontend (src/data/seed.js).
-- Ejecutar despues de schema.sql. Es idempotente (ON CONFLICT DO NOTHING).
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Roles del despacho (4 roles, alineados con ROLES del frontend)
-- ---------------------------------------------------------------------------
INSERT INTO roles (code, name, description) VALUES
  ('socio',      'Socio',      'Direccion del despacho. Responsabilidad final sobre el cierre de expedientes.'),
  ('abogado',    'Abogado',    'Practicante principal con firma procesal y acceso a la prueba documental.'),
  ('asistente',  'Asistente',  'Soporte administrativo. Opera expedientes sin acceso a material restringido.'),
  ('cliente',    'Cliente',    'Acceso externo limitado al seguimiento de su propio expediente.')
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Permisos atomicos (12 permisos, alineados con PERMISSIONS del frontend)
-- ---------------------------------------------------------------------------
INSERT INTO permissions (code, description) VALUES
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
  ('RISK_ASSESS',   'Modificar evaluacion de riesgo')
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Matriz inicial rol -> permisos (INITIAL_RBAC del frontend)
-- ---------------------------------------------------------------------------
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE (r.code, p.code) IN (
  -- socio: acceso total
  ('socio','CASES_CREATE'), ('socio','CASES_READ'), ('socio','CASES_WRITE'),
  ('socio','CASES_ARCHIVE'), ('socio','DOCS_REVEAL'), ('socio','DOCS_DOWNLOAD'),
  ('socio','LOGS_VIEW'), ('socio','LOGS_EXPORT'), ('socio','AUDIT_RECEIPT'),
  ('socio','RBAC_MANAGE'), ('socio','TOKEN_RESET'), ('socio','RISK_ASSESS'),

  -- abogado: gestion propia + revelacion documental
  ('abogado','CASES_CREATE'), ('abogado','CASES_READ'), ('abogado','CASES_WRITE'),
  ('abogado','DOCS_REVEAL'), ('abogado','LOGS_VIEW'), ('abogado','AUDIT_RECEIPT'),
  ('abogado','RISK_ASSESS'),

  -- asistente: operacion sin material restringido
  ('asistente','CASES_CREATE'), ('asistente','CASES_READ'),
  ('asistente','CASES_WRITE'), ('asistente','AUDIT_RECEIPT'),

  -- cliente: solo lectura de su expediente
  ('cliente','CASES_READ')
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Usuarios de demostracion
-- El hash corresponde a 'Juris2026!Abg' con 12 rounds de bcrypt.
-- IMPORTANTE: regenerar los hashes en un entorno real con scripts/seedDatabase.js;
-- un hash precalculado en un repositorio es una mala practica de seguridad.
-- ---------------------------------------------------------------------------
INSERT INTO users (user_code, username, email, password_hash, role_id, firm, department, phone)
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
   'Vidal & Penalto Bufetes', 'Archivo', '+57 320 771 3390')
ON CONFLICT (user_code) DO NOTHING;

-- El historico de contrasenas lo crea scripts/seedDatabase.js una vez que
-- genera los hashes bcrypt reales: seed.sql no debe insertar hashes falsos.

-- ---------------------------------------------------------------------------
-- Expedientes de demostracion (CASES del frontend)
-- assigned_lawyer_id se resuelve por user_code.
-- ---------------------------------------------------------------------------
INSERT INTO legal_cases
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
   'en_tramite', 'Comercial', 'SIC - Decision 3', 'Ejecucion', 'alta', 71, '2026-10-27', FALSE)
ON CONFLICT (case_number) DO NOTHING;

COMMIT;