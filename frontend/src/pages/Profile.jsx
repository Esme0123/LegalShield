import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle,
  Briefcase,
  Building2,
  CheckCircle2,
  Fingerprint,
  History,
  IdCard,
  Key,
  KeyRound,
  Lock,
  Mail,
  Phone,
  Save,
  Scroll,
  ShieldCheck,
  UserCheck,
} from 'lucide-react'
import PasswordStrength from '@/components/auth/PasswordStrength'
import PasswordInput from '@/components/ui/PasswordInput'
import { Badge, SectionTitle } from '@/components/ui/primitives'
import { PASSWORD_HISTORY_LIMIT, useAppStore } from '@/store/useAppStore'
import { toast } from '@/store/toastStore'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/cn'

const initials = (name = '') =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')

function IdentityCard({ user }) {
  return (
    <section className="ls-card relative overflow-hidden p-7">
      <div className="ls-grid-overlay" />
      <div className="relative flex flex-wrap items-start gap-6">
        <div className="relative shrink-0">
          <span className="grid h-24 w-24 place-items-center rounded-2xl border border-accent/50 bg-gradient-to-br from-accent/25 to-info/15 font-display text-3xl font-bold text-accent">
            {initials(user?.name) || '--'}
          </span>
          <span className="absolute -bottom-2 -right-2 grid h-9 w-9 place-items-center rounded-xl border border-accent/50 bg-surface text-accent">
            <UserCheck className="h-4 w-4" />
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <h2 className="ls-heading text-2xl leading-tight">{user?.name ?? 'Usuario'}</h2>
          <p className="mt-1 flex items-center gap-1.5 text-[12.5px] text-muted">
            <Briefcase className="h-3.5 w-3.5" /> {user?.title ?? user?.roleLabel}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted">
            <Building2 className="h-3.5 w-3.5" /> {user?.firm}
            <span className="text-line">·</span>
            <Scroll className="h-3.5 w-3.5" /> {user?.department}
          </p>

          {/* User ID fijo sobre fondo crema #f3ecb0 con borde navy #112e81 */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="ls-chip-gold !px-3 !py-1.5 text-[12px]">
              <IdCard className="h-3.5 w-3.5" /> {user?.userId}
            </span>
            <Badge tone="accent">
              <ShieldCheck className="h-3 w-3" /> {user?.roleLabel}
            </Badge>
            {user?.joinedAt ? (
              <span className="font-mono text-[10.5px] text-muted">
                alta {formatDateTime(user.joinedAt).date}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <dl className="relative mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { icon: Mail, k: 'Correo', v: user?.email },
          { icon: Phone, k: 'Telefono', v: user?.phone },
          { icon: Fingerprint, k: 'Sesion iniciada', v: user?.loginAt ? formatDateTime(user.loginAt).full : 'sin registro' },
          {
            icon: KeyRound,
            k: 'Claves anteriores',
            v: `${user?.passwordHistory?.length ?? 0}/${PASSWORD_HISTORY_LIMIT} retenidas`,
          },
        ].map(({ icon: Icon, k, v }) => (
          <div key={k} className="ls-panel">
            <p className="flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.16em] text-muted">
              <Icon className="h-3.5 w-3.5" /> {k}
            </p>
            <p className="mt-1 truncate text-[12.5px] font-medium">{v || 'sin definir'}</p>
          </div>
        ))}
      </dl>
    </section>
  )
}

function PersonalDataForm({ user, onSave }) {
  const [form, setForm] = useState({
    phone: user?.phone ?? '',
    email: user?.email ?? '',
  })
  const [dirty, setDirty] = useState(false)

  const emailOk = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(form.email.trim())
  const phoneOk = form.phone.trim() === '' || /^[+\d][\d\s()-]{6,}$/.test(form.phone.trim())
  const valid = emailOk && phoneOk

  // El perfil llega de la API despues del primer render: sin esto el formulario
  // quedaria con los valores vacios iniciales.
  useEffect(() => {
    if (dirty) return
    setForm({ phone: user?.phone ?? '', email: user?.email ?? '' })
  }, [user?.phone, user?.email, dirty])

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }))
    setDirty(true)
  }

  return (
    <section className="ls-card p-7">
      <SectionTitle
        icon={UserCheck}
        title="Datos personales"
        subtitle="Puede actualizar su correo y telefono. Su identidad institucional es fija."
      />

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        {[
          { id: 'p-username', label: 'Usuario (nombre.apellido)', value: user?.name },
          { id: 'p-usercode', label: 'Codigo de usuario', value: user?.userId },
        ].map(({ id, label, value }) => (
          <div key={id}>
            <label className="ls-label" htmlFor={id}>
              <Lock className="mr-1 inline h-3 w-3" /> {label}
            </label>
            <input
              id={id}
              value={value ?? ''}
              readOnly
              disabled
              title="Asignado por el sistema: no se puede modificar"
              className="ls-input cursor-not-allowed font-mono opacity-70"
            />
          </div>
        ))}
        <p className="-mt-2 flex items-start gap-1.5 font-mono text-[10.5px] text-muted sm:col-span-2">
          <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-accent" />
          El usuario y el codigo identifican sus acciones en la bitacora: los asigna el sistema y no se pueden cambiar.
        </p>
        <div>
          <label className="ls-label" htmlFor="p-phone">
            <Phone className="mr-1 inline h-3 w-3" /> Telefono
          </label>
          <input
            id="p-phone"
            value={form.phone}
            onChange={set('phone')}
            placeholder="+591 12345678"
            className={cn('ls-input', form.phone && !phoneOk && 'border-danger/70')}
          />
          {form.phone && !phoneOk ? (
            <p className="mt-1.5 font-mono text-[10.5px] text-danger">Formato telefonico no reconocido</p>
          ) : null}
        </div>
        <div>
          <label className="ls-label" htmlFor="p-email">
            <Mail className="mr-1 inline h-3 w-3" /> Correo
          </label>
          <input
            id="p-email"
            type="email"
            value={form.email}
            onChange={set('email')}
            className={cn('ls-input', form.email && !emailOk && 'border-danger/70')}
          />
          {form.email && !emailOk ? (
            <p className="mt-1.5 font-mono text-[10.5px] text-danger">Correo no valido</p>
          ) : null}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!valid || !dirty}
          onClick={() => {
            onSave({
              phone: form.phone.trim(),
              email: form.email.trim(),
            })
            setDirty(false)
          }}
          className="ls-btn-primary text-xs"
        >
          <Save className="h-3.5 w-3.5" /> Guardar cambios
        </button>
        {dirty ? (
          <span className="font-mono text-[10.5px] text-warn">
            cambios sin firmar · se registra el evento PROFILE_UPDATED
          </span>
        ) : (
          <span className="font-mono text-[10.5px] text-muted">ficha sincronizada con el directorio</span>
        )}
      </div>
    </section>
  )
}

