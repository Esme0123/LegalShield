'use strict'

/**
 * authMiddleware
 *
 * `authenticate` extrae el Bearer token, lo verifica y adjunta a `req.user`
 * { id, user_code, role_code, permissions }.
 *
 * `optionalAuth` hace lo mismo pero tolera la ausencia de token (util para
 * endpoints publicos que adaptan la respuesta segun haya sesion).
 */

const { verifyAccessToken } = require('../services/authService')
const { HttpError, unauthorized } = require('../utils/errors')
const { asyncHandler } = require('../utils/helpers')

const API_PREFIX = process.env.API_PREFIX || '/api'

/**
 * Rutas permitidas mientras el titular deba renovar su clave inicial. La clave
 * la conocio el OSI al dar el alta (ISO 27002 5.17): hasta reemplazarla, la
 * sesion solo sirve para cambiarla, asi nadie opera la cuenta con ella.
 */
const PASSWORD_CHANGE_ALLOWLIST = new Set([
  `GET ${API_PREFIX}/auth/me`,
  `GET ${API_PREFIX}/auth/profile`,
  `PUT ${API_PREFIX}/auth/password`,
  `POST ${API_PREFIX}/auth/logout`,
  `GET ${API_PREFIX}/auth/notifications`,
])

function extractToken(req) {
  const header = req.headers.authorization ?? ''
  if (header.startsWith('Bearer ')) return header.slice(7).trim()
  return null
}

/** True si la sesion debe limitarse al cambio de clave y la ruta no esta permitida. */
function blockedByPasswordChange(req, user) {
  const route = `${req.method} ${req.originalUrl.split('?')[0]}`
  return Boolean(user?.must_change_password) && !PASSWORD_CHANGE_ALLOWLIST.has(route)
}

const authenticate = asyncHandler(async (req, _res, next) => {
  const token = extractToken(req)
  if (!token) {
    throw unauthorized('Falta la cabecera Authorization: Bearer <token>')
  }
  req.user = await verifyAccessToken(token)

  // Se aplica en el servidor: ocultar rutas en el frontend no es un control.
  if (blockedByPasswordChange(req, req.user)) {
    throw new HttpError(403, 'Debe cambiar su contrasena inicial antes de continuar', {
      code: 'PASSWORD_CHANGE_REQUIRED',
    })
  }
  next()
})

const optionalAuth = asyncHandler(async (req, _res, next) => {
  const token = extractToken(req)
  if (token) {
    try {
      req.user = await verifyAccessToken(token)
    } catch {
      req.user = null
    }
    // Misma restriccion que authenticate: con la clave inicial pendiente la
    // sesion no aporta identidad ni permisos; la peticion sigue como anonima,
    // igual que con un token invalido (el endpoint publico no se rompe).
    if (blockedByPasswordChange(req, req.user)) req.user = null
  }
  next()
})

module.exports = { authenticate, optionalAuth, extractToken }