'use strict'

const { Router } = require('express')
const controller = require('../controllers/usersController')
const { authenticate } = require('../middlewares/authMiddleware')
const { checkPermission } = require('../middlewares/rbacMiddleware')
const { auditAction } = require('../middlewares/auditMiddleware')
const { asyncHandler } = require('../utils/helpers')

const router = Router()

// ABM de usuarios: cada operacion exige su permiso atomico granular.
router.use(authenticate)

router.get('/', checkPermission('USERS_READ'), asyncHandler(controller.listUsers))
router.post('/', checkPermission('USERS_CREATE'), auditAction('USER_CREATED'), asyncHandler(controller.createUser))
router.put('/:id', checkPermission('USERS_UPDATE'), auditAction('USER_UPDATED'), asyncHandler(controller.updateUser))
router.patch('/:id/status', checkPermission('USERS_DELETE'), asyncHandler(controller.setUserStatus))
router.post('/:id/unlock', checkPermission('USERS_UNLOCK'), asyncHandler(controller.unlockUser))

module.exports = router