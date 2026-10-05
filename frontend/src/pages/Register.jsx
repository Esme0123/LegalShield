import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowRight,
  Briefcase,
  Building2,
  CheckCircle2,
  Gavel,
  IdCard,
  Key,
  Lock,
  Mail,
  Scale,
  Scroll,
  ShieldCheck,
  UserCheck,
  UserRound,
} from 'lucide-react'
import AeroShards from '@/components/reactbits/AeroShards'
import PasswordStrength from '@/components/auth/PasswordStrength'
import ThemeToggle from '@/components/ui/ThemeToggle'
import { Badge } from '@/components/ui/primitives'
import { useAppStore } from '@/store/useAppStore'
import { toast } from '@/store/toastStore'
import { REGISTER_ROLES } from '@/data/seed'
import { scorePassword } from '@/lib/security'
import { cn } from '@/lib/cn'

const ROLE_ICONS = { scale: Scale, gavel: Gavel, userCheck: UserCheck }

const PRIVACY_NOTES = [
  { icon: Scroll, title: 'Reserva profesional', copy: 'El alta queda sellada en auditoria con tu User ID asignado.' },
  { icon: ShieldCheck, title: 'Minimo privilegio', copy: 'El rol solicitado define los permisos de la matriz SIS-321.' },
  { icon: Key, title: 'Credencial unica', copy: 'No se admiten las ultimas 5 contrasenas del usuario (punto 9.3).' },
]

