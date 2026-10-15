'use strict'

/**
 * auditMiddleware
 *
 * Captura la traza OPERATIVA de cada peticion de negocio (metodo, ruta, status
 * y duracion) y la escribe en `activity_logs`. Los eventos de acceso y control
 * los registran los propios controladores en `security_logs`.
 *
 * `auditAction(action)` marca la ruta con su evento explicito: en ese caso el
 * controlador ya deja la evidencia, asi que la traza generica se omite para no
 * duplicar filas.
 */

const { recordActivity, recordSecurity } = require('../services/auditService')
const { getClientIp } = require('../utils/helpers')
const { logger } = require('../utils/logger')

const API_PREFIX = process.env.API_PREFIX || '/api'

/** Normaliza el evento segun metodo HTTP: evita ensuciar cada ruta. */
function inferAction(req) {
  const method = req.method.toUpperCase()
  if (method === 'GET') return 'READ'
  if (method === 'POST') return 'CREATE'
  if (method === 'PUT' || method === 'PATCH') return 'UPDATE'
  if (method === 'DELETE') return 'DELETE'
  return method
}

/**
 * Solo se traza actividad con efecto: se excluyen lecturas (ruido), las rutas
 * de autenticacion (tienen su propio evento de seguridad) y las rutas que ya
 * declaran un evento explicito via auditAction.
 */
function shouldTrace(req) {
  if (req.auditAction) return false
  if (req.method.toUpperCase() === 'GET') return false
  if (req.originalUrl.startsWith(`${API_PREFIX}/auth`)) return false
  return true
}

/** Marca la accion explicita de una ruta: req.auditAction = 'AUTH_UNLOCK'. */
function auditAction(action) {
  return (req, _res, next) => {
    req.auditAction = action
    next()
  }
}

function auditMiddleware(req, res, next) {
  const startedAt = process.hrtime.bigint()

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6
    const action = req.auditAction ?? inferAction(req)

    logger.debug('request', {
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Math.round(durationMs),
    })

    if (!shouldTrace(req)) return

    let status = 'INFO'
    if (res.statusCode === 429) status = 'WARN'
    else if (res.statusCode === 403) status = 'WARN'
    else if (res.statusCode >= 500) status = 'CRITICO'

    recordActivity(action, {
      userCode: req.user?.user_code ?? null,
      req,
      status,
      details: {
        method: req.method,
        path: req.originalUrl,
        httpStatus: res.statusCode,
        durationMs: Math.round(durationMs),
      },
    })
  })

  next()
}

/** Log de seguridad dedicado a los accesos fallidos de autenticacion. */
function logAccessAttempt(req, action, userCode, details) {
  return recordSecurity(action, {
    userCode,
    req,
    details: { ip: getClientIp(req), ...details },
  })
}

module.exports = { auditMiddleware, auditAction, logAccessAttempt, inferAction }
