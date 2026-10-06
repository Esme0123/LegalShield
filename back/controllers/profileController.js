'use strict'

/**
 * Perfil del usuario autenticado.
 *
 * GET  /api/auth/profile        -> identidad visible del titular
 * PUT  /api/auth/profile        -> edicion autoexigible (nombre, correo, despacho,
 *                                  departamento, telefono). No toca el rol: el rol
 *                                  lo concede el administrador, no el usuario.
 * PUT  /api/auth/password       -> cambio de clave con validacion de la actual y
 *                                  bloqueo de reutilizacion de las ultimas 5.
 */

const bcrypt = require('bcryptjs')
const { one, rows, withTransaction } = require('../config/db')
const { record } = require('../services/auditService')
const { badRequest, conflict, unauthorized, unprocessable } = require('../utils/errors')
const { evaluatePassword, PASSWORD_HISTORY_LIMIT } = require('../utils/passwordPolicy')
const { sanitizeEmail, normalizeUsername } = require('../utils/identity')

const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || 12)

/* -------------------------------------------------------------------------- */
/* GET /api/auth/profile                                                       */
/* -------------------------------------------------------------------------- */

async function getProfile(req, res) {
  const user = await one(
    `SELECT u.id, u.user_code AS "userCode", u.username, u.email, u.firm, u.department, u.phone,
            u.failed_attempts AS "failedAttempts", u.is_locked AS "isLocked",
            u.password_updated_at AS "passwordUpdatedAt", u.created_at AS "createdAt",
            r.code AS role, r.name AS "roleLabel"
       FROM users u JOIN roles r ON r.id = u.role_id
      WHERE u.id = ?`,
    [req.user.id],
  )

  const history = await rows(
    `SELECT id, created_at AS "createdAt"
       FROM password_history
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?`,
    [req.user.id, PASSWORD_HISTORY_LIMIT],
  )

  res.json({
    profile: { ...user, permissions: req.user.permissions },
    passwordHistory: history,
    passwordHistoryLimit: PASSWORD_HISTORY_LIMIT,
  })
}

/* -------------------------------------------------------------------------- */
/* PUT /api/auth/profile                                                       */
/* -------------------------------------------------------------------------- */

const PROFILE_FIELDS = {
  firstName: 'username',
  lastName: 'username',
  email: 'email',
  firm: 'firm',
  department: 'department',
  phone: 'phone',
}

async function updateProfile(req, res) {
  const body = req.body ?? {}
  const fields = Object.keys(body).filter((key) => key in PROFILE_FIELDS)
  if (fields.length === 0) throw badRequest(`No se envio ningun campo editable. Permitidos: ${Object.keys(PROFILE_FIELDS).join(', ')}`)

  if (body.role !== undefined) {
    throw unprocessable('El rol no es autoeditable: solicite el cambio al administrador del despacho')
  }

  const sets = []
  const values = []

  if (body.email !== undefined) {
    const email = sanitizeEmail(body.email)
    if (!email) throw unprocessable('Correo institucional invalido')
    const taken = await one('SELECT id FROM users WHERE email = ? AND id <> ?', [email, req.user.id])
    if (taken) throw conflict('El correo ya pertenece a otro usuario')
    values.push(email)
    sets.push('email = ?')
  }

  if (body.firstName !== undefined || body.lastName !== undefined) {
    const current = await one('SELECT username FROM users WHERE id = ?', [req.user.id])
    const parts = String(current.username).split('.')
    const currentFirst = parts[0] ?? ''
    const currentLast = parts.slice(1).join('.')

    const first = body.firstName !== undefined ? normalizeUsername(body.firstName) : currentFirst
    const last = body.lastName !== undefined ? normalizeUsername(body.lastName) : currentLast
    const username = [first, last].filter(Boolean).join('.')

    const taken = await one('SELECT id FROM users WHERE username = ? AND id <> ?', [username, req.user.id])
    if (taken) throw conflict('Ese nombre de usuario ya esta en uso')
    values.push(username)
    sets.push('username = ?')
  }

  for (const key of ['firm', 'department', 'phone']) {
    if (body[key] === undefined) continue
    const value = String(body[key]).trim()
    values.push(value.length > 0 ? value : null)
    sets.push(`${PROFILE_FIELDS[key]} = ?`)
  }

  const updated = await withTransaction(async (client) => {
    await client.query(
      `UPDATE users SET ${sets.join(', ')} WHERE id = ?`,
      [...values, req.user.id],
    )
    return { id: req.user.id }
  })

  record('PROFILE_UPDATED', {
    userCode: req.user.user_code,
    req,
    details: { fields },
  })

  const profile = await one(
    `SELECT u.user_code AS "userCode", u.username, u.email, u.firm, u.department, u.phone,
            u.password_updated_at AS "passwordUpdatedAt", r.code AS role, r.name AS "roleLabel"
       FROM users u JOIN roles r ON r.id = u.role_id
      WHERE u.id = ?`,
    [updated.id],
  )

  res.json({ message: 'Perfil actualizado', profile })
}

