import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Activity,
  ArrowRight,
  FileStack,
  ShieldCheck,
  Users2,
} from 'lucide-react'
import AeroShards from '@/components/reactbits/AeroShards'
import FolderFloat from '@/components/reactbits/FolderFloat'
import ConnectionError from '@/components/ui/ConnectionError'
import { Badge, Progress, RiskBadge, SectionTitle, StatCard } from '@/components/ui/primitives'
import { useAppStore } from '@/store/useAppStore'
import { PERMISSIONS, ROLES } from '@/data/seed'
import { displayNameFor } from '@/lib/identity'
import { timeAgo, relativePercent } from '@/lib/format'

function maturityScore(controls) {
  if (!controls.length) return 0
  const total = controls.reduce((acc, c) => acc + c.score, 0)
  return Math.round((total / (controls.length * 5)) * 100)
}

export default function Dashboard() {
  const navigate = useNavigate()
  const cases = useAppStore((s) => s.cases)
  // El panel de inicio resume la ACTIVIDAD de negocio del despacho; los eventos
  // de acceso y control viven en la bitacora de seguridad (solo OSI).
  const logs = useAppStore((s) => s.activityLogs)
  const riskControls = useAppStore((s) => s.riskControls)
  const rbac = useAppStore((s) => s.rbac)
  const session = useAppStore((s) => s.session)
  const loadCases = useAppStore((s) => s.loadCases)
  const loadActivityLogs = useAppStore((s) => s.loadActivityLogs)
  const loadMatrix = useAppStore((s) => s.loadMatrix)

  useEffect(() => {
    loadCases()
    loadActivityLogs()
    loadMatrix()
  }, [loadCases, loadActivityLogs, loadMatrix])

  const critical = useMemo(() => logs.filter((l) => l.severity === 'critico').length, [logs])
  const [recentActivity, setRecentActivity] = useState([])
  
  useEffect(() => {
    const fetchActivity = async () => {
      try {
        const res = await fetch('/api/audit/activity?limit=5')
        if (res.ok) {
          const data = await res.json()
          setRecentActivity(data.data || data.activity || data.items || [])
        } else {
          setRecentActivity(logs.slice(0, 5))
        }
      } catch {
        setRecentActivity(logs.slice(0, 5))
      }
    }
    fetchActivity()
  }, [logs])
  const displayName = displayNameFor(session?.userId ?? session?.username)

  return (
    <div className="space-y-6">
      <ConnectionError />

      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl border border-line/60 bg-surface/60 p-5 shadow-card backdrop-blur-md sm:p-7">
        <AeroShards density={0.00016} className="opacity-60" />
        <div className="ls-grid-overlay" />
        <div className="relative grid gap-6 lg:items-center">
          <div>
            <h2 className="font-display text-2xl font-bold leading-tight tracking-tight text-balance sm:text-3xl">
              Bienvenido, {displayName}.
            </h2>
            <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted">
              Bienvenido, {displayName}. Panel operativo y supervisión del despacho.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link to="/cases" className="ls-btn-primary">
                <FileStack className="h-4 w-4" /> Revisar expedientes
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
              {seesSecurity && (
                <Link to="/audit" className="ls-btn-secondary">
                  <Activity className="h-4 w-4" /> Bitácora de seguridad
                </Link>
              )}
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
          icon={Activity}
          label="Próximos Vencimientos"
          value={0}
          delta="vencimientos por vencer"
          tone="danger"
          foot={<Progress value={0} tone="pastel" />}
        />
        <StatCard
          icon={ShieldCheck}
          label="Documentos Guardados"
          value={0}
          delta="documentación del despacho"
          tone="pastel"
          foot={<Progress value={0} tone="pastel" />}
        />
        <StatCard
          icon={Users2}
          label="Clientes Registrados"
          value={0}
          delta="total de clientes"
          tone="info"
          foot={<Progress value={0} tone="info" />}
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
            subtitle="Ultimas acciones de negocio registradas por el despacho"
            actions={
              seesSecurity ? (
                <Link to="/audit" className="ls-btn-ghost text-xs">
                  Logs completos <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              ) : null
            }
          />
          <ul className="divide-y divide-line/25">
            {recentActivity.slice(0, 5).map((l) => (
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
            {recentActivity.length === 0 && <p className="py-3 text-[12px] text-muted">Sin actividad registrada</p>}
          </ul>
        </div>

        <div className="ls-card p-4">
          <SectionTitle icon={Users2} title="Cobertura por rol" subtitle="Permisos activos tras el ultimo reajuste" />
          <div className="space-y-3">
            {ROLES.map((r) => (
              <div key={r.id}>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[12px] font-medium">{r.label}</span>
                  <span className="font-mono text-[10px] text-muted">
                    {(rbac[r.id] ?? []).length}/{PERMISSIONS.length}
                  </span>
                </div>
                <Progress
                  value={rbac[r.id]?.length ?? 0}
                  max={PERMISSIONS.length}
                  tone={r.id === 'osi' ? 'pastel' : 'accent'}
                />
              </div>
            ))}
          </div>
          {seesSecurity && (
            <Link to="/roles" className="ls-btn-secondary mt-4 w-full text-xs">
              Ajustar matriz RBAC
            </Link>
          )}
        </div>
      </section>
    </div>
  )
}