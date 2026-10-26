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

/**
 * Normaliza un parametro de paginacion recibido por query string.
 * Un valor ausente, no numerico o fuera del rango usa el valor por defecto;
 * los valores validos se acotan al maximo para evitar consultas desmedidas.
 */
function parsePagination(value, { fallback, min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isSafeInteger(parsed) || parsed < min) return fallback
  return Math.min(parsed, max)
}

module.exports = { getClientIp, asyncHandler, parsePagination }