import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Gauge, Grid3x3, RotateCcw, Scroll, ShieldAlert, ShieldCheck, Target } from 'lucide-react'
import ClassificationTable from '@/components/matrix/ClassificationTable'
import { Badge, Progress, SectionTitle } from '@/components/ui/primitives'
import { useTheme } from '@/context/ThemeContext'
import { useAppStore } from '@/store/useAppStore'
import { toast } from '@/store/toastStore'
import { cn } from '@/lib/cn'
import { relativePercent } from '@/lib/format'

const SCORE_LABELS = [
  'Inexistente',
  'Inicial',
  'En desarrollo',
  'Definido',
  'Gestionado',
  'Optimizado',
]

const TABS = [
  { id: 'controles', label: 'Autoevaluacion ISO', icon: Gauge },
  { id: 'clasificacion', label: 'Matriz de clasificacion', icon: Scroll },
  { id: 'riesgos', label: 'Mapa de calor', icon: Grid3x3 },
]

/** Banda cromatica del mapa de calor: pastel (bajo) â†’ indigo (alto). */
function heatTone(score) {
  if (score <= 4) return { bg: 'bg-ok/25', border: 'border-ok/70', text: 'text-ok', label: 'Bajo' }
  if (score <= 9) return { bg: 'bg-accent/25', border: 'border-accent/70', text: 'text-accent', label: 'Medio' }
  if (score <= 14) return { bg: 'bg-indigo/35', border: 'border-indigo/80', text: 'text-cream', label: 'Alto' }
  return { bg: 'bg-navy/80', border: 'border-danger/70', text: 'text-cream', label: 'Critico' }
}

function MaturityRing({ value, size = 120, label, tone = 'pastel' }) {
  const { isDark } = useTheme()
  const stroke = 9
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - value / 100)
  /* El anillo debe leerse en ambos temas: verde pastel en oscuro, verde
     profundo en claro (AA sobre blanco). */
  const TONES = {
    pastel: isDark ? '#ade792' : '#1a7a60',
    accent: isDark ? '#6eccaf' : '#4647ae',
    info: isDark ? '#4382df' : '#2e69c7',
  }
  const color = TONES[tone] ?? TONES.accent

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="rgb(var(--ls-border) / 0.35)"
            strokeWidth={stroke}
          />
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
            style={{ filter: `drop-shadow(0 0 6px ${color}66)` }}
          />
          {/* Marcas de los 5 niveles */}
          {[0, 1, 2, 3, 4].map((i) => {
            const angle = (i / 5) * Math.PI * 2 - Math.PI / 2
            const x = size / 2 + Math.cos(angle) * radius
            const y = size / 2 + Math.sin(angle) * radius
            return (
              <circle
                key={i}
                cx={x}
                cy={y}
                r={1.8}
                fill="rgb(var(--ls-text-muted))"
                opacity={0.7}
              />
            )
          })}
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <span className="font-display text-xl font-bold tabular-nums" style={{ color }}>
            {value}%
          </span>
        </div>
      </div>
      <p className="text-center text-[11px] font-medium">{label}</p>
    </div>
  )
}

