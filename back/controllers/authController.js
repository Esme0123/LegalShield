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
const { hashOtp, otpMatches, OTP_PATTERN, MAX_OTP_ATTEMPTS, MAX_RESET_ATTEMPTS } = require('../utils/unlockToken')
const { assertPasswordNotReused, pushPasswordHistory } = require('../utils/passwordHistory')
const { getClientIp } = require('../utils/helpers')
const { setRefreshCookie, clearRefreshCookie, readRefreshCookie } = require('../utils/refreshCookie')
const { issueChallenge, verifyChallenge } = require('../utils/captcha')
const ghostAttempts = require('../utils/ghostAttempts')
const { badRequest, conflict, forbidden, notFound, unauthorized, unprocessable } = require('../utils/errors')
const { evaluatePassword, PASSWORD_HISTORY_LIMIT, PASSWORD_MAX_AGE_DAYS } = require('../utils/passwordPolicy')
const {
  USER_CODE_RE,
  USER_CODE_CI_RE,
  USERNAME_RE,
  normalizeUserCode,
  normalizeLoginIdentifier,
  sanitizeEmail,
} = require('../utils/identity')

const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || 12)
const MAX_FAILED_ATTEMPTS = Number(process.env.MAX_FAILED_ATTEMPTS || 3)
/**
 * Bloqueo progresivo (backoff, NIST 800-63B 5.2.2): el 1.er bloqueo dura
 * LOCK_MINUTES, los siguientes LOCK_MINUTES_SECOND y, al llegar a
 * LOCK_HARD_THRESHOLD bloqueos consecutivos sin login exitoso, el bloqueo es
 * indefinido (status LOCKED_OSI) y solo lo levanta el Oficial de Seguridad.
 * El OSI esta exento (ver isLockExempt): es quien desbloquea a los demas.
 */
const LOCK_MINUTES = Number(process.env.LOCK_MINUTES || 1)
const LOCK_MINUTES_SECOND = Number(process.env.LOCK_MINUTES_SECOND || 1)
const LOCK_HARD_THRESHOLD = Number(process.env.LOCK_HARD_THRESHOLD || 3)
const LOCK_MESSAGE = '3 de 3 - Cuenta inhabilitada temporalmente'
const LOCK_OSI_MESSAGE = 'Cuenta bloqueada por reincidencia. Requiere desbloqueo del Oficial de Seguridad'
/** Unico mensaje para todo rechazo del OTP: el motivo real solo va a security_logs. */
const UNLOCK_TOKEN_REJECTED = 'Token de desbloqueo invalido, expirado o agotado. Solicite uno nuevo al Oficial de Seguridad'
/** Unico mensaje para todo rechazo del token de reinicio: el motivo real solo va a security_logs. */
const RESET_TOKEN_REJECTED = 'Token de reinicio invalido, expirado o agotado. Solicite uno nuevo al Oficial de Seguridad'
const CAPTCHA_THRESHOLD = Number(process.env.CAPTCHA_THRESHOLD || 1)

/**
 * Cuerpos de respuesta compartidos por cuentas reales e identificadores
 * inexistentes: usar el mismo constructor garantiza que ambos casos respondan
 * identico (CWE-204, enumeracion de cuentas).
 */
function lockedBody({ requiresOsi, remainingSeconds, failedAttempts }) {
  if (requiresOsi) {
    return {
      message: LOCK_OSI_MESSAGE,
      error: LOCK_OSI_MESSAGE,
      isLocked: true,
      locked: true,
      requiresOsi: true,
      remainingSeconds: null,
      failedAttempts,
      maxAttempts: MAX_FAILED_ATTEMPTS,
      showCaptcha: false,
      details: { isLocked: true, requiresOsi: true, remainingSeconds: null },
    }
  }
  return {
    message: LOCK_MESSAGE,
    error: LOCK_MESSAGE,
    isLocked: true,
    requiresOsi: false,
    remainingSeconds,
    locked: true,
    failedAttempts,
    maxAttempts: MAX_FAILED_ATTEMPTS,
    showCaptcha: false,
    details: { isLocked: true, remainingSeconds, locked: true, failedAttempts },
  }
}

