'use strict'

/**
 * Pool de conexiones PostgreSQL + helpers de transaccion.
 *
 * Usa `DATABASE_URL` cuando esta definida y, si no, arma la cadena de conexion
 * con las variables sueltas (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD).
 */

const { Pool } = require('pg')
const { logger } = require('../utils/logger')

const poolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    }
  : {
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 5432),
      database: process.env.DB_NAME || 'legalshield',
      user: process.env.DB_USER || 'legalshield',
      password: process.env.DB_PASSWORD,
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    }

poolConfig.max = Number(process.env.DB_POOL_MAX || 10)
poolConfig.idleTimeoutMillis = Number(process.env.DB_IDLE_TIMEOUT_MS || 30000)
poolConfig.connectionTimeoutMillis = Number(process.env.DB_CONNECT_TIMEOUT_MS || 5000)

const pool = new Pool(poolConfig)

// El error 'error' del pool no debe tumbar el proceso: se registra y se deja
// que la siguiente consulta reintente la conexion.
pool.on('error', (err) => {
  logger.error('Pool de PostgreSQL error', { message: err.message })
})

/** Ejecuta una consulta y devuelve el resultado de `pg`. */
async function query(text, params) {
  const started = Date.now()
  try {
    const result = await pool.query(text, params)
    logger.debug('query', { durationMs: Date.now() - started, rows: result.rowCount })
    return result
  } catch (err) {
    logger.error('query fallo', { message: err.message, code: err.code })
    throw err
  }
}

/** Igual que `query` pero devuelve solo las filas. */
async function rows(text, params) {
  const result = await query(text, params)
  return result.rows
}

/** Devuelve la primera fila o `null`. */
async function one(text, params) {
  const result = await query(text, params)
  return result.rows[0] ?? null
}

/**
 * Envuelve un callback en una transaccion: COMMIT si termina bien, ROLLBACK
 * ante cualquier excepcion y liberacion del cliente en el `finally`.
 */
async function withTransaction(callback) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await callback(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

/** Verifica la conectividad al arrancar; lanza si no hay respuesta. */
async function assertConnection() {
  const { rows: result } = await pool.query('SELECT 1 AS ok')
  return result[0].ok === 1
}

async function closePool() {
  await pool.end()
}

module.exports = { pool, query, rows, one, withTransaction, assertConnection, closePool }