import {
  PDF_MARGIN,
  PDF_PALETTE,
  PDF_TABLE_START,
  corporateTableStyles,
  drawPdfHeader,
  loadPdfTools,
  paintPdfFooters,
} from './pdfExport.js'

const NAVY = PDF_PALETTE.navy
const MUTED = PDF_PALETTE.muted
const BODY_HEX = '#334155'

const RISK_STYLES = {
  critico: { label: 'CRÍTICO', rgb: [220, 38, 38], hex: '#DC2626', tint: '#FEE2E2' },
  alta: { label: 'ALTA', rgb: [234, 88, 12], hex: '#EA580C', tint: '#FFEDD5' },
  media: { label: 'MEDIA', rgb: [217, 119, 6], hex: '#D97706', tint: '#FEF3C7' },
  baja: { label: 'BAJA', rgb: [22, 163, 74], hex: '#16A34A', tint: '#DCFCE7' },
}

const COLUMNS = [
  'Código',
  'Título / Cliente',
  'Materia / Juzgado',
  'Etapa',
  'Riesgo',
  'Avance',
  'Vencimiento',
]

const COLUMN_WIDTHS = [63, 124, 114, 64, 62, 34, 54]
const COLUMN_WIDTH_TOTAL = COLUMN_WIDTHS.reduce((total, width) => total + width, 0)
const EXCEL_COLUMN_WIDTHS = [16, 34, 30, 16, 15, 10, 15]

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

function fileStamp(date = new Date()) {
  return date.toISOString().slice(0, 10)
}

function formatStamp(date = new Date()) {
  return date.toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })
}

function text(value, fallback = '') {
  const normalized = String(value ?? '').trim()
  return normalized || fallback
}

function pair(first, second) {
  return [text(first), text(second)].filter(Boolean).join('\n')
}

function progress(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return '0%'
  return `${Math.min(100, Math.max(0, Math.round(parsed)))}%`
}

function deadline(value) {
  const normalized = text(value)
  return normalized ? normalized.slice(0, 10) : 'Sin fecha'
}

function riskStyle(value) {
  const key = text(value).toLowerCase()
  const canonical = key === 'critica' ? 'critico' : key
  return RISK_STYLES[canonical] ?? { label: key.toUpperCase() || 'SIN RIESGO', rgb: MUTED, hex: '#475569', tint: '#F1F5F9' }
}

function tableRow(item) {
  return [
    text(item.code, '-'),
    pair(item.title, item.client),
    pair(item.matter, item.court),
    text(item.stage, '-'),
    text(item.risk, 'baja').toLowerCase(),
    progress(item.progress),
    deadline(item.deadline),
  ]
}

function toRecords(rows) {
  return rows.map((row) => {
    if (!Array.isArray(row)) return row
    const [code, titleValue, client, court, matter, stage, risk, dueDate, percent] = row
    return { code, title: titleValue, client, court, matter, stage, risk, deadline: dueDate, progress: percent }
  })
}

export async function exportCasesPdf({
  filename = `expedientes_${fileStamp()}.pdf`,
  rows = [],
  generatedBy = 'Usuario LegalShield',
  generatedAt = new Date(),
  filter = 'Todos los expedientes',
} = {}) {
  const { jsPDF, autoTable } = await loadPdfTools()

  const records = toRecords(rows)
  const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true })
  const pageWidth = doc.internal.pageSize.getWidth()
  const tableWidth = pageWidth - PDF_MARGIN * 2
  const columnWidths = COLUMN_WIDTHS.map((width) => (width / COLUMN_WIDTH_TOTAL) * tableWidth)
  const title = 'LegalShield · Reporte Operativo de Expedientes'
  const meta = [
    { label: 'Fecha de emisión', value: formatStamp(generatedAt) },
    { label: 'Usuario emisor', value: generatedBy },
    { label: 'Filtro aplicado', value: filter },
    { label: 'Total de registros', value: String(records.length) },
  ]
  const body = records.length
    ? records.map(tableRow)
    : [[{ content: 'Sin expedientes para exportar', colSpan: COLUMNS.length, styles: { halign: 'center', textColor: MUTED, fontStyle: 'italic' } }]]
  const tableStyles = corporateTableStyles()

  autoTable(doc, {
    ...tableStyles,
    startY: PDF_TABLE_START,
    margin: { top: PDF_TABLE_START, right: PDF_MARGIN, bottom: 54, left: PDF_MARGIN },
    head: [COLUMNS],
    body,
    columnStyles: {
      0: { cellWidth: columnWidths[0], fontStyle: 'bold', textColor: NAVY },
      1: { cellWidth: columnWidths[1] },
      2: { cellWidth: columnWidths[2] },
      3: { cellWidth: columnWidths[3], halign: 'center' },
      4: {
        cellWidth: columnWidths[4],
        halign: 'left',
        fontStyle: 'bold',
        cellPadding: { top: 5, right: 4, bottom: 5, left: 12 },
      },
      5: { cellWidth: columnWidths[5], halign: 'right', fontStyle: 'bold' },
      6: { cellWidth: columnWidths[6], halign: 'center' },
    },
    didParseCell: (data) => {
      if (data.section !== 'body' || data.column.index !== 4) return
      const risk = riskStyle(data.cell.raw)
      data.cell.text = [risk.label]
      data.cell.styles.textColor = risk.rgb
      data.cell.styles.fontStyle = 'bold'
    },
    didDrawCell: (data) => {
      if (data.section !== 'body' || data.column.index !== 4) return
      const risk = riskStyle(data.cell.raw)
      doc.setFillColor(...risk.rgb)
      doc.circle(data.cell.x + 5.5, data.cell.y + data.cell.height / 2, 2, 'F')
    },
    didDrawPage: () => drawPdfHeader(doc, { title, meta }),
  })

  paintPdfFooters(doc)

  doc.setProperties({
    title,
    subject: 'Reporte operativo de expedientes',
    author: 'LegalShield Enterprise',
    creator: 'LegalShield Enterprise',
  })

  downloadBlob(doc.output('blob'), filename)
}

