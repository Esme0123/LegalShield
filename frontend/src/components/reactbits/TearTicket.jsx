import { useState } from 'react'
import { Check, ShieldCheck, Ticket } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore } from '@/store/useAppStore'
import { cn } from '@/lib/cn'
import { formatDateTime } from '@/lib/format'

/**
 * Tear Ticket (React Bits · simulacion)
 * Comprobante de auditoria / token JWT temporal presentado como boleto con
 * linea de perforacion. Al validarlo, las dos mitades se rasgan y se separan,
 * dejando un talon sellado como evidencia del uso unico.
 *
 * Con el Modo Didactico apagado el boleto se valida en el acto (sin separacion
 * de mitades ni micro shreds) para que la demostracion no pierda el hilo.
 */

/*
 * Las dos mitades conservan su contenido integro: el clip-path solo mordisquea
 * los ultimos ~7% de la mitad superior y los primeros ~7% de la inferior, de modo
 * que la rotura coincide exactamente con la frontera entre ambas.
 */
const TOOTH = '4% 93%, 12% 100%, 20% 93%, 28% 100%, 36% 93%, 44% 100%, 52% 93%, 60% 100%, 68% 93%, 76% 100%, 84% 93%, 92% 100%'
const TOP_TEAR = `polygon(0% 0%, 100% 0%, 100% 93%, ${TOOTH}, 0% 100%)`
const BOTTOM_TEAR = `polygon(0% 0%, 4% 7%, 12% 0%, 20% 7%, 28% 0%, 36% 7%, 44% 0%, 52% 7%, 60% 0%, 68% 7%, 76% 0%, 84% 7%, 92% 0%, 100% 7%, 100% 0%, 100% 100%, 0% 100%)`

export default function TearTicket({
  serial,
  title,
  subject,
  hash,
  signer,
  issuedAt,
  status = 'disponible',
  kind = 'comprobante',
  onTear,
  className = '',
}) {
  const [shred, setShred] = useState(false)
  const [torn, setTorn] = useState(status === 'validado')
  const didactic = useAppStore((s) => s.didactic)

  const handleTear = () => {
    if (torn || shred) return
    if (!didactic) {
      setTorn(true)
      onTear?.()
      return
    }
    setShred(true)
    setTimeout(() => {
      setTorn(true)
      setShred(false)
      onTear?.()
    }, 620)
  }

  const stamp = formatDateTime(issuedAt)

  return (
    <div className={cn('relative', className)}>
      <div className="relative overflow-hidden rounded-xl border border-line/60 bg-gradient-to-br from-surface2/70 to-surface/80 shadow-card">
        {/* Mitad superior */}
        <motion.div
          className="relative px-4 pt-3.5 pb-4"
          animate={
            shred
              ? { y: -46, rotate: -4, opacity: 0, filter: 'blur(1.5px)' }
              : { y: 0, rotate: 0, opacity: 1, filter: 'blur(0px)' }
          }
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          style={{ clipPath: TOP_TEAR }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg border border-accent/50 bg-accent/10 text-accent">
                {kind === 'token' ? <Ticket className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
              </span>
              <div>
                <p className="font-mono text-[10px] tracking-[0.18em] text-muted uppercase">{title}</p>
                <p className="text-[11px] text-muted/80">
                  No. {serial} · {stamp.full}
                </p>
              </div>
            </div>
            <span className="ls-chip shrink-0">{kind === 'token' ? 'JWT TTL 900s' : 'SHA-256'}</span>
          </div>
        </motion.div>

        {/* Perforacion: se dibuja sobre la frontera entre las dos mitades */}
        <div className="pointer-events-none absolute inset-x-3 top-[calc(50%-1px)] -z-[1] border-t-2 border-dashed border-line/40" />
        <div className="pointer-events-none absolute left-0 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-line/50 bg-bg" />
        <div className="pointer-events-none absolute right-0 top-1/2 h-4 w-4 translate-x-1/2 -translate-y-1/2 rounded-full border border-line/50 bg-bg" />

        {/* Mitad inferior (talon) */}
        <motion.div
          className="relative px-4 pt-4 pb-3.5"
          animate={
            shred
              ? { y: 54, rotate: 5, opacity: 0, filter: 'blur(1.5px)' }
              : { y: 0, rotate: 0, opacity: 1, filter: 'blur(0px)' }
          }
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          style={{ clipPath: BOTTOM_TEAR }}
        >
          <p className="line-clamp-2 text-[12px] leading-snug font-medium">{subject}</p>

          <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[10px] text-muted">
            <dt className="uppercase tracking-wider">Hash</dt>
            <dd className="truncate text-right text-info">{hash}</dd>
            <dt className="uppercase tracking-wider">Firmante</dt>
            <dd className="truncate text-right text-ink">{signer}</dd>
          </dl>

          <div className="mt-3 flex items-center justify-between gap-2 border-t border-line/40 pt-2.5">
            {torn ? (
              <motion.span
                initial={{ scale: 1.6, opacity: 0, rotate: -14 }}
                animate={{ scale: 1, opacity: 1, rotate: -8 }}
                transition={{ type: 'spring', stiffness: 320, damping: 14 }}
                className="inline-flex items-center gap-1.5 rounded-md border-2 border-ok px-2 py-0.5 font-mono text-[10px] font-bold tracking-[0.2em] text-ok"
              >
                <Check className="h-3 w-3" /> VALIDADO
              </motion.span>
            ) : (
              <button
                type="button"
                onClick={handleTear}
                className="ls-btn-primary px-3 py-1.5 text-[11px]"
                aria-label={`Rasar y validar ${title} ${serial}`}
              >
                {kind === 'token' ? 'Consumir token' : 'Rasar y validar'}
              </button>
            )}
            <span className="font-mono text-[10px] text-muted">
              {torn ? 'Consumo unico registrado' : '1 de 1 usos'}
            </span>
          </div>
        </motion.div>

        {/* Micro Shreds durante la rotura */}
        <AnimatePresence>
          {shred &&
            Array.from({ length: 7 }).map((_, i) => (
              <motion.span
                key={i}
                initial={{ opacity: 0.9, x: 0, y: 0 }}
                animate={{ opacity: 0, x: (i - 3) * 26, y: 70 + (i % 3) * 26, rotate: i * 24 - 70 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.62, ease: 'easeOut' }}
                className="pointer-events-none absolute left-1/2 top-1/2 h-3 w-6 rounded-[2px] border border-accent/40 bg-accent/20"
              />
            ))}
        </AnimatePresence>
      </div>
    </div>
  )
}