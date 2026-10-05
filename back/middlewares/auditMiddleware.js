'use strict'

/**
 * auditMiddleware
 *
 * Captura el resultado de cada peticion (exito/denegacion/error) y lo escribe
 * en la bitacora inmutable. Se monta globalmente despues de las rutas para que
 * el status final ya este definido.
 *
 * `auditAction(action)` permite etiquetar una ruta concreta cuando el nombre
 * del evento no se deduce del metodo (p. ej. unlock o rotation de matriz).
 */

const { record } = require('../services/auditService')
const { getClientIp } = require('../utils/helpers')
const { logger } = require('../utils/logger')

/** Normaliza el evento segun metodo HTTP: evita ensuciar cada ruta. */
function inferAction(req) {
  const method = req.method.toUpperCase()
  if (method === 'GET') return 'READ'
  if (method === 'POST') return 'CREATE'
  if (method === 'PUT' || method === 'PATCH') return 'UPDATE'
  if (method === 'DELETE') return 'DELETE'
  return method
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

    let status = 'INFO'
    if (res.statusCode === 429) status = 'WARN'
    else if (res.statusCode === 403) status = 'WARN'
    else if (res.statusCode >= 500) status = 'CRITICO'

    record(action, {
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

    logger.debug('request', {
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Math.round(durationMs),
    })
  })

  next()
}

/** Log de seguridad dedicado a los accesos fallidos de autenticacion. */
function logAccessAttempt(req, action, userCode, details) {
  record(action, { userCode, req, details: { ip: getClientIp(req), ...details } })
}

module.exports = { auditMiddleware, auditAction, logAccessAttempt, inferAction }