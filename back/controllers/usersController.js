'use strict'

/**
 * ABM granular de usuarios.
 *
 *   GET   /api/users            -> USERS_READ   (lista + detalles)
 *   POST  /api/users            -> USERS_CREATE (regla nombre.apellido, 9.1)
 *   PUT   /api/users/:id        -> USERS_UPDATE (datos personales, rol o estado)
 *   PATCH /api/users/:id/status -> USERS_DELETE (baja logica / reactivacion)
 *   POST  /api/users/:id/unlock -> USERS_UNLOCK (desbloquear y resetear clave)
 *
 * La baja es logica: `is_active = FALSE`. Las cuentas desactivadas no pueden
 * iniciar sesion (los comprueba authController) pero conservan su historial.
 */

const crypto = require('crypto')
const bcrypt = require('bcryptjs')
const { one, rows, withTransaction } = require('../config/db')
const { record } = require('../services/auditService')
const { badRequest, conflict, notFound, unprocessable } = require('../utils/errors')
const { evaluatePassword, PASSWORD_HISTORY_LIMIT } = require('../utils/passwordPolicy')
const {
  generateUserCode,
  sanitizeEmail,
  buildUsername,
  findAvailableUsername,
} = require('../utils/identity')

const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || 12)

/** Clave temporal que cumple la politica 9.3 (>= 12 chars, 4 clases). */
function generateTempPassword() {
  return `${crypto.randomBytes(9).toString('base64url')}Aa1!`
}

/** Columnas del directorio expuestas al ABM (nunca hashes). */
const SELECT_USER = `
  SELECT u.id, u.user_code AS "userCode", u.username, u.email,
         u.firm, u.department, u.phone,
         u.failed_attempts AS "failedAttempts", u.is_locked AS "isLocked",
         u.is_active AS "isActive", u.locked_at AS "lockedAt",
         u.created_at AS "createdAt", u.updated_at AS "updatedAt",
         r.code AS role, r.name AS "roleLabel"
    FROM users u
    JOIN roles r ON r.id = u.role_id`

function parseId(req) {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) throw unprocessable('Identificador de usuario invalido')
  return id
}

function userPayload(row) {
  return {
    id: row.id,
    userCode: row.userCode,
    username: row.username,
    email: row.email,
    firm: row.firm,
    department: row.department,
    phone: row.phone,
    failedAttempts: row.failedAttempts,
    isLocked: row.isLocked,
    isActive: row.isActive,
    lockedAt: row.lockedAt,
    createdAt: row.createdAt,
    role: row.role,
    roleLabel: row.roleLabel,
  }
}

/* -------------------------------------------------------------------------- */
/* GET /api/users                                                              */
/* -------------------------------------------------------------------------- */

async function listUsers(req, res) {
  const where = []
  const params = []

  const { search, state } = req.query
  if (search) {
    const like = `%${String(search).trim()}%`
    where.push('(u.username LIKE ? OR u.email LIKE ? OR u.user_code LIKE ? OR u.department LIKE ?)')
    params.push(like, like, like, like)
  }
  if (state === 'activo') {
    where.push('u.is_active = TRUE AND u.is_locked = FALSE')
  } else if (state === 'bloqueado') {
    where.push('u.is_locked = TRUE')
  } else if (state === 'inactivo') {
    where.push('u.is_active = FALSE')
  }

  const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''
  const limit = Math.min(Number(req.query.limit || 100), 200)
  const offset = Math.max(Number(req.query.offset || 0), 0)

  const result = await rows(
    `${SELECT_USER}
     ${clause}
     ORDER BY u.created_at DESC, u.id DESC
     LIMIT ${limit} OFFSET ${offset}`,
    params,
  )

  res.json({ total: result.length, limit, offset, users: result.map(userPayload) })
}

/* -------------------------------------------------------------------------- */
/* POST /api/users                                                             */
/* -------------------------------------------------------------------------- */

