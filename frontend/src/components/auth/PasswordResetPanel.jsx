import { useState } from 'react'
import { motion } from 'framer-motion'
import { KeyRound } from 'lucide-react'
import PasswordStrength from '@/components/auth/PasswordStrength'
import { useAppStore } from '@/store/useAppStore'
import { toast } from '@/store/toastStore'

/**
 * Reinicio de contrasena con el token de 6 digitos que entrega el OSI. El titular
 * define la clave: el OSI nunca la conoce. El token es de un solo uso y no se guarda.
 */
export default function PasswordResetPanel({ initialUserId = '', onDone }) {
  const resetPassword = useAppStore((s) => s.resetPassword)

  const [userId, setUserId] = useState(initialUserId)
  const [token, setToken] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)

  const mismatch = confirm.length > 0 && confirm !== newPassword
  const ready = userId.trim().length > 0 && token.length === 6 && newPassword.length > 0 && confirm === newPassword

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!ready || busy) return
    setBusy(true)
    const result = await resetPassword(userId, token, newPassword)
    setBusy(false)

    if (result.ok) {
      setToken('')
      setNewPassword('')
      setConfirm('')
      toast.mint('Contraseña restablecida', 'Inicie sesión con su nueva contraseña')
      onDone?.()
      return
    }
    // 422 (politica o historial): el token sigue vigente y se conserva; en otro caso se descarta.
    if (!result.policy) setToken('')
    toast.danger('No se pudo restablecer', result.reason)
  }

  return (
    <motion.form
      onSubmit={handleSubmit}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      className="mt-3 space-y-3 rounded-xl border border-accent/30 bg-accent/5 p-4 backdrop-blur"
    >
      <div className="flex items-center gap-2 text-accent">
        <KeyRound className="h-4 w-4" />
        <span className="text-xs font-bold uppercase tracking-wider">Reinicio de contraseña</span>
      </div>
      <p className="text-xs text-muted">
        Solicite al Oficial de Seguridad un token de reinicio. Vence en 15 minutos y sirve una sola vez.
      </p>

      <div>
        <label htmlFor="reset-user" className="ls-label">User ID</label>
        <input
          id="reset-user"
          className="ls-input"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          autoComplete="username"
        />
      </div>
      <div>
        <label htmlFor="reset-token" className="ls-label">Token de 6 dígitos</label>
        <input
          id="reset-token"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={token}
          onChange={(e) => setToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="000000"
          className="ls-input text-center font-mono text-lg tracking-[0.35em]"
        />
      </div>
      <div>
        <label htmlFor="reset-new" className="ls-label">Nueva contraseña</label>
        <input
          id="reset-new"
          type="password"
          className="ls-input"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoComplete="new-password"
        />
        <PasswordStrength value={newPassword} className="mt-3" />
      </div>
      <div>
        <label htmlFor="reset-confirm" className="ls-label">Confirmar contraseña</label>
        <input
          id="reset-confirm"
          type="password"
          className="ls-input"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
        />
        {mismatch && <p className="mt-1 text-[10.5px] text-danger">Las contraseñas no coinciden</p>}
      </div>

      <button type="submit" disabled={!ready || busy} className="ls-btn-primary w-full py-2.5 text-xs">
        {busy ? 'Restableciendo…' : 'Restablecer contraseña'}
      </button>
    </motion.form>
  )
}
