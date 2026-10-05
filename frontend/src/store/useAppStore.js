import { create } from 'zustand'
import {
  CASES,
  DEMO_PASSWORD,
  DIRECTORY,
  INFO_ASSETS,
  INITIAL_RBAC,
  LIVESTREAM_TEMPLATES,
  PERMISSIONS,
  REGISTER_ROLES,
  ROLES,
  RISK_CONTROLS,
  RISK_HEATMAP,
  SEED_LOGS,
  SIS321_MATRIX,
  SIS321_ROLES,
  SIS321_SYSTEMS,
  USER_PROFILES,
} from '@/data/seed'
import {
  ApiError,
  authApi,
  auditApi,
  casesApi,
  clearTokens,
  isApiEnabled,
  probeApi,
  rolesApi,
  setTokens,
} from '@/lib/apiClient'
import { cryptoId, nowIso, toggleInList } from '@/lib/format'
import { scorePassword } from '@/lib/security'

const MAX_ATTEMPTS = 3
const PASSWORD_HISTORY_LIMIT = 5

/**
 * Estado de conexion con la API REST (`/back`).
 *   'probeando'  al arrancar
 *   'en linea'   la API responde y persiste en PostgreSQL
 *   'degradado'  la API fallo en una operacion concreta
 *   'simulador'  sin API: todo vive en memoria y no se persiste
 */

/** Ficha completa de un usuario del directorio: identidad + credencial. */
const buildUser = (entry, profile = {}) => ({
  ...entry,
  firstName: profile.firstName ?? entry.name.split(' ')[0] ?? entry.name,
  lastName: profile.lastName ?? entry.name.split(' ').slice(1).join(' '),
  email: profile.email ?? '',
  phone: profile.phone ?? '',
  firm: profile.firm ?? 'Vidal & Penalto Bufetes',
  roleLabel: profile.roleLabel ?? ROLES.find((r) => r.id === entry.role)?.label ?? entry.role,
  title: profile.title ?? ROLES.find((r) => r.id === entry.role)?.label ?? entry.role,
  joinedAt: profile.joinedAt ?? nowIso(),
  password: DEMO_PASSWORD,
  passwordHistory: [],
})

const seedDirectory = () =>
  DIRECTORY.map((entry) => buildUser(entry, USER_PROFILES[entry.userId]))

/**
 * Siguiente User ID estandarizado libre: LEG-AAAA-NNNN, correlativo ascendente.
 * El correlativo se toma del maximo existente para no reutilizar identificadores.
 */
const nextUserId = (directory, year = new Date().getFullYear()) => {
  const serial = directory.reduce((max, user) => {
    const tail = user.userId.split('-')[2]
    const value = Number(tail)
    return Number.isFinite(value) ? Math.max(max, value) : max
  }, 0)
  return `LEG-${year}-${String(serial + 1).padStart(4, '0')}`
}

const initialState = () => ({
  session: null,
  attempts: 0,
  lockedUntil: null,
  unlockRequest: null,
  didactic: true,
  apiMode: isApiEnabled() ? 'probeando' : 'simulador',
  directory: seedDirectory(),
  rbac: structuredClone(INITIAL_RBAC),
  sis321: structuredClone(SIS321_MATRIX),
  infoAssets: structuredClone(INFO_ASSETS),
  cases: structuredClone(CASES),
  revealedDocs: [],
  logs: structuredClone(SEED_LOGS),
  receipts: [
    {
      id: 'RC-4417',
      serial: '0001',
      title: 'Certificado de integridad',
      subject: 'Cierre del ciclo de logs del 05/10/2026',
      hash: '9f3c8a1d77b0e542',
      signer: 'Mariana Solis R.',
      issuedAt: '2026-10-05T07:45:00.000Z',
      status: 'disponible',
    },
  ],
  tokens: [
    {
      id: 'TK-7c21',
      userId: 'LEG-2026-0411',
      ttl: 900,
      issuedAt: '2026-10-05T09:47:00.000Z',
      status: 'activo',
    },
  ],
  riskControls: structuredClone(RISK_CONTROLS),
  risks: structuredClone(RISK_HEATMAP),
})

