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
const { unauthorized } = require('../utils/errors')
const { asyncHandler } = require('../utils/helpers')

function extractToken(req) {
  const header = req.headers.authorization ?? ''
  if (header.startsWith('Bearer ')) return header.slice(7).trim()
  return null
}

const authenticate = asyncHandler(async (req, _res, next) => {
  const token = extractToken(req)
  if (!token) {
    throw unauthorized('Falta la cabecera Authorization: Bearer <token>')
  }
  req.user = await verifyAccessToken(token)
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
  }
  next()
})

module.exports = { authenticate, optionalAuth, extractToken }