import { useEffect, useId, useRef, useState } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { cn } from '@/lib/cn'

/**
 * Paper Crumple (React Bits · simulacion)
 * Al archivar/eliminar un expediente el documento se arruga de verdad: un filtro
 * SVG (feTurbulence + feDisplacementMap) aumenta su deformacion mientras la
 * ficha se comprime y gira, hasta desaparecer de la vista.
 *
 * Con el Modo Didactico apagado la ficha se retira en seco: el filtro, las
 * chispas y el giro se omiten para que el archivado no bloquee la vista.
 */
export default function PaperCrumple({
  crumpled = false,
  onComplete,
  duration = 1150,
  className = '',
  children,
}) {
  const didactic = useAppStore((s) => s.didactic)
  // React 19 devuelve ids con caracteres no-FILENAME-safe (guillemets, dos puntos)
  const filterId = `crumple${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const dispRef = useRef(null)
  const turbRef = useRef(null)
  const wrapRef = useRef(null)
  const completeRef = useRef(onComplete)
  const [sparks, setSparks] = useState([])

  completeRef.current = onComplete

  useEffect(() => {
    if (!crumpled) {
      if (dispRef.current) dispRef.current.setAttribute('scale', '0')
      const wrap = wrapRef.current
      if (wrap) {
        wrap.style.transform = ''
        wrap.style.opacity = ''
        wrap.style.filter = ''
      }
      setSparks([])
      return undefined
    }

    // Modo sutil: la ficha se desvanece sin deformacion ni particulas.
    if (!didactic) {
      const wrap = wrapRef.current
      if (wrap) {
        wrap.style.opacity = '0'
        wrap.style.transform = 'scale(0.98)'
        wrap.style.filter = ''
      }
      setSparks([])
      const timer = setTimeout(() => completeRef.current?.(), 180)
      return () => clearTimeout(timer)
    }

    const start = performance.now()
    let raf = 0
    let fired = false
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const tick = (t) => {
      const p = Math.min(1, (t - start) / duration)
      const eased = 1 - Math.pow(1 - p, 3)

      // Deformacion progresiva del papel
      dispRef.current?.setAttribute('scale', String(Math.round(eased * 46)))
      const seed = turbRef.current
      if (seed) seed.setAttribute('seed', String(Math.round(eased * 7)))

      const wrap = wrapRef.current
      if (wrap) {
        const squash = eased * 26
        wrap.style.transform = `perspective(900px) rotate(${eased * -9}deg) rotateZ(${eased * 5}deg) scale(${
          1 - squash / 200
        }) translateY(${eased * 14}px)`
        wrap.style.opacity = String(Math.max(0, 1 - Math.pow(eased, 2.4)))
        wrap.style.filter = `contrast(${1 + eased * 0.7})`
      }

      if (!fired && p > 0.72) {
        fired = true
        const rect = wrapRef.current?.getBoundingClientRect()
        if (rect) {
          setSparks(
            Array.from({ length: 10 }, (_, i) => ({
              id: i,
              x: rect.left + rect.width * (0.25 + Math.random() * 0.5),
              y: rect.top + rect.height * (0.35 + Math.random() * 0.35),
              dx: (Math.random() - 0.5) * 90,
              dy: -20 - Math.random() * 70,
            })),
          )
        }
      }

      if (p < 1) raf = requestAnimationFrame(tick)
      else {
        setSparks([])
        completeRef.current?.()
      }
    }

    raf = requestAnimationFrame(tick)
    if (reduce) {
      const t = setTimeout(() => completeRef.current?.(), 120)
      return () => {
        clearTimeout(t)
        cancelAnimationFrame(raf)
      }
    }
    return () => cancelAnimationFrame(raf)
  }, [crumpled, duration, didactic])

  return (
    <>
      <div ref={wrapRef} className={cn('origin-center will-change-transform', className)}>
        <div style={{ filter: crumpled && didactic ? `url(#${filterId})` : undefined }}>
          {children}
        </div>
      </div>

      <svg aria-hidden="true" className="pointer-events-none absolute h-0 w-0 overflow-hidden">
        <defs>
          <filter id={filterId} x="-25%" y="-25%" width="150%" height="150%" colorInterpolationFilters="sRGB">
            <feTurbulence ref={turbRef} type="fractalNoise" baseFrequency="0.024" numOctaves="4" seed="0" result="noise">
              <animate
                attributeName="baseFrequency"
                dur="0.4s"
                values="0.024;0.055;0.024"
                repeatCount="indefinite"
              />
            </feTurbulence>
            <feDisplacementMap
              ref={dispRef}
              in="SourceGraphic"
              in2="noise"
              scale="0"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </defs>
      </svg>

      {sparks.length > 0 &&
        sparks.map((s) => (
          <span
            key={s.id}
            className="pointer-events-none fixed z-[70] h-1.5 w-1.5 rotate-45 rounded-[2px] bg-ok shadow-[0_0_12px_2px] shadow-ok/60"
            style={{
              left: s.x,
              top: s.y,
              animation: `crumple-spark 700ms ease-out forwards`,
              '--dx': `${s.dx}px`,
              '--dy': `${s.dy}px`,
            }}
          />
        ))}
    </>
  )
}