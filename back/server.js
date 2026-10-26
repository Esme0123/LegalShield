'use strict'

require('dotenv').config()

const net = require('net')
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')

const { assertConnection, closePool } = require('./config/db')
const { assertSecretsConfigured } = require('./services/authService')
const { baseOptions: refreshCookieOptions } = require('./utils/refreshCookie')
const { auditMiddleware } = require('./middlewares/auditMiddleware')
const { logger } = require('./utils/logger')
const errors = require('./utils/errors')

const authRoutes = require('./routes/authRoutes')
const usersRoutes = require('./routes/usersRoutes')
const casesRoutes = require('./routes/casesRoutes')
const rolesRoutes = require('./routes/rolesRoutes')
const auditRoutes = require('./routes/auditRoutes')

const app = express()
const API_PREFIX = process.env.API_PREFIX || '/api'
const PORT = Number(process.env.PORT || 4000)

/* -------------------------------------------------------------------------- */
/* Cabeceras de seguridad                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Politica de confianza en proxies a partir de TRUST_PROXY (apagada por defecto).
 * Con ella apagada req.ip es la IP del socket y X-Forwarded-For se ignora, de modo
 * que un cliente directo no puede falsificar su IP para evadir los limitadores ni
 * escribir una IP falsa en la bitacora (no repudio, ISO 27001 A.8.15).
 * - sin definir, vacia o 'false': desactivada.
 * - entero (p. ej. '1'): numero de saltos de proxy de confianza.
 * - 'true': confia en cualquier proxy; no se recomienda (equivale a creer el header).
 * - lista separada por comas de IP, CIDR o 'loopback' | 'linklocal' | 'uniquelocal'.
 * Cualquier otro valor aborta el arranque (fallo seguro): una politica mal escrita
 * no debe quedar aplicada a medias ni desactivarse sin que nadie lo note.
 */
function resolveTrustProxy(raw) {
  const value = String(raw ?? '').trim()
  if (value === '' || value.toLowerCase() === 'false') return false
  if (value.toLowerCase() === 'true') return true
  if (/^\d+$/.test(value)) return Number(value)

  const RESERVED = ['loopback', 'linklocal', 'uniquelocal']
  const entries = value.split(',').map((e) => e.trim())
  const isValidEntry = (entry) => {
    if (RESERVED.includes(entry)) return true
    const [ip, prefix, extra] = entry.split('/')
    const family = net.isIP(ip)
    if (!family || extra !== undefined) return false
    if (prefix === undefined) return true
    const maxPrefix = family === 4 ? 32 : 128
    return /^\d+$/.test(prefix) && Number(prefix) <= maxPrefix
  }
  const invalid = entries.filter((entry) => !isValidEntry(entry))
  if (invalid.length > 0) {
    throw new Error(
      `TRUST_PROXY invalido (${invalid.map((e) => e || '(vacio)').join(', ')}): use 'false', un numero de saltos, 'true' ` +
        "o una lista de IP/CIDR/'loopback'/'linklocal'/'uniquelocal' separada por comas",
    )
  }
  return entries
}

app.set('trust proxy', resolveTrustProxy(process.env.TRUST_PROXY))

app.use(
  helmet({
    // La API sirve JSON; la CSP endurecida aplica al frontend servido aparte.
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
)

/** Orígenes permitidos desde CORS_ORIGINS; `*` solo si se configura así. */
const corsOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

// Con cookies (credentials) un comodin dejaria a cualquier sitio leer respuestas con la
// sesion del usuario: en produccion solo valen origenes explicitos.
if (process.env.NODE_ENV === 'production' && corsOrigins.includes('*')) {
  corsOrigins.splice(0, corsOrigins.length, ...corsOrigins.filter((o) => o !== '*'))
  logger.warn('CORS_ORIGINS contiene * y se ignora en produccion: liste los origenes permitidos')
}

/** En desarrollo se acepta cualquier puerto local (Vite cambia 5173 -> 5174...). */
const isDevelopment = process.env.NODE_ENV !== 'production'
const LOCAL_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/

app.use(
  cors({
    origin(origin, callback) {
      // Sin Origin = curl, Postman o server-to-server.
      if (!origin) return callback(null, true)
      if (corsOrigins.includes('*') || corsOrigins.includes(origin)) return callback(null, true)
      if (isDevelopment && LOCAL_ORIGIN_RE.test(origin)) return callback(null, true)
      return callback(new errors.HttpError(403, `Origen no permitido por CORS: ${origin}`))
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    maxAge: 86400,
  }),
)

app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: true, limit: '1mb' }))

/* -------------------------------------------------------------------------- */
/* Limitacion global de peticiones                                            */
/* -------------------------------------------------------------------------- */

