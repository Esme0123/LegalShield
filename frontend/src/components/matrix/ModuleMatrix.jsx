import { motion } from 'framer-motion'
import { Check, X } from 'lucide-react'
import { MATRIX_MODULES } from '@/data/seed'
import { cn } from '@/lib/cn'

/** Total de columnas de accion de la matriz de permisos por rol. */
export const RESOURCE_COUNT = MATRIX_MODULES.reduce((acc, module) => acc + module.resources.length, 0)

/** Ancho de columna segun el numero de acciones del modulo (1fr por accion). */
const columnWidth = (module) => `${Math.max(84, module.resources.length * 92)}px`

/** Tinte de cada modulo en la cabecera agrupada. */
const MODULE_TONES = [
  'border-accent/50 bg-accent/12',
  'border-info/45 bg-info/10',
  'border-line/45 bg-surface2/45',
  'border-ok/45 bg-ok/10',
]

/**
 * Matriz de Permisos por Rol: modulos reales de LegalShield agrupados en la
 * cabecera y los cinco roles de la base de datos como filas, con marca de
 * aprobacion por cada permiso concedido.
 */
export default function ModuleMatrix({ roles, matrix, onToggle, onToggleColumn, canEdit }) {
  return (
    <div className="ls-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="ls-table min-w-[1180px] border-separate border-spacing-0">
          <caption className="sr-only">
            Matriz de Permisos por Rol: Gestión de Expedientes, Documentación Legal, Auditoría e
            Historial y Administración de Usuarios (OSI)
          </caption>

          <thead>
            {/* Fila 1: modulos agrupados */}
            <tr>
              <th
                rowSpan={2}
                scope="col"
                className="!left-0 !z-30 w-[248px] min-w-[248px] !border-r !border-line/25"
              >
                <span className="font-mono text-[9.5px] uppercase tracking-[0.18em]">Rol / Módulo</span>
              </th>
              {MATRIX_MODULES.map((module, index) => (
                <th
                  key={module.id}
                  colSpan={module.resources.length}
                  scope="colgroup"
                  style={{ minWidth: columnWidth(module) }}
                  className="!border-b-0 !py-3 !text-center"
                >
                  <div className={cn('mx-1 rounded-lg border px-2 py-2', MODULE_TONES[index % MODULE_TONES.length])}>
                    <p className="font-display text-[12px] font-bold tracking-tight text-ink">{module.label}</p>
                    <p className="mt-0.5 font-mono text-[9px] normal-case tracking-normal text-muted">
                      {module.resources.length} permisos
                    </p>
                  </div>
                </th>
              ))}
            </tr>

            {/* Fila 2: acciones, con interruptor de columna completa */}
            <tr>
              {MATRIX_MODULES.map((module) =>
                module.resources.map((resource) => {
                  const granted = roles.filter((role) => (matrix[role.id] ?? []).includes(resource.id)).length
                  return (
                    <th key={resource.id} scope="col" className="!border-t !py-2.5 !text-center">
                      <button
                        type="button"
                        onClick={() => canEdit && onToggleColumn(resource.id, granted === 0)}
                        disabled={!canEdit}
                        title={
                          canEdit
                            ? `${granted === 0 ? 'Habilitar' : 'Deshabilitar'} ${resource.label} en los ${roles.length} roles`
                            : 'Sin permiso para editar la matriz'
                        }
                        className={cn(
                          'group mx-auto flex w-full max-w-[104px] flex-col items-center gap-0.5 rounded-md px-1 py-1 transition-colors duration-200',
                          canEdit ? 'cursor-pointer hover:bg-accent/10' : 'cursor-not-allowed',
                        )}
                      >
                        <span className="text-[10px] font-semibold uppercase leading-tight tracking-[0.06em] text-muted group-hover:text-ink">
                          {resource.label}
                        </span>
                        <span
                          className={cn(
                            'font-mono text-[8.5px] tracking-wider',
                            granted === roles.length
                              ? 'text-ok'
                              : granted === 0
                                ? 'text-muted/60'
                                : 'text-info',
                          )}
                        >
                          {granted}/{roles.length}
                        </span>
                      </button>
                    </th>
                  )
                }),
              )}
            </tr>
          </thead>

          <tbody>
            {roles.map((role) => {
              const list = matrix[role.id] ?? []
              const coverage = Math.round((list.length / RESOURCE_COUNT) * 100)
              return (
                <tr key={role.id}>
                  <th
                    scope="row"
                    className="sticky left-0 z-20 w-[248px] min-w-[248px] border-b border-line/20 !bg-surface text-left"
                  >
                    <div className="flex items-center justify-between gap-2 px-5 py-4">
                      <div className="min-w-0">
                        <p className="truncate text-[12.5px] font-semibold text-ink">{role.label}</p>
                        <p className="font-mono text-[9.5px] uppercase tracking-wider text-muted">
                          {role.short} · {coverage}% cobertura
                        </p>
                      </div>
                      <span
                        className={cn(
                          'h-1.5 w-1.5 shrink-0 rounded-full',
                          coverage >= 80 ? 'bg-accent' : coverage >= 45 ? 'bg-info' : 'bg-warn',
                        )}
                        title={`${coverage}% de cobertura`}
                      />
                    </div>
                  </th>

                  {MATRIX_MODULES.flatMap((module) =>
                    module.resources.map((resource) => {
                      const checked = list.includes(resource.id)
                      return (
                        <td key={resource.id} className="!px-1 !py-2 text-center">
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={checked}
                            aria-label={`${resource.label} · ${module.label} para ${role.label}`}
                            disabled={!canEdit}
                            onClick={() => onToggle(role.id, resource.id)}
                            className={cn(
                              'group grid h-8 w-8 place-items-center rounded-md border transition-all duration-200 ease-shield',
                              canEdit && 'hover:scale-110',
                              checked
                                ? 'border-accent/70 bg-accent/18 text-accent'
                                : 'border-line/30 text-muted/35 hover:border-danger/50 hover:text-danger/70',
                              !canEdit && 'cursor-not-allowed opacity-70',
                            )}
                          >
                            {checked ? (
                              <motion.span
                                key="on"
                                initial={{ scale: 0.4, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{ type: 'spring', stiffness: 420, damping: 18 }}
                              >
                                <Check className="h-4 w-4" strokeWidth={3} />
                              </motion.span>
                            ) : (
                              <X className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-70" />
                            )}
                          </button>
                        </td>
                      )
                    }),
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
