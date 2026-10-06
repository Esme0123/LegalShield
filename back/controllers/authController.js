'use strict'

const bcrypt = require('bcryptjs')
const { one, rows, withTransaction } = require('../config/db')
const {
  loadPermissions,
  signAccessToken,
  signRefreshToken,
} = require('../services/authService')
const { record } = require('../services/auditService')
const { getClientIp } = require('../utils/helpers')
const { badRequest, conflict, forbidden, notFound, unauthorized, unprocessable } = require('../utils/errors')
const { evaluatePassword, PASSWORD_HISTORY_LIMIT } = require('../utils/passwordPolicy')
const { USER_CODE_RE, normalizeUserCode, generateUserCode, sanitizeEmail, normalizeUsername } = require('../utils/identity')

const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || 12)
const MAX_FAILED_ATTEMPTS = Number(process.env.MAX_FAILED_ATTEMPTS || 3)

/** Roles que un usuario puede solicitar al registrarse. */
const REGISTERABLE_ROLES = ['abogado', 'asistente', 'socio']

/* -------------------------------------------------------------------------- */
/* POST /api/auth/register                                                     */
/* -------------------------------------------------------------------------- */

async function register(req, res) {
  const { firstName, lastName, email, password, role, firm, department, phone } = req.body ?? {}

  const missing = ['firstName', 'lastName', 'email', 'password', 'role'].filter((f) => !String(req.body?.[f] ?? '').trim())
  if (missing.length > 0) {
    throw badRequest('Campos obligatorios incompletos', { missing })
  }

  const cleanEmail = sanitizeEmail(email)
  if (!cleanEmail) throw unprocessable('Correo institucional invalido')

  const code = normalizeUserCode(role)
  if (!REGISTERABLE_ROLES.includes(code)) {
    throw unprocessable('Rol no valido para registro', { allowed: REGISTERABLE_ROLES })
  }

  const policy = evaluatePassword(password)
  if (!policy.valid) {
    throw unprocessable('La contrasena no cumple la politica de seguridad', {
      failed: policy.failed,
      rules: policy.rules.map(({ id, label }) => ({ id, label })),
    })
  }

  const username = normalizeUsername(`${firstName} ${lastName}`)
  const roleRow = await one('SELECT id, code FROM roles WHERE code = ?', [code])
  if (!roleRow) throw unprocessable('El rol solicitado no existe en el catalogo', { role: code })

  const existingEmail = await one('SELECT user_code FROM users WHERE email = ?', [cleanEmail])
  if (existingEmail) throw conflict(`El correo ya esta registrado como ${existingEmail.user_code}`)

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)

  const user = await withTransaction(async (client) => {
    // El correlativo se calcula dentro de la transaccion y con un lock consultivo
    // (GET_LOCK) para que dos altas simultaneas no emitan el mismo User ID.
    const userCode = await generateUserCode(client)
    const { insertId } = await client.query(
      `INSERT INTO users (user_code, username, email, password_hash, role_id, firm, department, phone, password_updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, now())`,
      [
        userCode,
        username,
        cleanEmail,
        passwordHash,
        roleRow.id,
        String(firm ?? '').trim() || null,
        String(department ?? '').trim() || null,
        String(phone ?? '').trim() || null,
      ],
    )

    // MySQL no soporta RETURNING: se recupera la fila por LAST insert id.
    const { rows: inserted } = await client.query(
      `SELECT id, user_code, username, email, role_id, firm, department, phone, password_updated_at
         FROM users WHERE id = ?`,
      [insertId],
    )

    // El primer registro de contrasena entra al historico (punto 9.3).
    await client.query('INSERT INTO password_history (user_id, password_hash) VALUES (?, ?)', [
      inserted[0].id,
      passwordHash,
    ])

    return inserted[0]
  })

  record('REGISTER', {
    userCode: user.user_code,
    req,
    details: { email: user.email, role: roleRow.code, firm: user.firm },
  })

  res.status(201).json({
    message: 'Alta registrada correctamente',
    user: {
      userCode: user.user_code,
      username: user.username,
      email: user.email,
      role: roleRow.code,
      firm: user.firm,
      department: user.department,
      phone: user.phone,
      passwordUpdatedAt: user.password_updated_at,
    },
  })
}

