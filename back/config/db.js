'use strict'

/**
 * Pool de conexiones MySQL (XAMPP / phpMyAdmin) + helpers de transaccion.
 *
 * Usa las variables DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME. La API
 * expuesta replica a `pg` para no tocar a los llamadores: `query`, `rows`,
 * `one`, `withTransaction`, `assertConnection`, `closePool` y `pool`.
 *
 * `translateSql` convierte los aliases de Postgres (`AS "columna"`) a la
 * sintaxis de MySQL (backticks). El resto de sentencias ya viven en SQL MySQL.
 */

const mysql = require('mysql2/promise')
const { logger } = require('../utils/logger')

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'legalshield_db',
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_MAX || 10),
  queueLimit: 0,
  timezone: 'Z',
  connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT_MS || 10000),
  decimalNumbers: true,
})

// El error 'error' del pool no debe tumbar el proceso: se registra y se deja
// que la siguiente consulta reintente la conexion.
pool.on('error', (err) => {
  logger.error('Pool de MySQL error', { message: err.message, code: err.code })
})

/** Convierte aliases entrecomillados de Postgres ("col") a backticks (`col`). */
function translateSql(sql) {
  return sql.replace(/"([A-Za-z_][A-Za-z0-9_]*)"/g, '`$1`')
}

/** Normaliza el resultado de mysql2 a la forma devuelta por `pg`. */
function normalizeResult(result, sql) {
  const isSelect = /^\s*(SELECT|SHOW|DESCRIBE|EXPLAIN|WITH)/i.test(sql.trim())
  if (isSelect) {
    return { rows: result, rowCount: result.length, insertId: undefined, affectedRows: undefined }
  }
  return {
    rows: [],
    rowCount: result.affectedRows ?? 0,
    insertId: result.insertId ?? null,
    affectedRows: result.affectedRows ?? 0,
  }
}

/** Ejecuta una consulta y devuelve el resultado normalizado. */
async function query(text, params) {
  const sql = translateSql(text)
  const started = Date.now()
  try {
    const [result] = await pool.query(sql, params ?? [])
    const payload = normalizeResult(result, sql)
    logger.debug('query', { durationMs: Date.now() - started, rows: payload.rowCount })
    return payload
  } catch (err) {
    logger.error('query fallo', { message: err.message, code: err.code, errno: err.errno })
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
 * El callback recibe un `client` con `.query(text, params)` normalizado.
 */
async function withTransaction(callback) {
  const raw = await pool.getConnection()
  try {
    await raw.query('BEGIN')
    const client = {
      query: async (text, params) => {
        const sql = translateSql(text)
        const [result] = await raw.query(sql, params ?? [])
        return normalizeResult(result, sql)
      },
    }
    const result = await callback(client)
    await raw.query('COMMIT')
    return result
  } catch (err) {
    await raw.query('ROLLBACK')
    throw err
  } finally {
    raw.release()
  }
}

/** Verifica la conectividad al arrancar; lanza si no hay respuesta. */
async function assertConnection() {
  const result = await one('SELECT 1 AS ok')
  return result?.ok === 1
}

async function closePool() {
  await pool.end()
}

module.exports = { pool, query, rows, one, withTransaction, assertConnection, closePool }