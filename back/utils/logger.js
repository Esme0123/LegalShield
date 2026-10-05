'use strict'

/**
 * Logger estructurado minimo. En produccion emite JSON por linea para poder
 * indexarlo; en desarrollo usa un formato legible con marca de tiempo.
 */

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 }
const currentLevel = LEVELS[process.env.LOG_LEVEL || 'info'] ?? LEVELS.info
const useJson = process.env.NODE_ENV === 'production'

function emit(level, message, meta) {
  if (LEVELS[level] > currentLevel) return

  if (useJson) {
    process.stdout.write(`${JSON.stringify({ ts: new Date().toISOString(), level, message, ...meta })}\n`)
    return
  }

  const time = new Date().toISOString().slice(11, 23)
  const tail = meta && Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : ''
  process.stdout.write(`${time} ${level.toUpperCase().padEnd(5)} ${message}${tail}\n`)
}

module.exports = {
  logger: {
    error: (message, meta) => emit('error', message, meta),
    warn: (message, meta) => emit('warn', message, meta),
    info: (message, meta) => emit('info', message, meta),
    debug: (message, meta) => emit('debug', message, meta),
  },
}