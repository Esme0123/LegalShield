'use strict'

/**
 * scripts/setupDatabase.js
 *
 * Aplica database/schema.sql. Es idempotente (todo lleva IF NOT EXISTS), asi que
 * puede ejecutarse varias veces. Uso: npm run db:setup
 */

require('dotenv').config()

const fs = require('fs')
const path = require('path')
const { pool, closePool } = require('../config/db')
const { logger } = require('../utils/logger')

async function main() {
  const file = path.join(__dirname, '..', 'database', 'schema.sql')
  const sql = fs.readFileSync(file, 'utf8')

  logger.info('Aplicando schema.sql…')
  await pool.query(sql)
  logger.info('Esquema aplicado correctamente')
}

main()
  .catch((err) => {
    logger.error('Fallo al aplicar el esquema', { message: err.message, code: err.code })
    process.exitCode = 1
  })
  .finally(async () => {
    await closePool()
  })