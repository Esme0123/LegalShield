'use strict'

/**
 * Extrae la IP real del cliente respetando el proxy inverso (X-Forwarded-For).
 * Se usa para security_logs.ip_address, que en PostgreSQL admite VARCHAR(45).
 */
function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim()
  }
  return req.ip ?? req.socket?.remoteAddress ?? null
}

/**
 * Envoltura para handlers async: propaga el error a `next()` sin duplicar el
 * try/catch en cada controller.
 */
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

module.exports = { getClientIp, asyncHandler }