import { useEffect, useRef } from 'react'
import { rgbaToken, themeToken } from '@/lib/format'

/**
 * Aero Shards (React Bits · simulacion)
 * Lienzo de fragmentos de cristal tipo escudo que derivan con paralaje segun el
 * puntero. Reemplaza un shader WebGL por una version ligera, sin dependencias,
 * que repinta la paleta del tema activo leyendo las variables CSS.
 */
export default function AeroShards({ density = 0.00009, className = '', showConnections = true }) {
  const canvasRef = useRef(null)
  const pointer = useRef({ x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const ctx = canvas.getContext('2d', { alpha: true })
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let width = 0
    let height = 0
    let dpr = 1
    let shards = []
    let raf = 0
    const tokens = {
      accent: themeToken('--ls-accent', '110 204 175'),
      info: themeToken('--ls-info', '67 130 223'),
      border: themeToken('--ls-border', '70 71 174'),
      surface: themeToken('--ls-surface', '52 77 103'),
      text: themeToken('--ls-text', '243 236 176'),
    }

    const spawn = () => {
      const count = Math.max(14, Math.round((width * height) / 26000))
      shards = Array.from({ length: Math.min(count, 46) }, (_, i) => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.24,
        vy: -0.12 - Math.random() * 0.34,
        size: 12 + Math.random() * 46,
        spin: (Math.random() - 0.5) * 0.006,
        rot: Math.random() * Math.PI * 2,
        depth: 0.35 + Math.random() * 0.9,
        hue: i % 3,
        phase: Math.random() * Math.PI * 2,
      }))
    }

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      const rect = canvas.getBoundingClientRect()
      width = Math.max(1, rect.width)
      height = Math.max(1, rect.height)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      spawn()
    }

    const drawShard = (s) => {
      const sides = 3 + (s.size % 4 > 1 ? 1 : 0)
      ctx.beginPath()
      for (let i = 0; i < sides; i += 1) {
        const angle = s.rot + (i / sides) * Math.PI * 2
        const radius = s.size * (i % 2 === 0 ? 1 : 0.62)
        const x = s.x + Math.cos(angle) * radius
        const y = s.y + Math.sin(angle) * radius
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.closePath()

      const tone = s.hue === 0 ? tokens.accent : s.hue === 1 ? tokens.info : tokens.border
      const alpha = 0.05 + s.depth * 0.11

      const grad = ctx.createLinearGradient(s.x - s.size, s.y - s.size, s.x + s.size, s.y + s.size)
      grad.addColorStop(0, rgbaToken(tone, alpha + 0.05))
      grad.addColorStop(0.55, rgbaToken(tokens.surface, alpha))
      grad.addColorStop(1, rgbaToken(tokens.info, alpha * 0.4))
      ctx.fillStyle = grad
      ctx.fill()

      ctx.lineWidth = 1
      ctx.strokeStyle = rgbaToken(tone, 0.1 + s.depth * 0.24)
      ctx.stroke()
    }

    const frame = () => {
      ctx.clearRect(0, 0, width, height)

      pointer.current.x += (pointer.current.tx - pointer.current.x) * 0.06
      pointer.current.y += (pointer.current.ty - pointer.current.y) * 0.06
      const px = (pointer.current.x - 0.5) * 90
      const py = (pointer.current.y - 0.5) * 70

      for (const s of shards) {
        if (!reduced) {
          s.x += s.vx + Math.sin(s.phase + Date.now() / 2600) * 0.12
          s.y += s.vy
          s.rot += s.spin
        }
        if (s.y + s.size < -40) {
          s.y = height + s.size
          s.x = Math.random() * width
        }
        if (s.x < -60) s.x = width + 60
        if (s.x > width + 60) s.x = -60
        drawShard({
          ...s,
          x: s.x + px * s.depth * 0.5,
          y: s.y + py * s.depth * 0.5,
        })
      }

      if (showConnections) {
        ctx.lineWidth = 0.6
        for (let i = 0; i < shards.length; i += 1) {
          const a = shards[i]
          for (let j = i + 1; j < shards.length; j += 1) {
            const b = shards[j]
            const dx = a.x - b.x
            const dy = a.y - b.y
            const distSq = dx * dx + dy * dy
            if (distSq < 21000) {
              ctx.strokeStyle = rgbaToken(tokens.accent, 0.12 * (1 - distSq / 21000))
              ctx.beginPath()
              ctx.moveTo(a.x + px * a.depth * 0.5, a.y + py * a.depth * 0.5)
              ctx.lineTo(b.x + px * b.depth * 0.5, b.y + py * b.depth * 0.5)
              ctx.stroke()
            }
          }
        }
      }

      if (!reduced) raf = requestAnimationFrame(frame)
    }

    const onPointerMove = (event) => {
      const rect = canvas.getBoundingClientRect()
      pointer.current.tx = (event.clientX - rect.left) / rect.width
      pointer.current.ty = (event.clientY - rect.top) / rect.height
    }

    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    resize()
    frame()

    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      window.removeEventListener('pointermove', onPointerMove)
    }
  }, [density, showConnections])

  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden="true">
      <canvas ref={canvasRef} className="h-full w-full" />
      <div className="ls-noise absolute inset-0 opacity-[0.05] mix-blend-overlay" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-bg/70" />
    </div>
  )
}