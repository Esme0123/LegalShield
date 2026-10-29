'use strict'

/**
 * Historial de contrasenas (ISO 27002 9.1.2 · reutilizacion). Lo comparten el
 * cambio de clave del titular y el reinicio con token del OSI, para que ambos
 * apliquen exactamente la misma regla.
 */

const bcrypt = require('bcryptjs')
const { rows } = require('../config/db')
const { unprocessable } = require('./errors')
const { PASSWORD_HISTORY_LIMIT, PASSWORD_MAX_AGE_DAYS } = require('./passwordPolicy')

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Rechaza (422) cualquier clave presente en las ultimas PASSWORD_HISTORY_LIMIT.
 * bcrypt.compare contra cada hash previo detecta tanto la clave actual como las
 * reutilizadas, sin comparar en texto plano.
 *
 * El bloqueo es por cantidad de cambios, no por fecha: la clave en la posicion k
 * (0 = la actual) sale del historial tras `limite - k` cambios con claves
 * distintas. La fecha estimada asume la rotacion obligatoria cada
 * PASSWORD_MAX_AGE_DAYS dias; cambiar antes acorta la espera.
 */
async function assertPasswordNotReused(userId, newPassword) {
  const recent = await rows(
    'SELECT password_hash, created_at FROM password_history WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?',
    [userId, PASSWORD_HISTORY_LIMIT],
  )

  for (const [index, entry] of recent.entries()) {
    if (await bcrypt.compare(newPassword, entry.password_hash)) {
      const changesRequired = PASSWORD_HISTORY_LIMIT - index
      const waitDays = changesRequired * PASSWORD_MAX_AGE_DAYS
      throw unprocessable(
        `No puede reutilizar una contrasena antigua: debe usar ${changesRequired} contrasena(s) distinta(s) antes de volver a usar esta`,
        {
          reuseBlocked: true,
          historyLimit: PASSWORD_HISTORY_LIMIT,
          isCurrent: index === 0,
          setAt: entry.created_at,
          // Hasta cuando estuvo vigente: la fecha en que la reemplazo la siguiente.
          usedUntil: index === 0 ? null : recent[index - 1].created_at,
          changesRequired,
          maxAgeDays: PASSWORD_MAX_AGE_DAYS,
          waitDays,
          reusableFrom: new Date(Date.now() + waitDays * DAY_MS).toISOString(),
        },
      )
    }
  }
}

/** Agrega el hash al historial y poda: conserva solo las N claves mas recientes. */
async function pushPasswordHistory(client, userId, passwordHash) {
  await client.query('INSERT INTO password_history (user_id, password_hash) VALUES (?, ?)', [
    userId,
    passwordHash,
  ])
  // La tabla derivada es necesaria: MySQL/MariaDB no admiten LIMIT dentro de una
  // subconsulta IN ni leer en ella la misma tabla del DELETE; el desempate por id
  // cubre dos cambios en el mismo segundo.
  await client.query(
    `DELETE FROM password_history
      WHERE user_id = ?
        AND id NOT IN (
          SELECT id FROM (
            SELECT id FROM password_history
             WHERE user_id = ?
             ORDER BY created_at DESC, id DESC
             LIMIT ?
          ) AS keep_recent
        )`,
    [userId, userId, PASSWORD_HISTORY_LIMIT],
  )
}

module.exports = { assertPasswordNotReused, pushPasswordHistory }
