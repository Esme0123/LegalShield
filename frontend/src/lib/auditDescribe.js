/**
 * Traduce una fila de la bitacora a una frase legible: "quien hizo que y sobre
 * quien", sin abrir el detalle. Si el evento no esta catalogado se describe por
 * su metodo HTTP o se deja el codigo tal cual.
 */

const FIELD_LABELS = {
  phone: 'teléfono',
  email: 'correo',
  firm: 'despacho',
  department: 'área',
  role: 'rol',
  roleCode: 'rol',
  password: 'contraseña',
  isActive: 'estado',
  title: 'título',
  progress: 'avance',
  status: 'estado',
  deadline: 'vencimiento',
  riskLevel: 'nivel de riesgo',
  username: 'usuario',
  userCode: 'código de usuario',
  user_code: 'código de usuario',
  firstName: 'nombre',
  lastName: 'apellido',
}

const fieldList = (fields) =>
  Array.isArray(fields) && fields.length > 0
    ? fields.map((f) => FIELD_LABELS[f] ?? f).join(', ')
    : 'sin campos'

const HTTP_VERB = { CREATE: 'Creó', UPDATE: 'Modificó', DELETE: 'Eliminó' }

const BUILDERS = {
  AUTH_SUCCESS: () => 'Inició sesión',
  AUTH_FAILED: (d) =>
    d.reason === 'usuario_no_existe'
      ? `Intento de acceso con un usuario inexistente${d.identifier ? ` (${d.identifier})` : ''}`
      : d.lockExempt
        ? 'Contraseña incorrecta (cuenta OSI, sin bloqueo)'
        : `Contraseña incorrecta${d.failedAttempts ? ` · intento ${d.failedAttempts}` : ''}`,
  AUTH_LOCKED: () => 'Intentó entrar con la cuenta bloqueada',
  LOGIN_LOCKED: (d) =>
    d.requiresOsi
      ? `Cuenta bloqueada tras ${d.failedAttempts ?? 3} intentos · solo el OSI puede desbloquearla`
      : `Cuenta bloqueada ${Math.round((d.remainingSeconds ?? 60) / 60)} min tras ${d.failedAttempts ?? 3} intentos fallidos`,
  AUTH_DISABLED: () => 'Intentó entrar con una cuenta dada de baja',
  AUTH_UNLOCK: (_d, t) => `Desbloqueó la cuenta de ${t}`,
  LOGOUT: () => 'Cerró sesión',
  TOKEN_REFRESH: () => 'Renovó su sesión activa',
  REGISTER: (_d, t) => `Registró la cuenta ${t}`,
  REGISTRATION_BLOCKED: () => 'Intento de auto-registro bloqueado',
  PASSWORD_CHANGED: () => 'Cambió su contraseña',
  PASSWORD_CHANGE_FAILED: () => 'Falló el cambio de contraseña (clave actual incorrecta)',
  PASSWORD_CHANGE_REQUIRED: () => 'Entró con clave inicial · debe cambiar su contraseña',
  PROFILE_UPDATED: (d) => `Actualizó su perfil: ${fieldList(d.fields)}`,
  PROFILE_IDENTITY_CHANGE_BLOCKED: (d) => `Intentó cambiar ${fieldList(d.fields)} (bloqueado)`,
  USER_CREATED: (d, t) => `Creó la cuenta de ${t}${d.role ? ` con rol ${d.role}` : ''}`,
  USER_UPDATED: (d, t) => `Editó los datos de ${t}: ${fieldList(d.fields)}`,
  USER_DEACTIVATED: (_d, t) => `Dio de baja la cuenta de ${t}`,
  USER_REACTIVATED: (_d, t) => `Reactivó la cuenta de ${t}`,
  USER_UNLOCKED: (_d, t) => `Desbloqueó la cuenta de ${t}`,
  ACCOUNT_UNLOCK_TOKEN_GENERATED: (_d, t) => `Generó un token de desbloqueo para ${t}`,
  ACCOUNT_UNLOCKED_VIA_TOKEN: () => 'Desbloqueó su cuenta con un token del OSI',
  UNLOCK_TOKEN_FAILED: () => 'Ingresó un token de desbloqueo inválido',
  UNLOCK_TOKEN_EXPIRED_ATTEMPT: () => 'Usó un token de desbloqueo vencido',
  UNLOCK_TOKEN_REUSE_ATTEMPT: () => 'Intentó reutilizar un token de desbloqueo',
  UNLOCK_TOKEN_EXHAUSTED: () => 'Agotó los intentos del token de desbloqueo',
  UNLOCK_TOKEN_ISSUE_LIMITED: (_d, t) => `Superó el límite de tokens de desbloqueo para ${t}`,
  PASSWORD_RESET_TOKEN_GENERATED: (_d, t) => `Generó un token de reinicio de contraseña para ${t}`,
  PASSWORD_RESET_ISSUE_LIMITED: (_d, t) => `Superó el límite de tokens de reinicio para ${t}`,
  PASSWORD_RESET: () => 'Restableció su contraseña con un token del OSI',
  PASSWORD_RESET_FAILED: () => 'Ingresó un token de reinicio inválido',
  PASSWORD_RESET_EXHAUSTED: () => 'Agotó los intentos del token de reinicio',
  PERMISSION_CHANGED: (d) => {
    if (d.action === 'reset_matriz') return 'Restableció la matriz de permisos a la base'
    const changes = Array.isArray(d.changes) ? d.changes : []
    if (changes.length === 0) return 'Modificó la matriz de permisos'
    const list = changes
      .slice(0, 3)
      .map((c) => `${c.effect === 'revocado' ? 'quitó' : 'dio'} ${c.permission} a ${c.role}`)
      .join('; ')
    return `Permisos: ${list}${changes.length > 3 ? ` y ${changes.length - 3} más` : ''}`
  },
  PERMISSION_CHANGE_BLOCKED: () => 'Intento de cambiar un permiso protegido (bloqueado)',
  ROLE_CREATED: (d) => `Creó el rol ${d.name ?? d.role}`,
  ROLE_UPDATED: (d) => `Editó el rol ${d.after?.name ?? d.role}`,
  ROLE_DELETED: (d) => `Eliminó el rol ${d.name ?? d.role}`,
  ACCESS_DENIED: (d) => `Acceso denegado${d.path ? ` a ${d.path}` : ''}`,
  RATE_LIMITED: (d) => `Frenado por exceso de peticiones${d.path ? ` en ${d.path}` : ''}`,
  CASE_CREATED: (d) => `Creó el expediente ${d.caseNumber}${d.title ? ` · ${d.title}` : ''}`,
  CASE_READ: (d) => `Consultó el expediente ${d.caseNumber}`,
  CASE_UPDATED: (d) => `Editó el expediente ${d.caseNumber}: ${fieldList(d.fields)}`,
  CASE_PROGRESS_UPDATED: (d) =>
    `Cambió el avance de ${d.caseNumber}: ${d.previousProgress}% → ${d.progress}%`,
  CASE_ARCHIVED: (d) => `Archivó el expediente${d.caseNumber ? ` ${d.caseNumber}` : ` #${d.caseId}`}`,
  DOCUMENT_REVEALED: (d) => `Reveló ${d.documentCode ?? 'un documento'} de ${d.caseNumber}`,
}

/** Texto del usuario afectado: "juan.perez (LEG-2026-0411)". */
function targetLabel(row, details) {
  const code = row.targetCode ?? details.target
  if (!code) return 'otra cuenta'
  return row.targetUsername ? `${row.targetUsername} (${code})` : code
}

export function parseDetails(raw) {
  if (!raw) return {}
  if (typeof raw === 'object') return raw
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function describeAuditEvent(row, details = parseDetails(row.details)) {
  const builder = BUILDERS[row.action]
  if (builder) {
    try {
      return builder(details, targetLabel(row, details))
    } catch {
      /* detalle incompleto: se cae al texto generico */
    }
  }
  if (HTTP_VERB[row.action] && details.path) {
    return `${HTTP_VERB[row.action]} ${details.path} (HTTP ${details.httpStatus ?? '-'})`
  }
  if (typeof details.message === 'string') return details.message
  return row.action
}
