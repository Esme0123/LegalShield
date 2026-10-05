import { NavLink } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Activity,
  ChevronLeft,
  FileStack,
  LayoutDashboard,
  Lock,
  LogOut,
  ShieldCheck,
  Users2,
  X,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { useAppStore } from '@/store/useAppStore'
import { ROLES } from '@/data/seed'
import { toast } from '@/store/toastStore'

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, hint: 'Panorama operativo' },
  { to: '/roles', label: 'Matriz RBAC', icon: Users2, hint: 'Accesos granulares' },
  { to: '/cases', label: 'Expedientes', icon: FileStack, hint: 'Juicios y documentos' },
  { to: '/audit', label: 'Auditoria', icon: Activity, hint: 'Logs forenses en vivo' },
  { to: '/risk-assessment', label: 'ISO 27001', icon: ShieldCheck, hint: 'Riesgo y madurez' },
]

function NavItem({ item, collapsed, onNavigate, permission }) {
  const Icon = item.icon
  const allowed = permission ? permission(item.to) : true

  if (!allowed) {
    return (
      <div
        className={cn(
          'flex items-center gap-3 rounded-lg px-3 py-2.5 text-muted/40',
          collapsed && 'justify-center px-0',
        )}
        title="Bloqueado: tu rol no tiene permiso"
      >
        <Icon className="h-[18px] w-[18px] shrink-0" />
        {!collapsed && <span className="truncate text-sm line-through">{item.label}</span>}
        {!collapsed && <Lock className="ml-auto h-3 w-3 shrink-0" />}
      </div>
    )
  }

  return (
    <NavLink
      to={item.to}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        cn(
          'group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-300',
          collapsed && 'justify-center px-0',
          isActive
            ? 'bg-accent/15 text-accent shadow-inset'
            : 'text-muted hover:bg-surface2/50 hover:text-ink',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId="nav-active"
              className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-accent"
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            />
          )}
          <Icon className="h-[18px] w-[18px] shrink-0" />
          {!collapsed && (
            <span className="flex min-w-0 flex-col">
              <span className="truncate">{item.label}</span>
              <span className="truncate text-[10px] font-normal text-muted/70">{item.hint}</span>
            </span>
          )}
        </>
      )}
    </NavLink>
  )
}

export default function Sidebar({ open, onClose, collapsed, onToggleCollapse }) {
  const session = useAppStore((s) => s.session)
  const hasPermission = useAppStore((s) => s.hasPermission)
  const logout = useAppStore((s) => s.logout)

  const roleMeta = ROLES.find((r) => r.id === session?.role)
  const permissionMap = {
    '/roles': 'RBAC_MANAGE',
    '/audit': 'LOGS_VIEW',
    '/risk-assessment': 'RISK_ASSESS',
  }

  return (
    <>
      {/* Backdrop movil */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-navy/70 backdrop-blur-sm lg:hidden"
          />
        )}
      </AnimatePresence>

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex flex-col border-r border-line/60 bg-surface/80 backdrop-blur-xl transition-all duration-300 ease-shield',
          collapsed ? 'w-[76px]' : 'w-[262px]',
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
        {/* Marca */}
        <div className="flex items-center gap-2.5 border-b border-line/40 px-4 py-4">
          <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-accent/50 bg-gradient-to-br from-accent/25 to-info/15 text-accent">
            <ShieldCheck className="h-5 w-5" />
            <span className="absolute inset-0 animate-pulse-ring rounded-xl border border-accent/40" />
          </span>
          {!collapsed && (
            <div className="min-w-0">
              <p className="font-display text-[15px] font-bold leading-none tracking-tight">LegalShield</p>
              <p className="mt-1 font-mono text-[9.5px] uppercase tracking-[0.18em] text-muted">
                Secure Legal OS
              </p>
            </div>
          )}
          <button
            type="button"
            onClick={onClose}
            className="ml-auto grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface2/60 lg:hidden"
            aria-label="Cerrar menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Navegacion */}
        <nav className="flex-1 overflow-y-auto p-3">
          {!collapsed && (
            <p className="mb-2 px-3 font-mono text-[9.5px] uppercase tracking-[0.2em] text-muted/70">
              Modulos
            </p>
          )}
          <div className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => (
              <NavItem
                key={item.to}
                item={item}
                collapsed={collapsed}
                onNavigate={onClose}
                permission={
                  permissionMap[item.to]
                    ? (path) => hasPermission(permissionMap[path])
                    : undefined
                }
              />
            ))}
          </div>
        </nav>

        {/* Sesion */}
        <div className="border-t border-line/40 p-3">
          <div className={cn('flex items-center gap-2.5 rounded-lg border border-line/50 bg-surface2/40 p-2.5', collapsed && 'justify-center p-2')}>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-lineSoft/40 bg-bg/60 font-mono text-[11px] font-bold text-accent">
              {session?.userId?.slice(-2) ?? '--'}
            </span>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] font-semibold">{session?.name ?? 'Sin sesion'}</p>
                <p className="truncate font-mono text-[10px] text-muted">
                  {roleMeta?.label ?? session?.role} · {session?.userId}
                </p>
              </div>
            )}
            {!collapsed && (
              <button
                type="button"
                onClick={() => {
                  logout()
                  toast.info('Sesion cerrada', 'Token revocado · ver Logs de Auditoria')
                }}
                className="rounded-md p-1.5 text-muted transition hover:bg-danger/15 hover:text-danger"
                aria-label="Cerrar sesion"
              >
                <LogOut className="h-4 w-4" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onToggleCollapse}
            className={cn(
              'mt-2 hidden w-full items-center gap-2 rounded-lg border border-line/40 px-3 py-2 text-[11.5px] text-muted transition hover:border-accent/50 hover:text-ink lg:flex',
              collapsed && 'justify-center px-0',
            )}
          >
            <ChevronLeft
              className={cn('h-3.5 w-3.5 transition-transform duration-300', collapsed && 'rotate-180')}
            />
            {!collapsed && 'Contraer menu'}
          </button>
        </div>
      </aside>
    </>
  )
}