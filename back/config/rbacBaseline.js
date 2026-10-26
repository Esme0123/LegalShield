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
 *   · OSI      -> ABM de usuarios, gestion de roles, desbloqueo y logs de seguridad.
 *   · Socio    -> expedientes (con alcance de todo el despacho), metricas y logs de aplicacion.
 *   · Abogado/Asistente/Cliente -> permisos operacionales sobre sus expedientes.
 */
const RBAC_MATRIX = {
  osi: [
    'USERS_MANAGE', 'USERS_READ', 'USERS_CREATE', 'USERS_UPDATE', 'USERS_DELETE',
    'USERS_UNLOCK', 'ACCOUNT_UNLOCK',
    'ROLES_MANAGE', 'RBAC_MANAGE', 'TOKEN_RESET',
    'SECURITY_LOGS_VIEW', 'LOGS_VIEW', 'LOGS_EXPORT',
    'CASES_READ',
  ],
  socio: [
    'CASES_CREATE', 'CASES_READ', 'CASES_WRITE', 'CASES_ARCHIVE', 'CASES_READ_ALL',
    'DOCS_REVEAL', 'DOCS_DOWNLOAD',
    'LOGS_VIEW', 'LOGS_EXPORT', 'AUDIT_RECEIPT', 'RISK_ASSESS',
  ],
  abogado: ['CASES_CREATE', 'CASES_READ', 'CASES_WRITE', 'DOCS_REVEAL', 'LOGS_VIEW', 'AUDIT_RECEIPT', 'RISK_ASSESS'],
  asistente: ['CASES_CREATE', 'CASES_READ', 'CASES_WRITE', 'AUDIT_RECEIPT'],
  cliente: ['CASES_READ'],
}

module.exports = { RBAC_MATRIX }
