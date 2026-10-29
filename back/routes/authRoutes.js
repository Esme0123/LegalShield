'use strict'

const { Router } = require('express')
const rateLimit = require('express-rate-limit')
const controller = require('../controllers/authController')
const profile = require('../controllers/profileController')
const { authenticate, optionalAuth } = require('../middlewares/authMiddleware')
const { checkPermission } = require('../middlewares/rbacMiddleware')
const { auditAction } = require('../middlewares/auditMiddleware')
const { record } = require('../services/auditService')
const { asyncHandler } = require('../utils/helpers')
const { requireAjaxHeader, readRefreshCookie } = require('../utils/refreshCookie')

const router = Router()

/**
 * Limitador mas estricto para autenticacion (20 intentos FALLIDOS por ventana).
 * Solo cuentan las respuestas de error: iniciar y cerrar sesion con la clave
 * correcta no tiene tope, mientras que el barrido de claves o de IDs se frena.
 * El bloqueo por cuenta vive en la base.
 */
const authLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 900000),
  max: Number(process.env.AUTH_RATE_LIMIT_MAX || 20),
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    record('RATE_LIMITED', { userCode: null, req, details: { path: req.originalUrl } })
    res.status(429).json({ error: 'Demasiados intentos de autenticacion. Reintente mas tarde' })
  },
})

/**
 * Limitador propio del CAPTCHA: pedir o renovar un desafio no es un intento de
 * autenticacion y no debe agotar el cupo de login de la IP (de lo contrario el
 * usuario queda sin desafio y sin poder iniciar sesion).
 */
const captchaLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 900000),
  max: Number(process.env.CAPTCHA_RATE_LIMIT_MAX || 60),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    record('RATE_LIMITED', { userCode: null, req, details: { path: req.originalUrl } })
    res.status(429).json({ error: 'Demasiadas solicitudes de verificacion. Reintente mas tarde' })
  },
})

/**
 * Limitador propio del refresh: con la cookie, cada recarga de la pagina restaura la
 * sesion con una llamada. El token firmado no se adivina por fuerza bruta, asi que no
 * comparte el cupo estricto de los endpoints de credenciales. Solo cuentan los
 * rechazos de una cookie presentada: una renovacion exitosa, o la consulta sin
 * cookie que hace la pantalla de login tras cerrar sesion, no consumen cupo.
 */
const refreshLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 900000),
  max: Number(process.env.REFRESH_RATE_LIMIT_MAX || 60),
  skipSuccessfulRequests: true,
  skip: (req) => !readRefreshCookie(req),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    record('RATE_LIMITED', { userCode: null, req, details: { path: req.originalUrl } })
    res.status(429).json({ error: 'Demasiadas solicitudes de renovacion de sesion. Reintente mas tarde' })
  },
})

// --- Publico ----------------------------------------------------------------

router.post('/register', authLimiter, asyncHandler(controller.register))
router.get('/captcha', captchaLimiter, asyncHandler(controller.captcha))
router.post('/login', authLimiter, asyncHandler(controller.login))

// Estado del bloqueo temporal por cuenta: restaura el conteo tras un F5.
router.post('/lock-status', authLimiter, asyncHandler(controller.lockStatus))

// --- Requiere sesion ---------------------------------------------------------

// Con la cookie HttpOnly de por medio, exige la cabecera anti-CSRF.
router.post('/refresh', refreshLimiter, requireAjaxHeader, auditAction('TOKEN_REFRESH'), asyncHandler(controller.refresh))
router.get('/me', authenticate, asyncHandler(controller.me))
// El cierre borra la cookie aunque el access token ya haya vencido.
router.post('/logout', optionalAuth, requireAjaxHeader, auditAction('LOGOUT'), asyncHandler(controller.logout))
router.get('/directory', authenticate, asyncHandler(controller.directory))
router.get('/password-history', authenticate, asyncHandler(controller.passwordHistory))

// --- Perfil: siempre autoexigible, nunca requiere permiso adicional ---------

router.get('/profile', authenticate, asyncHandler(profile.getProfile))
router.put('/profile', authenticate, auditAction('PROFILE_UPDATED'), asyncHandler(profile.updateProfile))
router.put('/password', authenticate, auditAction('PASSWORD_CHANGED'), asyncHandler(profile.changePassword))
// Avisos de seguridad del titular: cada usuario solo ve y marca los propios.
router.get('/notifications', authenticate, asyncHandler(profile.listNotifications))
router.patch('/notifications/:id/read', authenticate, asyncHandler(profile.markNotificationRead))

// Desbloqueo: exclusivo del Oficial de Seguridad (OSI) via ACCOUNT_UNLOCK.
router.post('/unlock', authenticate, checkPermission('ACCOUNT_UNLOCK'), auditAction('AUTH_UNLOCK'), asyncHandler(controller.unlock))
router.post('/verify-unlock-token', authLimiter, asyncHandler(controller.verifyUnlockToken))
// Reinicio de clave del titular con el token emitido por el OSI (publico, con limitador).
router.post('/reset-password', authLimiter, asyncHandler(controller.resetPassword))

module.exports = router