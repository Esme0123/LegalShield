import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, CheckCircle2, Info, ShieldCheck, X } from 'lucide-react'
import { useToastStore } from '@/store/toastStore'
import { cn } from '@/lib/cn'

const TONES = {
  mint: {
    ring: 'border-accent/60',
    glow: 'shadow-lift',
    icon: 'border-accent/50 bg-accent/15 text-accent',
    bar: 'bg-accent',
    Icon: CheckCircle2,
  },
  pastel: {
    ring: 'border-ok/70',
    glow: 'shadow-[0_26px_60px_-30px_rgba(173,231,146,0.65)]',
    icon: 'border-ok/60 bg-ok/15 text-ok',
    bar: 'bg-ok',
    Icon: ShieldCheck,
  },
  danger: {
    ring: 'border-danger/70',
    glow: 'shadow-[0_26px_60px_-30px_rgba(224,96,116,0.7)]',
    icon: 'border-danger/60 bg-danger/15 text-danger',
    bar: 'bg-danger',
    Icon: AlertTriangle,
  },
  info: {
    ring: 'border-info/60',
    glow: 'shadow-[0_26px_60px_-30px_rgba(67,130,223,0.6)]',
    icon: 'border-info/60 bg-info/15 text-info',
    bar: 'bg-info',
    Icon: Info,
  },
}

export default function ToastHost() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[80] flex w-[min(92vw,24rem)] flex-col gap-2.5">
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const tone = TONES[t.tone] ?? TONES.mint
          const Icon = t.icon ?? tone.Icon
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, x: 60, scale: 0.95, filter: 'blur(6px)' }}
              animate={{ opacity: 1, x: 0, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, x: 40, scale: 0.95, filter: 'blur(6px)' }}
              transition={{ type: 'spring', stiffness: 320, damping: 26 }}
              className={cn(
                'pointer-events-auto relative overflow-hidden rounded-xl border bg-surface/95 p-3.5 backdrop-blur-md',
                tone.ring,
                tone.glow,
              )}
            >
              <div className="flex items-start gap-3">
                <span className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-lg border', tone.icon)}>
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-[13px] font-bold leading-tight">{t.title}</p>
                  {t.description ? (
                    <p className="mt-0.5 text-[11.5px] leading-snug text-muted">{t.description}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(t.id)}
                  className="rounded p-1 text-muted transition hover:bg-surface2/60 hover:text-ink"
                  aria-label="Cerrar notificacion"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <motion.span
                className={cn('absolute bottom-0 left-0 h-0.5', tone.bar)}
                initial={{ width: '0%' }}
                animate={{ width: '100%' }}
                transition={{ duration: 4.2, ease: 'linear' }}
              />
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}