'use strict'

/**
 * Servicio de auditoria: unico punto de escritura en `security_logs`.
 *
 * La tabla tiene un trigger que prohibe UPDATE y DELETE, asi que este modulo
 * solo expone INSERT. Los fallos de auditoria NUNCA interrumpen la operacion de
 * negocio: se registran en el logger y la peticion continua.
 */

const { query } = require('../config/db')
const { getClientIp } = require('../utils/helpers')
const { logger } = require('../utils/logger')

const EVENT = {
  AUTH_SUCCESS: { status: 'INFO' },
  AUTH_FAILED: { status: 'WARN' },
  AUTH_LOCKED: { status: 'CRITICO' },
  AUTH_DISABLED: { status: 'WARN' },
  AUTH_UNLOCK: { status: 'INFO' },
  REGISTER: { status: 'INFO' },
  LOGOUT: { status: 'INFO' },
  TOKEN_REFRESH: { status: 'INFO' },
  PERMISSION_CHANGED: { status: 'WARN' },
  CASE_CREATED: { status: 'INFO' },
  CASE_READ: { status: 'INFO' },
  CASE_UPDATED: { status: 'WARN' },
  CASE_ARCHIVED: { status: 'WARN' },
  USER_CREATED: { status: 'INFO' },
  USER_UPDATED: { status: 'WARN' },
  USER_DEACTIVATED: { status: 'WARN' },
  USER_REACTIVATED: { status: 'INFO' },
  USER_UNLOCKED: { status: 'INFO' },
  ACCESS_DENIED: { status: 'WARN' },
  RATE_LIMITED: { status: 'WARN' },
}

const SEVERITY_ORDER = { INFO: 0, WARN: 1, CRITICO: 2 }

/**
 * Inserta un evento en la bitacora.
 * @param {string} action   codigo del evento (clave de EVENT o texto libre)
 * @param {object} options  { userCode, req, details, status, level }
 */
async function record(action, { userCode = null, req = null, details = null, status, level } = {}) {
  const resolvedStatus = status ?? EVENT[action]?.status ?? 'INFO'
  const ip = req ? getClientIp(req) : null

  try {
    await query(
      `INSERT INTO security_logs (user_code, action, ip_address, status, details)
       VALUES (?, ?, ?, ?, ?)`,
      [userCode, action, ip, resolvedStatus, details ? JSON.stringify(details) : null],
    )
  } catch (err) {
    logger.error('Fallo al escribir en security_logs', { action, message: err.message })
  }
}

/** Eventos cuyo nivel supera un umbral: 0=INFO, 1=WARN, 2=CRITICO. */
function severityLevel(status) {
  return SEVERITY_ORDER[status] ?? 0
}

module.exports = { record, EVENT, severityLevel, SEVERITY_ORDER }