/* -------------------------------------------------------------------------- */
/* PUT /api/auth/password                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Cambio de clave: valida la actual, exige complies la politica y rechaza
 * cualquier valor presente en las ultimas PASSWORD_HISTORY_LIMIT contrasenas
 * (ISO 27002 9.1.2 · reutilizacion). Al cambiar, el historico se corta al limite.
 */
async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body ?? {}

  if (!currentPassword || !newPassword) {
    throw badRequest('Debe enviar currentPassword y newPassword')
  }

  const user = await one('SELECT id, user_code, password_hash FROM users WHERE id = ?', [req.user.id])

  const matches = await bcrypt.compare(currentPassword, user.password_hash)
  if (!matches) {
    record('PASSWORD_CHANGE_FAILED', {
      userCode: user.user_code,
      req,
      details: { reason: 'clave_actual_incorrecta' },
    })
    throw unauthorized('La contrasena actual no es correcta')
  }

  if (currentPassword === newPassword) {
    throw unprocessable('La nueva contrasena debe ser distinta de la actual')
  }

  const policy = evaluatePassword(newPassword)
  if (!policy.valid) {
    throw unprocessable('La nueva contrasena no cumple la politica de seguridad', {
      failed: policy.failed,
      rules: policy.rules.map(({ id, label }) => ({ id, label })),
    })
  }

  const recent = await rows(
    'SELECT password_hash FROM password_history WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
    [user.id, PASSWORD_HISTORY_LIMIT],
  )

  for (const entry of recent) {
    // bcrypt.compare contra cada hash previo: detecta tanto la clave actual
    // como cualquier reutilizada, sin necesidad de comparar en texto plano.
    if (await bcrypt.compare(newPassword, entry.password_hash)) {
      throw unprocessable(
        `La nueva contrasena coincide con una de las ultimas ${PASSWORD_HISTORY_LIMIT} contrasenas del usuario`,
        { reuseBlocked: true, historyLimit: PASSWORD_HISTORY_LIMIT },
      )
    }
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS)

  await withTransaction(async (client) => {
    await client.query(
      'UPDATE users SET password_hash = ?, password_updated_at = now() WHERE id = ?',
      [passwordHash, user.id],
    )
    await client.query('INSERT INTO password_history (user_id, password_hash) VALUES (?, ?)', [
      user.id,
      passwordHash,
    ])
    // Poda: conserva solo las N contrasenas mas recientes.
    await client.query(
      `DELETE FROM password_history
        WHERE user_id = ?
          AND id NOT IN (
            SELECT id FROM password_history
             WHERE user_id = ?
             ORDER BY created_at DESC
             LIMIT ?
          )`,
      [user.id, user.id, PASSWORD_HISTORY_LIMIT],
    )
  })

  record('PASSWORD_CHANGED', {
    userCode: user.user_code,
    req,
    details: { historyLimit: PASSWORD_HISTORY_LIMIT },
  })

  res.json({ message: 'Contrasena actualizada correctamente', passwordUpdatedAt: new Date().toISOString() })
}

module.exports = { getProfile, updateProfile, changePassword }