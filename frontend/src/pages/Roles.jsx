import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Activity,
  FileStack,
  FileText,
  Key,
  RotateCcw,
  Scale,
  ShieldCheck,
  SlidersHorizontal,
  Users,
} from 'lucide-react'
import ModuleMatrix, { RESOURCE_COUNT } from '@/components/matrix/ModuleMatrix'
import RbacPermissionMatrix from '@/components/matrix/RbacPermissionMatrix'
import RoleManager from '@/components/matrix/RoleManager'
import { Badge, SectionTitle } from '@/components/ui/primitives'
import { MATRIX_ROLES, MATRIX_MODULES } from '@/data/seed'
import { useAppStore } from '@/store/useAppStore'
import { toast } from '@/store/toastStore'
import { cn } from '@/lib/cn'
import { relativePercent } from '@/lib/format'

const MODULE_ICONS = {
  EXPEDIENTES: FileStack,
  DOCUMENTOS: FileText,
  AUDITORIA: Activity,
  USUARIOS: Users,
}

const FILTERS = [
  { id: 'all', label: 'Todos los roles' },
  { id: 'critico', label: 'Cobertura critica' },
  { id: 'alto', label: 'Cobertura alta' },
  { id: 'bajo', label: 'Cobertura baja' },
]

export default function Roles() {
  const matrixCells = useAppStore((s) => s.matrixCells)
  const logs = useAppStore((s) => s.logs)
  const hasPermission = useAppStore((s) => s.hasPermission)
  const toggleMatrixAccess = useAppStore((s) => s.toggleMatrixAccess)
  const setMatrixColumn = useAppStore((s) => s.setMatrixColumn)
  const resetMatrix = useAppStore((s) => s.resetMatrix)
  const loadMatrix = useAppStore((s) => s.loadMatrix)

  const [filter, setFilter] = useState('all')

  useEffect(() => {
    loadMatrix()
  }, [loadMatrix])

  // Los cambios de la matriz solo vivian en memoria y no se guardaban en la base:
  // se deshabilita la edicion para no aparentar una asignacion de permisos que no existe.
  const canEdit = false

  const coverage = useMemo(() => {
    const values = MATRIX_ROLES.map((r) => (matrixCells[r.id] ?? []).length / RESOURCE_COUNT)
    return {
      global: Math.round((values.reduce((a, v) => a + v, 0) / values.length) * 100),
      grants: MATRIX_ROLES.reduce((acc, r) => acc + (matrixCells[r.id] ?? []).length, 0),
    }
  }, [matrixCells])

  const visibleRoles = useMemo(() => {
    if (filter === 'all') return MATRIX_ROLES
    return MATRIX_ROLES.filter((role) => {
      const pct = Math.round(((matrixCells[role.id] ?? []).length / RESOURCE_COUNT) * 100)
      if (filter === 'critico') return pct >= 80
      if (filter === 'alto') return pct >= 45 && pct < 80
      return pct < 45
    })
  }, [filter, matrixCells])

  const lastChange = logs.find((l) => l.type === 'MATRIX_ACCESS_CHANGED')

  const handleToggle = (roleId, resourceId) => {
    const { granting, roleLabel, resourceLabel } = toggleMatrixAccess(roleId, resourceId)
    toast.pastel(
      granting ? 'Permiso concedido' : 'Permiso retirado',
      `${resourceLabel} ${granting ? 'habilitado' : 'deshabilitado'} para ${roleLabel} · matriz actualizada sin recarga`,
    )
  }

  const handleColumn = (resourceId, grant) => {
    setMatrixColumn(resourceId, grant)
    toast.info(
      grant ? 'Columna habilitada' : 'Columna deshabilitada',
      `${resourceId} aplicada a los ${MATRIX_ROLES.length} roles · evento MATRIX_BULK_CHANGED`,
    )
  }

  return (
    <div className="space-y-6">
      <SectionTitle
        icon={Scale}
        title="Matriz de Permisos por Rol"
        subtitle="Matriz unificada por confidencialidad con roles OSI, Socio, Abogado, Asistente y Cliente."
      />

      {/* Modulos del sistema */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {MATRIX_MODULES.map((module) => {
          const Icon = MODULE_ICONS[module.id] ?? ShieldCheck
          const granted = MATRIX_ROLES.reduce(
            (acc, role) => acc + (matrixCells[role.id] ?? []).filter((id) => module.resources.some((r) => r.id === id)).length,
            0,
          )
          return (
            <motion.div
              key={module.id}
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
                  {relativePercent(granted, MATRIX_ROLES.length * module.resources.length)}%
                </span>
              </div>
              <p className="mt-2.5 font-display text-[13px] font-bold tracking-tight">{module.label}</p>
              <p className="mt-0.5 text-[11px] leading-snug text-muted">{module.description}</p>
              <div className="mt-2.5 flex flex-wrap gap-1">
                {module.resources.map((r) => (
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
              {coverage.grants}/{MATRIX_ROLES.length * RESOURCE_COUNT} celdas
            </p>
          </div>
          <Badge tone="danger">
            <Key className="h-3 w-3" /> Solo lectura · los cambios de la matriz no se guardan
          </Badge>
        </div>
      </div>

      <ModuleMatrix
        roles={visibleRoles}
        matrix={matrixCells}
        canEdit={canEdit}
        onToggle={handleToggle}
        onToggleColumn={handleColumn}
      />

      {hasPermission('ROLES_MANAGE') && <RoleManager />}

      {/* Solo una matriz unificada - eliminada tabla inferior de permisos atómicos */}
      <p className="flex items-start gap-2 text-[11.5px] leading-snug text-muted">
        <Scale className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        Matriz unificada por confidencialidad: Crítico / Confidencial (Gestión de usuarios OSI, asignación de roles, desbloqueo de cuentas, bitácora de seguridad), Privado (Creación de expedientes, edición de escritos procesales, descarga de pruebas), Público (Consulta de estado de causas públicas e información general). Roles: OSI, Socio, Abogado, Asistente, Cliente.
      </p>

      {lastChange && (
        <div className="ls-panel flex flex-wrap items-center gap-3 font-mono text-[11px] text-muted">
          <span className="text-accent">ÚLTIMO EVENTO</span>
          <span className="text-info">{lastChange.type}</span>
          <span className="text-ink">{lastChange.message}</span>
        </div>
      )}
    </div>
  )
}
