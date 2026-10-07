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
  const last = lastTokens[lastTokens.length - 1] ?? ''
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