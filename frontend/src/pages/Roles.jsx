import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  KeyRound,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Users2,
} from 'lucide-react'
import { Badge, SectionTitle } from '@/components/ui/primitives'
import { PERMISSIONS, ROLES } from '@/data/seed'
import { useAppStore } from '@/store/useAppStore'
import { toast } from '@/store/toastStore'
import { cn } from '@/lib/cn'
import { relativePercent } from '@/lib/format'

const SEVERITY_TONE = {
  critica: 'text-danger',
  alta: 'text-accent',
  media: 'text-info',
}

function PermissionCell({ roleId, permission, checked, onToggle, canManage }) {
  const [flash, setFlash] = useState(false)

  const handle = () => {
    if (!canManage) {
      toast.danger(
        'Cambio rechazado',
        'Tu rol no posee RBAC_MANAGE · evento PERMISSION_DENIED registrado',
      )
      return
    }
    setFlash(true)
    setTimeout(() => setFlash(false), 600)
    onToggle()
  }

  return (
    <td className="text-center">
      <button
        type="button"
        onClick={handle}
        disabled={!canManage}
        aria-pressed={checked}
        aria-label={`${permission.id} para rol ${roleId}`}
        className={cn(
          'group relative grid h-9 w-9 place-items-center rounded-lg border transition-all duration-300 ease-shield',
          canManage && 'hover:scale-110',
          checked
            ? 'border-accent/70 bg-accent/20 text-accent shadow-glow'
            : 'border-line/50 bg-surface2/30 text-muted/50',
          !canManage && 'cursor-not-allowed opacity-60',
          flash && 'animate-pulse-ring',
        )}
      >
        <span
          className={cn(
            'h-3.5 w-3.5 rounded-[4px] border transition-all duration-300',
            checked ? 'scale-100 border-accent bg-accent' : 'scale-75 border-line',
          )}
        />
        {checked && (
          <span className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-pastel text-[9px] font-bold text-navy">
            ✓
          </span>
        )}
      </button>
    </td>
  )
}

