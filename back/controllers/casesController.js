'use strict'

/**
 * Expedientes judiciales.
 *
 * Control de acceso A01:2021 aplicado en dos capas:
 *   1. middleware `scopeCasesToOwner` -> quien tiene el permiso CASES_READ_ALL ve todo
 *      el despacho (socio); el resto queda acotado a los expedientes donde participa;
 *   2. cada consulta incluye el filtro por `req.scope`, de modo que la restriccion
 *      viaja en la propia sentencia SQL y no en el filtrado posterior.
 *
 * Participar en un expediente es figurar en su equipo:
 *   · assigned_lawyer_id  abogado titular (lo crea y lo lleva);
 *   · assistant_id        asistente de apoyo (edita, sin documentos confidenciales);
 *   · client_user_id      cliente vinculado (solo consulta).
 * Si un expediente no tiene equipo, solo es visible con CASES_READ_ALL.
 */

const crypto = require('crypto')
const { rows, one, query, withTransaction } = require('../config/db')
const { validateUpload, countPages, saveFile, resolveStoredFile, removeFile } = require('../services/documentStorage')
const { record } = require('../services/auditService')
const { badRequest, forbidden, notFound } = require('../utils/errors')
const { parsePagination } = require('../utils/helpers')
const { hasPermission } = require('../middlewares/rbacMiddleware')

const CASE_STATUSES = ['abierto', 'en_tramite', 'suspendido', 'archivado', 'cerrado']
const RISK_LEVELS = ['baja', 'media', 'alta', 'critica']

/** Columnas expuestas al cliente (nunca password ni hashes). */
const SELECT_CASE = `
  SELECT c.id, c.assigned_lawyer_id, c.assistant_id, c.client_user_id,
         c.case_number AS "caseNumber", c.title,
         c.client_name AS "clientName", c.status, c.matter, c.court, c.stage,
         c.risk_level AS "riskLevel", c.progress, c.deadline,
         c.is_privileged AS "isPrivileged",
         c.created_at AS "createdAt", c.updated_at AS "updatedAt", c.archived_at AS "archivedAt",
         u.user_code AS "ownerUserCode", u.username AS "ownerName",
         a.user_code AS "assistantUserCode", a.username AS "assistantName",
         cl.user_code AS "clientUserCode", cl.username AS "clientUserName",
         (SELECT COUNT(*) FROM case_documents d WHERE d.case_id = c.id) AS "documentCount",
         (SELECT COUNT(*) FROM case_documents d
           WHERE d.case_id = c.id AND d.is_privileged = FALSE AND d.classification = 'Publica') AS "publicDocumentCount"
    FROM legal_cases c
    LEFT JOIN users u ON u.id = c.assigned_lawyer_id
    LEFT JOIN users a ON a.id = c.assistant_id
    LEFT JOIN users cl ON cl.id = c.client_user_id`

/** El usuario figura en el equipo del expediente (titular, asistente o cliente). */
function isMember(scope, row) {
  return scope.all || [row.assigned_lawyer_id, row.assistant_id, row.client_user_id].includes(scope.userId)
}

/** Puede operar el expediente: titular o asistente. El cliente solo consulta. */
function canOperate(scope, row) {
  return scope.all || row.assigned_lawyer_id === scope.userId || row.assistant_id === scope.userId
}

/**
 * Sin DOCS_REVEAL (asistente, cliente) los documentos confidenciales, restringidos
 * o privilegiados no existen para el usuario: ni siquiera se listan.
 */
function documentVisibility(user) {
  return hasPermission(user, 'DOCS_REVEAL') ? '' : "AND is_privileged = FALSE AND classification = 'Publica'"
}

/**
 * Resuelve el User ID de un integrante del equipo y comprueba que sea una cuenta
 * activa con el rol esperado: nadie puede vincular a un OSI como "cliente".
 */
