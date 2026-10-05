const WEAK_PATTERNS = [
  { re: /^(123456|password|contrasena|qwerty|admin|legalshield|abc123)/i, weight: 34, note: 'Patron predecible en diccionario comun' },
  { re: /(19|20)\d{2}/, weight: 6, note: 'Anio como ancla de contrasena' },
  { re: /(.)\1{3,}/, weight: 14, note: 'Secuencia de caracteres repetidos' },
  { re: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z\d]).{10,}$/, weight: 0, note: 'Complejidad completa' },
]

const KEYWORDS = ['legal', 'shield', 'jurid', 'studio', 'despacho', 'abogad', 'auditor', 'expediente', '2026']

/**
 * Heuristica pedagogica de fortaleza (0-4). No pretende ser zxcvbn:
 * estima la entropia y descuenta penalizaciones por patrones previsibles.
 */
export function scorePassword(value = '') {
  const pass = value
  if (!pass) {
    return { score: 0, entropy: 0, label: 'Vacio', tone: 'muted', hints: ['Introduce una contrasena para evaluar.'] }
  }

  let pool = 0
  if (/[a-z]/.test(pass)) pool += 26
  if (/[A-Z]/.test(pass)) pool += 26
  if (/\d/.test(pass)) pool += 10
  if (/[^a-zA-Z0-9]/.test(pass)) pool += 33

  let entropy = pass.length * Math.log2(pool || 1)
  let penalty = 0
  const hints = []

  for (const pattern of WEAK_PATTERNS) {
    if (pattern.re.test(pass)) {
      if (pattern.note === 'Complejidad completa') continue
      penalty += pattern.weight
      hints.push(pattern.note)
    }
  }

  const lower = pass.toLowerCase()
  for (const key of KEYWORDS) {
    if (lower.includes(key)) {
      penalty += 10
      if (!hints.includes('Termino del dominio predecible (nombre del despacho)')) {
        hints.push('Termino del dominio predecible (nombre del despacho)')
      }
    }
  }

  if (pass.length < 8) {
    penalty += 18
    hints.push('Minimo 12 caracteres: longitud es el factor dominante')
  }
  if (pass.length < 12 && pass.length >= 8) {
    penalty += 6
    hints.push('Anade 4 caracteres mas para superar el umbral normativo')
  }

  entropy = Math.max(0, entropy - penalty)

  const score = entropy >= 78 ? 4 : entropy >= 56 ? 3 : entropy >= 36 ? 2 : entropy >= 18 ? 1 : 0
  const meta = [
    { label: 'Critica', tone: 'danger' },
    { label: 'Debil', tone: 'danger' },
    { label: 'Aceptable', tone: 'pastel' },
    { label: 'Fuerte', tone: 'mint' },
    { label: 'Excelente', tone: 'mint' },
  ][score]

  if (!hints.length) hints.push('Sin patrones predecibles detectados. Cumple la politica 12/4.')

  return {
    score,
    entropy: Math.round(entropy),
    label: meta.label,
    tone: meta.tone,
    hints: hints.slice(0, 3),
  }
}

/** Formato obligatorio de User ID: LEG-AAAA-NNNN */
export const USER_ID_RE = /^LEG-\d{4}-\d{4}$/

export function validateUserId(value = '') {
  const v = value.trim().toUpperCase()
  if (!v) return { valid: false, level: 0, message: 'El User ID es obligatorio.', normalized: v }
  if (!v.startsWith('LEG-')) {
    return { valid: false, level: 0, message: 'Prefijo institucional obligatorio: LEG-', normalized: v }
  }
  const parts = v.split('-')
  if (parts.length !== 3 || parts[1].length !== 4 || parts[2].length !== 4 || !/^\d+$/.test(parts[1] + parts[2])) {
    return { valid: false, level: 1, message: 'Formato esperado: LEG-2026-0001', normalized: v }
  }
  return { valid: true, level: 3, message: 'Identificador conforme al padron del despacho.', normalized: v }
}