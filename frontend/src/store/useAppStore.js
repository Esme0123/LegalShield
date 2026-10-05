import { create } from 'zustand'
import {
  CASES,
  DIRECTORY,
  INITIAL_RBAC,
  LIVESTREAM_TEMPLATES,
  PERMISSIONS,
  ROLES,
  RISK_CONTROLS,
  RISK_HEATMAP,
  SEED_LOGS,
} from '@/data/seed'
import { cryptoId } from '@/lib/format'

const MAX_ATTEMPTS = 3
const nowIso = () => new Date().toISOString()

const initialState = () => ({
  session: null,
  attempts: 0,
  lockedUntil: null,
  unlockRequest: null,
  rbac: structuredClone(INITIAL_RBAC),
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
    const user = DIRECTORY.find((d) => d.userId === userId) ?? DIRECTORY[0]
    const ok = password.length >= 6

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
          : `Credencial invalida · intento ${attempts} de ${MAX_ATTEMPTS}`,
      })
      return { ok: false, locked, attempts }
    }

    set({ session: { ...user, loginAt: nowIso() }, attempts: 0, lockedUntil: null })
    get().pushLog({
      type: 'AUTH_SUCCESS',
      severity: 'info',
      actor: user.userId,
      target: 'Portal LegalShield',
      message: `Inicio de sesion verificado · rol asignado: ${user.role.toUpperCase()}`,
    })
    return { ok: true, user }
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
  resetSimulation: () => set({ ...initialState(), liveFeedOn: get().liveFeedOn }),
}))

export { MAX_ATTEMPTS }