async function createUser(req, res) {
  const { firstName, lastName, email, role, firm, department, phone, password } = req.body ?? {}

  const missing = ['firstName', 'lastName', 'email', 'role'].filter((f) => !String(req.body?.[f] ?? '').trim())
  if (missing.length > 0) throw badRequest('Campos obligatorios incompletos', { missing })

  const cleanEmail = sanitizeEmail(email)
  if (!cleanEmail) throw unprocessable('Correo institucional invalido')

  const roleRow = await one('SELECT id, code FROM roles WHERE code = ?', [
    String(role).trim().toLowerCase(),
  ])
  if (!roleRow) throw unprocessable('El rol solicitado no existe en el catalogo', { role })

  const existingEmail = await one('SELECT user_code FROM users WHERE email = ?', [cleanEmail])
  if (existingEmail) throw conflict(`El correo ya esta registrado como ${existingEmail.user_code}`)

  // Si el administrador no entrega clave, el servidor emite una temporal segura
  // y la devuelve una sola vez para que pueda compartirla con el titular.
  let passwordHash
  let tempPassword = null
  if (typeof password === 'string' && password.trim().length > 0) {
    const policy = evaluatePassword(password)
    if (!policy.valid) {
      throw unprocessable('La contrasena no cumple la politica de seguridad', {
        failed: policy.failed,
        rules: policy.rules.map(({ id, label }) => ({ id, label })),
      })
    }
    passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)
  } else {
    tempPassword = generateTempPassword()
    passwordHash = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS)
  }

  const baseUsername = buildUsername(firstName, lastName)

  const userId = await withTransaction(async (client) => {
    const userCode = await generateUserCode(client)
    const username = await findAvailableUsername(client, baseUsername)

    const { insertId } = await client.query(
      `INSERT INTO users (user_code, username, email, password_hash, role_id, firm, department, phone, password_updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, now())`,
      [
        userCode,
        username,
        cleanEmail,
        passwordHash,
        roleRow.id,
        String(firm ?? '').trim() || null,
        String(department ?? '').trim() || null,
        String(phone ?? '').trim() || null,
      ],
    )

    const { rows: inserted } = await client.query(
      `SELECT id, user_code, username, email, role_id, firm, department, phone,
              failed_attempts, is_locked, is_active, locked_at, created_at, updated_at
         FROM users WHERE id = ?`,
      [insertId],
    )

    await client.query('INSERT INTO password_history (user_id, password_hash) VALUES (?, ?)', [
      inserted[0].id,
      passwordHash,
    ])

    return inserted[0].id
  })

  const user = await one(`${SELECT_USER} WHERE u.id = ?`, [userId])

  record('USER_CREATED', {
    userCode: req.user.user_code,
    req,
    details: { target: user.userCode, email: user.email, role: user.role },
  })

  res.status(201).json({
    message: 'Usuario creado correctamente',
    tempPasswordCreated: Boolean(tempPassword),
    tempPassword,
    user: userPayload(user),
  })
}

/* -------------------------------------------------------------------------- */
/* PUT /api/users/:id                                                          */
/* -------------------------------------------------------------------------- */

async function updateUser(req, res) {
  const id = parseId(req)
  const existing = await one('SELECT id, user_code, username, email, is_active FROM users WHERE id = ?', [id])
  if (!existing) throw notFound(`No existe el usuario #${id}`)

  const body = req.body ?? {}

  const updated = await withTransaction(async (client) => {
    const sets = []
    const values = []

    if (body.email !== undefined) {
      const email = sanitizeEmail(body.email)
      if (!email) throw unprocessable('Correo institucional invalido')
      const taken = await one('SELECT id FROM users WHERE email = ? AND id <> ?', [email, id])
      if (taken) throw conflict('El correo ya pertenece a otro usuario')
      values.push(email)
      sets.push('email = ?')
    }

    if (body.role !== undefined) {
      const roleRow = await one('SELECT code FROM roles WHERE code = ?', [
        String(body.role).trim().toLowerCase(),
      ])
      if (!roleRow) throw unprocessable('El rol solicitado no existe en el catalogo', { role: body.role })
      values.push(body.role.trim().toLowerCase())
      sets.push('role_id = (SELECT id FROM roles WHERE code = ?)')
    }

    // Cambio de nombre -> se recompone el User ID estandar (punto 9.1) con la
    // misma regla de disponibilidad, respetando el username propio del titular.
    if (body.firstName !== undefined || body.lastName !== undefined) {
      const firstName = body.firstName !== undefined ? String(body.firstName) : null
      const lastName = body.lastName !== undefined ? String(body.lastName) : null
      const base = buildUsername(firstName ?? existing.username, lastName ?? existing.username)
      if (!base) throw unprocessable('Nombre o apellido invalidos para generar el User ID')
      const username = await findAvailableUsername(client, base, id)
      values.push(username)
      sets.push('username = ?')
    }

    for (const key of ['firm', 'department', 'phone']) {
      if (body[key] === undefined) continue
      const value = String(body[key]).trim()
      values.push(value.length > 0 ? value : null)
      sets.push(`${key} = ?`)
    }

    if (sets.length === 0) {
      throw badRequest('No se envio ningun campo editable del usuario')
    }

    await client.query(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, [...values, id])
    return { id }
  })

  record('USER_UPDATED', {
    userCode: req.user.user_code,
    req,
    details: { target: existing.user_code, fields: Object.keys(body) },
  })

  const user = await one(`${SELECT_USER} WHERE u.id = ?`, [updated.id])
  res.json({ message: 'Usuario actualizado', user: userPayload(user) })
}

