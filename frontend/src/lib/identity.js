/**
 * Regla de estandarizacion del User ID (punto 9.1).
 * Espejo del backend (back/utils/identity.js): normaliza el nombre completo a
 * "primer-nombre.primer-apellido" en minusculas y sin acentos, detecta colisiones
 * contra el directorio cargado y propone el sufijo libre (marta.perez1, ...).
 */

/** "Marta Jose Perez" -> "marta.perez" (quita acentos y caracteres especiales). */
export function normalizeToken(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .join('.')
}

/** Preview sin colisiones: primer nombre + primer apellido del nombre completo. */
export function previewUsername(firstName, lastName, used = []) {
  const firstTokens = normalizeToken(firstName).split('.').filter(Boolean)
  const lastTokens = normalizeToken(lastName).split('.').filter(Boolean)
  const first = firstTokens[0] ?? ''
  const last = lastTokens[0] ?? ''
  const base = [first, last].filter(Boolean).join('.')
  if (!base) return ''

  const taken = new Set(used.map((u) => String(u.username ?? u).trim()))
  if (!taken.has(base)) return base
  for (let i = 1; i <= 1000; i += 1) {
    const candidate = `${base}${i}`
    if (!taken.has(candidate)) return candidate
  }
  return base
}

/** Nombres reales formateados para mostrar el usuario activo en saludos. */
const DISPLAY_NAMES = {
  'mariana.solis': 'Mariana Solís',
  'diego.ferrer': 'Diego Ferrer',
  'osi.seguridad': 'Oficial de Seguridad (OSI)',
  'paula.sando': 'Paula Sando',
  'carlos.cliente': 'Carlos Cliente',
}

export function displayNameFor(username) {
  const token = String(username ?? '').trim().toLowerCase()
  // El punto se conserva: las claves de DISPLAY_NAMES son "nombre.apellido".
  const normalized = token.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9. ]/g, '')
  const known = Object.keys(DISPLAY_NAMES).find((key) => key === normalized)
  if (known) return DISPLAY_NAMES[known]
  const parts = token
    .split('.')
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
  const clean = parts.join(' ').replace(/[^A-Za-zÁÉÍÓÚÑ ]/g, '')
  if (!clean) return 'Usuario'
  return clean
}