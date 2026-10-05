import { useEffect, useRef } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { rgbaToken, themeToken } from '@/lib/format'

/**
 * Glow Cursor (React Bits · simulacion)
 * Cursor con estela de luz usado como "linterna de inspeccion forense".
 * Se monta solo en la vista de auditoria; el contenedor oculta el cursor
 * nativo para que la estela sea el punto de foco real.
 *
 * Modo Didactico apagado: la estela se acorta y se apaga la etiqueta
 * `data-inspect`, dejando un halo tenue que no tape la tabla de auditoria.
 */
export default function GlowCursor({ color = '--ls-accent', trail = 16 }) {
  const canvasRef = useRef(null)
  const didactic = useAppStore((s) => s.didactic)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const ctx = canvas.getContext('2d')
    if (!ctx) return undefined

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const rgb = themeToken(color, '110 204 175')
    // Sin modo didactico la estela es corta y el halo discreto.
    const trailLength = didactic ? trail : Math.max(4, Math.round(trail / 3))
    const haloScale = didactic ? 1 : 0.45
    const showLabels = didactic

    const pointer = { x: -200, y: -200, px: -200, py: -200 }
    const points = Array.from({ length: trailLength }, () => ({ x: -200, y: -200 }))
    let width = 0
    let height = 0
    let dpr = 1
    let raf = 0
    let visible = false
    let inspected = null

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      const rect = canvas.getBoundingClientRect()
      width = Math.max(1, rect.width)
      height = Math.max(1, rect.height)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const onMove = (event) => {
      const rect = canvas.getBoundingClientRect()
      pointer.x = event.clientX - rect.left
      pointer.y = event.clientY - rect.top
      visible = true
      const target = event.target.closest?.('[data-inspect]')
      inspected = target ? target.getAttribute('data-inspect') : null
    }

    const onLeave = () => {
      visible = false
    }

    const draw = () => {
      ctx.clearRect(0, 0, width, height)
      pointer.px += (pointer.x - pointer.px) * 0.22
      pointer.py += (pointer.y - pointer.py) * 0.22

      points.unshift({ x: pointer.px, y: pointer.py })
      if (points.length > trailLength) points.pop()

      if (visible) {
        // Estela: mismo punto repetido con radio decreciente.
        points.forEach((p, i) => {
          const t = 1 - i / points.length
          ctx.beginPath()
          ctx.arc(p.x, p.y, (2 + t * 26) * haloScale, 0, Math.PI * 2)
          ctx.fillStyle = rgbaToken(rgb, 0.03 + t * 0.16 * haloScale)
          ctx.fill()
        })

        ctx.beginPath()
        ctx.arc(pointer.px, pointer.py, (inspected ? 15 : 9) * haloScale, 0, Math.PI * 2)
        ctx.strokeStyle = rgbaToken(rgb, 0.9)
        ctx.lineWidth = 1.4
        ctx.stroke()

        ctx.beginPath()
        ctx.arc(pointer.px, pointer.py, 3, 0, Math.PI * 2)
        ctx.fillStyle = rgbaToken(rgb, 1)
        ctx.fill()

        if (inspected && showLabels) {
          ctx.font = '600 11px ui-monospace, monospace'
          ctx.fillStyle = rgbaToken(rgb, 0.95)
          ctx.fillText(inspected, pointer.px + 20, pointer.py - 12)
          ctx.strokeStyle = rgbaToken(rgb, 0.5)
          ctx.strokeRect(pointer.px + 14, pointer.py - 28, ctx.measureText(inspected).width + 14, 22)
        }
      }

      if (!reduced) raf = requestAnimationFrame(draw)
    }

    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    window.addEventListener('pointermove', onMove, { passive: true })
    document.addEventListener('pointerleave', onLeave)
    resize()
    draw()

    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      window.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerleave', onLeave)
    }
  }, [color, trail, didactic])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[60] hidden md:block"
    />
  )
}