import { motion } from 'framer-motion'
import { cn } from '@/lib/cn'

const RISK_TONE = {
  baja: 'border-pastel/60 bg-pastel/12 text-pastel',
  media: 'border-info/60 bg-info/12 text-info',
  alta: 'border-accent/60 bg-accent/12 text-accent',
  critico: 'border-danger/60 bg-danger/12 text-danger',
}

export function Badge({ tone = 'neutral', children, className = '', pulse = false }) {
  const map = {
    neutral: 'border-line/50 bg-surface2/40 text-muted',
    mint: RISK_TONE.alta,
    pastel: RISK_TONE.baja,
    accent: 'border-accent/60 bg-accent/12 text-accent',
    info: 'border-info/60 bg-info/12 text-info',
    danger: 'border-danger/60 bg-danger/12 text-danger',
    ice: 'border-lineSoft/50 bg-lineSoft/10 text-ice',
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider transition-colors duration-300',
        map[tone] ?? map.neutral,
        className,
      )}
    >
      {pulse && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-current opacity-70" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
        </span>
      )}
      {children}
    </span>
  )
}

export function RiskBadge({ risk }) {
  return <Badge tone={risk === 'critico' ? 'danger' : risk === 'alta' ? 'accent' : risk === 'media' ? 'info' : 'pastel'}>{risk}</Badge>
}

export function SeverityDot({ severity }) {
  const colors = { info: 'bg-info', warn: 'bg-accent', critico: 'bg-danger', ok: 'bg-pastel' }
  return <span className={cn('inline-block h-2 w-2 shrink-0 rounded-full', colors[severity] ?? colors.info)} />
}

export function Progress({ value, max = 100, tone = 'accent', className = '' }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  const tones = {
    accent: 'bg-gradient-to-r from-accent to-pastel',
    info: 'bg-gradient-to-r from-info to-accent',
    pastel: 'bg-pastel',
  }
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-surface2/60', className)}>
      <motion.div
        className={cn('h-full rounded-full', tones[tone])}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ type: 'spring', stiffness: 120, damping: 20 }}
      />
    </div>
  )
}

export function StatCard({ icon: Icon, label, value, delta, tone = 'accent', foot }) {
  const glows = {
    accent: 'text-accent bg-accent/10 border-accent/40',
    pastel: 'text-pastel bg-pastel/10 border-pastel/40',
    info: 'text-info bg-info/10 border-info/40',
    danger: 'text-danger bg-danger/10 border-danger/40',
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="ls-card-hover group relative overflow-hidden p-4"
    >
      <div className="absolute -right-8 -top-10 h-24 w-24 rounded-full bg-accent/10 blur-2xl transition-opacity duration-500 group-hover:opacity-100 opacity-0" />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-muted">{label}</p>
          <p className="mt-1.5 font-display text-3xl font-bold tabular-nums text-ink">{value}</p>
          {delta ? <p className="mt-0.5 font-mono text-[11px] text-muted">{delta}</p> : null}
        </div>
        <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl border', glows[tone])}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      {foot ? <div className="mt-3">{foot}</div> : null}
    </motion.div>
  )
}

export function SectionTitle({ icon: Icon, title, subtitle, actions }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="flex items-center gap-2.5">
        {Icon ? (
          <span className="grid h-8 w-8 place-items-center rounded-lg border border-accent/40 bg-accent/10 text-accent">
            <Icon className="h-4 w-4" />
          </span>
        ) : null}
        <div>
          <h2 className="ls-heading text-lg">{title}</h2>
          {subtitle ? <p className="text-[11.5px] text-muted">{subtitle}</p> : null}
        </div>
      </div>
      {actions}
    </div>
  )
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="grid place-items-center gap-2 rounded-xl border border-dashed border-line/50 p-10 text-center">
      {Icon ? <Icon className="h-7 w-7 text-muted/70" /> : null}
      <p className="font-display text-sm font-semibold text-ink">{title}</p>
      {description ? <p className="max-w-sm text-[12px] text-muted">{description}</p> : null}
      {action}
    </div>
  )
}