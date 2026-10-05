import { motion } from 'framer-motion'
import { Check, Lock, ShieldAlert, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { scorePassword } from '@/lib/security'

const SEGMENTS = [
  { at: 0, cls: 'bg-danger' },
  { at: 1, cls: 'bg-danger' },
  { at: 2, cls: 'bg-ok' },
  { at: 3, cls: 'bg-accent' },
  { at: 4, cls: 'bg-accent' },
]

/** Medidor didactico de fortaleza de contrasena en tiempo real. */
export default function PasswordStrength({ value, className = '' }) {
  const result = scorePassword(value)
  const filled = value ? result.score + 1 : 0

  return (
    <div className={cn('rounded-lg border border-line/50 bg-surface2/35 p-3', className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
          Fortaleza estimada
        </p>
        <p
          className={cn(
            'font-mono text-[11px] font-bold uppercase tracking-wider',
            result.tone === 'danger'
              ? 'text-danger'
              : result.tone === 'pastel'
                ? 'text-ok'
                : 'text-accent',
          )}
        >
          {result.label}
          {value ? ` · ${result.entropy} bits` : ''}
        </p>
      </div>

      <div className="mt-2 flex gap-1.5">
        {SEGMENTS.map((seg, i) => (
          <div key={seg.at} className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface2/70">
            <motion.div
              className={cn('h-full rounded-full', seg.cls)}
              initial={false}
              animate={{ opacity: i < filled ? 1 : 0.18, scaleX: i < filled ? 1 : 0.6 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            />
          </div>
        ))}
      </div>

      <ul className="mt-2.5 space-y-1">
        {(result.hints ?? []).slice(0, 3).map((hint) => (
          <li key={hint} className="flex items-start gap-1.5 text-[11px] leading-snug text-muted">
            {result.tone === 'danger' ? (
              <X className="mt-0.5 h-3 w-3 shrink-0 text-danger" />
            ) : (
              <Check className="mt-0.5 h-3 w-3 shrink-0 text-accent" />
            )}
            <span>{hint}</span>
          </li>
        ))}
      </ul>

      <p className="mt-2.5 border-t border-line/40 pt-2 font-mono text-[10px] text-muted">
        Politica del despacho: 12 caracteres + mayuscula, minuscula, digito y simbolo
      </p>
    </div>
  )
}

export function LockCounter({ attempts, max = 3, locked }) {
  return (
    <div className="rounded-lg border border-line/50 bg-surface2/35 p-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
          Intentos disponibles
        </p>
        <span
          className={cn(
            'font-mono text-[11px] font-bold',
            locked ? 'text-danger' : attempts >= max - 1 ? 'text-ok' : 'text-accent',
          )}
        >
          {locked ? 'BLOQUEADA' : `${max - attempts}/${max}`}
        </span>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2">
        {Array.from({ length: max }).map((_, i) => {
          const used = i < attempts
          return (
            <div
              key={i}
              className={cn(
                'h-2 rounded-full transition-all duration-500',
                locked || used ? 'bg-danger' : 'bg-accent/40',
                locked && i === attempts - 1 && 'animate-pulse',
              )}
            />
          )
        })}
      </div>

      <p className="mt-2.5 flex items-start gap-1.5 text-[11px] leading-snug text-muted">
        <Lock className="mt-0.5 h-3 w-3 shrink-0 text-ok" />
        Al tercer fallo la cuenta se bloquea 120 s y se emite evento
        <span className="font-mono text-danger"> LOGIN_LOCKED</span>.
      </p>

      {locked && (
        <motion.p
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          className="mt-2 flex items-center gap-1.5 rounded-md border border-danger/50 bg-danger/10 px-2 py-1.5 text-[11px] font-medium text-danger"
        >
          <ShieldAlert className="h-3.5 w-3.5" /> Sesion bajo bloqueo temporal · WAF notificado
        </motion.p>
      )}
    </div>
  )
}