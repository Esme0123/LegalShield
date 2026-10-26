'use strict'

/**
 * Matriz de roles y permisos (SIS-321).
 *
 * GET  /api/roles/matrix       -> matriz completa rol x permiso
 * POST /api/roles/permissions  -> actualiza asignaciones sin reiniciar el servidor
 * POST /api/roles/reset        -> restaura la matriz base
 *
 * Los cambios se aplican en una transaccion y se registran como
 * PERMISSION_CHANGED en la bitacora, attributando el User ID que los hizo.
 */

const { one, query, rows, withTransaction } = require('../config/db')
const { record } = require('../services/auditService')
const { badRequest, conflict, notFound, unprocessable } = require('../utils/errors')

/* -------------------------------------------------------------------------- */
/* GET /api/roles/matrix                                                       */
/* -------------------------------------------------------------------------- */

async function getMatrix(_req, res) {
  const [roleList, permissionList, grants] = await Promise.all([
    // Orden de alta (OSI, Socio, Abogado, Asistente, Cliente y luego los roles nuevos):
    // es el orden en que el frontend siempre mostro los roles.
    rows('SELECT id, code, name, description FROM roles ORDER BY id'),
    rows('SELECT id, code, description FROM permissions ORDER BY code'),
    rows(
      `SELECT r.code AS role_code, p.code AS permission_code, rp.granted_at, rp.granted_by
         FROM role_permissions rp
         JOIN roles       r ON r.id = rp.role_id
         JOIN permissions p ON p.id = rp.permission_id
        ORDER BY r.code, p.code`,
    ),
  ])

  const permissionCodes = permissionList.map((p) => p.code)

  // Matriz en forma de objeto: { abogado: ['CASES_READ', ...], ... }
  const assignments = {}
  for (const role of roleList) assignments[role.code] = []
  for (const grant of grants) {
    assignments[grant.role_code]?.push(grant.permission_code)
  }

  res.json({
    roles: roleList.map(({ id, code, name, description }) => ({ id, code, name, description })),
    permissions: permissionList.map(({ code, description }) => ({ code, description })),
    assignments,
    matrix: roleList.map((role) => ({
      role: role.code,
      roleLabel: role.name,
      grants: permissionCodes.filter((code) => assignments[role.code]?.includes(code)),
    })),
  })
}

/** Concesiones que el rol indicado nunca puede perder desde la matriz. */
const PROTECTED_GRANTS = { osi: ['ROLES_MANAGE', 'RBAC_MANAGE'] }

/* -------------------------------------------------------------------------- */
/* POST /api/roles/permissions                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Cuerpo esperado (actualizacion dinamica desde la interfaz):
 *   { grants: [{ role: 'abogado', permission: 'LOGS_VIEW', granted: true }] }
 *
 * Se procesa todo el lote en una sola transaccion para que la matriz nunca quede
 * a medio aplicar, y se valida que cada rol y permiso existan en el catalogo.
 */