/* -------------------------------------------------------------------------- */
/* POST /api/auth/login                                                        */
/* -------------------------------------------------------------------------- */

async function login(req, res) {
  const { userCode, password } = req.body ?? {}
  const ip = getClientIp(req)

  const candidate = normalizeUserCode(userCode)
  if (!candidate) {
    throw unprocessable('User ID invalido', { pattern: USER_CODE_RE.source })
  }
  if (typeof password !== 'string' || password.length === 0) {
    throw badRequest('La contrasena es obligatoria')
  }

  const user = await one(
    `SELECT u.id, u.user_code, u.username, u.email, u.role_id, u.password_hash,
            u.failed_attempts, u.is_locked, u.password_updated_at,
            r.code AS role_code, r.name AS role_name
       FROM users u JOIN roles r ON r.id = u.role_id
      WHERE u.user_code = ?`,
    [candidate],
  )

  // Respuesta uniforme para usuario inexistente y clave incorrecta: no revela
  // que User IDs existen en el directorio (enumeracion de cuentas).
  const genericError = unauthorized('User ID o contrasena incorrectos')

  if (!user) {
    record('AUTH_FAILED', { userCode: candidate, req, details: { reason: 'usuario_no_existe', ip } })
    throw genericError
  }

  // 1. Cuenta bloqueada -> 403 antes de comparar la clave.
  if (user.is_locked) {
    record('AUTH_LOCKED', {
      userCode: user.user_code,
      req,
      details: { reason: 'intento_sobre_cuenta_bloqueada', ip },
    })
    throw forbidden('La cuenta esta bloqueada. Solicite el desbloqueo al administrador')
  }

  const matches = await bcrypt.compare(password, user.password_hash)

  // 2. Clave incorrecta -> incrementar failed_attempts.
  if (!matches) {
    await query(
      `UPDATE users
          SET failed_attempts = failed_attempts + 1,
              locked_at = CASE WHEN failed_attempts + 1 >= ? THEN now() ELSE locked_at END,
              is_locked  = CASE WHEN failed_attempts + 1 >= ? THEN TRUE  ELSE is_locked  END
        WHERE id = ?`,
      [MAX_FAILED_ATTEMPTS, MAX_FAILED_ATTEMPTS, user.id],
    )
    const updated = await one('SELECT failed_attempts, is_locked FROM users WHERE id = ?', [user.id])

    // 3. Al superar el umbral -> AUTH_LOCKED en la bitacora.
    if (updated.is_locked) {
      record('AUTH_LOCKED', {
        userCode: user.user_code,
        req,
        details: { failedAttempts: updated.failed_attempts, threshold: MAX_FAILED_ATTEMPTS, ip },
      })
      throw forbidden(
        `Cuenta bloqueada tras ${updated.failed_attempts} intentos fallidos. Solicite el desbloqueo al administrador`,
      )
    }

    record('AUTH_FAILED', {
      userCode: user.user_code,
      req,
      details: { failedAttempts: updated.failed_attempts, remaining: MAX_FAILED_ATTEMPTS - updated.failed_attempts, ip },
    })
    throw genericError
  }

  // 4. Credencial correcta -> reinicia el contador y emite sesion.
  await withTransaction(async (client) => {
    await client.query(
      'UPDATE users SET failed_attempts = 0, is_locked = FALSE, locked_at = NULL WHERE id = ?',
      [user.id],
    )
  })

  const permissions = await loadPermissions(user.id)
  const accessToken = signAccessToken(user, permissions)
  const refreshToken = signRefreshToken(user)

  record('AUTH_SUCCESS', {
    userCode: user.user_code,
    req,
    details: { role: user.role_code, permissions: permissions.length, ip },
  })

  res.json({
    message: 'Acceso concedido',
    token: accessToken,
    refreshToken,
    expiresIn: process.env.JWT_EXPIRES_IN || '45m',
    user: {
      id: user.id,
      userCode: user.user_code,
      username: user.username,
      email: user.email,
      role: user.role_code,
      roleLabel: user.role_name,
      permissions,
      passwordUpdatedAt: user.password_updated_at,
    },
  })
}

/* -------------------------------------------------------------------------- */
/* POST /api/auth/unlock                                                       */
/* -------------------------------------------------------------------------- */

