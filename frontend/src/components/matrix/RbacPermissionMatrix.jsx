import { Fragment, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Check, Lock, X } from 'lucide-react'
import { PERMISSIONS } from '@/data/seed'
import { useAppStore } from '@/store/useAppStore'
import { toast } from '@/store/toastStore'
import { cn } from '@/lib/cn'


/**
 * Matriz RBAC atomica: rol x permiso, construida con lo que devuelve
 * GET /api/roles/matrix (roles, permisos y asignaciones reales). Cada cambio se
 * guarda con POST /api/roles/permissions, se recarga desde la API y queda
 * auditado como PERMISSION_CHANGED. `seed.js` solo aporta etiquetas y grupos.
 */
export default function RbacPermissionMatrix() {
  const rbac = useAppStore((s) => s.rbac)
  const rbacRoles = useAppStore((s) => s.rbacRoles)
  const rbacPermissions = useAppStore((s) => s.rbacPermissions)
  const hasPermission = useAppStore((s) => s.hasPermission)
  const togglePermission = useAppStore((s) => s.togglePermission)
  const loadMatrix = useAppStore((s) => s.loadMatrix)

  const canEdit = hasPermission('ROLES_MANAGE')
  // Roles de solo lectura (OSI): un OSI no cambia los permisos de otro OSI. El servidor tambien lo rechaza.
  const isLockedRole = (roleCode) => Boolean(rbacRoles.find((r) => r.code === roleCode)?.locked)

  // Un permiso del catalogo sin metadatos locales conserva su codigo y descripcion de la API.
  const groups = useMemo(() => {
    const byGroup = new Map()
    for (const perm of rbacPermissions) {
      const meta = PERMISSIONS.find((p) => p.id === perm.code)
      const group = meta?.group ?? 'Otros'
      if (!byGroup.has(group)) byGroup.set(group, [])
      byGroup.get(group).push({
        code: perm.code,
        label: meta?.label ?? perm.description ?? perm.code,
        group,
        osiExclusive: Boolean(perm.osiExclusive),
      })
    }
    return [...byGroup.entries()].map(([group, items]) => ({ group, items }))
  }, [rbacPermissions])

  const roles = useMemo(
    () => rbacRoles.map((role) => ({ ...role, short: role.code.slice(0, 3).toUpperCase() })),
    [rbacRoles],
  )

  const handleToggle = async (roleCode, permission) => {
    if (!canEdit || isLockedRole(roleCode)) return
    const roleLabel = roles.find((r) => r.code === roleCode)?.name ?? roleCode
    try {
      const { granting, alsoChanged } = await togglePermission(roleCode, permission.code)
      await loadMatrix()
      const extra = alsoChanged.length
        ? ` · también ${granting ? 'se activó' : 'se quitó'}: ${alsoChanged
            .map((code) => PERMISSIONS.find((p) => p.id === code)?.label ?? code)
            .join(', ')}`
        : ''
      toast.pastel(
        granting ? 'Permiso concedido' : 'Permiso retirado',
        `${permission.label} ${granting ? 'habilitado' : 'deshabilitado'} para ${roleLabel}${extra}`,
      )
    } catch (error) {
      toast.danger('La API rechazo el cambio', error.message ?? 'La matriz se reequilibro al estado persistido')
    }
  }

  if (roles.length === 0 || rbacPermissions.length === 0) {
    return (
      <div className="ls-card p-5 text-[12px] text-muted">
        No se pudo cargar la matriz desde la API. Recargue la pantalla o revise la conexión.
      </div>
    )
  }

  return (
    <div className="ls-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/40 px-5 py-4">
        <div>
          <p className="font-display text-sm font-bold tracking-tight">Matriz de permisos por rol</p>
          <p className="mt-0.5 text-[11px] text-muted">
            Pulse una celda para dar o quitar el permiso a <strong>todos</strong> los usuarios de ese rol. El cambio rige
            de inmediato. La columna OSI es de solo lectura.
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
              {roles.map((role) => (
                <th key={role.code} scope="col" className="!py-3 text-center">
                  <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted">{role.short}</span>
                  <span className="block text-[11px] font-semibold text-ink">{role.name}</span>
                  {role.locked && (
                    <span className="mt-0.5 inline-flex items-center gap-0.5 font-mono text-[8.5px] uppercase text-muted">
                      <Lock className="h-2.5 w-2.5" /> fijo
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map(({ group, items }) => (
              <Fragment key={group}>
                <tr>
                  <th colSpan={roles.length + 1} className="!border-y !border-line/20 bg-surface2/40 px-4 py-1.5 text-left">
                    <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted">{group}</span>
                  </th>
                </tr>
                {items.map((perm) => (
                  <tr key={perm.code}>
                    <th scope="row" className="sticky left-0 z-20 !border-r !border-line/25 bg-surface text-left">
                      <div className="py-1 pr-3">
                        <p className="truncate text-[12px] font-semibold text-ink">{perm.label}</p>
                        <p className="font-mono text-[9.5px] uppercase tracking-wider text-muted">{perm.code}</p>
                      </div>
                    </th>
                    {roles.map((role) => {
                      const granted = (rbac[role.code] ?? []).includes(perm.code)
                      // Un permiso exclusivo del OSI solo puede retirarse de otro rol, nunca concederse.
                      const exclusive = perm.osiExclusive && !role.locked && !granted
                      const locked = Boolean(role.locked) || exclusive
                      const disabled = !canEdit || locked
                      return (
                        <td key={role.code} className="!py-2 !text-center">
                          <motion.button
                            type="button"
                            whileTap={disabled ? undefined : { scale: 0.85 }}
                            onClick={() => handleToggle(role.code, perm)}
                            disabled={disabled}
                            title={
                              exclusive
                                ? 'Exclusivo del OSI: no se puede conceder a otro rol'
                                : locked
                                  ? `Permisos del OSI fijos (${granted ? 'lo tiene' : 'no lo tiene'}): un OSI no cambia los permisos de otro OSI`
                                  : `${granted ? 'Quitar' : 'Dar'} a todos los ${role.name}`
                            }
                            aria-label={`${perm.label} para ${role.name}: ${granted ? 'concedido' : 'no concedido'}`}
                            className={cn(
                              'mx-auto grid h-7 w-7 place-items-center rounded-md border transition-all duration-200',
                              granted ? 'border-accent/60 bg-accent/15 text-accent' : 'border-line/40 text-muted/40 hover:border-accent/40 hover:text-info',
                              disabled && 'cursor-not-allowed opacity-60',
                            )}
                          >
                            {granted ? (
                              <Check className="h-3.5 w-3.5" />
                            ) : exclusive ? (
                              <Lock className="h-3 w-3" />
                            ) : (
                              <X className="h-3.5 w-3.5" />
                            )}
                          </motion.button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
