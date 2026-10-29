'use strict'

/**
 * Matriz base de permisos por rol: fuente unica en codigo.
 *
 * La usan `scripts/initDb.js` (siembra y sincronizacion estricta) y
 * `POST /api/roles/reset` (restaura la matriz tras cambios desde la interfaz), de modo
 * que ambos dejan exactamente el mismo resultado. Es un modulo de datos puro: no abre
 * conexiones, para poder importarlo desde el script de inicializacion.
 *
 * `database/seed.sql` (ruta alternativa `npm run db:seed`) es SQL y no puede importar
 * este modulo: su lista de concesiones se mantiene sincronizada a mano con esta.
 *
 * Matriz estricta de segregacion de funciones:
 *   · OSI       -> seguridad: ABM de usuarios, roles, desbloqueos, bitacora e ISO 27001.
 *                  No ve expedientes: custodia el sistema, no el secreto profesional.
 *   · Socio     -> todos los expedientes del despacho; nada de seguridad ni de usuarios.
 *   · Abogado   -> crea y lleva SUS expedientes (titular), con documentos confidenciales.
 *   · Asistente -> apoyo en los expedientes donde esta asignado; sin documentos confidenciales.
 *   · Cliente   -> solo consulta el expediente vinculado a su cuenta.
 */
const RBAC_MATRIX = {
  osi: [
    'USERS_MANAGE', 'USERS_READ', 'USERS_CREATE', 'USERS_UPDATE', 'USERS_DELETE',
    'USERS_UNLOCK', 'ACCOUNT_UNLOCK',
    'ROLES_MANAGE', 'TOKEN_RESET',
    'SECURITY_LOGS_VIEW', 'AUDIT_VIEW', 'LOGS_VIEW', 'LOGS_EXPORT', 'RISK_ASSESS',
  ],
  socio: [
    'CASES_CREATE', 'CASES_READ', 'CASES_WRITE', 'CASES_ARCHIVE', 'CASES_READ_ALL',
    'DOCS_REVEAL', 'DOCS_DOWNLOAD', 'DOCS_UPLOAD',
    'LOGS_VIEW', 'AUDIT_RECEIPT',
  ],
  abogado: [
    'CASES_CREATE', 'CASES_READ', 'CASES_WRITE',
    'DOCS_REVEAL', 'DOCS_UPLOAD', 'DOCS_DOWNLOAD', 'LOGS_VIEW', 'AUDIT_RECEIPT',
  ],
  // El asistente sube prueba documental, pero siempre como documento publico.
  asistente: ['CASES_READ', 'CASES_WRITE', 'DOCS_UPLOAD', 'DOCS_DOWNLOAD', 'AUDIT_RECEIPT'],
  cliente: ['CASES_READ'],
}

/**
 * Roles cuyos permisos no se editan desde la interfaz: un OSI no puede cambiar
 * los permisos de otro OSI (ni de si mismo). Su matriz es siempre la base.
 */
const LOCKED_ROLES = ['osi']

/**
 * Permisos de administracion de seguridad que solo puede tener el OSI. No se
 * conceden a otro rol ni como excepcion por usuario: si un abogado recibiera
 * ROLES_MANAGE podria editar la matriz, y la segregacion de funciones caeria.
 */
const OSI_EXCLUSIVE = [
  'USERS_MANAGE', 'USERS_READ', 'USERS_CREATE', 'USERS_UPDATE', 'USERS_DELETE',
  'USERS_UNLOCK', 'ACCOUNT_UNLOCK', 'ROLES_MANAGE', 'TOKEN_RESET', 'SECURITY_LOGS_VIEW',
]

/**
 * Dependencias: un permiso no sirve sin el acceso al modulo donde se usa.
 * Exportar la bitacora sin ver la seccion Auditoria, o subir documentos sin
 * ver Expedientes, seria un permiso inutil. Por eso:
 *   · conceder un permiso concede tambien lo que requiere;
 *   · retirar un acceso retira tambien lo que depende de el.
 */
const PERMISSION_REQUIRES = {
  LOGS_EXPORT: ['AUDIT_VIEW'],
  CASES_CREATE: ['CASES_READ'],
  CASES_WRITE: ['CASES_READ'],
  CASES_ARCHIVE: ['CASES_READ'],
  CASES_READ_ALL: ['CASES_READ'],
  DOCS_REVEAL: ['CASES_READ'],
  DOCS_UPLOAD: ['CASES_READ'],
  DOCS_DOWNLOAD: ['CASES_READ'],
}

/** Permisos que `code` necesita (cierre transitivo, sin incluirlo). */
function requirementsOf(code) {
  const out = new Set()
  const walk = (c) => {
    for (const req of PERMISSION_REQUIRES[c] ?? []) {
      if (!out.has(req)) {
        out.add(req)
        walk(req)
      }
    }
  }
  walk(code)
  return [...out]
}

/** Permisos que dejan de tener sentido si se retira `code` (cierre transitivo). */
function dependentsOf(code) {
  const out = new Set()
  const walk = (c) => {
    for (const [perm, reqs] of Object.entries(PERMISSION_REQUIRES)) {
      if (reqs.includes(c) && !out.has(perm)) {
        out.add(perm)
        walk(perm)
      }
    }
  }
  walk(code)
  return [...out]
}

module.exports = { RBAC_MATRIX, LOCKED_ROLES, OSI_EXCLUSIVE, PERMISSION_REQUIRES, requirementsOf, dependentsOf }
