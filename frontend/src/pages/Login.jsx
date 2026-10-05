import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Fingerprint,
  KeyRound,
  LifeBuoy,
  Lock,
  LogIn,
  MailCheck,
  ScanFace,
  ShieldCheck,
  Undo2,
  UserRound,
} from 'lucide-react'
import AeroShards from '@/components/reactbits/AeroShards'
import PasswordStrength, { LockCounter } from '@/components/auth/PasswordStrength'
import ThemeToggle from '@/components/ui/ThemeToggle'
import { Badge } from '@/components/ui/primitives'
import { MAX_ATTEMPTS, useAppStore } from '@/store/useAppStore'
import { toast } from '@/store/toastStore'
import { USER_ID_RE, validateUserId } from '@/lib/security'
import { cn } from '@/lib/cn'
import { DIRECTORY } from '@/data/seed'

const SIGNAL_STEPS = ['Analisis de User ID…', 'Verificacion de politica…', 'MFA · passkey', 'Emision de sesion']

export default function Login() {
  const navigate = useNavigate()
  const attempts = useAppStore((s) => s.attempts)
  const lockedUntil = useAppStore((s) => s.lockedUntil)
  const unlockRequest = useAppStore((s) => s.unlockRequest)
  const session = useAppStore((s) => s.session)
  const login = useAppStore((s) => s.login)
  const requestUnlock = useAppStore((s) => s.requestUnlock)
  const resetLock = useAppStore((s) => s.resetLock)

  const [userId, setUserId] = useState('LEG-2026-0001')
  const [password, setPassword] = useState('Juris2026!Abg')
  const [showPass, setShowPass] = useState(false)
  const [busy, setBusy] = useState(false)
  const [step, setStep] = useState(-1)
  const [now, setNow] = useState(Date.now())

  const locked = Boolean(lockedUntil) && now < lockedUntil
  const idCheck = useMemo(() => validateUserId(userId), [userId])

  useEffect(() => {
    if (session) navigate('/dashboard', { replace: true })
  }, [session, navigate])

  useEffect(() => {
    if (!lockedUntil) return undefined
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [lockedUntil])

  const remaining = locked ? Math.max(0, Math.ceil((lockedUntil - now) / 1000)) : 0

  const submit = (e) => {
    e.preventDefault()
    if (locked || busy) return

    if (!idCheck.valid) {
      toast.danger('User ID invalido', idCheck.message)
      return
    }
    if (password.length < 6) {
      const result = login({ userId: idCheck.normalized, password })
      toast.danger(
        result.locked ? 'Cuenta bloqueada' : 'Credencial invalida',
        result.locked
          ? 'Tres intentos fallidos · solicite desbloqueo al administrador'
          : `Intento ${result.attempts} de ${MAX_ATTEMPTS} · revise la contrasena`,
      )
      return
    }

    setBusy(true)
    setStep(0)
    SIGNAL_STEPS.forEach((_, i) => {
      setTimeout(() => setStep(i + 1), 260 * (i + 1))
    })
    setTimeout(() => {
      const result = login({ userId: idCheck.normalized, password })
      setBusy(false)
      setStep(-1)
      if (result.ok) {
        toast.mint('Acceso concedido', `Rol asignado: ${result.user.role.toUpperCase()} · evento AUTH_SUCCESS`)
        navigate('/dashboard', { replace: true })
      } else {
        toast.danger('Credencial invalida', `Intento ${result.attempts} de ${MAX_ATTEMPTS}`)
      }
    }, 260 * SIGNAL_STEPS.length + 260)
  }

  const pickDirectory = (id) => {
    setUserId(id)
    setPassword('Juris2026!Abg')
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <AeroShards density={0.0001} />

      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-5 py-5">
        <div className="flex items-center gap-2.5">
          <span className="relative grid h-10 w-10 place-items-center rounded-xl border border-accent/50 bg-accent/15 text-accent backdrop-blur">
            <ShieldCheck className="h-5 w-5" />
            <span className="absolute inset-0 animate-pulse-ring rounded-xl border border-accent/40" />
          </span>
          <div>
            <p className="font-display text-base font-bold leading-none">LegalShield</p>
            <p className="mt-1 font-mono text-[9.5px] uppercase tracking-[0.2em] text-muted">
              Secure Legal OS · v4.2
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge tone="accent" pulse>
            Sistema activo
          </Badge>
          <ThemeToggle />
        </div>
      </header>

      <div className="relative z-10 mx-auto grid max-w-7xl gap-8 px-5 pb-14 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-12">
        {/* Narrativa */}
        <section className="order-2 lg:order-1">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            <span className="ls-chip mb-4">
              <Fingerprint className="h-3 w-3" /> Reingenieria de seguridad
            </span>
            <h1 className="font-display text-4xl font-bold leading-[1.05] tracking-tight text-balance sm:text-5xl">
              Gestion legal con{' '}
              <span className="relative inline-block">
                <span className="relative z-10 text-accent">defensa en profundidad</span>
                <span className="absolute inset-x-0 bottom-1 z-0 h-3 bg-pastel/30" />
              </span>
              .
            </h1>
            <p className="mt-4 max-w-xl text-[13.5px] leading-relaxed text-muted">
              Control de acceso por rol (RBAC), bitacora forense inmutable y trazabilidad
              normativa ISO 27001. Cada accion sensible queda firmada, sellada y reproducible.
            </p>

            <div className="mt-7 grid gap-3 sm:grid-cols-3">
              {[
                { icon: ScanFace, title: 'Identidad fuerte', copy: 'User ID estandar LEG-2026-XXXX + MFA' },
                { icon: Lock, title: 'Minimo privilegio', copy: '12 permisos revisables en caliente' },
                { icon: MailCheck, title: 'Evidencia', copy: 'Comprobantes firmados con hash SHA-256' },
              ].map(({ icon: Icon, title, copy }) => (
                <div key={title} className="ls-panel">
                  <Icon className="mb-2 h-4 w-4 text-accent" />
                  <p className="text-[12.5px] font-semibold">{title}</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-muted">{copy}</p>
                </div>
              ))}
            </div>

            <div className="mt-5 rounded-xl border border-line/50 bg-surface/50 p-3.5 backdrop-blur">
              <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
                Directorio de demostracion
              </p>
              <div className="flex flex-wrap gap-2">
                {DIRECTORY.map((d) => (
                  <button
                    key={d.userId}
                    type="button"
                    onClick={() => pickDirectory(d.userId)}
                    className="ls-chip hover:border-accent/70 hover:text-accent"
                  >
                    <UserRound className="h-3 w-3" />
                    {d.userId} · {d.role}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        </section>

        {/* Formulario */}
        <motion.section
          initial={{ opacity: 0, y: 26 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
          className="order-1 lg:order-2"
        >
          <div className="ls-card relative overflow-hidden p-5 sm:p-6">
            <div className="ls-grid-overlay" />
            <div className="relative">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="ls-heading text-lg">Acceso al expediente electronico</h2>
                  <p className="mt-0.5 text-[11.5px] text-muted">
                    Sesion cifrada TLS 1.3 · registro de auditoria activo
                  </p>
                </div>
                <KeyRound className="h-5 w-5 shrink-0 text-pastel" />
              </div>

              <form onSubmit={submit} className="mt-5 space-y-4">
                <div>
                  <label className="ls-label" htmlFor="userId">
                    User ID estandarizado
                  </label>
                  <div className="relative">
                    <input
                      id="userId"
                      value={userId}
                      onChange={(e) => setUserId(e.target.value.toUpperCase())}
                      placeholder="LEG-2026-0001"
                      disabled={locked}
                      autoComplete="off"
                      spellCheck={false}
                      className={cn(
                        'ls-input font-mono tracking-wider',
                        userId && !idCheck.valid && 'border-danger/70 focus:border-danger focus:ring-danger/15',
                        idCheck.valid && userId && 'border-accent/60',
                      )}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2">
                      {idCheck.valid ? (
                        <span className="grid h-5 w-5 place-items-center rounded-full bg-accent/20 text-accent">
                          <ScanFace className="h-3.5 w-3.5" />
                        </span>
                      ) : (
                        <span className="ls-kbd">LEG-</span>
                      )}
                    </span>
                  </div>
                  <p
                    className={cn(
                      'mt-1.5 font-mono text-[10.5px]',
                      idCheck.valid ? 'text-accent' : 'text-muted',
                    )}
                  >
                    {USER_ID_RE.test(idCheck.normalized)
                      ? 'Padron valido'
                      : idCheck.message}{' '}
                    · patron <span className="text-info">LEG-AAAA-NNNN</span>
                  </p>
                </div>

                <div>
                  <label className="ls-label" htmlFor="password">
                    Contrasena
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPass ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      disabled={locked}
                      className="ls-input pr-16"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted transition hover:bg-surface2/60 hover:text-accent"
                    >
                      {showPass ? 'Ocultar' : 'Ver'}
                    </button>
                  </div>
                  <PasswordStrength value={password} className="mt-3" />
                </div>

                <LockCounter attempts={attempts} max={MAX_ATTEMPTS} locked={locked} />

                <AnimatePresence>
                  {locked && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="relative overflow-hidden rounded-xl border border-danger/50 bg-danger/10 p-4">
                        <div className="absolute inset-0 grid place-items-center opacity-10">
                          <motion.span
                            animate={{ scale: [1, 1.08, 1], rotate: [0, -3, 3, 0] }}
                            transition={{ duration: 2.4, repeat: Infinity }}
                          >
                            <Lock className="h-28 w-28 text-danger" />
                          </motion.span>
                        </div>
                        <div className="relative">
                          <p className="flex items-center gap-2 font-display text-sm font-bold text-danger">
                            <Lock className="h-4 w-4" /> Cuenta bloqueada por politica anti-fuerza bruta
                          </p>
                          <p className="mt-1 text-[11.5px] leading-snug text-ink/80">
                            Bloqueo automatico por {remaining}s. El administrador del despacho debe
                            validar su identidad antes de emitir un token de reseteo.
                          </p>

                          {unlockRequest ? (
                            <div className="mt-3 rounded-lg border border-accent/50 bg-accent/10 p-3">
                              <p className="font-mono text-[10.5px] font-bold text-accent">
                                SOLICITUD {unlockRequest.ticket} ENVIADA
                              </p>
                              <p className="mt-1 text-[11px] text-muted">
                                Registrada en auditoria. El token JWT temporal se emitira con TTL 900 s
                                y uso unico.
                              </p>
                              <button
                                type="button"
                                onClick={resetLock}
                                className="ls-btn-secondary mt-2 w-full text-[11px]"
                              >
                                <Undo2 className="h-3.5 w-3.5" /> Simular desbloqueo del administrador
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                requestUnlock()
                                toast.pastel(
                                  'Escalado al administrador',
                                  'Solicitud de desbloqueo registrada como evento de auditoria',
                                  LifeBuoy,
                                )
                              }}
                              className="ls-btn-danger mt-3 w-full text-[11px]"
                            >
                              <LifeBuoy className="h-3.5 w-3.5" /> Solicitar desbloqueo a Administrador
                            </button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <button
                  type="submit"
                  disabled={locked || busy}
                  className="ls-btn-primary relative w-full overflow-hidden py-3"
                >
                  {busy ? (
                    <span className="flex items-center gap-2">
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-onAccent/30 border-t-onAccent" />
                      Verificando…
                    </span>
                  ) : locked ? (
                    <span className="flex items-center gap-2">
                      <Lock className="h-4 w-4" /> Sesion bloqueada
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <LogIn className="h-4 w-4" /> Iniciar sesion segura
                    </span>
                  )}
                  {busy && (
                    <span className="absolute inset-y-0 left-0 w-1/3 animate-shimmer bg-gradient-to-r from-transparent via-white/25 to-transparent" />
                  )}
                </button>

                <AnimatePresence>
                  {busy && (
                    <motion.ul
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="space-y-1 rounded-lg border border-line/40 bg-surface2/30 p-3"
                    >
                      {SIGNAL_STEPS.map((label, i) => (
                        <li
                          key={label}
                          className={cn(
                            'flex items-center gap-2 font-mono text-[10.5px] transition-colors duration-300',
                            i < step ? 'text-accent' : 'text-muted/50',
                          )}
                        >
                          <span className="grid h-3.5 w-3.5 place-items-center">
                            {i < step ? (
                              <span className="block h-1.5 w-1.5 rounded-full bg-accent" />
                            ) : (
                              <span className="block h-1.5 w-1.5 rounded-full bg-line" />
                            )}
                          </span>
                          {label}
                        </li>
                      ))}
                    </motion.ul>
                  )}
                </AnimatePresence>

                <p className="text-center font-mono text-[10px] text-muted">
                  Ejercitese: tres contrasenas cortas bloquean la cuenta ·{' '}
                  <span className="text-info">demo: Juris2026!Abg</span>
                </p>
              </form>
            </div>
          </div>
        </motion.section>
      </div>
    </div>
  )
}