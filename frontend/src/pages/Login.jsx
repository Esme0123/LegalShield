import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Fingerprint,
  Gavel,
  KeyRound,
  LifeBuoy,
  Lock,
  LogIn,
  Scale,
  ScanFace,
  ShieldCheck,
  Undo2,
} from 'lucide-react'
import AeroShards from '@/components/reactbits/AeroShards'
import PasswordStrength, { LockCounter } from '@/components/auth/PasswordStrength'
import ThemeToggle from '@/components/ui/ThemeToggle'
import { Badge } from '@/components/ui/primitives'
import { MAX_ATTEMPTS, useAppStore } from '@/store/useAppStore'
import { toast } from '@/store/toastStore'
import { validateUserId } from '@/lib/security'
import { cn } from '@/lib/cn'
import CaptchaChallenge from '@/components/auth/CaptchaChallenge'

const SIGNAL_STEPS = ['Analisis de User ID…', 'Verificacion de politica…', 'MFA · passkey', 'Emision de sesion']

export default function Login() {
  const navigate = useNavigate()
  const attempts = useAppStore((s) => s.attempts)
  const lockedUntil = useAppStore((s) => s.lockedUntil)
  const unlockRequest = useAppStore((s) => s.unlockRequest)
  const session = useAppStore((s) => s.session)
  const login = useAppStore((s) => s.login)
  const requestUnlock = useAppStore((s) => s.requestUnlock)
  const unlockAccount = useAppStore((s) => s.unlockAccount)
  const checkLockStatus = useAppStore((s) => s.checkLockStatus)
  const resetLock = useAppStore((s) => s.resetLock)
  const verifyUnlockToken = useAppStore((s) => s.verifyUnlockToken)
  const lockRequiresOsi = useAppStore((s) => s.lockRequiresOsi)
  const lastIdentifier = useAppStore((s) => s.lastIdentifier)

  const [userId, setUserId] = useState(lastIdentifier || 'mariana.solis')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [busy, setBusy] = useState(false)
  const [step, setStep] = useState(-1)
  const [now, setNow] = useState(Date.now())
  const [showCaptcha, setShowCaptcha] = useState(false)
  const [captchaToken, setCaptchaToken] = useState('')
  const [captchaVerified, setCaptchaVerified] = useState(false)
  const [localError, setLocalError] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [verifyingOtp, setVerifyingOtp] = useState(false)

  const locked = Boolean(lockedUntil) && now < lockedUntil
  const idCheck = useMemo(() => validateUserId(userId), [userId])

  useEffect(() => {
    if (session) navigate(session.mustChangePassword ? '/profile' : '/dashboard', { replace: true })
  }, [session, navigate])

  useEffect(() => {
    if (lastIdentifier) checkLockStatus(lastIdentifier)
  }, [lastIdentifier, checkLockStatus])

  useEffect(() => {
    if (!lockedUntil) return undefined
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [lockedUntil])

  const remaining = locked ? Math.max(0, Math.ceil((lockedUntil - now) / 1000)) : 0

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
        captchaToken: captchaToken || undefined,
      })
      if (result.ok) {
        if (result.user.mustChangePassword) {
          toast.pastel('Cambio de clave requerido', 'Debe definir una contrasena personal antes de continuar')
          navigate('/profile', { replace: true })
          return
        }
        toast.mint('Acceso concedido', 'Rol asignado: ')
        navigate('/dashboard', { replace: true })
        return
      }
      toast.danger(
        result.locked ? 'Acceso suspendido' : 'Credencial invalida',
        result.locked ? '3 de 3 - Cuenta inhabilitada temporalmente' : 'Intento  de ',
      )
      if (result.locked) {
        setLocalError('3 de 3 - Cuenta inhabilitada temporalmente')
      }
      if (result.showCaptcha || result.attempts >= 1) {
        setShowCaptcha(true)
        setCaptchaVerified(false)
      }
    } catch (error) {
      toast.danger('Fallo de autenticacion', error.message ?? 'No fue posible validar la credencial')
      setShowCaptcha(true)
      setCaptchaVerified(false)
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
          </span>
          <div>
            <p className="font-display text-base font-bold leading-none">LegalShield</p>
            <p className="mt-1 font-mono text-[9.5px] uppercase tracking-[0.2em] text-muted">Secure Legal OS · v4.2</p>
          </div>
        </div>
      </header>
      <div className="relative z-10 mx-auto grid max-w-7xl gap-8 px-5 pb-14 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-12">
        <section className="order-2 lg:order-1">
          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <h1 className="font-display text-4xl font-bold leading-[1.05] tracking-tight text-balance sm:text-5xl">
              Gestion legal con{' '}
              <span className="relative inline-block">
                <span className="relative z-10 text-accent">defensa en profundidad</span>
              </span>
            </h1>
          </motion.div>
        </section>
        <motion.section initial={{ opacity: 0, y: 26 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.12 }}>
          <div className="ls-card relative overflow-hidden p-5 sm:p-6">
            <form onSubmit={submit} className="mt-5 space-y-4">
              <div>
                <label className="ls-label" htmlFor="userId">USER ID / USUARIO</label>
                <input
                  id="userId"
                  value={userId}
                  onChange={(e) => handleUserChange(e.target.value)}
                  placeholder="ej. mariana.solis"
                  autoComplete="off"
                  spellCheck={false}
                  className="ls-input"
                />
              </div>
              <div>
                <label className="ls-label" htmlFor="password">Contrasena</label>
                <input
                  id="password"
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  disabled={locked}
                  className="ls-input"
                />
              </div>
              <button type="submit" disabled={locked || busy} className="ls-btn-primary relative w-full overflow-hidden py-3">
                {busy
                  ? 'Verificando...'
                  : locked
                    ? lockRequiresOsi
                      ? 'Requiere desbloqueo del OSI'
                      : 'Sesion bloqueada'
                    : 'Iniciar sesion segura'}
              </button>
            </form>

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
          </div>
        </motion.section>
      </div>
    </div>
  )
}

