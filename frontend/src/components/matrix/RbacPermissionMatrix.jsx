import { Fragment } from 'react'
import { motion } from 'framer-motion'
import { Check, KeyRound, X } from 'lucide-react'
import { PERMISSIONS, ROLES } from '@/data/seed'
import { useAppStore } from '@/store/useAppStore'
import { toast } from '@/store/toastStore'
import { cn } from '@/lib/cn'

const GROUPS = [...new Set(PERMISSIONS.map((p) => p.group))]

/**
 * Matriz RBAC atomica: rol x permiso. Incluye la segregacion exclusiva del OSI
 * (USERS_MANAGE, ROLES_MANAGE, ACCOUNT_UNLOCK, SECURITY_LOGS_VIEW). Los cambios
 * se aplican al instante via POST /api/roles/permissions (togglePermission) y
 * quedan auditados como PERMISSION_CHANGED.
 */
export default function RbacPermissionMatrix() {
  const rbac = useAppStore((s) => s.rbac)
  const hasPermission = useAppStore((s) => s.hasPermission)
  const togglePermission = useAppStore((s) => s.togglePermission)

  const canEdit = hasPermission('ROLES_MANAGE') || hasPermission('RBAC_MANAGE')

  const byGroup = GROUPS.map((group) => ({
    group,
    items: PERMISSIONS.filter((p) => p.group === group),
  }))

  const handleToggle = async (roleId, permissionId) => {
    if (!canEdit) return
    const roleLabel = ROLES.find((r) => r.id === roleId)?.label ?? roleId
    const permissionLabel = PERMISSIONS.find((p) => p.id === permissionId)?.label ?? permissionId
    try {
      const { granting } = await togglePermission(roleId, permissionId)
      toast.pastel(
        granting ? 'Permiso concedido' : 'Permiso retirado',
        `${permissionLabel} ${granting ? 'habilitado' : 'deshabilitado'} para ${roleLabel} · evento PERMISSION_CHANGED`,
      )
    } catch (error) {
      toast.danger('La API rechazo el cambio', error.message ?? 'La matriz se reequilibro al estado persistido')
    }
  }

  return (
    <div className="ls-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/40 px-5 py-4">
        <div>
          <p className="font-display text-sm font-bold tracking-tight">Matriz unificada por confidencialidad</p>
          <p className="mt-0.5 text-[11px] text-muted">
            Clasificación por accesos: Crítico / Confidencial, Privado y Público. Roles: OSI, Socio, Abogado, Asistente, Cliente.
          </p>
        </div>

      </div>

      <div className="overflow-x-auto">
        <table className="ls-table min-w-[880px] border-separate border-spacing-0">
          <thead>
            <tr>
              <th scope="col" className="!left-0 !z-20 w-[280px] min-w-[280px] !border-r !border-line/25 text-left">
                Permiso
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
            <tr>
              <th colSpan={ROLES.length + 1} className="!border-y !border-line/20 bg-surface2/40 px-4 py-1.5 text-left">
                <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted">Crítico / Confidencial</span>
              </th>
            </tr>
            {PERMISSIONS.filter(p => ['USERS_MANAGE', 'ROLES_MANAGE', 'ACCOUNT_UNLOCK', 'SECURITY_LOGS_VIEW'].includes(p.id)).map((perm) => (
              <tr key={perm.id}>
                <th scope="row" className="sticky left-0 z-20 !border-r !border-line/25 bg-surface text-left">
                  <div className="py-1 pr-3">
                    <p className="truncate text-[12px] font-semibold text-ink">{perm.label}</p>
                    <p className="font-mono text-[9.5px] uppercase tracking-wider text-muted">{perm.group}</p>
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
                        className={cn(
                          'mx-auto grid h-7 w-7 place-items-center rounded-md border transition-all duration-200',
                          granted ? 'border-accent/60 bg-accent/15 text-accent' : 'border-line/40 text-muted/40 hover:border-accent/40 hover:text-info',
                          !canEdit && 'cursor-not-allowed opacity-60',
                        )}
                      >
                        {granted ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                      </motion.button>
                    </td>
                  )
                })}
              </tr>
            ))}
            <tr>
              <th colSpan={ROLES.length + 1} className="!border-y !border-line/20 bg-surface2/40 px-4 py-1.5 text-left">
                <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted">Privado</span>
              </th>
            </tr>
            {PERMISSIONS.filter(p => ['CASES_CREATE', 'CASES_EDIT', 'DOCUMENTS_DOWNLOAD', 'CASES_VIEW', 'DOCUMENTS_VIEW'].includes(p.id) || p.group === 'Expedientes' || p.group === 'Documentación Legal')
              .filter(p => !['USERS_MANAGE', 'ROLES_MANAGE', 'ACCOUNT_UNLOCK', 'SECURITY_LOGS_VIEW'].includes(p.id))
              .map((perm) => (
                <tr key={perm.id}>
                  <th scope="row" className="sticky left-0 z-20 !border-r !border-line/25 bg-surface text-left">
                    <div className="py-1 pr-3">
                      <p className="truncate text-[12px] font-semibold text-ink">{perm.label}</p>
                      <p className="font-mono text-[9.5px] uppercase tracking-wider text-muted">{perm.group}</p>
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
                          className={cn(
                            'mx-auto grid h-7 w-7 place-items-center rounded-md border transition-all duration-200',
                            granted ? 'border-accent/60 bg-accent/15 text-accent' : 'border-line/40 text-muted/40 hover:border-accent/40 hover:text-info',
                            !canEdit && 'cursor-not-allowed opacity-60',
                          )}
                        >
                          {granted ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                        </motion.button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            <tr>
              <th colSpan={ROLES.length + 1} className="!border-y !border-line/20 bg-surface2/40 px-4 py-1.5 text-left">
                <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted">Público</span>
              </th>
            </tr>
            {PERMISSIONS.filter(p => p.group === 'Consulta' || (p.id.includes('VIEW') && !['CASES_VIEW', 'DOCUMENTS_VIEW', 'SECURITY_LOGS_VIEW'].includes(p.id))).map((perm) => (
              <tr key={perm.id}>
                <th scope="row" className="sticky left-0 z-20 !border-r !border-line/25 bg-surface text-left">
                  <div className="py-1 pr-3">
                    <p className="truncate text-[12px] font-semibold text-ink">{perm.label}</p>
                    <p className="font-mono text-[9.5px] uppercase tracking-wider text-muted">{perm.group}</p>
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
                        className={cn(
                          'mx-auto grid h-7 w-7 place-items-center rounded-md border transition-all duration-200',
                          granted ? 'border-accent/60 bg-accent/15 text-accent' : 'border-line/40 text-muted/40 hover:border-accent/40 hover:text-info',
                          !canEdit && 'cursor-not-allowed opacity-60',
                        )}
                      >
                        {granted ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                      </motion.button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}