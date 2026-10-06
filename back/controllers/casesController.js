'use strict'

/**
 * Expedientes judiciales.
 *
 * Control de acceso A01:2021 aplicado en dos capas:
 *   1. middleware `scopeCasesToOwner` -> socio/admin ven todo, el resto queda
 *      acotado a `assigned_lawyer_id = usuario.id`;
 *   2. cada consulta incluye el filtro por `req.scope`, de modo que la restriccion
 *      viaja en la propia sentencia SQL y no en el filtrado posterior.
 *
 * Un cliente tampoco puede leer expedientes ajenos: solo los asignados a su
 * usuario. Si un expediente no tiene titular, solo es visible para el socio.
 */

const { rows, one, withTransaction } = require('../config/db')
const { record } = require('../services/auditService')
const { badRequest, forbidden, notFound } = require('../utils/errors')

const CASE_STATUSES = ['abierto', 'en_tramite', 'suspendido', 'archivado', 'cerrado']
const RISK_LEVELS = ['baja', 'media', 'alta', 'critica']

/** Columnas expuestas al cliente (nunca password ni hashes). */
const SELECT_CASE = `
  SELECT c.id, c.assigned_lawyer_id, c.case_number AS "caseNumber", c.title,
         c.client_name AS "clientName", c.status, c.matter, c.court, c.stage,
         c.risk_level AS "riskLevel", c.progress, c.deadline,
         c.is_privileged AS "isPrivileged",
         c.created_at AS "createdAt", c.updated_at AS "updatedAt", c.archived_at AS "archivedAt",
         u.user_code AS "ownerUserCode", u.username AS "ownerName"
    FROM legal_cases c
    LEFT JOIN users u ON u.id = c.assigned_lawyer_id`

/** WHERE dinamico: alcance por usuario + filtros de consulta. */
function buildFilters(req) {
  const where = []
  const params = []

  if (!req.scope.all) {
    where.push('c.assigned_lawyer_id = ?')
    params.push(req.scope.userId)
  }

  const { status, riskLevel, owner, search } = req.query

  if (status) {
    const list = String(status).split(',').map((s) => s.trim()).filter((s) => CASE_STATUSES.includes(s))
    if (list.length === 0) throw badRequest(`status debe ser uno de: ${CASE_STATUSES.join(', ')}`)
    where.push('c.status IN (?)')
    params.push(list)
  }

  if (riskLevel) {
    const list = String(riskLevel).split(',').map((s) => s.trim()).filter((s) => RISK_LEVELS.includes(s))
    if (list.length === 0) throw badRequest(`riskLevel debe ser uno de: ${RISK_LEVELS.join(', ')}`)
    where.push('c.risk_level IN (?)')
    params.push(list)
  }

  if (owner) {
    where.push('u.user_code = ?')
    params.push(String(owner).trim().toUpperCase())
  }

  if (search) {
    where.push('(c.title LIKE ? OR c.client_name LIKE ? OR c.case_number LIKE ?)')
    params.push(`%${String(search).trim()}%`, `%${String(search).trim()}%`, `%${String(search).trim()}%`)
  }

  return { where, params }
}

/* -------------------------------------------------------------------------- */
/* GET /api/cases                                                              */
/* -------------------------------------------------------------------------- */

async function listCases(req, res) {
  const { where, params } = buildFilters(req)
  const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''

  const limit = Math.min(Number(req.query.limit || 50), 200)
  const offset = Math.max(Number(req.query.offset || 0), 0)

  const result = await rows(
    `${SELECT_CASE}
     ${clause}
     ORDER BY c.created_at DESC, c.id DESC
     LIMIT ${limit} OFFSET ${offset}`,
    params,
  )

  res.json({
    total: result.length,
    limit,
    offset,
    scope: req.scope.all ? 'despacho' : 'propio',
    cases: result,
  })
}

/* -------------------------------------------------------------------------- */
/* GET /api/cases/:id                                                          */
/* -------------------------------------------------------------------------- */

