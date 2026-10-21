'use strict'

const bcrypt = require('bcryptjs')
const { one, rows, query, withTransaction } = require('../config/db')
const {
  loadPermissions,
  signAccessToken,
  signRefreshToken,
} = require('../services/authService')
const { record } = require('../services/auditService')
const { notifyUser, NOTICE } = require('../services/notificationService')
const { hashOtp, otpMatches, OTP_PATTERN, MAX_OTP_ATTEMPTS } = require('../utils/unlockToken')
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
/**
 * Bloqueo progresivo (backoff, NIST 800-63B 5.2.2): el 1.er bloqueo dura
 * LOCK_MINUTES, los siguientes LOCK_MINUTES_SECOND y, al llegar a
 * LOCK_HARD_THRESHOLD bloqueos consecutivos sin login exitoso, el bloqueo es
 * indefinido (status LOCKED_OSI) y solo lo levanta el Oficial de Seguridad.
 */
const LOCK_MINUTES = Number(process.env.LOCK_MINUTES || 15)
const LOCK_MINUTES_SECOND = Number(process.env.LOCK_MINUTES_SECOND || 30)
const LOCK_HARD_THRESHOLD = Number(process.env.LOCK_HARD_THRESHOLD || 3)
const LOCK_MESSAGE = '3 de 3 - Cuenta inhabilitada temporalmente'
const LOCK_OSI_MESSAGE = 'Cuenta bloqueada por reincidencia. Requiere desbloqueo del Oficial de Seguridad'
/** Unico mensaje para todo rechazo del OTP: el motivo real solo va a security_logs. */
const UNLOCK_TOKEN_REJECTED = 'Token de desbloqueo invalido, expirado o agotado. Solicite uno nuevo al Oficial de Seguridad'
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

/**
 * Libera el bloqueo vencido: la cuenta vuelve a estado operativo. Conserva
 * lock_count (cuenta bloqueos consecutivos sin login exitoso) y nunca libera un
 * bloqueo indefinido, aunque se invoque por error sobre una cuenta LOCKED_OSI.
 */
async function releaseExpiredLock(userId) {
  await query(
    `UPDATE users
        SET is_locked = FALSE, status = 'ACTIVE', failed_attempts = 0,
            locked_at = NULL, locked_until = NULL
      WHERE id = ? AND status <> 'LOCKED_OSI'`,
    [userId],
  )
}

/**
 * Anula el OTP vigente (expirado, agotado o reutilizado). Exige que el hash
 * siga siendo el leido: si el OSI emitio otro token en paralelo, no se borra.
 */