export async function exportCasesExcel({
  filename = `expedientes_${fileStamp()}.xlsx`,
  rows = [],
  generatedBy = 'Usuario LegalShield',
  generatedAt = new Date(),
} = {}) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  const records = toRecords(rows)

  const merged = (cell) => [cell, null, null, null, null, null, null]
  const header = COLUMNS.map((value) => ({
    value,
    backgroundColor: '#0F172A',
    textColor: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 9,
    align: 'center',
    verticalAlign: 'center',
    wrap: true,
    height: 28,
    borderColor: '#0F172A',
    borderStyle: 'thin',
  }))

  const dataRows = records.map((item, index) => {
    const risk = riskStyle(item.risk)
    const zebra = index % 2 === 1 ? '#F8FAFC' : '#FFFFFF'
    const values = tableRow(item)
    return values.map((value, column) => {
      const cell = {
        value,
        fontSize: 9,
        textColor: BODY_HEX,
        backgroundColor: zebra,
        verticalAlign: 'center',
        wrap: true,
        height: 30,
        borderColor: '#E2E8F0',
        borderStyle: 'thin',
      }
      if (column === 0) return { ...cell, fontWeight: 'bold', textColor: '#1E293B' }
      if (column === 3) return { ...cell, align: 'center' }
      if (column === 4) {
        return {
          ...cell,
          value: `● ${risk.label}`,
          textColor: risk.hex,
          backgroundColor: risk.tint,
          fontWeight: 'bold',
          align: 'center',
        }
      }
      if (column === 5) return { ...cell, align: 'right', fontWeight: 'bold' }
      if (column === 6) return { ...cell, align: 'center' }
      return cell
    })
  })

  const data = [
    merged({
      value: 'LegalShield · Reporte Operativo de Expedientes',
      columnSpan: COLUMNS.length,
      backgroundColor: '#1E293B',
      textColor: '#FFFFFF',
      fontWeight: 'bold',
      fontSize: 14,
      verticalAlign: 'center',
      height: 28,
    }),
    merged({
      value: `Emitido: ${formatStamp(generatedAt)}   |   Usuario: ${generatedBy}   |   Expedientes: ${records.length}`,
      columnSpan: COLUMNS.length,
      backgroundColor: '#EFF6FF',
      textColor: '#1E3A8A',
      fontSize: 9,
      verticalAlign: 'center',
      height: 20,
    }),
    merged({ value: '', height: 6 }),
    header,
    ...dataRows,
    merged({ value: '', height: 8 }),
    merged({
      value: 'Documento generado por LegalShield Enterprise - Uso exclusivo interno',
      columnSpan: COLUMNS.length,
      backgroundColor: '#F8FAFC',
      textColor: '#64748B',
      fontSize: 8,
      align: 'center',
      verticalAlign: 'center',
      height: 22,
    }),
  ]

  await writeXlsxFile(data, {
    sheet: 'Expedientes',
    columns: EXCEL_COLUMN_WIDTHS.map((width) => ({ width })),
    stickyRowsCount: 4,
    orientation: 'landscape',
    showGridLines: false,
  }).toFile(filename)
}
