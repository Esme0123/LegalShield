import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle,
  IdCard,
  KeyRound,
  Lock,
  Pencil,
  PowerOff,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  Unlock,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { Badge, EmptyState, SectionTitle } from '@/components/ui/primitives'
import { useAppStore } from '@/store/useAppStore'
import { toast } from '@/store/toastStore'
import { cn } from '@/lib/cn'
import { formatDateTime } from '@/lib/format'
import { previewUsername } from '@/lib/identity'

const STATUS_FILTERS = [
  { id: 'todos', label: 'Todos' },
  { id: 'activo', label: 'Activos' },
  { id: 'bloqueado', label: 'Bloqueados' },
  { id: 'inactivo', label: 'Inactivos' },
]

function initialsOf(user) {
  const a = (user.firstName ?? user.username ?? '')[0] ?? ''
  const b = (user.lastName ?? '')[0] ?? ''
  return (a + b).toUpperCase() || '--'
}

function statusOf(user) {
  if (!user.isActive) return { key: 'inactivo', label: 'Inactivo', tone: 'danger' }
  if (user.isLocked) return { key: 'bloqueado', label: 'Bloqueado', tone: 'danger' }
  return { key: 'activo', label: 'Activo', tone: 'pastel' }
}

/* -------------------------------------------------------------------------- */
/* Modal compartido: Alta (con preview 9.1) y Edicion                          */
/* -------------------------------------------------------------------------- */

