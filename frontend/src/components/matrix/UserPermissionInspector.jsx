import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Lock, RotateCcw, Search, User, UserCog, Users, X } from 'lucide-react'
import { PERMISSIONS } from '@/data/seed'
import { Badge } from '@/components/ui/primitives'
import { useAppStore } from '@/store/useAppStore'
import { toast } from '@/store/toastStore'
import { cn } from '@/lib/cn'

/** Modulos del menu y el permiso que abre cada uno (igual que Sidebar). */
const MODULES = [
  { label: 'Gestión de Usuarios', any: ['USERS_READ', 'USERS_MANAGE'] },
  { label: 'Matriz de Permisos', any: ['ROLES_MANAGE'] },
  { label: 'Expedientes', any: ['CASES_READ'] },
  { label: 'Auditoría', any: ['SECURITY_LOGS_VIEW'] },
  { label: 'ISO 27001', any: ['RISK_ASSESS'] },
]

const labelOf = (code) => PERMISSIONS.find((p) => p.id === code)?.label ?? code
const groupOf = (code) => PERMISSIONS.find((p) => p.id === code)?.group ?? 'Otros'

/** Confirmacion antes de un cambio que afecta a todo un rol. */
function RoleChangeConfirm({ change, busy, onConfirm, onClose }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[70] grid place-items-center bg-navy/70 p-4 backdrop-blur-sm"
      onClick={busy ? undefined : onClose}
    >
      <motion.div
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.98 }}
        className="ls-card w-full max-w-md p-5 sm:p-6"
        role="alertdialog"
        aria-labelledby="role-change-title"
      >
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-warn/50 bg-warn/10 text-warn">
            <Users className="h-5 w-5" />
          </span>
          <div>
            <h3 id="role-change-title" className="font-display text-base font-bold text-ink">
              {change.granted ? 'Conceder' : 'Quitar'} a todos los {change.roleLabel}
            </h3>
            <p className="mt-1 font-mono text-[11px] text-info">{change.permission}</p>
          </div>
        </div>
        <p className="mt-4 text-[12.5px] leading-snug text-ink/85">
          «{labelOf(change.permission)}» se {change.granted ? 'concederá' : 'retirará'} a{' '}
          <strong>todas las cuentas con rol {change.roleLabel}</strong>, actuales y futuras. Las excepciones
          individuales que ya existan se mantienen.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="ls-btn-ghost text-xs">
            Cancelar
          </button>
          <button type="button" onClick={onConfirm} disabled={busy} className="ls-btn-primary text-xs">
            {busy ? 'Aplicando…' : `Aplicar a todos los ${change.roleLabel}`}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

/**
 * Verificador por usuario: elige una cuenta, muestra que modulos y permisos
 * tiene hoy y de donde salen (rol o excepcion), y permite cambiar un permiso
 * solo para esa cuenta o para todo su rol. Las cuentas OSI son de solo lectura.
 */