async function unlock(req, res) {
  const target = normalizeUserCode(req.body?.userCode)
  if (!target) throw unprocessable('User ID invalido', { pattern: USER_CODE_RE.source })

  // El desbloqueo lo ejecuta un administrador del despacho (socio) o quien tenga
  // TOKEN_RESET: es una operacion de privilegio, no una autoayuda del titular.
  const actor = req.user
  const isPrivileged =
    actor.role_code === 'socio' || (actor.permissions ?? []).includes('TOKEN_RESET')
  if (!isPrivileged) {
    throw forbidden('Solo un administrador con TOKEN_RESET puede desbloquear cuentas')
  }

  const user = await one(
    'SELECT id, user_code, is_locked, failed_attempts FROM users WHERE user_code = ?',
    [target],
  )
  if (!user) throw notFound(`No existe el User ID ${target}`)

  await withTransaction(async (client) => {
    await client.query(
      'UPDATE users SET is_locked = FALSE, failed_attempts = 0, locked_at = NULL WHERE id = ?',
      [user.id],
    )
  })

  record('AUTH_UNLOCK', {
    userCode: actor.user_code,
    req,
    details: { target: user.user_code, previousAttempts: user.failed_attempts },
  })

  res.json({
    message: `Cuenta ${user.user_code} desbloqueada`,
    user: { userCode: user.user_code, isLocked: false, failedAttempts: 0 },
  })
}

/* -------------------------------------------------------------------------- */
/* POST /api/auth/refresh · GET /api/auth/me · POST /api/auth/logout           */
/* -------------------------------------------------------------------------- */

async function refresh(req, res) {
  const { rotateRefreshToken } = require('../services/authService')
  const { refreshToken } = req.body ?? {}
  if (!refreshToken) throw badRequest('Falta refreshToken')

  const result = await rotateRefreshToken(refreshToken)
  record('TOKEN_REFRESH', { userCode: result.user.user_code, req })

  res.json({
    message: 'Sesion renovada',
    token: result.accessToken,
    refreshToken: result.refreshToken,
    user: {
      id: result.user.id,
      userCode: result.user.user_code,
      username: result.user.username,
      email: result.user.email,
      role: result.user.role_code,
      permissions: result.permissions,
    },
  })
}

/** Perfil del usuario autenticado con sus permisos vigentes. */
async function me(req, res) {
  res.json({
    user: {
      id: req.user.id,
      userCode: req.user.user_code,
      username: req.user.username,
      email: req.user.email,
      role: req.user.role_code,
      roleLabel: req.user.role_name,
      permissions: req.user.permissions,
    },
  })
}

/**
 * Cierre de sesion. Los JWT son sin estado, asi que aqui solo queda la evidencia
 * en la bitacora: la revocacion real exige lista de tokens o TTL corto.
 */
async function logout(req, res) {
  record('LOGOUT', { userCode: req.user?.user_code ?? null, req })
  res.json({ message: 'Sesion cerrada', userCode: req.user?.user_code ?? null })
}

/* -------------------------------------------------------------------------- */
/* GET /api/auth/directory · GET /api/auth/password-history                    */
/* -------------------------------------------------------------------------- */

/**
 * Directorio de usuarios para la pantalla de login. Expone datos no sensibles
 * (User ID, nombre, rol) y por eso exige sesion valida.
 */
async function directory(_req, res) {
  const result = await rows(
    `SELECT u.user_code AS "userCode", u.username AS name, u.email,
            u.department, r.code AS role
       FROM users u JOIN roles r ON r.id = u.role_id
      WHERE u.is_locked = FALSE
      ORDER BY u.user_code`,
  )
  res.json({ users: result })
}

/** Historial de contrasenas del usuario autenticado (solo metadatos). */
async function passwordHistory(req, res) {
  const result = await rows(
    `SELECT id, created_at AS "createdAt"
       FROM password_history
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?`,
    [req.user.id, PASSWORD_HISTORY_LIMIT],
  )
  res.json({ limit: PASSWORD_HISTORY_LIMIT, entries: result })
}

module.exports = {
  register,
  login,
  unlock,
  refresh,
  me,
  logout,
  directory,
  passwordHistory,
  MAX_FAILED_ATTEMPTS,
  BCRYPT_ROUNDS,
}