function failureBody({ failedAttempts, lockedNow, requiresOsi, remainingSeconds, lockExempt = false }) {
  const lockMessage = requiresOsi ? LOCK_OSI_MESSAGE : LOCK_MESSAGE
  return {
    // Solo se anexa cuando la cuenta exenta supera el umbral: hasta ahi la
    // respuesta es identica a la de cualquier cuenta (no revela el rol antes).
    ...(lockExempt ? { lockExempt: true } : {}),
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
  }
}

/** Politica de backoff que el contador de identificadores inexistentes replica. */
const GHOST_POLICY = {
  maxAttempts: MAX_FAILED_ATTEMPTS,
  hardThreshold: LOCK_HARD_THRESHOLD,
  lockMinutes: LOCK_MINUTES,
  lockMinutesSecond: LOCK_MINUTES_SECOND,
}

/** Hash de relleno: iguala el costo de bcrypt cuando el usuario no existe (CWE-208). */
const DUMMY_HASH = bcrypt.hashSync('relleno-sin-usuario', BCRYPT_ROUNDS)

/** Anula el token de reinicio vigente (vencido o agotado) solo si sigue siendo el leido. */
async function invalidateResetToken(userId, expectedHash) {
  await query(
    `UPDATE users
        SET reset_token = NULL, reset_token_expires_at = NULL,
            reset_token_used = TRUE, reset_token_attempts = 0
      WHERE id = ? AND reset_token = ?`,
    [userId, expectedHash],
  )
}

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
 * El Oficial de Seguridad es el unico que puede levantar un bloqueo indefinido:
 * si su propia cuenta se bloqueara, nadie podria desbloquearla. Por eso no se
 * bloquea nunca; a cambio, el CAPTCHA se exige en cada intento tras el primer
 * fallo hasta un login exitoso, y cada MAX_FAILED_ATTEMPTS fallos se le avisa.
 */
function isLockExempt(user) {
  return user?.role_code === 'osi'
}

