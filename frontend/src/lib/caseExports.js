const NAVY = [30, 41, 59]
const HEADER_NAVY = [15, 23, 42]
const PRIMARY = [37, 99, 235]
const ALT_ROW = [248, 250, 252]
const BORDER = [226, 232, 240]
const MUTED = [100, 116, 139]
const BODY = [51, 65, 85]
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
} = {}) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ])

  const records = toRecords(rows)
  const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const marginX = 40
  const tableWidth = pageWidth - marginX * 2
  const columnWidths = COLUMN_WIDTHS.map((width) => (width / COLUMN_WIDTH_TOTAL) * tableWidth)
  const title = 'LegalShield · Reporte Operativo de Expedientes'
  const subtitle = `Emitido: ${formatStamp(generatedAt)}   |   Usuario: ${generatedBy}   |   Expedientes: ${records.length}`
  const body = records.length
    ? records.map(tableRow)
    : [[{ content: 'Sin expedientes para exportar', colSpan: COLUMNS.length, styles: { halign: 'center', textColor: MUTED, fontStyle: 'italic' } }]]

  const drawHeader = () => {
    doc.setDrawColor(...PRIMARY)
    doc.setLineWidth(2)
    doc.line(marginX, 30, pageWidth - marginX, 30)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(...PRIMARY)
    doc.text('LEGALSHIELD ENTERPRISE', marginX, 44)

    doc.setFontSize(15)
    doc.setTextColor(...NAVY)
    doc.text(title, marginX, 62)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...MUTED)
    doc.text(subtitle, marginX, 76)

    doc.setDrawColor(...BORDER)
    doc.setLineWidth(0.6)
    doc.line(marginX, 86, pageWidth - marginX, 86)
  }

  autoTable(doc, {
    startY: 112,
    margin: { top: 112, right: marginX, bottom: 54, left: marginX },
    head: [COLUMNS],
    body,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 7.4,
      cellPadding: { top: 5, right: 4, bottom: 5, left: 4 },
      textColor: BODY,
      lineColor: BORDER,
      lineWidth: 0.4,
      overflow: 'linebreak',
      valign: 'middle',
    },
    headStyles: {
      fillColor: HEADER_NAVY,
      textColor: 255,
      fontStyle: 'bold',
      halign: 'center',
      fontSize: 7.4,
      lineColor: HEADER_NAVY,
      lineWidth: 0.4,
      cellPadding: { top: 6, right: 4, bottom: 6, left: 4 },
    },
    alternateRowStyles: { fillColor: ALT_ROW },
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
    didDrawPage: drawHeader,
  })

  const totalPages = doc.getNumberOfPages()
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page)
    doc.setDrawColor(...BORDER)
    doc.setLineWidth(0.6)
    doc.line(marginX, pageHeight - 38, pageWidth - marginX, pageHeight - 38)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.2)
    doc.setTextColor(...MUTED)
    doc.text('Documento generado por LegalShield Enterprise - Uso exclusivo interno', marginX, pageHeight - 24)
    doc.text(`Página ${page} de ${totalPages}`, pageWidth - marginX, pageHeight - 24, { align: 'right' })
  }

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