function PasswordModule({ user, mustChange, onChange }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)

  const history = useMemo(() => user?.passwordHistory ?? [], [user?.passwordHistory])
  const matches = next.length > 0 && next === confirm
  const blocked = !next || !current || !matches || next === current

  const reason = !next
    ? null
    : next === current
      ? 'La nueva contrasena debe ser distinta de la actual.'
      : !matches
        ? 'La confirmacion no coincide con la nueva contrasena.'
        : null

  return (
    <section className="ls-card p-7">
      <SectionTitle
        icon={Lock}
        title="Cambio de contrasena"
        subtitle={`Se valida la clave actual y se bloquea la reutilizacion de las ultimas ${PASSWORD_HISTORY_LIMIT} contrasenas (punto 9.3).`}
      />

      {mustChange ? (
        <div className="mt-5 flex items-start gap-3 rounded-xl border border-warn/50 bg-warn/10 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
          <p className="text-[12px] leading-snug text-ink/80">
            Su contraseña fue asignada por el Oficial de Seguridad. Por secreto profesional debe
            reemplazarla ahora; el resto del sistema permanecerá bloqueado hasta entonces.
          </p>
        </div>
      ) : null}

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div className="space-y-4">
          <div>
            <label className="ls-label" htmlFor="cur-pass">
              <KeyRound className="mr-1 inline h-3 w-3" /> Contrasena actual
            </label>
            <PasswordInput
              id="cur-pass"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          <div>
            <label className="ls-label" htmlFor="new-pass">
              <Key className="mr-1 inline h-3 w-3" /> Nueva contrasena
            </label>
            <PasswordInput
              id="new-pass"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
            />
          </div>

          <div>
            <label className="ls-label" htmlFor="conf-pass">
              <CheckCircle2 className="mr-1 inline h-3 w-3" /> Confirmar contrasena
            </label>
            <PasswordInput
              id="conf-pass"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              className={cn(confirm && !matches && 'border-warn/70')}
            />
          </div>
        </div>

        <div>
          <PasswordStrength value={next} />
          {reason ? (
            <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-warn/50 bg-gold/25 px-3 py-2 text-[11.5px] leading-snug text-warn">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {reason}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={blocked || busy}
          onClick={async () => {
            setBusy(true)
            const result = await onChange({ current, next })
            setBusy(false)
            if (result?.ok) {
              setCurrent('')
              setNext('')
              setConfirm('')
            }
          }}
          className="ls-btn-primary text-xs"
        >
          <Key className="h-3.5 w-3.5" /> {busy ? 'Rotando…' : 'Rotar contrasena'}
        </button>
        <span className="font-mono text-[10.5px] text-muted">
          cada clave del historial vuelve a estar disponible tras {PASSWORD_HISTORY_LIMIT} cambios con claves distintas
        </span>
      </div>

      <div className="mt-6 border-t border-line/25 pt-5">
        <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
          <Lock className="h-3.5 w-3.5" /> Historial de claves ({history.length}/{PASSWORD_HISTORY_LIMIT})
        </p>
        {history.length === 0 ? (
          <p className="mt-2 text-[12px] text-muted">
            Sin rotaciones registradas. Tras el primer cambio, aqui quedaran selladas las claves
            anteriores para impedir su reutilizacion.
          </p>
        ) : (
          <ul className="mt-2.5 grid gap-1.5 sm:grid-cols-2">
            {history.map((entry, i) => (
              <li
                key={entry.id ?? i}
                className="flex items-center justify-between gap-2 rounded-lg border border-line/35 bg-surface2/40 px-3 py-2"
              >
                <span className="font-mono text-[10.5px] text-muted">
                  {formatDateTime(entry.createdAt).full}
                </span>
                <span className="text-right font-mono text-[9.5px] uppercase tracking-wider text-danger">
                  #{i + 1} {i === 0 ? 'actual' : 'bloqueada'}
                  <span className="block normal-case tracking-normal text-muted">
                    se libera tras {PASSWORD_HISTORY_LIMIT - i} cambio{PASSWORD_HISTORY_LIMIT - i === 1 ? '' : 's'}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

/**
 * Ventana que explica por que se rechazo una clave del historial y cuanto falta
 * para poder usarla de nuevo. El bloqueo es por cantidad de cambios; la fecha es
 * una estimacion con la rotacion obligatoria (cambiar antes la acorta).
 */
function ReuseBlockedModal({ info, onClose }) {
  const changes = Number(info.changesRequired ?? PASSWORD_HISTORY_LIMIT)
  const plural = changes === 1 ? '' : 's'
  const usedFrom = info.setAt ? formatDateTime(info.setAt).date : null
  const usedUntil = info.usedUntil ? formatDateTime(info.usedUntil).date : null
  const reusableFrom = info.reusableFrom ? formatDateTime(info.reusableFrom).date : null

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[70] grid place-items-center bg-navy/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 260, damping: 26 }}
        className="ls-card w-full max-w-md p-5 sm:p-6"
        role="alertdialog"
        aria-labelledby="reuse-title"
        aria-describedby="reuse-desc"
      >
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-danger/50 bg-danger/10 text-danger">
            <History className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h3 id="reuse-title" className="font-display text-base font-bold text-ink">
              No puede reutilizar una contraseña antigua
            </h3>
            <p className="mt-1 font-mono text-[11px] text-muted">
              Política del despacho · se recuerdan sus últimas {info.historyLimit ?? PASSWORD_HISTORY_LIMIT} contraseñas
            </p>
          </div>
        </div>

        <p id="reuse-desc" className="mt-4 text-[12.5px] leading-snug text-ink/85">
          {info.isCurrent
            ? `La contraseña que escribió es la que usa actualmente${usedFrom ? ` (desde el ${usedFrom})` : ''}.`
            : `La contraseña que escribió ya la usó${usedFrom ? ` del ${usedFrom}` : ''}${usedUntil ? ` al ${usedUntil}` : ''}.`}{' '}
          Para volver a usarla primero debe cambiar su contraseña{' '}
          <strong className="text-ink">
            {changes} {changes === 1 ? 'vez' : 'veces'} con contraseña{plural} distinta{plural}
          </strong>
          .
        </p>

        <div className="ls-panel mt-4 grid gap-1 p-3 font-mono text-[11px]">
          <p className="flex justify-between gap-3">
            <span className="text-muted">Cambios que faltan</span>
            <span className="font-bold text-ink">{changes}</span>
          </p>
          <p className="flex justify-between gap-3">
            <span className="text-muted">Rotación obligatoria</span>
            <span className="text-ink">cada {info.maxAgeDays ?? 90} días</span>
          </p>
          <p className="flex justify-between gap-3">
            <span className="text-muted">Tiempo de espera estimado</span>
            <span className="text-right font-bold text-warn">
              {info.waitDays ?? changes * 90} días{reusableFrom ? ` · ${reusableFrom}` : ''}
            </span>
          </p>
        </div>
        <p className="mt-2 text-[11px] leading-snug text-muted">
          La espera es estimada con la rotación obligatoria; si cambia su contraseña antes, se libera antes.
          Elija ahora una contraseña nueva que no haya usado.
        </p>

        <div className="mt-6 flex justify-end">
          <button type="button" onClick={onClose} className="ls-btn-primary text-xs" autoFocus>
            Entendido, elegiré otra
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

export default function Profile() {
  const [reuseInfo, setReuseInfo] = useState(null)
  const session = useAppStore((s) => s.session)
  const profile = useAppStore((s) => s.profile)
  const loadProfile = useAppStore((s) => s.loadProfile)
  const updateProfile = useAppStore((s) => s.updateProfile)
  const changePassword = useAppStore((s) => s.changePassword)

  useEffect(() => {
    loadProfile()
  }, [loadProfile])

  const user = { ...session, ...profile }

  const handleSave = async (payload) => {
    try {
      await updateProfile(payload)
      toast.mint('Ficha actualizada', `${user.userId} · evento PROFILE_UPDATED sellado en auditoria`)
    } catch (error) {
      // Con la clave inicial pendiente la ficha queda vetada: se orienta, no se alarma.
      if (error?.passwordChangeRequired) {
        toast.pastel('Cambio de clave requerido', 'Defina su contrasena personal antes de editar la ficha')
        return
      }
      toast.danger('No se pudo guardar', error.message ?? 'Revise los datos e intente nuevamente')
    }
  }

  const handleChange = async ({ current: currentPass, next: nextPass }) => {
    const result = await changePassword({ current: currentPass, next: nextPass })
    if (result.ok) {
      toast.mint(
        'Contrasena rotada',
        `Historial actualizado (${user.passwordHistory?.length ?? 0}/${PASSWORD_HISTORY_LIMIT}) · evento PASSWORD_CHANGED`,
      )
      return result
    }
    if (result.reason === 'reused') {
      setReuseInfo(result.reuse ?? {})
      return result
    }
    const messages = {
      current: ['Clave actual incorrecta', 'Verifique la contrasena vigente antes de rotar'],
      same: ['Contrasena identica', 'La nueva clave debe ser distinta de la actual'],
      weak: ['Contrasena insuficiente', 'Alcanze el nivel "Aceptable" del medidor de fortaleza'],
      unknown: ['Usuario no encontrado', 'La sesion caduco, inicie sesion nuevamente'],
    }
    const [title, description] = messages[result.reason] ?? ['Cambio rechazado', 'Revise los datos ingresados']
    toast.danger(title, description)
    return result
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="space-y-6"
    >
      <SectionTitle
        icon={Fingerprint}
        title="Perfil de usuario"
        subtitle="Identidad institucional, datos de contacto y rotacion de credenciales"
        actions={
          <Badge tone="info">
            <UserCheck className="h-3 w-3" /> {user?.roleLabel}
          </Badge>
        }
      />

      <IdentityCard user={user} />
      <PersonalDataForm user={user} onSave={handleSave} />
      <PasswordModule user={user} mustChange={Boolean(session?.mustChangePassword)} onChange={handleChange} />

      <p className="flex items-start gap-2 text-[11.5px] leading-snug text-muted">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        Cada accion de esta vista escribe un evento con actor, objetivo y sello horario: los cambios de
        ficha como <span className="font-mono text-info">PROFILE_UPDATED</span> y las rotaciones de clave
        como <span className="font-mono text-info">PASSWORD_CHANGED</span> con severidad critica.
      </p>

      <AnimatePresence>
        {reuseInfo && <ReuseBlockedModal info={reuseInfo} onClose={() => setReuseInfo(null)} />}
      </AnimatePresence>
    </motion.div>
  )
}