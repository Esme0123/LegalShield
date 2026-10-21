'use strict'

/**
 * IP del cliente segun req.ip, que Express calcula aplicando la politica
 * 'trust proxy' (TRUST_PROXY). No se lee X-Forwarded-For directamente: sin un
 * proxy de confianza ese header lo controla el cliente y permitiria falsificar la
 * IP de la bitacora y evadir los limitadores por IP.
 * Se usa para security_logs.ip_address y activity_logs.ip_address (MySQL, VARCHAR(45)).
 */
function getClientIp(req) {
  return req.ip ?? req.socket?.remoteAddress ?? null
}

/**
 * Envoltura para handlers async: propaga el error a `next()` sin duplicar el
 * try/catch en cada controller.
 */
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

module.exports = { getClientIp, asyncHandler }