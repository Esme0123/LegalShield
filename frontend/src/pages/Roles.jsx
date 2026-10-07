import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Building2,
  Key,
  RotateCcw,
  Scale,
  ShieldCheck,
  SlidersHorizontal,
  UserCheck,
} from 'lucide-react'
import Sis321Matrix, { RESOURCE_COUNT } from '@/components/matrix/Sis321Matrix'
import RbacPermissionMatrix from '@/components/matrix/RbacPermissionMatrix'
import { Badge, SectionTitle } from '@/components/ui/primitives'
import { SIS321_ROLES, SIS321_SYSTEMS } from '@/data/seed'
import { useAppStore } from '@/store/useAppStore'
import { toast } from '@/store/toastStore'
import { cn } from '@/lib/cn'
import { relativePercent } from '@/lib/format'

const SYSTEM_ICONS = {
  RED: Building2,
  CORREO: UserCheck,
  SISTEMA_A: Scale,
  SISTEMA_B: ShieldCheck,
}

const FILTERS = [
  { id: 'all', label: 'Todos los roles' },
  { id: 'critico', label: 'Cobertura critica' },
  { id: 'alto', label: 'Cobertura alta' },
  { id: 'bajo', label: 'Cobertura baja' },
]

export default function Roles() {
  const sis321 = useAppStore((s) => s.sis321)
  const session = useAppStore((s) => s.session)
  const logs = useAppStore((s) => s.logs)
  const hasPermission = useAppStore((s) => s.hasPermission)
  const toggleMatrixAccess = useAppStore((s) => s.toggleMatrixAccess)
  const setSystemColumn = useAppStore((s) => s.setSystemColumn)
  const resetSis321 = useAppStore((s) => s.resetSis321)

  const [filter, setFilter] = useState('all')

  const canEdit = hasPermission('RBAC_MANAGE') || session?.role === 'socio'

  const coverage = useMemo(() => {
    const values = SIS321_ROLES.map((r) => (sis321[r.id] ?? []).length / RESOURCE_COUNT)
    return {
      global: Math.round((values.reduce((a, v) => a + v, 0) / values.length) * 100),
      grants: SIS321_ROLES.reduce((acc, r) => acc + (sis321[r.id] ?? []).length, 0),
    }
  }, [sis321])

  const visibleRoles = useMemo(() => {
    if (filter === 'all') return SIS321_ROLES
    return SIS321_ROLES.filter((role) => {
      const pct = Math.round(((sis321[role.id] ?? []).length / RESOURCE_COUNT) * 100)
      if (filter === 'critico') return pct >= 80
      if (filter === 'alto') return pct >= 45 && pct < 80
      return pct < 45
    })
  }, [filter, sis321])

  const lastChange = logs.find((l) => l.type === 'MATRIX_ACCESS_CHANGED')

  const handleToggle = (roleId, resourceId) => {
    const { granting, roleLabel, resourceLabel } = toggleMatrixAccess(roleId, resourceId)
    toast.pastel(
      granting ? 'Acceso concedido' : 'Acceso retirado',
      `${resourceLabel} ${granting ? 'habilitado' : 'deshabilitado'} para ${roleLabel} · matrice SIS-321 actualizada sin recarga`,
    )
  }

  const handleColumn = (resourceId, grant) => {
    setSystemColumn(resourceId, grant)
    toast.info(
      grant ? 'Columna habilitada' : 'Columna deshabilitada',
      `${resourceId} aplicada a los ${SIS321_ROLES.length} roles · evento MATRIX_BULK_CHANGED`,
    )
  }

  return (
    <div className="space-y-6">
      <SectionTitle
        icon={Scale}
        title="Matriz de roles y permisos SIS-321"
        subtitle="Planilla de la UCB: nueve roles por sistema y recurso (RED, CORREO, SISTEMA A y SISTEMA B). Cada casilla alterada sella un evento critico."
        actions={
          <button
            type="button"
            onClick={() => {
              resetSis321()
              toast.info('Matriz restaurada', 'Permisos base de la planilla SIS-321 reaplicados')
            }}
            className="ls-btn-secondary text-xs"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Restaurar planilla
          </button>
        }
      />

      {/* Sistemas */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {SIS321_SYSTEMS.map((system) => {
          const Icon = SYSTEM_ICONS[system.id]
          const granted = SIS321_ROLES.reduce(
            (acc, role) => acc + (sis321[role.id] ?? []).filter((id) => system.resources.some((r) => r.id === id)).length,
            0,
          )
          return (
            <motion.div
              key={system.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              className="ls-card-hover p-5"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-lg border border-accent/40 bg-accent/10 text-accent">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="font-display text-xl font-bold text-accent">
                  {relativePercent(granted, SIS321_ROLES.length * system.resources.length)}%
                </span>
              </div>
              <p className="mt-2.5 font-display text-[13px] font-bold tracking-tight">{system.label}</p>
              <p className="mt-0.5 text-[11px] leading-snug text-muted">{system.description}</p>
              <div className="mt-2.5 flex flex-wrap gap-1">
                {system.resources.map((r) => (
                  <span key={r.id} className="ls-chip !px-1.5 !py-0.5 text-[9px]">
                    {r.label}
                  </span>
                ))}
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* Filtros */}
      <div className="ls-card flex flex-wrap items-center gap-3 p-5">
        <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
          <SlidersHorizontal className="h-3.5 w-3.5" /> Cobertura por rol
        </span>
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={cn(
              'rounded-full border px-3 py-1 text-[11px] font-medium transition-all duration-300',
              filter === f.id
                ? 'border-accent/70 bg-accent/15 text-accent'
                : 'border-line/50 text-muted hover:border-accent/50 hover:text-ink',
            )}
          >
            {f.label}
          </button>
        ))}

        <div className="ml-auto flex flex-wrap items-center gap-3">
          <div className="text-right">
            <p className="font-display text-xl font-bold text-accent">{coverage.global}%</p>
            <p className="font-mono text-[9.5px] uppercase tracking-wider text-muted">
              {coverage.grants}/{SIS321_ROLES.length * RESOURCE_COUNT} celdas
            </p>
          </div>
          {canEdit ? (
            <Badge tone="pastel">
              <ShieldCheck className="h-3 w-3" /> Edicion habilitada
            </Badge>
          ) : (
            <Badge tone="danger">
              <Key className="h-3 w-3" /> Solo lectura · falta RBAC_MANAGE
            </Badge>
          )}
        </div>
      </div>

      <Sis321Matrix
        roles={visibleRoles}
        matrix={sis321}
        canEdit={canEdit}
        onToggle={handleToggle}
        onToggleColumn={handleColumn}
      />

      <RbacPermissionMatrix />

      <p className="flex items-start gap-2 text-[11.5px] leading-snug text-muted">
        <Scale className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        Regla de separacion de funciones: ningun rol de control (Auditor, Analista, Autorizador)
        acumula permisos de modificacion sobre el Sistema B. El encabezado de cada recurso marca
        cuantos de los{' '}
        {SIS321_ROLES.length} roles lo tienen habilitado y permite conmutar la columna completa.
      </p>

      {lastChange && (
        <div className="ls-panel flex flex-wrap items-center gap-3 font-mono text-[11px] text-muted">
          <span className="text-accent">ULTIMO EVENTO</span>
          <span className="text-info">{lastChange.type}</span>
          <span className="text-ink">{lastChange.message}</span>
        </div>
      )}
    </div>
  )
}