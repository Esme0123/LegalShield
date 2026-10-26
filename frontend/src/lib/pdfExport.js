export const PDF_PALETTE = {
  headerNavy: [15, 23, 42],
  navy: [30, 41, 59],
  primary: [37, 99, 235],
  altRow: [248, 250, 252],
  border: [226, 232, 240],
  muted: [100, 116, 139],
  body: [51, 65, 85],
  metaBg: [241, 245, 249],
}

export const PDF_MARGIN = 40
export const PDF_TABLE_START = 110
export const PRIVACY_LEGEND =
  'Documento generado por LegalShield Enterprise - Inmutable y Confidencial'

export async function loadPdfTools() {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ])
  return { jsPDF, autoTable }
}

function fitText(doc, value, maxWidth) {
  const raw = String(value ?? '').trim()
  if (!raw || doc.getTextWidth(raw) <= maxWidth) return raw
  let clipped = raw
  while (clipped.length > 1 && doc.getTextWidth(`${clipped}...`) > maxWidth) {
    clipped = clipped.slice(0, -1)
  }
  return `${clipped.trimEnd()}...`
}

export function drawPdfHeader(doc, { title, eyebrow = 'LEGALSHIELD ENTERPRISE', meta = [] }) {
  const pageWidth = doc.internal.pageSize.getWidth()
  const tableWidth = pageWidth - PDF_MARGIN * 2

  doc.setDrawColor(...PDF_PALETTE.primary)
  doc.setLineWidth(2)
  doc.line(PDF_MARGIN, 28, pageWidth - PDF_MARGIN, 28)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(...PDF_PALETTE.primary)
  doc.text(eyebrow, PDF_MARGIN, 42)

  doc.setFontSize(15)
  doc.setTextColor(...PDF_PALETTE.navy)
  doc.text(title, PDF_MARGIN, 60)

  doc.setDrawColor(...PDF_PALETTE.border)
  doc.setLineWidth(0.6)
  doc.line(PDF_MARGIN, 68, pageWidth - PDF_MARGIN, 68)

  if (!meta.length) return 78

  const blockY = 72
  const blockHeight = 28
  doc.setFillColor(...PDF_PALETTE.metaBg)
  doc.roundedRect(PDF_MARGIN, blockY, tableWidth, blockHeight, 3, 3, 'F')

  const columnWidth = tableWidth / meta.length
  meta.forEach((item, index) => {
    const startX = PDF_MARGIN + index * columnWidth
    const textX = startX + 10
    const maxWidth = columnWidth - 20

    if (index > 0) {
      doc.setDrawColor(...PDF_PALETTE.border)
      doc.setLineWidth(0.5)
      doc.line(startX, blockY + 6, startX, blockY + blockHeight - 6)
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6)
    doc.setTextColor(...PDF_PALETTE.muted)
    doc.text(fitText(doc, String(item.label).toUpperCase(), maxWidth), textX, blockY + 10)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...PDF_PALETTE.body)
    doc.text(fitText(doc, item.value, maxWidth), textX, blockY + 21)
  })

  return blockY + blockHeight + 10
}

export function drawPdfFooter(doc, page, totalPages) {
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()

  doc.setDrawColor(...PDF_PALETTE.border)
  doc.setLineWidth(0.6)
  doc.line(PDF_MARGIN, pageHeight - 38, pageWidth - PDF_MARGIN, pageHeight - 38)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.2)
  doc.setTextColor(...PDF_PALETTE.muted)
  doc.text(PRIVACY_LEGEND, pageWidth / 2, pageHeight - 24, { align: 'center' })
  doc.text(`Página ${page} de ${totalPages}`, pageWidth - PDF_MARGIN, pageHeight - 24, {
    align: 'right',
  })
}

export function paintPdfFooters(doc) {
  const totalPages = doc.getNumberOfPages()
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page)
    drawPdfFooter(doc, page, totalPages)
  }
}

export function corporateTableStyles() {
  return {
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 7.4,
      cellPadding: { top: 5, right: 4, bottom: 5, left: 4 },
      textColor: PDF_PALETTE.body,
      lineColor: PDF_PALETTE.border,
      lineWidth: 0.4,
      overflow: 'linebreak',
      valign: 'middle',
    },
    headStyles: {
      fillColor: PDF_PALETTE.headerNavy,
      textColor: 255,
      fontStyle: 'bold',
      halign: 'center',
      fontSize: 7.4,
      lineColor: PDF_PALETTE.headerNavy,
      lineWidth: 0.4,
      cellPadding: { top: 6, right: 4, bottom: 6, left: 4 },
    },
    alternateRowStyles: { fillColor: PDF_PALETTE.altRow },
  }
}
