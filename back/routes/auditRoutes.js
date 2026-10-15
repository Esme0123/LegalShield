'use strict'

const { Router } = require('express')
const controller = require('../controllers/auditController')
const { authenticate } = require('../middlewares/authMiddleware')
const { checkPermission } = require('../middlewares/rbacMiddleware')
const { asyncHandler } = require('../utils/helpers')

const router = Router()

router.use(authenticate)

// Bitacora de seguridad: eventos de acceso y control, exclusiva de OSI.
router.get('/security', checkPermission('SECURITY_LOGS_VIEW'), asyncHandler(controller.listSecurityLogs))
router.get('/logs', checkPermission('SECURITY_LOGS_VIEW'), asyncHandler(controller.listSecurityLogs))
router.get('/events', checkPermission('SECURITY_LOGS_VIEW'), asyncHandler(controller.listEventTypes))

// Bitacora de actividad: acciones de negocio visibles a socios y abogados.
router.get('/activity', checkPermission('LOGS_VIEW'), asyncHandler(controller.listActivityLogs))

module.exports = router
