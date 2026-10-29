-- ============================================================================
-- LegalShield · Datos iniciales (MySQL / MariaDB)
-- Roles, permisos y matriz SIS-321 replicando el frontend (src/data/seed.js).
-- Ejecutar despues de schema.sql. Es idempotente (INSERT IGNORE).
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Roles del despacho (5 roles, alineados con ROLES del frontend)
-- ---------------------------------------------------------------------------
INSERT IGNORE INTO roles (code, name, description) VALUES
  ('osi',        'OSI',        'Oficial de Seguridad de la Informacion: ABM de usuarios, matriz RBAC y bitacora de seguridad.'),
  ('socio',      'Socio',      'Direccion del despacho. Responsabilidad final sobre el cierre de expedientes.'),
  ('abogado',    'Abogado',    'Practicante principal con firma procesal y acceso a la prueba documental.'),
  ('asistente',  'Asistente',  'Soporte administrativo. Opera expedientes sin acceso a material restringido.'),
  ('cliente',    'Cliente',    'Acceso externo limitado al seguimiento de su propio expediente.');

-- ---------------------------------------------------------------------------
-- Permisos atomicos (22 permisos, alineados con PERMISSIONS del frontend)
-- ---------------------------------------------------------------------------
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
  ('RBAC_MANAGE',   'Administrar matriz RBAC'),
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

-- ---------------------------------------------------------------------------
-- Matriz estricta de segregacion de funciones (INITIAL_RBAC del frontend)
--   · OSI   -> ABM de usuarios, roles, desbloqueo y bitacora de seguridad.
--   · Socio -> expedientes, metricas y logs de aplicacion (sin ABM ni roles).
-- ---------------------------------------------------------------------------
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON 1 = 1
WHERE (r.code = 'osi' AND p.code IN (
  'USERS_MANAGE', 'USERS_READ', 'USERS_CREATE', 'USERS_UPDATE', 'USERS_DELETE',
  'USERS_UNLOCK', 'ACCOUNT_UNLOCK', 'ROLES_MANAGE', 'RBAC_MANAGE', 'TOKEN_RESET',
  'SECURITY_LOGS_VIEW', 'LOGS_VIEW', 'LOGS_EXPORT', 'RISK_ASSESS'
))
   OR (r.code = 'socio' AND p.code IN (
  'CASES_CREATE', 'CASES_READ', 'CASES_WRITE', 'CASES_ARCHIVE', 'CASES_READ_ALL', 'DOCS_REVEAL',
  'DOCS_DOWNLOAD', 'LOGS_VIEW', 'LOGS_EXPORT', 'AUDIT_RECEIPT'
))
   OR (r.code = 'abogado' AND p.code IN (
  'CASES_CREATE', 'CASES_READ', 'CASES_WRITE', 'DOCS_REVEAL', 'LOGS_VIEW',
  'AUDIT_RECEIPT'
))
   OR (r.code = 'asistente' AND p.code IN (
  'CASES_READ', 'CASES_WRITE', 'AUDIT_RECEIPT'
))
   OR (r.code = 'cliente' AND p.code IN ('CASES_READ'));

-- Revocacion estricta: cualquier concesion fuera de la matriz (p. ej. seeds
-- previos que daban USERS_* o RBAC_MANAGE al socio) se retira al re-sembrar.
DELETE rp FROM role_permissions rp
  JOIN roles       r ON r.id = rp.role_id
  JOIN permissions p ON p.id = rp.permission_id
 WHERE NOT (
   (r.code = 'osi' AND p.code IN (
     'USERS_MANAGE', 'USERS_READ', 'USERS_CREATE', 'USERS_UPDATE', 'USERS_DELETE',
     'USERS_UNLOCK', 'ACCOUNT_UNLOCK', 'ROLES_MANAGE', 'RBAC_MANAGE', 'TOKEN_RESET',
     'SECURITY_LOGS_VIEW', 'LOGS_VIEW', 'LOGS_EXPORT', 'RISK_ASSESS'
   ))
   OR (r.code = 'socio' AND p.code IN (
     'CASES_CREATE', 'CASES_READ', 'CASES_WRITE', 'CASES_ARCHIVE', 'CASES_READ_ALL', 'DOCS_REVEAL',
     'DOCS_DOWNLOAD', 'LOGS_VIEW', 'LOGS_EXPORT', 'AUDIT_RECEIPT'
   ))
   OR (r.code = 'abogado' AND p.code IN (
     'CASES_CREATE', 'CASES_READ', 'CASES_WRITE', 'DOCS_REVEAL', 'LOGS_VIEW',
     'AUDIT_RECEIPT'
   ))
   OR (r.code = 'asistente' AND p.code IN ('CASES_READ', 'CASES_WRITE', 'AUDIT_RECEIPT'))
   OR (r.code = 'cliente' AND p.code IN ('CASES_READ'))
 );

