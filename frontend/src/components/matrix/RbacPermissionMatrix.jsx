import { Fragment } from 'react'
import { motion } from 'framer-motion'
import { Check, KeyRound, X } from 'lucide-react'
import { PERMISSIONS, ROLES } from '@/data/seed'
import { useAppStore } from '@/store/useAppStore'
import { toast } from '@/store/toastStore'
import { cn } from '@/lib/cn'

const GROUPS = [...new Set(PERMISSIONS.map((p) => p.group))]

/**
 * Matriz RBAC atomica: rol x permiso para CASES_*, DOCS_*, LOGS_*, RBAC_*,
 * RISK_* y los nuevos USERS_*. Los cambios se aplican al instante a traves de
 * POST /api/roles/permissions (togglePermission) y quedan auditados como
 * PERMISSION_CHANGED.
 */
export default function RbacPermissionMatrix() {
  const rbac = useAppStore((s) => s.rbac)
  const session = useAppStore((s) => s.session)
  const hasPermission = useAppStore((s) => s.hasPermission)
  const togglePermission = useAppStore((s) => s.togglePermission)

  const canEdit = hasPermission('RBAC_MANAGE') || session?.role === 'socio'

  const byGroup = GROUPS.map((group) => ({
    group,
    items: PERMISSIONS.filter((p) => p.group === group),
  }))

  const handleToggle = async (roleId, permissionId) => {
    if (!canEdit) return
    try {
      const { granting, roleLabel } = await togglePermission(roleId, permissionId)
      toast.pastel(
        granting ? 'Permiso concedido' : 'Permiso retirado',
        `${permissionId} ${granting ? 'habilitado' : 'deshabilitado'} para ${roleLabel} · evento PERMISSION_CHANGED`,
      )
    } catch (error) {
      toast.danger('La API rechazo el cambio', error.message ?? 'La matriz se reequilibro al estado persistido')
    }
  }

  return (
    <div className="ls-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/40 px-5 py-4">
        <div>
          <p className="font-display text-sm font-bold tracking-tight">Matriz RBAC · permisos atómicos</p>
          <p className="mt-0.5 text-[11px] text-muted">
            Gestión granular de usuarios: USERS_READ / USERS_CREATE / USERS_UPDATE / USERS_DELETE / USERS_UNLOCK
          </p>
        </div>
        {!canEdit && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line/50 bg-surface2/40 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted">
            <KeyRound className="h-3 w-3" /> Solo lectura · falta RBAC_MANAGE
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="ls-table min-w-[880px] border-separate border-spacing-0">
          <thead>
            <tr>
              <th scope="col" className="!left-0 !z-20 w-[280px] min-w-[280px] !border-r !border-line/25 text-left">
                Permiso atómico
              </th>
              {ROLES.map((role) => (
                <th key={role.id} scope="col" className="!py-3 text-center">
                  <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted">{role.short}</span>
                  <span className="block text-[11px] font-semibold text-ink">{role.label}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {byGroup.map(({ group, items }) => (
              <Fragment key={group}>
                <tr>
                  <th
                    colSpan={ROLES.length + 1}
                    scope="colgroup"
                    className="!border-y !border-line/20 bg-surface2/40 px-4 py-1.5 text-left"
                  >
                    <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted">{group}</span>
                  </th>
                </tr>
                {items.map((perm) => {
                  const grantedCount = ROLES.filter((role) => (rbac[role.id] ?? []).includes(perm.id)).length
                  return (
                    <tr key={perm.id}>
                      <th scope="row" className="sticky left-0 z-20 !border-r !border-line/25 bg-surface text-left">
                        <div className="flex items-center justify-between gap-2 py-1 pr-3">
                          <div className="min-w-0">
                            <p className="font-mono text-[10.5px] font-semibold text-ink">{perm.id}</p>
                            <p className="truncate text-[11px] text-muted">{perm.label}</p>
                          </div>
                          <span
                            className={cn(
                              'shrink-0 font-mono text-[9px]',
                              grantedCount === ROLES.length
                                ? 'text-ok'
                                : grantedCount === 0
                                  ? 'text-muted/50'
                                  : 'text-info',
                            )}
                          >
                            {grantedCount}/{ROLES.length}
                          </span>
                        </div>
                      </th>
                      {ROLES.map((role) => {
                        const granted = (rbac[role.id] ?? []).includes(perm.id)
                        return (
                          <td key={role.id} className="!py-2 !text-center">
                            <motion.button
                              type="button"
                              whileTap={canEdit ? { scale: 0.85 } : undefined}
                              onClick={() => handleToggle(role.id, perm.id)}
                              disabled={!canEdit}
                              title={
                                canEdit
                                  ? `${granted ? 'Retirar' : 'Conceder'} ${perm.id} a ${role.label}`
                                  : 'Sin permiso para editar la matriz'
                              }
                              className={cn(
                                'mx-auto grid h-7 w-7 place-items-center rounded-md border transition-all duration-200',
                                granted
                                  ? 'border-accent/60 bg-accent/15 text-accent'
                                  : 'border-line/40 text-muted/40 hover:border-accent/40 hover:text-info',
                                !canEdit && 'cursor-not-allowed opacity-60',
                              )}
                            >
                              {granted ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                            </motion.button>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}