/* -------------------------------------------------------------------------- */
/* PATCH /api/users/:id/status  (baja logica / reactivacion)                  */
/* -------------------------------------------------------------------------- */

async function setUserStatus(req, res) {
  const id = parseId(req)
  const existing = await one('SELECT id, user_code, is_active FROM users WHERE id = ?', [id])
  if (!existing) throw notFound(`No existe el usuario #${id}`)

  const { active } = req.body ?? {}
  if (typeof active !== 'boolean') {
    throw badRequest('Se esperaba { active: true | false }')
  }
  if (!active && existing.id === req.user.id) {
    throw badRequest('Un administrador no puede desactivar su propio usuario')
  }

  await withTransaction(async (client) => {
    if (active) {
      await client.query('UPDATE users SET is_active = TRUE, deactivated_at = NULL WHERE id = ?', [id])
    } else {
      await client.query('UPDATE users SET is_active = FALSE, deactivated_at = NOW() WHERE id = ?', [id])
    }
  })

  record(active ? 'USER_REACTIVATED' : 'USER_DEACTIVATED', {
    userCode: req.user.user_code,
    req,
    details: { target: existing.user_code },
  })

  res.json({
    message: active ? `Cuenta ${existing.user_code} reactivada` : `Cuenta ${existing.user_code} desactivada`,
    user: { id, userCode: existing.user_code, isActive: active },
  })
}

/* -------------------------------------------------------------------------- */
/* POST /api/users/:id/unlock � Desbloqueo + reset de clave                    */
/* -------------------------------------------------------------------------- */

async function unlockUser(req, res) {
  const id = parseId(req)
  const existing = await one('SELECT id, user_code, is_locked FROM users WHERE id = ?', [id])
  if (!existing) throw notFound(`No existe el usuario #${id}`)

  const requested = req.body?.tempPassword
  const password =
    typeof requested === 'string' && requested.trim().length > 0
      ? requested.trim()
      : generateTempPassword()

  const policy = evaluatePassword(password)
  if (!policy.valid) {
    throw unprocessable('La contrasena temporal no cumple la politica de seguridad', {
      failed: policy.failed,
      rules: policy.rules.map(({ id, label }) => ({ id, label })),
    })
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE users
          SET is_locked = FALSE, failed_attempts = 0, locked_at = NULL,
              password_hash = ?, password_updated_at = now()
        WHERE id = ?`,
      [passwordHash, id],
    )
    await client.query('INSERT INTO password_history (user_id, password_hash) VALUES (?, ?)', [id, passwordHash])
    await client.query(
      `DELETE FROM password_history
        WHERE user_id = ?
          AND id NOT IN (
            SELECT id FROM (SELECT id FROM password_history WHERE user_id = ? ORDER BY created_at DESC LIMIT ?) keep
          )`,
      [id, id, PASSWORD_HISTORY_LIMIT],
    )
  })

  record('USER_UNLOCKED', {
    userCode: req.user.user_code,
    req,
    details: { target: existing.user_code, resetPassword: true },
  })

  res.json({
    message: `Cuenta ${existing.user_code} desbloqueada y clave reiniciada`,
    user: { id, userCode: existing.user_code, isLocked: false, failedAttempts: 0, isActive: true },
    tempPassword: password,
  })
}

module.exports = { listUsers, createUser, updateUser, setUserStatus, unlockUser }