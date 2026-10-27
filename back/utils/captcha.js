'use strict'

/**
 * CAPTCHA aritmetico emitido y validado en el servidor.
 *   · issueChallenge   genera la pregunta y un token firmado con HMAC que NO
 *                      contiene la respuesta en claro: sin el secreto del
 *                      servidor el cliente no puede fabricar un token valido.
 *   · verifyChallenge  comprueba vencimiento, firma (tiempo constante) y
 *                      respuesta. Cada token se acepta una sola vez (anti
 *                      replay), tenga la respuesta correcta o no, para que
 *                      no se pueda adivinar sobre un mismo desafio.
 * Los tokens usados se guardan en memoria hasta su vencimiento.
 */

const crypto = require('crypto')

const CAPTCHA_TTL_SECONDS = Number(process.env.CAPTCHA_TTL_SECONDS || 120)

const usedTokens = new Map()

function key() {
  // Clave derivada con etiqueta propia: la fuga de una firma de CAPTCHA no
  // expone el secreto JWT (separacion de claves, ISO 27002 8.24).
  const base = process.env.JWT_SECRET
  if (!base) throw new Error('Configure JWT_SECRET en back/.env')
  return crypto.createHmac('sha256', base).update('captcha-v1').digest()
}

function sign(id, expiresAt, answer) {
  return crypto.createHmac('sha256', key()).update(`${id}:${expiresAt}:${answer}`).digest('hex')
}

function purgeExpired(now) {
  for (const [token, expiresAt] of usedTokens) {
    if (expiresAt <= now) usedTokens.delete(token)
  }
}

/** Devuelve { token, question, expiresIn } sin revelar la respuesta. */
function issueChallenge() {
  const a = crypto.randomInt(1, 10)
  const b = crypto.randomInt(1, 10)
  const id = crypto.randomBytes(12).toString('hex')
  const expiresAt = Date.now() + CAPTCHA_TTL_SECONDS * 1000
  const token = `${id}.${expiresAt}.${sign(id, expiresAt, a + b)}`
  return { token, question: `${a} + ${b}`, expiresIn: CAPTCHA_TTL_SECONDS }
}

/** true solo si el token es autentico, vigente, no usado y la respuesta coincide. */
function verifyChallenge(token, response) {
  const parts = String(token ?? '').split('.')
  if (parts.length !== 3) return false
  const [id, expiresRaw, signature] = parts
  const expiresAt = Number(expiresRaw)
  const now = Date.now()
  if (!/^[a-f0-9]{24}$/.test(id) || !Number.isFinite(expiresAt) || expiresAt <= now) return false
  // Tope al vencimiento declarado: un token falsificado con fecha lejana no
  // puede llenar la memoria de tokens usados.
  if (expiresAt > now + CAPTCHA_TTL_SECONDS * 1000) return false
  if (usedTokens.has(token)) return false

  const answer = String(response ?? '').trim()
  if (!/^\d{1,3}$/.test(answer)) return false

  const expected = Buffer.from(sign(id, expiresAt, Number(answer)), 'hex')
  const provided = Buffer.from(/^[a-f0-9]{64}$/.test(signature) ? signature : '', 'hex')
  // Un token con firma mal formada nunca llega a consumirse.
  if (provided.length !== expected.length) return false

  const valid = crypto.timingSafeEqual(expected, provided)
  // Se consume solo si la firma coincide con la respuesta dada; si fallo la
  // respuesta, el token queda quemado para evitar adivinar sobre el mismo.
  purgeExpired(now)
  usedTokens.set(token, expiresAt)
  return valid
}

module.exports = { issueChallenge, verifyChallenge, CAPTCHA_TTL_SECONDS }
