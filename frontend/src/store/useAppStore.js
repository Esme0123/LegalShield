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
import { cryptoId } from '@/lib/format'
import { scorePassword } from '@/lib/security'

const MAX_ATTEMPTS = 3
const PASSWORD_HISTORY_LIMIT = 5
const nowIso = () => new Date().toISOString()

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
  login: ({ userId, password }) => {
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
          ? 'Cuenta bloqueada tras 3 intentos fallidos · flujo de desbloqueo habilitado'
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
      message: `Inicio de sesion verificado · rol asignado: ${user.roleLabel.toUpperCase()}`,
    })
    return { ok: true, user }
  },

  /* ------------------------------- ALTA /REGISTER ----------------------- */
  registerUser: ({ firstName, lastName, email, firm, role, password }) => {
    const state = get()
    const requested = REGISTER_ROLES.find((r) => r.id === role) ?? REGISTER_ROLES[0]
    const userId = nextUserId(state.directory)
    const fullName = `${firstName.trim()} ${lastName.trim()}`.trim()

    const user = buildUser(
      {
        userId,
        name: fullName,
        role: requested.id,
        department: requested.department,
      },
      {
        firstName,
        lastName,
        email,
        firm,
        roleLabel: requested.label,
        title: `${requested.label} · ${requested.department}`,
        joinedAt: nowIso(),
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
      message: `Alta de usuario ${userId} · rol solicitado ${requested.label.toUpperCase()} · despacho ${firm}`,
    })
    return user
  },

  /* -------------------------------- PERFIL ------------------------------- */
  updateProfile: ({ userId, firstName, lastName, phone, email }) => {
    const state = get()
    const fullName = `${firstName.trim()} ${lastName.trim()}`.trim()
    let updated = null

    const directory = state.directory.map((u) => {
      if (u.userId !== userId) return u
      updated = { ...u, firstName, lastName, name: fullName, phone, email }
      return updated
    })

    set({
      directory,
      session: state.session?.userId === userId ? { ...state.session, ...updated } : state.session,
    })

    get().pushLog({
      type: 'PROFILE_UPDATED',
      severity: 'info',
      actor: userId,
      target: 'perfil:usuario',
      message: `Ficha personal actualizada · contacto ${email} · evento sellado`,
    })
    return updated
  },

  /**
   * Cambio de clave con las reglas del punto 9.3: se valida la clave actual y
   * no se admiten las ultimas 5 contrasenas del usuario.
   */
  changePassword: ({ userId, current, next }) => {
    const state = get()
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
    if (next === current) {
      return { ok: false, reason: 'same' }
    }
    if (user.passwordHistory.includes(next)) {
      get().pushLog({
        type: 'PASSWORD_CHANGE_DENIED',
        severity: 'critico',
        actor: userId,
        target: 'perfil:credencial',
        message: `Cambio de clave rechazado · reutilizacion de clave previa (punto 9.3 · historial de ${PASSWORD_HISTORY_LIMIT})`,
      })
      return { ok: false, reason: 'reused' }
    }
    const strength = scorePassword(next)
    if (strength.score < 2) {
      return { ok: false, reason: 'weak' }
    }

    const history = [current, ...user.passwordHistory].slice(0, PASSWORD_HISTORY_LIMIT)
    const patch = { password: next, passwordHistory: history }
    const session = state.session?.userId === userId ? { ...state.session, ...patch } : state.session

    set({
      directory: state.directory.map((u) => (u.userId === userId ? { ...u, ...patch } : u)),
      session,
    })

    get().pushLog({
      type: 'PASSWORD_CHANGED',
      severity: 'critico',
      actor: userId,
      target: 'perfil:credencial',
      message: `Contrasena rotada · historial actualizado (${history.length}/${PASSWORD_HISTORY_LIMIT}) · ${strength.label} ${strength.entropy} bits`,
    })
    return { ok: true, history }
  },

  /** Pronostico de reutilizacion: usado por el formulario de clave. */
  isReusedPassword: (userId, candidate) => {
    const user = get().directory.find((u) => u.userId === userId)
    if (!user) return false
    return user.passwordHistory.includes(candidate)
  },

  requestUnlock: () => {
    set({ unlockRequest: { ts: nowIso(), ticket: cryptoId('UNB').toUpperCase() } })
    get().pushLog({
      type: 'UNLOCK_REQUESTED',
      severity: 'warn',
      actor: 'ANONIMO',
      target: 'admin:seguridad',
      message: 'Solicitud de desbloqueo de cuenta elevada al administrador del despacho',
    })
  },

  resetLock: () =>
    set({ attempts: 0, lockedUntil: null, unlockRequest: null }),

  logout: () => {
    const user = get().session
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
    return (state.rbac[role] ?? []).includes(permissionId)
  },

  togglePermission: (roleId, permissionId) => {
    const current = get().rbac[roleId] ?? []
    const granting = !current.includes(permissionId)
    const next = granting
      ? [...current, permissionId]
      : current.filter((id) => id !== permissionId)

    set((s) => ({ rbac: { ...s.rbac, [roleId]: next } }))

    const roleLabel = ROLES.find((r) => r.id === roleId)?.label ?? roleId
    const perm = PERMISSIONS.find((p) => p.id === permissionId)
    get().pushLog({
      type: 'PERMISSION_CHANGED',
      severity: 'critico',
      target: `rol:${roleId}`,
      message: `${granting ? 'Concesion' : 'Retiro'} de ${permissionId} al rol ${roleLabel}${
        perm ? ` (${perm.label})` : ''
      } · reajuste dinamico aplicado sin recarga`,
    })

    // La sesion en curso puede perder capacidades: lo reflejamos de inmediato.
    const session = get().session
    if (session?.role === roleId) {
      set({
        session: { ...session, permissionsRevalidatedAt: nowIso() },
      })
    }
    return { granting, roleLabel }
  },

  resetRbac: () => set({ rbac: structuredClone(INITIAL_RBAC) }),

  /* ------------------- SIS-321 · Matriz rol x sistema/recurso --------------- */
  toggleMatrixAccess: (roleId, resourceId) => {
    const current = get().sis321[roleId] ?? []
    const granting = !current.includes(resourceId)
    const next = granting ? [...current, resourceId] : current.filter((id) => id !== resourceId)

    set((s) => ({ sis321: { ...s.sis321, [roleId]: next } }))

    const roleLabel = SIS321_ROLES.find((r) => r.id === roleId)?.label ?? roleId
    const resource = SIS321_SYSTEMS.flatMap((system) => system.resources)
      .find((r) => r.id === resourceId)
    get().pushLog({
      type: 'MATRIX_ACCESS_CHANGED',
      severity: 'critico',
      target: `${roleId}/${resourceId}`,
      message: `${granting ? 'Concesion' : 'Retiro'} de ${resourceId} (${resource?.label ?? resourceId}) al rol ${roleLabel} · matriz SIS-321 actualizada en caliente`,
    })
    return { granting, roleLabel, resourceLabel: resource?.label ?? resourceId }
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
  archiveCase: (caseId) => {
    const found = get().cases.find((c) => c.id === caseId)
    if (!found) return
    set((s) => ({ cases: s.cases.filter((c) => c.id !== caseId) }))
    get().pushLog({
      type: 'CASE_ARCHIVED',
      severity: 'warn',
      target: caseId,
      message: `Expediente "${found.title}" archivado con sello de integridad SHA-256`,
    })
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