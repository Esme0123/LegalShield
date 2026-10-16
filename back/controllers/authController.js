'use strict'

const bcrypt = require('bcryptjs')
const { one, rows, query, withTransaction } = require('../config/db')
const {
  loadPermissions,
  signAccessToken,
  signRefreshToken,
} = require('../services/authService')
const { record } = require('../services/auditService')
const { getClientIp } = require('../utils/helpers')
const { badRequest, conflict, forbidden, notFound, unauthorized, unprocessable } = require('../utils/errors')
const { evaluatePassword, PASSWORD_HISTORY_LIMIT } = require('../utils/passwordPolicy')
const {
  USER_CODE_RE,
  USER_CODE_CI_RE,
  USERNAME_RE,
  normalizeUserCode,
  normalizeLoginIdentifier,
  generateUserCode,
  sanitizeEmail,
  buildUsername,
  findAvailableUsername,
} = require('../utils/identity')

const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || 12)
const MAX_FAILED_ATTEMPTS = Number(process.env.MAX_FAILED_ATTEMPTS || 3)
/** Minutos de inhabilitacion temporal tras agotar los intentos. */
const LOCK_MINUTES = Number(process.env.LOCK_MINUTES || 2)
const LOCK_MESSAGE = '3 de 3 - Cuenta inhabilitada temporalmente'
const CAPTCHA_THRESHOLD = Number(process.env.CAPTCHA_THRESHOLD || 1)

/** Roles que un usuario puede solicitar al registrarse. */
const REGISTERABLE_ROLES = ['abogado', 'asistente', 'socio']

/** Segundos restantes del bloqueo persistido en MySQL (locked_until). */
function remainingSecondsFrom(lockedUntil, sqlSeconds) {
  if (sqlSeconds !== null && sqlSeconds !== undefined) {
    return Math.max(0, Number(sqlSeconds))
  }
  if (!lockedUntil) return 0
  return Math.max(0, Math.ceil((new Date(lockedUntil).getTime() - Date.now()) / 1000))
}

