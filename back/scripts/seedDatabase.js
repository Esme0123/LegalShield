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
const mysql = require('mysql2/promise')
const { logger } = require('../utils/logger')

const ROLES = Number(process.env.BCRYPT_ROUNDS || 12)
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'Juris2026!Abg'

async function main() {
  const file = path.join(__dirname, '..', 'database', 'seed.sql')
  const sql = fs.readFileSync(file, 'utf8')

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'legalshield_db',
    multipleStatements: true,
    connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT_MS || 10000),
  })

  logger.info('Aplicando seed.sql…')
  await conn.query(sql)

  logger.info(`Generando hash bcrypt (${ROLES} rounds) de las cuentas de demostracion…`)
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, ROLES)

  const [users] = await conn.query(
    "SELECT id, user_code FROM users WHERE password_hash LIKE '$2a$%placeholder%' OR password_hash = ''",
  )

  for (const user of users) {
    await conn.query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, user.id])
    await conn.query(
      'INSERT IGNORE INTO password_history (user_id, password_hash) SELECT id, ? FROM users WHERE id = ?',
      [passwordHash, user.id],
    )
    logger.info('Usuario actualizado', { userCode: user.user_code })
  }

  logger.info('Seed completado', { users: users.length, demoPassword: '*** (definida en .env o por defecto)' })

  await conn.end()
}

main()
  .catch((err) => {
    logger.error('Fallo el seed', { message: err.message, code: err.code })
    process.exitCode = 1
  })