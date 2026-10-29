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
// Antes de /:id para que "assignees" no se lea como un id de expediente.
router.get('/assignees', checkPermission('CASES_CREATE'), asyncHandler(controller.listAssignees))

router.get('/:id', checkPermission('CASES_READ'), asyncHandler(controller.getCase))
router.get('/:id/documents', checkPermission('CASES_READ'), asyncHandler(controller.listDocuments))
router.post('/:id/documents/reveal', checkPermission('DOCS_REVEAL'), asyncHandler(controller.revealDocument))
router.put('/:id', checkPermission('CASES_WRITE'), asyncHandler(controller.updateCase))
router.delete('/:id', checkPermission('CASES_ARCHIVE'), asyncHandler(controller.archiveCase))

module.exports = router