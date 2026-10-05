'use strict'

/**
 * Auditoria.
 *
 * `security_logs` es inmutable (trigger en la base): este modulo solo lee.
 * Los filtros de fecha y tipo de evento se resuelven en SQL con parametros
 * ($1, $2...) para evitar inyeccion, y el rango se acota para no extraer la
 * bitacora completa de un solo golpe.
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

/* -------------------------------------------------------------------------- */
/* GET /api/audit/logs                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Query params:
 *   from, to        rango de fechas (ISO 8601)
 *   action          tipo de evento; admite coma para varios (AUTH_FAILED,AUTH_LOCKED)
 *   status          INFO | WARN | CRITICO
 *   userCode        filtra por User ID
 *   limit, offset   paginacion (maximo 500 por pagina)
 */
async function listLogs(req, res) {
  const where = []
  const params = []
  let index = 1

  const from = assertDate(req.query.from, 'from')
  const to = assertDate(req.query.to, 'to')
  if (from && to && from > to) throw badRequest('El rango from/to es invalido: from es posterior a to')

  if (from) {
    where.push(`timestamp >= $${index}`)
    params.push(from)
    index += 1
  }
  if (to) {
    where.push(`timestamp <= $${index}`)
    params.push(to)
    index += 1
  }

  if (req.query.action) {
    const list = String(req.query.action)
      .split(',')
      .map((a) => a.trim().toUpperCase())
      .filter(Boolean)
    if (list.length === 0) throw badRequest('El filtro action quedo vacio')
    where.push(`action = ANY($${index}::text[])`)
    params.push(list)
    index += 1
  }

  if (req.query.status) {
    const list = String(req.query.status)
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter((s) => Object.hasOwn(SEVERITY_ORDER, s))
    if (list.length === 0) throw badRequest(`status debe ser uno de: ${Object.keys(SEVERITY_ORDER).join(', ')}`)
    where.push(`status = ANY($${index}::text[])`)
    params.push(list)
    index += 1
  }

  if (req.query.userCode) {
    where.push(`user_code = $${index}`)
    params.push(String(req.query.userCode).trim().toUpperCase())
    index += 1
  }

  const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''
  const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 500)
  const offset = Math.max(Number(req.query.offset || 0), 0)

  const [items, totalRow, byStatus, byAction] = await Promise.all([
    rows(
      `SELECT id, user_code AS "userCode", action, ip_address AS "ipAddress",
              status, details, timestamp
         FROM security_logs
         ${clause}
        ORDER BY timestamp DESC, id DESC
        LIMIT ${limit} OFFSET ${offset}`,
      params,
    ),
    one(`SELECT COUNT(*)::int AS total FROM security_logs ${clause}`, params),
    rows(`SELECT status, COUNT(*)::int AS count FROM security_logs GROUP BY status ORDER BY count DESC`),
    rows(
      `SELECT action, COUNT(*)::int AS count FROM security_logs
        GROUP BY action ORDER BY count DESC LIMIT 20`,
    ),
  ])

  res.json({
    total: totalRow.total,
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

/* -------------------------------------------------------------------------- */
/* GET /api/audit/events                                                       */
/* -------------------------------------------------------------------------- */

/** Catalogo de eventos consultables, util para poblar los filtros del frontend. */
async function listEventTypes(_req, res) {
  const result = await rows(
    `SELECT action, COUNT(*)::int AS occurrences,
            MAX(timestamp) AS "lastSeen",
            MIN(timestamp) AS "firstSeen"
       FROM security_logs
      GROUP BY action
      ORDER BY action`,
  )
  res.json({ events: result })
}

module.exports = { listLogs, listEventTypes }