-- ---------------------------------------------------------------------------
-- Usuarios de demostracion
-- El hash placeholder lo regenera scripts/seedDatabase.js con bcrypt real
-- (contrasena 'Juris2026!Abg'); nunca usar un hash precalculado en produccion.
-- ---------------------------------------------------------------------------
INSERT IGNORE INTO users (user_code, username, email, password_hash, role_id, firm, department, phone)
VALUES
  ('LEG-2026-0002', 'osi.seguridad',
   'osi@legalshield.bo',
   '$2a$12$demo.hashed.placeholder.replace.in.setup.script.0000000000000000000000',
   (SELECT id FROM roles WHERE code = 'osi'),
   'LegalShield Bufetes', 'Seguridad de la Informacion', '+591 2 244 1199'),

  ('LEG-2026-0001', 'mariana.solis',
   'mariana.solis@legalshield.bo',
   '$2a$12$demo.hashed.placeholder.replace.in.setup.script.0000000000000000000000',
   (SELECT id FROM roles WHERE code = 'socio'),
   'LegalShield Bufetes', 'Direccion Juridica', '+591 2 244 1180'),

  ('LEG-2026-0142', 'diego.ferrer',
   'diego.ferrer@legalshield.bo',
   '$2a$12$demo.hashed.placeholder.replace.in.setup.script.0000000000000000000000',
   (SELECT id FROM roles WHERE code = 'abogado'),
   'LegalShield Bufetes', 'Litigacion', '+591 71552884'),

  ('LEG-2026-0277', 'lucia.ampara',
   'lucia.ampara@legalshield.bo',
   '$2a$12$demo.hashed.placeholder.replace.in.setup.script.0000000000000000000000',
   (SELECT id FROM roles WHERE code = 'asistente'),
   'LegalShield Bufetes', 'Tramitacion', '+591 74092277'),

  ('LEG-2026-0390', 'andres.quintero',
   'andres.quintero@metalurgiaandes.bo',
   '$2a$12$demo.hashed.placeholder.replace.in.setup.script.0000000000000000000000',
   (SELECT id FROM roles WHERE code = 'cliente'),
   'Metalurgia Andes S.R.L.', 'Externo', '+591 71234567'),

  ('LEG-2026-0411', 'paula.sandoval',
   'paula.sandoval@legalshield.bo',
   '$2a$12$demo.hashed.placeholder.replace.in.setup.script.0000000000000000000000',
   (SELECT id FROM roles WHERE code = 'asistente'),
   'LegalShield Bufetes', 'Archivo', '+591 77713390');

-- El historico de contrasenas lo crea scripts/seedDatabase.js una vez que
-- genera los hashes bcrypt reales: seed.sql no debe insertar hashes falsos.

-- ---------------------------------------------------------------------------
-- Expedientes de demostracion (CASES del frontend)
-- assigned_lawyer_id se resuelve por user_code.
-- ---------------------------------------------------------------------------
INSERT IGNORE INTO legal_cases
  (case_number, title, client_name, assigned_lawyer_id, status, matter, court, stage, risk_level, progress, deadline, is_privileged)
