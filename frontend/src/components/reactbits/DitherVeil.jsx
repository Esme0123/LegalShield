import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Eye, KeyRound, Lock, ShieldAlert } from 'lucide-react'
import { useTheme } from '@/context/ThemeContext'
import { useAppStore } from '@/store/useAppStore'
import { cn } from '@/lib/cn'
import { makeDitherTexture } from '@/lib/dither'
import { themeToken } from '@/lib/format'

/**
 * Dither Veil (React Bits · simulacion)
 * Capa de privacidad retro: el documento queda tramado y difuminado hasta que un
 * rol con permiso lo desbloquea de forma explicita y justificada.
 *
 * Modo Didactico apagado: el velo se reduce a un desenfoque suave sin trama
 * dither, para que el contenido reservado se lea sin ruido visual.
 */
export default function DitherVeil({
  revealed = false,
  docId,
  docName,
  classification = 'Restringida',
  sessionRole,
  allowedRoles = ['socio', 'abogado'],
  onReveal,
  onConceal,
  children,
  className = '',
}) {
  const [open, setOpen] = useState(false)
  const [justification, setJustification] = useState('')
  const { isDark } = useTheme()
  const didactic = useAppStore((s) => s.didactic)

  const dither = useMemo(
    () =>
      makeDitherTexture({
        // En claro la trama necesita tinta, no el crema pastel del tema oscuro.
        fg: isDark ? themeToken('--ls-highlight', '173 231 146') : themeToken('--ls-ink', '16 42 82'),
        bg: isDark ? themeToken('--ls-overlay', '9 25 60') : themeToken('--ls-bg', '248 250 252'),
        opacity: 0.42,
      }),
    [isDark],
  )

  const eligible = allowedRoles.includes(sessionRole)

  const submit = () => {
    onReveal?.(docId, { roleId: sessionRole, justification: justification.trim() || 'sin justificacion' })
    setOpen(false)
  }

  return (
    <div className={cn('relative overflow-hidden rounded-lg border border-line/50', className)}>
      {/* Contenido sensible */}
      <div
        className={cn(
          'transition-all duration-700 ease-shield',
          revealed ? 'blur-0 scale-100 opacity-100' : 'blur-[6px] scale-[1.04] opacity-45 saturate-50',
        )}
        aria-hidden={!revealed}
      >
        {children}
      </div>

      {!revealed && (
        <>
          {didactic && (
            <div
              className="pointer-events-none absolute inset-0 opacity-90 mix-blend-screen transition-opacity duration-500"
              style={dither}
            />
          )}
          <div className="pointer-events-none absolute inset-0 bg-scanlines opacity-20" />
          <div className="absolute inset-0 grid place-items-center bg-bg/25 p-4 backdrop-blur-[2px]">
            <motion.div
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-full max-w-xs rounded-xl border border-ok/40 bg-surface/95 p-3.5 text-center shadow-lift"
            >
              <span className="mx-auto mb-2 grid h-9 w-9 place-items-center rounded-full border border-ok/50 bg-ok/10 text-ok">
                <Lock className="h-4 w-4" />
              </span>
              <p className="font-display text-[13px] font-bold text-ok">Contenido {classification}</p>
              <p className="mt-1 line-clamp-1 font-mono text-[10.5px] text-muted">{docName}</p>

              {!open ? (
                <button
                  type="button"
                  onClick={() => setOpen(true)}
                  className="ls-btn-primary mt-3 w-full text-xs"
                >
                  <Eye className="h-3.5 w-3.5" /> Desbloquear por Rol
                </button>
              ) : (
                <div className="mt-3 space-y-2 text-left">
                  <div
                    className={cn(
                      'flex items-center gap-2 rounded-lg border px-2.5 py-2 text-[11px]',
                      eligible
                        ? 'border-accent/50 bg-accent/10 text-accent'
                        : 'border-danger/50 bg-danger/10 text-danger',
                    )}
                  >
                    <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      Sesion: <strong className="uppercase">{sessionRole ?? 'anonimo'}</strong>
                      {!eligible && ' · sin privilegio de revelacion'}
                    </span>
                  </div>
                  <label className="ls-label mt-1" htmlFor={`just-${docId}`}>
                    Justificacion registrada en auditoria
                  </label>
                  <textarea
                    id={`just-${docId}`}
                    value={justification}
                    onChange={(e) => setJustification(e.target.value)}
                    rows={2}
                    placeholder="Ej. Revision de peritaje para vista de prueba"
                    className="ls-input resize-none text-[11px]"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      className="ls-btn-ghost flex-1 text-[11px]"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={!eligible}
                      onClick={submit}
                      className="ls-btn-primary flex-1 text-[11px]"
                    >
                      <KeyRound className="h-3.5 w-3.5" /> Revelar
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        </>
      )}

      {revealed && onConceal && (
        <button
          type="button"
          onClick={() => onConceal(docId)}
          className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md border border-line/60 bg-bg/80 px-2 py-1 font-mono text-[10px] text-muted transition hover:border-danger/60 hover:text-danger"
        >
          <Lock className="h-3 w-3" /> Re-cubrir
        </button>
      )}
    </div>
  )
}