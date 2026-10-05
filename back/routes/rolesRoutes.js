'use strict'

const { Router } = require('express')
const controller = require('../controllers/rolesController')
const { authenticate } = require('../middlewares/authMiddleware')
const { checkPermission } = require('../middlewares/rbacMiddleware')
const { auditAction } = require('../middlewares/auditMiddleware')
const { asyncHandler } = require('../utils/helpers')

const router = Router()

// Toda la matriz exige sesion; los cambios exigen RBAC_MANAGE.
router.use(authenticate)

router.get('/matrix', asyncHandler(controller.getMatrix))
router.post('/permissions', checkPermission('RBAC_MANAGE'), auditAction('PERMISSION_CHANGED'), asyncHandler(controller.updatePermissions))
router.post('/reset', checkPermission('RBAC_MANAGE'), auditAction('PERMISSION_CHANGED'), asyncHandler(controller.resetMatrix))

module.exports = router