VALUES
  ('EXP-2026-0014', 'Despido disciplinario · Metalurgia Andes', 'Metalurgia Andes S.R.L.',
   (SELECT id FROM users WHERE user_code = 'LEG-2026-0142'),
   'en_tramite', 'Laboral', 'Juzgado Publico de Trabajo y Seguridad Social 2.o de La Paz', 'Prueba', 'alta', 62, '2026-10-21', TRUE),

  ('EXP-2026-0021', 'Nulidad contractual · Consorcion Vento', 'Consorcion Vento S.A.',
   (SELECT id FROM users WHERE user_code = 'LEG-2026-0001'),
   'abierto', 'Civil', 'Tribunal Departamental de Justicia de Cochabamba', 'Contestacion', 'critica', 38, '2026-10-09', FALSE),

  ('EXP-2026-0033', 'Derecho de peticion · Ministerio de Salud', 'Redaccion Norte (periodista)',
   (SELECT id FROM users WHERE user_code = 'LEG-2026-0277'),
   'en_tramite', 'Administrativo', 'Ministerio de Salud y Deportes', 'Seguimiento', 'media', 84, '2026-11-02', FALSE),

  ('EXP-2026-0047', 'Sucesion intestada · Familia Ortegas', 'Familia Ortega Medina',
   (SELECT id FROM users WHERE user_code = 'LEG-2026-0001'),
   'abierto', 'Familia', 'Juzgado Publico de Familia 3.o de Santa Cruz', 'Peritaje', 'baja', 47, '2026-11-18', TRUE),

  ('EXP-2026-0058', 'Propiedad industrial · Trademark Falcon', 'Falcon Studio S.R.L.',
   (SELECT id FROM users WHERE user_code = 'LEG-2026-0142'),
   'en_tramite', 'Comercial', 'SENAPI - Direccion de Propiedad Industrial', 'Ejecucion', 'alta', 71, '2026-10-27', FALSE);

-- ---------------------------------------------------------------------------
-- Prueba documental de demostracion: 2 publicos + 1 privilegiado por caso.
-- El contenido solo se entrega con DOCS_REVEAL en /documents/reveal.
-- ---------------------------------------------------------------------------
INSERT IGNORE INTO case_documents
  (case_id, document_code, filename, classification, is_privileged, mime_type, page_count, checksum, content)
