import { create } from 'zustand'
import {
  INFO_ASSETS,
  PERMISSIONS,
  REGISTER_ROLES,
  ROLES,
  RISK_CONTROLS,
  RISK_HEATMAP,
  SIS321_MATRIX,
  SIS321_ROLES,
  SIS321_SYSTEMS,
} from '@/data/seed'
import {
  ApiError,
  auditApi,
  authApi,
  casesApi,
  clearTokens,
  isApiEnabled,
  isAuthenticated,
  probeApi,
  rolesApi,
  setTokens,
  usersApi,
} from '@/lib/apiClient'
import { cryptoId, nowIso, toggleInList } from '@/lib/format'

const MAX_ATTEMPTS = 3
const PASSWORD_HISTORY_LIMIT = 5

/** Clave donde se recuerda el ultimo User ID escrito, para restaurar el
 *  bloqueo temporal tras un F5 (el conteo exacto lo recalcula el servidor). */
const LAST_IDENTIFIER_KEY = 'legalshield.lastIdentifier'

function readLastIdentifier() {
  try {
    return window.sessionStorage.getItem(LAST_IDENTIFIER_KEY) ?? ''
  } catch {
    return ''
  }
}

function writeLastIdentifier(value) {
  try {
    if (value) window.sessionStorage.setItem(LAST_IDENTIFIER_KEY, value)
    else window.sessionStorage.removeItem(LAST_IDENTIFIER_KEY)
  } catch {
    /* sessionStorage no disponible */
  }
}

/**
 * Estado de conexion con la API REST (`/back`), que persiste en MySQL.
 *
 *   'probeando'  verificacion inicial de disponibilidad
 *   'en linea'   la API responde y los datos vienen de MySQL
 *   'degradado'  una operacion concreta devolvio 4xx/5xx
 *   'error'      sin conexion con el servidor MySQL
 *
 * No existe simulador ni dato de respaldo: si la API no responde, las vistas
 * muestran un estado de error o una tabla vacia, nunca informacion inventada.
 */

/* -------------------------------------------------------------------------- */
/* Traductores API <-> estado de la UI                                         */
/* -------------------------------------------------------------------------- */

/** Respuesta de POST /auth/login o GET /auth/me -> forma de sesion esperada. */
const apiUserToSession = (user) => ({
  userId: user.userCode,
  name: user.username,
  email: user.email,
  role: user.role,
  roleLabel: user.roleLabel ?? ROLES.find((r) => r.id === user.role)?.label ?? user.role,
  permissions: user.permissions ?? [],
  loginAt: nowIso(),
})

/** Respuesta de GET /auth/profile -> ficha editable + historial de claves. */
const apiProfileToUser = (data) => {
  const p = data.profile ?? {}
  const parts = String(p.username ?? '').split('.')
  return {
    ...p,
    userId: p.userCode,
    name: p.username,
    firstName: parts[0] ?? '',
    lastName: parts.slice(1).join('.'),
    roleLabel: p.roleLabel ?? p.role,
    passwordHistory: data.passwordHistory ?? [],
    passwordHistoryLimit: data.passwordHistoryLimit ?? PASSWORD_HISTORY_LIMIT,
  }
}

/** Fila de GET /auth/directory -> entrada del directorio de login. */
const apiDirectoryToEntry = (row) => ({
  userId: row.userCode,
  name: row.name ?? row.userCode,
  role: row.role,
  department: row.department ?? '',
  email: row.email ?? '',
})

/** Fila de GET /api/users -> entrada del ABM en la UI. */
const apiUserToAdminUser = (row) => {
  const parts = String(row.username ?? '').split('.')
  return {
    id: row.id,
    userCode: row.userCode,
    username: row.username,
    firstName: row.firstName ?? parts[0] ?? '',
    lastName: row.lastName ?? parts.slice(1).join('.') ?? '',
    email: row.email ?? '',
    phone: row.phone ?? '',
    firm: row.firm ?? '',
    department: row.department ?? '',
    role: row.role,
    roleLabel: row.roleLabel,
    status: row.status,
    isActive: row.isActive,
    isLocked: row.isLocked,
    failedAttempts: row.failedAttempts,
    lockedAt: row.lockedAt,
    lockedUntil: row.lockedUntil,
    remainingSeconds: row.remainingSeconds ?? 0,
    createdAt: row.createdAt,
  }
}

