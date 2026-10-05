import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Activity,
  Download,
  Filter,
  Pause,
  Play,
  QrCode,
  RefreshCcw,
  Radio,
  ShieldCheck,
} from 'lucide-react'
import GlowCursor from '@/components/reactbits/GlowCursor'
import TearTicket from '@/components/reactbits/TearTicket'
import { Badge, SectionTitle } from '@/components/ui/primitives'
import { useAppStore } from '@/store/useAppStore'
import { toast } from '@/store/toastStore'
import { cn } from '@/lib/cn'
import { formatDateTime } from '@/lib/format'

const SEVERITY = {
  info: { tone: 'info', cls: 'text-info', dot: 'bg-info' },
  warn: { tone: 'accent', cls: 'text-accent', dot: 'bg-accent' },
  critico: { tone: 'danger', cls: 'text-danger', dot: 'bg-danger' },
}

const TYPE_TONE = {
  AUTH_SUCCESS: 'text-accent',
  AUTH_FAILED: 'text-pastel',
  AUTH_LOGOUT: 'text-muted',
  LOGIN_LOCKED: 'text-danger',
  UNLOCK_REQUESTED: 'text-pastel',
  PERMISSION_CHANGED: 'text-accent',
  PERMISSION_DENIED: 'text-danger',
  DOC_REVEALED: 'text-pastel',
  CASE_ARCHIVED: 'text-info',
  TOKEN_ISSUED: 'text-danger',
  AUDIT_RECEIPT: 'text-info',
  INTRUSION_BLOCKED: 'text-danger',
  CONTROL_ASSESSED: 'text-muted',
  RISK_REVIEWED: 'text-pastel',
}

export default function Audit() {
  const logs = useAppStore((s) => s.logs)
  const liveFeedOn = useAppStore((s) => s.liveFeedOn)
  const setLiveFeed = useAppStore((s) => s.setLiveFeed)
  const tickLiveFeed = useAppStore((s) => s.tickLiveFeed)
  const receipts = useAppStore((s) => s.receipts)
  const tokens = useAppStore((s) => s.tokens)
  const issueReceipt = useAppStore((s) => s.issueReceipt)
  const tearReceipt = useAppStore((s) => s.tearReceipt)
  const issueResetToken = useAppStore((s) => s.issueResetToken)
  const tearToken = useAppStore((s) => s.tearToken)
  const hasPermission = useAppStore((s) => s.hasPermission)

  const [severity, setSeverity] = useState('all')
  const [query, setQuery] = useState('')
  const [tick, setTick] = useState(0)

  const canView = hasPermission('LOGS_VIEW')
  const canExport = hasPermission('LOGS_EXPORT')
  const canTokens = hasPermission('TOKEN_RESET')

  useEffect(() => {
    if (!liveFeedOn) return undefined
    const timer = setInterval(tickLiveFeed, 4200)
    return () => clearInterval(timer)
  }, [liveFeedOn, tickLiveFeed])

  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 30000)
    return () => clearInterval(timer)
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return logs.filter((l) => {
      const okSeverity = severity === 'all' || l.severity === severity
      const okQuery =
        !q ||
        [l.type, l.actor, l.message, l.target].join(' ').toLowerCase().includes(q)
      return okSeverity && okQuery
    })
  }, [logs, severity, query])

  const activeTokens = tokens.filter((t) => t.status === 'activo')

  if (!canView) {
    return (
      <div className="ls-card grid place-items-center gap-2 p-12 text-center">
        <ShieldCheck className="h-8 w-8 text-danger" />
        <p className="font-display text-sm font-bold">Acceso denegado · LOGS_VIEW requerido</p>
        <p className="max-w-sm text-[12px] text-muted">
          La bitacora forense solo se abre a roles con permiso de auditoria. Solicite a un Socio que
          reevalue la matriz RBAC.
        </p>
      </div>
    )
  }

  return (
    <div className="relative">
      {/* Linterna de inspeccion forense */}
      <GlowCursor />

      <div className="space-y-5">
        <SectionTitle
          icon={Activity}
          title="Bitacora de auditoria y seguridad"
          subtitle="Flujo en vivo · inspeccione cualquier fila con la linterna para amplificar su traza"
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setLiveFeed((v) => !v)}
                className={cn('ls-btn-secondary text-xs', liveFeedOn && 'border-accent/70 text-accent')}
              >
                {liveFeedOn ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                {liveFeedOn ? 'Pausar flujo' : 'Reanudar flujo'}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!canExport) {
                    toast.danger('Exportacion bloqueada', 'LOGS_EXPORT no esta habilitado para tu rol')
                    return
                  }
                  toast.info('Exportacion preparada', `${filtered.length} eventos · CSV con sello SHA-256`)
                }}
                className="ls-btn-secondary text-xs"
              >
                <Download className="h-3.5 w-3.5" /> Exportar CSV
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
                {['all', 'info', 'warn', 'critico'].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSeverity(s)}
                    className={cn(
                      'rounded-full border px-2.5 py-0.5 font-mono text-[10px] uppercase transition-all duration-300',
                      severity === s
                        ? 'border-accent/70 bg-accent/15 text-accent'
                        : 'border-line/50 text-muted hover:text-ink',
                    )}
                  >
                    {s}
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
                title="Tokens JWT de reseteo"
                subtitle="Emision temporal con TTL 900 s y consumo unico"
                actions={
                  canTokens ? (
                    <button
                      type="button"
                      onClick={() => {
                        const target = logs.find((l) => l.type === 'LOGIN_LOCKED')?.actor ?? 'LEG-2026-0411'
                        const tk = issueResetToken(target)
                        toast.danger('Token emitido', `${tk.id} para ${tk.userId} · TTL 900 s`)
                      }}
                      className="ls-btn-ghost text-[11px]"
                    >
                      <RefreshCcw className="h-3.5 w-3.5" /> Emitir
                    </button>
                  ) : (
                    <Badge tone="danger">TOKEN_RESET denegado</Badge>
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
                      subject={`Reseteo de clave para ${t.userId} · uso unico · TTL ${t.ttl}s`}
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