'use strict'

/**
 * Servicio de auditoria: unico punto de escritura en las dos bitacoras.
 *
 *   · security_logs  eventos de ACCESO y CONTROL (ciberseguridad): intentos de
 *                    login, bloqueos automaticos, desbloqueos, cambios de roles
 *                    y denegaciones de RBAC. Visible solo para el rol OSI.
 *   · activity_logs  acciones de NEGOCIO del despacho: expedientes, documentos y
 *                    perfil propio. Visible en Dashboard y Expedientes.
 *
 * Los fallos de auditoria NUNCA interrumpen la operacion de negocio: se
 * registran en el logger y la peticion continua.
 */

const { query } = require('../config/db')
const { getClientIp } = require('../utils/helpers')
const { logger } = require('../utils/logger')

/**
 * Catalogo de eventos. `stream` decide la tabla destino:
 * 'security' -> security_logs · 'activity' -> activity_logs.
 */
const EVENT = {
  // Acceso y control de identidades (seguridad)
  AUTH_SUCCESS: { status: 'INFO', stream: 'security' },
  AUTH_FAILED: { status: 'WARN', stream: 'security' },
  AUTH_LOCKED: { status: 'CRITICO', stream: 'security' },
  LOGIN_LOCKED: { status: 'CRITICO', stream: 'security' },
  AUTH_DISABLED: { status: 'WARN', stream: 'security' },
  AUTH_UNLOCK: { status: 'INFO', stream: 'security' },
  REGISTER: { status: 'INFO', stream: 'security' },
  REGISTRATION_BLOCKED: { status: 'WARN', stream: 'security' },
  LOGOUT: { status: 'INFO', stream: 'security' },
  TOKEN_REFRESH: { status: 'INFO', stream: 'security' },
  PASSWORD_CHANGED: { status: 'INFO', stream: 'security' },
  PASSWORD_CHANGE_FAILED: { status: 'WARN', stream: 'security' },
  ACCESS_DENIED: { status: 'WARN', stream: 'security' },
  RATE_LIMITED: { status: 'WARN', stream: 'security' },
  // Control de cuentas y roles (seguridad)
  USER_CREATED: { status: 'INFO', stream: 'security' },
  USER_UPDATED: { status: 'WARN', stream: 'security' },
  USER_DEACTIVATED: { status: 'WARN', stream: 'security' },
  USER_REACTIVATED: { status: 'INFO', stream: 'security' },
  USER_UNLOCKED: { status: 'INFO', stream: 'security' },
  ACCOUNT_UNLOCK_TOKEN_GENERATED: { status: 'INFO', stream: 'security' },
  ACCOUNT_UNLOCKED_VIA_TOKEN: { status: 'INFO', stream: 'security' },
  UNLOCK_TOKEN_FAILED: { status: 'WARN', stream: 'security' },
  UNLOCK_TOKEN_EXPIRED_ATTEMPT: { status: 'WARN', stream: 'security' },
  UNLOCK_TOKEN_REUSE_ATTEMPT: { status: 'WARN', stream: 'security' },
  UNLOCK_TOKEN_EXHAUSTED: { status: 'CRITICO', stream: 'security' },
  UNLOCK_TOKEN_ISSUE_LIMITED: { status: 'WARN', stream: 'security' },
  PASSWORD_CHANGE_REQUIRED: { status: 'INFO', stream: 'security' },
  PERMISSION_CHANGED: { status: 'WARN', stream: 'security' },
  // Operacion del negocio (actividad)
  CASE_CREATED: { status: 'INFO', stream: 'activity' },
  CASE_READ: { status: 'INFO', stream: 'activity' },
  CASE_UPDATED: { status: 'WARN', stream: 'activity' },
  CASE_ARCHIVED: { status: 'WARN', stream: 'activity' },
  PROFILE_UPDATED: { status: 'INFO', stream: 'activity' },
}

const SEVERITY_ORDER = { INFO: 0, WARN: 1, CRITICO: 2 }

/** Tabla destino por defecto cuando el evento no esta catalogado. */
const DEFAULT_STREAM = 'activity'

/** Streams que un evento nunca deberia usar: evita inyeccion en el nombre de tabla. */
const TABLES = { security: 'security_logs', activity: 'activity_logs' }

/** Acciones de seguridad conocidas aunque no esten en EVENT (compatibilidad). */
const SECURITY_ACTIONS = new Set(
  Object.entries(EVENT)
    .filter(([, meta]) => meta.stream === 'security')
    .map(([action]) => action),
)

function streamFor(action, explicitStream) {
  if (explicitStream === 'security' || explicitStream === 'activity') return explicitStream
  if (EVENT[action]?.stream) return EVENT[action].stream
  if (SECURITY_ACTIONS.has(action)) return 'security'
  return DEFAULT_STREAM
}

/**
 * Inserta un evento en la bitacora correspondiente.
 * @param {string} action   codigo del evento (clave de EVENT o texto libre)
 * @param {object} options  { userCode, req, details, status, stream }
 */
async function record(action, { userCode = null, req = null, details = null, status, stream } = {}) {
  const resolvedStatus = status ?? EVENT[action]?.status ?? 'INFO'
  const ip = req ? getClientIp(req) : null
  const table = TABLES[streamFor(action, stream)]

  try {
    await query(
      `INSERT INTO ${table} (user_code, action, ip_address, status, details)
       VALUES (?, ?, ?, ?, ?)`,
      [userCode, action, ip, resolvedStatus, details ? JSON.stringify(details) : null],
    )
  } catch (err) {
    logger.error(`Fallo al escribir en ${table}`, { action, message: err.message })
  }
}

/** Atajo explicito para la bitacora de seguridad (acceso y control). */
function recordSecurity(action, options) {
  return record(action, { ...options, stream: 'security' })
}

/** Atajo explicito para la bitacora de actividad (acciones de negocio). */
function recordActivity(action, options) {
  return record(action, { ...options, stream: 'activity' })
}

/** Eventos cuyo nivel supera un umbral: 0=INFO, 1=WARN, 2=CRITICO. */
function severityLevel(status) {
  return SEVERITY_ORDER[status] ?? 0
}

module.exports = { record, recordSecurity, recordActivity, EVENT, severityLevel, SEVERITY_ORDER }
