'use strict'

/**
 * Avisos de seguridad al titular de la cuenta (ISO 27001 A.5.26). Igual que la
 * auditoria, un fallo al notificar NUNCA interrumpe la operacion.
 */

const { query } = require('../config/db')
const { logger } = require('../utils/logger')

const stamp = () => new Date().toLocaleString('es-BO', { timeZone: 'America/La_Paz' })

const NOTICE = {
  LOCKED: (ip) => ({
    type: 'ACCOUNT_LOCKED',
    title: 'Cuenta bloqueada por intentos fallidos',
    message: `Su cuenta se bloqueo el ${stamp()} tras 3 intentos fallidos desde la IP ${ip ?? 'desconocida'}. Si no fue usted, reporte un incidente al OSI.`,
  }),
  TOKEN_ISSUED: () => ({
    type: 'UNLOCK_TOKEN_ISSUED',
    title: 'Token de desbloqueo emitido',
    message: `El Oficial de Seguridad emitio un token de desbloqueo para su cuenta el ${stamp()}. Si no lo solicito, reporte un incidente inmediatamente.`,
  }),
  UNLOCKED_BY_TOKEN: () => ({
    type: 'ACCOUNT_UNLOCKED',
    title: 'Cuenta reactivada con token OTP',
    message: `Su cuenta fue reactivada el ${stamp()} mediante un token OTP. Su contrasena no fue modificada.`,
  }),
  RESET_TOKEN_ISSUED: () => ({
    type: 'PASSWORD_RESET_TOKEN_ISSUED',
    title: 'Token de reinicio de contrasena emitido',
    message: `El Oficial de Seguridad emitio un token de reinicio de contrasena para su cuenta el ${stamp()}. Si no lo solicito, reporte un incidente inmediatamente.`,
  }),
  PASSWORD_RESET_DONE: (ip) => ({
    type: 'PASSWORD_RESET',
    title: 'Contrasena reiniciada',
    message: `Su contrasena fue reiniciada el ${stamp()} desde la IP ${ip ?? 'desconocida'} con un token del Oficial de Seguridad. Si no fue usted, reporte un incidente inmediatamente.`,
  }),
  UNLOCKED_BY_OSI: () => ({
    type: 'ACCOUNT_UNLOCKED',
    title: 'Cuenta reactivada por el OSI',
    message: `Su cuenta fue reactivada el ${stamp()} por el Oficial de Seguridad. Su contrasena no fue modificada. Si no reconoce esta accion, reporte un incidente inmediatamente.`,
  }),
}

/** `client` opcional: permite insertar dentro de una transaccion existente. */
async function notifyUser(userId, { type, title, message }, client = null) {
  try {
    const runner = client ?? { query }
    await runner.query(
      'INSERT INTO user_notifications (user_id, type, title, message) VALUES (?, ?, ?, ?)',
      [userId, type, title, message],
    )
  } catch (err) {
    logger.error('Fallo al registrar notificacion', { userId, type, message: err.message })
  }
}

module.exports = { notifyUser, NOTICE }