function UserModal({ mode, user, onClose, onSecret }) {
  const users = useAppStore((s) => s.users)
  const roles = useAppStore((s) => s.rbacRoles)
  const createUserAdmin = useAppStore((s) => s.createUserAdmin)
  const updateUserAdmin = useAppStore((s) => s.updateUserAdmin)

  const [form, setForm] = useState({
    firstName: user?.firstName ?? '',
    lastName: user?.lastName ?? '',
    email: user?.email ?? '',
    role: user?.role ?? 'abogado',
    firm: user?.firm ?? '',
    department: user?.department ?? '',
    phone: user?.phone ?? '',
    password: '',
  })
  const [busy, setBusy] = useState(false)

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  // User ID estandarizado (9.1) en tiempo real, considerando colisiones.
  const usedNames = useMemo(
    () => users.filter((u) => u.id !== user?.id).map((u) => u.username),
    [users, user?.id],
  )
  const preview = previewUsername(form.firstName, form.lastName, usedNames)
  const emailOk = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(form.email.trim())

  const canSubmit = form.firstName.trim().length > 1 && form.lastName.trim().length > 1 && emailOk && Boolean(preview)

  const submit = async (e) => {
    e.preventDefault()
    if (busy || !canSubmit) return

    setBusy(true)
    try {
      if (mode === 'create') {
        const { user: created, tempPassword } = await createUserAdmin({
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          email: form.email.trim(),
          role: form.role,
          firm: form.firm.trim(),
          department: form.department.trim(),
          phone: form.phone.trim(),
          password: form.password,
        })
        toast.mint('Usuario registrado', `User ID ${created.username} · codigo ${created.userCode}`)
        // La clave temporal solo se muestra en el modal efimero, nunca en el toast.
        if (tempPassword) {
          onSecret({ kind: 'password', value: tempPassword, userLabel: `${created.username} · ${created.userCode}` })
        }
      } else {
        await updateUserAdmin(user.id, {
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          email: form.email.trim(),
          role: form.role,
          firm: form.firm.trim(),
          department: form.department.trim(),
          phone: form.phone.trim(),
        })
        toast.mint('Usuario actualizado', `User ID ${preview} guardado`)
      }
      onClose()
    } catch (error) {
      toast.danger('Operacion rechazada', error.message ?? 'No se pudo guardar el usuario')
    } finally {
      setBusy(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[70] grid place-items-center bg-navy/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 260, damping: 26 }}
        className="ls-card max-h-[90vh] w-full max-w-lg overflow-y-auto p-5 sm:p-6"
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-base font-bold text-ink">
              {mode === 'create' ? 'Alta de usuario' : `Editar · ${user?.username ?? ''}`}
            </h3>
            <p className="mt-0.5 text-[11.5px] text-muted">
              {mode === 'create'
                ? 'El User ID se calcula con la regla nombre.apellido (punto 9.1).'
                : 'Cambiar el nombre recompone el User ID estandarizado.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted transition hover:bg-surface2/60 hover:text-ink"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="ls-label">Nombre</span>
              <input value={form.firstName} onChange={set('firstName')} className="ls-input" placeholder="María José" />
            </label>
            <label className="block">
              <span className="ls-label">Apellido</span>
              <input value={form.lastName} onChange={set('lastName')} className="ls-input" placeholder="Pérez" />
            </label>
          </div>

          {/* Preview en tiempo real del User ID estandarizado */}
          <div
            className={cn(
              'flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 transition-colors',
              preview ? 'border-accent/50 bg-accent/10' : 'border-line/50 bg-surface2/40',
            )}
          >
            <IdCard className="h-4 w-4 shrink-0 text-accent" />
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-muted">User ID estandarizado · 9.1</p>
              <p className="truncate font-mono text-[15px] font-bold text-ink">{preview || 'nombre.apellido'}</p>
            </div>
            {preview && (
              <Badge tone="pastel">
                <ShieldCheck className="h-3 w-3" /> Libre
              </Badge>
            )}
          </div>

          <label className="block">
            <span className="ls-label">Correo institucional</span>
            <input value={form.email} onChange={set('email')} type="email" className="ls-input" placeholder="usuario@despacho.co" />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="ls-label">Rol asignado</span>
              <select value={form.role} onChange={set('role')} className="ls-input">
                {roles.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="ls-label">Departamento</span>
              <input value={form.department} onChange={set('department')} className="ls-input" placeholder="Litigación" />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="ls-label">Despacho</span>
              <input value={form.firm} onChange={set('firm')} className="ls-input" placeholder="Vidal & Penalto Bufetes" />
            </label>
            <label className="block">
              <span className="ls-label">Teléfono</span>
              <input value={form.phone} onChange={set('phone')} className="ls-input" placeholder="+57 ..." />
            </label>
          </div>

          {mode === 'create' && (
            <label className="block">
              <span className="ls-label">Contraseña inicial (opcional)</span>
              <input
                value={form.password}
                onChange={set('password')}
                type="password"
                className="ls-input"
                placeholder="Si se deja vacia, el servidor genera una temporal (cambio obligatorio al primer acceso)"
              />
            </label>
          )}
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="ls-btn-ghost text-xs">
            Cancelar
          </button>
          <button type="submit" disabled={busy || !canSubmit} className="ls-btn-primary text-xs">
            <Save className="h-3.5 w-3.5" />
            {busy ? 'Guardando...' : mode === 'create' ? 'Registrar usuario' : 'Guardar cambios'}
          </button>
        </div>
      </motion.form>
    </motion.div>
  )
}

/* -------------------------------------------------------------------------- */
/* Modal efimero: OTP de desbloqueo o clave inicial (se muestra una sola vez)   */
/* -------------------------------------------------------------------------- */

function OneTimeSecretModal({ secret, onClose }) {
  // 'otp' (desbloqueo) y 'reset' (reinicio de clave) son tokens de 6 digitos.
  const isOtp = secret.kind === 'otp' || secret.kind === 'reset'

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(secret.value)
      toast.mint('Copiado', 'Valor copiado al portapapeles')
    } catch {
      toast.danger('No se pudo copiar', 'Copie el valor manualmente')
    }
  }

  return (
    // Sin onClick en el overlay: un clic accidental no debe descartar un valor irrecuperable.
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[70] grid place-items-center bg-navy/70 p-4 backdrop-blur-sm"
    >
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 260, damping: 26 }}
        className="ls-card max-h-[90vh] w-full max-w-md overflow-y-auto p-5 sm:p-6"
      >
        <div className="mb-5">
          <h3 className="flex items-center gap-2 font-display text-base font-bold text-ink">
            <KeyRound className="h-4 w-4 text-accent" />
            {secret.kind === 'reset' ? 'Token de reinicio de contraseña' : isOtp ? 'Token OTP de desbloqueo' : 'Contraseña inicial'}
          </h3>
          <p className="mt-0.5 text-[11.5px] text-muted">{secret.userLabel}</p>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-accent/40 bg-accent/10 p-4 text-center">
            <p
              className={cn(
                'font-mono font-bold text-accent',
                isOtp ? 'text-2xl tracking-[0.35em]' : 'break-all text-lg tracking-normal',
              )}
            >
              {secret.value}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            {secret.expiresAt ? (
              <p className="font-mono text-[11px] text-muted">
                Vence a las {formatDateTime(secret.expiresAt).time.slice(0, 5)}
                {secret.expiresInMinutes ? ` (${secret.expiresInMinutes} min)` : ''}
              </p>
            ) : (
              <span />
            )}
            <button type="button" onClick={copy} className="ls-btn-secondary text-xs">
              Copiar
            </button>
          </div>

          <div className="flex items-start gap-2 rounded-xl border border-warn/50 bg-warn/10 p-3 text-[12px]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
            <p className="leading-snug text-ink/80">
              Se muestra una sola vez. Entréguelo al titular por un canal verificado (presencial o llamada a
              número registrado). No lo envíe por correo ni chat.
              {isOtp ? '' : ' El titular deberá cambiarla en su primer inicio de sesión.'}
            </p>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="ls-btn-primary text-xs">
            Entendido
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

