'use strict'

const { Router } = require('express')
const controller = require('../controllers/rolesController')
const { authenticate } = require('../middlewares/authMiddleware')
const { checkAnyPermission, checkPermission } = require('../middlewares/rbacMiddleware')
const { auditAction } = require('../middlewares/auditMiddleware')
const { asyncHandler } = require('../utils/helpers')

const router = Router()

// La lectura de la matriz requiere sesion; modificarla exige el permiso de
// gestion de roles (ROLES_MANAGE) o su alias historico RBAC_MANAGE.
router.use(authenticate)

router.get('/matrix', asyncHandler(controller.getMatrix))
router.post(
  '/',
  checkPermission('ROLES_MANAGE'),
  auditAction('ROLE_CREATED'),
  asyncHandler(controller.createRole),
)
router.delete(
  '/:code',
  checkPermission('ROLES_MANAGE'),
  auditAction('ROLE_DELETED'),
  asyncHandler(controller.deleteRole),
)
router.post(
  '/permissions',
  checkAnyPermission(['RBAC_MANAGE', 'ROLES_MANAGE']),
  auditAction('PERMISSION_CHANGED'),
  asyncHandler(controller.updatePermissions),
)
router.post(
  '/reset',
  checkAnyPermission(['RBAC_MANAGE', 'ROLES_MANAGE']),
  auditAction('PERMISSION_CHANGED'),
  asyncHandler(controller.resetMatrix),
)

module.exports = router