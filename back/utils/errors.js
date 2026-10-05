'use strict'

/**
 * Errores de aplicacion con codigo HTTP. El manejador central de server.js los
 * traduce a una respuesta JSON consistente, de modo que los controllers no
 * necesitan repetir la logica de respuesta de error.
 */

class HttpError extends Error {
  constructor(status, message, details) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    if (details) this.details = details
  }
}

const badRequest = (message, details) => new HttpError(400, message, details)
const unauthorized = (message = 'Credenciales invalidas') => new HttpError(401, message)
const forbidden = (message = 'Acceso denegado por politica RBAC') => new HttpError(403, message)
const notFound = (message = 'Recurso no encontrado') => new HttpError(404, message)
const conflict = (message) => new HttpError(409, message)
const unprocessable = (message, details) => new HttpError(422, message, details)
const tooManyRequests = (message = 'Demasiados intentos') => new HttpError(429, message)

module.exports = {
  HttpError,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  unprocessable,
  tooManyRequests,
}