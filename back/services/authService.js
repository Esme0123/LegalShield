'use strict'

const jwt = require('jsonwebtoken')
const { one, rows } = require('../config/db')
const { unauthorized } = require('../utils/errors')
const { logger } = require('../utils/logger')

const JWT_SECRET = process.env.JWT_SECRET
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '45m'
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || `${JWT_SECRET}:refresh`
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d'
const JWT_ISSUER = process.env.JWT_ISSUER || 'legalshield-api'

/** Si un JWT no esta firmado con el secreto esperado, aborta el arranque. */
function assertSecretsConfigured() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET ausente o demasiado corto: define uno de al menos 32 caracteres en .env')
  }
  if (process.env.JWT_SECRET === process.env.JWT_REFRESH_SECRET) {
    throw new Error('JWT_REFRESH_SECRET debe ser distinto de JWT_SECRET')
  }
}

/** Carga permisos RBAC vigentes del usuario (fuente de verdad: la base de datos). */
async function loadPermissions(userId) {
  const result = await rows(
    `SELECT p.code
       FROM role_permissions rp
       JOIN permissions p ON p.id = rp.permission_id
       JOIN roles       r ON r.id = rp.role_id
      WHERE r.id = $1
      ORDER BY p.code`,
    [userId],
  )
  return result.map((row) => row.code)
}

/** Payload del access token: User ID + identidad + permisos resueltos al emitir. */
function signAccessToken(user, permissions) {
  return jwt.sign(
    {
      sub: String(user.id),
      userCode: user.user_code,
      email: user.email,
      name: user.username,
      role: user.role_code ?? null,
      roleId: user.role_id,
      permissions,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN, issuer: JWT_ISSUER },
  )
}

function signRefreshToken(user) {
  return jwt.sign({ sub: String(user.id), typ: 'refresh' }, JWT_REFRESH_SECRET, {
    expiresIn: JWT_REFRESH_EXPIRES_IN,
    issuer: JWT_ISSUER,
  })
}

/**
 * Verifica el access token y rehidrata los permisos desde la base.
 *
 * Rehidratar es deliberado: si un permiso se revoca desde la matriz SIS-321 la
 * sesion existente deja de validoarlo en el siguiente request, sin esperar a que
 * expire el token (requisito de minima separacion de funciones).
 */
async function verifyAccessToken(token) {
  let payload
  try {
    payload = jwt.verify(token, JWT_SECRET, { issuer: JWT_ISSUER })
  } catch (err) {
    throw unauthorized(
      err.name === 'TokenExpiredError' ? 'Sesion expirada: token fuera de vigencia' : 'Token invalido',
    )
  }

  if (payload.typ === 'refresh') {
    throw unauthorized('Un refresh token no puede usarse para autorizar peticiones')
  }

  const user = await one(
    `SELECT u.id, u.user_code, u.username, u.email, u.role_id, u.is_locked,
            r.code AS role_code, r.name AS role_name
       FROM users u
       JOIN roles r ON r.id = u.role_id
      WHERE u.id = $1`,
    [Number(payload.sub)],
  )

  if (!user) throw unauthorized('La cuenta asociada al token ya no existe')
  if (user.is_locked) throw unauthorized('La cuenta esta bloqueada por politica anti-fuerza bruta')

  const permissions = await loadPermissions(user.id)
  return { ...user, permissions, tokenId: payload.jti ?? null }
}

/** Rota el refresh token invalidando el anterior (single use). */
async function rotateRefreshToken(refreshToken) {
  let payload
  try {
    payload = jwt.verify(refreshToken, JWT_REFRESH_SECRET, { issuer: JWT_ISSUER })
  } catch {
    throw unauthorized('Refresh token invalido o expirado')
  }
  if (payload.typ !== 'refresh') throw unauthorized('Se espera un refresh token')

  const user = await one(
    `SELECT u.id, u.user_code, u.username, u.email, u.role_id, u.is_locked,
            r.code AS role_code, r.name AS role_name
       FROM users u JOIN roles r ON r.id = u.role_id
      WHERE u.id = $1`,
    [Number(payload.sub)],
  )
  if (!user) throw unauthorized('La cuenta asociada al refresh token ya no existe')
  if (user.is_locked) throw unauthorized('La cuenta esta bloqueada')

  const permissions = await loadPermissions(user.id)
  logger.info('Refresh token rotado', { userCode: user.user_code })
  return { user, permissions, accessToken: signAccessToken(user, permissions), refreshToken: signRefreshToken(user) }
}

module.exports = {
  assertSecretsConfigured,
  loadPermissions,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  rotateRefreshToken,
  JWT_EXPIRES_IN,
}