/**
 * Matriz de clasificacion de informacion (SIS-321)
 *
 * Cada dimension se valora de 1 a 3 y se convierte a porcentaje sobre el peso
 * que le corresponde. El total es la suma ponderada y define el nivel.
 *
 *   CONFI  peso 50 %   INTEGRIDAD peso 25 %   DISPONIBILIDAD peso 25 %
 *
 * La ponderacion sigue el criterio habitual de la norma: la confidencialidad
 * domina porque protege el secreto profesional y el deber de reserva.
 */

export const DIMENSIONS = [
  { id: 'confidentiality', label: 'Confidencialidad', short: 'CONFI', weight: 50 },
  { id: 'integrity', label: 'Integridad', short: 'INTEG', weight: 25 },
  { id: 'availability', label: 'Disponibilidad', short: 'DISPO', weight: 25 },
]

/** Valor 1..3 -> porcentaje sobre el 100 % de la dimension. */
export const dimensionPercent = (value) => {
  const v = Math.min(3, Math.max(1, Number(value) || 1))
  return Math.round((v / 3) * 1000) / 10
}

export const VALUE_LABELS = {
  1: 'Publica',
  2: 'Reservada',
  3: 'Critica',
}

/** Nivel automatico a partir del total ponderado. */
export function classificationLevel(total) {
  if (total >= 75) {
    return { id: 'critico', label: 'Critico o confidencial', tone: 'danger' }
  }
  if (total >= 50) return { id: 'alto', label: 'Alto', tone: 'warn' }
  if (total >= 25) return { id: 'medio', label: 'Medio', tone: 'info' }
  return { id: 'bajo', label: 'Bajo', tone: 'ok' }
}

/** Calcula el resumen completo de un activo de informacion. */
export function classify(asset) {
  const parts = DIMENSIONS.map((dim) => {
    const percent = dimensionPercent(asset[dim.id])
    return { ...dim, percent, weighted: Math.round(((percent * dim.weight) / 100) * 10) / 10 }
  })
  const total = Math.round(parts.reduce((acc, p) => acc + p.weighted, 0) * 10) / 10
  return { parts, total, level: classificationLevel(total) }
}

/** Activos que superan el umbral critico (>= 75 %). */
export function criticalAssets(assets) {
  return assets.filter((a) => classify(a).total >= 75)
}