/* -------------------------------------------------------------------------- */
/* Traductores API <-> estado local                                            */
/* -------------------------------------------------------------------------- */

/** Respuesta de POST /auth/login -> forma de sesion que ya consume la UI. */
const apiUserToSession = (user) => ({
  userId: user.userCode,
  name: user.username,
  email: user.email,
  role: user.role,
  roleLabel: user.roleLabel ?? ROLES.find((r) => r.id === user.role)?.label ?? user.role,
  permissions: user.permissions ?? [],
  loginAt: nowIso(),
})

/** Fila de legal_cases -> expediente del frontend. */
const apiCaseToCase = (row) => ({
  id: row.caseNumber,
  title: row.title,
  client: row.clientName,
  court: row.court ?? '',
  matter: row.matter ?? '',
  stage: row.stage ?? '',
  risk: row.riskLevel,
  deadline: row.deadline,
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

/**
 * Clasifica un fallo de API.
 * Los 4xx de validacion (salvo 401/403) son respuestas esperadas del negocio, no
 * averias: no deben marcar el modo como degradado.
 */
function noteApiFailure(set, error, context) {
  if (!(error instanceof ApiError)) return
  if (error.status === 0) {
    set({ apiMode: 'simulador' })
    return
  }
  if (error.status >= 400 && error.status < 500 && error.status !== 401 && error.status !== 403) {
    return
  }
  set({ apiMode: 'degradado' })
  console.warn(`[api:${context}]`, error.status, error.message)
}

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

  tickLiveFeed: () => {
    if (!get().liveFeedOn) return
    const tpl = LIVESTREAM_TEMPLATES[Math.floor(Math.random() * LIVESTREAM_TEMPLATES.length)]
    set((s) => ({
      logs: [
        {
          id: cryptoId('LG').toUpperCase(),
          ts: nowIso(),
          type: tpl.type,
          severity: tpl.severity,
          actor: tpl.actor,
          target: 'stream:vivo',
          message: tpl.message,
        },
        ...s.logs,
      ].slice(0, 140),
    }))
  },

  /* -------------------------------- AUTH --------------------------------- */

  /**
   * Comprueba la API al arrancar y rehidrata directorio, matriz y bitacora desde
   * PostgreSQL. Si no responde, la app sigue operativa con el simulador.
   */
  bootstrap: async () => {
    const status = await probeApi()
    set({ apiMode: status === 'online' ? 'en linea' : 'simulador' })
    if (status !== 'online') return status

    const [directory, matrix, logs] = await Promise.allSettled([
      authApi.directory(),
      rolesApi.matrix(),
      auditApi.logs({ limit: 80 }),
    ])

    const patch = {}

    if (directory.status === 'fulfilled') {
      patch.directory = directory.value.users.map((u) =>
        buildUser(
          { userId: u.userCode, name: u.name, role: u.role, department: u.department },
          { email: u.email },
        ),
      )
    }
    if (matrix.status === 'fulfilled') {
      patch.rbac = structuredClone(matrix.value.assignments)
    }
    if (logs.status === 'fulfilled') {
      patch.logs = logs.value.logs.map(apiLogToLog)
    }

    set(patch)
    return 'online'
  },

  /**
   * Login contra la API. Mantiene el contrato { ok, locked, attempts, user } para
   * que `Login.jsx` no cambie.
   *
   * Aqui la diferencia entre API y simulador NO se oculta: solo se recurre al
   * simulador ante un fallo de red, no cuando la API responde "credencial
   * invalida" o "cuenta bloqueada". falsechar una sesion simuladaaria deja
   * credenciales sin persistir como si fueran reales.
   */
  login: async ({ userId, password }) => {
    const code = String(userId ?? '').trim().toUpperCase()

    try {
      const data = await authApi.login(code, password)
      setTokens({ access: data.token, refresh: data.refreshToken })

      const user = apiUserToSession(data.user)
      set({ session: user, attempts: 0, lockedUntil: null, apiMode: 'en linea' })
      get().pushLog({
        type: 'AUTH_SUCCESS',
        severity: 'info',
        actor: user.userId,
        target: 'Portal LegalShield',
        message: `Inicio de sesion validado por la API · rol asignado: ${String(user.roleLabel).toUpperCase()}`,
      })
      return { ok: true, user }
    } catch (error) {
      if (error instanceof ApiError && error.isNetwork) {
        set({ apiMode: 'simulador' })
        return get().loginLocal({ userId: code, password })
      }

      // 403 = cuenta bloqueada por la politica anti-fuerza bruta del servidor.
      if (error instanceof ApiError && error.isForbidden) {
        const locked = /bloqueada/i.test(error.message)
        set({
          lockedUntil: locked ? Date.now() + 120000 : null,
          unlockRequest: locked ? null : get().unlockRequest,
        })
        get().pushLog({
          type: 'LOGIN_LOCKED',
          severity: 'critico',
          actor: code,
          target: 'sistema:auth',
          message: error.message,
        })
        return { ok: false, locked, attempts: MAX_ATTEMPTS }
      }

      // 401: la API respondio, la credencial es incorrecta. El contador real vive
      // en PostgreSQL; aqui solo se refleja para la UI.
      if (error instanceof ApiError && error.isAuth) {
        const attempts = get().attempts + 1
        set({ attempts })
        get().pushLog({
          type: 'AUTH_FAILED',
          severity: 'warn',
          actor: code,
          target: 'sistema:auth',
          message: `Credencial invalida · intento ${attempts} de ${MAX_ATTEMPTS} · validado por la API`,
        })
        return { ok: false, locked: false, attempts }
      }

      noteApiFailure(set, error, 'login')
      return { ok: false, locked: false, attempts: get().attempts }
    }
  },

  /** Login contra el simulador en memoria (fallback de red y modo sin API). */
  loginLocal: ({ userId, password }) => {
    const state = get()
    const user = state.directory.find((d) => d.userId === userId)
    const ok = Boolean(user) && password === user.password

    if (!ok) {
      const attempts = state.attempts + 1
      const locked = attempts >= MAX_ATTEMPTS
      set({
        attempts,
        lockedUntil: locked ? Date.now() + 120000 : null,
        unlockRequest: locked ? null : state.unlockRequest,
      })
      get().pushLog({
        type: locked ? 'LOGIN_LOCKED' : 'AUTH_FAILED',
        severity: locked ? 'critico' : 'warn',
        actor: userId || 'ANONIMO',
        target: 'sistema:auth',
        message: locked
          ? 'Cuenta bloqueada tras 3 intentos fallidos (simulador en memoria)'
          : user
            ? `Credencial invalida · intento ${attempts} de ${MAX_ATTEMPTS}`
            : `User ID no registrado en el directorio · intento ${attempts} de ${MAX_ATTEMPTS}`,
      })
      return { ok: false, locked, attempts }
    }

    set({ session: { ...user, loginAt: nowIso() }, attempts: 0, lockedUntil: null })
    get().pushLog({
      type: 'AUTH_SUCCESS',
      severity: 'info',
      actor: user.userId,
      target: 'Portal LegalShield',
      message: `Inicio de sesion verificado · rol asignado: ${String(user.roleLabel).toUpperCase()}`,
    })
    return { ok: true, user }
  },

  /* ------------------------------- ALTA /REGISTER ----------------------- */

  /**
   * Alta de usuario. Con API conectada el User ID lo emite el servidor dentro de
   * una transaccion (correlativo sin colisiones); sin API se usa el correlativo
   * local del simulador.
   */
  registerUser: async ({ firstName, lastName, email, firm, role, password, department }) => {
    const requested = REGISTER_ROLES.find((r) => r.id === role) ?? REGISTER_ROLES[0]
    const fullName = `${firstName.trim()} ${lastName.trim()}`.trim()

    try {
      const data = await authApi.register({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        password,
        role: requested.id,
        firm: firm.trim(),
        department: department?.trim() || requested.department,
      })

      const user = buildUser(
        { userId: data.user.userCode, name: fullName, role: data.user.role, department: data.user.department },
        {
          firstName,
          lastName,
          email: data.user.email,
          firm: data.user.firm,
          phone: data.user.phone ?? '',
          roleLabel: data.user.role,
          title: `${data.user.role} · ${data.user.department ?? ''}`,
        },
      )
      user.password = password

      set((s) => ({ directory: [...s.directory, user], apiMode: 'en linea' }))
      get().pushLog({
        type: 'USER_REGISTERED',
        severity: 'warn',
        actor: user.userId,
        target: 'Portal LegalShield',
        message: `Alta persistida en PostgreSQL · User ID ${user.userId} emitido por la API · rol ${String(requested.label).toUpperCase()} · hash bcrypt registrado en password_history`,
      })
      return user
    } catch (error) {
      if (error instanceof ApiError && error.isNetwork) {
        set({ apiMode: 'simulador' })
        return get().registerUserLocal({ firstName, lastName, email, firm, role, password, department })
      }
      throw error
    }
  },

  registerUserLocal: ({ firstName, lastName, email, firm, role, password, department }) => {
    const state = get()
    const requested = REGISTER_ROLES.find((r) => r.id === role) ?? REGISTER_ROLES[0]
    const userId = nextUserId(state.directory)

    const user = buildUser(
      {
        userId,
        name: `${firstName.trim()} ${lastName.trim()}`.trim(),
        role: requested.id,
        department: department ?? requested.department,
      },
      {
        firstName,
        lastName,
        email,
        firm,
        roleLabel: requested.label,
        title: `${requested.label} · ${requested.department}`,
      },
    )
    user.password = password
    user.passwordHistory = []

    set({ directory: [...state.directory, user] })
    get().pushLog({
      type: 'USER_REGISTERED',
      severity: 'warn',
      actor: userId,
      target: 'Portal LegalShield',
      message: `Alta en simulador (sin API) · User ID ${userId} · rol solicitado ${String(requested.label).toUpperCase()}`,
    })
    return user
  },

  /* -------------------------------- PERFIL ------------------------------- */

  /** Edicion autoexigible de datos. El servidor normaliza nombre y correo. */
  updateProfile: async ({ firstName, lastName, phone, email }) => {
    const userId = get().session?.userId

    try {
      const data = await authApi.updateProfile({ firstName, lastName, phone, email })
      const username = data.profile.username
      set((s) => ({
        directory: s.directory.map((u) =>
          u.userId === userId ? { ...u, firstName, lastName, name: username, phone, email } : u,
        ),
        session: s.session ? { ...s.session, name: username, email } : null,
        apiMode: 'en linea',
      }))
      get().pushLog({
        type: 'PROFILE_UPDATED',
        severity: 'info',
        actor: userId,
        target: 'perfil:usuario',
        message: `Ficha personal persistida en PostgreSQL · contacto ${email}`,
      })
      return data.profile
    } catch (error) {
      if (error instanceof ApiError && error.isNetwork) {
        set({ apiMode: 'simulador' })
        return get().updateProfileLocal({ firstName, lastName, phone, email })
      }
      throw error
    }
  },

  updateProfileLocal: ({ firstName, lastName, phone, email }) => {
    const state = get()
    const userId = state.session?.userId
    const name = `${firstName.trim()} ${lastName.trim()}`.trim()

    set({
      directory: state.directory.map((u) =>
        u.userId === userId ? { ...u, firstName, lastName, name, phone, email } : u,
      ),
      session: state.session?.userId === userId ? { ...state.session, name, email } : state.session,
    })
    get().pushLog({
      type: 'PROFILE_UPDATED',
      severity: 'info',
      actor: userId,
      target: 'perfil:usuario',
      message: `Ficha personal actualizada en el simulador · contacto ${email}`,
    })
    return { userCode: userId, username: name, email }
  },

  /**
   * Cambio de clave con las reglas del punto 9.3: se valida la clave actual y no
   * se admiten las ultimas 5 contrasenas del usuario. La comprobacion de
   * reutilizacion la hace el servidor con `bcrypt.compare` sobre cada hash previo.
   */
  changePassword: async ({ current, next }) => {
    const userId = get().session?.userId

    try {
      await authApi.changePassword(current, next)
      set((s) => ({
        directory: s.directory.map((u) =>
          u.userId === userId
            ? {
                ...u,
                password: next,
                passwordHistory: [current, ...(u.passwordHistory ?? [])].slice(0, PASSWORD_HISTORY_LIMIT),
              }
            : u,
        ),
        session: s.session ? { ...s.session, password: next } : null,
        apiMode: 'en linea',
      }))
      get().pushLog({
        type: 'PASSWORD_CHANGED',
        severity: 'critico',
        actor: userId,
        target: 'perfil:credencial',
        message: `Contrasena rotada y persistida · historial acotado a ${PASSWORD_HISTORY_LIMIT} entradas (punto 9.3)`,
      })
      return { ok: true }
    } catch (error) {
      if (error instanceof ApiError && error.isNetwork) {
        set({ apiMode: 'simulador' })
        return get().changePasswordLocal({ current, next })
      }
      // 401 = clave actual incorrecta. 422 = politica o reutilizacion.
      if (error instanceof ApiError && error.isAuth) {
        get().pushLog({
          type: 'PASSWORD_CHANGE_DENIED',
          severity: 'warn',
          actor: userId,
          target: 'perfil:credencial',
          message: 'Cambio de clave rechazado · la contrasena actual no coincide',
        })
        return { ok: false, reason: 'current' }
      }
      if (error instanceof ApiError && error.status === 422) {
        return { ok: false, reason: error.details?.reuseBlocked ? 'reused' : 'weak' }
      }
      throw error
    }
  },

  changePasswordLocal: ({ current, next }) => {
    const state = get()
    const userId = state.session?.userId
    const user = state.directory.find((u) => u.userId === userId)

    if (!user) return { ok: false, reason: 'unknown' }
    if (current !== user.password) {
      get().pushLog({
        type: 'PASSWORD_CHANGE_DENIED',
        severity: 'warn',
        actor: userId,
        target: 'perfil:credencial',
        message: 'Cambio de clave rechazado · la contrasena actual no coincide',
      })
      return { ok: false, reason: 'current' }
    }
    if (next === current) return { ok: false, reason: 'same' }
    if ((user.passwordHistory ?? []).includes(next)) {
      get().pushLog({
        type: 'PASSWORD_CHANGE_DENIED',
        severity: 'critico',
        actor: userId,
        target: 'perfil:credencial',
        message: `Cambio de clave rechazado · reutilizacion de clave previa (punto 9.3 · historial de ${PASSWORD_HISTORY_LIMIT})`,
      })
      return { ok: false, reason: 'reused' }
    }
    if (scorePassword(next).score < 2) return { ok: false, reason: 'weak' }

    const history = [current, ...(user.passwordHistory ?? [])].slice(0, PASSWORD_HISTORY_LIMIT)
    set({
      directory: state.directory.map((u) =>
        u.userId === userId ? { ...u, password: next, passwordHistory: history } : u,
      ),
      session:
        state.session?.userId === userId
          ? { ...state.session, password: next, passwordHistory: history }
          : state.session,
    })
    get().pushLog({
      type: 'PASSWORD_CHANGED',
      severity: 'critico',
      actor: userId,
      target: 'perfil:credencial',
      message: `Contrasena rotada en el simulador · historial ${history.length}/${PASSWORD_HISTORY_LIMIT}`,
    })
    return { ok: true, history }
  },

  /** Pronostico de reutilizacion: usado por el formulario de clave. */
  isReusedPassword: (userId, candidate) => {
    const user = get().directory.find((u) => u.userId === userId)
    if (!user) return false
    return user.passwordHistory.includes(candidate)
  },

  requestUnlock: async (userCode) => {
    set({ unlockRequest: { ts: nowIso(), ticket: `UNB-${userCode ?? 'ANONIMO'}` } })
    get().pushLog({
      type: 'UNLOCK_REQUESTED',
      severity: 'warn',
      actor: userCode ?? 'ANONIMO',
      target: 'admin:seguridad',
      message: 'Solicitud de desbloqueo de cuenta elevada al administrador del despacho',
    })
  },

  /**
   * Desbloqueo real contra la API. Exige el permiso TOKEN_RESET, por eso el
   * backend lo restringe al socio: no es una autoayuda del titular bloqueado.
   */
  unlockAccount: async (userCode) => {
    try {
      const data = await authApi.unlock(userCode)
      set({ attempts: 0, lockedUntil: null, unlockRequest: null, apiMode: 'en linea' })
      return { ok: true, message: data.message }
    } catch (error) {
      if (error instanceof ApiError && error.isNetwork) {
        set({ apiMode: 'simulador' })
        get().resetLock()
        return { ok: true, message: 'Desbloqueado en el simulador (API no disponible)' }
      }
      if (error instanceof ApiError && error.isForbidden) return { ok: false, reason: 'forbidden' }
      noteApiFailure(set, error, 'unlock')
      return { ok: false, reason: 'error' }
    }
  },

  resetLock: () =>
    set({ attempts: 0, lockedUntil: null, unlockRequest: null }),

  logout: async () => {
    const user = get().session
    try {
      if (user) await authApi.logout()
    } catch {
      /* el cierre local no depende de la respuesta del servidor */
    }
    clearTokens()
    if (user) {
      get().pushLog({
        type: 'AUTH_LOGOUT',
        severity: 'info',
        actor: user.userId,
        target: 'Portal LegalShield',
        message: 'Cierre de sesion y revocacion del token de acceso',
      })
    }
    set({ session: null })
  },
/* -------------------------------- RBAC --------------------------------- */

  hasPermission: (permissionId, roleId) => {
    const state = get()
    const role = roleId ?? state.session?.role
    if (!role) return false

    // Con sesion autenticada contra la API, los permisos los resuelvio el servidor
    // (y los revalida en cada peticion): mandan sobre la copia local de la matriz.
    if (!roleId && state.session?.permissions?.length) {
      return state.session.permissions.includes(permissionId)
    }
    return (state.rbac[role] ?? []).includes(permissionId)
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
      set({ rbac: structuredClone(data.assignments), apiMode: 'en linea' })
    } catch (error) {
      if (error instanceof ApiError && error.isNetwork) {
        set({ apiMode: 'simulador' })
      } else if (error instanceof ApiError) {
        noteApiFailure(set, error, 'rbac')
        // La API rechazo el cambio: se revierte el estado optimista para no
        // mostrar en la UI unaMatrix que la base de datos no tiene.
        set((s) => ({ rbac: { ...s.rbac, [roleId]: current } }))
        throw error
      }
    }

    const roleLabel = ROLES.find((r) => r.id === roleId)?.label ?? roleId
    const perm = PERMISSIONS.find((p) => p.id === permissionId)
    get().pushLog({
      type: 'PERMISSION_CHANGED',
      severity: 'critico',
      target: `rol:${roleId}`,
      message: `${granting ? 'Concesion' : 'Retiro'} de ${permissionId} al rol ${roleLabel}${
        perm ? ` (${perm.label})` : ''
      } · ajuste aplicado sin reiniciar el servidor`,
    })

    // La sesion en curso puede perder capacidades: se refleja de inmediato.
    const session = get().session
    if (session?.role === roleId) {
      set({ session: { ...session, permissionsRevalidatedAt: nowIso() } })
    }
    return { granting, roleLabel }
  },

  /** Carga la matriz rol x permiso desde la API. */
  loadMatrix: async () => {
    try {
      const data = await rolesApi.matrix()
      set({ rbac: structuredClone(data.assignments), apiMode: 'en linea' })
      return data
    } catch (error) {
      noteApiFailure(set, error, 'matrix')
      return null
    }
  },

  /** Restaura la matriz base delegando en el backend. */
  resetRbac: async () => {
    try {
      await rolesApi.reset()
      set({ rbac: structuredClone(INITIAL_RBAC), apiMode: 'en linea' })
      return true
    } catch (error) {
      if (error instanceof ApiError && error.isNetwork) {
        set({ apiMode: 'simulador', rbac: structuredClone(INITIAL_RBAC) })
        return false
      }
      throw error
    }
  },

  /** Recarga la bitacora inmutable desde PostgreSQL con filtros opcionales. */
  loadLogs: async (filters = {}) => {
    try {
      const data = await auditApi.logs({ limit: 80, ...filters })
      set({ logs: data.logs.map(apiLogToLog), apiMode: 'en linea' })
      return data.logs.length
    } catch (error) {
      noteApiFailure(set, error, 'logs')
      return 0
    }
  },

  /* ------------------- SIS-321 · Matriz rol x sistema/recurso --------------- */
  toggleMatrixAccess: (roleId, resourceId) => {
    set((s) => ({ sis321: { ...s.sis321, [roleId]: toggleInList(s.sis321[roleId] ?? [], resourceId) } }))

    const roleLabel = SIS321_ROLES.find((r) => r.id === roleId)?.label ?? roleId
    const resource = SIS321_SYSTEMS.flatMap((system) => system.resources).find((r) => r.id === resourceId)
    const granted = (get().sis321[roleId] ?? []).includes(resourceId)

    get().pushLog({
      type: 'MATRIX_ACCESS_CHANGED',
      severity: 'critico',
      target: `${roleId}/${resourceId}`,
      message: `${granted ? 'Concesion' : 'Retiro'} de ${resourceId} (${resource?.label ?? resourceId}) al rol ${roleLabel} · matriz SIS-321 en memoria`,
    })
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

    const resource = SIS321_SYSTEMS.flatMap((system) => system.resources).find((r) => r.id === resourceId)
    get().pushLog({
      type: 'MATRIX_BULK_CHANGED',
      severity: 'critico',
      target: resourceId,
      message: `${granted ? 'Habilitacion' : 'Deshabilitacion'} masiva de ${resourceId} (${resource?.label ?? resourceId}) en los ${SIS321_ROLES.length} roles de la matriz SIS-321`,
    })
  },

  resetSis321: () => set({ sis321: structuredClone(SIS321_MATRIX) }),

  /* ------------- SIS-321 · Matriz de clasificacion de informacion --------- */
  setInfoAssetValue: (assetId, dimension, value) => {
    const next = Math.min(3, Math.max(1, Number(value)))
    set((s) => ({
      infoAssets: s.infoAssets.map((a) => (a.id === assetId ? { ...a, [dimension]: next } : a)),
    }))
    const asset = get().infoAssets.find((a) => a.id === assetId)
    get().pushLog({
      type: 'INFO_CLASSIFIED',
      severity: 'info',
      target: assetId,
      message: `Clasificacion actualizada · ${asset?.name ?? assetId} · ${dimension} = ${next}/3`,
    })
  },

  resetInfoAssets: () => set({ infoAssets: structuredClone(INFO_ASSETS) }),

  /* --------------------- EFECTOS DIDACTICOS (React Bits) ------------------ */
  setDidactic: (value) =>
    set((s) => ({
      didactic: Boolean(value),
      logs: [
        {
          id: cryptoId('LG').toUpperCase(),
          ts: nowIso(),
          type: 'DIDACTIC_TOGGLE',
          severity: 'info',
          actor: s.session?.userId ?? 'SISTEMA',
          target: 'ux:react-bits',
          message: `Modo didactico ${value ? 'activado' : 'desactivado'} · efectos React Bits en modo ${value ? 'explicativo' : 'funcional sutil'}`,
        },
        ...s.logs,
      ].slice(0, 140),
    })),

  /* ------------------------------ EXPEDIENTES ---------------------------- */
  /**
   * Archivo logico contra la API (el servidor no borra: marca `archivado` y sella
   * la fecha para conservar la evidencia). El indice de la lista local se usa solo
   * como id numerico; si el backend no responde, se aplica el mismo archivo local.
   */
  archiveCase: async (caseId) => {
    const index = get().cases.findIndex((c) => c.id === caseId)
    if (index === -1) return
    const found = get().cases[index]

    try {
      await casesApi.archive(index + 1)
      set({ apiMode: 'en linea' })
    } catch (error) {
      if (error instanceof ApiError && error.isNetwork) {
        set({ apiMode: 'simulador' })
      } else if (error instanceof ApiError) {
        noteApiFailure(set, error, 'archiveCase')
        // 403 (otro abogado) o 404: la UI no debe mostrar un archivo que no ocurrio.
        if (error.isForbidden || error.status === 404) return
      }
    }

    set((s) => ({ cases: s.cases.filter((c) => c.id !== caseId) }))
    get().pushLog({
      type: 'CASE_ARCHIVED',
      severity: 'warn',
      target: caseId,
      message: `Expediente "${found.title}" archivado con sello de integridad (retencion de evidencia, sin borrado fisico)`,
    })
  },

  /** Carga los expedientes respetando el alcance por ambito del servidor. */
  loadCases: async (filters = {}) => {
    try {
      const data = await casesApi.list({ limit: 60, ...filters })
      set({ cases: data.cases.map(apiCaseToCase), apiMode: 'en linea' })
      return data.cases.length
    } catch (error) {
      noteApiFailure(set, error, 'cases')
      return 0
    }
  },

  restoreCases: () => set({ cases: structuredClone(CASES) }),

  /* --------------------------- DOCUMENTOS RESTRINGIDOS -------------------- */
  revealDocument: (docId, { roleId, justification }) => {
    if (!get().revealedDocs.includes(docId)) {
      set((s) => ({ revealedDocs: [...s.revealedDocs, docId] }))
      get().pushLog({
        type: 'DOC_REVEALED',
        severity: 'warn',
        target: docId,
        message: `Revelacion autorizada bajo rol ${String(roleId).toUpperCase()} · justificacion: ${
          justification || 'no registrada'
        }`,
      })
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
    get().pushLog({
      type: 'AUDIT_RECEIPT',
      severity: 'info',
      target: receipt.id,
      message: `Comprobante ${receipt.id} emitido · hash ${receipt.hash}`,
    })
    return receipt
  },

  tearReceipt: (receiptId) =>
    set((s) => ({
      receipts: s.receipts.map((r) => (r.id === receiptId ? { ...r, status: 'validado' } : r)),
    })),

  issueResetToken: (userId) => {
    const token = {
      id: cryptoId('TK'),
      userId,
      ttl: 900,
      issuedAt: nowIso(),
      status: 'activo',
    }
    set((s) => ({ tokens: [token, ...s.tokens] }))
    get().pushLog({
      type: 'TOKEN_ISSUED',
      severity: 'critico',
      target: userId,
      message: `Token JWT temporal ${token.id} emitido · TTL ${token.ttl}s · uso unico`,
    })
    return token
  },

  tearToken: (tokenId) =>
    set((s) => ({ tokens: s.tokens.map((t) => (t.id === tokenId ? { ...t, status: 'consumido' } : t)) })),

  /* ------------------------------ ISO 27001 ------------------------------ */
  setControlScore: (controlId, score) => {
    set((s) => ({
      riskControls: s.riskControls.map((c) => (c.id === controlId ? { ...c, score } : c)),
    }))
    const control = RISK_CONTROLS.find((c) => c.id === controlId)
    get().pushLog({
      type: 'CONTROL_ASSESSED',
      severity: 'info',
      target: controlId,
      message: `Autoevaluacion ${control?.name ?? controlId}: ${score}/5 · evidencia registrada`,
    })
  },

  setRiskCell: (riskId, probability, impact) => {
    set((s) => ({
      risks: s.risks.map((r) => (r.id === riskId ? { ...r, probability, impact } : r)),
    }))
    const risk = get().risks.find((r) => r.id === riskId)
    get().pushLog({
      type: 'RISK_REVIEWED',
      severity: 'warn',
      target: riskId,
      message: `Matriz de calor actualizada: ${risk?.name ?? riskId} · P${probability} x I${impact} = ${
        probability * impact
      }`,
    })
  },

  /* --------------------------------- RESET ------------------------------- */
  resetSimulation: () =>
    set({ ...initialState(), liveFeedOn: get().liveFeedOn, didactic: get().didactic }),
}))

export { MAX_ATTEMPTS, PASSWORD_HISTORY_LIMIT }