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

const { rows, withTransaction } = require('../config/db')
const { record } = require('../services/auditService')
const { badRequest, unprocessable } = require('../utils/errors')

/* -------------------------------------------------------------------------- */
/* GET /api/roles/matrix                                                       */
/* -------------------------------------------------------------------------- */

async function getMatrix(_req, res) {
  const [roleList, permissionList, grants] = await Promise.all([
    rows('SELECT id, code, name, description FROM roles ORDER BY name'),
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

  const roleCodes = [...new Set(entries.map((g) => g.role))]
  const permissionCodes = [...new Set(entries.map((g) => g.permission))]

  const [existingRoles, existingPermissions] = await Promise.all([
    rows('SELECT code FROM roles WHERE code = ANY($1::text[])', [roleCodes]),
    rows('SELECT code FROM permissions WHERE code = ANY($1::text[])', [permissionCodes]),
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
          `INSERT INTO role_permissions (role_id, permission_id, granted_by)
           SELECT r.id, p.id, $3 FROM roles r, permissions p
            WHERE r.code = $1 AND p.code = $2
           ON CONFLICT (role_id, permission_id) DO NOTHING`,
          [entry.role, entry.permission, req.user.user_code],
        )
        if (rowCount > 0) applied.push({ ...entry, effect: 'concedido' })
      } else {
        const { rowCount } = await client.query(
          `DELETE FROM role_permissions rp
             USING roles r, permissions p
            WHERE rp.role_id = r.id AND rp.permission_id = p.id
              AND r.code = $1 AND p.code = $2`,
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

/** Restaura la matriz inicial declarada en database/seed.sql. */
async function resetMatrix(req, res) {
  const BASELINE = {
    socio: [
      'CASES_CREATE', 'CASES_READ', 'CASES_WRITE', 'CASES_ARCHIVE',
      'DOCS_REVEAL', 'DOCS_DOWNLOAD', 'LOGS_VIEW', 'LOGS_EXPORT',
      'AUDIT_RECEIPT', 'RBAC_MANAGE', 'TOKEN_RESET', 'RISK_ASSESS',
    ],
    abogado: ['CASES_CREATE', 'CASES_READ', 'CASES_WRITE', 'DOCS_REVEAL', 'LOGS_VIEW', 'AUDIT_RECEIPT', 'RISK_ASSESS'],
    asistente: ['CASES_CREATE', 'CASES_READ', 'CASES_WRITE', 'AUDIT_RECEIPT'],
    cliente: ['CASES_READ'],
  }

  await withTransaction(async (client) => {
    await client.query('DELETE FROM role_permissions')
    for (const [role, permissions] of Object.entries(BASELINE)) {
      await client.query(
        `INSERT INTO role_permissions (role_id, permission_id, granted_by)
         SELECT r.id, p.id, $3
           FROM roles r JOIN permissions p ON p.code = ANY($2::text[])
          WHERE r.code = $1
         ON CONFLICT DO NOTHING`,
        [role, permissions, req.user.user_code],
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

module.exports = { getMatrix, updatePermissions, resetMatrix }