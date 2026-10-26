/**
 * Cliente HTTP de LegalShield.
 *
 * Habla con la API REST (`/back`), que persiste en MySQL. No existe simulador:
 * si la API no responde, la UI muestra el error o un estado vacio, nunca datos
 * ficticios.
 *
 * Variables de entorno (Vite):
 *   VITE_API_BASE_URL   base de la API   (por defecto http://localhost:4000/api)
 */

const RAW_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api'
const API_ENABLED = import.meta.env.VITE_API_ENABLED !== 'false'

export const API_BASE = RAW_BASE.replace(/\/$/, '')

/** Claves de persistencia de la sesion en el navegador. */
const ACCESS_TOKEN_KEY = 'legalshield.access'
const REFRESH_TOKEN_KEY = 'legalshield.refresh'

function readStorage(key) {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage(key, value) {
  try {
    if (value) window.localStorage.setItem(key, value)
    else window.localStorage.removeItem(key)
  } catch {
    /* almacenamiento no disponible (modo privado): la sesion vive en memoria */
  }
}

/** Tokens persistidos en localStorage para sobrevivir recargas de pagina. */
const tokens = {
  access: readStorage(ACCESS_TOKEN_KEY),
  refresh: readStorage(REFRESH_TOKEN_KEY),
}

export function setTokens({ access, refresh }) {
  tokens.access = access ?? null
  tokens.refresh = refresh ?? null
  writeStorage(ACCESS_TOKEN_KEY, tokens.access)
  writeStorage(REFRESH_TOKEN_KEY, tokens.refresh)
}

export function clearTokens() {
  tokens.access = null
  tokens.refresh = null
  writeStorage(ACCESS_TOKEN_KEY, null)
  writeStorage(REFRESH_TOKEN_KEY, null)
}

export function isAuthenticated() {
  return Boolean(tokens.access)
}

/** Error de API con el codigo HTTP, para que la UI distinga 403 de 500. */
export class ApiError extends Error {
  constructor(message, { status, details, code, payload } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status ?? 0
    this.details = details ?? null
    this.code = code ?? null
    this.payload = payload ?? null
  }

  /** Estado de bloqueo temporal informado por POST /auth/login (401). */
  get isLocked() {
    return Boolean(this.payload?.isLocked ?? this.details?.isLocked)
  }

  /** Bloqueo por reincidencia: solo lo libera el OSI. */
  get requiresOsi() {
    return Boolean(this.payload?.requiresOsi ?? this.details?.requiresOsi)
  }

  /** Segundos restantes de la inhabilitacion temporal, calculados en el servidor. */
  get remainingSeconds() {
    return Number(this.payload?.remainingSeconds ?? this.details?.remainingSeconds ?? 0)
  }

  get failedAttempts() {
    return Number(this.payload?.failedAttempts ?? this.details?.failedAttempts ?? 0)
  }

  get maxAttempts() {
    return Number(this.payload?.maxAttempts ?? this.details?.maxAttempts ?? 3)
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

  /** 403 por clave inicial pendiente: la ruta se habilita al cambiarla. */
  get passwordChangeRequired() {
    return this.status === 403 && this.details?.code === 'PASSWORD_CHANGE_REQUIRED'
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
      payload,
    })
  }

  return payload
}

const get = (path, options) => request(path, { ...options, method: 'GET' })
const post = (path, body, options) => request(path, { ...options, method: 'POST', body })
const put = (path, body, options) => request(path, { ...options, method: 'PUT', body })
const patch = (path, body, options) => request(path, { ...options, method: 'PATCH', body })
const del = (path, options) => request(path, { ...options, method: 'DELETE' })

/* -------------------------------------------------------------------------- */
/* AUTH                                                                        */
/* -------------------------------------------------------------------------- */

export const authApi = {
  login: (userCode, password, captchaToken, captchaResponse) => post('/auth/login', { userCode, password, captchaToken, captchaResponse }, { auth: false }),
  captcha: () => get('/auth/captcha', { auth: false }),
  register: (payload) => post('/auth/register', payload, { auth: false }),
  me: () => get('/auth/me'),
  logout: () => post('/auth/logout'),
  directory: () => get('/auth/directory'),
  profile: () => get('/auth/profile'),
  updateProfile: (payload) => put('/auth/profile', payload),
  changePassword: (currentPassword, newPassword) =>
    put('/auth/password', { currentPassword, newPassword }),
  passwordHistory: () => get('/auth/password-history'),
  /** Estado del bloqueo temporal de una cuenta (restaura el conteo tras F5). */
  lockStatus: (userCode) => post('/auth/lock-status', { userCode }, { auth: false }),
  verifyUnlockToken: (payload) => post('/auth/verify-unlock-token', payload, { auth: false }),
  notifications: () => get('/auth/notifications'),
  readNotification: (id) => patch(`/auth/notifications/${id}/read`),
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
  create: (payload) => post('/roles', payload),
  remove: (code) => del(`/roles/${encodeURIComponent(code)}`),
}

/* -------------------------------------------------------------------------- */
/* USERS (ABM granular)                                                        */
/* -------------------------------------------------------------------------- */

export const usersApi = {
  list: (params, options) => get(`/users${qs(params)}`, options),
  create: (payload) => post('/users', payload),
  update: (id, payload) => put(`/users/${id}`, payload),
  status: (id, payload) => patch(`/users/${id}/status`, payload),
  unlock: (id, payload) => post(`/users/${id}/unlock`, payload),
  generateUnlockToken: (id) => post(`/users/${id}/generate-unlock-token`),
}

/* -------------------------------------------------------------------------- */
/* AUDIT                                                                       */
/* -------------------------------------------------------------------------- */

export const auditApi = {
  /** Bitacora de seguridad (acceso y control): solo OSI con SECURITY_LOGS_VIEW. */
  security: (filters, options) => get(`/audit/security${qs(filters)}`, options),
  /** Alias historico de la bitacora de seguridad. */
  logs: (filters, options) => get(`/audit/logs${qs(filters)}`, options),
  /** Bitacora de actividad (acciones de negocio): LOGS_VIEW. */
  activity: (filters, options) => get(`/audit/activity${qs(filters)}`, options),
  events: () => get('/audit/events'),
}

/* -------------------------------------------------------------------------- */
/* Descubrimiento y modo                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Prueba la API una sola vez al arrancar. Devuelve 'online' | 'offline' |
 * 'disabled'. Cuando esta caida la UI muestra el error; no hay datos simulados.
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
    // Import perezoso: evita dependencia circular con el store de toasts.
    import('@/store/toastStore').then(({ toast }) => {
      toast.info(
        'API REST no disponible',
        'No hay conexion con el servidor MySQL · verifique que el backend este en marcha',
      )
    })
  }
  return 'offline'
}

export const isApiEnabled = () => API_ENABLED