/** Fila de legal_cases -> expediente del frontend. */
const apiCaseToCase = (row) => ({
  id: row.caseNumber,
  title: row.title,
  client: row.clientName,
  court: row.court ?? '',
  matter: row.matter ?? '',
  stage: row.stage ?? '',
  risk: row.riskLevel === 'critica' ? 'critico' : row.riskLevel,
  deadline: row.deadline ? String(row.deadline).slice(0, 10) : null,
  progress: row.progress,
  owner: row.ownerUserCode ?? '',
  privileged: row.isPrivileged,
  docs: [],
})

/** Fila de security_logs -> entrada de bitacora del frontend. */
const apiLogToLog = (row) => ({
  id: `LG-${row.id}`,
  ts: row.timestamp,
  type: row.action,
  severity: row.status === 'CRITICO' ? 'critico' : row.status === 'WARN' ? 'warn' : 'info',
  actor: row.userCode ?? 'SISTEMA',
  target: row.ipAddress ?? 'api',
  message:
    typeof row.details?.message === 'string'
      ? row.details.message
      : `${row.action} · registrado desde ${row.ipAddress ?? 'origen desconocido'}`,
})

const CONNECTION_ERROR = 'Error de conexión con el servidor MySQL'

/**
 * Clasifica un fallo de API. Los 4xx de validacion (salvo 401/403) son
 * respuestas de negocio esperadas; el resto marcan el estado de conexion.
 */
function noteApiFailure(set, error, context) {
  if (error instanceof ApiError && error.status === 0) {
    set({ apiStatus: 'error', apiError: `${CONNECTION_ERROR} · verifique que el backend este en marcha` })
    return
  }
  if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 401 && error.status !== 403) {
    return
  }
  if (error instanceof ApiError) {
    set({ apiStatus: 'degradado', apiError: error.message })
    console.warn(`[api:${context}]`, error.status, error.message)
    return
  }
  set({ apiStatus: 'error', apiError: CONNECTION_ERROR })
}

const ok = (set) => set({ apiStatus: 'en linea', apiError: null })

const initialState = () => ({
  session: null,
  profile: null,
  attempts: 0,
  lockedUntil: null,
  lastIdentifier: readLastIdentifier(),
  unlockRequest: null,
  didactic: true,
  apiStatus: isApiEnabled() ? 'probeando' : 'error',
  apiError: isApiEnabled() ? null : 'API REST deshabilitada por configuracion (VITE_API_ENABLED=false)',
  directory: [],
  users: [],
  rbac: {},
  cases: [],
  logs: [],
  activityLogs: [],
  revealedDocs: [],
  sis321: structuredClone(SIS321_MATRIX),
  infoAssets: structuredClone(INFO_ASSETS),
  riskControls: structuredClone(RISK_CONTROLS),
  risks: structuredClone(RISK_HEATMAP),
  receipts: [],
  tokens: [],
})

