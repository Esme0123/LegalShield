import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Activity,
  Download,
  FileText,
  Filter,
  QrCode,
  RefreshCcw,
  Radio,
  ShieldCheck,
} from 'lucide-react'
import TearTicket from '@/components/reactbits/TearTicket'
import { Badge, SectionTitle } from '@/components/ui/primitives'
import { useAppStore } from '@/store/useAppStore'
import { toast } from '@/store/toastStore'
import { exportCsv, exportPdf } from '@/lib/exporters'
import { cn } from '@/lib/cn'
import { formatDateTime } from '@/lib/format'

const SEVERITY = {
  info: { tone: 'info', cls: 'text-info', dot: 'bg-info' },
  warn: { tone: 'accent', cls: 'text-accent', dot: 'bg-accent' },
  critico: { tone: 'danger', cls: 'text-danger', dot: 'bg-danger' },
}

/** Clasificación de eventos: acceso/control (seguridad) vs. negocio. */
const SECURITY_TYPES = new Set([
  'AUTH_SUCCESS',
  'AUTH_FAILED',
  'AUTH_LOCKED',
  'AUTH_DISABLED',
  'AUTH_UNLOCK',
  'LOGIN_LOCKED',
  'LOGOUT',
  'REGISTER',
  'TOKEN_REFRESH',
  'TOKEN_ISSUED',
  'PASSWORD_CHANGED',
  'PASSWORD_CHANGE_FAILED',
  'ACCESS_DENIED',
  'RATE_LIMITED',
  'USER_CREATED',
  'USER_UPDATED',
  'USER_DEACTIVATED',
  'USER_REACTIVATED',
  'USER_UNLOCKED',
  'ACCOUNT_UNLOCK_TOKEN_GENERATED',
  'ACCOUNT_UNLOCKED_VIA_TOKEN',
  'UNLOCK_TOKEN_FAILED',
  'UNLOCK_TOKEN_EXPIRED_ATTEMPT',
  'UNLOCK_TOKEN_REUSE_ATTEMPT',
  'UNLOCK_TOKEN_EXHAUSTED',
  'UNLOCK_TOKEN_ISSUE_LIMITED',
  'PASSWORD_CHANGE_REQUIRED',
  'REGISTRATION_BLOCKED',
  'PERMISSION_CHANGED',
  'PERMISSION_DENIED',
  'INTRUSION_BLOCKED',
])

const FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'seguridad', label: 'Seguridad' },
  { id: 'operativo', label: 'Operativos' },
]

const TYPE_TONE = {
  AUTH_SUCCESS: 'text-accent',
  AUTH_FAILED: 'text-ok',
  AUTH_LOCKED: 'text-danger',
  AUTH_DISABLED: 'text-danger',
  AUTH_UNLOCK: 'text-ok',
  LOGOUT: 'text-muted',
  LOGIN_LOCKED: 'text-danger',
  REGISTER: 'text-info',
  TOKEN_REFRESH: 'text-info',
  PASSWORD_CHANGED: 'text-accent',
  PASSWORD_CHANGE_FAILED: 'text-danger',
  ACCESS_DENIED: 'text-danger',
  RATE_LIMITED: 'text-danger',
  USER_CREATED: 'text-ok',
  USER_UPDATED: 'text-accent',
  USER_DEACTIVATED: 'text-danger',
  USER_REACTIVATED: 'text-ok',
  USER_UNLOCKED: 'text-ok',
  ACCOUNT_UNLOCK_TOKEN_GENERATED: 'text-info',
  ACCOUNT_UNLOCKED_VIA_TOKEN: 'text-ok',
  UNLOCK_TOKEN_FAILED: 'text-danger',
  UNLOCK_TOKEN_EXPIRED_ATTEMPT: 'text-danger',
  UNLOCK_TOKEN_REUSE_ATTEMPT: 'text-danger',
  UNLOCK_TOKEN_EXHAUSTED: 'text-danger',
  UNLOCK_TOKEN_ISSUE_LIMITED: 'text-danger',
  PASSWORD_CHANGE_REQUIRED: 'text-accent',
  REGISTRATION_BLOCKED: 'text-warn',
  PERMISSION_CHANGED: 'text-accent',
  PERMISSION_DENIED: 'text-danger',
  DOC_REVEALED: 'text-ok',
  CASE_ARCHIVED: 'text-info',
  TOKEN_ISSUED: 'text-danger',
  AUDIT_RECEIPT: 'text-info',
  INTRUSION_BLOCKED: 'text-danger',
  CONTROL_ASSESSED: 'text-muted',
  RISK_REVIEWED: 'text-ok',
}

