'use strict'

const { Router } = require('express')
const controller = require('../controllers/rolesController')
const { authenticate } = require('../middlewares/authMiddleware')
const { checkPermission } = require('../middlewares/rbacMiddleware')
const { auditAction } = require('../middlewares/auditMiddleware')
const { asyncHandler } = require('../utils/helpers')

const router = Router()

// La matriz solo es visible para quien administra roles (ROLES_MANAGE, rol OSI).
// Modificarla exige el mismo permiso.
router.use(authenticate)

router.get('/matrix', checkPermission('ROLES_MANAGE'), asyncHandler(controller.getMatrix))
router.post(
  '/',
  checkPermission('ROLES_MANAGE'),
  auditAction('ROLE_CREATED'),
  asyncHandler(controller.createRole),
)
router.post(
  '/permissions',
  checkPermission('ROLES_MANAGE'),
  auditAction('PERMISSION_CHANGED'),
  asyncHandler(controller.updatePermissions),
)
router.post(
  '/reset',
  checkPermission('ROLES_MANAGE'),
  auditAction('PERMISSION_CHANGED'),
  asyncHandler(controller.resetMatrix),
)

// Permisos de una cuenta concreta: consulta y excepciones solo para ella.
router.get(
  '/users/:userCode/permissions',
  checkPermission('ROLES_MANAGE'),
  asyncHandler(controller.getUserPermissions),
)
router.post(
  '/users/:userCode/permissions',
  checkPermission('ROLES_MANAGE'),
  auditAction('USER_PERMISSION_CHANGED'),
  asyncHandler(controller.setUserPermission),
)

router.put(
  '/:code',
  checkPermission('ROLES_MANAGE'),
  auditAction('ROLE_UPDATED'),
  asyncHandler(controller.updateRole),
)
router.delete(
  '/:code',
  checkPermission('ROLES_MANAGE'),
  auditAction('ROLE_DELETED'),
  asyncHandler(controller.deleteRole),
)

module.exports = router