async function invalidateUnlockToken(userId, expectedHash) {
  await query(
    `UPDATE users
        SET unlock_token = NULL, unlock_token_expires_at = NULL,
            unlock_token_used = TRUE, unlock_token_attempts = 0
      WHERE id = ? AND unlock_token = ?`,
    [userId, expectedHash],
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
            u.lock_count, u.password_updated_at, u.must_change_password,
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

  // La baja logica y el bloqueo se evaluan ANTES del CAPTCHA: una cuenta
  // inhabilitada responde siempre con su estado (cuenta regresiva o LOCKED_OSI)
  // y un CAPTCHA ausente no incrementa failed_attempts sobre una cuenta bloqueada.

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
  //    El bloqueo indefinido (LOCKED_OSI, locked_until = NULL) nunca se libera
  //    aqui: sin esta rama, remainingSecondsFrom() daria 0 y la cuenta se abriria.
  if (user.is_locked || user.status === 'LOCKED_OSI') {
    if (user.status === 'LOCKED_OSI') {
      record('AUTH_LOCKED', {
        userCode: user.user_code,
        req,
        details: { reason: 'intento_sobre_bloqueo_indefinido', requiresOsi: true, ip },
      })
      return res.status(401).json({
        message: LOCK_OSI_MESSAGE,
        error: LOCK_OSI_MESSAGE,
        isLocked: true,
        locked: true,
        requiresOsi: true,
        remainingSeconds: null,
        failedAttempts: Number(user.failed_attempts),
        maxAttempts: MAX_FAILED_ATTEMPTS,
        showCaptcha: false,
        details: { isLocked: true, requiresOsi: true, remainingSeconds: null },
      })
    }

    const remainingSeconds = remainingSecondsFrom(user.locked_until, user.remaining_seconds)

    if (remainingSeconds > 0) {
      record('AUTH_LOCKED', {
        userCode: user.user_code,
        req,
        details: { reason: 'intento_sobre_cuenta_bloqueada', remainingSeconds, ip },
      })
    return res.status(401).json({
       message: LOCK_MESSAGE,
       error: LOCK_MESSAGE,
       isLocked: true,
       requiresOsi: false,
       remainingSeconds,
       locked: true,
       failedAttempts: Number(user.failed_attempts),
       maxAttempts: MAX_FAILED_ATTEMPTS,
       showCaptcha: false,
       details: { isLocked: true, remainingSeconds, locked: true, failedAttempts: Number(user.failed_attempts) },
    })
    }

    await releaseExpiredLock(user.id)
    // El estado en memoria se alinea con la fila liberada: sin esto el contador
    // previo exigiria CAPTCHA y contaria un fallo inexistente tras el vencimiento.
    user.is_locked = false
    user.failed_attempts = 0
    user.status = 'ACTIVE'
    user.locked_until = null
    user.remaining_seconds = null
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

  const matches = await bcrypt.compare(password, user.password_hash)

  // 2. Clave incorrecta -> incrementar failed_attempts en 1.
  // Nota: MySQL evalua los SET de izquierda a derecha y cada asignacion ve el
  // valor ya actualizado de las anteriores. Por eso lock_count y failed_attempts
  // se incrementan AL FINAL: todos los CASE previos leen los valores originales
  // y `failed_attempts + 1` / `lock_count + 1` son los valores resultantes.
  // Backoff: 1.er bloqueo -> LOCK_MINUTES; siguientes -> LOCK_MINUTES_SECOND;
  // al llegar a LOCK_HARD_THRESHOLD -> locked_until NULL y status LOCKED_OSI.
  if (!matches) {
    await query(
      `UPDATE users
          SET locked_at    = CASE WHEN failed_attempts + 1 >= ? THEN now() ELSE locked_at END,
              locked_until = CASE
                               WHEN failed_attempts + 1 < ? THEN locked_until
                               WHEN lock_count + 1 = 1 THEN DATE_ADD(now(), INTERVAL ? MINUTE)
                               WHEN lock_count + 1 < ? THEN DATE_ADD(now(), INTERVAL ? MINUTE)
                               ELSE NULL
                             END,
              status       = CASE
                               WHEN failed_attempts + 1 < ? THEN status
                               WHEN lock_count + 1 >= ? THEN 'LOCKED_OSI'
                               ELSE 'LOCKED'
                             END,
              is_locked    = CASE WHEN failed_attempts + 1 >= ? THEN TRUE ELSE is_locked END,
              lock_count   = CASE WHEN failed_attempts + 1 >= ? THEN lock_count + 1 ELSE lock_count END,
              failed_attempts = failed_attempts + 1
        WHERE id = ?`,
      [
        MAX_FAILED_ATTEMPTS, // locked_at: umbral alcanzado
        MAX_FAILED_ATTEMPTS, // locked_until: aun bajo el umbral
        LOCK_MINUTES, // locked_until: 1.er bloqueo
        LOCK_HARD_THRESHOLD, // locked_until: bloqueo temporal mientras no se alcance el umbral duro
        LOCK_MINUTES_SECOND, // locked_until: bloqueos siguientes
        MAX_FAILED_ATTEMPTS, // status: aun bajo el umbral
        LOCK_HARD_THRESHOLD, // status: bloqueo indefinido
        MAX_FAILED_ATTEMPTS, // is_locked
        MAX_FAILED_ATTEMPTS, // lock_count
        user.id,
      ],
    )
    const updated = await one(
      `SELECT failed_attempts, is_locked, status, lock_count, locked_until,
              TIMESTAMPDIFF(SECOND, NOW(), locked_until) AS remaining_seconds
         FROM users WHERE id = ?`,
      [user.id],
    )
    const failedAttempts = Number(updated.failed_attempts)
    const lockedNow = Boolean(updated.is_locked)
    const requiresOsi = lockedNow && updated.status === 'LOCKED_OSI'
    let remainingSeconds = 0
    if (requiresOsi) remainingSeconds = null
    else if (lockedNow) remainingSeconds = Math.max(0, Number(updated.remaining_seconds ?? LOCK_MINUTES * 60))
    const lockMessage = requiresOsi ? LOCK_OSI_MESSAGE : LOCK_MESSAGE

    // 3. Al alcanzar el umbral -> cuenta bloqueada + evento LOGIN_LOCKED en bitacora
    //    y aviso al titular (ISO 27001 A.5.26), que puede detectar un ataque ajeno.
    if (lockedNow) {
      record('LOGIN_LOCKED', {
        userCode: user.user_code,
        req,
        details: {
          failedAttempts,
          threshold: MAX_FAILED_ATTEMPTS,
          remainingSeconds,
          lockCount: Number(updated.lock_count),
          requiresOsi,
          ip,
        },
      })
      await notifyUser(user.id, NOTICE.LOCKED(ip))
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
       message: lockedNow ? lockMessage : 'Credencial inválida',
       error: lockedNow ? lockMessage : 'Credencial inválida',
       failedAttempts,
       maxAttempts: MAX_FAILED_ATTEMPTS,
       locked: lockedNow,
       isLocked: lockedNow,
       requiresOsi,
       remainingSeconds,
       showCaptcha: !lockedNow && failedAttempts >= CAPTCHA_THRESHOLD,
       details: { failedAttempts, maxAttempts: MAX_FAILED_ATTEMPTS, locked: lockedNow, isLocked: lockedNow, requiresOsi, remainingSeconds },
    })
  }

  // 4. Credencial correcta -> reinicia los contadores (tambien los bloqueos
  //    consecutivos del backoff) y emite sesion.
  await withTransaction(async (client) => {
    await client.query(
      `UPDATE users
          SET failed_attempts = 0, lock_count = 0, is_locked = FALSE, status = 'ACTIVE',
              locked_at = NULL, locked_until = NULL
        WHERE id = ?`,
      [user.id],
    )
  })

  const permissions = await loadPermissions(user.id)
  const accessToken = signAccessToken(user, permissions)
  const refreshToken = signRefreshToken(user)
  const mustChangePassword = Boolean(user.must_change_password)

  record('AUTH_SUCCESS', {
    userCode: user.user_code,
    req,
    details: { role: user.role_code, permissions: permissions.length, ip },
  })
  // Evidencia de que la sesion quedo restringida al cambio de la clave inicial.
  if (mustChangePassword) {
    record('PASSWORD_CHANGE_REQUIRED', {
      userCode: user.user_code,
      req,
      details: { reason: 'clave_inicial_pendiente', ip },
    })
  }

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
      mustChangePassword,
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
    return res.json({ isLocked: false, requiresOsi: false, remainingSeconds: 0, failedAttempts: 0 })
  }

  const user = await one(
    `SELECT id, failed_attempts, is_locked, status, locked_until,
            TIMESTAMPDIFF(SECOND, NOW(), locked_until) AS remaining_seconds
       FROM users
      WHERE username = ? OR email = ? OR user_code = ?`,
    [identifier.toLowerCase(), sanitizeEmail(identifier), normalizeUserCode(identifier) ?? identifier],
  )

  // Bloqueo indefinido: locked_until es NULL, asi que no hay cuenta regresiva y
  // la cuenta NO se libera sola (solo la levanta el OSI o un OTP valido).
  if (user && user.status === 'LOCKED_OSI') {
    return res.json({
      isLocked: true,
      requiresOsi: true,
      remainingSeconds: null,
      failedAttempts: Number(user.failed_attempts),
      message: LOCK_OSI_MESSAGE,
    })
  }

  if (!user || !user.is_locked) {
    return res.json({
      isLocked: false,
      requiresOsi: false,
      remainingSeconds: 0,
      failedAttempts: Number(user?.failed_attempts ?? 0),
    })
  }

  const remainingSeconds = remainingSecondsFrom(user.locked_until, user.remaining_seconds)
  if (remainingSeconds <= 0) {
    await releaseExpiredLock(user.id)
    return res.json({ isLocked: false, requiresOsi: false, remainingSeconds: 0, failedAttempts: 0 })
  }

   return res.json({
     isLocked: true,
     requiresOsi: false,
     remainingSeconds,
     failedAttempts: Number(user.failed_attempts),
     message: LOCK_MESSAGE,
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
    'SELECT id, user_code, is_locked, is_active, failed_attempts FROM users WHERE user_code = ?',
    [target],
  )
  if (!user) throw notFound(`No existe el User ID ${target}`)
  // Una baja logica no se revierte desde aqui: desbloquear no equivale a reactivar.
  if (!user.is_active) throw conflict('La cuenta esta desactivada; reactivela antes de desbloquearla')

  // Desbloqueo sin tocar la clave: el OSI nunca conoce ni sustituye la
  // credencial del titular (secreto profesional / menor privilegio).
  await withTransaction(async (client) => {
    await client.query(
      `UPDATE users
          SET is_locked = FALSE, status = 'ACTIVE', failed_attempts = 0, lock_count = 0,
              locked_at = NULL, locked_until = NULL,
              unlock_token = NULL, unlock_token_expires_at = NULL, unlock_token_used = FALSE,
              unlock_token_attempts = 0
        WHERE id = ?`,
      [user.id],
    )
  })

  await notifyUser(user.id, NOTICE.UNLOCKED_BY_OSI())
  record('AUTH_UNLOCK', {
    userCode: actor.user_code,
    req,
    details: { target: user.user_code, previousAttempts: user.failed_attempts, method: 'auth_unlock_endpoint' },
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
      mustChangePassword: Boolean(result.user.must_change_password),
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
      mustChangePassword: Boolean(req.user.must_change_password),
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

/**
 * Desbloqueo por OTP conservando la clave del titular.
 *   · Respuesta uniforme (CWE-204): todo rechazo es el mismo 401; el motivo real
 *     solo queda en security_logs. Solo la entrada malformada responde 400.
 *   · Limite por cuenta (CWE-307 / CWE-362): el intento se reserva con un UPDATE
 *     condicional ANTES de comparar, asi N peticiones paralelas no superan el tope.
 *   · HMAC + comparacion en tiempo constante (CWE-208) y consumo atomico de un
 *     solo uso: solo gana la peticion que aun ve el mismo hash.
 * Nunca se registra el OTP ni su hash.
 */
async function verifyUnlockToken(req, res) {
  const token = String(req.body?.token ?? '').trim()
  const identifier = normalizeLoginIdentifier(req.body?.userCode ?? req.body?.identifier ?? req.body?.email)
  const ip = getClientIp(req)

  if (!identifier || !OTP_PATTERN.test(token)) {
    throw badRequest('Debe enviar el User ID y un token de 6 digitos')
  }

  const user = await one(
    `SELECT id, user_code, is_active, unlock_token, unlock_token_expires_at,
            unlock_token_used, unlock_token_attempts
       FROM users WHERE username = ? OR email = ? OR user_code = ?`,
    [identifier.toLowerCase(), sanitizeEmail(identifier), normalizeUserCode(identifier) ?? identifier],
  )

  const reject = (action, reason, extra = {}) => {
    record(action, { userCode: user?.user_code ?? null, req, details: { reason, ip, ...extra } })
    return unauthorized(UNLOCK_TOKEN_REJECTED)
  }

  if (!user) {
    hashOtp(0, token) // iguala el costo de la respuesta
    throw reject('UNLOCK_TOKEN_FAILED', 'usuario_inexistente', { identifier })
  }
  if (!user.is_active) throw reject('UNLOCK_TOKEN_FAILED', 'cuenta_inactiva')
  if (!user.unlock_token || user.unlock_token_used) {
    throw reject('UNLOCK_TOKEN_REUSE_ATTEMPT', 'sin_token')
  }
  if (!user.unlock_token_expires_at || new Date(user.unlock_token_expires_at) < new Date()) {
    await invalidateUnlockToken(user.id, user.unlock_token)
    throw reject('UNLOCK_TOKEN_EXPIRED_ATTEMPT', 'expirado')
  }

  // Reserva atomica del intento ANTES de comparar. El UPDATE condicional y la
  // lectura del contador van en la misma transaccion: el bloqueo de fila que
  // toma el UPDATE impide que otra peticion lo modifique hasta el COMMIT, asi
  // que el numero leido es exactamente el reservado por ESTA peticion aunque
  // lleguen en paralelo (el valor leido antes de reservar puede estar obsoleto).
  // La comparacion del HMAC queda fuera para no alargar el bloqueo.
  const attempt = await withTransaction(async (client) => {
    const reserved = await client.query(
      `UPDATE users SET unlock_token_attempts = unlock_token_attempts + 1
        WHERE id = ? AND unlock_token = ? AND unlock_token_attempts < ?`,
      [user.id, user.unlock_token, MAX_OTP_ATTEMPTS],
    )
    if (reserved.affectedRows !== 1) return null
    const { rows: current } = await client.query(
      'SELECT unlock_token_attempts AS attempt FROM users WHERE id = ?',
      [user.id],
    )
    return Number(current[0].attempt)
  })
  if (attempt === null) {
    await invalidateUnlockToken(user.id, user.unlock_token)
    throw reject('UNLOCK_TOKEN_EXHAUSTED', 'limite_alcanzado', { maxAttempts: MAX_OTP_ATTEMPTS })
  }

  // HMAC ligado al user_id + comparacion en tiempo constante.
  if (!otpMatches(user.id, token, user.unlock_token)) {
    if (attempt >= MAX_OTP_ATTEMPTS) {
      await invalidateUnlockToken(user.id, user.unlock_token)
      throw reject('UNLOCK_TOKEN_EXHAUSTED', 'limite_alcanzado', { attempt, maxAttempts: MAX_OTP_ATTEMPTS })
    }
    throw reject('UNLOCK_TOKEN_FAILED', 'token_incorrecto', { attempt, maxAttempts: MAX_OTP_ATTEMPTS })
  }

  // Consumo atomico de un solo uso: solo gana la peticion que aun ve el mismo hash.
  // La clave del titular no se toca; se reinicia tambien el backoff.
  const consumed = await query(
    `UPDATE users
        SET is_locked = FALSE, status = 'ACTIVE', failed_attempts = 0, lock_count = 0,
            locked_at = NULL, locked_until = NULL,
            unlock_token = NULL, unlock_token_expires_at = NULL,
            unlock_token_used = TRUE, unlock_token_attempts = 0
      WHERE id = ? AND unlock_token = ?`,
    [user.id, user.unlock_token],
  )
  if (consumed.affectedRows === 0) throw reject('UNLOCK_TOKEN_REUSE_ATTEMPT', 'consumo_concurrente')

  await notifyUser(user.id, NOTICE.UNLOCKED_BY_TOKEN())
  record('ACCOUNT_UNLOCKED_VIA_TOKEN', { userCode: user.user_code, req, details: { ip, attempt } })

  // Sin datos del usuario: la respuesta no confirma nada mas que el desbloqueo.
  res.json({ message: 'Cuenta desbloqueada. Inicie sesion con su contrasena habitual' })
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
  LOCK_MINUTES_SECOND,
  LOCK_HARD_THRESHOLD,
  BCRYPT_ROUNDS,
  CAPTCHA_THRESHOLD,
}