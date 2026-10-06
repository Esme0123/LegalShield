'use strict'

/**
 * scripts/setupDatabase.js
 *
 * Aplica database/schema.sql contra MySQL/MariaDB (XAMPP). Es idempotente
 * (todo lleva IF NOT EXISTS / INSERT IGNORE), asi que puede ejecutarse varias
 * veces. Uso: npm run db:setup
 *
 * El archivo crea la base `legalshield_db` y hace `USE`, por eso la conexion se
 * abre SIN base seleccionada.
 */

require('dotenv').config()

const fs = require('fs')
const path = require('path')
const mysql = require('mysql2/promise')
const { logger } = require('../utils/logger')

async function main() {
  const file = path.join(__dirname, '..', 'database', 'schema.sql')
  const sql = fs.readFileSync(file, 'utf8')

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true,
    connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT_MS || 10000),
  })

  logger.info('Aplicando schema.sql…')
  await conn.query(sql)
  logger.info('Esquema aplicado correctamente')

  await conn.end()
}

main()
  .catch((err) => {
    logger.error('Fallo al aplicar el esquema', { message: err.message, code: err.code })
    process.exitCode = 1
  })