export default function RiskAssessment() {
  const controls = useAppStore((s) => s.riskControls)
  const risks = useAppStore((s) => s.risks)
  const infoAssets = useAppStore((s) => s.infoAssets)
  const setControlScore = useAppStore((s) => s.setControlScore)
  const setRiskCell = useAppStore((s) => s.setRiskCell)
  const setInfoAssetValue = useAppStore((s) => s.setInfoAssetValue)
  const resetInfoAssets = useAppStore((s) => s.resetInfoAssets)
  const hasPermission = useAppStore((s) => s.hasPermission)

  const canEdit = hasPermission('RISK_ASSESS')
  const [activeRisk, setActiveRisk] = useState(risks[0]?.id ?? null)
  const [tab, setTab] = useState('controles')

  const overall = useMemo(() => {
    if (!controls.length) return 0
    return Math.round((controls.reduce((a, c) => a + c.score, 0) / (controls.length * 5)) * 100)
  }, [controls])

  const domains = useMemo(() => {
    const map = new Map()
    controls.forEach((c) => {
      if (!map.has(c.domain)) map.set(c.domain, [])
      map.get(c.domain).push(c)
    })
    return [...map.entries()].map(([name, list]) => ({
      name,
      value: Math.round((list.reduce((a, c) => a + c.score, 0) / (list.length * 5)) * 100),
      gaps: list.filter((c) => c.score < c.target).length,
    }))
  }, [controls])

  const gaps = controls.filter((c) => c.score < c.target)
  const selected = risks.find((r) => r.id === activeRisk)

  const handleScore = (controlId, score) => {
    if (!canEdit) {
      toast.danger('Cambio denegado', 'RISK_ASSESS no esta habilitado para tu rol')
      return
    }
    setControlScore(controlId, score)
  }

  const moveRisk = (probability, impact) => {
    if (!selected) return
    if (!canEdit) {
      toast.danger('Cambio denegado', 'RISK_ASSESS requerido para modificar la matriz')
      return
    }
    setRiskCell(selected.id, probability, impact)
  }

  const classifyAsset = (assetId, dimension, value) => {
    if (!canEdit) {
      toast.danger('Cambio denegado', 'RISK_ASSESS no esta habilitado para tu rol')
      return
    }
    setInfoAssetValue(assetId, dimension, value)
  }

  return (
    <div className="space-y-6">
      <SectionTitle
        icon={ShieldCheck}
        title="Autoevaluacion ISO/IEC 27001:2022"
        subtitle="Controles del Anexo A puntuados de 0 a 5 Â· cada ajuste genera evidencia de auditoria"
        actions={
          canEdit ? (
            <Badge tone="accent">
              <Target className="h-3 w-3" /> Evaluacion editable
            </Badge>
          ) : (
            <Badge tone="danger">Solo lectura Â· falta RISK_ASSESS</Badge>
          )
        }
      />

      {/* Tabs */}
      <div className="ls-card flex flex-wrap items-center gap-2 p-3">
        {TABS.map((t) => {
          const Icon = t.icon
          const active = tab === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-[12.5px] font-semibold transition-all duration-300',
                active ? 'bg-accent/15 text-accent shadow-glow' : 'text-muted hover:bg-surface2/50 hover:text-ink',
              )}
            >
              <Icon className="h-4 w-4" /> {t.label}
            </button>
          )
        })}
        {tab === 'clasificacion' && (
          <button
            type="button"
            onClick={() => {
              resetInfoAssets()
              toast.info('Matriz restaurada', 'Valores base de clasificacion reaplicados')
            }}
            className="ls-btn-ghost ml-auto text-[11px]"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Restaurar valores
          </button>
        )}
      </div>

      {tab === 'clasificacion' ? (
        <ClassificationTable assets={infoAssets} canEdit={canEdit} onChange={classifyAsset} />
      ) : (
        <>
      {/* Radar de madurez */}
      <section className="ls-card p-6 sm:p-7">
        <div className="grid gap-5 lg:grid-cols-[auto_1fr] lg:items-center">
          <div className="flex justify-center">
            <MaturityRing value={overall} size={148} label="Madurez global" tone="pastel" />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {domains.map((d, i) => (
              <div key={d.name} className="ls-panel flex flex-col items-center gap-2">
                <MaturityRing value={d.value} size={92} label={d.name} tone={['pastel', 'accent', 'info'][i % 3]} />
                {d.gaps > 0 ? (
                  <Badge tone="danger">
                    {d.gaps} brecha(s)
                  </Badge>
                ) : (
                  <Badge tone="pastel">Conforme</Badge>
                )}
              </div>
            ))}
          </div>

          <div className="lg:col-span-2 grid gap-3 sm:grid-cols-3">
            <div className="ls-panel">
              <p className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-muted">
                Controles evaluados
              </p>
              <p className="font-display text-2xl font-bold text-ink">{controls.length}</p>
            </div>
            <div className="ls-panel">
              <p className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-muted">
                Brechas vs objetivo
              </p>
              <p className="font-display text-2xl font-bold text-danger">{gaps.length}</p>
            </div>
            <div className="ls-panel">
              <p className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-muted">
                Treatment-focus
              </p>
              <p className="font-display text-2xl font-bold text-accent">
                {relativePercent(
                  risks.filter((r) => r.probability * r.impact >= 10).length,
                  risks.length || 1,
                )}
                %
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.05fr_1fr]">
        {/* Controles */}
        <section className="ls-card p-6">
          <SectionTitle
            icon={Gauge}
            title="Autoevaluacion de controles"
            subtitle="0 Inexistente Â· 5 Optimizado"
          />
          <div className="space-y-4">
            {controls.map((c) => (
              <div key={c.id}>
                <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-mono text-[10.5px] font-bold text-info">{c.id}</span>
                    <span className="ml-2 text-[12px] font-medium">{c.name}</span>
                    <span className="ml-2 font-mono text-[9.5px] text-muted">{c.domain}</span>
                  </div>
                  <span
                    className={cn(
                      'shrink-0 rounded-md border px-2 py-0.5 font-mono text-[10px]',
                      c.score >= c.target
                        ? 'border-ok/60 bg-ok/12 text-ok'
                        : 'border-danger/50 bg-danger/10 text-danger',
                    )}
                  >
                    {c.score}/5 Â· {SCORE_LABELS[c.score]}
                  </span>
                </div>

                <input
                  type="range"
                  min="0"
                  max="5"
                  step="1"
                  value={c.score}
                  onChange={(e) => handleScore(c.id, Number(e.target.value))}
                  style={{ '--fill': `${(c.score / 5) * 100}%` }}
                  aria-label={`Puntuacion del control ${c.id}`}
                />

                <Progress
                  value={c.score}
                  max={5}
                  tone={c.score >= c.target ? 'pastel' : 'info'}
                  className="mt-1.5 !h-0.5"
                />
              </div>
            ))}
          </div>
        </section>

        {/* Mapa de calor */}
        <section className="ls-card p-6">
          <SectionTitle
            icon={Grid3x3}
            title="Matriz de calor de riesgos"
            subtitle="Probabilidad x Impacto Â· 1 a 5. Seleccione un riesgo y clic en la celda para recolocarlo."
          />

          {selected && (
            <div className="mb-3 rounded-xl border border-accent/40 bg-accent/8 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-[10px] text-info">{selected.id}</p>
                  <p className="text-[12.5px] font-semibold">{selected.name}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge tone="info">P{selected.probability}</Badge>
                  <Badge tone="info">I{selected.impact}</Badge>
                  <Badge
                    tone={
                      selected.probability * selected.impact > 14
                        ? 'danger'
                        : selected.probability * selected.impact >= 10
                          ? 'accent'
                          : 'pastel'
                    }
                  >
                    {heatTone(selected.probability * selected.impact).label}
                  </Badge>
                </div>
              </div>
              <p className="mt-1.5 font-mono text-[10px] text-muted">
                Tratamiento: {selected.treatment} Â· celda actual ({selected.impact},{selected.probability})
              </p>
            </div>
          )}

          <div className="grid grid-cols-[auto_1fr] gap-2">
            <div className="flex flex-col justify-between py-6 pr-1 text-right font-mono text-[9.5px] text-muted">
              {[5, 4, 3, 2, 1].map((p) => (
                <span key={p}>P{p}</span>
              ))}
            </div>

            <div className="space-y-1.5">
              {[5, 4, 3, 2, 1].map((probability) => (
                <div key={probability} className="flex items-center gap-1.5">
                  {[1, 2, 3, 4, 5].map((impact) => {
                    const score = probability * impact
                    const tone = heatTone(score)
                    const here = risks.filter((r) => r.probability === probability && r.impact === impact)
                    return (
                      <button
                        key={impact}
                        type="button"
                        onClick={() => moveRisk(probability, impact)}
                        title={`Probabilidad ${probability} x Impacto ${impact} = ${score} (${tone.label})`}
                        className={cn(
                          'group relative h-11 flex-1 rounded-md border text-center transition-all duration-300 ease-shield',
                          tone.bg,
                          tone.border,
                          'hover:scale-[1.06] hover:shadow-glow',
                        )}
                      >
                        <span className={cn('font-mono text-[9.5px] font-bold', tone.text)}>{score}</span>
                        {here.length > 0 && (
                          <span className="absolute inset-0 grid place-items-center">
                            <span className="rounded-md bg-bg/85 px-1.5 py-0.5 font-mono text-[8.5px] font-bold text-danger ring-1 ring-danger/40">
                              {here.map((r) => r.id).join(' ')}
                            </span>
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              ))}
              <div className="flex justify-between pl-0.5 pt-1 font-mono text-[9.5px] text-muted">
                {[1, 2, 3, 4, 5].map((i) => (
                  <span key={i} className="flex-1 text-center">
                    I{i}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Leyenda */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {[
              { cls: 'bg-ok/40 border-ok', label: 'Bajo 1-4' },
              { cls: 'bg-accent/40 border-accent', label: 'Medio 5-9' },
              { cls: 'bg-indigo/60 border-indigo', label: 'Alto 10-14' },
              { cls: 'bg-navy border-danger', label: 'Critico 15-25' },
            ].map((l) => (
              <span key={l.label} className="flex items-center gap-1.5">
                <span className={cn('h-3 w-5 rounded border', l.cls)} />
                <span className="font-mono text-[10px] text-muted">{l.label}</span>
              </span>
            ))}
          </div>

          <div className="mt-4 space-y-1.5 border-t border-line/40 pt-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">Registro</p>
            {risks.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setActiveRisk(r.id)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors duration-300',
                  activeRisk === r.id ? 'bg-accent/12' : 'hover:bg-surface2/40',
                )}
              >
                <span
                  className={cn(
                    'h-2 w-2 shrink-0 rounded-full',
                    r.probability * r.impact > 14
                      ? 'bg-danger'
                      : r.probability * r.impact >= 10
                        ? 'bg-indigo'
                        : r.probability * r.impact >= 5
                          ? 'bg-accent'
                          : 'bg-ok',
                  )}
                />
                <span className="font-mono text-[10px] text-info">{r.id}</span>
                <span className="min-w-0 flex-1 truncate text-[11.5px]">{r.name}</span>
                <span className="shrink-0 font-mono text-[10px] text-muted">{r.treatment}</span>
              </button>
            ))}
          </div>

          <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-snug text-muted">
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ok" />
            El tratamiento sugerido combina reduccion de probabilidad con mitigacion de impacto; los
            riesgos por encima de 14 exigen plan de accion con responsable y fecha.
          </p>
        </section>
      </div>
        </>
      )}
    </div>
  )
}