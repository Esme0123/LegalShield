'use strict'

/**
 * Cookie del refresh token. HttpOnly: el JavaScript de la pagina nunca la lee, asi
 * que un XSS no puede robar la sesion de larga duracion (OWASP A07, CWE-1004).
 *   · SameSite=Strict por defecto; REFRESH_COOKIE_SAMESITE=none solo para un despliegue
 *     con frontend y API en sitios distintos (exige Secure y la cabecera anti-CSRF).
 *   · Secure solo en produccion (sin TLS en local el navegador la descartaria).
 *   · Path limitado a la ruta de refresh: el navegador no la adjunta a ningun otro
 *     endpoint de la API.
 */

const { HttpError } = require('./errors')

const API_PREFIX = process.env.API_PREFIX || '/api'
const COOKIE_NAME = 'ls_refresh'
const COOKIE_PATH = `${API_PREFIX}/auth/refresh`
const SAME_SITE_VALUES = ['strict', 'lax', 'none']

function sameSite() {
  const value = String(process.env.REFRESH_COOKIE_SAMESITE || 'strict').trim().toLowerCase()
  if (!SAME_SITE_VALUES.includes(value)) {
    throw new Error(`REFRESH_COOKIE_SAMESITE invalido (${value}): use strict, lax o none`)
  }
  return value
}

/** Valida la configuracion al arrancar (fallo seguro) y devuelve las opciones base. */
function baseOptions() {
  const policy = sameSite()
  return {
    httpOnly: true,
    // SameSite=None exige Secure; en produccion siempre va Secure.
    secure: process.env.NODE_ENV === 'production' || policy === 'none',
    sameSite: policy,
    path: COOKIE_PATH,
  }
}

/** '7d' | '12h' | '30m' | '45s' | numero de segundos -> milisegundos (por defecto 7 dias). */
function refreshMaxAgeMs() {
  const raw = String(process.env.JWT_REFRESH_EXPIRES_IN || '7d').trim()
  const match = /^(\d+)\s*([smhd])?$/.exec(raw)
  if (!match) return 7 * 24 * 60 * 60 * 1000
  const unit = { s: 1000, m: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000 }[match[2] ?? 's']
  return Number(match[1]) * unit
}

function setRefreshCookie(res, token) {
  res.cookie(COOKIE_NAME, token, { ...baseOptions(), maxAge: refreshMaxAgeMs() })
}

function clearRefreshCookie(res) {
  res.clearCookie(COOKIE_NAME, baseOptions())
}

/** Lee la cookie del encabezado Cookie sin agregar dependencias. */
function readRefreshCookie(req) {
  const header = String(req.headers.cookie ?? '')
  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index < 0) continue
    if (part.slice(0, index).trim() !== COOKIE_NAME) continue
    try {
      return decodeURIComponent(part.slice(index + 1).trim())
    } catch {
      return null
    }
  }
  return null
}

/**
 * Defensa anti-CSRF para los endpoints que operan con la cookie: un sitio ajeno no
 * puede enviar esta cabecera sin un preflight, y CORS solo acepta origenes de la lista.
 */
function requireAjaxHeader(req, _res, next) {
  if (req.get('X-Requested-With') !== 'XMLHttpRequest') {
    return next(new HttpError(403, 'Falta la cabecera X-Requested-With'))
  }
  return next()
}

module.exports = {
  COOKIE_NAME,
  COOKIE_PATH,
  baseOptions,
  setRefreshCookie,
  clearRefreshCookie,
  readRefreshCookie,
  requireAjaxHeader,
}
