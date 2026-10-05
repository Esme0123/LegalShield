export const pad = (value, size = 2) => String(value).padStart(size, '0')

export function formatDateTime(iso) {
  const d = new Date(iso)
  return {
    date: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,
    full: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(
      d.getMinutes(),
    )}:${pad(d.getSeconds())}`,
  }
}

export function timeAgo(iso, now = Date.now()) {
  const diff = Math.max(0, now - new Date(iso).getTime())
  const s = Math.floor(diff / 1000)
  if (s < 60) return `hace ${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `hace ${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `hace ${h}h`
  return `hace ${Math.floor(h / 24)}d`
}

export function relativePercent(value, total) {
  if (!total) return 0
  return Math.round((value / total) * 100)
}

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

/** Marca de tiempo ISO actual: la unidad de tiempo de toda la bitacora. */
export const nowIso = () => new Date().toISOString()

/** Alterna un valor dentro de una lista devolviendo una nueva (sin mutar). */
export function toggleInList(list, value) {
  const items = Array.isArray(list) ? list : []
  return items.includes(value) ? items.filter((item) => item !== value) : [...items, value]
}

export function cryptoId(prefix = 'id') {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase()
  return `${prefix}-${rand}`
}

export const clampPercent = (n) => `${clamp(n, 0, 100)}%`

/** Lee un token de color del tema activo como tripleta "r g b". */
export function themeToken(name, fallback = '110 204 175') {
  if (typeof document === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

export function hexToRgbString(hex) {
  const clean = hex.replace('#', '')
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean
  const int = parseInt(full, 16)
  return `${(int >> 16) & 255} ${(int >> 8) & 255} ${int & 255}`
}

/**
 * Compone un color con alfa a partir de un token "R G B" del tema.
 * Usa la sintaxis moderna `rgb(R G B / A)` (el canvas no acepta comas con
 * separacion por espacios).
 */
export function rgbaToken(token, alpha = 1) {
  const parts = String(token).trim().split(/\s+/)
  if (parts.length !== 3) return `rgba(${token}, ${alpha})`
  return `rgb(${parts[0]} ${parts[1]} ${parts[2]} / ${Math.min(1, Math.max(0, alpha))})`
}