'use strict'

/**
 * Criptografia del token OTP de desbloqueo.
 *   · generateOtp   CSPRNG de 6 digitos
 *   · hashOtp       HMAC-SHA256(secret, `${userId}:${otp}`) en hex (64 chars)
 *   · otpMatches    comparacion en tiempo constante
 * El OTP en claro nunca se persiste ni se registra.
 */

const crypto = require('crypto')

const OTP_TTL_MINUTES = Number(process.env.UNLOCK_TOKEN_TTL_MINUTES || 15)
const MAX_OTP_ATTEMPTS = Number(process.env.UNLOCK_TOKEN_MAX_ATTEMPTS || 5)
const MAX_OTP_ISSUES_PER_HOUR = Number(process.env.UNLOCK_TOKEN_MAX_ISSUES_PER_HOUR || 3)
const OTP_PATTERN = /^\d{6}$/

function secret() {
  // Secreto propio y obligatorio: no se reutiliza JWT_SECRET para que una fuga de
  // una clave no comprometa la otra, y se rechaza el valor de ejemplo sin cambiar.
  const value = process.env.UNLOCK_TOKEN_SECRET
  if (!value || value.length < 32 || value.startsWith('reemplazar_por_')) {
    throw new Error('Configure UNLOCK_TOKEN_SECRET en back/.env con un valor aleatorio de al menos 32 caracteres')
  }
  // Separacion de claves (ISO 27002 8.24): si coincide con un secreto JWT, la fuga
  // de ese secreto permitiria tambien revertir offline los OTP guardados en la BD.
  if (value === process.env.JWT_SECRET || value === process.env.JWT_REFRESH_SECRET) {
    throw new Error('UNLOCK_TOKEN_SECRET debe ser distinto de JWT_SECRET y de JWT_REFRESH_SECRET')
  }
  return value
}

/**
 * Valida el secreto del HMAC al arrancar (fallo seguro): con una configuracion
 * invalida el servidor no inicia, en lugar de fallar en el primer desbloqueo.
 */
function assertUnlockSecretConfigured() {
  secret()
}

/** OTP de 6 digitos con CSPRNG del sistema operativo (espacio completo 000000-999999). */
function generateOtp() {
  return crypto.randomInt(0, 1000000).toString().padStart(6, '0')
}

function hashOtp(userId, otp) {
  return crypto.createHmac('sha256', secret()).update(`${userId}:${otp}`).digest('hex')
}

function otpMatches(userId, otp, storedHex) {
  const provided = Buffer.from(hashOtp(userId, otp), 'hex')
  const stored = Buffer.from(typeof storedHex === 'string' ? storedHex : '', 'hex')
  if (stored.length !== provided.length) {
    // Se ejecuta igualmente una comparacion para no filtrar por tiempo.
    crypto.timingSafeEqual(provided, provided)
    return false
  }
  return crypto.timingSafeEqual(stored, provided)
}

module.exports = {
  assertUnlockSecretConfigured,
  generateOtp,
  hashOtp,
  otpMatches,
  OTP_PATTERN,
  OTP_TTL_MINUTES,
  MAX_OTP_ATTEMPTS,
  MAX_OTP_ISSUES_PER_HOUR,
}
