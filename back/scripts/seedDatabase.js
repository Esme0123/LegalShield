'use strict'

/**
 * scripts/seedDatabase.js
 *
 * Aplica database/seed.sql y luego genera los hashes bcrypt reales de las
 * cuentas de demostracion con la contrasena inicial.
 *
 * Por eso seed.sql guarda un hash placeholder: un hash precalculado dentro del
 * repositorio es una mala practica de seguridad, y ademas bcrypt depende del
 * numero de rondas configurado en el entorno.
 *
 * Uso: npm run db:seed
 */

require('dotenv').config()

const fs = require('fs')
const path = require('path')
const bcrypt = require('bcryptjs')
const { pool, closePool } = require('../config/db')
const { logger } = require('../utils/logger')

const ROLES = Number(process.env.BCRYPT_ROUNDS || 12)
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'Juris2026!Abg'

async function main() {
  const file = path.join(__dirname, '..', 'database', 'seed.sql')
  const sql = fs.readFileSync(file, 'utf8')

  logger.info('Aplicando seed.sql…')
  await pool.query(sql)

  logger.info(`Generando hash bcrypt (${ROLES} rounds) de las cuentas de demostracion…`)
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, ROLES)

  const { rows: users } = await pool.query(
    "SELECT id, user_code FROM users WHERE password_hash LIKE '$2a$%placeholder%' OR password_hash = ''",
  )

  for (const user of users) {
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, user.id])
    await pool.query(
      'INSERT INTO password_history (user_id, password_hash) SELECT id, $1 FROM users WHERE id = $2 ON CONFLICT DO NOTHING',
      [passwordHash, user.id],
    )
    logger.info('Usuario actualizado', { userCode: user.user_code })
  }

  logger.info('Seed completado', { users: users.length, demoPassword: '*** (definida en .env o por defecto)' })
}

main()
  .catch((err) => {
    logger.error('Fallo el seed', { message: err.message, code: err.code })
    process.exitCode = 1
  })
  .finally(async () => {
    await closePool()
  })