'use strict'

/**
 * Contador de intentos para identificadores que NO existen en el directorio.
 *
 * El login debe responder igual (codigo, mensaje y cuerpo) ante un usuario
 * inexistente y ante una clave incorrecta (CWE-204, enumeracion de cuentas).
 * Como el frontend pinta el contador, el CAPTCHA y el bloqueo con los campos
 * de la respuesta, un identificador inexistente lleva aqui el mismo avance que
 * una cuenta real: fallos, CAPTCHA desde el primero, bloqueo temporal al
 * umbral y bloqueo indefinido tras la reincidencia.
 *
 * El estado vive en memoria con tope de entradas y vencimiento: no se escribe
 * nada en la base ni se reserva espacio para identificadores arbitrarios.
 */

const MAX_ENTRIES = Number(process.env.GHOST_ATTEMPTS_MAX_ENTRIES || 5000)
const STATE_TTL_MS = 24 * 60 * 60 * 1000

const states = new Map()

function prune(now) {
  for (const [key, state] of states) {
    if (state.expiresAt <= now) states.delete(key)
  }
  // Map conserva el orden de insercion: se descartan los mas antiguos.
  while (states.size > MAX_ENTRIES) {
    states.delete(states.keys().next().value)
  }
}

function load(key, now) {
  const state = states.get(key)
  if (!state || state.expiresAt <= now) return { failed: 0, lockCount: 0, lockedUntil: null, requiresOsi: false }
  // Un bloqueo temporal vencido libera el contador, igual que en las cuentas reales.
  if (!state.requiresOsi && state.lockedUntil && state.lockedUntil <= now) {
    state.failed = 0
    state.lockedUntil = null
  }
  return state
}

/** Estado actual: { failed, locked, requiresOsi, remainingSeconds }. */
function peek(key, now = Date.now()) {
  const state = load(key, now)
  const locked = state.requiresOsi || Boolean(state.lockedUntil)
  return {
    failed: state.failed,
    locked,
    requiresOsi: state.requiresOsi,
    remainingSeconds: state.requiresOsi
      ? null
      : locked ? Math.max(0, Math.ceil((state.lockedUntil - now) / 1000)) : 0,
  }
}

/** Suma un fallo sin evaluar el bloqueo (equivale al CAPTCHA invalido). */
function addFailure(key, now = Date.now()) {
  const state = load(key, now)
  state.failed += 1
  state.expiresAt = now + STATE_TTL_MS
  states.delete(key)
  states.set(key, state)
  prune(now)
}

/**
 * Registra una clave incorrecta aplicando el mismo backoff que las cuentas
 * reales: umbral -> LOCK_MINUTES, siguientes -> LOCK_MINUTES_SECOND y, al llegar
 * a LOCK_HARD_THRESHOLD bloqueos, bloqueo indefinido.
 */
function registerFailure(key, policy, now = Date.now()) {
  const state = load(key, now)
  state.failed += 1
  if (state.failed >= policy.maxAttempts) {
    state.lockCount += 1
    if (state.lockCount >= policy.hardThreshold) {
      state.requiresOsi = true
      state.lockedUntil = null
    } else {
      const minutes = state.lockCount === 1 ? policy.lockMinutes : policy.lockMinutesSecond
      state.lockedUntil = now + minutes * 60 * 1000
    }
  }
  state.expiresAt = now + STATE_TTL_MS
  states.delete(key)
  states.set(key, state)
  prune(now)
  return peek(key, now)
}

module.exports = { peek, addFailure, registerFailure }