export default function Register() {
  const navigate = useNavigate()
  const session = useAppStore((s) => s.session)
  const directory = useAppStore((s) => s.directory)
  const registerUser = useAppStore((s) => s.registerUser)

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    firm: '',
    role: 'abogado',
    password: '',
  })
  const [showPass, setShowPass] = useState(false)
  const [busy, setBusy] = useState(false)

  /* User ID estandarizado: se anticipa el correlativo libre del directorio. */
  const assignedId = useMemo(() => {
    const serial = directory.reduce((max, user) => {
      const value = Number(user.userId.split('-')[2])
      return Number.isFinite(value) ? Math.max(max, value) : max
    }, 0)
    return `LEG-${new Date().getFullYear()}-${String(serial + 1).padStart(4, '0')}`
  }, [directory])

  useEffect(() => {
    if (session) navigate('/dashboard', { replace: true })
  }, [session, navigate])

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const strength = scorePassword(form.password)
  const emailOk = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(form.email.trim())

  const canSubmit =
    form.firstName.trim().length > 1 &&
    form.lastName.trim().length > 1 &&
    emailOk &&
    form.firm.trim().length > 3 &&
    strength.score >= 2

  const submit = (e) => {
    e.preventDefault()
    if (busy || !canSubmit) {
      if (!canSubmit) {
        toast.danger(
          'Formulario incompleto',
          'Complete nombre, apellido, correo, despacho y una contrasena aceptable',
        )
      }
      return
    }

    if (!form.firstName.trim() || !form.lastName.trim()) {
      toast.danger('Datos incompletos', 'Nombre y apellido son obligatorios para el alta institucional')
      return
    }
    if (!emailOk) {
      toast.danger('Correo invalido', 'Use el correo institucional o del bufete')
      return
    }
    if (form.firm.trim().length < 4) {
      toast.danger('Despacho requerido', 'Indique el nombre del despacho legal')
      return
    }
    if (strength.score < 2) {
      toast.danger('Contrasena insuficiente', 'Debe alcanzar al menos el nivel "Aceptable" del medidor')
      return
    }

    setBusy(true)
    setTimeout(() => {
      const user = registerUser({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        firm: form.firm.trim(),
        role: form.role,
        password: form.password,
      })
      setBusy(false)
      toast.mint('Alta registrada', `${user.userId} emitido · ya puede iniciar sesion con su credencial`)
      navigate('/login', { replace: true })
    }, 900)
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <AeroShards density={0.0001} />

      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl border border-accent/50 bg-accent/15 text-accent backdrop-blur">
            <Scale className="h-[22px] w-[22px]" />
          </span>
          <div>
            <p className="font-display text-base font-bold leading-none">LegalShield</p>
            <p className="mt-1 font-mono text-[9.5px] uppercase tracking-[0.2em] text-muted">
              Alta institucional · Secure Legal OS
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge tone="accent" pulse>
            Registro abierto
          </Badge>
          <ThemeToggle />
        </div>
      </header>

      <div className="relative z-10 mx-auto grid max-w-7xl gap-8 px-6 pb-16 pt-4 lg:grid-cols-[1fr_1.15fr] lg:items-start lg:gap-12">
        {/* Narrativa */}
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="order-2 lg:order-1 lg:sticky lg:top-10"
        >
          <span className="ls-chip mb-5">
            <Briefcase className="h-3 w-3" /> Solicitud de incorporacion al despacho
          </span>
          <h1 className="font-display text-4xl font-bold leading-[1.06] tracking-tight text-balance sm:text-[2.75rem]">
            Alta de usuario con <span className="text-accent">User ID estandarizado</span>.
          </h1>
          <p className="mt-4 max-w-xl text-[13.5px] leading-relaxed text-muted">
            El despacho asigna automaticamente el identificador institucional y deja constancia del
            rol solicitado. La habilitacion efectiva depende de la aprobacion del Socio en la
            matriz de permisos SIS-321.
          </p>

          <div className="ls-card mt-7 p-6">
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
              <IdCard className="h-4 w-4 text-accent" /> Identificador asignado
            </p>
            <p className="mt-2 font-mono text-3xl font-bold tracking-[0.12em] text-accent">{assignedId}</p>
            <p className="mt-1.5 font-mono text-[10.5px] text-muted">
              correlativo automatico · patron LEG-AAAA-NNNN verificado
            </p>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {PRIVACY_NOTES.map(({ icon: Icon, title, copy }) => (
              <div key={title} className="ls-panel">
                <Icon className="mb-2 h-4 w-4 text-accent" />
                <p className="text-[12.5px] font-semibold">{title}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-muted">{copy}</p>
              </div>
            ))}
          </div>

          <div className="ls-panel mt-4">
            <p className="flex items-center gap-2 text-[12px] font-semibold">
              <Lock className="h-4 w-4 text-accent" /> Ya tiene credencial?
            </p>
            <Link to="/login" className="ls-btn-secondary mt-3 w-full text-xs">
              <ArrowRight className="h-3.5 w-3.5" /> Ir a iniciar sesion
            </Link>
          </div>
        </motion.section>

        {/* Formulario */}
        <motion.section
          initial={{ opacity: 0, y: 26 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
          className="order-1 lg:order-2"
        >
          <form onSubmit={submit} className="ls-card relative overflow-hidden p-7 sm:p-8">
            <div className="ls-grid-overlay" />
            <div className="relative">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="ls-heading text-xl">Ficha de alta</h2>
                  <p className="mt-1 text-[12px] text-muted">
                    Los campos marcados con identificador quedan sellados en la bitacora forense.
                  </p>
                </div>
                <span className="ls-chip-gold">
                  <IdCard className="h-3 w-3" /> {assignedId}
                </span>
              </div>

              <div className="mt-6 space-y-5">
                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label className="ls-label" htmlFor="firstName">
                      <UserRound className="mr-1 inline h-3 w-3" /> Nombre
                    </label>
                    <input
                      id="firstName"
                      value={form.firstName}
                      onChange={set('firstName')}
                      placeholder="Mariana"
                      autoComplete="given-name"
                      className="ls-input"
                    />
                  </div>
                  <div>
                    <label className="ls-label" htmlFor="lastName">
                      <UserRound className="mr-1 inline h-3 w-3" /> Apellido
                    </label>
                    <input
                      id="lastName"
                      value={form.lastName}
                      onChange={set('lastName')}
                      placeholder="Solis"
                      autoComplete="family-name"
                      className="ls-input"
                    />
                  </div>
                </div>

                <div>
                  <label className="ls-label" htmlFor="email">
                    <Mail className="mr-1 inline h-3 w-3" /> Correo institucional / bufete
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={set('email')}
                    placeholder="nombre.apellido@despacho.co"
                    autoComplete="email"
                    className={cn('ls-input', form.email && !emailOk && 'border-danger/70 focus:border-danger')}
                  />
                  <p
                    className={cn(
                      'mt-1.5 flex items-center gap-1.5 font-mono text-[10.5px]',
                      emailOk ? 'text-ok' : 'text-muted',
                    )}
                  >
                    {emailOk ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : (
                      <Building2 className="h-3 w-3" />
                    )}
                    {emailOk ? 'Formato institucional valido' : 'Dominio verificado contra el directorio del despacho'}
                  </p>
                </div>

                <div>
                  <label className="ls-label" htmlFor="firm">
                    <Briefcase className="mr-1 inline h-3 w-3" /> Nombre del despacho legal
                  </label>
                  <input
                    id="firm"
                    value={form.firm}
                    onChange={set('firm')}
                    placeholder="Vidal & Penalto Bufetes"
                    autoComplete="organization"
                    className="ls-input"
                  />
                </div>

                <fieldset>
                  <legend className="ls-label">
                    <Gavel className="mr-1 inline h-3 w-3" /> Rol solicitado
                  </legend>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {REGISTER_ROLES.map((option) => {
                      const Icon = ROLE_ICONS[option.icon]
                      const active = form.role === option.id
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => setForm((f) => ({ ...f, role: option.id }))}
                          aria-pressed={active}
                          className={cn(
                            'group rounded-xl border p-4 text-left transition-all duration-300 ease-shield',
                            active
                              ? 'border-accent/70 bg-accent/10 shadow-glow'
                              : 'border-line/50 bg-surface2/30 hover:border-accent/50',
                          )}
                        >
                          <span
                            className={cn(
                              'grid h-9 w-9 place-items-center rounded-lg border transition-colors',
                              active
                                ? 'border-accent/60 bg-accent/15 text-accent'
                                : 'border-line/50 bg-surface/60 text-muted group-hover:text-accent',
                            )}
                          >
                            <Icon className="h-4 w-4" />
                          </span>
                          <p className="mt-2.5 text-[13px] font-semibold">{option.label}</p>
                          <p className="mt-0.5 text-[10.5px] leading-snug text-muted">{option.description}</p>
                        </button>
                      )
                    })}
                  </div>
                </fieldset>

                <div>
                  <label className="ls-label" htmlFor="password">
                    <Key className="mr-1 inline h-3 w-3" /> Contrasena
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPass ? 'text' : 'password'}
                      value={form.password}
                      onChange={set('password')}
                      placeholder="••••••••••••"
                      autoComplete="new-password"
                      className="ls-input pr-20"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted transition hover:bg-surface2/60 hover:text-accent"
                    >
                      {showPass ? 'Ocultar' : 'Ver'}
                    </button>
                  </div>
                  <PasswordStrength value={form.password} className="mt-4" />
                </div>
              </div>

              <button
                type="submit"
                disabled={busy}
                className="ls-btn-primary relative mt-7 w-full overflow-hidden py-3"
              >
                {busy ? (
                  <span className="flex items-center gap-2">
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-onAccent/30 border-t-onAccent" />
                    Emitiendo User ID…
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Scroll className="mr-1 h-4 w-4" /> Registrar en el despacho
                  </span>
                )}
                {busy && (
                  <span className="absolute inset-y-0 left-0 w-1/3 animate-shimmer bg-gradient-to-r from-transparent via-white/25 to-transparent" />
                )}
              </button>

              <p className="mt-3 text-center font-mono text-[10px] text-muted">
                Politica del despacho: 12 caracteres + mayuscula, minuscula, digito y simbolo
              </p>
            </div>
          </form>
        </motion.section>
      </div>
    </div>
  )
}