import { toast } from '@/store/toastStore'

/**
 * Cliente HTTP de LegalShield.
 *
 * Habla con la API REST (`/back`) y cae de forma explicita al simulador en
 * memoria cuando el backend no esta disponible. La distincion importa: la UI
 * nunca debe quedar en blanco porque la API este caida, pero tampoco debe
 * fingir que un cambio quedo persistido.
 *
 * Variables de entorno (Vite):
 *   VITE_API_BASE_URL   base de la API   (por defecto http://localhost:4000/api)
 *   VITE_API_ENABLED    'false' fuerza el modo simulador
 */

const RAW_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api'
const API_ENABLED = import.meta.env.VITE_API_ENABLED !== 'false'

export const API_BASE = RAW_BASE.replace(/\/$/, '')

/** Tokens en memoria: no se guardan en localStorage para reducir exposicion XSS. */
const tokens = {
  access: null,
  refresh: null,
}

export function setTokens({ access, refresh }) {
  tokens.access = access ?? null
  tokens.refresh = refresh ?? null
}

export function clearTokens() {
  tokens.access = null
  tokens.refresh = null
}

export function isAuthenticated() {
  return Boolean(tokens.access)
}

/** Error de API con el codigo HTTP, para que la UI distinga 403 de 500. */
export class ApiError extends Error {
  constructor(message, { status, details, code } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status ?? 0
    this.details = details ?? null
    this.code = code ?? null
  }

  get isNetwork() {
    return this.status === 0
  }

  get isAuth() {
    return this.status === 401
  }

  get isForbidden() {
    return this.status === 403
  }

  get isConflict() {
    return this.status === 409
  }
}

let refreshPromise = null

/** Intenta renovar el access token una sola vez ante un 401. */
async function tryRefresh() {
  if (!tokens.refresh || refreshPromise) return refreshPromise

  refreshPromise = fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: tokens.refresh }),
  })
    .then(async (res) => {
      if (!res.ok) {
        clearTokens()
        return null
      }
      const data = await res.json()
      setTokens({ access: data.token, refresh: data.refreshToken })
      return data.token
    })
    .catch(() => {
      clearTokens()
      return null
    })
    .finally(() => {
      refreshPromise = null
    })

  return refreshPromise
}

/**
 * Peticion base. Lanza `ApiError` con el mensaje del servidor para que los
 * controllers de la UI puedan mostrarlo sin parsear el JSON otra vez.
 */
export async function request(path, { method = 'GET', body, signal, auth = true, retry = true } = {}) {
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (auth && tokens.access) headers.Authorization = `Bearer ${tokens.access}`

  let response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
  } catch (err) {
    if (err.name === 'AbortError') throw err
    throw new ApiError('No hay conexion con la API REST', { status: 0 })
  }

  if (response.status === 401 && auth && retry && tokens.refresh) {
    const renewed = await tryRefresh()
    if (renewed) return request(path, { method, body, signal, auth, retry: false })
  }

  if (response.status === 204) return null

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw new ApiError(payload?.error ?? `Error HTTP ${response.status}`, {
      status: response.status,
      details: payload?.details ?? payload?.detail ?? null,
    })
  }

  return payload
}

const get = (path, options) => request(path, { ...options, method: 'GET' })
const post = (path, body, options) => request(path, { ...options, method: 'POST', body })
const put = (path, body, options) => request(path, { ...options, method: 'PUT', body })
const del = (path, options) => request(path, { ...options, method: 'DELETE' })

/* -------------------------------------------------------------------------- */
/* AUTH                                                                        */
/* -------------------------------------------------------------------------- */

export const authApi = {
  login: (userCode, password) => post('/auth/login', { userCode, password }, { auth: false }),
  register: (payload) => post('/auth/register', payload, { auth: false }),
  me: () => get('/auth/me'),
  logout: () => post('/auth/logout'),
  directory: () => get('/auth/directory'),
  profile: () => get('/auth/profile'),
  updateProfile: (payload) => put('/auth/profile', payload),
  changePassword: (currentPassword, newPassword) =>
    put('/auth/password', { currentPassword, newPassword }),
  passwordHistory: () => get('/auth/password-history'),
  unlock: (userCode) => post('/auth/unlock', { userCode }),
}

/* -------------------------------------------------------------------------- */
/* CASES                                                                       */
/* -------------------------------------------------------------------------- */

const qs = (params) => {
  const search = new URLSearchParams()
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, value)
  })
  const str = search.toString()
  return str ? `?${str}` : ''
}

export const casesApi = {
  list: (filters, options) => get(`/cases${qs(filters)}`, options),
  get: (id, options) => get(`/cases/${id}`, options),
  create: (payload) => post('/cases', payload),
  update: (id, payload) => put(`/cases/${id}`, payload),
  archive: (id) => del(`/cases/${id}`),
}

/* -------------------------------------------------------------------------- */
/* ROLES                                                                       */
/* -------------------------------------------------------------------------- */

export const rolesApi = {
  matrix: () => get('/roles/matrix'),
  updatePermissions: (grants) => post('/roles/permissions', { grants }),
  reset: () => post('/roles/reset'),
}

/* -------------------------------------------------------------------------- */
/* AUDIT                                                                       */
/* -------------------------------------------------------------------------- */

export const auditApi = {
  logs: (filters, options) => get(`/audit/logs${qs(filters)}`, options),
  events: () => get('/audit/events'),
}

/* -------------------------------------------------------------------------- */
/* Descubrimiento y modo                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Prueba la API una sola vez al arrancar. Devuelve 'online' | 'offline' |
 * 'disabled' y notifica con un toast cuando cae al simulador, para que la
 * diferencia entre datos reales y datos de demostracion sea visible.
 */
export async function probeApi({ notify = true } = {}) {
  if (!API_ENABLED) return 'disabled'

  try {
    const response = await fetch(`${API_BASE.replace(/\/api$/, '')}/health`)
    const health = await response.json()
    if (response.ok && health.status === 'ok') return 'online'
  } catch {
    /* cae al bloque inferior */
  }

  if (notify) {
    toast.info(
      'API REST no disponible',
      'LegalShield opera con el simulador en memoria · los cambios no se persisten',
    )
  }
  return 'offline'
}

export const isApiEnabled = () => API_ENABLED