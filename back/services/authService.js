'use strict'

const jwt = require('jsonwebtoken')
const { one, rows } = require('../config/db')
const { unauthorized } = require('../utils/errors')
const { logger } = require('../utils/logger')
const { assertUnlockSecretConfigured } = require('../utils/unlockToken')

const JWT_SECRET = process.env.JWT_SECRET
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '45m'
// Secreto propio y obligatorio (validado al arrancar): no se deriva de JWT_SECRET.
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d'
const JWT_ISSUER = process.env.JWT_ISSUER || 'legalshield-api'

/** Si un JWT no esta firmado con el secreto esperado, aborta el arranque. */
function assertSecretsConfigured() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET ausente o demasiado corto: define uno de al menos 32 caracteres en .env')
  }
  // Separacion de claves: un secreto de refresh derivado de JWT_SECRET caeria
  // junto con el y escaparia a la comparacion contra UNLOCK_TOKEN_SECRET.
  if (!process.env.JWT_REFRESH_SECRET || process.env.JWT_REFRESH_SECRET.length < 32) {
    throw new Error('JWT_REFRESH_SECRET ausente o demasiado corto: define uno propio de al menos 32 caracteres en .env')
  }
  if (process.env.JWT_SECRET === process.env.JWT_REFRESH_SECRET) {
    throw new Error('JWT_REFRESH_SECRET debe ser distinto de JWT_SECRET')
  }
  // Sin un secreto HMAC valido no se podria verificar ningun OTP de desbloqueo.
  assertUnlockSecretConfigured()
}

/**
 * Carga permisos RBAC vigentes del usuario (fuente de verdad: la base de datos).
 * Se resuelve por el rol del usuario, de modo que un cambio en la matriz surte
 * efecto en la siguiente peticion sin reemitir el token.
 */
async function loadPermissions(userId) {
  const result = await rows(
    `SELECT p.code
       FROM users u
       JOIN role_permissions rp ON rp.role_id = u.role_id
       JOIN permissions      p  ON p.id = rp.permission_id
      WHERE u.id = ?
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
    `SELECT u.id, u.user_code, u.username, u.email, u.role_id, u.is_locked, u.status,
            u.is_active, u.must_change_password,
            u.locked_until, TIMESTAMPDIFF(SECOND, NOW(), u.locked_until) AS remaining_seconds,
            r.code AS role_code, r.name AS role_name
       FROM users u
       JOIN roles r ON r.id = u.role_id
      WHERE u.id = ?`,
    [Number(payload.sub)],
  )

  if (!user) throw unauthorized('La cuenta asociada al token ya no existe')
  // Baja logica: la sesion vigente cae en la siguiente peticion, sin esperar a
  // que expire el token (revocacion de acceso, ISO 27002 5.18).
  if (!user.is_active || user.status === 'DISABLED') {
    throw unauthorized('La cuenta esta desactivada')
  }

  // Invalida la sesion mientras el bloqueo siga vigente en MySQL; un bloqueo
  // temporal vencido se ignora (la cuenta se libera en el siguiente login). El
  // bloqueo indefinido (LOCKED_OSI) tiene locked_until = NULL y nunca vence solo.
  if (user.status === 'LOCKED_OSI' || (user.is_locked && Number(user.remaining_seconds ?? 0) > 0)) {
    throw unauthorized('La cuenta esta bloqueada por politica anti-fuerza bruta')
  }

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
    `SELECT u.id, u.user_code, u.username, u.email, u.role_id, u.is_locked, u.status,
            u.is_active, u.must_change_password,
            u.locked_until, TIMESTAMPDIFF(SECOND, NOW(), u.locked_until) AS remaining_seconds,
            r.code AS role_code, r.name AS role_name
       FROM users u JOIN roles r ON r.id = u.role_id
      WHERE u.id = ?`,
    [Number(payload.sub)],
  )
  if (!user) throw unauthorized('La cuenta asociada al refresh token ya no existe')
  // Una cuenta dada de baja no puede renovar su sesion.
  if (!user.is_active || user.status === 'DISABLED') {
    throw unauthorized('La cuenta esta desactivada')
  }
  // Mismo criterio que verifyAccessToken: el bloqueo indefinido no se renueva.
  if (user.status === 'LOCKED_OSI' || (user.is_locked && Number(user.remaining_seconds ?? 0) > 0)) {
    throw unauthorized('La cuenta esta bloqueada')
  }

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