async function getCase(req, res) {
  const { params, scope } = findOneOr404(req)

  const found = await one(`${SELECT_CASE} WHERE c.id = ?`, params)
  if (!found) throw notFound(`No existe el expediente con id ${params[0]}`)

  // Un expediente sin titular solo lo abre la direccion del despacho.
  if (!scope.all && found.assigned_lawyer_id !== scope.userId) {
    record('ACCESS_DENIED', {
      userCode: req.user.user_code,
      req,
      details: { path: req.originalUrl, reason: 'expediente_fuera_de_ambito' },
    })
    throw forbidden('No tiene acceso a este expediente: pertenece a otro abogado asignado')
  }

  record('CASE_READ', { userCode: req.user.user_code, req, details: { caseNumber: found.caseNumber } })
  res.json({ case: found })
}

/* -------------------------------------------------------------------------- */
/* POST /api/cases                                                             */
/* -------------------------------------------------------------------------- */

async function createCase(req, res) {
  const { title, clientName, status = 'abierto', matter, court, stage, riskLevel = 'media', progress = 0, deadline, isPrivileged = false } = req.body ?? {}

  if (!String(title ?? '').trim()) throw badRequest('El titulo es obligatorio')
  if (!String(clientName ?? '').trim()) throw badRequest('El cliente es obligatorio')
  if (!CASE_STATUSES.includes(status)) throw badRequest(`status debe ser uno de: ${CASE_STATUSES.join(', ')}`)
  if (!RISK_LEVELS.includes(riskLevel)) throw badRequest(`riskLevel debe ser uno de: ${RISK_LEVELS.join(', ')}`)

  const progressNum = Number(progress)
  if (!Number.isFinite(progressNum) || progressNum < 0 || progressNum > 100) {
    throw badRequest('progress debe ser un entero entre 0 y 100')
  }

  // Sin alcance global, el expediente se autoasigna: el abogado no puede
  // colarse como titular de un caso ajeno.
  const ownerUserCode = req.scope.all ? req.body?.ownerUserCode : req.user.user_code

  const created = await withTransaction(async (client) => {
    // Mismo criterio que el correlativo de User ID: GET_LOCK serializa a los
    // emisores concurrentes (MAX es un agregado y no admite FOR UPDATE) y no
    // depende de que exista alguna fila que bloquear.
    const lockName = 'legal-cases-correlative'
    await client.query('SELECT GET_LOCK(?, 10)', [lockName])

    try {
      const { rows: seq } = await client.query(
        `SELECT COALESCE(MAX(CAST(NULLIF(REGEXP_REPLACE(case_number, '[^0-9]', ''), '') AS UNSIGNED)), 0) AS serial
           FROM legal_cases`,
      )
      const caseNumber = `EXP-${new Date().getFullYear()}-${String(Number(seq[0].serial) + 1).padStart(4, '0')}`

      const { insertId } = await client.query(
        `INSERT INTO legal_cases
           (case_number, title, client_name, assigned_lawyer_id, status, matter, court, stage, risk_level, progress, deadline, is_privileged)
         VALUES (?, ?, ?,
                 (SELECT id FROM users WHERE user_code = ?),
                 ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          caseNumber,
          String(title).trim(),
          String(clientName).trim(),
          ownerUserCode ?? null,
          status,
          String(matter ?? '').trim() || null,
          String(court ?? '').trim() || null,
          String(stage ?? '').trim() || null,
          riskLevel,
          progressNum,
          deadline || null,
          Boolean(isPrivileged),
        ],
      )

      // MySQL no soporta RETURNING: se recupera el correlativo por LAST insert id.
      const { rows: inserted } = await client.query(
        'SELECT id, case_number FROM legal_cases WHERE id = ?',
        [insertId],
      )
      return inserted[0]
    } finally {
      await client.query('SELECT RELEASE_LOCK(?)', [lockName])
    }
  })

  record('CASE_CREATED', {
    userCode: req.user.user_code,
    req,
    details: { caseNumber: created.case_number, title: String(title).trim(), riskLevel },
  })

  const detail = await one(`${SELECT_CASE} WHERE c.id = ?`, [created.id])
  res.status(201).json({ message: 'Expediente creado', case: detail })
}

/* -------------------------------------------------------------------------- */
/* PUT /api/cases/:id                                                          */
/* -------------------------------------------------------------------------- */

const UPDATABLE = {
  title: 'title',
  clientName: 'client_name',
  status: 'status',
  matter: 'matter',
  court: 'court',
  stage: 'stage',
  riskLevel: 'risk_level',
  progress: 'progress',
  deadline: 'deadline',
  isPrivileged: 'is_privileged',
}

async function updateCase(req, res) {
  const { params, scope } = findOneOr404(req)
  const existing = await one('SELECT id, assigned_lawyer_id, case_number FROM legal_cases WHERE id = ?', params)
  if (!existing) throw notFound(`No existe el expediente con id ${params[0]}`)

  if (!scope.all && existing.assigned_lawyer_id !== scope.userId) {
    throw forbidden('No tiene acceso a este expediente: pertenece a otro abogado asignado')
  }

  const sets = []
  const values = []

  for (const [key, column] of Object.entries(UPDATABLE)) {
    if (!(key in req.body)) continue
    if (key === 'status' && !CASE_STATUSES.includes(req.body[key])) {
      throw badRequest(`status debe ser uno de: ${CASE_STATUSES.join(', ')}`)
    }
    if (key === 'riskLevel' && !RISK_LEVELS.includes(req.body[key])) {
      throw badRequest(`riskLevel debe ser uno de: ${RISK_LEVELS.join(', ')}`)
    }
    values.push(req.body[key])
    sets.push(`${column} = ?`)
  }

  if (sets.length === 0) throw badRequest('No se envio ningun campo actualizable')

  const updated = await withTransaction(async (client) => {
    await client.query(
      `UPDATE legal_cases SET ${sets.join(', ')} WHERE id = ?`,
      [...values, existing.id],
    )
    // MySQL no soporta RETURNING: se reutiliza la fila leida al validar.
    return { id: existing.id, case_number: existing.case_number }
  })

  record('CASE_UPDATED', {
    userCode: req.user.user_code,
    req,
    details: { caseNumber: updated.case_number, fields: Object.keys(req.body).filter((k) => k in UPDATABLE) },
  })

  const detail = await one(`${SELECT_CASE} WHERE c.id = ?`, [params[0]])
  res.json({ message: 'Expediente actualizado', case: detail })
}

/* -------------------------------------------------------------------------- */
/* DELETE /api/cases/:id  (archivo logico)                                     */
/* -------------------------------------------------------------------------- */

/**
 * No se borra fisicamente: la evidencia debe conservarse. DELETE marca el
 * expediente como `archivado` con su sello temporal (A.5.28 / retencion).
 */
async function archiveCase(req, res) {
  const { params, scope } = findOneOr404(req)
  const existing = await one('SELECT id, assigned_lawyer_id, status FROM legal_cases WHERE id = ?', params)
  if (!existing) throw notFound(`No existe el expediente con id ${params[0]}`)

  if (!scope.all && existing.assigned_lawyer_id !== scope.userId) {
    throw forbidden('No tiene acceso a este expediente: pertenece a otro abogado asignado')
  }
  if (existing.status === 'archivado') throw badRequest('El expediente ya estaba archivado')

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE legal_cases
          SET status = 'archivado', archived_at = now()
        WHERE id = ?`,
      params,
    )
  })

  record('CASE_ARCHIVED', {
    userCode: req.user.user_code,
    req,
    details: { caseId: params[0] },
  })

  const detail = await one(`${SELECT_CASE} WHERE c.id = ?`, params)
  res.json({ message: 'Expediente archivado (retencion de evidencia)', case: detail })
}

/* -------------------------------------------------------------------------- */
/* Auxiliares                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Valida el id de ruta y devuelve `{ params, scope }`.
 * La existencia se comprueba en cada controller para poder responder 404 (id
 * inexistente) o 403 (expediente de otro abogado) con mensajes distintos.
 */
function findOneOr404(req) {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id < 1) throw badRequest('El id del expediente debe ser un entero positivo')
  return { params: [id], scope: req.scope }
}

module.exports = { listCases, getCase, createCase, updateCase, archiveCase, CASE_STATUSES, RISK_LEVELS }