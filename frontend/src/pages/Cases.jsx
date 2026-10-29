import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Archive,
  Eye,
  EyeOff,
  FileText,
  FolderPlus,
  Gavel,
  Lock,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import PaperCrumple from '@/components/reactbits/PaperCrumple'
import DitherVeil from '@/components/reactbits/DitherVeil'
import { Badge, EmptyState, Progress, RiskBadge, SectionTitle } from '@/components/ui/primitives'
import { useAppStore } from '@/store/useAppStore'
import { toast } from '@/store/toastStore'
import { cn } from '@/lib/cn'
import { formatDateTime } from '@/lib/format'

function DocumentPreview({ doc }) {
  const lines = useMemo(
    () =>
      Array.from({ length: 9 }, (_, i) => ({
        w: 40 + ((i * 37) % 55),
        o: i % 4 === 0,
      })),
    [],
  )
  return (
    <div className="rounded-lg border border-lineSoft/30 bg-[#f3ecb0] p-3 text-navy">
      <div className="mb-2 flex items-center justify-between border-b border-navy/20 pb-1.5">
        <span className="font-mono text-[9px] font-bold uppercase tracking-[0.16em]">
          LegalShield · documento
        </span>
        <span className="font-mono text-[9px]">{doc.pages} pags</span>
      </div>
      <div className="space-y-1">
        <p className="font-display text-[11px] font-bold">{doc.name}</p>
        {doc.content ? (
          <p className="max-h-40 overflow-auto whitespace-pre-wrap font-mono text-[9.5px] leading-relaxed">
            {doc.content}
          </p>
        ) : (
          lines.map((l, i) => (
            <span
              key={i}
              className={cn('block h-1 rounded-full', l.o ? 'bg-indigo/60' : 'bg-navy/25')}
              style={{ width: `${l.w}%` }}
            />
          ))
        )}
      </div>
      <p className="mt-2 font-mono text-[8.5px] opacity-70">
        Clasificacion: {doc.classification} · sello SHA-256 pendiente de firma
      </p>
    </div>
  )
}

const MATTERS = ['Civil', 'Penal', 'Laboral', 'Familia', 'Comercial', 'Administrativo', 'Agrario', 'Constitucional', 'Tributario']
const STAGES = ['Demanda', 'Contestacion', 'Prueba', 'Alegatos', 'Sentencia', 'Apelacion', 'Ejecucion']
const RISKS = [
  { value: 'baja', label: 'Baja' },
  { value: 'media', label: 'Media' },
  { value: 'alta', label: 'Alta' },
  { value: 'critica', label: 'Crítica' },
]

/**
 * Alta de expediente. El abogado queda como titular automaticamente; el socio
 * puede asignarlo a otro abogado. Asistente y cliente son opcionales y solo
 * ellos (ademas del titular) veran el caso.
 */
