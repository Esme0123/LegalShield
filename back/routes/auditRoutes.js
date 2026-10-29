'use strict'

const { Router } = require('express')
const controller = require('../controllers/auditController')
const { authenticate } = require('../middlewares/authMiddleware')
const { checkAnyPermission, checkPermission } = require('../middlewares/rbacMiddleware')
const { asyncHandler } = require('../utils/helpers')

const router = Router()

router.use(authenticate)

// Bitacora de seguridad: eventos de acceso y control, exclusiva de OSI.
router.get('/security', checkPermission('SECURITY_LOGS_VIEW'), asyncHandler(controller.listSecurityLogs))
router.get('/all', checkPermission('SECURITY_LOGS_VIEW'), asyncHandler(controller.listAllLogs))
router.get('/logs', checkPermission('SECURITY_LOGS_VIEW'), asyncHandler(controller.listSecurityLogs))
router.get('/events', checkPermission('SECURITY_LOGS_VIEW'), asyncHandler(controller.listEventTypes))

// Bitacora de actividad: acciones de negocio. LOGS_VIEW la muestra en el panel;
// AUDIT_VIEW abre la seccion Auditoria con la actividad de todo el despacho.
router.get('/activity', checkAnyPermission(['LOGS_VIEW', 'AUDIT_VIEW']), asyncHandler(controller.listActivityLogs))

module.exports = router
