import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Archive,
  Eye,
  FileText,
  Gavel,
  Lock,
  RotateCcw,
  ShieldCheck,
  Trash2,
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
        {lines.map((l, i) => (
          <span
            key={i}
            className={cn('block h-1 rounded-full', l.o ? 'bg-indigo/60' : 'bg-navy/25')}
            style={{ width: `${l.w}%` }}
          />
        ))}
      </div>
      <p className="mt-2 font-mono text-[8.5px] opacity-70">
        Clasificacion: {doc.classification} · sello SHA-256 pendiente de firma
      </p>
    </div>
  )
}

export default function Cases() {
  const cases = useAppStore((s) => s.cases)
  const archiveCase = useAppStore((s) => s.archiveCase)
  const restoreCases = useAppStore((s) => s.restoreCases)
  const revealedDocs = useAppStore((s) => s.revealedDocs)
  const revealDocument = useAppStore((s) => s.revealDocument)
  const concealDocument = useAppStore((s) => s.concealDocument)
  const hasPermission = useAppStore((s) => s.hasPermission)
  const session = useAppStore((s) => s.session)
  const pushLog = useAppStore((s) => s.pushLog)

  const [selectedId, setSelectedId] = useState(cases[0]?.id ?? null)
  const [crumpling, setCrumpling] = useState(null)

  const selected = cases.find((c) => c.id === selectedId) ?? cases[0]
  const canArchive = hasPermission('CASES_ARCHIVE')

  const startArchive = (id) => {
    if (!canArchive) {
      toast.danger('Acceso denegado', 'El permiso CASES_ARCHIVE no esta asociado a tu rol')
      return
    }
    setCrumpling(id)
  }

  const finishArchive = (id) => {
    const target = cases.find((c) => c.id === id)
    archiveCase(id)
    setCrumpling(null)
    if (selectedId === id) setSelectedId(null)
    toast.mint(
      'Expediente archivado',
      `${id} · ${target?.title ?? 'Expediente'} arrugado y sellado con integridad`,
    )
  }

  const onReveal = (docId, meta) => {
    revealDocument(docId, meta)
    toast.info(
      'Documento revelado',
      `Rol ${String(meta.roleId).toUpperCase()} autorizado · justificacion registrada en auditoria`,
      ShieldCheck,
    )
  }

  return (
    <div className="space-y-5">
      <SectionTitle
        icon={Gavel}
        title="Expedientes judiciales"
        subtitle="Paper Crumple al archivar · Dither Veil sobre la prueba documental restringida"
        actions={
          <button
            type="button"
            onClick={() => {
              restoreCases()
              pushLog({
                type: 'ARCHIVE_ROLLBACK',
                severity: 'info',
                target: 'archivo',
                message: 'Restauracion del conjunto de expedientes en ambiente de demostracion',
              })
              toast.mint('Expedientes restaurados', 'El archivo de prueba vuelve a su estado inicial')
            }}
            className="ls-btn-secondary text-xs"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Restaurar archivados
          </button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
        {/* Lista */}
        <div className="space-y-2.5">
          {cases.length === 0 && (
            <EmptyState
              icon={Archive}
              title="Sin expedientes activos"
              description="Todos los folders fueron archivados. Restaura el archivo para continuar."
            />
          )}

          {cases.map((c, i) => (
            <PaperCrumple
              key={c.id}
              crumpled={crumpling === c.id}
              onComplete={() => finishArchive(c.id)}
            >
              <motion.button
                type="button"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                onClick={() => setSelectedId(c.id)}
                className={cn(
                  'group w-full rounded-xl border p-3.5 text-left transition-all duration-300 ease-shield',
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
                    {c.docs.length} docs · {c.privileged ? 'privilegiado' : 'no privilegiado'}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[10.5px] text-danger opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                    <Trash2 className="h-3 w-3" /> archivar
                  </span>
                </div>
              </motion.button>
            </PaperCrumple>
          ))}

          {selected && (
            <button
              type="button"
              onClick={() => startArchive(selected.id)}
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
                  { k: 'Responsable', v: selected.owner },
                  { k: 'Vencimiento', v: formatDateTime(`${selected.deadline}T12:00:00`).date },
                  { k: 'Avance', v: `${selected.progress}%` },
                ].map((s) => (
                  <div key={s.k} className="ls-panel">
                    <p className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-muted">{s.k}</p>
                    <p className="mt-1 font-mono text-[12.5px] text-ink">{s.v}</p>
                  </div>
                ))}
              </div>

              <div className="mt-5">
                <div className="mb-3 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-accent" />
                  <p className="font-display text-sm font-bold">Prueba documental</p>
                  <span className="font-mono text-[10px] text-muted">
                    · {selected.docs.length} documentos · cobertura por rol activa
                  </span>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {selected.docs.map((doc) => {
                    const restricted = doc.classification !== 'Publica'
                    return (
                      <DitherVeil
                        key={doc.id}
                        docId={doc.id}
                        docName={doc.name}
                        classification={doc.classification}
                        revealed={revealedDocs.includes(doc.id)}
                        sessionRole={session?.role}
                        allowedRoles={['socio', 'abogado']}
                        onReveal={onReveal}
                        onConceal={(id) => {
                          concealDocument(id)
                          toast.info('Documento re-cubierto', `${id} vuelve a estado restringido`)
                        }}
                      >
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
                      </DitherVeil>
                    )
                  })}
                </div>
              </div>

              <div className="mt-5 rounded-xl border border-pastel/40 bg-pastel/8 p-3.5">
                <p className="flex items-center gap-2 text-[12px] font-semibold text-pastel">
                  <ShieldCheck className="h-4 w-4" /> Nota didactica · Dither Veil
                </p>
                <p className="mt-1 text-[11.5px] leading-snug text-ink/85">
                  El tramado no es decorativo: representa la capa de privacidad que impide leer la
                  prueba sin una peticion de rol valida. Al revelar, el motor exige justificacion y
                  escribe un evento <span className="font-mono text-pastel">DOC_REVEALED</span> con el
                  actor y el motivo.
                </p>
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
      </div>
    </div>
  )
}