async function resolveMember(userCode, roles, label) {
  const code = String(userCode ?? '').trim().toUpperCase()
  if (!code) return null
  const member = await one(
    `SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id
      WHERE u.user_code = ? AND u.is_active = TRUE AND r.code IN (?)`,
    [code, roles],
  )
  if (!member) throw badRequest(`${label} ${code} no existe, esta dado de baja o no tiene el rol adecuado`)
  return member.id
}

/** WHERE dinamico: alcance por usuario + filtros de consulta. */
function buildFilters(req) {
  const where = []
  const params = []

  if (!req.scope.all) {
    where.push('(c.assigned_lawyer_id = ? OR c.assistant_id = ? OR c.client_user_id = ?)')
    params.push(req.scope.userId, req.scope.userId, req.scope.userId)
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

  const limit = parsePagination(req.query.limit, { fallback: 50, min: 1, max: 200 })
  const offset = parsePagination(req.query.offset, { fallback: 0, min: 0 })

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

  // Un expediente sin equipo solo lo abre la direccion del despacho.
  if (!isMember(scope, found)) {
    record('ACCESS_DENIED', {
      userCode: req.user.user_code,
      req,
      details: { path: req.originalUrl, reason: 'expediente_fuera_de_ambito' },
    })
    throw forbidden('No tiene acceso a este expediente: no forma parte de su equipo')
  }

  record('CASE_READ', { userCode: req.user.user_code, req, details: { caseNumber: found.caseNumber } })
  res.json({ case: found })
}

/* -------------------------------------------------------------------------- */
/* POST /api/cases                                                             */
/* -------------------------------------------------------------------------- */

async function createCase(req, res) {
  const {
    title, clientName, status = 'abierto', matter, court, stage, riskLevel = 'media', progress = 0, deadline,
    isPrivileged = false, assistantCode, clientCode,
  } = req.body ?? {}

  if (!String(title ?? '').trim()) throw badRequest('El titulo es obligatorio')
  if (!String(clientName ?? '').trim()) throw badRequest('El cliente es obligatorio')
  if (!CASE_STATUSES.includes(status)) throw badRequest(`status debe ser uno de: ${CASE_STATUSES.join(', ')}`)
  if (!RISK_LEVELS.includes(riskLevel)) throw badRequest(`riskLevel debe ser uno de: ${RISK_LEVELS.join(', ')}`)

  const progressNum = Number(progress)
  if (!Number.isFinite(progressNum) || progressNum < 0 || progressNum > 100) {
    throw badRequest('progress debe ser un entero entre 0 y 100')
  }

  // Sin alcance global, el expediente se autoasigna: el abogado no puede
  // colarse como titular de un caso ajeno. El socio puede asignarlo a un abogado.
  const ownerId = req.scope.all && req.body?.ownerUserCode
    ? await resolveMember(req.body.ownerUserCode, ['abogado', 'socio'], 'El abogado titular')
    : req.user.id
  const assistantId = await resolveMember(assistantCode, ['asistente'], 'El asistente')
  const clientUserId = await resolveMember(clientCode, ['cliente'], 'El cliente')

  const created = await withTransaction(async (client) => {
    // Mismo criterio que el correlativo de User ID: GET_LOCK serializa a los
    // emisores concurrentes (MAX es un agregado y no admite FOR UPDATE) y no
    // depende de que exista alguna fila que bloquear.
    const lockName = 'legal-cases-correlative'
    await client.query('SELECT GET_LOCK(?, 10)', [lockName])

    try {
      // El correlativo es el ultimo tramo (EXP-2026-0058 -> 58) dentro del ano en
      // curso: quitar solo los no digitos mezclaba el ano con el numero.
      const year = new Date().getFullYear()
      const { rows: seq } = await client.query(
        `SELECT COALESCE(MAX(CAST(SUBSTRING_INDEX(case_number, '-', -1) AS UNSIGNED)), 0) AS serial
           FROM legal_cases
          WHERE case_number LIKE ?`,
        [`EXP-${year}-%`],
      )
      const caseNumber = `EXP-${year}-${String(Number(seq[0].serial) + 1).padStart(4, '0')}`

      const { insertId } = await client.query(
        `INSERT INTO legal_cases
           (case_number, title, client_name, assigned_lawyer_id, assistant_id, client_user_id,
            status, matter, court, stage, risk_level, progress, deadline, is_privileged)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          caseNumber,
          String(title).trim(),
          String(clientName).trim(),
          ownerId,
          assistantId,
          clientUserId,
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
  const existing = await one(
    'SELECT id, assigned_lawyer_id, assistant_id, client_user_id, case_number, progress FROM legal_cases WHERE id = ?',
    params,
  )
  if (!existing) throw notFound(`No existe el expediente con id ${params[0]}`)

  if (!canOperate(scope, existing)) {
    throw forbidden('No puede editar este expediente: no es su titular ni su asistente')
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
    if (key === 'progress') {
      const progress = Number(req.body[key])
      if (!Number.isInteger(progress) || progress < 0 || progress > 100) {
        throw badRequest('progress debe ser un entero entre 0 y 100')
      }
      req.body[key] = progress
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

  const fields = Object.keys(req.body).filter((key) => key in UPDATABLE)
  const progressChanged = fields.includes('progress') && req.body.progress !== existing.progress
  await record(progressChanged ? 'CASE_PROGRESS_UPDATED' : 'CASE_UPDATED', {
    userCode: req.user.user_code,
    req,
    details: {
      caseNumber: updated.case_number,
      fields,
      ...(progressChanged
        ? {
            previousProgress: existing.progress,
            progress: req.body.progress,
            message: `Avance de ${updated.case_number}: ${existing.progress}% a ${req.body.progress}%`,
          }
        : {}),
    },
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
    throw forbidden('Solo el abogado titular o la direccion del despacho pueden archivar el expediente')
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
/* GET /api/cases/:id/documents                                                */
/* -------------------------------------------------------------------------- */

/** Metadatos de la prueba documental. El contenido nunca viaja en el listado. */
async function listDocuments(req, res) {
  const target = await findScopedCase(req)
  const documents = await rows(
    `SELECT id, document_code AS "documentCode", filename AS "name", classification,
            is_privileged AS "isPrivileged", mime_type AS "mimeType",
            page_count AS "pages", checksum, created_at AS "createdAt",
            file_path IS NOT NULL AS "hasFile", size_bytes AS "sizeBytes", uploaded_by AS "uploadedBy"
       FROM case_documents
      WHERE case_id = ? ${documentVisibility(req.user)}
      ORDER BY is_privileged ASC, id ASC`,
    [target.id],
  )
  const countRow = await one('SELECT COUNT(*) AS total FROM case_documents WHERE case_id = ?', [target.id])

  res.json({
    caseId: target.caseNumber,
    total: documents.length,
    // Documentos que existen pero que el rol no puede ver (confidenciales).
    hidden: Number(countRow.total) - documents.length,
    documents: documents.map((doc) => ({
      ...doc,
      isPrivileged: Boolean(doc.isPrivileged),
      hasFile: Boolean(doc.hasFile),
    })),
  })
}

/* -------------------------------------------------------------------------- */
/* POST /api/cases/:id/documents/reveal                                        */
/* -------------------------------------------------------------------------- */

/**
 * Entrega el contenido de un documento. La ruta exige DOCS_REVEAL y registra
 * cada revelacion (incluida la justificacion) en activity_logs.
 */
async function revealDocument(req, res) {
  const target = await findScopedCase(req)
  const documentId = Number(req.body?.documentId)
  if (!Number.isInteger(documentId) || documentId < 1) {
    throw badRequest('documentId debe ser un entero positivo')
  }

  const justification = String(req.body?.justification ?? '').trim().slice(0, 500)
  const document = await one(
    `SELECT id, document_code AS "documentCode", filename AS "name", classification,
            is_privileged AS "isPrivileged", mime_type AS "mimeType",
            page_count AS "pages", checksum, content, created_at AS "createdAt"
       FROM case_documents
      WHERE id = ? AND case_id = ?`,
    [documentId, target.id],
  )
  if (!document) throw notFound(`No existe el documento ${documentId} en el expediente ${target.caseNumber}`)

  const countRow = await one('SELECT COUNT(*) AS total FROM case_documents WHERE case_id = ?', [target.id])
  await record('DOCUMENT_REVEALED', {
    userCode: req.user.user_code,
    req,
    details: {
      caseNumber: target.caseNumber,
      documentCode: document.documentCode,
      classification: document.classification,
      justification: justification || 'sin justificacion',
      message: `${document.documentCode} revelado en ${target.caseNumber} · ${justification || 'sin justificacion'}`,
    },
  })

  res.json({
    message: 'Documento revelado bajo justificacion registrada',
    caseId: target.caseNumber,
    documentCount: Number(countRow.total),
    justification: justification || 'sin justificacion',
    document: { ...document, isPrivileged: Boolean(document.isPrivileged) },
  })
}

/* -------------------------------------------------------------------------- */
/* POST /api/cases/:id/documents                                               */
/* -------------------------------------------------------------------------- */

const DOC_CLASSIFICATIONS = ['Publica', 'Uso interno', 'Restringida', 'Confidencial']

/**
 * Sube prueba documental al expediente. Solo el equipo que opera el caso
 * (titular, asistente o socio). Sin DOCS_REVEAL el documento queda siempre
 * como Publico: quien no puede ver confidenciales tampoco puede crearlos.
 *
 * Cuerpo: { filename, data (base64), classification, isPrivileged }
 */
async function uploadDocument(req, res) {
  const { params, scope } = findOneOr404(req)
  const target = await one(
    'SELECT id, case_number, assigned_lawyer_id, assistant_id, client_user_id, status FROM legal_cases WHERE id = ?',
    params,
  )
  if (!target) throw notFound(`No existe el expediente con id ${params[0]}`)
  if (!canOperate(scope, target)) {
    throw forbidden('Solo el titular o el asistente del expediente pueden subir documentos')
  }
  if (target.status === 'archivado') throw badRequest('El expediente esta archivado: no admite documentos nuevos')

  const canConfidential = hasPermission(req.user, 'DOCS_REVEAL')
  const classification = canConfidential ? String(req.body?.classification ?? 'Publica') : 'Publica'
  if (!DOC_CLASSIFICATIONS.includes(classification)) {
    throw badRequest(`classification debe ser una de: ${DOC_CLASSIFICATIONS.join(', ')}`)
  }
  const isPrivileged = canConfidential && Boolean(req.body?.isPrivileged)

  const file = validateUpload({ filename: req.body?.filename, data: req.body?.data })
  const checksum = crypto.createHash('sha256').update(file.buffer).digest('hex')
  const storedName = await saveFile(file.buffer, file.ext)

  let created
  try {
    // DOC-2026-0014-04: mismo correlativo que el expediente + numero de documento.
    const prefix = `DOC-${target.case_number.replace(/^EXP-/, '')}-`
    const last = await one(
      `SELECT COALESCE(MAX(CAST(SUBSTRING_INDEX(document_code, '-', -1) AS UNSIGNED)), 0) AS n
         FROM case_documents WHERE document_code LIKE ?`,
      [`${prefix}%`],
    )
    const documentCode = `${prefix}${String(Number(last.n) + 1).padStart(2, '0')}`
    const { insertId } = await query(
      `INSERT INTO case_documents
         (case_id, document_code, filename, classification, is_privileged, mime_type, page_count,
          checksum, file_path, size_bytes, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        target.id, documentCode, file.filename, classification, isPrivileged, file.mime,
        countPages(file.buffer, file.ext), checksum, storedName, file.buffer.length, req.user.user_code,
      ],
    )
    created = { id: insertId, documentCode }
  } catch (err) {
    await removeFile(storedName)
    throw err
  }

  await record('DOCUMENT_UPLOADED', {
    userCode: req.user.user_code,
    req,
    details: {
      caseNumber: target.case_number,
      documentCode: created.documentCode,
      filename: file.filename,
      classification,
      sizeBytes: file.buffer.length,
    },
  })

  res.status(201).json({
    message: 'Documento agregado a la prueba documental',
    document: {
      id: created.id,
      documentCode: created.documentCode,
      name: file.filename,
      classification,
      isPrivileged,
      mimeType: file.mime,
      sizeBytes: file.buffer.length,
      checksum,
      hasFile: true,
    },
  })
}

/* -------------------------------------------------------------------------- */
/* GET /api/cases/:id/documents/:docId/file                                    */
/* -------------------------------------------------------------------------- */

/**
 * Descarga el archivo original. Exige DOCS_DOWNLOAD (ruta), ser del equipo del
 * expediente y, si el documento es restringido, DOCS_REVEAL: un documento que
 * el rol no puede listar tampoco se puede descargar.
 */
async function downloadDocument(req, res) {
  const target = await findScopedCase(req)
  const documentId = Number(req.params.docId)
  if (!Number.isInteger(documentId) || documentId < 1) throw badRequest('El id del documento debe ser un entero positivo')

  const document = await one(
    `SELECT id, document_code, filename, mime_type, file_path
       FROM case_documents
      WHERE id = ? AND case_id = ? ${documentVisibility(req.user)}`,
    [documentId, target.id],
  )
  if (!document) throw notFound(`No existe el documento ${documentId} en el expediente ${target.caseNumber}`)
  if (!document.file_path) {
    throw notFound('Este documento es de demostracion y no tiene archivo adjunto')
  }

  await record('DOCUMENT_DOWNLOADED', {
    userCode: req.user.user_code,
    req,
    details: { caseNumber: target.caseNumber, documentCode: document.document_code, filename: document.filename },
  })

  res.setHeader('Content-Type', document.mime_type)
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${document.filename.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(document.filename)}`,
  )
  res.setHeader('Cache-Control', 'no-store')
  res.sendFile(resolveStoredFile(document.file_path))
}

/* -------------------------------------------------------------------------- */
/* GET /api/cases/assignees                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Cuentas activas que se pueden sumar al equipo de un expediente nuevo. Solo
 * expone User ID y codigo: quien crea expedientes no administra usuarios. Los
 * abogados titulares solo se listan a quien puede asignar casos (socio).
 */
async function listAssignees(req, res) {
  const roles = req.scope.all ? ['asistente', 'cliente', 'abogado'] : ['asistente', 'cliente']
  const people = await rows(
    `SELECT u.user_code AS "userCode", u.username, r.code AS role
       FROM users u JOIN roles r ON r.id = u.role_id
      WHERE u.is_active = TRUE AND r.code IN (?)
      ORDER BY u.username`,
    [roles],
  )
  res.json({
    lawyers: people.filter((p) => p.role === 'abogado'),
    assistants: people.filter((p) => p.role === 'asistente'),
    clients: people.filter((p) => p.role === 'cliente'),
  })
}

/* -------------------------------------------------------------------------- */
/* Auxiliares                                                                  */
/* -------------------------------------------------------------------------- */

/** Valida id, existencia y alcance del expediente antes de operar documentos. */
async function findScopedCase(req) {
  const { params, scope } = findOneOr404(req)
  const found = await one(
    'SELECT id, case_number, assigned_lawyer_id, assistant_id, client_user_id FROM legal_cases WHERE id = ?',
    params,
  )
  if (!found) throw notFound(`No existe el expediente con id ${params[0]}`)
  if (!isMember(scope, found)) {
    throw forbidden('No tiene acceso a este expediente: no forma parte de su equipo')
  }
  return { id: found.id, caseNumber: found.case_number }
}

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

module.exports = {
  listCases,
  getCase,
  createCase,
  updateCase,
  archiveCase,
  listDocuments,
  revealDocument,
  uploadDocument,
  downloadDocument,
  listAssignees,
  CASE_STATUSES,
  RISK_LEVELS,
}