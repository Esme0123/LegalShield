'use strict'

/**
 * Historial de contrasenas (ISO 27002 9.1.2 · reutilizacion). Lo comparten el
 * cambio de clave del titular y el reinicio con token del OSI, para que ambos
 * apliquen exactamente la misma regla.
 */

const bcrypt = require('bcryptjs')
const { rows } = require('../config/db')
const { unprocessable } = require('./errors')
const { PASSWORD_HISTORY_LIMIT } = require('./passwordPolicy')

/**
 * Rechaza (422) cualquier clave presente en las ultimas PASSWORD_HISTORY_LIMIT.
 * bcrypt.compare contra cada hash previo detecta tanto la clave actual como las
 * reutilizadas, sin comparar en texto plano.
 */
async function assertPasswordNotReused(userId, newPassword) {
  const recent = await rows(
    'SELECT password_hash FROM password_history WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
    [userId, PASSWORD_HISTORY_LIMIT],
  )

  for (const entry of recent) {
    if (await bcrypt.compare(newPassword, entry.password_hash)) {
      throw unprocessable(
        `La nueva contrasena coincide con una de las ultimas ${PASSWORD_HISTORY_LIMIT} contrasenas del usuario`,
        { reuseBlocked: true, historyLimit: PASSWORD_HISTORY_LIMIT },
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