async function updatePermissions(req, res) {
  const grants = req.body?.grants
  if (!Array.isArray(grants) || grants.length === 0) {
    throw badRequest('Se esperaba { grants: [{ role, permission, granted }] } con al menos una entrada')
  }

  const entries = grants.map((g) => ({
    role: String(g?.role ?? '').trim().toLowerCase(),
    permission: String(g?.permission ?? '').trim().toUpperCase(),
    granted: Boolean(g?.granted),
  }))

  const invalid = entries.find((g) => !g.role || !g.permission)
  if (invalid) throw unprocessable('Cada entrada debe traer role y permission', { entry: invalid })

  // Proteccion contra el autobloqueo: si el OSI perdiera ROLES_MANAGE o RBAC_MANAGE,
  // nadie podria volver a administrar la matriz. Se rechaza el lote completo.
  const blocked = entries.filter((g) => !g.granted && PROTECTED_GRANTS[g.role]?.includes(g.permission))
  if (blocked.length > 0) {
    record('PERMISSION_CHANGE_BLOCKED', {
      userCode: req.user.user_code,
      req,
      details: { blocked: blocked.map(({ role, permission }) => ({ role, permission })) },
    })
    throw unprocessable('El rol osi no puede perder ROLES_MANAGE ni RBAC_MANAGE: nadie podria administrar la seguridad', {
      blocked: blocked.map(({ role, permission }) => ({ role, permission })),
    })
  }

  const roleCodes = [...new Set(entries.map((g) => g.role))]
  const permissionCodes = [...new Set(entries.map((g) => g.permission))]

  const [existingRoles, existingPermissions] = await Promise.all([
    rows('SELECT code FROM roles WHERE code IN (?)', [roleCodes]),
    rows('SELECT code FROM permissions WHERE code IN (?)', [permissionCodes]),
  ])

  const knownRoles = new Set(existingRoles.map((r) => r.code))
  const knownPermissions = new Set(existingPermissions.map((p) => p.code))

  const unknownRoles = roleCodes.filter((c) => !knownRoles.has(c))
  const unknownPermissions = permissionCodes.filter((c) => !knownPermissions.has(c))
  if (unknownRoles.length > 0 || unknownPermissions.length > 0) {
    throw unprocessable('Rol o permiso inexistente en el catalogo', { unknownRoles, unknownPermissions })
  }

  const changed = await withTransaction(async (client) => {
    const applied = []

    for (const entry of entries) {
      if (entry.granted) {
        const { rowCount } = await client.query(
          `INSERT IGNORE INTO role_permissions (role_id, permission_id, granted_by)
           SELECT r.id, p.id, ?
             FROM roles r JOIN permissions p ON p.code IN (?)
            WHERE r.code = ?`,
          [req.user.user_code, [entry.permission], entry.role],
        )
        if (rowCount > 0) applied.push({ ...entry, effect: 'concedido' })
      } else {
        const { rowCount } = await client.query(
          `DELETE rp FROM role_permissions rp
             JOIN roles r ON r.id = rp.role_id
             JOIN permissions p ON p.id = rp.permission_id
            WHERE r.code = ? AND p.code = ?`,
          [entry.role, entry.permission],
        )
        if (rowCount > 0) applied.push({ ...entry, effect: 'revocado' })
      }
    }

    return applied
  })

  if (changed.length > 0) {
    record('PERMISSION_CHANGED', {
      userCode: req.user.user_code,
      req,
      details: { changes: changed },
    })
  }

  // Se devuelve la matriz completa ya aplicada: el frontend la repinta sin
  // recargar y sin pedir una segunda consulta.
  const [roles, permissions, appliedGrants] = await Promise.all([
    rows('SELECT code, name FROM roles ORDER BY name'),
    rows('SELECT code, description FROM permissions ORDER BY code'),
    rows(
      `SELECT r.code AS role_code, p.code AS permission_code
         FROM role_permissions rp
         JOIN roles r ON r.id = rp.role_id
         JOIN permissions p ON p.id = rp.permission_id`,
    ),
  ])

  const assignments = Object.fromEntries(roles.map((r) => [r.code, []]))
  for (const g of appliedGrants) assignments[g.role_code]?.push(g.permission_code)

  res.json({
    message: `Matriz actualizada: ${changed.length} cambio(s) aplicado(s)`,
    applied: changed,
    roles,
    permissions,
    assignments,
  })
}

/* -------------------------------------------------------------------------- */
/* POST /api/roles/reset                                                       */
/* -------------------------------------------------------------------------- */

/** Restaura la matriz base de segregacion (misma que el seed del sistema). */
async function resetMatrix(req, res) {
  const BASELINE = {
    osi: [
      'USERS_MANAGE', 'USERS_READ', 'USERS_CREATE', 'USERS_UPDATE', 'USERS_DELETE',
      'USERS_UNLOCK', 'ACCOUNT_UNLOCK',
      'ROLES_MANAGE', 'RBAC_MANAGE', 'TOKEN_RESET',
      'SECURITY_LOGS_VIEW', 'LOGS_VIEW', 'LOGS_EXPORT', 'CASES_READ',
    ],
    socio: [
      'CASES_CREATE', 'CASES_READ', 'CASES_WRITE', 'CASES_ARCHIVE',
      'DOCS_REVEAL', 'DOCS_DOWNLOAD', 'LOGS_VIEW', 'LOGS_EXPORT',
      'AUDIT_RECEIPT', 'RISK_ASSESS',
    ],
    abogado: ['CASES_CREATE', 'CASES_READ', 'CASES_WRITE', 'DOCS_REVEAL', 'LOGS_VIEW', 'AUDIT_RECEIPT', 'RISK_ASSESS'],
    asistente: ['CASES_CREATE', 'CASES_READ', 'CASES_WRITE', 'AUDIT_RECEIPT'],
    cliente: ['CASES_READ'],
  }

  await withTransaction(async (client) => {
    await client.query('DELETE FROM role_permissions')
    for (const [role, permissions] of Object.entries(BASELINE)) {
      await client.query(
        `INSERT IGNORE INTO role_permissions (role_id, permission_id, granted_by)
         SELECT r.id, p.id, ?
           FROM roles r JOIN permissions p ON p.code IN (?)
          WHERE r.code = ?`,
        [req.user.user_code, permissions, role],
      )
    }
  })

  record('PERMISSION_CHANGED', {
    userCode: req.user.user_code,
    req,
    details: { action: 'reset_matriz', roles: Object.keys(BASELINE) },
  })

  res.json({ message: 'Matriz restaurada a la configuracion base' })
}