VALUES
  ((SELECT id FROM legal_cases WHERE case_number = 'EXP-2026-0014'), 'DOC-2026-0014-01',
   'Peticion_Formal.pdf', 'Publica', FALSE, 'application/pdf', 6,
   SHA2('DOC-2026-0014-01|legalshield-enterprise', 256),
   'Peticion formal presentada ante el Juzgado Publico de Trabajo y Seguridad Social 2.o de La Paz. Documento de demostracion.'),
  ((SELECT id FROM legal_cases WHERE case_number = 'EXP-2026-0014'), 'DOC-2026-0014-02',
   'Poder_Representacion.pdf', 'Publica', FALSE, 'application/pdf', 3,
   SHA2('DOC-2026-0014-02|legalshield-enterprise', 256),
   'Poder notarial otorgado a la firma para representar a Metalurgia Andes S.R.L. Documento de demostracion.'),
  ((SELECT id FROM legal_cases WHERE case_number = 'EXP-2026-0014'), 'DOC-2026-0014-03',
   'Dictamen_Estrategico_Secreto.pdf', 'Confidencial', TRUE, 'application/pdf', 18,
   SHA2('DOC-2026-0014-03|legalshield-enterprise', 256),
   'Dictamen reservado sobre la estrategia probatoria y exposicion patrimonial. Documento de demostracion.'),

  ((SELECT id FROM legal_cases WHERE case_number = 'EXP-2026-0021'), 'DOC-2026-0021-01',
   'Demanda_Nulidad.pdf', 'Publica', FALSE, 'application/pdf', 22,
   SHA2('DOC-2026-0021-01|legalshield-enterprise', 256),
   'Demanda de nulidad contractual presentada ante el Tribunal Superior. Documento de demostracion.'),
  ((SELECT id FROM legal_cases WHERE case_number = 'EXP-2026-0021'), 'DOC-2026-0021-02',
   'Poder_Representacion.pdf', 'Publica', FALSE, 'application/pdf', 4,
   SHA2('DOC-2026-0021-02|legalshield-enterprise', 256),
   'Poder especial para actuar en el proceso de nulidad contractual. Documento de demostracion.'),
  ((SELECT id FROM legal_cases WHERE case_number = 'EXP-2026-0021'), 'DOC-2026-0021-03',
   'Auditoria_Financiera.pdf', 'Confidencial', TRUE, 'application/pdf', 31,
   SHA2('DOC-2026-0021-03|legalshield-enterprise', 256),
   'Auditoria financiera reservada del consorcio y analisis de riesgo de credito. Documento de demostracion.'),

  ((SELECT id FROM legal_cases WHERE case_number = 'EXP-2026-0033'), 'DOC-2026-0033-01',
   'Peticion_Formal.pdf', 'Publica', FALSE, 'application/pdf', 5,
   SHA2('DOC-2026-0033-01|legalshield-enterprise', 256),
   'Derecho de peticion radicado ante el Ministerio de Salud. Documento de demostracion.'),
  ((SELECT id FROM legal_cases WHERE case_number = 'EXP-2026-0033'), 'DOC-2026-0033-02',
   'Acuse_Recibido.pdf', 'Publica', FALSE, 'application/pdf', 2,
   SHA2('DOC-2026-0033-02|legalshield-enterprise', 256),
   'Acuse de recibo y constancia de radicacion ministerial. Documento de demostracion.'),
  ((SELECT id FROM legal_cases WHERE case_number = 'EXP-2026-0033'), 'DOC-2026-0033-03',
   'Informe_Reservado_Prensa.pdf', 'Confidencial', TRUE, 'application/pdf', 12,
   SHA2('DOC-2026-0033-03|legalshield-enterprise', 256),
   'Informe reservado sobre fuentes periodisticas y proteccion de identidad. Documento de demostracion.'),

  ((SELECT id FROM legal_cases WHERE case_number = 'EXP-2026-0047'), 'DOC-2026-0047-01',
   'Solicitud_Sucesion.pdf', 'Publica', FALSE, 'application/pdf', 8,
   SHA2('DOC-2026-0047-01|legalshield-enterprise', 256),
   'Solicitud de apertura del proceso de sucesion intestada. Documento de demostracion.'),
  ((SELECT id FROM legal_cases WHERE case_number = 'EXP-2026-0047'), 'DOC-2026-0047-02',
   'Poder_Representacion.pdf', 'Publica', FALSE, 'application/pdf', 3,
   SHA2('DOC-2026-0047-02|legalshield-enterprise', 256),
   'Poder de representacion de los herederos reconocidos. Documento de demostracion.'),
  ((SELECT id FROM legal_cases WHERE case_number = 'EXP-2026-0047'), 'DOC-2026-0047-03',
   'Avaluo_Patrimonial_Confidencial.pdf', 'Confidencial', TRUE, 'application/pdf', 26,
   SHA2('DOC-2026-0047-03|legalshield-enterprise', 256),
   'Avaluo patrimonial reservado de bienes relictos y pasivos declarados. Documento de demostracion.'),

  ((SELECT id FROM legal_cases WHERE case_number = 'EXP-2026-0058'), 'DOC-2026-0058-01',
   'Solicitud_Registro_Marca.pdf', 'Publica', FALSE, 'application/pdf', 7,
   SHA2('DOC-2026-0058-01|legalshield-enterprise', 256),
   'Solicitud de registro de marca presentada ante la SIC. Documento de demostracion.'),
  ((SELECT id FROM legal_cases WHERE case_number = 'EXP-2026-0058'), 'DOC-2026-0058-02',
   'Poder_Representacion.pdf', 'Publica', FALSE, 'application/pdf', 4,
   SHA2('DOC-2026-0058-02|legalshield-enterprise', 256),
   'Poder para tramitar la oposicion y el registro marcario. Documento de demostracion.'),
  ((SELECT id FROM legal_cases WHERE case_number = 'EXP-2026-0058'), 'DOC-2026-0058-03',
   'Dictamen_Colision_Marcaria.pdf', 'Confidencial', TRUE, 'application/pdf', 19,
   SHA2('DOC-2026-0058-03|legalshield-enterprise', 256),
   'Dictamen reservado sobre riesgo de confusion y estrategia de defensa marcaria. Documento de demostracion.');

COMMIT;