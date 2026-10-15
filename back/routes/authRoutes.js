'use strict'

const { Router } = require('express')
const rateLimit = require('express-rate-limit')
const controller = require('../controllers/authController')
const profile = require('../controllers/profileController')
const { authenticate } = require('../middlewares/authMiddleware')
const { checkPermission } = require('../middlewares/rbacMiddleware')
const { auditAction } = require('../middlewares/auditMiddleware')
const { record } = require('../services/auditService')
const { asyncHandler } = require('../utils/helpers')

const router = Router()

/**
 * Limitador mas estricto para autenticacion (20 intentos por ventana global).
 * El bloqueo por cuenta vive en la base; esto frena el barrido masivo de IDs.
 */
const authLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 900000),
  max: Number(process.env.AUTH_RATE_LIMIT_MAX || 20),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    record('RATE_LIMITED', { userCode: null, req, details: { path: req.originalUrl } })
    res.status(429).json({ error: 'Demasiados intentos de autenticacion. Reintente mas tarde' })
  },
})

// --- Publico ----------------------------------------------------------------

router.post('/register', authLimiter, asyncHandler(controller.register))
router.post('/login', authLimiter, asyncHandler(controller.login))

// Estado del bloqueo temporal por cuenta: restaura el conteo tras un F5.
router.post('/lock-status', authLimiter, asyncHandler(controller.lockStatus))

// --- Requiere sesion ---------------------------------------------------------

router.post('/refresh', authLimiter, auditAction('TOKEN_REFRESH'), asyncHandler(controller.refresh))
router.get('/me', authenticate, asyncHandler(controller.me))
router.post('/logout', authenticate, auditAction('LOGOUT'), asyncHandler(controller.logout))
router.get('/directory', authenticate, asyncHandler(controller.directory))
router.get('/password-history', authenticate, asyncHandler(controller.passwordHistory))

// --- Perfil: siempre autoexigible, nunca requiere permiso adicional ---------

router.get('/profile', authenticate, asyncHandler(profile.getProfile))
router.put('/profile', authenticate, auditAction('PROFILE_UPDATED'), asyncHandler(profile.updateProfile))
router.put('/password', authenticate, auditAction('PASSWORD_CHANGED'), asyncHandler(profile.changePassword))

// Desbloqueo: exclusivo del Oficial de Seguridad (OSI) via ACCOUNT_UNLOCK.
router.post('/unlock', authenticate, checkPermission('ACCOUNT_UNLOCK'), auditAction('AUTH_UNLOCK'), asyncHandler(controller.unlock))
router.post('/verify-unlock-token', authLimiter, asyncHandler(controller.verifyUnlockToken))

module.exports = router