function NewCaseModal({ onClose, onCreated }) {
  const createCase = useAppStore((s) => s.createCase)
  const loadCaseAssignees = useAppStore((s) => s.loadCaseAssignees)
  const session = useAppStore((s) => s.session)
  const canAssignLawyer = useAppStore((s) => s.hasPermission('CASES_READ_ALL'))

  const [people, setPeople] = useState({ lawyers: [], assistants: [], clients: [] })
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({
    title: '',
    clientName: '',
    matter: 'Civil',
    court: '',
    stage: 'Demanda',
    riskLevel: 'media',
    deadline: '',
    ownerUserCode: '',
    assistantCode: '',
    clientCode: '',
    isPrivileged: false,
  })

  useEffect(() => {
    loadCaseAssignees()
      .then(setPeople)
      .catch((error) => toast.danger('No se pudo cargar el equipo', error.message))
  }, [loadCaseAssignees])

  const set = (key) => (e) =>
    setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  const ready = form.title.trim().length > 3 && form.clientName.trim().length > 2

  const submit = async (e) => {
    e.preventDefault()
    if (!ready || busy) return
    setBusy(true)
    try {
      const created = await createCase({
        ...form,
        title: form.title.trim(),
        clientName: form.clientName.trim(),
        court: form.court.trim(),
        deadline: form.deadline || null,
        ownerUserCode: canAssignLawyer ? form.ownerUserCode || undefined : undefined,
      })
      toast.mint('Expediente creado', `${created.id} · ${created.title}`)
      onCreated(created)
    } catch (error) {
      toast.danger('No se pudo crear el expediente', error.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[70] grid place-items-center bg-navy/70 p-4 backdrop-blur-sm"
      onClick={busy ? undefined : onClose}
    >
      <motion.form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 260, damping: 26 }}
        className="ls-card max-h-[90vh] w-full max-w-xl overflow-y-auto p-5 sm:p-6"
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-base font-bold text-ink">Nuevo expediente</h3>
            <p className="mt-0.5 text-[11.5px] text-muted">
              {canAssignLawyer
                ? 'El número EXP-AAAA-NNNN se asigna automáticamente.'
                : `Quedará a su cargo (${session?.userId ?? 'usted'}) · el número se asigna automáticamente.`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted transition hover:bg-surface2/60 hover:text-ink"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          <label className="block">
            <span className="ls-label">Título del caso *</span>
            <input
              value={form.title}
              onChange={set('title')}
              className="ls-input"
              placeholder="Ej. Despido injustificado · Comercial Illimani"
              autoFocus
            />
          </label>

          <label className="block">
            <span className="ls-label">Cliente (persona o razón social) *</span>
            <input
              value={form.clientName}
              onChange={set('clientName')}
              className="ls-input"
              placeholder="Ej. Comercial Illimani S.R.L. o Juan Carlos Mamani"
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="ls-label">Materia</span>
              <select value={form.matter} onChange={set('matter')} className="ls-input">
                {MATTERS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="ls-label">Etapa procesal</span>
              <select value={form.stage} onChange={set('stage')} className="ls-input">
                {STAGES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="ls-label">Juzgado o instancia</span>
            <input
              value={form.court}
              onChange={set('court')}
              className="ls-input"
              placeholder="Ej. Juzgado Público Civil y Comercial 5.º de La Paz"
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="ls-label">Nivel de riesgo</span>
              <select value={form.riskLevel} onChange={set('riskLevel')} className="ls-input">
                {RISKS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="ls-label">Vencimiento del plazo</span>
              <input type="date" value={form.deadline} onChange={set('deadline')} className="ls-input" />
            </label>
          </div>

          <div className="ls-panel space-y-3 p-3">
            <p className="flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.16em] text-muted">
              <Users className="h-3.5 w-3.5" /> Equipo del expediente · solo ellos lo verán
            </p>
            {canAssignLawyer && (
              <label className="block">
                <span className="ls-label">Abogado titular</span>
                <select value={form.ownerUserCode} onChange={set('ownerUserCode')} className="ls-input">
                  <option value="">Yo ({session?.userId})</option>
                  {people.lawyers.map((p) => (
                    <option key={p.userCode} value={p.userCode}>{p.username} · {p.userCode}</option>
                  ))}
                </select>
              </label>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="ls-label">Asistente de apoyo</span>
                <select value={form.assistantCode} onChange={set('assistantCode')} className="ls-input">
                  <option value="">Sin asistente</option>
                  {people.assistants.map((p) => (
                    <option key={p.userCode} value={p.userCode}>{p.username} · {p.userCode}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="ls-label">Cuenta del cliente</span>
                <select value={form.clientCode} onChange={set('clientCode')} className="ls-input">
                  <option value="">Sin cuenta vinculada</option>
                  {people.clients.map((p) => (
                    <option key={p.userCode} value={p.userCode}>{p.username} · {p.userCode}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <label className="flex items-start gap-2.5 text-[12px] text-ink/85">
            <input
              type="checkbox"
              checked={form.isPrivileged}
              onChange={set('isPrivileged')}
              className="mt-0.5 h-4 w-4 accent-[rgb(var(--ls-accent))]"
            />
            Contiene asesoría jurídica privilegiada (secreto profesional)
          </label>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="ls-btn-ghost text-xs">
            Cancelar
          </button>
          <button type="submit" disabled={!ready || busy} className="ls-btn-primary text-xs">
            <FolderPlus className="h-3.5 w-3.5" /> {busy ? 'Creando…' : 'Crear expediente'}
          </button>
        </div>
      </motion.form>
    </motion.div>
  )
}

export default function Cases() {
  const cases = useAppStore((s) => s.cases)
  const archiveCase = useAppStore((s) => s.archiveCase)
  const loadCases = useAppStore((s) => s.loadCases)
  const loadCaseDocuments = useAppStore((s) => s.loadCaseDocuments)
  const updateCaseProgress = useAppStore((s) => s.updateCaseProgress)
  const revealedDocs = useAppStore((s) => s.revealedDocs)
  const revealDocument = useAppStore((s) => s.revealDocument)
  const concealDocument = useAppStore((s) => s.concealDocument)
  const hasPermission = useAppStore((s) => s.hasPermission)
  const session = useAppStore((s) => s.session)
  const activityLogs = useAppStore((s) => s.activityLogs)
  const loadActivityLogs = useAppStore((s) => s.loadActivityLogs)

  const [selectedId, setSelectedId] = useState(null)
  const [crumpling, setCrumpling] = useState(null)
  const [progressDraft, setProgressDraft] = useState(0)
  const [savingProgress, setSavingProgress] = useState(false)
  const [creating, setCreating] = useState(false)

  const canRead = hasPermission('CASES_READ')
  const canCreate = hasPermission('CASES_CREATE')
  const canArchive = hasPermission('CASES_ARCHIVE')
  const canWrite = hasPermission('CASES_WRITE')
  const canRevealDocs = hasPermission('DOCS_REVEAL')

  useEffect(() => {
    if (!canRead) return
    loadCases()
    loadActivityLogs()
  }, [canRead, loadCases, loadActivityLogs])

  const selected = cases.find((c) => c.id === selectedId) ?? cases[0]

  useEffect(() => {
    if (selected?.dbId) loadCaseDocuments(selected.dbId)
  }, [selected?.dbId, loadCaseDocuments])

  useEffect(() => {
    setProgressDraft(selected?.progress ?? 0)
  }, [selected?.id, selected?.progress])

  const handleArchiveCase = (id) => {
    if (!canArchive) {
      toast.danger('Acceso denegado', 'No dispone de autorización para archivar este expediente.')
      return
    }
    if (crumpling) return
    setCrumpling(id)
  }

  const finishArchive = async (id) => {
    const target = cases.find((c) => c.id === id)
    try {
      await archiveCase(id)
      if (selectedId === id) setSelectedId(null)
      toast.mint(
        'Expediente archivado',
        `${id} · ${target?.title ?? 'Expediente'} arrugado y sellado con integridad`,
      )
    } catch (error) {
      await loadCases({ status: 'abierto,en_tramite,suspendido' })
      toast.danger('No se pudo archivar el expediente', error.message)
    } finally {
      setCrumpling(null)
    }
  }

  const handleSaveProgress = async () => {
    if (!selected) return
    setSavingProgress(true)
    try {
      const saved = await updateCaseProgress(selected.id, progressDraft)
      setProgressDraft(saved)
      toast.mint(
        'Avance actualizado',
        `${selected.id} · ${saved}% registrado en activity_logs`,
      )
    } catch (error) {
      setProgressDraft(selected.progress)
      toast.danger('No se pudo guardar el avance', error.message)
    } finally {
      setSavingProgress(false)
    }
  }

  const onReveal = async (docId, meta) => {
    try {
      const data = await revealDocument(docId, meta)
      toast.info(
        'Documento revelado',
        `${docId} · ${data.justification} · justificacion registrada en activity_logs`,
        ShieldCheck,
      )
    } catch (error) {
      toast.danger('No se pudo revelar el documento', error.message)
      throw error
    }
  }

  const exportRows = cases.map((c) => ({
    code: c.id,
    title: c.title,
    client: c.client,
    matter: c.matter,
    court: c.court,
    stage: c.stage,
    risk: c.risk,
    progress: c.progress,
    deadline: c.deadline,
  }))

  if (!canRead) {
    return (
      <div className="ls-card grid place-items-center gap-2 p-12 text-center">
        <Lock className="h-8 w-8 text-danger" />
        <p className="font-display text-sm font-bold">Acceso denegado · CASES_READ requerido</p>
        <p className="max-w-sm text-[12px] text-muted">
          Los expedientes están protegidos por secreto profesional. El Oficial de Seguridad administra
          el sistema, pero no accede al contenido de los casos.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <SectionTitle
        icon={Gavel}
        title="Expedientes judiciales"
        subtitle={
          hasPermission('CASES_READ_ALL')
            ? 'Todos los expedientes del despacho'
            : 'Solo los expedientes donde usted forma parte del equipo'
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {canCreate && (
              <button type="button" onClick={() => setCreating(true)} className="ls-btn-primary text-xs">
                <FolderPlus className="h-3.5 w-3.5" /> Nuevo expediente
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                import('@/lib/caseExports')
                  .then(({ exportCasesPdf }) => exportCasesPdf({
                    filename: `expedientes_${new Date().toISOString().slice(0, 10)}.pdf`,
                    rows: exportRows,
                    generatedBy: session?.name ?? session?.userId,
                  }))
                  .catch((error) => toast.danger('No se pudo exportar el PDF', error.message))
              }}
              className="ls-btn-secondary text-xs"
            >
              Exportar PDF
            </button>
            <button
              type="button"
              onClick={() => {
                import('@/lib/caseExports')
                  .then(({ exportCasesExcel }) => exportCasesExcel({
                    filename: `expedientes_${new Date().toISOString().slice(0, 10)}.xlsx`,
                    rows: exportRows,
                    generatedBy: session?.name ?? session?.userId,
                  }))
                  .catch((error) => toast.danger('No se pudo exportar el Excel', error.message))
              }}
              className="ls-btn-secondary text-xs"
            >
              Exportar Excel
            </button>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
        {/* Lista */}
        <div className="space-y-2.5">
          {cases.length === 0 && (
            <EmptyState
              icon={Archive}
              title="Sin expedientes activos"
              description={
                canCreate
                  ? 'Aún no tiene expedientes. Cree el primero con «Nuevo expediente».'
                  : 'Todavía no forma parte del equipo de ningún expediente.'
              }
            />
          )}

          {cases.map((c, i) => (
            <PaperCrumple
              key={c.id}
              crumpled={crumpling === c.id}
              onComplete={() => finishArchive(c.id)}
            >
              <motion.div
                role="button"
                tabIndex={0}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                onClick={() => setSelectedId(c.id)}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setSelectedId(c.id)
                  }
                }}
                className={cn(
                  'group w-full cursor-pointer rounded-xl border p-3.5 text-left transition-all duration-300 ease-shield focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
                  selected?.id === c.id
                    ? 'border-accent/70 bg-accent/10 shadow-glow'
                    : 'border-line/50 bg-surface/70 hover:border-accent/50 hover:bg-surface2/40',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-mono text-[10px] text-info">{c.id}</span>
                  <RiskBadge risk={c.risk} />
                </div>
                <p className="mt-1 line-clamp-2 text-[13px] font-semibold leading-snug">{c.title}</p>
                <p className="mt-1 truncate font-mono text-[10px] text-muted">{c.court}</p>

                <div className="mt-2.5 flex items-center gap-2">
                  <Badge tone="info">{c.stage}</Badge>
                  <span className="font-mono text-[10px] text-muted">
                    {formatDateTime(`${c.deadline}T12:00:00`).date}
                  </span>
                </div>
                <Progress value={c.progress} className="mt-2" />

                <div className="mt-2.5 flex items-center justify-between">
                  <span className="font-mono text-[10px] text-muted">
                    {canRevealDocs ? c.documentCount : c.publicDocumentCount} docs ·{' '}
                    {c.privileged ? 'privilegiado' : 'no privilegiado'}
                  </span>
                  {canArchive && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleArchiveCase(c.id)
                    }}
                    disabled={Boolean(crumpling)}
                    className="inline-flex items-center gap-1 rounded px-1 text-[10.5px] text-danger opacity-0 transition-opacity duration-300 hover:underline focus-visible:opacity-100 group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Trash2 className="h-3 w-3" /> archivar
                  </button>
                  )}
                </div>
              </motion.div>
            </PaperCrumple>
          ))}

          {selected && canArchive && (
            <button
              type="button"
              onClick={() => handleArchiveCase(selected.id)}
              disabled={Boolean(crumpling)}
              className="ls-btn-danger w-full text-xs"
            >
              <Trash2 className="h-3.5 w-3.5" /> Archivar con Paper Crumple
            </button>
          )}
        </div>

        {/* Detalle */}
        <AnimatePresence mode="wait">
          {selected ? (
            <motion.div
              key={selected.id}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.28 }}
              className="ls-card p-4 sm:p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-[10.5px] text-info">{selected.id}</p>
                  <h3 className="ls-heading mt-1 text-lg">{selected.title}</h3>
                  <p className="mt-0.5 text-[12px] text-muted">
                    {selected.client} · {selected.court}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge tone="info">{selected.matter}</Badge>
                  <Badge tone="accent">{selected.stage}</Badge>
                  {selected.privileged && <Badge tone="pastel">Asesoria juridica</Badge>}
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {[
                  { k: 'Abogado titular', v: selected.ownerName ? `${selected.ownerName} · ${selected.owner}` : 'Sin asignar' },
                  { k: 'Asistente', v: selected.assistant ?? 'Sin asistente' },
                  { k: 'Cliente (cuenta)', v: selected.clientUser ?? 'Sin cuenta vinculada' },
                  {
                    k: 'Vencimiento',
                    v: selected.deadline ? formatDateTime(`${selected.deadline}T12:00:00`).date : 'Sin plazo',
                  },
                  { k: 'Avance', v: `${selected.progress}%` },
                ].map((s) => (
                  <div key={s.k} className="ls-panel">
                    <p className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-muted">{s.k}</p>
                    <p className="mt-1 font-mono text-[12.5px] text-ink">{s.v}</p>
                  </div>
                ))}
              </div>

              {canWrite && (
                <div className="ls-panel mt-4 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <label
                      htmlFor="case-progress"
                      className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-muted"
                    >
                      Avance del expediente
                    </label>
                    <span className="font-mono text-[12.5px] font-bold text-ink tabular-nums">
                      {progressDraft}%
                    </span>
                  </div>
                  <input
                    id="case-progress"
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={progressDraft}
                    disabled={savingProgress}
                    onChange={(event) => setProgressDraft(Number(event.target.value))}
                    style={{ '--fill': `${progressDraft}%` }}
                    className="mt-2"
                  />
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-[8rem] flex-1">
                      <Progress value={progressDraft} />
                    </div>
                    <button
                      type="button"
                      onClick={handleSaveProgress}
                      disabled={savingProgress || progressDraft === selected.progress}
                      className="ls-btn-primary text-xs disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {savingProgress ? 'Guardando…' : 'Guardar Avance'}
                    </button>
                  </div>
                </div>
              )}

              <div className="mt-5">
                <div className="mb-3 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-accent" />
                  <p className="font-display text-sm font-bold">Prueba documental</p>
                  <span className="font-mono text-[10px] text-muted">
                    · {selected.docs.length} documentos visibles para su rol
                  </span>
                </div>
                {!canRevealDocs && selected.hiddenDocuments > 0 && (
                  <p className="mb-3 flex items-center gap-1.5 rounded-lg border border-line/40 bg-surface2/40 px-3 py-2 text-[11.5px] text-muted">
                    <EyeOff className="h-3.5 w-3.5 shrink-0" />
                    {selected.hiddenDocuments} documento(s) confidencial(es) ocultos: su rol no tiene acceso a
                    documentación confidencial.
                  </p>
                )}

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {selected.docs.map((doc) => {
                    const restricted = doc.isPrivileged || doc.classification !== 'Publica'
                    const card = (
                      <div className="p-1">
                        <div className="mb-1.5 flex items-center justify-between font-mono text-[9.5px] text-muted">
                          <span>{doc.id}</span>
                          <span className="flex items-center gap-1">
                            {restricted ? <Lock className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                            {doc.classification}
                          </span>
                        </div>
                        <DocumentPreview doc={doc} />
                      </div>
                    )

                    if (!restricted) {
                      return (
                        <div key={doc.id} className="rounded-lg border border-line/50">
                          {card}
                        </div>
                      )
                    }

                    return (
                      <DitherVeil
                        key={doc.id}
                        docId={doc.id}
                        docName={doc.name}
                        classification={doc.classification}
                        revealed={revealedDocs.includes(doc.id)}
                        canReveal={canRevealDocs}
                        sessionRole={session?.role}
                        onReveal={onReveal}
                        onConceal={(id) => {
                          concealDocument(id)
                          toast.info('Documento re-cubierto', `${id} vuelve a estado restringido`)
                        }}
                      >
                        {card}
                      </DitherVeil>
                    )
                  })}
                </div>
              </div>


            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="ls-card p-6"
            >
              <EmptyState
                icon={Archive}
                title="Seleccione un expediente"
                description="El detalle mostrara la prueba documental protegida por capa de privacidad."
              />
            </motion.div>
          )}
        </AnimatePresence>
        <div className="ls-card p-4">
          <SectionTitle
            icon={FileText}
            title="Actividad de expedientes"
            subtitle="Ultimas acciones de negocio registradas en activity_logs"
          />
          <ul className="divide-y divide-line/25">
            {activityLogs.slice(0, 6).map((l) => {
              const ts = formatDateTime(l.ts)
              return (
                <li key={l.id} className="flex items-start gap-3 py-2.5">
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                      l.severity === 'critico' ? 'bg-danger' : l.severity === 'warn' ? 'bg-accent' : 'bg-info'
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2">
                      <span className="font-mono text-[10.5px] font-bold text-info">{l.type}</span>
                      <span className="font-mono text-[9.5px] text-muted">{ts.date} {ts.time}</span>
                    </p>
                    <p className="text-[12px] leading-snug text-ink/90">{l.message}</p>
                  </div>
                </li>
              )
            })}
            {activityLogs.length === 0 && <p className="py-3 text-[12px] text-muted">Sin actividad registrada</p>}
          </ul>
        </div>
      </div>

      <AnimatePresence>
        {creating && (
          <NewCaseModal
            onClose={() => setCreating(false)}
            onCreated={(created) => {
              setCreating(false)
              setSelectedId(created.id)
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}