export default function Audit() {
  // Bitacora de SEGURIDAD: eventos de acceso y control, exclusiva del OSI.
  const logs = useAppStore((s) => s.logs)
  const session = useAppStore((s) => s.session)
  const liveFeedOn = useAppStore((s) => s.liveFeedOn)
  const loadSecurityLogs = useAppStore((s) => s.loadSecurityLogs)
  const receipts = useAppStore((s) => s.receipts)
  const tokens = useAppStore((s) => s.tokens)
  const issueReceipt = useAppStore((s) => s.issueReceipt)
  const tearReceipt = useAppStore((s) => s.tearReceipt)
  const issueResetToken = useAppStore((s) => s.issueResetToken)
  const tearToken = useAppStore((s) => s.tearToken)
  const hasPermission = useAppStore((s) => s.hasPermission)

  const [category, setCategory] = useState('all')
  const [query, setQuery] = useState('')
  const [tick, setTick] = useState(0)

  const canView = hasPermission('SECURITY_LOGS_VIEW')
  const canExport = hasPermission('LOGS_EXPORT')
  const canTokens = hasPermission('ACCOUNT_UNLOCK') || hasPermission('TOKEN_RESET')

  useEffect(() => {
    loadSecurityLogs()
  }, [loadSecurityLogs])

  useEffect(() => {
    if (!liveFeedOn) return undefined
    const timer = setInterval(() => loadSecurityLogs(), 8000)
    return () => clearInterval(timer)
  }, [liveFeedOn, loadSecurityLogs])

  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 30000)
    return () => clearInterval(timer)
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return logs.filter((l) => {
      const isSecurity = SECURITY_TYPES.has(l.type)
      const okCategory =
        category === 'all' || (category === 'seguridad' ? isSecurity : !isSecurity)
      const okQuery =
        !q ||
        [l.type, l.actor, l.message, l.target].join(' ').toLowerCase().includes(q)
      return okCategory && okQuery
    })
  }, [logs, category, query])

  const exportStamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')

  const handleExportCsv = () => {
    if (!canExport) {
      toast.danger('Exportacion bloqueada', 'LOGS_EXPORT no esta habilitado para tu rol')
      return
    }
    const headers = ['Marca', 'Fecha', 'Hora', 'Evento', 'Clasificacion', 'Actor', 'Objetivo', 'Detalle']
    const rows = filtered.map((l) => {
      const ts = formatDateTime(l.ts)
      return [l.id, ts.date, ts.time, l.type, l.severity, l.actor, l.target, l.message]
    })
    exportCsv(`bitacora-seguridad-${exportStamp()}.csv`, headers, rows)
    toast.info('CSV descargado', `${filtered.length} eventos exportados`)
  }

  const handleExportPdf = async () => {
    if (!canExport) {
      toast.danger('Exportacion bloqueada', 'LOGS_EXPORT no esta habilitado para tu rol')
      return
    }
    const scope = FILTERS.find((f) => f.id === category)?.label ?? 'Todos'
    try {
      await exportPdf({
        filename: `bitacora-seguridad-${exportStamp()}.pdf`,
        title: 'LegalShield · Bitácora de Seguridad',
        rows: filtered,
        filter: scope,
        generatedBy: session?.name ?? session?.userId ?? 'Usuario LegalShield',
      })
      toast.info('PDF descargado', `${filtered.length} eventos exportados`)
    } catch (error) {
      toast.danger('No se pudo exportar el PDF', error.message)
    }
  }

  const activeTokens = tokens.filter((t) => t.status === 'activo')

  if (!canView) {
    return (
      <div className="ls-card grid place-items-center gap-2 p-12 text-center">
        <ShieldCheck className="h-8 w-8 text-danger" />
        <p className="font-display text-sm font-bold">Acceso denegado · SECURITY_LOGS_VIEW requerido</p>
        <p className="max-w-sm text-[12px] text-muted">
          La bitacora de seguridad solo se abre al Oficial de Seguridad (OSI). Solicite a un OSI que
          reevalue la matriz de roles.
        </p>
      </div>
    )
  }

  return (
    <div className="relative">
      <div className="space-y-5">
        <SectionTitle
          icon={Activity}
          title="Bitácora de seguridad"
          subtitle="Eventos de acceso y control en vivo · inspeccione cualquier fila con la linterna para amplificar su traza"
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={handleExportCsv} className="ls-btn-secondary text-xs">
                <Download className="h-3.5 w-3.5" /> Exportar CSV
              </button>
              <button type="button" onClick={handleExportPdf} className="ls-btn-secondary text-xs">
                <FileText className="h-3.5 w-3.5" /> Exportar PDF
              </button>
            </div>
          }
        />

        <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
          {/* Tabla */}
          <div className="ls-card overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b border-line/40 p-3">
              <Radio
                className={cn(
                  'h-4 w-4 shrink-0 transition-colors',
                  liveFeedOn ? 'animate-pulse text-accent' : 'text-muted',
                )}
              />
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
                Flujo en vivo
              </span>
              <Badge tone={liveFeedOn ? 'accent' : 'neutral'} pulse={liveFeedOn}>
                {liveFeedOn ? 'ESCUCHANDO' : 'EN PAUSA'}
              </Badge>

              <div className="ml-auto flex flex-wrap items-center gap-1.5">
                <Filter className="h-3.5 w-3.5 text-muted" />
                {FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setCategory(f.id)}
                    className={cn(
                      'rounded-full border px-2.5 py-0.5 font-mono text-[10px] uppercase transition-all duration-300',
                      category === f.id
                        ? 'border-accent/70 bg-accent/15 text-accent'
                        : 'border-line/50 text-muted hover:text-ink',
                    )}
                  >
                    {f.label}
                  </button>
                ))}
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="filtrar…"
                  className="ls-input h-8 w-32 py-1 font-mono text-[11px]"
                  aria-label="Filtrar logs"
                />
              </div>
            </div>

            <div className="max-h-[32rem] overflow-auto">
              <table className="ls-table">
                <thead>
                  <tr>
                    <th>Marca</th>
                    <th>Evento</th>
                    <th>Actor</th>
                    <th className="hidden sm:table-cell">Detalle</th>
                    <th className="text-right">Accion</th>
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence initial={false}>
                    {filtered.map((l) => {
                      const ts = formatDateTime(l.ts)
                      return (
                        <motion.tr
                          key={l.id}
                          layout
                          data-inspect={l.id}
                          initial={{ opacity: 0, backgroundColor: 'rgb(var(--ls-accent) / 0.18)' }}
                          animate={{ opacity: 1, backgroundColor: 'rgba(0,0,0,0)' }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.45 }}
                          className="group cursor-crosshair"
                        >
                          <td className="whitespace-nowrap font-mono text-[10px] text-muted">
                            <span className="flex items-center gap-1.5">
                              <span className={cn('h-1.5 w-1.5 rounded-full', SEVERITY[l.severity].dot)} />
                              {ts.time}
                            </span>
                            <span className="text-[9px] opacity-70">{ts.date}</span>
                          </td>
                          <td>
                            <span className={cn('font-mono text-[10.5px] font-bold', TYPE_TONE[l.type] ?? 'text-info')}>
                              {l.type}
                            </span>
                          </td>
                          <td className="whitespace-nowrap font-mono text-[10.5px] text-ink">{l.actor}</td>
                          <td className="hidden max-w-md sm:table-cell">
                            <p className="line-clamp-2 text-[11.5px] leading-snug text-ink/85">{l.message}</p>
                            <p className="font-mono text-[9.5px] text-muted">target: {l.target}</p>
                          </td>
                          <td className="text-right">
                            <button
                              type="button"
                              onClick={() => {
                                const r = issueReceipt({
                                  title: 'Comprobante de auditoria',
                                  subject: l.message,
                                  logId: l.id,
                                })
                                toast.info('Comprobante emitido', `${r.id} listo para rasgar y validar`)
                              }}
                              className="inline-flex items-center gap-1 rounded-md border border-line/60 px-2 py-1 font-mono text-[10px] text-muted opacity-0 transition-all duration-300 hover:border-accent/70 hover:text-accent group-hover:opacity-100"
                            >
                              <QrCode className="h-3 w-3" /> Comprobante
                            </button>
                          </td>
                        </motion.tr>
                      )
                    })}
                  </AnimatePresence>
                </tbody>
              </table>
              {filtered.length === 0 && (
                <p className="p-8 text-center text-[12px] text-muted">
                  Ningun evento coincide con el filtro actual.
                </p>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-line/40 px-3 py-2 font-mono text-[10px] text-muted">
              <span>{filtered.length} de {logs.length} eventos</span>
              <span>reloj de sesion · {tick}s</span>
            </div>
          </div>

          {/* Comprobantes y tokens */}
          <div className="space-y-4">
            <div className="ls-card p-4">
              <SectionTitle
                icon={QrCode}
                title="Tear Ticket · comprobantes"
                subtitle="Rasure la linea de perforacion para validar el sello"
                actions={
                  <button
                    type="button"
                    onClick={() => {
                      const r = issueReceipt({
                        title: 'Certificado de integridad',
                        subject: `Cierre de bitacora · ${logs.length} eventos sellados`,
                      })
                      toast.info('Comprobante emitido', r.id)
                    }}
                    className="ls-btn-ghost text-[11px]"
                  >
                    <RefreshCcw className="h-3.5 w-3.5" /> Emitir
                  </button>
                }
              />
              <div className="space-y-3">
                {receipts.slice(0, 4).map((r) => (
                  <TearTicket
                    key={r.id}
                    serial={r.serial}
                    title={r.title}
                    subject={r.subject}
                    hash={r.hash}
                    signer={r.signer}
                    issuedAt={r.issuedAt}
                    status={r.status}
                    onTear={() => {
                      tearReceipt(r.id)
                      toast.pastel('Comprobante validado', `${r.id} · sello consumido, uso unico`)
                    }}
                  />
                ))}
              </div>
            </div>

            <div className="ls-card p-4">
              <SectionTitle
                icon={ShieldCheck}
                title="Tokens de desbloqueo"
                subtitle="Código temporal válido por 15 minutos y de uso único"
                actions={
                  canTokens ? (
                    <button
                      type="button"
                      onClick={() => {
                        const target = logs.find((l) => l.type === 'AUTH_LOCKED' || l.type === 'LOGIN_LOCKED')?.actor
                        if (!target) {
                          toast.info('Sin cuentas bloqueadas', 'No hay bloqueos recientes que requieran token')
                          return
                        }
                        const tk = issueResetToken(target)
                        toast.info('Token emitido', `${tk.id} para ${tk.userId} · válido 15 minutos`)
                      }}
                      className="ls-btn-ghost text-[11px]"
                    >
                      <RefreshCcw className="h-3.5 w-3.5" /> Emitir
                    </button>
                  ) : (
                    <Badge tone="danger">ACCOUNT_UNLOCK denegado</Badge>
                  )
                }
              />
              {tokens.length === 0 ? (
                <p className="text-[12px] text-muted">Sin tokens emitidos en esta sesion.</p>
              ) : (
                <div className="space-y-3">
                  {tokens.slice(0, 3).map((t) => (
                    <TearTicket
                      key={t.id}
                      kind="token"
                      serial={t.id}
                      title="Token temporal"
                      subject={`Desbloqueo de clave para ${t.userId} · uso unico · valido 15 minutos`}
                      hash={`${Math.abs(t.userId.length * 977)}f2a91c4d`}
                      signer="LegalShield Auth"
                      issuedAt={t.issuedAt}
                      status={t.status === 'consumido' ? 'validado' : 'disponible'}
                      onTear={() => {
                        tearToken(t.id)
                        toast.info('Token consumido', `${t.id} invalidado tras el uso`)
                      }}
                    />
                  ))}
                </div>
              )}
              {activeTokens.length > 0 && (
                <p className="mt-3 font-mono text-[10px] text-muted">
                  <span className="text-accent">{activeTokens.length}</span> token(s) activos · rotacion
                  recomendada cada 15 min
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}