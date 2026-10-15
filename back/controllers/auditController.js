'use strict'

/**
 * Auditoria diferenciada.
 *
 *   GET /api/audit/security  -> security_logs (acceso y control), solo OSI.
 *   GET /api/audit/activity  -> activity_logs (acciones de negocio).
 *   GET /api/audit/logs      -> alias de compatibilidad de la bitacora de seguridad.
 *   GET /api/audit/events    -> catalogo de eventos de seguridad.
 *
 * Ambas tablas son de solo lectura aqui (security_logs es inmutable por trigger).
 * Los filtros de fecha y tipo de evento se resuelven en SQL con parametros para
 * evitar inyeccion, y el rango se acota para no extraer la bitacora completa.
 */

const { rows, one } = require('../config/db')
const { badRequest } = require('../utils/errors')
const { SEVERITY_ORDER } = require('../services/auditService')

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
 * Consulta generica parametrizada por tabla (solo nombres controlados).
 *
 * Query params:
 *   from, to        rango de fechas (ISO 8601)
 *   action          tipo de evento; admite coma para varios (AUTH_FAILED,AUTH_LOCKED)
 *   status          INFO | WARN | CRITICO
 *   userCode        filtra por User ID
 *   limit, offset   paginacion (maximo 500 por pagina)
 */
async function listFrom(table, req, res) {
  const where = []
  const params = []

  const from = assertDate(req.query.from, 'from')
  const to = assertDate(req.query.to, 'to')
  if (from && to && from > to) throw badRequest('El rango from/to es invalido: from es posterior a to')

  if (from) {
    where.push('"timestamp" >= ?')
    params.push(from)
  }
  if (to) {
    where.push('"timestamp" <= ?')
    params.push(to)
  }

  if (req.query.action) {
    const list = String(req.query.action)
      .split(',')
      .map((a) => a.trim().toUpperCase())
      .filter(Boolean)
    if (list.length === 0) throw badRequest('El filtro action quedo vacio')
    where.push('action IN (?)')
    params.push(list)
  }

  if (req.query.status) {
    const list = String(req.query.status)
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter((s) => Object.hasOwn(SEVERITY_ORDER, s))
    if (list.length === 0) throw badRequest(`status debe ser uno de: ${Object.keys(SEVERITY_ORDER).join(', ')}`)
    where.push('status IN (?)')
    params.push(list)
  }

  if (req.query.userCode) {
    where.push('user_code = ?')
    params.push(String(req.query.userCode).trim().toUpperCase())
  }

  const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''
  const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 500)
  const offset = Math.max(Number(req.query.offset || 0), 0)

  const [items, totalRow, byStatus, byAction] = await Promise.all([
    rows(
      `SELECT id, user_code AS "userCode", action, ip_address AS "ipAddress",
              status, details, "timestamp"
         FROM ${table}
         ${clause}
        ORDER BY "timestamp" DESC, id DESC
        LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    ),
    one(`SELECT COUNT(*) AS total FROM ${table} ${clause}`, params),
    rows(`SELECT status, COUNT(*) AS count FROM ${table} GROUP BY status ORDER BY count DESC`),
    rows(
      `SELECT action, COUNT(*) AS count FROM ${table}
        GROUP BY action ORDER BY count DESC LIMIT 20`,
    ),
  ])

  res.json({
    stream: table === 'security_logs' ? 'security' : 'activity',
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
  return listFrom('security_logs', req, res)
}

/** Bitacora de actividad: acciones de negocio del despacho (socios/abogados). */
async function listActivityLogs(req, res) {
  return listFrom('activity_logs', req, res)
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

module.exports = { listSecurityLogs, listActivityLogs, listEventTypes }