/** Libera el bloqueo vencido: la cuenta vuelve a estado operativo. */
async function releaseExpiredLock(userId) {
  await query(
    `UPDATE users
        SET is_locked = FALSE, status = 'ACTIVE', failed_attempts = 0,
            locked_at = NULL, locked_until = NULL
      WHERE id = ?`,
    [userId],
  )
}

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

  // User ID estandarizado (punto 9.1): primer nombre + primer apellido, en
  // minusculas y sin acentos. La disponibilidad se confirma dentro de la
  // transaccion (marta.perez, marta.perez1, ...) para no pisar un duplicado.
  const baseUsername = buildUsername(firstName, lastName)
  const roleRow = await one('SELECT id, code FROM roles WHERE code = ?', [code])
  if (!roleRow) throw unprocessable('El rol solicitado no existe en el catalogo', { role: code })

  const existingEmail = await one('SELECT user_code FROM users WHERE email = ?', [cleanEmail])
  if (existingEmail) throw conflict(`El correo ya esta registrado como ${existingEmail.user_code}`)

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)

  const user = await withTransaction(async (client) => {
    // El correlativo se calcula dentro de la transaccion y con un lock consultivo
    // (GET_LOCK) para que dos altas simultaneas no emitan el mismo User ID.
    const userCode = await generateUserCode(client)
    const username = await findAvailableUsername(client, baseUsername)
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
  const body = req.body ?? {}
  // Acepta el identificador bajo cualquiera de los alias usados por el frontend:
  // { userCode }, { username }, { identifier } o { email }.
  const rawIdentifier = body.userCode ?? body.username ?? body.identifier ?? body.email
  const { password, captchaToken, captchaResponse } = body
  const ip = getClientIp(req)

  const identifier = normalizeLoginIdentifier(rawIdentifier)
  if (!identifier) {
    throw unprocessable('Identificador invalido', {
      accepted: {
        username: USERNAME_RE.source,
        userCode: USER_CODE_CI_RE.source,
        email: 'correo institucional (ej: mariana.solis@legalshield.bo)',
      },
    })
  }
  if (typeof password !== 'string' || password.length === 0) {
    throw badRequest('La contrasena es obligatoria')
  }

  const user = await one(
    `SELECT u.id, u.user_code, u.username, u.email, u.role_id, u.password_hash,
            u.failed_attempts, u.is_locked, u.status, u.locked_until, u.is_active,
            u.password_updated_at,
            TIMESTAMPDIFF(SECOND, NOW(), u.locked_until) AS remaining_seconds,
            r.code AS role_code, r.name AS role_name
       FROM users u JOIN roles r ON r.id = u.role_id
      WHERE u.username = ? OR u.email = ? OR u.user_code = ?`,
    [identifier.toLowerCase(), sanitizeEmail(identifier), normalizeUserCode(identifier) ?? identifier],
  )

  // Respuesta uniforme para usuario inexistente y clave incorrecta: no revela
  // que User IDs existen en el directorio (enumeracion de cuentas).
  const genericError = unauthorized('User ID o contrasena incorrectos')

  if (!user) {
    record('AUTH_FAILED', { userCode: identifier, req, details: { reason: 'usuario_no_existe', ip } })
    throw genericError
  }

  // Validación CAPTCHA si hay intentos fallidos previos (Mecanismo Menos Común)
  if (Number(user.failed_attempts) >= CAPTCHA_THRESHOLD) {
    const expected = String(captchaToken ?? '').trim()
    const provided = String(captchaResponse ?? '').trim()
    if (!provided || provided !== expected) {
      await query(
        `UPDATE users
            SET failed_attempts = failed_attempts + 1
          WHERE id = ?`,
        [user.id],
      )
      const updated = await one('SELECT failed_attempts FROM users WHERE id = ?', [user.id])
      record('AUTH_FAILED', {
        userCode: user.user_code,
        req,
        details: { reason: 'captcha_invalido', failedAttempts: updated?.failed_attempts ?? Number(user.failed_attempts) + 1, ip },
      })
      throw unauthorized('Validación CAPTCHA requerida o incorrecta')
    }
  }

  // 0. Baja logica: la cuenta fue desactivada por un administrador (ABM /users).
  if (!user.is_active || user.status === 'DISABLED') {
    record('AUTH_DISABLED', {
      userCode: user.user_code,
      req,
      details: { reason: 'usuario_desactivado', ip },
    })
    throw forbidden('La cuenta esta desactivada. Contacte al administrador del despacho')
  }

  // 1. Bloqueo temporal persistido en MySQL: si NOW() < locked_until se informa
  //    el tiempo restante exacto; si ya vencio, la cuenta se libera sola.
  if (user.is_locked) {
    const remainingSeconds = remainingSecondsFrom(user.locked_until, user.remaining_seconds)

    if (remainingSeconds > 0) {
      record('AUTH_LOCKED', {
        userCode: user.user_code,
        req,
        details: { reason: 'intento_sobre_cuenta_bloqueada', remainingSeconds, ip },
      })
    return res.status(401).json({
       message: '3 de 3 - Cuenta inhabilitada temporalmente',
       error: '3 de 3 - Cuenta inhabilitada temporalmente',
       isLocked: true,
       remainingSeconds,
       locked: true,
       failedAttempts: Number(user.failed_attempts),
       maxAttempts: MAX_FAILED_ATTEMPTS,
       showCaptcha: false,
       details: { isLocked: true, remainingSeconds, locked: true, failedAttempts: Number(user.failed_attempts) },
    })
    }

    await releaseExpiredLock(user.id)
    user.is_locked = false
  }

  const matches = await bcrypt.compare(password, user.password_hash)

  // 2. Clave incorrecta -> incrementar failed_attempts en 1.
  // Nota: MySQL evalua los SET de izquierda a derecha, por eso los CASE se
  // calculan ANTES del incremento: `failed_attempts + 1` es el valor final.
  if (!matches) {
    await query(
      `UPDATE users
          SET locked_at = CASE WHEN failed_attempts + 1 >= ? THEN now() ELSE locked_at END,
              locked_until = CASE
                               WHEN failed_attempts + 1 >= ?
                                 THEN DATE_ADD(now(), INTERVAL ? MINUTE)
                               ELSE locked_until
                             END,
              status = CASE WHEN failed_attempts + 1 >= ? THEN 'LOCKED' ELSE status END,
              is_locked  = CASE WHEN failed_attempts + 1 >= ? THEN TRUE  ELSE is_locked  END,
              failed_attempts = failed_attempts + 1
        WHERE id = ?`,
      [MAX_FAILED_ATTEMPTS, MAX_FAILED_ATTEMPTS, LOCK_MINUTES, MAX_FAILED_ATTEMPTS, MAX_FAILED_ATTEMPTS, user.id],
    )
    const updated = await one(
      `SELECT failed_attempts, is_locked, locked_until,
              TIMESTAMPDIFF(SECOND, NOW(), locked_until) AS remaining_seconds
         FROM users WHERE id = ?`,
      [user.id],
    )
    const failedAttempts = Number(updated.failed_attempts)
    const lockedNow = Boolean(updated.is_locked)
    const remainingSeconds = lockedNow
      ? Math.max(0, Number(updated.remaining_seconds ?? LOCK_MINUTES * 60))
      : 0

    // 3. Al alcanzar el umbral -> cuenta bloqueada + evento LOGIN_LOCKED en bitacora.
    if (lockedNow) {
      record('LOGIN_LOCKED', {
        userCode: user.user_code,
        req,
        details: { failedAttempts, threshold: MAX_FAILED_ATTEMPTS, remainingSeconds, ip },
      })
    } else {
      record('AUTH_FAILED', {
        userCode: user.user_code,
        req,
        details: { failedAttempts, remaining: MAX_FAILED_ATTEMPTS - failedAttempts, ip },
      })
    }

    // 401 uniforme con el contador real. Al bloquear se anexa isLocked y el
    // tiempo restante para que el frontend inicie su cuenta regresiva exacta.
    return res.status(401).json({
       message: lockedNow ? '3 de 3 - Cuenta inhabilitada temporalmente' : 'Credencial inválida',
       error: lockedNow ? '3 de 3 - Cuenta inhabilitada temporalmente' : 'Credencial inválida',
       failedAttempts,
       maxAttempts: MAX_FAILED_ATTEMPTS,
       locked: lockedNow,
       isLocked: lockedNow,
       remainingSeconds,
       showCaptcha: !lockedNow && failedAttempts >= CAPTCHA_THRESHOLD,
       details: { failedAttempts, maxAttempts: MAX_FAILED_ATTEMPTS, locked: lockedNow, isLocked: lockedNow, remainingSeconds },
    })
  }

  // 4. Credencial correcta -> reinicia el contador y emite sesion.
  await withTransaction(async (client) => {
    await client.query(
      `UPDATE users
          SET failed_attempts = 0, is_locked = FALSE, status = 'ACTIVE',
              locked_at = NULL, locked_until = NULL
        WHERE id = ?`,
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
/* POST /api/auth/lock-status                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Estado del bloqueo temporal de una cuenta. Permite que el frontend, tras una
 * recarga (F5), retome el conteo exacto en los segundos que restan en MySQL.
 */
async function lockStatus(req, res) {
  const body = req.body ?? {}
  const identifier = normalizeLoginIdentifier(body.userCode ?? body.identifier ?? body.email)

  if (!identifier) {
    return res.json({ isLocked: false, remainingSeconds: 0, failedAttempts: 0 })
  }

  const user = await one(
    `SELECT id, failed_attempts, is_locked, locked_until,
            TIMESTAMPDIFF(SECOND, NOW(), locked_until) AS remaining_seconds
       FROM users
      WHERE username = ? OR email = ? OR user_code = ?`,
    [identifier.toLowerCase(), sanitizeEmail(identifier), normalizeUserCode(identifier) ?? identifier],
  )

  if (!user || !user.is_locked) {
    return res.json({
      isLocked: false,
      remainingSeconds: 0,
      failedAttempts: Number(user?.failed_attempts ?? 0),
    })
  }

  const remainingSeconds = remainingSecondsFrom(user.locked_until, user.remaining_seconds)
  if (remainingSeconds <= 0) {
    await releaseExpiredLock(user.id)
    return res.json({ isLocked: false, remainingSeconds: 0, failedAttempts: 0 })
  }

   return res.json({
     isLocked: true,
     remainingSeconds,
     failedAttempts: Number(user.failed_attempts),
     message: '3 de 3 - Cuenta inhabilitada temporalmente',
   })
}

/* -------------------------------------------------------------------------- */
/* POST /api/auth/unlock                                                       */
/* -------------------------------------------------------------------------- */

async function unlock(req, res) {
  const target = normalizeUserCode(req.body?.userCode)
  if (!target) throw unprocessable('User ID invalido', { pattern: USER_CODE_RE.source })

  // El desbloqueo es una operacion del Oficial de Seguridad (OSI): exige el
  // permiso ACCOUNT_UNLOCK y no es una autoayuda del titular bloqueado.
  const actor = req.user
  const isPrivileged =
    actor.role_code === 'osi' || (actor.permissions ?? []).includes('ACCOUNT_UNLOCK')
  if (!isPrivileged) {
    throw forbidden('Solo el Oficial de Seguridad (OSI) puede desbloquear cuentas')
  }

  const user = await one(
    'SELECT id, user_code, is_locked, failed_attempts FROM users WHERE user_code = ?',
    [target],
  )
  if (!user) throw notFound(`No existe el User ID ${target}`)

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE users
          SET is_locked = FALSE, status = 'ACTIVE', failed_attempts = 0,
              locked_at = NULL, locked_until = NULL,
              unlock_token = NULL, unlock_token_expires_at = NULL, unlock_token_used = FALSE
        WHERE id = ?`,
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
      WHERE u.is_active = TRUE AND u.is_locked = FALSE
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

/* -------------------------------------------------------------------------- */
/* POST /api/auth/verify-unlock-token                                           */
/* -------------------------------------------------------------------------- */

async function verifyUnlockToken(req, res) {
  const token = String(req.body?.token ?? '').trim()
  const identifier = normalizeLoginIdentifier(req.body?.userCode ?? req.body?.identifier ?? req.body?.email)

  if (!token) throw badRequest('Token de desbloqueo requerido')
  if (!identifier) throw badRequest('Identificador de usuario requerido')

  const user = await one(
    `SELECT id, user_code, username, email, is_locked, is_active, status, failed_attempts,
            unlock_token, unlock_token_expires_at, unlock_token_used
       FROM users WHERE username = ? OR email = ? OR user_code = ?`,
    [identifier.toLowerCase(), sanitizeEmail(identifier), normalizeUserCode(identifier) ?? identifier],
  )

  if (!user) throw notFound('Usuario no encontrado')

  if (user.unlock_token_used) {
    throw forbidden('El token de desbloqueo ya fue utilizado')
  }

  if (!user.unlock_token_expires_at || new Date(user.unlock_token_expires_at) < new Date()) {
    throw forbidden('El token de desbloqueo ha expirado')
  }

  if (user.unlock_token !== token) {
    throw unauthorized('Token de desbloqueo incorrecto')
  }

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE users
          SET is_locked = FALSE, status = 'ACTIVE', failed_attempts = 0,
              locked_at = NULL, locked_until = NULL,
              unlock_token_used = TRUE, unlock_token = NULL, unlock_token_expires_at = NULL
        WHERE id = ?`,
      [user.id],
    )
  })

  record('ACCOUNT_UNLOCKED_VIA_TOKEN', {
    userCode: user.user_code,
    req,
    details: { ip: getClientIp(req) },
  })

  res.json({
    message: 'Cuenta desbloqueada exitosamente',
    user: {
      userCode: user.user_code,
      username: user.username,
      isLocked: false,
      failedAttempts: 0,
    },
  })
}

  module.exports = {
  register,
  login,
  unlock,
  lockStatus,
  refresh,
  me,
  logout,
  directory,
  passwordHistory,
  verifyUnlockToken,
  MAX_FAILED_ATTEMPTS,
  LOCK_MINUTES,
  BCRYPT_ROUNDS,
  CAPTCHA_THRESHOLD,
}