export const useAppStore = create((set, get) => ({
  ...initialState(),
  liveFeedOn: true,

  /* ------------------------------- AUDITORIA ------------------------------ */
  pushLog: ({ type, severity = 'info', actor, target = 'sistema', message }) =>
    set((s) => ({
      logs: [
        {
          id: cryptoId('LG').toUpperCase(),
          ts: nowIso(),
          type,
          severity,
          actor: actor ?? s.session?.userId ?? 'SISTEMA',
          target,
          message,
        },
        ...s.logs,
      ].slice(0, 140),
    })),

  setLiveFeed: (value) => set({ liveFeedOn: value }),

  /* -------------------------------- AUTH --------------------------------- */

  /**
   * Comprueba la API al arrancar y, si hay un token persistido, rehidrata la
   * sesion desde MySQL. No hay fallback: sin API la app muestra el error.
   */
  bootstrap: async () => {
    const status = await probeApi({ notify: false })
    if (status !== 'online') {
      set({
        apiStatus: 'error',
        apiError: `${CONNECTION_ERROR} · verifique que XAMPP MySQL y el backend esten en marcha`,
      })
      return status
    }
    ok(set)

    if (isAuthenticated()) {
      try {
        const data = await authApi.me()
        set({ session: apiUserToSession(data.user) })
        await get().loadProfile()
      } catch {
        clearTokens()
        set({ session: null })
      }
    }
    return 'online'
  },

  /**
   * Login contra la API. El contrato { ok, locked, attempts, user } se preserva
   * para que `Login.jsx` no cambie. Nunca inventa una sesion local.
   */
  login: async ({ userId, password }) => {
    const code = String(userId ?? '').trim().toUpperCase()
    writeLastIdentifier(code)
    set({ lastIdentifier: code })

    try {
      const data = await authApi.login(code, password)
      setTokens({ access: data.token, refresh: data.refreshToken })
      ok(set)

      const user = apiUserToSession(data.user)
      set({ session: user, attempts: 0, lockedUntil: null })
      get().loadDirectory().catch(() => {})
      return { ok: true, user }
    } catch (error) {
      if (error instanceof ApiError && error.status === 0) {
        noteApiFailure(set, error, 'login')
        return { ok: false, locked: false, attempts: get().attempts, error: `${CONNECTION_ERROR}` }
      }

      // 403 = cuenta desactivada por un administrador (baja logica).
      if (error instanceof ApiError && error.isForbidden) {
        return { ok: false, locked: false, attempts: get().attempts, error: error.message }
      }

      // 401: credencial incorrecta, cuenta bloqueada (isLocked) o desactivada.
      // El backend informa el tiempo restante exacto calculado en MySQL.
      if (error instanceof ApiError && error.isAuth) {
        const locked = error.isLocked
        const remainingSeconds = locked ? Math.max(1, error.remainingSeconds) : 0
        const attempts = error.failedAttempts || get().attempts + 1
        set({
          attempts: locked ? MAX_ATTEMPTS : attempts,
          lockedUntil: locked ? Date.now() + remainingSeconds * 1000 : null,
          unlockRequest: locked ? get().unlockRequest : null,
        })
        return { ok: false, locked, attempts, remainingSeconds, error: error.message }
      }

      noteApiFailure(set, error, 'login')
      return { ok: false, locked: false, attempts: get().attempts, error: error.message }
    }
  },

  /**
   * Reconsulta en el servidor el bloqueo temporal de un User ID. Permite que
   * `Login.jsx`, tras un F5, retome la cuenta regresiva sin reiniciarla.
   */
  checkLockStatus: async (userCode) => {
    const code = String(userCode ?? get().lastIdentifier ?? '').trim().toUpperCase()
    if (!code) return { isLocked: false, remainingSeconds: 0, failedAttempts: 0 }

    try {
      const data = await authApi.lockStatus(code)
      const remainingSeconds = Math.max(0, Number(data.remainingSeconds ?? 0))
      set({
        attempts: data.isLocked ? MAX_ATTEMPTS : Number(data.failedAttempts ?? 0),
        lockedUntil: data.isLocked ? Date.now() + remainingSeconds * 1000 : null,
        lastIdentifier: code,
      })
      return { ...data, remainingSeconds }
    } catch {
      // Sin conexion o cuenta inexistente: no se altera el estado de bloqueo.
      return { isLocked: false, remainingSeconds: 0, failedAttempts: 0 }
    }
  },

  /** Directorio de usuarios para la pantalla de login (requiere sesion). */
  loadDirectory: async () => {
    try {
      const data = await authApi.directory()
      set({ directory: (data.users ?? []).map(apiDirectoryToEntry) })
      return data.users?.length ?? 0
    } catch (error) {
      noteApiFailure(set, error, 'directory')
      return 0
    }
  },

  /* ------------------------------- ALTA / REGISTER ----------------------- */

  /** Alta de usuario. El User ID lo emite el servidor en una transaccion. */
  registerUser: async ({ firstName, lastName, email, firm, role, password, department }) => {
    const requested = REGISTER_ROLES.find((r) => r.id === role) ?? REGISTER_ROLES[0]

    const data = await authApi.register({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      password,
      role: requested.id,
      firm: firm.trim(),
      department: department?.trim() || requested.department,
    })
    ok(set)
    return {
      userId: data.user.userCode,
      userCode: data.user.userCode,
      username: data.user.username,
      name: data.user.username,
      email: data.user.email,
      role: data.user.role,
    }
  },

  /* ------------------------------- ABM / USERS --------------------------- */

  /** Carga la lista del ABM desde MySQL (requiere permiso de gestion de usuarios). */
  loadUsers: async () => {
    if (!get().hasAnyPermission(['USERS_READ', 'USERS_MANAGE'])) {
      set({ users: [] })
      return 0
    }
    try {
      const data = await usersApi.list({ limit: 200 })
      set({ users: data.users.map(apiUserToAdminUser) })
      ok(set)
      return data.users.length
    } catch (error) {
      noteApiFailure(set, error, 'users')
      return 0
    }
  },

  /** Alta granular (USERS_CREATE): User ID nombre.apellido emitido por el backend. */
  createUserAdmin: async ({ firstName, lastName, email, role, firm, department, phone, password }) => {
    const data = await usersApi.create({ firstName, lastName, email, role, firm, department, phone, password })
    const user = apiUserToAdminUser(data.user)
    set((s) => ({ users: [user, ...s.users] }))
    ok(set)
    return { user, tempPassword: data.tempPassword }
  },

  /** Edicion granular (USERS_UPDATE): datos personales, rol o estado. */
  updateUserAdmin: async (id, payload) => {
    const data = await usersApi.update(id, payload)
    const updated = apiUserToAdminUser(data.user)
    set((s) => ({ users: s.users.map((u) => (u.id === id ? updated : u)) }))
    ok(set)
    return updated
  },

  /** Baja logica / reactivacion (USERS_DELETE). */
  setUserStatusAdmin: async (id, active) => {
    await usersApi.status(id, { active })
    set((s) => ({ users: s.users.map((u) => (u.id === id ? { ...u, isActive: active } : u)) }))
    ok(set)
    return true
  },

  /** Desbloqueo + reset de clave (USERS_UNLOCK). */
  unlockUserAdmin: async (id, tempPassword) => {
    const data = await usersApi.unlock(id, { tempPassword })
    set((s) => ({
      users: s.users.map((u) => (u.id === id ? { ...u, isLocked: false, failedAttempts: 0 } : u)),
    }))
    ok(set)
    return { data, tempPassword: data.tempPassword }
  },

  /* -------------------------------- PERFIL ------------------------------- */

  /** Ficha completa del titular (incluye telefono, despacho e historial). */
  loadProfile: async () => {
    try {
      const data = await authApi.profile()
      set({ profile: apiProfileToUser(data) })
      ok(set)
      return data.profile
    } catch (error) {
      noteApiFailure(set, error, 'profile')
      return null
    }
  },

  /** Edicion autoexigible de datos. El servidor normaliza nombre y correo. */
  updateProfile: async ({ firstName, lastName, phone, email }) => {
    const userId = get().session?.userId
    const data = await authApi.updateProfile({ firstName, lastName, phone, email })
    const username = data.profile.username
    set((s) => ({
      directory: s.directory.map((u) =>
        u.userId === userId ? { ...u, name: username, phone, email } : u,
      ),
      session: s.session ? { ...s.session, name: username, email } : null,
    }))
    await get().loadProfile()
    ok(set)
    return data.profile
  },

  /**
   * Cambio de clave (punto 9.3): valida la clave actual y no admite las ultimas
   * 5 contrasenas. La comprobacion la ejecuta el servidor con bcrypt.
   */
  changePassword: async ({ current, next }) => {
    try {
      await authApi.changePassword(current, next)
      await get().loadProfile()
      ok(set)
      return { ok: true }
    } catch (error) {
      if (error instanceof ApiError && error.isAuth) {
        return { ok: false, reason: 'current' }
      }
      if (error instanceof ApiError && error.status === 422) {
        return { ok: false, reason: error.details?.reuseBlocked ? 'reused' : 'weak' }
      }
      noteApiFailure(set, error, 'password')
      return { ok: false, reason: 'error' }
    }
  },

  requestUnlock: async (userCode) => {
    set({ unlockRequest: { ts: nowIso(), ticket: `UNB-${userCode ?? 'ANONIMO'}` } })
  },

  /**
   * Desbloqueo real contra la API. Exige el permiso ACCOUNT_UNLOCK: lo restringe
   * al Oficial de Seguridad (OSI); no es una autoayuda del titular bloqueado.
   */
  unlockAccount: async (userCode) => {
    try {
      const data = await authApi.unlock(userCode)
      set({ attempts: 0, lockedUntil: null, unlockRequest: null })
      ok(set)
      return { ok: true, message: data.message }
    } catch (error) {
      if (error instanceof ApiError && error.isForbidden) return { ok: false, reason: 'forbidden' }
      noteApiFailure(set, error, 'unlock')
      return { ok: false, reason: 'error' }
    }
  },

  resetLock: () => set({ attempts: 0, lockedUntil: null, unlockRequest: null }),

  logout: async () => {
    const user = get().session
    try {
      if (user) await authApi.logout()
    } catch {
      /* el cierre local no depende de la respuesta del servidor */
    }
    clearTokens()
    set({ session: null, profile: null, directory: [], users: [], logs: [], activityLogs: [], cases: [] })
  },

  /* -------------------------------- RBAC --------------------------------- */

  hasPermission: (permissionId, roleId) => {
    const state = get()
    const role = roleId ?? state.session?.role
    if (!role) return false

    // Con sesion autenticada manda la lista de permisos que resolvio el servidor.
    if (!roleId && state.session?.permissions?.length) {
      return state.session.permissions.includes(permissionId)
    }
    return (state.rbac[role] ?? []).includes(permissionId)
  },

  /** True si la sesion vigente posee al menos uno de los permisos indicados. */
  hasAnyPermission: (permissionIds = []) => {
    const permissions = get().session?.permissions
    if (!permissions?.length) return false
    return permissionIds.some((code) => permissions.includes(code))
  },

  /** True si la sesion vigente posee todos los permisos indicados. */
  hasAllPermissions: (permissionIds = []) => {
    const permissions = get().session?.permissions ?? []
    return permissionIds.every((code) => permissions.includes(code))
  },

  /**
   * Concesion/revocacion de un permiso atomico. El cambio optimista repinta la
   * matriz al instante y la API lo confirma; si el servidor lo rechaza se revierte.
   */
  togglePermission: async (roleId, permissionId) => {
    const current = get().rbac[roleId] ?? []
    const granting = !current.includes(permissionId)

    set((s) => ({ rbac: { ...s.rbac, [roleId]: toggleInList(current, permissionId) } }))

    try {
      const data = await rolesApi.updatePermissions([{ role: roleId, permission: permissionId, granted: granting }])
      set({ rbac: structuredClone(data.assignments) })
      ok(set)
    } catch (error) {
      // La API rechazo el cambio: se revierte el estado optimista.
      set((s) => ({ rbac: { ...s.rbac, [roleId]: current } }))
      noteApiFailure(set, error, 'rbac')
      throw error
    }

    return { granting }
  },

  /** Carga la matriz rol x permiso desde MySQL. */
  loadMatrix: async () => {
    try {
      const data = await rolesApi.matrix()
      set({ rbac: structuredClone(data.assignments) })
      ok(set)
      return data
    } catch (error) {
      noteApiFailure(set, error, 'matrix')
      return null
    }
  },

  /** Restaura la matriz base delegando en el backend. */
  resetRbac: async () => {
    await rolesApi.reset()
    return get().loadMatrix()
  },

  /**
   * Bitacora de SEGURIDAD (acceso y control). Exclusiva del OSI: si la sesion
   * no tiene SECURITY_LOGS_VIEW no se consulta y no se marca la conexion como
   * degradada (el 403 es una restriccion de RBAC esperada, no un fallo).
   */
  loadSecurityLogs: async (filters = {}) => {
    if (!get().hasPermission('SECURITY_LOGS_VIEW')) {
      set({ logs: [] })
      return 0
    }
    try {
      const data = await auditApi.security({ limit: 80, ...filters })
      set({ logs: data.logs.map(apiLogToLog) })
      ok(set)
      return data.logs.length
    } catch (error) {
      noteApiFailure(set, error, 'security-logs')
      return 0
    }
  },

  /** Bitacora de ACTIVIDAD (acciones de negocio del despacho). */
  loadActivityLogs: async (filters = {}) => {
    if (!get().hasPermission('LOGS_VIEW')) {
      set({ activityLogs: [] })
      return 0
    }
    try {
      const data = await auditApi.activity({ limit: 80, ...filters })
      set({ activityLogs: data.logs.map(apiLogToLog) })
      ok(set)
      return data.logs.length
    } catch (error) {
      noteApiFailure(set, error, 'activity-logs')
      return 0
    }
  },

  /** Alias de compatibilidad: la bitacora por defecto es la de seguridad. */
  loadLogs: async (filters = {}) => get().loadSecurityLogs(filters),

  /* ------------------- SIS-321 · Matriz rol x sistema/recurso ---------------
   * Planilla didactica de referencia (UCB): vive en memoria y no persiste.
   * ------------------------------------------------------------------------ */
  toggleMatrixAccess: (roleId, resourceId) => {
    set((s) => ({ sis321: { ...s.sis321, [roleId]: toggleInList(s.sis321[roleId] ?? [], resourceId) } }))
    const roleLabel = SIS321_ROLES.find((r) => r.id === roleId)?.label ?? roleId
    const resource = SIS321_SYSTEMS.flatMap((system) => system.resources).find((r) => r.id === resourceId)
    const granted = (get().sis321[roleId] ?? []).includes(resourceId)
    return { granting: granted, roleLabel, resourceLabel: resource?.label ?? resourceId }
  },

  /** Marca o desmarca un recurso para los nueve roles de una vez. */
  setSystemColumn: (resourceId, granted) => {
    const state = get()
    const sis321 = { ...state.sis321 }
    SIS321_ROLES.forEach((role) => {
      const list = sis321[role.id] ?? []
      sis321[role.id] = granted
        ? [...new Set([...list, resourceId])]
        : list.filter((id) => id !== resourceId)
    })
    set({ sis321 })
  },

  resetSis321: () => set({ sis321: structuredClone(SIS321_MATRIX) }),

  /* ------------- SIS-321 · Matriz de clasificacion de informacion --------- */
  setInfoAssetValue: (assetId, dimension, value) => {
    const next = Math.min(3, Math.max(1, Number(value)))
    set((s) => ({
      infoAssets: s.infoAssets.map((a) => (a.id === assetId ? { ...a, [dimension]: next } : a)),
    }))
  },

  resetInfoAssets: () => set({ infoAssets: structuredClone(INFO_ASSETS) }),

  /* --------------------- EFECTOS DIDACTICOS (React Bits) ------------------ */
  setDidactic: (value) => set({ didactic: Boolean(value) }),

  /* ------------------------------ EXPEDIENTES ---------------------------- */
  /**
   * Archivo logico contra la API (el servidor no borra: marca `archivado`). El
   * indice de la lista local se usa solo como id del recurso.
   */
  archiveCase: async (caseId) => {
    const index = get().cases.findIndex((c) => c.id === caseId)
    if (index === -1) return
    await casesApi.archive(index + 1)
    set((s) => ({ cases: s.cases.filter((c) => c.id !== caseId) }))
    ok(set)
  },

  /** Carga los expedientes respetando el alcance por ambito del servidor. */
  loadCases: async (filters = {}) => {
    try {
      const data = await casesApi.list({ limit: 60, ...filters })
      set({ cases: data.cases.map(apiCaseToCase) })
      ok(set)
      return data.cases.length
    } catch (error) {
      noteApiFailure(set, error, 'cases')
      return 0
    }
  },

  /* --------------------------- DOCUMENTOS RESTRINGIDOS -------------------- */
  revealDocument: (docId) => {
    if (!get().revealedDocs.includes(docId)) {
      set((s) => ({ revealedDocs: [...s.revealedDocs, docId] }))
    }
  },

  concealDocument: (docId) =>
    set((s) => ({ revealedDocs: s.revealedDocs.filter((id) => id !== docId) })),

  /* --------------------------- COMPROBANTES / TOKENS --------------------- */
  issueReceipt: ({ title, subject, logId }) => {
    const receipt = {
      id: cryptoId('RC'),
      serial: String(get().receipts.length + 1).padStart(4, '0'),
      title,
      subject,
      hash: Math.random().toString(16).slice(2, 18),
      signer: get().session?.name ?? 'Administrador',
      issuedAt: nowIso(),
      sourceLog: logId ?? null,
      status: 'disponible',
    }
    set((s) => ({ receipts: [receipt, ...s.receipts] }))
    return receipt
  },

  tearReceipt: (receiptId) =>
    set((s) => ({
      receipts: s.receipts.map((r) => (r.id === receiptId ? { ...r, status: 'validado' } : r)),
    })),

  issueResetToken: (userId) => {
    const token = { id: cryptoId('TK'), userId, ttl: 900, issuedAt: nowIso(), status: 'activo' }
    set((s) => ({ tokens: [token, ...s.tokens] }))
    return token
  },

  tearToken: (tokenId) =>
    set((s) => ({ tokens: s.tokens.map((t) => (t.id === tokenId ? { ...t, status: 'consumido' } : t)) })),

  /* ------------------------------ ISO 27001 ------------------------------ */
  setControlScore: (controlId, score) => {
    set((s) => ({
      riskControls: s.riskControls.map((c) => (c.id === controlId ? { ...c, score } : c)),
    }))
  },

  setRiskCell: (riskId, probability, impact) => {
    set((s) => ({
      risks: s.risks.map((r) => (r.id === riskId ? { ...r, probability, impact } : r)),
    }))
  },

  /* --------------------------------- RESET ------------------------------- */
  /** Recarga desde MySQL todos los conjuntos de negocio del rol vigente. */
  refreshAll: async () => {
    const state = get()
    await Promise.allSettled([
      state.hasPermission('CASES_READ') ? state.loadCases() : Promise.resolve(),
      state.hasPermission('SECURITY_LOGS_VIEW') ? state.loadSecurityLogs() : Promise.resolve(),
      state.hasPermission('LOGS_VIEW') ? state.loadActivityLogs() : Promise.resolve(),
      state.hasAnyPermission(['RBAC_MANAGE', 'ROLES_MANAGE']) ? state.loadMatrix() : Promise.resolve(),
      state.hasAnyPermission(['USERS_READ', 'USERS_MANAGE']) ? state.loadUsers() : Promise.resolve(),
    ])
  },
}))

export { MAX_ATTEMPTS, PASSWORD_HISTORY_LIMIT, PERMISSIONS, ROLES }
