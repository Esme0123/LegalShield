import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Activity,
  ArrowRight,
  FileStack,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Users2,
} from 'lucide-react'
import AeroShards from '@/components/reactbits/AeroShards'
import FolderFloat from '@/components/reactbits/FolderFloat'
import { Badge, Progress, RiskBadge, SectionTitle, StatCard } from '@/components/ui/primitives'
import { useAppStore } from '@/store/useAppStore'
import { ROLES } from '@/data/seed'
import { timeAgo, relativePercent } from '@/lib/format'
import { cn } from '@/lib/cn'

function maturityScore(controls) {
  if (!controls.length) return 0
  const total = controls.reduce((acc, c) => acc + c.score, 0)
  return Math.round((total / (controls.length * 5)) * 100)
}

export default function Dashboard() {
  const navigate = useNavigate()
  const cases = useAppStore((s) => s.cases)
  const logs = useAppStore((s) => s.logs)
  const riskControls = useAppStore((s) => s.riskControls)
  const rbac = useAppStore((s) => s.rbac)
  const session = useAppStore((s) => s.session)

  const blocked = useMemo(() => logs.filter((l) => l.type.includes('INTRUSION') || l.type === 'LOGIN_LOCKED').length, [logs])
  const critical = useMemo(() => logs.filter((l) => l.severity === 'critico').length, [logs])
  const maturity = maturityScore(riskControls)
  const granted = Object.values(rbac).reduce((acc, list) => acc + list.length, 0)
  const totalPossible = Object.keys(rbac).length * 12
  const role = ROLES.find((r) => r.id === session?.role)

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl border border-line/60 bg-surface/60 p-5 shadow-card backdrop-blur-md sm:p-7">
        <AeroShards density={0.00016} className="opacity-60" />
        <div className="ls-grid-overlay" />
        <div className="relative grid gap-6 lg:grid-cols-[1.35fr_1fr] lg:items-center">
          <div>
            <Badge tone="pastel" pulse>
              <Sparkles className="h-3 w-3" /> Escudo operativo desplegado
            </Badge>
            <h2 className="mt-3 font-display text-2xl font-bold leading-tight tracking-tight text-balance sm:text-3xl">
              Bienvenido, {session?.name?.split(' ')[0] ?? 'Colegio'}. Su posicio de defensa esta{' '}
              <span className="text-accent">consolidada</span>.
            </h2>
            <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-muted">
              Sesion <span className="font-mono text-info">{session?.userId}</span> · rol{' '}
              <span className="text-accent">{role?.label}</span>. Matriz de separacion de funciones al{' '}
              {relativePercent(granted, totalPossible)}% de cobertura minima y{' '}
              <span className="text-danger">{critical} eventos criticos</span> en la bitacora del dia.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link to="/cases" className="ls-btn-primary">
                <FileStack className="h-4 w-4" /> Revisar expedientes
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
              <Link to="/audit" className="ls-btn-secondary">
                <Activity className="h-4 w-4" /> Ver flujo forense
              </Link>
            </div>
          </div>

          <div className="ls-panel">
            <div className="flex items-center justify-between">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
                Madurez ISO 27001
              </p>
              <span className="font-display text-2xl font-bold text-pastel">{maturity}%</span>
            </div>
            <Progress value={maturity} tone="pastel" className="mt-3" />
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              {[
                { k: 'Criticos', v: critical, cls: 'text-danger' },
                { k: 'Bloqueos', v: blocked, cls: 'text-accent' },
                { k: 'Controles', v: riskControls.length, cls: 'text-info' },
              ].map((s) => (
                <div key={s.k} className="rounded-lg border border-line/40 bg-bg/30 py-2">
                  <p className={cn('font-display text-lg font-bold', s.cls)}>{s.v}</p>
                  <p className="font-mono text-[9.5px] uppercase tracking-wider text-muted">{s.k}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Metricas */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={FileStack}
          label="Casos activos"
          value={cases.length}
          delta={`${cases.filter((c) => c.risk === 'critico').length} en riesgo critico`}
          tone="accent"
          foot={<Progress value={relativePercent(cases.filter((c) => c.progress > 60).length, cases.length || 1)} />}
        />
        <StatCard
          icon={ShieldAlert}
          label="Intrusiones bloqueadas"
          value={blocked}
          delta="Reglas WAF + rate-limit"
          tone="danger"
          foot={<Progress value={Math.min(100, blocked * 18)} tone="pastel" />}
        />
        <StatCard
          icon={ShieldCheck}
          label="Madurez ISO 27001"
          value={`${maturity}%`}
          delta={`${riskControls.filter((c) => c.score < c.target).length} controles bajo objetivo`}
          tone="pastel"
          foot={<Progress value={maturity} tone="pastel" />}
        />
        <StatCard
          icon={Users2}
          label="Permisos concedidos"
          value={granted}
          delta={`de ${totalPossible} pares rol/permiso`}
          tone="info"
          foot={<Progress value={relativePercent(granted, totalPossible)} tone="info" />}
        />
      </section>

      {/* Carpetas */}
      <section>
        <SectionTitle
          icon={FileStack}
          title="Vista previa de expedientes"
          subtitle="Folder Float · pase el cursor para desplegar la prueba documental"
          actions={
            <Link to="/cases" className="ls-btn-ghost text-xs">
              Ver todos <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          }
        />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {cases.slice(0, 6).map((c, i) => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: i * 0.05 }}
              className="ls-card p-3"
            >
              <FolderFloat
                docs={c.docs}
                tabLabel={c.id.slice(0, 13)}
                className="cursor-pointer"
                onTap={() => navigate('/cases')}
              >
                <div className="rounded-xl border border-line/50 bg-bg/40 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="line-clamp-1 text-[12.5px] font-semibold">{c.title}</p>
                    <RiskBadge risk={c.risk} />
                  </div>
                  <p className="mt-1 truncate font-mono text-[10px] text-muted">
                    {c.court} · {c.matter}
                  </p>
                  <div className="mt-2.5 flex items-center gap-2">
                    <Badge tone="info">{c.stage}</Badge>
                    <span className="font-mono text-[10px] text-muted">{c.progress}%</span>
                  </div>
                  <Progress value={c.progress} className="mt-1.5" />
                </div>
              </FolderFloat>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Actividad reciente */}
      <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="ls-card p-4">
          <SectionTitle
            icon={Activity}
            title="Actividad reciente"
            subtitle="Ultimos eventos registrados en la bitacora forense"
            actions={
              <Link to="/audit" className="ls-btn-ghost text-xs">
                Logs completos <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            }
          />
          <ul className="divide-y divide-line/25">
            {logs.slice(0, 6).map((l) => (
              <li key={l.id} className="flex items-start gap-3 py-2.5">
                <span
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                    l.severity === 'critico' ? 'bg-danger' : l.severity === 'warn' ? 'bg-accent' : 'bg-info'
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2">
                    <span className="font-mono text-[10.5px] font-bold text-info">{l.type}</span>
                    <span className="font-mono text-[9.5px] text-muted">{timeAgo(l.ts)}</span>
                  </p>
                  <p className="text-[12px] leading-snug text-ink/90">{l.message}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="ls-card p-4">
          <SectionTitle icon={Users2} title="Cobertura por rol" subtitle="Permisos activos tras el ultimo reajuste" />
          <div className="space-y-3">
            {ROLES.map((r) => (
              <div key={r.id}>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[12px] font-medium">{r.label}</span>
                  <span className="font-mono text-[10px] text-muted">{(rbac[r.id] ?? []).length}/12</span>
                </div>
                <Progress value={rbac[r.id]?.length ?? 0} max={12} tone={r.id === 'socio' ? 'pastel' : 'accent'} />
              </div>
            ))}
          </div>
          <Link to="/roles" className="ls-btn-secondary mt-4 w-full text-xs">
            Ajustar matriz RBAC
          </Link>
        </div>
      </section>
    </div>
  )
}