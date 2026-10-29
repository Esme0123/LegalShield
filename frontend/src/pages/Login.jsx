import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Fingerprint,
  Gavel,
  KeyRound,
  Lock,
  LogIn,
  Scale,
  ScanFace,
  ShieldCheck,
} from 'lucide-react'
import AeroShards from '@/components/reactbits/AeroShards'
import PasswordStrength, { LockCounter } from '@/components/auth/PasswordStrength'
import ThemeToggle from '@/components/ui/ThemeToggle'
import PasswordInput from '@/components/ui/PasswordInput'
import { Badge } from '@/components/ui/primitives'
import { MAX_ATTEMPTS, useAppStore } from '@/store/useAppStore'
import { toast } from '@/store/toastStore'
import { validateUserId } from '@/lib/security'
import { cn } from '@/lib/cn'
import CaptchaChallenge from '@/components/auth/CaptchaChallenge'
import PasswordResetPanel from '@/components/auth/PasswordResetPanel'

const SIGNAL_STEPS = ['Analisis de User ID…', 'Verificacion de politica…', 'MFA · passkey', 'Emision de sesion']

export default function Login() {
  const navigate = useNavigate()
  const attempts = useAppStore((s) => s.attempts)
  const lockedUntil = useAppStore((s) => s.lockedUntil)
  const session = useAppStore((s) => s.session)

  const login = useAppStore((s) => s.login)
  const checkLockStatus = useAppStore((s) => s.checkLockStatus)
  const resetLock = useAppStore((s) => s.resetLock)
  const verifyUnlockToken = useAppStore((s) => s.verifyUnlockToken)
  const lockRequiresOsi = useAppStore((s) => s.lockRequiresOsi)
  const lastIdentifier = useAppStore((s) => s.lastIdentifier)

  const [userId, setUserId] = useState(lastIdentifier || 'mariana.solis')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [step, setStep] = useState(-1)
  const [now, setNow] = useState(Date.now())
  const [showCaptcha, setShowCaptcha] = useState(false)
  const [captchaToken, setCaptchaToken] = useState('')
  const [captchaVerified, setCaptchaVerified] = useState(false)
  // Cambiar la key vuelve a montar el desafio: cada fallo exige uno nuevo
  const [captchaKey, setCaptchaKey] = useState(0)
  const passwordRef = useRef(null)
  const [, setLocalError] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [verifyingOtp, setVerifyingOtp] = useState(false)
  const [showReset, setShowReset] = useState(false)

  const locked = Boolean(lockedUntil) && now < lockedUntil
  const idCheck = useMemo(() => validateUserId(userId), [userId])

  useEffect(() => {
    if (session) navigate(session.mustChangePassword ? '/profile' : '/dashboard', { replace: true })
  }, [session, navigate])

  // Tras un F5 el estado del bloqueo se recupera de MySQL: el servidor recalcula
  // los segundos restantes exactos y la cuenta regresiva continua donde iba.
  useEffect(() => {
    if (lastIdentifier) {
      checkLockStatus(lastIdentifier).then((status) => {
        if (status?.rateLimited) toast.danger('Demasiados intentos', status.error)
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!lockedUntil) return undefined
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [lockedUntil])

  const remaining = locked ? Math.max(0, Math.ceil((lockedUntil - now) / 1000)) : 0

  // Al cambiar de usuario se descarta el estado del usuario anterior: el
  // contador de intentos vuelve a 0 y se libera cualquier bloqueo local para
  // no arrastrar los fallos de otra cuenta.
  const handleUserChange = (value) => {
    const changed = value !== userId
    if (changed) {
      resetLock()
      setShowCaptcha(false)
      setCaptchaVerified(false)
      setCaptchaToken('')
      setLocalError('')
      setPassword('')
      setOtpCode('')
      setBusy(false)
      setStep(-1)
    }
    setUserId(value)
  }

  const handleVerifyOtp = async () => {
    if (otpCode.length !== 6 || verifyingOtp) return
    if (!idCheck.valid) {
      toast.danger('User ID invalido', idCheck.message)
      return
    }
    setVerifyingOtp(true)
    const result = await verifyUnlockToken(idCheck.normalized, otpCode)
    setVerifyingOtp(false)
    // El OTP es de un solo uso: se descarta del campo acierte o no.
    setOtpCode('')
    if (result.ok) {
      resetLock()
      setLocalError('')
      setShowCaptcha(false)
      toast.mint('Cuenta desbloqueada', 'Inicie sesion con su contrasena habitual')
    } else {
      toast.danger('Token rechazado', result.reason)
    }
  }

  const submit = async (e) => {
    e.preventDefault()
    if (locked || busy) return

    if (!idCheck.valid) {
      toast.danger('User ID invalido', idCheck.message)
      return
    }

    // Una clave demasiado corta se cuenta como intento fallido, pero se resuelve
    // en local: la politica real (12 caracteres y politica completa) la aplica el
    // backend en /api/auth/login.
    if (showCaptcha && !captchaVerified) {
      toast.danger('Verificación requerida', 'Por favor resuelve el CAPTCHA para continuar')
      return
    }

    setBusy(true)
    setStep(0)
    SIGNAL_STEPS.forEach((_, i) => {
      setTimeout(() => setStep(i + 1), 260 * (i + 1))
    })

    try {
      const result = await login({
        userId: idCheck.normalized,
        password,
        captchaToken: captchaToken?.token || undefined,
        captchaResponse: captchaToken?.answer || undefined,
      })
      if (result.ok) {
        if (result.user.mustChangePassword) {
          toast.pastel('Cambio de clave requerido', 'Debe definir una contrasena personal antes de continuar')
          navigate('/profile', { replace: true })
          return
        }
        toast.mint('Acceso concedido', `Rol asignado: ${String(result.user.role).toUpperCase()}`)
        navigate('/dashboard', { replace: true })
        return
      }
      if (result.rateLimited) {
        toast.danger('Demasiados intentos', result.error)
        return
      }
      const lockMessage = result.requiresOsi
        ? 'Cuenta bloqueada por reincidencia: solo el Oficial de Seguridad puede habilitarla'
        : '3 de 3 - Cuenta inhabilitada temporalmente'
      toast.danger(
        result.locked ? 'Acceso suspendido' : 'Credencial invalida',
        result.locked
          ? lockMessage
          : result.lockExempt
            ? 'Cuenta sin bloqueo · resuelva el CAPTCHA en cada intento'
            : `Intento ${Math.min(result.attempts, MAX_ATTEMPTS)} de ${MAX_ATTEMPTS}`,
      )
      if (result.locked) {
        setLocalError(lockMessage)
      }
      if (result.showCaptcha || result.attempts >= 1) {
        setShowCaptcha(true)
        setCaptchaVerified(false)
        setCaptchaToken('')
        setCaptchaKey((k) => k + 1)
      }
    } catch (error) {
      toast.danger('Fallo de autenticacion', error.message ?? 'No fue posible validar la credencial')
      setShowCaptcha(true)
      setCaptchaVerified(false)
      setCaptchaToken('')
      setCaptchaKey((k) => k + 1)
    } finally {
      setBusy(false)
      setStep(-1)
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <AeroShards density={0.00003} className="opacity-40" />

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
                <span className="absolute inset-x-0 bottom-1 z-0 h-3 bg-ok/30" />
              </span>
              .
            </h1>
            <p className="mt-4 max-w-xl text-[13.5px] leading-relaxed text-muted">
              Control de acceso por rol (RBAC), bitacora forense inmutable y trazabilidad
              normativa ISO 27001. Cada accion sensible queda firmada, sellada y reproducible.
            </p>

            <div className="mt-7 grid gap-3 sm:grid-cols-3">
              {[
                { icon: ScanFace, title: 'Identidad fuerte', copy: 'User ID estándar + MFA' },
                { icon: Gavel, title: 'Minimo privilegio', copy: '22 permisos revisables en caliente' },
                { icon: Scale, title: 'Evidencia', copy: 'Comprobantes firmados con hash SHA-256' },
              ].map(({ icon: Icon, title, copy }) => (
                <div key={title} className="ls-panel">
                  <Icon className="mb-2 h-4 w-4 text-accent" />
                  <p className="text-[12.5px] font-semibold">{title}</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-muted">{copy}</p>
                </div>
              ))}
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
                    Conexión segura del despacho
                  </p>
                </div>
                <KeyRound className="h-5 w-5 shrink-0 text-ok" />
              </div>

              {/* El CAPTCHA trae su propio <form>: se monta fuera del de login para no anidarlos */}
              <div className="mt-5 space-y-4">
              <form id="login-form" onSubmit={submit} className="space-y-4">
                <div>
                    <label className="ls-label" htmlFor="userId">
                      USER ID / USUARIO
                    </label>
                  <div className="relative">
                    <input
                      id="userId"
                      value={userId}
                      onChange={(e) => handleUserChange(e.target.value)}
                      placeholder="ej. mariana.solis"
                      autoComplete="off"
                      spellCheck={false}
                      className={cn(
                        'ls-input font-mono tracking-wider',
                        userId && !idCheck.valid && 'border-danger/70 focus:border-danger focus:ring-danger/15',
                        idCheck.valid && userId && 'border-accent/60',
                      )}
                    />
                     <span className="absolute right-3 top-1/2 -translate-y-1/2">
                       {idCheck.valid && (
                         <span className="grid h-5 w-5 place-items-center rounded-full bg-accent/20 text-accent">
                           <ScanFace className="h-3.5 w-3.5" />
                         </span>
                       )}
                     </span>
                  </div>
                   <p
                     className={cn(
                       'mt-1.5 font-mono text-[10.5px]',
                       idCheck.valid ? 'text-accent' : 'text-muted',
                     )}
                   >
                     Formato estándar: nombre.apellido (ej: mariana.solis)
                   </p>
                </div>

                <div>
                  <label className="ls-label" htmlFor="password">
                    Contrasena
                  </label>
                  <PasswordInput
                    id="password"
                    ref={passwordRef}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    disabled={locked}
                    autoComplete="current-password"
                  />
                  <PasswordStrength value={password} className="mt-3" />
                </div>
              </form>

                <LockCounter attempts={attempts} max={MAX_ATTEMPTS} locked={locked} />

                <AnimatePresence>
                  {showCaptcha && !captchaVerified && !locked && (
                    <motion.div
                      key={captchaKey}
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <CaptchaChallenge
                        onVerify={(verified, challenge) => {
                          setCaptchaVerified(verified)
                          if (verified) {
                            // { token, answer }: el servidor valida ambos al iniciar sesion
                            setCaptchaToken(challenge)
                            // Resuelto el desafio, el bloque se oculta y se continua con la clave
                            passwordRef.current?.focus()
                          }
                        }}
                        disabled={busy}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

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
                            <Lock className="h-4 w-4" /> {lockRequiresOsi ? 'Acceso suspendido por seguridad' : 'Acceso suspendido temporalmente por seguridad'}
                          </p>
                          {!lockRequiresOsi && (
                            <p className="mt-1 text-[11.5px] leading-snug text-ink/80">
                              Por proteccion de la cuenta, el acceso se rehabilita automaticamente en {remaining}s.
                              Si el problema persiste, contacte al Oficial de Seguridad del despacho.
                            </p>
                          )}
                          <div className="mt-2 text-[12px] font-bold text-danger">
                            {lockRequiresOsi
                              ? 'Cuenta bloqueada por reincidencia: solo el Oficial de Seguridad puede habilitarla'
                              : '3 de 3 - Cuenta inhabilitada temporalmente'}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <button
                  type="submit"
                  form="login-form"
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
                      <Lock className="h-4 w-4" /> {lockRequiresOsi ? 'Requiere desbloqueo del OSI' : 'Sesion bloqueada'}
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
                  Tres intentos fallidos bloquean la cuenta 1 minuto (también al repetirse) · al tercer bloqueo solo el Oficial de Seguridad puede habilitarla
                </p>
              </div>

              {/* Fuera del formulario: Enter en el campo del token no dispara el login */}
              <AnimatePresence>
                {locked && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    className="mt-4 rounded-xl border border-accent/30 bg-accent/5 p-4 backdrop-blur"
                  >
                    <div className="flex items-center gap-2 text-accent">
                      <KeyRound className="h-4 w-4" />
                      <span className="text-xs font-bold uppercase tracking-wider">Desbloqueo con token OTP</span>
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {lockRequiresOsi
                        ? 'Bloqueo por reincidencia: la cuenta solo se libera con un token emitido por el Oficial de Seguridad (OSI).'
                        : `Se libera automaticamente en ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')} o ingrese el token de 6 digitos que le entrego el OSI.`}
                    </p>
                    <div className="mt-3 flex gap-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        onKeyDown={(e) => e.key === 'Enter' && handleVerifyOtp()}
                        placeholder="000000"
                        aria-label="Token OTP de desbloqueo"
                        className="ls-input flex-1 text-center font-mono text-lg tracking-[0.35em]"
                      />
                      <button
                        type="button"
                        disabled={otpCode.length !== 6 || verifyingOtp}
                        onClick={handleVerifyOtp}
                        className="ls-btn-primary px-4 text-xs"
                      >
                        {verifyingOtp ? 'Verificando...' : 'Desbloquear'}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <button
                type="button"
                onClick={() => setShowReset((v) => !v)}
                className="ls-btn-ghost mt-3 w-full text-xs"
                aria-expanded={showReset}
              >
                ¿Olvidó su contraseña?
              </button>
              <AnimatePresence>
                {showReset && (
                  <PasswordResetPanel
                    initialUserId={idCheck.valid ? idCheck.normalized : userId}
                    onDone={() => {
                      setShowReset(false)
                      setPassword('')
                    }}
                  />
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.section>
      </div>

      {/* Solo fuera de produccion; la contrasena nunca se muestra ni se rellena. */}
      {!import.meta.env.PROD && (
        <div className="pointer-events-auto fixed bottom-5 left-5 z-20 max-w-xs rounded-xl border border-line/60 bg-surface/90 p-4 shadow-xl backdrop-blur">
          <p className="font-display text-xs font-semibold text-ink">Usuario Demo</p>
          <p className="mt-1 font-mono text-[11px] text-muted">
            <span className="text-ink">osi.seguridad</span>, <span className="text-ink">mariana.solis</span> o{' '}
            <span className="text-ink">diego.ferrer</span>
          </p>
          <p className="mt-1 font-mono text-[11px] text-muted">
            La contraseña de demostración la entrega el equipo del proyecto.
          </p>
        </div>
      )}
    </div>
  )
}