/* -------------------------------------------------------------------------- */
/* POST /api/roles · DELETE /api/roles/:code                                   */
/* -------------------------------------------------------------------------- */

const ROLE_CODE_RE = /^[a-z][a-z_]{2,31}$/
/** Rol del Oficial de Seguridad: eliminarlo dejaria el sistema sin administrador. */
const PROTECTED_ROLES = ['osi']

/** Crea un rol sin permisos: el OSI los concede despues de forma explicita (menor privilegio). */
async function createRole(req, res) {
  const code = String(req.body?.code ?? '').trim().toLowerCase()
  const name = String(req.body?.name ?? '').trim()
  const description = String(req.body?.description ?? '').trim()

  if (!ROLE_CODE_RE.test(code)) {
    throw unprocessable('Codigo de rol invalido', { pattern: ROLE_CODE_RE.source })
  }
  if (name.length < 3 || name.length > 80) {
    throw unprocessable('El nombre del rol debe tener entre 3 y 80 caracteres')
  }
  if (description.length > 500) {
    throw unprocessable('La descripcion no puede superar 500 caracteres')
  }

  const existing = await one('SELECT id FROM roles WHERE code = ? OR name = ?', [code, name])
  if (existing) throw conflict('Ya existe un rol con ese codigo o nombre')

  const created = await withTransaction(async (client) => {
    const { insertId } = await client.query(
      'INSERT INTO roles (code, name, description) VALUES (?, ?, ?)',
      [code, name, description || null],
    )
    return insertId
  })

  record('ROLE_CREATED', {
    userCode: req.user.user_code,
    req,
    details: { role: code, name },
  })

  res.status(201).json({
    message: `Rol ${code} creado`,
    role: { id: created, code, name, description: description || null },
  })
}

/** Elimina un rol sin usuarios asignados. El rol osi es intocable. */
async function deleteRole(req, res) {
  const code = String(req.params.code ?? '').trim().toLowerCase()
  if (PROTECTED_ROLES.includes(code)) {
    throw conflict('El rol osi no puede eliminarse')
  }

  const role = await one('SELECT id, code, name FROM roles WHERE code = ?', [code])
  if (!role) throw notFound(`No existe el rol ${code}`)

  const assigned = await one('SELECT COUNT(*) AS total FROM users WHERE role_id = ?', [role.id])
  if (Number(assigned.total) > 0) {
    throw conflict(`El rol ${code} tiene ${assigned.total} usuario(s) asignado(s)`)
  }

  // role_permissions cae por ON DELETE CASCADE; users usa RESTRICT como red de seguridad.
  await query('DELETE FROM roles WHERE id = ?', [role.id])

  record('ROLE_DELETED', {
    userCode: req.user.user_code,
    req,
    details: { role: code, name: role.name },
  })

  res.json({ message: `Rol ${code} eliminado` })
}

/**
 * Renombra o describe un rol. El codigo es inmutable: los permisos, los tokens
 * y los registros de auditoria lo referencian, asi que solo cambian nombre y descripcion.
 */
async function updateRole(req, res) {
  const code = String(req.params.code ?? '').trim().toLowerCase()
  const role = await one('SELECT id, code, name, description FROM roles WHERE code = ?', [code])
  if (!role) throw notFound(`No existe el rol ${code}`)

  const body = req.body ?? {}
  const hasName = body.name !== undefined
  const hasDescription = body.description !== undefined
  if (!hasName && !hasDescription) {
    throw badRequest('Se esperaba al menos name o description')
  }

  const name = hasName ? String(body.name ?? '').trim() : role.name
  const description = hasDescription ? String(body.description ?? '').trim() : (role.description ?? '')

  if (name.length < 3 || name.length > 80) {
    throw unprocessable('El nombre del rol debe tener entre 3 y 80 caracteres')
  }
  if (description.length > 500) {
    throw unprocessable('La descripcion no puede superar 500 caracteres')
  }

  const duplicate = await one('SELECT id FROM roles WHERE name = ? AND id <> ?', [name, role.id])
  if (duplicate) throw conflict('Ya existe otro rol con ese nombre')

  await query('UPDATE roles SET name = ?, description = ? WHERE id = ?', [name, description || null, role.id])

  record('ROLE_UPDATED', {
    userCode: req.user.user_code,
    req,
    details: {
      role: code,
      before: { name: role.name, description: role.description },
      after: { name, description: description || null },
    },
  })

  res.json({
    message: `Rol ${code} actualizado`,
    role: { id: role.id, code, name, description: description || null },
  })
}

module.exports = { getMatrix, updatePermissions, resetMatrix, createRole, updateRole, deleteRole }