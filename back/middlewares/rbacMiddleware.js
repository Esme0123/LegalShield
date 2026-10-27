'use strict'

/**
 * rbacMiddleware
 *
 * `checkPermission(code)` exige un permiso atomico (CASES_READ, RBAC_MANAGE...).
 * `checkAnyPermission([...])` y `checkAllPermissions([...])` cubren necesidad
 * AND/OR. `requireRole([...])` restringe por rol.
 *
 * Los permisos se leen del token rehidratado por `authenticate`, de modo que una
 * revocacion en la matriz SIS-321 surte efecto en la peticion siguiente.
 *
 * El control de acceso por ambito (un abogado solo ve sus expedientes) vive en
 * `scopeCasesToOwner`, tambien aqui, porque depende del mismo contexto RBAC. El alcance
 * de todo el despacho lo da el permiso atomico CASES_READ_ALL, no el nombre del rol.
 */

const { forbidden } = require('../utils/errors')
const { record } = require('../services/auditService')
const { getClientIp } = require('../utils/helpers')

function hasPermission(user, code) {
  return Boolean(user?.permissions?.includes(code))
}

function deny(req, message, details) {
  record('ACCESS_DENIED', {
    userCode: req.user?.user_code ?? null,
    req,
    details: { path: req.originalUrl, method: req.method, ...details },
  })
  return forbidden(message)
}

function checkPermission(code) {
  return (req, _res, next) => {
    if (!req.user) return next(forbidden('Se requiere sesion activa'))
    if (!hasPermission(req.user, code)) {
      return next(deny(req, `Permiso requerido: ${code}`, { required: code }))
    }
    return next()
  }
}

function checkAnyPermission(codes) {
  return (req, _res, next) => {
    if (!req.user) return next(forbidden('Se requiere sesion activa'))
    if (!codes.some((code) => hasPermission(req.user, code))) {
      return next(deny(req, `Requiere al menos un permiso de: ${codes.join(', ')}`, { requiredAny: codes }))
    }
    return next()
  }
}

function checkAllPermissions(codes) {
  return (req, _res, next) => {
    if (!req.user) return next(forbidden('Se requiere sesion activa'))
    const missing = codes.filter((code) => !hasPermission(req.user, code))
    if (missing.length > 0) {
      return next(deny(req, `Permisos faltantes: ${missing.join(', ')}`, { missing }))
    }
    return next()
  }
}

function requireRole(roles) {
  return (req, _res, next) => {
    if (!req.user) return next(forbidden('Se requiere sesion activa'))
    if (!roles.includes(req.user.role_code)) {
      return next(deny(req, `Rol requerido: ${roles.join(' o ')}`, { requiredRole: roles, actual: req.user.role_code }))
    }
    return next()
  }
}

/**
 * A01:2021 · Control de acceso por ambito.
 *
 * Un abogado solo opera los expedientes donde `assigned_lawyer_id` coincide con
 * su usuario. Quien tiene el permiso CASES_READ_ALL accede a todo el despacho. El
 * cliente tambien queda acotado a lo propio.
 *
 * Se expone como middleware de ruta para que el controller solo tenga que
 * filtrar con `req.scope` y no repita la regla de negocio.
 */
function scopeCasesToOwner(req, _res, next) {
  const user = req.user
  if (!user) return next(forbidden('Se requiere sesion activa'))

  // Alcance transversal solo con el permiso explicito, revisable desde la matriz. Sin el,
  // el usuario queda acotado a los expedientes propios (hoy: abogado, asistente, cliente y
  // OSI). Los permisos se rehidratan en cada peticion, asi que un cambio rige de inmediato.
  if (hasPermission(user, 'CASES_READ_ALL')) {
    req.scope = { all: true }
    return next()
  }

  req.scope = {
    all: false,
    userId: user.id,
    userCode: user.user_code,
    ip: getClientIp(req),
  }
  return next()
}

module.exports = {
  checkPermission,
  checkAnyPermission,
  checkAllPermissions,
  requireRole,
  scopeCasesToOwner,
  hasPermission,
}