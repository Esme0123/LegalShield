import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  Briefcase,
  Building2,
  CheckCircle2,
  Fingerprint,
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
import { Badge, SectionTitle } from '@/components/ui/primitives'
import { PASSWORD_HISTORY_LIMIT, useAppStore } from '@/store/useAppStore'
import { toast } from '@/store/toastStore'
import { ROLES } from '@/data/seed'
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
    firstName: user?.firstName ?? '',
    lastName: user?.lastName ?? '',
    phone: user?.phone ?? '',
    email: user?.email ?? '',
  })
  const [dirty, setDirty] = useState(false)

  const emailOk = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(form.email.trim())
  const phoneOk = form.phone.trim() === '' || /^[+\d][\d\s()-]{6,}$/.test(form.phone.trim())
  const valid =
    form.firstName.trim().length > 1 && form.lastName.trim().length > 1 && emailOk && phoneOk

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }))
    setDirty(true)
  }

  return (
    <section className="ls-card p-7">
      <SectionTitle
        icon={UserCheck}
        title="Datos personales"
        subtitle="El nombre completo se refleja de inmediato en la sesion y en la bitacora."
      />

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <div>
          <label className="ls-label" htmlFor="p-firstName">
            Nombre
          </label>
          <input id="p-firstName" value={form.firstName} onChange={set('firstName')} className="ls-input" />
        </div>
        <div>
          <label className="ls-label" htmlFor="p-lastName">
            Apellido
          </label>
          <input id="p-lastName" value={form.lastName} onChange={set('lastName')} className="ls-input" />
        </div>
        <div>
          <label className="ls-label" htmlFor="p-phone">
            <Phone className="mr-1 inline h-3 w-3" /> Telefono
          </label>
          <input
            id="p-phone"
            value={form.phone}
            onChange={set('phone')}
            placeholder="+57 601 000 0000"
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
              firstName: form.firstName.trim(),
              lastName: form.lastName.trim(),
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

function PasswordModule({ user, onChange }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')

  const history = useMemo(() => user?.passwordHistory ?? [], [user?.passwordHistory])
  const matches = next.length > 0 && next === confirm
  const reused = useMemo(() => history.includes(next), [history, next])
  const blocked = reused || !matches || next === current

  const reason = !next
    ? null
    : reused
      ? 'La contrasena coincide con una de las ultimas 5 claves del usuario (punto 9.3).'
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

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div className="space-y-4">
          <div>
            <label className="ls-label" htmlFor="cur-pass">
              <KeyRound className="mr-1 inline h-3 w-3" /> Contrasena actual
            </label>
            <input
              id="cur-pass"
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
              className="ls-input"
            />
          </div>

          <div>
            <label className="ls-label" htmlFor="new-pass">
              <Key className="mr-1 inline h-3 w-3" /> Nueva contrasena
            </label>
            <input
              id="new-pass"
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
              className={cn('ls-input', reused && 'border-danger/70 focus:border-danger')}
            />
          </div>

          <div>
            <label className="ls-label" htmlFor="conf-pass">
              <CheckCircle2 className="mr-1 inline h-3 w-3" /> Confirmar contrasena
            </label>
            <input
              id="conf-pass"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              className={cn('ls-input', confirm && !matches && 'border-warn/70')}
            />
          </div>
        </div>

        <div>
          <PasswordStrength value={next} />
          {reason ? (
            <p
              className={cn(
                'mt-3 flex items-start gap-1.5 rounded-lg border px-3 py-2 text-[11.5px] leading-snug',
                reused
                  ? 'border-danger/50 bg-danger/10 text-danger'
                  : 'border-warn/50 bg-gold/25 text-warn',
              )}
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {reason}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={blocked || !current}
          onClick={() => {
            const result = onChange({ current, next })
            if (result?.ok) {
              setCurrent('')
              setNext('')
              setConfirm('')
            }
          }}
          className="ls-btn-primary text-xs"
        >
          <Key className="h-3.5 w-3.5" /> Rotar contrasena
        </button>
        <span className="font-mono text-[10.5px] text-muted">
          la clave anterior se conserva en el historial y queda bloqueada para siempre
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
            {history.map((pass, i) => (
              <li
                key={`${pass.slice(-4)}-${i}`}
                className="flex items-center justify-between gap-2 rounded-lg border border-line/35 bg-surface2/40 px-3 py-2"
              >
                <span className="font-mono text-[11.5px] tracking-widest text-muted">
                  {'*'.repeat(Math.max(6, pass.length - 2))}
                </span>
                <span className="font-mono text-[9.5px] uppercase tracking-wider text-danger">
                  #{i + 1} bloqueada
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

export default function Profile() {
  const user = useAppStore((s) => s.session)
  const updateProfile = useAppStore((s) => s.updateProfile)
  const changePassword = useAppStore((s) => s.changePassword)

  const roleMeta = ROLES.find((r) => r.id === user?.role)

  const handleSave = (payload) => {
    updateProfile({ userId: user.userId, ...payload })
    toast.mint('Ficha actualizada', `${user.userId} · evento PROFILE_UPDATED sellado en auditoria`)
  }

  const handleChange = ({ current: currentPass, next: nextPass }) => {
    const result = changePassword({ userId: user.userId, current: currentPass, next: nextPass })
    if (result.ok) {
      toast.mint('Contrasena rotada', `Historial actualizado (${result.history.length}/${PASSWORD_HISTORY_LIMIT}) · evento PASSWORD_CHANGED`)
      return result
    }
    const messages = {
      current: ['Clave actual incorrecta', 'Verifique la contrasena vigente antes de rotar'],
      same: ['Contrasena identica', 'La nueva clave debe ser distinta de la actual'],
      reused: ['Reutilizacion bloqueada', 'La clave pertenece al historial de las ultimas 5 (punto 9.3)'],
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
            <UserCheck className="h-3 w-3" /> {roleMeta?.label ?? user?.roleLabel}
          </Badge>
        }
      />

      <IdentityCard user={user} />
      <PersonalDataForm user={user} onSave={handleSave} />
      <PasswordModule user={user} onChange={handleChange} />

      <p className="flex items-start gap-2 text-[11.5px] leading-snug text-muted">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        Cada accion de esta vista escribe un evento con actor, objetivo y sello horario: los cambios de
        ficha como <span className="font-mono text-info">PROFILE_UPDATED</span> y las rotaciones de clave
        como <span className="font-mono text-info">PASSWORD_CHANGED</span> con severidad critica.
      </p>
    </motion.div>
  )
}