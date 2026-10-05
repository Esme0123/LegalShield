import { motion } from 'framer-motion'
import { AlertTriangle, KeyRound, Scroll, ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/ui/primitives'
import { DIMENSIONS, VALUE_LABELS, classify, criticalAssets } from '@/lib/classification'
import { cn } from '@/lib/cn'

const LEVEL_TONE = {
  danger: { chip: 'border-danger/60 bg-danger/12 text-danger', bar: 'bg-danger' },
  warn: { chip: 'border-warn/60 bg-gold/25 text-warn', bar: 'bg-warn' },
  info: { chip: 'border-info/60 bg-info/12 text-info', bar: 'bg-info' },
  ok: { chip: 'border-ok/60 bg-ok/12 text-ok', bar: 'bg-ok' },
}

/** Selector compacto de una dimension (valor 1..3). */
function ValueSelect({ value, onChange, disabled, label }) {
  return (
    <div className="flex items-center justify-center gap-1" role="group" aria-label={label}>
      {[1, 2, 3].map((v) => (
        <button
          key={v}
          type="button"
          disabled={disabled}
          onClick={() => onChange(v)}
          aria-pressed={value === v}
          title={`${VALUE_LABELS[v]} (${v}/3)`}
          className={cn(
            'h-7 w-7 rounded-md border font-mono text-[11px] font-bold transition-all duration-200',
            value === v
              ? 'border-accent/70 bg-accent/20 text-accent'
              : 'border-line/35 text-muted/60 hover:border-accent/50 hover:text-ink',
            disabled && 'cursor-not-allowed opacity-60',
          )}
        >
          {v}
        </button>
      ))}
    </div>
  )
}

/**
 * Resumen · Matriz de clasificacion de informacion (SIS-321).
 * Cada activo se valora en confidencialidad, integridad y disponibilidad (1 a 3),
 * se convierte a porcentaje ponderado y el total define el nivel automatico.
 */
export default function ClassificationTable({ assets, onChange, canEdit }) {
  const critical = criticalAssets(assets)
  const average =
    assets.length > 0
      ? Math.round((assets.reduce((acc, a) => acc + classify(a).total, 0) / assets.length) * 10) / 10
      : 0

  return (
    <div className="space-y-5">
      <div className="ls-card p-6 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="ls-heading text-lg">Criterio de clasificacion</h3>
            <p className="mt-1 max-w-2xl text-[12px] leading-snug text-muted">
              Cada dimension se valora de 1 (Publica) a 3 (Critica) y se convierte a porcentaje. La
              confidencialidad pesa 50 % porque protege el secreto profesional; la integridad y la
              disponibilidad pesan 25 % cada una. El total acumulado define el nivel del activo.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={critical.length ? 'danger' : 'ok'}>
              <AlertTriangle className="h-3 w-3" /> {critical.length} activo(s) critico(s)
            </Badge>
            <Badge tone="info">
              <Scroll className="h-3 w-3" /> promedio {average}%
            </Badge>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          {DIMENSIONS.map((dim) => (
            <div key={dim.id} className="ls-panel min-w-[12rem] flex-1">
              <p className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-muted">{dim.short}</p>
              <p className="mt-1 text-[12.5px] font-semibold">{dim.label}</p>
              <p className="mt-0.5 font-mono text-[11px] text-accent">peso {dim.weight}%</p>
            </div>
          ))}
        </div>
      </div>

      <div className="ls-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="ls-table min-w-[980px]">
            <thead>
              <tr>
                <th className="!w-[280px]">Activo de informacion</th>
                {DIMENSIONS.map((dim) => (
                  <th key={dim.id} className="text-center">
                    <span className="block">{dim.label}</span>
                    <span className="font-mono text-[9px] normal-case tracking-normal">
                      valor 1-3 · peso {dim.weight}%
                    </span>
                  </th>
                ))}
                <th className="text-center">Clasificacion total</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((asset) => {
                const { parts, total, level } = classify(asset)
                const tone = LEVEL_TONE[level.tone]
                return (
                  <tr key={asset.id}>
                    <td>
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-accent/35 bg-accent/10 text-accent">
                          {asset.name.includes('Llave') || asset.name.includes('cifrado') ? (
                            <KeyRound className="h-4 w-4" />
                          ) : asset.name.includes('Expediente') ? (
                            <Scroll className="h-4 w-4" />
                          ) : (
                            <ShieldCheck className="h-4 w-4" />
                          )}
                        </span>
                        <div className="min-w-0">
                          <p className="text-[12.5px] font-semibold leading-snug">{asset.name}</p>
                          <p className="mt-0.5 font-mono text-[9.5px] uppercase tracking-wider text-muted">
                            {asset.id} · {asset.owner}
                          </p>
                        </div>
                      </div>
                    </td>

                    {DIMENSIONS.map((dim) => {
                      const part = parts.find((p) => p.id === dim.id)
                      return (
                        <td key={dim.id} className="text-center">
                          <ValueSelect
                            label={`${dim.label} de ${asset.name}`}
                            value={asset[dim.id]}
                            disabled={!canEdit}
                            onChange={(v) => onChange(asset.id, dim.id, v)}
                          />
                          <p className="mt-1 font-mono text-[10px] text-muted">{part.percent}%</p>
                        </td>
                      )
                    })}

                    <td className="text-center">
                      <div className="flex flex-col items-center gap-1.5">
                        <motion.p
                          key={total}
                          initial={{ opacity: 0.4, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.25 }}
                          className="font-display text-lg font-bold tabular-nums text-ink"
                        >
                          {total}%
                        </motion.p>
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-surface2/70">
                          <motion.div
                            className={cn('h-full rounded-full', tone.bar)}
                            initial={{ width: 0 }}
                            animate={{ width: `${total}%` }}
                            transition={{ type: 'spring', stiffness: 130, damping: 22 }}
                          />
                        </div>
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full border px-2.5 py-0.5 font-mono text-[9.5px] font-bold uppercase tracking-wider',
                            tone.chip,
                          )}
                        >
                          {level.label}
                        </span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-4 border-t border-line/25 px-6 py-4">
          <span className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-muted">Umbrales</span>
          {[
            { cls: 'bg-danger', label: 'Critico o confidencial 75-100%' },
            { cls: 'bg-warn', label: 'Alto 50-74%' },
            { cls: 'bg-info', label: 'Medio 25-49%' },
            { cls: 'bg-ok', label: 'Bajo 0-24%' },
          ].map((l) => (
            <span key={l.label} className="flex items-center gap-1.5">
              <span className={cn('h-2.5 w-5 rounded-full', l.cls)} />
              <span className="font-mono text-[10px] text-muted">{l.label}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}