/** Levanta cualquier bloqueo (incluido LOCKED_OSI) de una cuenta exenta. */
async function releaseExemptLock(userId) {
  await query(
    `UPDATE users
        SET is_locked = FALSE, status = 'ACTIVE', lock_count = 0,
            locked_at = NULL, locked_until = NULL
      WHERE id = ?`,
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

/**
 * Registro publico deshabilitado (menor privilegio, ISO 27001 A.5.16 / A.5.18):
 * el alta de cuentas es exclusiva del Oficial de Seguridad via POST /api/users,
 * que asigna el rol y una clave inicial de cambio obligatorio. Un auto-registro
 * permitiria a cualquiera crear una cuenta con rol privilegiado (p. ej. socio)
 * sin intervencion del OSI. No se escribe nada en users ni se consume el
 * correlativo del User ID; solo queda la evidencia del intento en security_logs.
 */
async function register(req, _res) {
  const details = { ip: getClientIp(req), path: req.originalUrl }
  // Solo datos de contexto saneados: nunca la contrasena ni el cuerpo completo.
  const requestedEmail = sanitizeEmail(req.body?.email)
  if (requestedEmail && requestedEmail.length <= 254) details.requestedEmail = requestedEmail
  const requestedRole = String(req.body?.role ?? '').trim().toLowerCase()
  if (/^[a-z_]{1,32}$/.test(requestedRole)) details.requestedRole = requestedRole

  record('REGISTRATION_BLOCKED', { userCode: null, req, details })
  throw forbidden('El alta de cuentas la realiza el Oficial de Seguridad de la Información')
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
            TIMESTAMPDIFF(SECOND, u.password_updated_at, NOW()) AS password_age_seconds,
            TIMESTAMPDIFF(SECOND, NOW(), u.locked_until) AS remaining_seconds,
            r.code AS role_code, r.name AS role_name
       FROM users u JOIN roles r ON r.id = u.role_id
      WHERE u.username = ? OR u.email = ? OR u.user_code = ?`,
    [identifier.toLowerCase(), sanitizeEmail(identifier), normalizeUserCode(identifier) ?? identifier],
  )

  // Respuesta uniforme para usuario inexistente, cuenta desactivada y clave
  // incorrecta: no revela que User IDs existen en el directorio (enumeracion de
  // cuentas). El identificador inexistente o desactivado sigue el mismo ciclo que
  // una cuenta real (contador, CAPTCHA y bloqueo) con un estado en memoria; el
  // motivo real solo queda en security_logs.
  const disabled = Boolean(user) && (!user.is_active || user.status === 'DISABLED')
  if (!user || disabled) {
    const reason = disabled ? 'usuario_desactivado' : 'usuario_no_existe'
    const auditCode = disabled ? user.user_code : identifier
    const ghostKey = identifier.toLowerCase()
    const state = ghostAttempts.peek(ghostKey)
    if (state.locked) {
      record('AUTH_LOCKED', {
        userCode: auditCode,
        req,
        details: { reason, remainingSeconds: state.remainingSeconds, ip },
      })
      return res.status(401).json(lockedBody({
        requiresOsi: state.requiresOsi,
        remainingSeconds: state.remainingSeconds,
        failedAttempts: state.failed,
      }))
    }
    if (state.failed >= CAPTCHA_THRESHOLD && !verifyChallenge(captchaToken, captchaResponse)) {
      ghostAttempts.addFailure(ghostKey)
      record('AUTH_FAILED', { userCode: auditCode, req, details: { reason, ip } })
      throw unauthorized('Validación CAPTCHA requerida o incorrecta')
    }
    await bcrypt.compare(password, DUMMY_HASH)
    const after = ghostAttempts.registerFailure(ghostKey, GHOST_POLICY)
    record(after.locked ? 'LOGIN_LOCKED' : (disabled ? 'AUTH_DISABLED' : 'AUTH_FAILED'), {
      userCode: auditCode,
      req,
      details: { reason, ip },
    })
    return res.status(401).json(failureBody({
      failedAttempts: after.failed,
      lockedNow: after.locked,
      requiresOsi: after.requiresOsi,
      remainingSeconds: after.remainingSeconds,
    }))
  }

  // El bloqueo se evalua ANTES del CAPTCHA: una cuenta inhabilitada responde
  // siempre con su estado (cuenta regresiva o LOCKED_OSI) y un CAPTCHA ausente no
  // incrementa failed_attempts sobre una cuenta bloqueada. La baja logica ya se
  // atendio arriba con la respuesta uniforme.

  // 0. Cuenta exenta (OSI): un bloqueo heredado de la politica anterior se
  //    levanta. failed_attempts se conserva para seguir exigiendo el CAPTCHA.
  const lockExempt = isLockExempt(user)
  if (lockExempt && (user.is_locked || user.status === 'LOCKED_OSI')) {
    await releaseExemptLock(user.id)
    user.is_locked = false
    user.status = 'ACTIVE'
    user.locked_until = null
    user.remaining_seconds = null
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
      return res.status(401).json(lockedBody({
        requiresOsi: true,
        remainingSeconds: null,
        failedAttempts: Number(user.failed_attempts),
      }))
    }

    const remainingSeconds = remainingSecondsFrom(user.locked_until, user.remaining_seconds)

    if (remainingSeconds > 0) {
      record('AUTH_LOCKED', {
        userCode: user.user_code,
        req,
        details: { reason: 'intento_sobre_cuenta_bloqueada', remainingSeconds, ip },
      })
      return res.status(401).json(lockedBody({
        requiresOsi: false,
        remainingSeconds,
        failedAttempts: Number(user.failed_attempts),
      }))
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
    // El desafio lo emite y firma el servidor (GET /auth/captcha): el cliente
    // solo devuelve el token recibido y su respuesta.
    if (!verifyChallenge(captchaToken, captchaResponse)) {
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
  // La cuenta exenta (OSI) solo suma el fallo: nunca se bloquea ni espera.
  if (!matches && lockExempt) {
    await query('UPDATE users SET failed_attempts = failed_attempts + 1 WHERE id = ?', [user.id])
    const updated = await one('SELECT failed_attempts FROM users WHERE id = ?', [user.id])
    const failedAttempts = Number(updated.failed_attempts)
    record('AUTH_FAILED', {
      userCode: user.user_code,
      req,
      details: { failedAttempts, lockExempt: true, ip },
    })
    // Aviso al titular cada MAX_FAILED_ATTEMPTS fallos: puede ser un ataque ajeno.
    if (failedAttempts % MAX_FAILED_ATTEMPTS === 0) {
      await notifyUser(user.id, NOTICE.PRIVILEGED_FAILURES(ip, failedAttempts))
    }
    return res.status(401).json(failureBody({
      failedAttempts,
      lockedNow: false,
      requiresOsi: false,
      remainingSeconds: 0,
      lockExempt: failedAttempts >= MAX_FAILED_ATTEMPTS,
    }))
  }

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
    return res.status(401).json(failureBody({ failedAttempts, lockedNow, requiresOsi, remainingSeconds }))
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
  let mustChangePassword = Boolean(user.must_change_password)

  // Caducidad de la clave (ISO 27001 A.5.17): al superar la edad maxima la sesion
  // queda limitada al cambio de clave; se persiste para que el middleware lo aplique.
  const passwordExpired = Number(user.password_age_seconds) > PASSWORD_MAX_AGE_DAYS * 86400
  if (passwordExpired && !mustChangePassword) {
    await query('UPDATE users SET must_change_password = TRUE WHERE id = ?', [user.id])
    mustChangePassword = true
  }

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
      details: { reason: passwordExpired ? 'clave_vencida' : 'clave_inicial_pendiente', ip },
    })
  }

  // El refresh token viaja solo en cookie HttpOnly: nunca en el cuerpo JSON.
  setRefreshCookie(res, refreshToken)
  res.json({
    message: 'Acceso concedido',
    token: accessToken,
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
/* GET /api/auth/captcha                                                       */
/* -------------------------------------------------------------------------- */

/** Emite un desafio aritmetico firmado por el servidor. */
async function captcha(_req, res) {
  res.set('Cache-Control', 'no-store')
  res.json(issueChallenge())
}

/* -------------------------------------------------------------------------- */
/* POST /api/auth/lock-status                                                 */
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
    `SELECT u.id, u.failed_attempts, u.is_locked, u.is_active, u.status, u.locked_until,
            TIMESTAMPDIFF(SECOND, NOW(), u.locked_until) AS remaining_seconds,
            r.code AS role_code
       FROM users u JOIN roles r ON r.id = u.role_id
      WHERE u.username = ? OR u.email = ? OR u.user_code = ?`,
    [identifier.toLowerCase(), sanitizeEmail(identifier), normalizeUserCode(identifier) ?? identifier],
  )

  // Identificador inexistente o cuenta desactivada: mismo estado simulado que usa el login.
  if (!user || !user.is_active || user.status === 'DISABLED') {
    const state = ghostAttempts.peek(identifier.toLowerCase())
    if (state.requiresOsi) {
      return res.json({ isLocked: true, requiresOsi: true, remainingSeconds: null, failedAttempts: state.failed, message: LOCK_OSI_MESSAGE })
    }
    if (state.locked) {
      return res.json({ isLocked: true, requiresOsi: false, remainingSeconds: state.remainingSeconds, failedAttempts: state.failed, message: LOCK_MESSAGE })
    }
    return res.json({ isLocked: false, requiresOsi: false, remainingSeconds: 0, failedAttempts: state.failed })
  }

  // Cuenta exenta (OSI): nunca reporta bloqueo; uno heredado se levanta aqui.
  if (isLockExempt(user)) {
    if (user.is_locked || user.status === 'LOCKED_OSI') await releaseExemptLock(user.id)
    return res.json({
      isLocked: false,
      requiresOsi: false,
      remainingSeconds: 0,
      failedAttempts: Number(user.failed_attempts),
    })
  }

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
  // Sin cookie, o con una invalida, el mismo 401: el cliente vuelve a /login.
  const refreshToken = readRefreshCookie(req)
  if (!refreshToken) throw unauthorized('Sesion no disponible')

  let result
  try {
    result = await rotateRefreshToken(refreshToken)
  } catch (error) {
    clearRefreshCookie(res)
    throw error
  }
  record('TOKEN_REFRESH', { userCode: result.user.user_code, req })

  setRefreshCookie(res, result.refreshToken)
  res.json({
    message: 'Sesion renovada',
    token: result.accessToken,
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
  // Sin sesion valida solo se borra la cookie: no se escribe en la bitacora.
  if (req.user) record('LOGOUT', { userCode: req.user.user_code, req })
  // El navegador no adjunta la cookie a esta ruta (Path de refresh): solo se borra.
  clearRefreshCookie(res)
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

/* -------------------------------------------------------------------------- */
/* POST /api/auth/reset-password                                                */
/* -------------------------------------------------------------------------- */

/**
 * Reinicio de clave con el token que emitio el OSI. El titular define la clave: el
 * OSI nunca la conoce.
 *   · Todo rechazo del token es el mismo 401 (CWE-204); el motivo real solo queda en
 *     security_logs. La politica de claves no depende del token y responde 422.
 *   · Limite de intentos por token reservado con UPDATE condicional (CWE-307/362) y
 *     HMAC con contexto "reset:" comparado en tiempo constante (CWE-208).
 *   · Una clave del historial responde 422 sin consumir el token ni el intento.
 *   · Al reiniciar tambien se levanta el bloqueo: quien olvido la clave suele estar
 *     bloqueado y el token ya prueba la intervencion del OSI.
 */
async function resetPassword(req, res) {
  const token = String(req.body?.token ?? '').trim()
  const newPassword = req.body?.newPassword
  const identifier = normalizeLoginIdentifier(req.body?.userCode ?? req.body?.identifier ?? req.body?.email)
  const ip = getClientIp(req)

  if (!identifier || !OTP_PATTERN.test(token) || typeof newPassword !== 'string' || newPassword.length === 0) {
    throw badRequest('Debe enviar el User ID, un token de 6 digitos y la nueva contrasena')
  }

  const policy = evaluatePassword(newPassword)
  if (!policy.valid) {
    throw unprocessable('La nueva contrasena no cumple la politica de seguridad', {
      failed: policy.failed,
      rules: policy.rules.map(({ id, label }) => ({ id, label })),
    })
  }

  const user = await one(
    `SELECT id, user_code, is_active, reset_token, reset_token_expires_at,
            reset_token_used, reset_token_attempts
       FROM users WHERE username = ? OR email = ? OR user_code = ?`,
    [identifier.toLowerCase(), sanitizeEmail(identifier), normalizeUserCode(identifier) ?? identifier],
  )

  const reject = (action, reason, extra = {}) => {
    record(action, { userCode: user?.user_code ?? null, req, details: { reason, ip, ...extra } })
    return unauthorized(RESET_TOKEN_REJECTED)
  }

  if (!user) {
    hashOtp(0, token, 'reset:') // iguala el costo de la respuesta
    throw reject('PASSWORD_RESET_FAILED', 'usuario_inexistente', { identifier })
  }
  if (!user.is_active) throw reject('PASSWORD_RESET_FAILED', 'cuenta_inactiva')
  if (!user.reset_token || user.reset_token_used) {
    throw reject('PASSWORD_RESET_FAILED', 'sin_token')
  }
  if (!user.reset_token_expires_at || new Date(user.reset_token_expires_at) < new Date()) {
    await invalidateResetToken(user.id, user.reset_token)
    throw reject('PASSWORD_RESET_FAILED', 'expirado')
  }

  // Reserva atomica del intento ANTES de comparar (misma tecnica que el OTP de desbloqueo).
  const attempt = await withTransaction(async (client) => {
    const reserved = await client.query(
      `UPDATE users SET reset_token_attempts = reset_token_attempts + 1
        WHERE id = ? AND reset_token = ? AND reset_token_attempts < ?`,
      [user.id, user.reset_token, MAX_RESET_ATTEMPTS],
    )
    if (reserved.affectedRows !== 1) return null
    const { rows: current } = await client.query(
      'SELECT reset_token_attempts AS attempt FROM users WHERE id = ?',
      [user.id],
    )
    return Number(current[0].attempt)
  })
  if (attempt === null) {
    await invalidateResetToken(user.id, user.reset_token)
    throw reject('PASSWORD_RESET_EXHAUSTED', 'limite_alcanzado', { maxAttempts: MAX_RESET_ATTEMPTS })
  }

  if (!otpMatches(user.id, token, user.reset_token, 'reset:')) {
    if (attempt >= MAX_RESET_ATTEMPTS) {
      await invalidateResetToken(user.id, user.reset_token)
      throw reject('PASSWORD_RESET_EXHAUSTED', 'limite_alcanzado', { attempt, maxAttempts: MAX_RESET_ATTEMPTS })
    }
    throw reject('PASSWORD_RESET_FAILED', 'token_incorrecto', { attempt, maxAttempts: MAX_RESET_ATTEMPTS })
  }

  // Token correcto: una clave repetida no quema el token ni el intento.
  try {
    await assertPasswordNotReused(user.id, newPassword)
  } catch (error) {
    await query(
      `UPDATE users SET reset_token_attempts = GREATEST(reset_token_attempts - 1, 0)
        WHERE id = ? AND reset_token = ?`,
      [user.id, user.reset_token],
    )
    record('PASSWORD_RESET_FAILED', { userCode: user.user_code, req, details: { reason: 'clave_reutilizada', ip } })
    throw error
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS)

  const consumed = await withTransaction(async (client) => {
    // Consumo atomico de un solo uso: solo gana la peticion que aun ve el mismo hash.
    const updated = await client.query(
      `UPDATE users
          SET password_hash = ?, password_updated_at = now(), must_change_password = FALSE,
              is_locked = FALSE, status = 'ACTIVE', failed_attempts = 0, lock_count = 0,
              locked_at = NULL, locked_until = NULL,
              unlock_token = NULL, unlock_token_expires_at = NULL,
              unlock_token_used = FALSE, unlock_token_attempts = 0,
              reset_token = NULL, reset_token_expires_at = NULL,
              reset_token_used = TRUE, reset_token_attempts = 0
        WHERE id = ? AND reset_token = ?`,
      [passwordHash, user.id, user.reset_token],
    )
    if (updated.affectedRows !== 1) return false
    await pushPasswordHistory(client, user.id, passwordHash)
    return true
  })
  if (!consumed) throw reject('PASSWORD_RESET_FAILED', 'consumo_concurrente')

  await notifyUser(user.id, NOTICE.PASSWORD_RESET_DONE(ip))
  record('PASSWORD_RESET', {
    userCode: user.user_code,
    req,
    details: { ip, attempt, historyLimit: PASSWORD_HISTORY_LIMIT },
  })

  res.json({ message: 'Contrasena restablecida. Inicie sesion con su nueva contrasena' })
}

  module.exports = {
  register,
  resetPassword,
  login,
  captcha,
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