/**
 * Exportadores de la bitácora a archivos reales del navegador.
 * - `exportCsv` genera un CSV (UTF-8 con BOM) descargable.
 * - `exportPdf` compone un PDF válido (PDF 1.4, Helvetica/WinAnsi) sin
 *   dependencias externas, paginando las líneas recibidas.
 */

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

export function exportExcel(filename, headers, rows) {
  exportCsv(filename.replace(/\.xlsx?$/i, '.csv'), headers, rows)
}

/** Normaliza cualquier caracter fuera de WinAnsi a un equivalente ASCII. */
const toWinAnsi = (value) =>
  String(value ?? '')
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/[\u2018\u2019\u201A]/g, "'")
    .replace(/[\u201C\u201D\u201E]/g, '"')
    .replace(/\u2026/g, '...')
    .replace(/\u2022/g, '-')
    .replace(/[\u0100-\uFFFF]/g, '?')

const pdfEscape = (value) =>
  toWinAnsi(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')

const PAGE_W = 595.28
const PAGE_H = 841.89
const MARGIN = 42
const BODY_SIZE = 9
const LEADING = 12.5
const TOP = PAGE_H - 104
const BOTTOM = 56

/**
 * Genera y descarga un PDF real. `lines` es un arreglo de cadenas: cada una se
 * imprime en una línea de la página.
 */
export function exportPdf({ filename, title = 'LegalShield', subtitle = '', lines = [], rows = [] }) {
  const now = new Date().toLocaleString('es-ES')
  const headerLine = `Fecha de emisión: ${now}`
  const fullLines = [headerLine, '', ...(rows.length ? rows.map(r => (Array.isArray(r) ? r.join(' | ') : String(r))) : lines)]
  const perPage = Math.max(1, Math.floor((TOP - BOTTOM) / LEADING))
  const chunks = []
  for (let i = 0; i < fullLines.length; i += perPage) chunks.push(fullLines.slice(i, i + perPage))
  if (chunks.length === 0) chunks.push([])
  const total = chunks.length

  const pageContent = (rows, index) => {
    const parts = [
      `0.196 G 0.196 G 1 0 0 1 ${MARGIN} 800 Tm 0.5 0.8 w ${MARGIN} 806 m ${PAGE_W - MARGIN} 806 l S 0 G`,
      `BT /F1 16 Tf 1 0 0 1 ${MARGIN} 796 Tm (${pdfEscape(title)}) Tj ET`,
    ]
    if (subtitle) {
      parts.push(`BT /F1 9 Tf 1 0 0 1 ${MARGIN} 778 Tm (${pdfEscape(subtitle)}) Tj ET`)
    }
    parts.push(`BT /F1 8 Tf 1 0 0 1 ${MARGIN} 766 Tm (${pdfEscape(headerLine)}) Tj ET`)
    parts.push(`0.4 G 0.8 w ${MARGIN} 760 m ${PAGE_W - MARGIN} 760 l S 0 G`)
    parts.push(`BT /F1 ${BODY_SIZE} Tf ${LEADING} TL 1 0 0 1 ${MARGIN} ${TOP} Tm`)
    rows.forEach((line, i) => {
      parts.push(`(${pdfEscape(line)}) Tj`)
      if (i < rows.length - 1) parts.push('T*')
    })
    parts.push('ET')
    parts.push(
      `BT /F1 8 Tf 1 0 0 1 ${MARGIN} 34 Tm (LegalShield · página ${index + 1} de ${total}) Tj ET`,
    )
    return parts.join('\n')
  }

  const objects = []
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>'
  const kids = chunks.map((_, i) => `${4 + i * 2} 0 R`).join(' ')
  objects[2] = `<< /Type /Pages /Kids [${kids}] /Count ${total} >>`
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'
  chunks.forEach((rows, i) => {
    const pageId = 4 + i * 2
    const contentId = 5 + i * 2
    const data = `${pageContent(rows, i)}\n`
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W.toFixed(2)} ${PAGE_H.toFixed(2)}] ` +
      `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`
    objects[contentId] = `<< /Length ${data.length} >>\nstream\n${data}endstream`
  })

  const count = objects.length
  let pdf = '%PDF-1.4\n'
  const offsets = []
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = pdf.length
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`
  }
  const xrefOffset = pdf.length
  pdf += `xref\n0 ${count}\n0000000000 65535 f \n`
  for (let id = 1; id < objects.length; id += 1) {
    pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`

  const bytes = new Uint8Array(pdf.length)
  for (let i = 0; i < pdf.length; i += 1) bytes[i] = pdf.charCodeAt(i) & 0xff
  downloadBlob(new Blob([bytes], { type: 'application/pdf' }), filename)
}
