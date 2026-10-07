'use strict'

require('dotenv').config()

const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')

const { assertConnection, closePool } = require('./config/db')
const { assertSecretsConfigured } = require('./services/authService')
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

app.set('trust proxy', 1) // detras de un balanceador/ingress: X-Forwarded-For es confiable

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

app.use(
  cors({
    origin(origin, callback) {
      // Sin Origin = curl, Postman o server-to-server.
      if (!origin) return callback(null, true)
      if (corsOrigins.includes('*') || corsOrigins.includes(origin)) return callback(null, true)
      return callback(new errors.HttpError(403, `Origen no permitido por CORS: ${origin}`))
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
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
  if (err.errno === 1062 || err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ error: 'El registro ya existe', detail: err.sqlMessage })
  }
  if (err.errno === 1452 || err.code === 'ER_NO_REFERENCED_ROW_2') {
    return res.status(400).json({ error: 'Referencia invalida a un registro inexistente', detail: err.sqlMessage })
  }
  if (err.errno === 3819) {
    return res.status(422).json({ error: 'Violacion de restriccion de integridad', detail: err.sqlMessage })
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