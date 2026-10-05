'use strict'

const { Router } = require('express')
const controller = require('../controllers/casesController')
const { authenticate } = require('../middlewares/authMiddleware')
const { checkPermission, scopeCasesToOwner } = require('../middlewares/rbacMiddleware')
const { asyncHandler } = require('../utils/helpers')

const router = Router()

router.use(authenticate)

// A01:2021 · el alcance por ambito se resuelve una vez y viaja en req.scope.
router.use(scopeCasesToOwner)

router.get('/', checkPermission('CASES_READ'), asyncHandler(controller.listCases))
router.post('/', checkPermission('CASES_CREATE'), asyncHandler(controller.createCase))

router.get('/:id', checkPermission('CASES_READ'), asyncHandler(controller.getCase))
router.put('/:id', checkPermission('CASES_WRITE'), asyncHandler(controller.updateCase))
router.delete('/:id', checkPermission('CASES_ARCHIVE'), asyncHandler(controller.archiveCase))

module.exports = router