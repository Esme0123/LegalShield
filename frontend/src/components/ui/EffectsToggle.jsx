import { GraduationCap, Sparkles } from 'lucide-react'
import { motion } from 'framer-motion'
import { useAppStore } from '@/store/useAppStore'
import { cn } from '@/lib/cn'

/**
 * Interruptor global de "Modo Didactico".
 * Encendido: los efectos React Bits (Folder Float, Dither Veil, Paper Crumple,
 * Tear Ticket, Aero Shards, Glow Cursor) se muestran de forma explicativa.
 * Apagado: quedan en version funcional y sutil, sin interferir la navegacion.
 */
export default function EffectsToggle({ className = '' }) {
  const didactic = useAppStore((s) => s.didactic)
  const setDidactic = useAppStore((s) => s.setDidactic)

  return (
    <button
      type="button"
      role="switch"
      aria-checked={didactic}
      onClick={() => setDidactic(!didactic)}
      title={
        didactic
          ? 'Modo didactico activo · efectos React Bits explicativos'
          : 'Modo didactico apagado · efectos sutiles, navegacion fluida'
      }
      className={cn(
        'inline-flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-[11px] font-semibold transition-all duration-300',
        didactic
          ? 'border-accent/60 bg-accent/12 text-accent'
          : 'border-line/50 text-muted hover:border-lineSoft/50 hover:text-ink',
        className,
      )}
    >
      <span className="relative grid h-4 w-4 place-items-center">
        <motion.span
          animate={{ opacity: didactic ? 1 : 0.45, scale: didactic ? 1 : 0.9 }}
          transition={{ duration: 0.25 }}
        >
          {didactic ? <GraduationCap className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
        </motion.span>
      </span>
      <span className="hidden text-left leading-none sm:block">
        <span className="block">Modo didactico</span>
        <span className="mt-0.5 block font-mono text-[9px] font-normal uppercase tracking-wider opacity-75">
          {didactic ? 'efectos ON' : 'efectos OFF'}
        </span>
      </span>
      <span
        className={cn(
          'relative h-4 w-8 shrink-0 rounded-full border transition-colors duration-300',
          didactic ? 'border-accent/60 bg-accent/25' : 'border-line/50 bg-surface2/60',
        )}
      >
        <motion.span
          className={cn(
            'absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full',
            didactic ? 'bg-accent' : 'bg-muted',
          )}
          animate={{ left: didactic ? '1.25rem' : '0.15rem' }}
          transition={{ type: 'spring', stiffness: 420, damping: 30 }}
        />
      </span>
    </button>
  )
}