export default function Roles() {
  const rbac = useAppStore((s) => s.rbac)
  const togglePermission = useAppStore((s) => s.togglePermission)
  const resetRbac = useAppStore((s) => s.resetRbac)
  const hasPermission = useAppStore((s) => s.hasPermission)
  const session = useAppStore((s) => s.session)
  const logs = useAppStore((s) => s.logs)

  const [filter, setFilter] = useState('all')

  const canManage = hasPermission('RBAC_MANAGE')
  const groups = useMemo(() => {
    const map = new Map()
    PERMISSIONS.forEach((p) => {
      if (!map.has(p.group)) map.set(p.group, [])
      map.get(p.group).push(p)
    })
    return [...map.entries()]
  }, [])

  const visiblePermissions = useMemo(
    () => PERMISSIONS.filter((p) => filter === 'all' || p.severity === filter),
    [filter],
  )

  const lastChange = logs.find((l) => l.type === 'PERMISSION_CHANGED')

  const handleToggle = (roleId, permissionId) => {
    const { granting, roleLabel } = togglePermission(roleId, permissionId)
    toast.pastel(
      granting ? 'Permiso concedido' : 'Permiso retirado',
      `${permissionId} ${granting ? 'otorgado a' : 'revocado para'} ${roleLabel} · reajuste dinamico de seguridad aplicado sin recarga`,
    )
  }

  return (
    <div className="space-y-5">
      <SectionTitle
        icon={Users2}
        title="Matriz de accesos granular"
        subtitle="Roles x permisos. Cada casilla alterada reevalua la sesion en caliente y sella un evento."
        actions={
          <button
            type="button"
            onClick={() => {
              resetRbac()
              toast.info('Matriz restaurada', 'Permisos base del despacho reaplicados')
            }}
            className="ls-btn-secondary text-xs"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Restaurar base
          </button>
        }
      />

      <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
        <div className="ls-card flex flex-wrap items-center gap-3 p-3.5">
          <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
            <SlidersHorizontal className="h-3.5 w-3.5" /> Filtro criticidad
          </span>
          {[
            { id: 'all', label: 'Todos' },
            { id: 'critica', label: 'Criticos' },
            { id: 'alta', label: 'Altos' },
            { id: 'media', label: 'Medios' },
          ].map((f) => (
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
          <div className="ml-auto flex items-center gap-2">
            {canManage ? (
              <Badge tone="pastel">
                <ShieldCheck className="h-3 w-3" /> Rbac habilitado para {session?.role}
              </Badge>
            ) : (
              <Badge tone="danger">
                <KeyRound className="h-3 w-3" /> Solo lectura · falta RBAC_MANAGE
              </Badge>
            )}
          </div>
        </div>

        <div className="ls-card flex items-center gap-3 p-3.5">
          <div className="text-center">
            <p className="font-display text-xl font-bold text-pastel">
              {relativePercent(
                Object.values(rbac).reduce((a, r) => a + r.length, 0),
                ROLES.length * PERMISSIONS.length,
              )}
              %
            </p>
            <p className="font-mono text-[9.5px] uppercase tracking-wider text-muted">Cobertura</p>
          </div>
        </div>
      </div>

      <motion.div layout className="ls-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="ls-table min-w-[720px]">
            <thead>
              <tr>
                <th className="w-[280px]">Permiso</th>
                {ROLES.map((r) => {
                  const count = rbac[r.id]?.length ?? 0
                  return (
                    <th key={r.id} className="text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className="font-display text-[12px] font-bold text-ink">{r.label}</span>
                        <span className="font-mono text-[9.5px] normal-case tracking-normal text-muted">
                          {count}/{PERMISSIONS.length} · {r.short}
                        </span>
                      </div>
                    </th>
                  )
                })}
              </tr>
            </thead>
            {groups.map(([group, permissions]) => (
              <tbody key={group}>
                <tr className="bg-surface2/25 hover:bg-surface2/25">
                  <td colSpan={ROLES.length + 1} className="border-b border-line/40">
                    <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
                      {group}
                    </span>
                  </td>
                </tr>
                {permissions
                  .filter((p) => visiblePermissions.includes(p))
                  .map((p) => (
                    <tr key={p.id}>
                      <td>
                        <p className="font-mono text-[11.5px] font-semibold text-info">{p.id}</p>
                        <p className="text-[11px] text-muted">{p.label}</p>
                      </td>
                      {ROLES.map((r) => (
                        <PermissionCell
                          key={`${r.id}-${p.id}`}
                          roleId={r.id}
                          permission={p}
                          checked={(rbac[r.id] ?? []).includes(p.id)}
                          canManage={canManage}
                          onToggle={() => handleToggle(r.id, p.id)}
                        />
                      ))}
                    </tr>
                  ))}
              </tbody>
            ))}
          </table>
        </div>
      </motion.div>

      {/* Resumen de roles */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {ROLES.map((r) => (
          <div key={r.id} className="ls-card p-3.5">
            <div className="flex items-center justify-between">
              <p className="font-display text-sm font-bold">{r.label}</p>
              <Badge tone={r.accent === 'pastel' ? 'pastel' : r.accent === 'info' ? 'info' : 'accent'}>
                {(rbac[r.id] ?? []).length} permisos
              </Badge>
            </div>
            <p className="mt-1 text-[11px] leading-snug text-muted">{r.description}</p>
            <div className="mt-2.5 flex flex-wrap gap-1">
              {(rbac[r.id] ?? []).slice(0, 5).map((id) => (
                <span key={id} className="ls-chip !px-1.5 !py-0.5 text-[9px]">
                  {id}
                </span>
              ))}
              {(rbac[r.id] ?? []).length > 5 && (
                <span className="ls-chip !px-1.5 !py-0.5 text-[9px]">+{rbac[r.id].length - 5}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {lastChange && (
        <div className="ls-panel flex flex-wrap items-center gap-3 font-mono text-[11px] text-muted">
          <span className="text-accent">ULTIMO EVENTO</span>
          <span className="text-info">{lastChange.type}</span>
          <span className="text-ink">{lastChange.message}</span>
          <span className="ml-auto">
            severidad:{' '}
            <span className={SEVERITY_TONE[lastChange.severity] ?? 'text-info'}>
              {lastChange.severity}
            </span>
          </span>
        </div>
      )}
    </div>
  )
}