/* -------------------------------------------------------------------------- */
/* Pagina /users                                                               */
/* -------------------------------------------------------------------------- */

export default function UsersManagement() {
  const users = useAppStore((s) => s.users)
  const loadUsers = useAppStore((s) => s.loadUsers)
  const loadMatrix = useAppStore((s) => s.loadMatrix)
  const setUserStatusAdmin = useAppStore((s) => s.setUserStatusAdmin)
  const unlockUserAdmin = useAppStore((s) => s.unlockUserAdmin)
  const generateUnlockToken = useAppStore((s) => s.generateUnlockToken)
  const generateResetToken = useAppStore((s) => s.generateResetToken)
  const hasPermission = useAppStore((s) => s.hasPermission)
  const session = useAppStore((s) => s.session)

  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('todos')
  const [modal, setModal] = useState(null)
  const [busyId, setBusyId] = useState(null)
  // OTP o clave inicial: vive solo aqui y se descarta al cerrar el modal (nunca en el store).
  const [secret, setSecret] = useState(null)

  const can = {
    create: hasPermission('USERS_CREATE'),
    update: hasPermission('USERS_UPDATE'),
    remove: hasPermission('USERS_DELETE'),
    unlock: hasPermission('USERS_UNLOCK'),
    token: hasPermission('ACCOUNT_UNLOCK') || hasPermission('TOKEN_RESET'),
    reset: hasPermission('TOKEN_RESET'),
  }

  useEffect(() => {
    loadUsers()
    // Los roles del desplegable del alta salen de la API, no de una lista fija.
    loadMatrix()
  }, [loadUsers, loadMatrix])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return users.filter((u) => {
      if (filter !== 'todos' && statusOf(u).key !== filter) return false
      if (!q) return true
      return [u.username, u.userCode, u.email, u.department, u.roleLabel]
        .join(' ')
        .toLowerCase()
        .includes(q)
    })
  }, [users, search, filter])

  const deactivate = async (user) => {
    if (user.userCode === session?.userId) {
      toast.danger('Accion bloqueada', 'No puede desactivar su propio usuario')
      return
    }
    if (!window.confirm(`Dar de baja a ${user.username} (${user.userCode})?\nLa cuenta dejara de iniciar sesion (baja logica).`)) {
      return
    }
    setBusyId(user.id)
    try {
      await setUserStatusAdmin(user.id, false)
      toast.pastel('Cuenta desactivada', `${user.username} paso a baja logica`)
    } catch (error) {
      toast.danger('No se aplico la baja', error.message ?? 'Permiso insuficiente o fallo de API')
    } finally {
      setBusyId(null)
    }
  }

  const reactivate = async (user) => {
    setBusyId(user.id)
    try {
      await setUserStatusAdmin(user.id, true)
      toast.mint('Cuenta reactivada', `${user.username} vuelve a estar activa`)
    } catch (error) {
      toast.danger('No se pudo reactivar', error.message ?? 'Permiso insuficiente o fallo de API')
    } finally {
      setBusyId(null)
    }
  }

  const unlock = async (user) => {
    setBusyId(user.id)
    try {
      await unlockUserAdmin(user.id)
      toast.pastel('Cuenta desbloqueada', `${user.username} conserva su contrasena actual`)
    } catch (error) {
      toast.danger('No se pudo desbloquear', error.message ?? 'Permiso insuficiente o fallo de API')
    } finally {
      setBusyId(null)
    }
  }

  const issueOtp = async (user) => {
    setBusyId(user.id)
    try {
      const { token, expiresAt, expiresInMinutes } = await generateUnlockToken(user.id)
      setSecret({ kind: 'otp', value: token, userLabel: `${user.username} · ${user.userCode}`, expiresAt, expiresInMinutes })
    } catch (error) {
      toast.danger('No se emitio el token', error.message ?? 'Permiso insuficiente o fallo de API')
    } finally {
      setBusyId(null)
    }
  }

  const issueResetToken = async (user) => {
    setBusyId(user.id)
    try {
      const { token, expiresAt, expiresInMinutes } = await generateResetToken(user.id)
      setSecret({ kind: 'reset', value: token, userLabel: `${user.username} · ${user.userCode}`, expiresAt, expiresInMinutes })
    } catch (error) {
      toast.danger('No se emitio el token de reinicio', error.message ?? 'Permiso insuficiente o fallo de API')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-6">
      <SectionTitle
        icon={Users}
        title="Gestión de Usuarios (ABM)"
        subtitle="Alta con User ID nombre.apellido (9.1), edicion granular, baja logica, desbloqueo sin exposicion de credenciales y emision de token OTP."
        actions={
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => loadUsers()} className="ls-btn-secondary text-xs">
              <RotateCcw className="h-3.5 w-3.5" /> Recargar
            </button>
            {can.create && (
              <button type="button" onClick={() => setModal({ mode: 'create' })} className="ls-btn-primary text-xs">
                <UserPlus className="h-3.5 w-3.5" /> Alta de usuario
              </button>
            )}
          </div>
        }
      />

      {/* Filtros */}
      <div className="ls-card flex flex-wrap items-center gap-3 p-4">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted/60" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ls-input !pl-9"
            placeholder="Buscar por User ID, código, correo, rol o departamento..."
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={cn(
                'rounded-full border px-3 py-1 text-[11px] font-medium transition-all duration-300',
                filter === f.id
                  ? 'border-accent/70 bg-accent/15 text-accent'
                  : 'border-line/50 text-muted hover:border-accent/50 hover:text-ink',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <Badge tone="neutral">{filtered.length} usuarios</Badge>
      </div>

      {/* Tabla */}
      <div className="ls-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="ls-table min-w-[1080px]">
            <thead>
              <tr>
                <th className="text-left">Usuario</th>
                <th className="text-left">User ID (9.1)</th>
                <th className="text-left">Código</th>
                <th className="text-left">Email</th>
                <th className="text-left">Rol</th>
                <th className="text-left">Estado</th>
                <th className="text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <EmptyState
                      icon={Users}
                      title="Sin usuarios en la vista"
                      description="Ajusta los filtros o registra un nuevo usuario con el alta granular."
                      action={
                        can.create ? (
                          <button type="button" onClick={() => setModal({ mode: 'create' })} className="ls-btn-primary text-xs">
                            <UserPlus className="h-3.5 w-3.5" /> Alta de usuario
                          </button>
                        ) : null
                      }
                    />
                  </td>
                </tr>
              )}
              {filtered.map((user) => {
                const status = statusOf(user)
                const busy = busyId === user.id
                return (
                  <tr key={user.id}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-accent/40 bg-accent/10 font-mono text-[11px] font-bold text-accent">
                          {initialsOf(user)}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-[12.5px] font-semibold text-ink">
                            {user.firstName} {user.lastName}
                          </p>
                          <p className="truncate font-mono text-[10px] text-muted">{user.department || 'Sin departamento'}</p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="font-mono text-[12px] font-semibold text-info">{user.username}</span>
                    </td>
                    <td>
                      <span className="font-mono text-[11.5px] text-ink">{user.userCode}</span>
                    </td>
                    <td className="max-w-[200px] truncate">
                      <span className="text-[12px] text-muted">{user.email}</span>
                    </td>
                    <td>
                      <Badge tone={user.role === 'socio' ? 'accent' : user.role === 'cliente' ? 'ice' : 'info'}>
                        {user.roleLabel}
                      </Badge>
                    </td>
                    <td>
                      <Badge tone={status.tone} pulse={status.key === 'activo'}>
                        {status.key === 'activo' ? (
                          <ShieldCheck className="h-3 w-3" />
                        ) : status.key === 'bloqueado' ? (
                          <Lock className="h-3 w-3" />
                        ) : (
                          <PowerOff className="h-3 w-3" />
                        )}
                        {status.label}
                      </Badge>
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-1.5">
                        {can.update && (
                          <button
                            type="button"
                            onClick={() => setModal({ mode: 'edit', user })}
                            className="rounded-lg border border-line/50 p-2 text-muted transition hover:border-accent/60 hover:text-accent"
                            title="Editar usuario"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {can.remove && (user.isActive ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => deactivate(user)}
                            className="rounded-lg border border-line/50 p-2 text-muted transition hover:border-danger/60 hover:text-danger"
                            title="Dar de baja (baja logica)"
                          >
                            <PowerOff className="h-3.5 w-3.5" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => reactivate(user)}
                            className="rounded-lg border border-line/50 p-2 text-muted transition hover:border-ok/60 hover:text-ok"
                            title="Reactivar cuenta"
                          >
                            <ShieldCheck className="h-3.5 w-3.5" />
                          </button>
                        ))}
                        {can.token && user.isLocked && user.isActive && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => issueOtp(user)}
                            className="rounded-lg border border-line/50 p-2 text-muted transition hover:border-accent/60 hover:text-accent"
                            title="Emitir token OTP de desbloqueo"
                          >
                            <KeyRound className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {can.reset && user.isActive && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => issueResetToken(user)}
                            className="rounded-lg border border-line/50 p-2 text-muted transition hover:border-accent/60 hover:text-accent"
                            title="Emitir token de reinicio de contraseña"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {can.unlock && (user.isLocked || user.failedAttempts > 0) && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => unlock(user)}
                            className="rounded-lg border border-accent/60 bg-accent/10 p-2 text-accent transition hover:bg-accent/15"
                            title="Desbloquear Cuenta"
                          >
                            <Unlock className="h-3.5 w-3.5" /> Desbloquear Cuenta
                          </button>
                        )}
                        {busy && (
                          <span className="flex items-center gap-1 px-1 font-mono text-[9px] text-muted">
                            <KeyRound className="h-3 w-3" />
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal alta/edicion */}
      <AnimatePresence>
        {modal && (
          <UserModal
            key={`${modal.mode}-${modal.user?.id ?? 'new'}`}
            mode={modal.mode}
            user={modal.user}
            onClose={() => setModal(null)}
            onSecret={setSecret}
          />
        )}
      </AnimatePresence>

      {/* Modal efimero: OTP o clave inicial */}
      <AnimatePresence>
        {secret && <OneTimeSecretModal secret={secret} onClose={() => setSecret(null)} />}
      </AnimatePresence>
    </div>
  )
}