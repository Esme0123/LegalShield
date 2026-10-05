'use strict'

/**
 * Normalizacion de identidad institucional:
 *   · User ID con formato LEG-AAAA-NNNN
 *   · generacion del correlativo sin colisiones bajo concurrencia
 *   · saneamiento de correo y nombre de usuario
 */

const { one } = require('../config/db')

const PREFIX = process.env.USER_CODE_PREFIX || 'LEG'
const YEAR = Number(process.env.USER_CODE_YEAR || new Date().getFullYear())

/** Patron del User ID: tres letras, guion, cuatro digitos, guion, cuatro digitos. */
const USER_CODE_RE = /^LEG-\d{4}-\d{4}$/

/** Deja el User ID en mayusculas y sin espacios; null si no cumple el patron. */
function normalizeUserCode(value) {
  const raw = String(value ?? '').trim().toUpperCase().replace(/\s+/g, '')
  return USER_CODE_RE.test(raw) ? raw : null
}

/** Explicita el formato sin revealar si un User ID existe. */
function describeUserCodePattern() {
  return `${PREFIX}-${YEAR}-NNNN`
}

/**
 * Emite el siguiente User ID correlativo.
 *
 * `MAX(...)` es una funcion de agregado y PostgreSQL no admite FOR UPDATE sobre
 * ella, ademas de que un MAX seguido de un INSERT deja una ventana de carrera
 * entre lecturas. La solucion es un bloqueo consultivo de transaction
 * (`pg_advisory_xact_lock`): serializa a los emisores concurrentes durante toda
 * la transaccion y funciona tambien con la tabla vacia, donde FOR UPDATE no
 * bloquearia ninguna fila. El lock se libera sola al hacer COMMIT o ROLLBACK.
 */
async function generateUserCode(client) {
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${PREFIX}-${YEAR}-correlative`])

  const { rows: result } = await client.query(
    `SELECT COALESCE(MAX(NULLIF(regexp_replace(user_code, '\\D', '', 'g'), '')::int), 0) AS serial
       FROM users
      WHERE user_code LIKE $1`,
    [`${PREFIX}-${YEAR}-%`],
  )

  const next = Number(result[0].serial) + 1
  return `${PREFIX}-${YEAR}-${String(next).padStart(4, '0')}`
}

/** Normaliza el correo y valida el formato basico. */
function sanitizeEmail(value) {
  const clean = String(value ?? '').trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(clean) ? clean : null
}

/** "Mariana Solis" -> "mariana.solis"; colapsa espacios y quita acentos. */
function normalizeUsername(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .split(' ')
    .filter(Boolean)
    .join('.')
}

/** Existe un correo dado, excluyendo un user_id concreto (edicion de perfil). */
async function emailExists(email, excludeUserId = null) {
  const found = await one('SELECT id FROM users WHERE email = $1 AND ($2::int IS NULL OR id <> $2)', [
    email,
    excludeUserId,
  ])
  return Boolean(found)
}

/** Valida que un correo no este ya tomado; lanza 409 si lo esta. */
async function assertEmailAvailable(email, excludeUserId = null) {
  if (await emailExists(email, excludeUserId)) {
    const { conflict } = require('./errors')
    throw conflict('El correo ya esta registrado por otro usuario')
  }
}

/** Resuelve el nombre del rol a partir de su code o label (acepta ambos). */
function normalizeRole(value) {
  const clean = String(value ?? '').trim().toLowerCase()
  return clean.length > 0 ? clean : null
}

module.exports = {
  USER_CODE_RE,
  normalizeUserCode,
  describeUserCodePattern,
  generateUserCode,
  sanitizeEmail,
  normalizeUsername,
  emailExists,
  assertEmailAvailable,
  normalizeRole,
  PREFIX,
  YEAR,
}