import { formatDateTime } from './format.js'
import {
  PDF_MARGIN,
  PDF_PALETTE,
  PDF_TABLE_START,
  corporateTableStyles,
  drawPdfHeader,
  loadPdfTools,
  paintPdfFooters,
} from './pdfExport.js'

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

const csvCell = (value) => {
  const text = String(value ?? '')
  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function exportCsv(filename, headers, rows) {
  const lines = [headers, ...rows].map((row) => row.map(csvCell).join(','))
  const csv = `\uFEFF${lines.join('\r\n')}\r\n`
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), filename)
}

const LOG_COLUMNS = [
  'Fecha / Hora',
  'Evento / Acción',
  'Nivel',
  'Actor / User ID',
  'Detalles / Origen',
]

const LOG_COLUMN_WIDTHS = [84, 108, 56, 84, 183]
const LOG_COLUMN_WIDTH_TOTAL = LOG_COLUMN_WIDTHS.reduce((total, width) => total + width, 0)

const SEVERITY_STYLES = {
  critico: { label: 'CRÍTICO', bg: [254, 226, 226], text: [153, 27, 27] },
  warn: { label: 'ALERTA', bg: [254, 243, 199], text: [146, 64, 14] },
  info: { label: 'INFO', bg: [224, 242, 254], text: [7, 89, 133] },
}

function severityStyle(value) {
  const key = String(value ?? '').trim().toLowerCase()
  if (key.startsWith('crit') || key === 'critical' || key === 'danger') {
    return SEVERITY_STYLES.critico
  }
  if (['warn', 'warning', 'alerta', 'alert'].includes(key)) return SEVERITY_STYLES.warn
  return SEVERITY_STYLES.info
}

function text(value, fallback = '') {
  const normalized = String(value ?? '').trim()
  return normalized || fallback
}

function logRow(item) {
  const ts = formatDateTime(item.ts)
  const origin = text(item.target)
  const details = [text(item.message, '-'), origin ? `Origen: ${origin}` : '']
    .filter(Boolean)
    .join('\n')
  return [ts.full, text(item.type, '-'), text(item.severity, 'info'), text(item.actor, '-'), details]
}

export async function exportPdf({
  filename = 'bitacora-seguridad.pdf',
  title = 'LegalShield · Bitácora de Seguridad',
  rows = [],
  generatedBy = 'Usuario LegalShield',
  generatedAt = new Date(),
  filter = 'Todos',
} = {}) {
  const { jsPDF, autoTable } = await loadPdfTools()

  const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true })
  const pageWidth = doc.internal.pageSize.getWidth()
  const tableWidth = pageWidth - PDF_MARGIN * 2
  const columnWidths = LOG_COLUMN_WIDTHS.map(
    (width) => (width / LOG_COLUMN_WIDTH_TOTAL) * tableWidth,
  )
  const meta = [
    {
      label: 'Fecha de emisión',
      value: generatedAt.toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' }),
    },
    { label: 'Usuario emisor', value: generatedBy },
    { label: 'Filtro aplicado', value: filter },
    { label: 'Total de registros', value: String(rows.length) },
  ]
  const body = rows.length
    ? rows.map(logRow)
    : [[{
        content: 'Sin eventos de seguridad para exportar',
        colSpan: LOG_COLUMNS.length,
        styles: { halign: 'center', textColor: PDF_PALETTE.muted, fontStyle: 'italic' },
      }]]
  const tableStyles = corporateTableStyles()

  autoTable(doc, {
    ...tableStyles,
    startY: PDF_TABLE_START,
    margin: { top: PDF_TABLE_START, right: PDF_MARGIN, bottom: 54, left: PDF_MARGIN },
    head: [LOG_COLUMNS],
    body,
    columnStyles: {
      0: { cellWidth: columnWidths[0], textColor: PDF_PALETTE.muted },
      1: { cellWidth: columnWidths[1], fontStyle: 'bold', textColor: PDF_PALETTE.navy },
      2: { cellWidth: columnWidths[2], halign: 'center' },
      3: { cellWidth: columnWidths[3] },
      4: { cellWidth: columnWidths[4] },
    },
    didParseCell: (data) => {
      if (data.section !== 'body' || data.column.index !== 2) return
      const severity = severityStyle(data.cell.raw)
      data.cell.text = [severity.label]
      data.cell.styles.fillColor = severity.bg
      data.cell.styles.textColor = severity.text
      data.cell.styles.fontStyle = 'bold'
      data.cell.styles.halign = 'center'
    },
    didDrawPage: () => drawPdfHeader(doc, { title, meta }),
  })

  paintPdfFooters(doc)

  doc.setProperties({
    title,
    subject: 'Bitácora de seguridad',
    author: 'LegalShield Enterprise',
    creator: 'LegalShield Enterprise',
  })

  downloadBlob(doc.output('blob'), filename)
}
