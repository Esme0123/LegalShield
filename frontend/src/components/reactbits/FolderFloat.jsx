import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Scroll } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { cn } from '@/lib/cn'

/**
 * Folder Float (React Bits · simulacion)
 * Carpeta 3D que se despliega al hacer hover (o tap en movil) dejando ver los
 * documentos interiores. Construido sobre CSS 3D, sin motor de escena.
 *
 * Con el Modo Didactico apagado la carpeta deja de abrirse sola al pasar el
 * cursor: el despliegue exige un clic explicito y el texto de ayuda cambia.
 */
export default function FolderFloat({
  docs = [],
  children,
  className = '',
  tabLabel = 'EXPEDIENTE',
  accentClass = 'text-accent',
  folderFill = 'from-accent/35 via-line/45 to-line/70',
  tabFill = 'bg-accent/70',
  onTap,
  disabled = false,
}) {
  const didactic = useAppStore((s) => s.didactic)
  const [open, setOpen] = useState(false)
  const frame = useRef(null)
  const sheets = docs.slice(0, 4)

  useEffect(() => {
    if (!open) return undefined
    const timer = setTimeout(() => setOpen(false), didactic ? 2600 : 1600)
    return () => clearTimeout(timer)
  }, [open, didactic])

  const toggle = () => {
    if (disabled) return
    setOpen((v) => !v)
    onTap?.()
  }

  return (
    <div
      className={cn('group relative', className)}
      onMouseEnter={() => !disabled && didactic && setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onClick={toggle}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          toggle()
        }
      }}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-expanded={open}
      aria-label={`${tabLabel} · ${docs.length} documentos`}
    >
      <div ref={frame} className="relative h-44 w-full select-none [perspective:1100px]">
        {/* Sombra proyectada */}
        <div className="absolute inset-x-6 bottom-2 h-6 rounded-[50%] bg-accent/25 blur-xl transition-opacity duration-300 group-hover:opacity-100 opacity-0" />

        <div
          className={cn(
            'absolute inset-x-0 bottom-0 top-4 origin-bottom transition-transform duration-500 ease-shield [transform-style:preserve-3d]',
            open ? '[transform:rotateX(12deg)_rotateY(-7deg)_translateY(-6px)_translateZ(14px)]' : '[transform:rotateX(6deg)]',
          )}
        >
          {/* Documentos interiores */}
          <div className="absolute inset-x-3 bottom-3 top-0 [transform-style:preserve-3d]">
            {sheets.map((doc, i) => {
              const lift = open ? -(26 + i * 13) : -6
              return (
                <motion.div
                  key={doc.id ?? doc.name ?? i}
                  className="absolute inset-x-0 top-0 rounded-md border border-lineSoft/45 bg-surface px-2.5 py-2 text-navy shadow-lg"
                  animate={{ y: lift, rotateZ: open ? (i % 2 === 0 ? -1.6 : 1.6) : 0, opacity: open ? 1 : 0.62 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 22, delay: open ? i * 0.055 : 0 }}
                  style={{ transformOrigin: 'bottom center', zIndex: 10 + i }}
                >
                  <div className="flex items-center gap-1.5">
                    <Scroll className="h-3 w-3 shrink-0 text-indigo" />
                    <span className="truncate font-mono text-[9.5px] leading-tight font-semibold">
                      {doc.name}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between font-mono text-[8px] text-indigo/70">
                    <span>{doc.pages} pags</span>
                    <span className="rounded bg-gold px-1 text-goldInk/80 uppercase">
                      {doc.classification?.slice(0, 4)}
                    </span>
                  </div>
                  <div className="mt-1 h-px w-full bg-indigo/20" />
                  <div className="mt-1 flex gap-0.5">
                    {[...Array(4)].map((_, k) => (
                      <span key={k} className="h-0.5 flex-1 rounded bg-indigo/25" />
                    ))}
                  </div>
                </motion.div>
              )
            })}
          </div>

          {/* Tapa trasera + pestana */}
          <div className={cn('absolute inset-0 rounded-lg bg-gradient-to-br', folderFill)} />
          <div
            className={cn(
              'absolute -top-3 left-4 h-5 w-24 rounded-t-md border border-b-0 border-lineSoft/40',
              tabFill,
            )}
          >
            <span className="absolute left-2 top-0.5 font-mono text-[8px] tracking-[0.2em] text-onAccent/80">
              {tabLabel}
            </span>
          </div>

          {/* Cara frontal */}
          <div
            className="absolute inset-x-0 bottom-0 h-[46%] rounded-b-lg border-t border-accent/40 bg-gradient-to-br from-line/85 to-line/60 backdrop-blur-sm transition-transform duration-500 ease-shield [transform-origin:bottom_center]"
            style={{
              transform: open ? 'rotateX(-18deg) translateZ(18px)' : 'rotateX(0deg)',
            }}
          >
            <div className="absolute inset-x-0 bottom-0 h-1.5 rounded-b-lg bg-accent/50" />
          </div>

          {/* Borde luminoso */}
          <div
            className={cn(
              'pointer-events-none absolute inset-0 rounded-lg transition-all duration-500',
              open ? 'shadow-glow ring-1 ring-accent/60' : 'ring-1 ring-line/40',
            )}
          />
        </div>
      </div>

      {/* Slot de contenido / acciones */}
      <div className="relative z-20 -mt-1">{children}</div>

      <p className={cn('mt-2 text-[10px] font-medium transition-colors', accentClass)}>
        {open
          ? 'Desplegando contenido del expediente…'
          : didactic
            ? 'Hover para inspeccionar documentos'
            : 'Clic para inspeccionar documentos'}
      </p>
    </div>
  )
}