'use strict'

/**
 * Auditoria diferenciada.
 *
 *   GET /api/audit/security  -> security_logs (acceso y control), solo OSI.
 *   GET /api/audit/activity  -> activity_logs (acciones de negocio).
 *   GET /api/audit/all       -> ambas bitacoras unidas (todos los roles), solo OSI.
 *   GET /api/audit/logs      -> alias de compatibilidad de la bitacora de seguridad.
 *   GET /api/audit/events    -> catalogo de eventos de seguridad.
 *
 * Ambas tablas son de solo lectura aqui (security_logs es inmutable por trigger).
 * Los filtros de fecha y tipo de evento se resuelven en SQL con parametros para
 * evitar inyeccion, y el rango se acota para no extraer la bitacora completa.
 */

const { rows, one } = require('../config/db')
const { badRequest } = require('../utils/errors')
const { parsePagination } = require('../utils/helpers')
const { SEVERITY_ORDER } = require('../services/auditService')
const { hasPermission } = require('../middlewares/rbacMiddleware')

/** ISO 8601 estricto: evita que `new Date()` acepte formatos laxos. */
const ISO_RE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?)?$/

function assertDate(value, field) {
  if (value === undefined || value === null || value === '') return null
  const raw = String(value)
  if (!ISO_RE.test(raw)) throw badRequest(`${field} debe ser una fecha ISO 8601 (ej. 2026-10-05 o 2026-10-05T07:41:02Z)`)
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) throw badRequest(`${field} no es una fecha valida`)
  return parsed
}

/**
 * Origen de cada bitacora. `all` une ambas tablas para la vista unificada del
 * OSI: todo lo que hace cualquier rol aparece en una sola linea de tiempo.
 */
const SOURCES = {
  security: `SELECT id, user_code, action, ip_address, status, details, "timestamp", 'security' AS stream FROM security_logs`,
  activity: `SELECT id, user_code, action, ip_address, status, details, "timestamp", 'activity' AS stream FROM activity_logs`,
}
SOURCES.all = `${SOURCES.security} UNION ALL ${SOURCES.activity}`

/**
 * Consulta generica parametrizada por origen (solo claves de SOURCES).
 *
 * Cada fila trae al AUTOR (usuario y rol) y, si el evento afecta a otra cuenta
 * (details.target), tambien al usuario AFECTADO: la tabla responde quien hizo
 * que y sobre quien sin abrir el detalle.
 *
 * Query params:
 *   from, to        rango de fechas (ISO 8601)
 *   action          tipo de evento; admite coma para varios (AUTH_FAILED,AUTH_LOCKED)
 *   status          INFO | WARN | CRITICO
 *   userCode        filtra por User ID
 *   limit, offset   paginacion (maximo 500 por pagina)
 */
async function listFrom(source, req, res) {
  const where = []
  const params = []

  const from = assertDate(req.query.from, 'from')
  const to = assertDate(req.query.to, 'to')
  if (from && to && from > to) throw badRequest('El rango from/to es invalido: from es posterior a to')

  if (from) {
    where.push('l."timestamp" >= ?')
    params.push(from)
  }
  if (to) {
    where.push('l."timestamp" <= ?')
    params.push(to)
  }

  if (req.query.action) {
    const list = String(req.query.action)
      .split(',')
      .map((a) => a.trim().toUpperCase())
      .filter(Boolean)
    if (list.length === 0) throw badRequest('El filtro action quedo vacio')
    where.push('l.action IN (?)')
    params.push(list)
  }

  if (req.query.status) {
    const list = String(req.query.status)
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter((s) => Object.hasOwn(SEVERITY_ORDER, s))
    if (list.length === 0) throw badRequest(`status debe ser uno de: ${Object.keys(SEVERITY_ORDER).join(', ')}`)
    where.push('l.status IN (?)')
    params.push(list)
  }

  if (req.query.userCode) {
    where.push('l.user_code = ?')
    params.push(String(req.query.userCode).trim().toUpperCase())
  }

  const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''
  const limit = parsePagination(req.query.limit, { fallback: 100, min: 1, max: 500 })
  const offset = parsePagination(req.query.offset, { fallback: 0, min: 0 })
  const logs = `(${SOURCES[source]}) l`

  const [items, totalRow, byStatus, byAction] = await Promise.all([
    rows(
      `SELECT l.id, l.stream, l.user_code AS "userCode", l.action, l.ip_address AS "ipAddress",
              l.status, l.details, l."timestamp",
              actor.username AS "actorUsername", actor_role.name AS "actorRole",
              target.user_code AS "targetCode", target.username AS "targetUsername"
         FROM ${logs}
         LEFT JOIN users actor ON actor.user_code = l.user_code
         LEFT JOIN roles actor_role ON actor_role.id = actor.role_id
         LEFT JOIN users target
                ON target.user_code = JSON_UNQUOTE(JSON_EXTRACT(IF(JSON_VALID(l.details), l.details, NULL), '$.target'))
         ${clause}
        ORDER BY l."timestamp" DESC, l.id DESC
        LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    ),
    one(`SELECT COUNT(*) AS total FROM ${logs} ${clause}`, params),
    rows(`SELECT l.status, COUNT(*) AS count FROM ${logs} GROUP BY l.status ORDER BY count DESC`),
    rows(
      `SELECT l.action, COUNT(*) AS count FROM ${logs}
        GROUP BY l.action ORDER BY count DESC LIMIT 20`,
    ),
  ])

  res.json({
    stream: source,
    total: Number(totalRow.total),
    limit,
    offset,
    filters: {
      from: req.query.from ?? null,
      to: req.query.to ?? null,
      action: req.query.action ?? null,
      status: req.query.status ?? null,
      userCode: req.query.userCode ?? null,
    },
    summary: { byStatus, byAction },
    logs: items,
  })
}

/** Bitacora de seguridad: acceso, bloqueos y control de cuentas (rol OSI). */
async function listSecurityLogs(req, res) {
  return listFrom('security', req, res)
}

/** Bitacora de actividad: acciones de negocio del despacho (socios/abogados). */
async function listActivityLogs(req, res) {
  // Solo la direccion (todo el despacho) y el OSI leen la actividad ajena; el
  // abogado ve unicamente sus propias acciones.
  if (!hasPermission(req.user, 'CASES_READ_ALL') && !hasPermission(req.user, 'SECURITY_LOGS_VIEW')) {
    req.query.userCode = req.user.user_code
  }
  return listFrom('activity', req, res)
}

/** Bitacora unificada: seguridad + actividad de todos los roles (rol OSI). */
async function listAllLogs(req, res) {
  return listFrom('all', req, res)
}

/* -------------------------------------------------------------------------- */
/* GET /api/audit/events                                                       */
/* -------------------------------------------------------------------------- */

/** Catalogo de eventos de seguridad consultables, util para los filtros. */
async function listEventTypes(_req, res) {
  const result = await rows(
    `SELECT action, COUNT(*) AS occurrences,
            MAX("timestamp") AS "lastSeen",
            MIN("timestamp") AS "firstSeen"
       FROM security_logs
      GROUP BY action
      ORDER BY action`,
  )
  res.json({ events: result })
}

module.exports = { listSecurityLogs, listActivityLogs, listAllLogs, listEventTypes }