app.use(
  rateLimit({
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 900000),
    max: Number(process.env.RATE_LIMIT_MAX || 300),
    standardHeaders: true,
    legacyHeaders: false,
  }),
)

/* -------------------------------------------------------------------------- */
/* Salud y metadatos de la API                                                 */
/* -------------------------------------------------------------------------- */

app.get('/health', async (_req, res) => {
  try {
    await assertConnection()
    res.json({ status: 'ok', database: 'up', uptime: process.uptime(), env: process.env.NODE_ENV })
  } catch (err) {
    res.status(503).json({ status: 'degraded', database: 'down', message: err.message })
  }
})

app.get(`${API_PREFIX}`, (_req, res) => {
  res.json({
    name: 'LegalShield API',
    version: '1.0.0',
    docs: `${API_PREFIX}/auth, ${API_PREFIX}/users, ${API_PREFIX}/cases, ${API_PREFIX}/roles, ${API_PREFIX}/audit`,
  })
})

/* -------------------------------------------------------------------------- */
/* Rutas                                                                      */
/* -------------------------------------------------------------------------- */

app.use(`${API_PREFIX}/auth`, authRoutes)
app.use(`${API_PREFIX}/users`, usersRoutes)
app.use(`${API_PREFIX}/cases`, casesRoutes)
app.use(`${API_PREFIX}/roles`, rolesRoutes)
app.use(`${API_PREFIX}/audit`, auditRoutes)

// Auditoria global: se monta despues de las rutas para observar el status final.
app.use(auditMiddleware)

app.use((_req, res) => {
  res.status(404).json({ error: 'Endpoint no encontrado' })
})

/* -------------------------------------------------------------------------- */
/* Manejador de errores central                                               */
/* -------------------------------------------------------------------------- */

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  // Violaciones de restricciones de MySQL que el codigo no anticipa.
  // 1062 = duplicate entry (ER_DUP_ENTRY), 1452 = FK inexistente, 3819 = CHECK.
  // sqlMessage revela nombres de restricciones y valores (OWASP A05): solo va al
  // logger del servidor; el cliente recibe un mensaje generico.
  const isDuplicate = err.errno === 1062 || err.code === 'ER_DUP_ENTRY'
  const isMissingRef = err.errno === 1452 || err.code === 'ER_NO_REFERENCED_ROW_2'
  const isCheck = err.errno === 3819
  if (isDuplicate || isMissingRef || isCheck) {
    logger.warn('Restriccion de integridad violada', { path: req.originalUrl, code: err.code, detail: err.sqlMessage })
  }
  if (isDuplicate) {
    return res.status(409).json({ error: 'El registro ya existe' })
  }
  if (isMissingRef) {
    return res.status(400).json({ error: 'Referencia invalida a un registro inexistente' })
  }
  if (isCheck) {
    return res.status(422).json({ error: 'Violacion de restriccion de integridad' })
  }

  const status = err.status || 500
  if (status >= 500) {
    logger.error('Error no controlado', { path: req.originalUrl, message: err.message, stack: err.stack })
    return res.status(status).json({ error: 'Error interno del servidor' })
  }

  return res.status(status).json({ error: err.message, ...(err.details ? { details: err.details } : {}) })
})

/* -------------------------------------------------------------------------- */
/* Arranque                                                                   */
/* -------------------------------------------------------------------------- */

async function start() {
  try {
    assertSecretsConfigured()
    // Fallo seguro: un REFRESH_COOKIE_SAMESITE invalido detiene el arranque.
    refreshCookieOptions()

    const dbUp = await assertConnection()
    if (!dbUp) throw new Error('La consulta de verificacion no devolvio el resultado esperado')

    // app.listen se ejecuta despues del chequeo para no aceptar trafico sin base.
    const server = app.listen(PORT, () => {
      logger.info('LegalShield API escuchando', { port: PORT, prefix: API_PREFIX, env: process.env.NODE_ENV })
    })

    const shutdown = async (signal) => {
      logger.info('Apagando servidor', { signal })
      server.close(async () => {
        await closePool()
        process.exit(0)
      })
      // Si algun socket se queda colgado, no bloqueamos el despliegue.
      setTimeout(() => process.exit(1), 10000).unref()
    }

    process.on('SIGTERM', () => shutdown('SIGTERM'))
    process.on('SIGINT', () => shutdown('SIGINT'))

    process.on('unhandledRejection', (reason) => {
      logger.error('Promesa rechazada sin manejar', { reason: String(reason) })
    })
  } catch (err) {
    logger.error('No se pudo iniciar el servidor', { message: err.message })
    process.exit(1)
  }
}

if (require.main === module) {
  start()
}

module.exports = app