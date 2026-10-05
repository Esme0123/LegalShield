'use strict'

/**
 * Politica de contrasenas (ISO/IEC 27002 9.1.1 / NIST 800-63B):
 * minimo 12 caracteres, mayuscula, minuscula, digito, simbolo y sin
 * secuencias triviales ni caracteres repetidos.
 */

const PASSWORD_MIN_LENGTH = Number(process.env.PASSWORD_MIN_LENGTH || 12)
const PASSWORD_HISTORY_LIMIT = Number(process.env.PASSWORD_HISTORY_LIMIT || 5)

const RULES = [
  {
    id: 'length',
    label: `Minimo ${PASSWORD_MIN_LENGTH} caracteres`,
    test: (v) => v.length >= PASSWORD_MIN_LENGTH,
  },
  { id: 'uppercase', label: 'Al menos una letra mayuscula', test: (v) => /[A-Z]/.test(v) },
  { id: 'lowercase', label: 'Al menos una letra minuscula', test: (v) => /[a-z]/.test(v) },
  { id: 'number', label: 'Al menos un digito', test: (v) => /\d/.test(v) },
  { id: 'symbol', label: 'Al menos un simbolo (!@#$%...)', test: (v) => /[^\w\s]/.test(v) },
  {
    id: 'not-sequential',
    label: 'Sin secuencias triviales (1234, abcd, qwerty)',
    test: (v) => !/(0123|1234|2345|3456|4567|abcd|qwer|asdf)/i.test(v),
  },
  {
    id: 'not-repeated',
    label: 'Sin un mismo caracter repetido 4+ veces',
    test: (v) => !/(.)\1{3,}/.test(v),
  },
]

/**
 * Evalua la politica y devuelve `{ valid, score, label, failed }`.
 * `score` va de 0 a 4 y alimenta el medidor visual de /register.
 */
function evaluatePassword(password) {
  const value = String(password ?? '')
  const failed = RULES.filter((rule) => !rule.test(value)).map((rule) => rule.id)

  let score = 0
  if (value.length >= PASSWORD_MIN_LENGTH) score += 1
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score += 1
  if (/\d/.test(value)) score += 1
  if (/[^\w\s]/.test(value)) score += 1

  const labels = ['Muy debil', 'Debil', 'Aceptable', 'Fuerte', 'Excelente']

  return { valid: failed.length === 0, score, label: labels[score], failed, rules: RULES }
}

/** Atajo booleano para validar en los controllers. */
function isPasswordValid(password) {
  return evaluatePassword(password).valid
}

module.exports = {
  evaluatePassword,
  isPasswordValid,
  PASSWORD_MIN_LENGTH,
  PASSWORD_HISTORY_LIMIT,
}