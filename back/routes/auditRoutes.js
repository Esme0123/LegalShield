'use strict'

const { Router } = require('express')
const controller = require('../controllers/auditController')
const { authenticate } = require('../middlewares/authMiddleware')
const { checkPermission } = require('../middlewares/rbacMiddleware')
const { asyncHandler } = require('../utils/helpers')

const router = Router()

router.use(authenticate)

router.get('/logs', checkPermission('LOGS_VIEW'), asyncHandler(controller.listLogs))
router.get('/events', checkPermission('LOGS_VIEW'), asyncHandler(controller.listEventTypes))

module.exports = router