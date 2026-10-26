import { useEffect, useMemo } from 'react'
import { Key, Scale, ShieldCheck } from 'lucide-react'
import RbacPermissionMatrix from '@/components/matrix/RbacPermissionMatrix'
import RoleManager from '@/components/matrix/RoleManager'
import { Badge, SectionTitle } from '@/components/ui/primitives'
import { useAppStore } from '@/store/useAppStore'

export default function Roles() {
  const rbac = useAppStore((s) => s.rbac)
  const rbacRoles = useAppStore((s) => s.rbacRoles)
  const rbacPermissions = useAppStore((s) => s.rbacPermissions)
  const hasPermission = useAppStore((s) => s.hasPermission)
  const loadMatrix = useAppStore((s) => s.loadMatrix)

  useEffect(() => {
    loadMatrix()
  }, [loadMatrix])

  const canEdit = hasPermission('ROLES_MANAGE') || hasPermission('RBAC_MANAGE')

  // Cobertura real: concesiones guardadas sobre el total posible (roles x permisos).
  const coverage = useMemo(() => {
    const total = rbacRoles.length * rbacPermissions.length
    const grants = rbacRoles.reduce((acc, role) => acc + (rbac[role.code] ?? []).length, 0)
    return { grants, total, percent: total > 0 ? Math.round((grants / total) * 100) : 0 }
  }, [rbac, rbacRoles, rbacPermissions])

  return (
    <div className="space-y-6">
      <SectionTitle
        icon={Scale}
        title="Matriz de Permisos por Rol"
        subtitle="Permisos atómicos por rol guardados en la base de datos; cada cambio queda auditado."
      />

      <div className="ls-card flex flex-wrap items-center gap-3 p-5">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">Concesiones guardadas</span>

        <div className="ml-auto flex flex-wrap items-center gap-3">
          <div className="text-right">
            <p className="font-display text-xl font-bold text-accent">{coverage.percent}%</p>
            <p className="font-mono text-[9.5px] uppercase tracking-wider text-muted">
              {coverage.grants}/{coverage.total} celdas
            </p>
          </div>
          {canEdit ? (
            <Badge tone="pastel">
              <ShieldCheck className="h-3 w-3" /> Edición habilitada
            </Badge>
          ) : (
            <Badge tone="danger">
              <Key className="h-3 w-3" /> Solo lectura · falta ROLES_MANAGE
            </Badge>
          )}
        </div>
      </div>

      <RbacPermissionMatrix />

      {hasPermission('ROLES_MANAGE') && <RoleManager />}

      <p className="flex items-start gap-2 text-[11.5px] leading-snug text-muted">
        <Scale className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        Cada celda se guarda al pulsarla y se recarga desde el servidor. El rol OSI conserva siempre ROLES_MANAGE y
        RBAC_MANAGE (celdas con candado) para que alguien pueda administrar la seguridad. Los cambios rigen desde la
        siguiente petición de cada usuario.
      </p>
    </div>
  )
}
