'use strict'

const { Router } = require('express')
const controller = require('../controllers/usersController')
const { authenticate } = require('../middlewares/authMiddleware')
const { checkAnyPermission } = require('../middlewares/rbacMiddleware')
const { auditAction } = require('../middlewares/auditMiddleware')
const { asyncHandler } = require('../utils/helpers')

const router = Router()

// ABM de usuarios: cada operacion acepta el permiso atomico granular o el
// permiso compuesto USERS_MANAGE (exclusivo del Oficial de Seguridad, OSI).
router.use(authenticate)

router.get('/', checkAnyPermission(['USERS_READ', 'USERS_MANAGE']), asyncHandler(controller.listUsers))
router.post(
  '/',
  checkAnyPermission(['USERS_CREATE', 'USERS_MANAGE']),
  auditAction('USER_CREATED'),
  asyncHandler(controller.createUser),
)
router.put(
  '/:id',
  checkAnyPermission(['USERS_UPDATE', 'USERS_MANAGE']),
  auditAction('USER_UPDATED'),
  asyncHandler(controller.updateUser),
)
router.patch(
  '/:id/status',
  checkAnyPermission(['USERS_DELETE', 'USERS_MANAGE']),
  auditAction('USER_STATUS_CHANGED'),
  asyncHandler(controller.setUserStatus),
)
router.post(
  '/:id/unlock',
  checkAnyPermission(['USERS_UNLOCK', 'ACCOUNT_UNLOCK', 'USERS_MANAGE']),
  auditAction('USER_UNLOCKED'),
  asyncHandler(controller.unlockUser),
)
router.post(
  '/:id/generate-unlock-token',
  // Emitir credenciales de acceso es funcion exclusiva de seguridad: sin USERS_MANAGE.
  checkAnyPermission(['ACCOUNT_UNLOCK', 'TOKEN_RESET']),
  asyncHandler(controller.generateUnlockToken),
)

router.post(
  '/:id/generate-reset-token',
  // Reiniciar credenciales exige el permiso especifico TOKEN_RESET.
  checkAnyPermission(['TOKEN_RESET']),
  asyncHandler(controller.generateResetToken),
)

module.exports = router