export default function UserPermissionInspector() {
  const users = useAppStore((s) => s.users)
  const loadUsers = useAppStore((s) => s.loadUsers)
  const rbacPermissions = useAppStore((s) => s.rbacPermissions)
  const loadUserPermissions = useAppStore((s) => s.loadUserPermissions)
  const setUserPermission = useAppStore((s) => s.setUserPermission)
  const togglePermission = useAppStore((s) => s.togglePermission)
  const loadMatrix = useAppStore((s) => s.loadMatrix)

  const [query, setQuery] = useState('')
  const [selectedCode, setSelectedCode] = useState('')
  const [info, setInfo] = useState(null)
  const [busy, setBusy] = useState(null)
  const [roleChange, setRoleChange] = useState(null)

  useEffect(() => {
    if (users.length === 0) loadUsers()
  }, [users.length, loadUsers])

  const reload = async (code = selectedCode) => {
    if (!code) return
    try {
      setInfo(await loadUserPermissions(code))
    } catch (error) {
      toast.danger('No se pudieron leer los permisos', error.message)
    }
  }

  useEffect(() => {
    if (!selectedCode) {
      setInfo(null)
      return
    }
    loadUserPermissions(selectedCode)
      .then(setInfo)
      .catch((error) => toast.danger('No se pudieron leer los permisos', error.message))
  }, [selectedCode, loadUserPermissions])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    return users
      .filter((u) => !q || [u.username, u.userCode, u.roleLabel].join(' ').toLowerCase().includes(q))
      .slice(0, 60)
  }, [users, query])

  const rows = useMemo(() => {
    if (!info) return []
    const overrides = new Map(info.overrides.map((o) => [o.permission, o.granted]))
    return rbacPermissions.map(({ code, osiExclusive }) => {
      const fromRole = info.rolePermissions.includes(code)
      const override = overrides.has(code) ? overrides.get(code) : null
      return { code, fromRole, override, osiExclusive, has: info.effective.includes(code), group: groupOf(code) }
    })
  }, [info, rbacPermissions])

  const grouped = useMemo(() => {
    const byGroup = new Map()
    for (const row of rows) {
      if (!byGroup.has(row.group)) byGroup.set(row.group, [])
      byGroup.get(row.group).push(row)
    }
    return [...byGroup.entries()]
  }, [rows])

  const changeForUser = async (row, granted) => {
    setBusy(`u:${row.code}`)
    try {
      const data = await setUserPermission(info.user.userCode, row.code, granted)
      setInfo(data)
      toast.pastel(
        'Permiso actualizado',
        granted === null
          ? `${info.user.username} vuelve a lo que da su rol en «${labelOf(row.code)}»`
          : `«${labelOf(row.code)}» ${granted ? 'concedido' : 'retirado'} solo a ${info.user.username}`,
      )
    } catch (error) {
      toast.danger('No se pudo cambiar el permiso', error.message)
    } finally {
      setBusy(null)
    }
  }

  const confirmRoleChange = async () => {
    setBusy('role')
    try {
      await togglePermission(roleChange.role, roleChange.permission)
      await Promise.all([loadMatrix(), reload()])
      toast.pastel(
        'Matriz actualizada',
        `«${labelOf(roleChange.permission)}» ${roleChange.granted ? 'concedido' : 'retirado'} a todos los ${roleChange.roleLabel}`,
      )
      setRoleChange(null)
    } catch (error) {
      toast.danger('La API rechazó el cambio', error.message)
    } finally {
      setBusy(null)
    }
  }

  const locked = info?.user.locked

  return (
    <div className="ls-card overflow-hidden">
      <div className="border-b border-line/40 px-5 py-4">
        <p className="flex items-center gap-2 font-display text-sm font-bold tracking-tight">
          <UserCog className="h-4 w-4 text-accent" /> Verificar los permisos de un usuario
        </p>
        <p className="mt-0.5 text-[11px] text-muted">
          Elija una cuenta para ver a qué módulos entra y qué puede hacer. Puede cambiar un permiso solo para esa
          persona o para todo su rol.
        </p>
      </div>

      <div className="grid gap-4 p-5 lg:grid-cols-[minmax(0,18rem)_1fr]">
        {/* Selector */}
        <div className="space-y-2">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar usuario, código o rol…"
              className="ls-input !pl-9 text-[12px]"
              aria-label="Buscar usuario"
            />
          </label>
          <ul className="max-h-[26rem] space-y-1 overflow-y-auto pr-1" role="listbox" aria-label="Usuarios">
            {matches.map((u) => (
              <li key={u.userCode}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selectedCode === u.userCode}
                  onClick={() => setSelectedCode(u.userCode)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors',
                    selectedCode === u.userCode
                      ? 'border-accent/60 bg-accent/10'
                      : 'border-transparent hover:border-line/50 hover:bg-surface2/40',
                    !u.isActive && 'opacity-60',
                  )}
                >
                  <User className="h-3.5 w-3.5 shrink-0 text-muted" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-semibold text-ink">{u.username}</span>
                    <span className="block font-mono text-[9.5px] text-muted">
                      {u.roleLabel} · {u.userCode}
                    </span>
                  </span>
                  {u.role === 'osi' && <Lock className="h-3 w-3 text-muted" aria-label="OSI: solo lectura" />}
                </button>
              </li>
            ))}
            {matches.length === 0 && <li className="px-3 py-2 text-[12px] text-muted">Sin coincidencias</li>}
          </ul>
        </div>

        {/* Detalle */}
        {!info ? (
          <div className="grid place-items-center rounded-xl border border-dashed border-line/50 p-8 text-center text-[12px] text-muted">
            Seleccione un usuario de la lista para ver sus permisos.
          </div>
        ) : (
          <div className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-display text-base font-bold text-ink">{info.user.username}</p>
              <Badge tone="info">{info.user.roleLabel}</Badge>
              <span className="font-mono text-[10.5px] text-muted">{info.user.userCode}</span>
              {!info.user.isActive && <Badge tone="danger">Dado de baja</Badge>}
              {info.overrides.length > 0 && <Badge tone="pastel">{info.overrides.length} excepción(es)</Badge>}
            </div>

            <div>
              <p className="mb-1.5 font-mono text-[9.5px] uppercase tracking-[0.16em] text-muted">Módulos a los que entra</p>
              <div className="flex flex-wrap gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-full border border-ok/50 bg-ok/10 px-2.5 py-0.5 text-[11px] text-ok">
                  <Check className="h-3 w-3" /> Dashboard
                </span>
                {MODULES.map((m) => {
                  const open = m.any.some((p) => info.effective.includes(p))
                  return (
                    <span
                      key={m.label}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px]',
                        open ? 'border-ok/50 bg-ok/10 text-ok' : 'border-line/40 text-muted line-through',
                      )}
                    >
                      {open ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />} {m.label}
                    </span>
                  )
                })}
              </div>
            </div>

            {locked && (
              <p className="flex items-start gap-2 rounded-lg border border-line/40 bg-surface2/40 px-3 py-2 text-[11.5px] text-muted">
                <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Es una cuenta OSI: sus permisos son fijos. Un OSI no puede cambiar los permisos de otro OSI.
              </p>
            )}

            <div className="overflow-x-auto">
              <table className="ls-table min-w-[640px]">
                <thead>
                  <tr>
                    <th>Permiso</th>
                    <th>Estado</th>
                    {!locked && <th className="text-right">Cambiar</th>}
                  </tr>
                </thead>
                <tbody>
                  {grouped.map(([group, items]) => [
                    <tr key={`g-${group}`}>
                      <th colSpan={locked ? 2 : 3} className="bg-surface2/40 !py-1.5 text-left">
                        <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted">{group}</span>
                      </th>
                    </tr>,
                    ...items.map((row) => (
                      <tr key={row.code}>
                        <td>
                          <p className="text-[12px] font-semibold text-ink">{labelOf(row.code)}</p>
                          <p className="font-mono text-[9.5px] text-muted">{row.code}</p>
                        </td>
                        <td>
                          <span className={cn('inline-flex items-center gap-1 text-[11.5px] font-semibold', row.has ? 'text-ok' : 'text-muted')}>
                            {row.has ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                            {row.has ? 'Tiene acceso' : 'Sin acceso'}
                          </span>
                          <span className="block font-mono text-[9.5px] text-muted">
                            {row.override === null
                              ? 'según su rol'
                              : row.override
                                ? 'excepción: concedido solo a este usuario'
                                : 'excepción: retirado solo a este usuario'}
                          </span>
                        </td>
                        {!locked && row.osiExclusive && !row.has && (
                          <td className="text-right">
                            <span className="inline-flex items-center gap-1 font-mono text-[10px] text-muted">
                              <Lock className="h-3 w-3" /> Exclusivo del OSI
                            </span>
                          </td>
                        )}
                        {!locked && !(row.osiExclusive && !row.has) && (
                          <td className="text-right">
                            <div className="flex flex-wrap justify-end gap-1.5">
                              {row.override !== null ? (
                                <button
                                  type="button"
                                  disabled={Boolean(busy)}
                                  onClick={() => changeForUser(row, null)}
                                  className="inline-flex items-center gap-1 rounded-md border border-line/60 px-2 py-1 text-[10.5px] text-muted hover:border-accent/60 hover:text-accent disabled:opacity-50"
                                >
                                  <RotateCcw className="h-3 w-3" /> Volver a lo del rol
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={Boolean(busy)}
                                  onClick={() => changeForUser(row, !row.has)}
                                  className="inline-flex items-center gap-1 rounded-md border border-line/60 px-2 py-1 text-[10.5px] text-ink/80 hover:border-accent/60 hover:text-accent disabled:opacity-50"
                                >
                                  <User className="h-3 w-3" /> {row.has ? 'Quitar' : 'Dar'} solo a {info.user.username}
                                </button>
                              )}
                              <button
                                type="button"
                                disabled={Boolean(busy)}
                                onClick={() =>
                                  setRoleChange({
                                    role: info.user.role,
                                    roleLabel: info.user.roleLabel,
                                    permission: row.code,
                                    granted: !row.fromRole,
                                  })
                                }
                                className="inline-flex items-center gap-1 rounded-md border border-line/60 px-2 py-1 text-[10.5px] text-ink/80 hover:border-warn/60 hover:text-warn disabled:opacity-50"
                              >
                                <Users className="h-3 w-3" /> {row.fromRole ? 'Quitar' : 'Dar'} a todos los {info.user.roleLabel}
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    )),
                  ])}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {roleChange && (
          <RoleChangeConfirm
            change={roleChange}
            busy={busy === 'role'}
            onConfirm={confirmRoleChange}
            onClose={() => setRoleChange(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
