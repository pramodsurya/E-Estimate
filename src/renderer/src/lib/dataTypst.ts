/**
 * Typst generator for Rate Analysis (DATA Book) and Schedule of Rates (SOR).
 *
 * Produces clean, professional, and deterministic .typ markup for individual
 * SSR recipes, lead conveyance breakdowns, and whole-project DATA documents.
 */

import type { DataSheet } from './dataSheets'
import type {
  RateAnalysisLine,
  RateAnalysisRecipe,
  RateAnalysisSectionKey
} from '../types/rateAnalysis'
import type { LeadApplication, LeadVariant } from '../types/project'
import { calculateRateAnalysis } from './rateAnalysis'

/** Escapes special Typst markup characters in text strings. */
export function escapeTypst(text: string | null | undefined): string {
  if (!text) return ''
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/#/g, '\\#')
    .replace(/\$/g, '\\$')
    .replace(/"/g, '\\"')
    .replace(/\*/g, '\\*')
    .replace(/_/g, '\\_')
    .replace(/@/g, '\\@')
}

export function fmtMoney(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return value.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
}

export function fmtQty(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return value.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 3
  })
}

const SECTION_TITLES: Record<RateAnalysisSectionKey, string> = {
  materials: 'I. MATERIALS',
  labour: 'II. LABOUR',
  machinery: 'III. MACHINERY / HIRE CHARGES'
}

/** Generates Typst markup for a single Rate Analysis (SSR) Recipe sheet. */
export function rateAnalysisRecipeToTypst(
  recipe: RateAnalysisRecipe,
  leadApplications: LeadApplication[] = [],
  _leadVariants: LeadVariant[] = [],
  _figureUrls: Record<string, string> = {}
): string {
  const code = recipe.itemCode?.trim() || recipe.itemKey || 'DATA'
  const unit = recipe.unit || 'unit'
  const outputQty = recipe.outputQuantity || 1
  const desc = recipe.description || ''
  const sectionHeading = recipe.sectionHeading || ''

  // Recalculate or extract values
  let calculated = null
  try {
    calculated = calculateRateAnalysis(recipe)
  } catch {
    /* fallback to stored */
  }

  const materialsSection = recipe.sections.find((s) => s.key === 'materials')
  const labourSection = recipe.sections.find((s) => s.key === 'labour')
  const machinerySection = recipe.sections.find((s) => s.key === 'machinery')

  const matLines = materialsSection?.lines ?? []
  const labLines = labourSection?.lines ?? []
  const machLines = machinerySection?.lines ?? []

  const matTotal =
    calculated?.sectionTotals.materials ??
    matLines.reduce((sum, line) => sum + (line.amount || 0), 0)
  const labTotal =
    calculated?.sectionTotals.labour ??
    labLines.reduce((sum, line) => sum + (line.amount || 0), 0)
  const machTotal =
    calculated?.sectionTotals.machinery ??
    machLines.reduce((sum, line) => sum + (line.amount || 0), 0)

  const baseCost = calculated?.baseCost ?? matTotal + labTotal + machTotal
  const overheadPct = recipe.overheadPercent ?? 14
  const overheadAmt = calculated?.overheadAmount ?? (baseCost * overheadPct) / 100
  const areaAllowancePct = recipe.areaAllowancePercent ?? 0
  const areaAllowanceAmt = calculated?.areaAllowanceAmount ?? (labTotal * areaAllowancePct) / 100

  // Total lead rate additions
  const leadTotalAmount = leadApplications.reduce((sum, app) => sum + app.grossAmount, 0)
  const leadRateAddition = outputQty > 0 ? leadTotalAmount / outputQty : 0

  const totalCost = (calculated?.totalCost ?? baseCost + overheadAmt + areaAllowanceAmt) + leadTotalAmount
  const ratePerUnit = outputQty > 0 ? totalCost / outputQty : totalCost

  const renderLines = (lines: RateAnalysisLine[]): string[] => {
    return lines.map((line, idx) => {
      const slNo = line.slNo ? `[${escapeTypst(line.slNo)}]` : `[${idx + 1}]`
      const descCell = `[${escapeTypst(line.description)}]`
      const qtyCell = `[${fmtQty(line.quantity)}]`
      const unitCell = `[${escapeTypst(line.unit)}]`
      const rateCell = `[${fmtMoney(line.rate)}]`
      const amtCell = `[${fmtMoney(line.amount)}]`
      return `  ${slNo}, ${descCell}, ${qtyCell}, ${unitCell}, ${rateCell}, ${amtCell},`
    })
  }

  const rows: string[] = []

  // Materials section
  if (matLines.length > 0) {
    rows.push(`  table.cell(colspan: 6, fill: rgb("#f5f6f5"))[*${SECTION_TITLES.materials}*],`)
    rows.push(...renderLines(matLines))
    rows.push(
      `  table.cell(colspan: 5, align: right)[*Materials Sub-Total:*], [*${fmtMoney(matTotal)}*],`
    )
  }

  // Labour section
  if (labLines.length > 0) {
    rows.push(`  table.cell(colspan: 6, fill: rgb("#f5f6f5"))[*${SECTION_TITLES.labour}*],`)
    rows.push(...renderLines(labLines))
    rows.push(
      `  table.cell(colspan: 5, align: right)[*Labour Sub-Total:*], [*${fmtMoney(labTotal)}*],`
    )
  }

  // Machinery section
  if (machLines.length > 0) {
    rows.push(`  table.cell(colspan: 6, fill: rgb("#f5f6f5"))[*${SECTION_TITLES.machinery}*],`)
    rows.push(...renderLines(machLines))
    rows.push(
      `  table.cell(colspan: 5, align: right)[*Machinery Sub-Total:*], [*${fmtMoney(machTotal)}*],`
    )
  }

  // Summary / Abstract block
  rows.push(
    `  table.cell(colspan: 5, align: right)[*Basic Prime Cost for ${outputQty} ${escapeTypst(unit)}:*], [*${fmtMoney(baseCost)}*],`
  )

  if (areaAllowancePct > 0) {
    const label = recipe.areaAllowanceLabel || `Area Allowance (+${areaAllowancePct}%)`
    rows.push(
      `  table.cell(colspan: 5, align: right)[${escapeTypst(label)} on Labour (${fmtMoney(labTotal)}):], [${fmtMoney(areaAllowanceAmt)}],`
    )
  }

  if (overheadPct > 0) {
    rows.push(
      `  table.cell(colspan: 5, align: right)[Contractor Overhead & Profit (${overheadPct}%):], [${fmtMoney(overheadAmt)}],`
    )
  }

  if (leadTotalAmount > 0) {
    rows.push(
      `  table.cell(colspan: 5, align: right)[Lead Conveyance Charges Total:], [${fmtMoney(leadTotalAmount)}],`
    )
  }

  rows.push(
    `  table.cell(colspan: 5, align: right, fill: rgb("#edf5fa"))[*Total Cost for ${outputQty} ${escapeTypst(unit)}:*], table.cell(align: right, fill: rgb("#edf5fa"))[*Rs. ${fmtMoney(totalCost)}*],`
  )

  if (outputQty !== 1) {
    rows.push(
      `  table.cell(colspan: 5, align: right, fill: rgb("#e2eef7"))[*Net Rate per 1.00 ${escapeTypst(unit)}:*], table.cell(align: right, fill: rgb("#e2eef7"))[*Rs. ${fmtMoney(ratePerUnit)}*],`
    )
  }

  // Lead breakdown table if present
  let leadBreakdownTypst = ''
  if (leadApplications.length > 0) {
    const leadRows = leadApplications.map((app) => {
      const mat = escapeTypst(app.itemCode || 'Material')
      const dist = '—'
      const qty = fmtQty(app.quantity)
      const u = escapeTypst(app.unit || '')
      const grRate = fmtMoney(app.grossRate)
      const grAmt = fmtMoney(app.grossAmount)
      return `  [${mat}], [${dist}], [${qty} ${u}], [${grRate}], [${grAmt}],`
    })

    leadBreakdownTypst = `
#v(4pt)
#text(9pt, weight: "bold", fill: rgb("#163f57"))[Lead & Conveyance Breakdown:]
#v(2pt)
#table(
  columns: (1fr, 25mm, 30mm, 25mm, 30mm),
  align: (left, center, right, right, right),
  stroke: (x, y) => if y == 0 { (bottom: 1pt + rgb("#163f57")) } else { 0.5pt + rgb("#e0e0e0") },
  fill: (col, row) => if row == 0 { rgb("#f8fafc") } else { none },
  table.header(
    [*Material*], [*Lead Distance*], [*Quantity*], [*Lead Rate (Rs)*], [*Amount (Rs)*]
  ),
${leadRows.join('\n')}
  table.cell(colspan: 4, align: right)[*Total Lead Addition:*], [*Rs. ${fmtMoney(leadTotalAmount)}*]
)
`
  }

  return `
#block(breakable: true)[
  #rect(width: 100%, fill: rgb("#edf5fa"), stroke: (left: 3.5pt + rgb("#163f57")), inset: (x: 8pt, y: 6pt))[
    #grid(
      columns: (1fr, auto),
      align: (left, right),
      [
        #text(7.5pt, fill: rgb("#4e6675"))[SSR CODE: *${escapeTypst(code)}* · UNIT: *${escapeTypst(unit)}* · OUTPUT: *${outputQty} ${escapeTypst(unit)}*] \\
        #if "${escapeTypst(sectionHeading)}" != "" [
          #text(8pt, fill: rgb("#6c8290"), weight: "bold")[${escapeTypst(sectionHeading)}] \\
        ]
        #text(10pt, weight: "bold", fill: rgb("#163f57"))[${escapeTypst(desc)}]
      ],
      [
        #text(7.5pt, fill: rgb("#4e6675"))[RATE / ${escapeTypst(unit).toUpperCase()}] \\
        #text(12pt, weight: "bold", fill: rgb("#163f57"))[Rs. ${fmtMoney(ratePerUnit)}]
      ]
    )
  ]
  #v(3pt)
  #table(
    columns: (8mm, 1fr, 18mm, 14mm, 20mm, 24mm),
    align: (center, left, right, center, right, right),
    stroke: (x, y) => if y == 0 { (bottom: 1.2pt + rgb("#14364b")) } else { 0.5pt + rgb("#d0d0d0") },
    table.header(
      repeat: true,
      [*S.No*], [*Description*], [*Quantity*], [*Unit*], [*Rate (Rs)*], [*Amount (Rs)*]
    ),
${rows.join('\n')}
  )
  ${leadBreakdownTypst}
]
#v(16pt)
`
}

/** Generates Typst markup for a schedule of flat SOR items. */
export function sorTableToTypst(sheets: DataSheet[]): string {
  const sorSheets = sheets.filter((s) => s.recipe.itemSource === 'SOR')
  if (sorSheets.length === 0) return ''

  const rows = sorSheets.map((sheet, idx) => {
    const sNo = `[${idx + 1}]`
    const desc = `[${escapeTypst(sheet.recipe.description)}]`
    const unit = `[${escapeTypst(sheet.recipe.unit || 'unit')}]`
    const rate = sheet.sorPrintRate
    let rateCell = ''
    if (rate && !rate.hasNumericRate && rate.rateText) {
      rateCell = `[#text(8pt, style: "italic")[${escapeTypst(rate.rateText)}]]`
    } else if (rate?.hasNumericRate) {
      rateCell = `[*Rs. ${fmtMoney(rate.finalRate)}*]`
    } else {
      rateCell = `[#text(8pt, fill: rgb("#888"))[Rate not published]]`
    }
    return `  ${sNo}, ${desc}, ${unit}, ${rateCell},`
  })

  return `
#block(breakable: true)[
  #rect(width: 100%, fill: rgb("#edf5fa"), stroke: (left: 3.5pt + rgb("#163f57")), inset: (x: 8pt, y: 6pt))[
    #text(8pt, fill: rgb("#4e6675"))[SCHEDULE OF RATES] \\
    #text(11pt, weight: "bold", fill: rgb("#163f57"))[Standard Schedule of Rates (SOR Items)]
  ]
  #v(3pt)
  #table(
    columns: (10mm, 1fr, 20mm, 35mm),
    align: (center, left, center, right),
    stroke: (x, y) => if y == 0 { (bottom: 1.2pt + rgb("#14364b")) } else { 0.5pt + rgb("#d0d0d0") },
    table.header(
      repeat: true,
      [*S.No*], [*Description of Item*], [*Unit*], [*Published Rate (Rs)*]
    ),
${rows.join('\n')}
  )
]
#v(16pt)
`
}

export interface TypstDocumentOptions {
  projectName?: string
  sorYear?: string
  sorZone?: string
  fontScale?: number
  pageSize?: 'a4' | 'a3' | 'letter'
  orientation?: 'portrait' | 'landscape'
}

/**
 * Compiles a list of DataSheets into a complete, self-contained Typst document string.
 */
export function buildDataSheetsTypstDocument(
  sheets: DataSheet[],
  options: TypstDocumentOptions = {}
): string {
  const paper = options.pageSize || 'a4'
  const flipped = options.orientation === 'landscape'
  const fontScale = options.fontScale || 1
  const fontSize = `${(10 * fontScale).toFixed(1)}pt`
  const projectName = options.projectName || 'Detailed Estimate'
  const sorYear = options.sorYear ? `SOR: ${escapeTypst(options.sorYear)}` : ''

  const sorSheets = sheets.filter((s) => s.recipe.itemSource === 'SOR')
  const ssrSheets = sheets.filter((s) => s.recipe.itemSource !== 'SOR')

  const parts: string[] = []

  // Document setup
  parts.push(`
#set document(title: "${escapeTypst(projectName)} - Rate Analysis", author: "E-Estimate")
#set page(
  paper: "${paper}",
  flipped: ${flipped},
  margin: (x: 14mm, top: 16mm, bottom: 16mm),
  header: [
    #grid(
      columns: (1fr, 1fr),
      align: (left, right),
      text(7.5pt, fill: rgb("#6c8290"))[${escapeTypst(projectName)}],
      text(7.5pt, fill: rgb("#6c8290"))[RATE ANALYSIS (DATA BOOK) ${sorYear}]
    )
    #v(-2pt)
    #line(length: 100%, stroke: 0.5pt + rgb("#cbd5e1"))
  ],
  numbering: "1 of 1",
  number-align: center
)
#set text(font: "Times New Roman", size: ${fontSize})

#align(center)[
  #text(15pt, weight: "bold", fill: rgb("#14364b"))[RATE ANALYSIS (DATA BOOK)] \\
  #if "${escapeTypst(projectName)}" != "" [
    #text(11pt, weight: "bold", fill: rgb("#334155"))[${escapeTypst(projectName)}] \\
  ]
  #if "${sorYear}" != "" [
    #text(9pt, fill: rgb("#64748b"))[Standard Schedule of Rates (${sorYear})]
  ]
]
#v(10pt)
`)

  // Render SOR table first if any SOR items exist
  if (sorSheets.length > 0) {
    parts.push(sorTableToTypst(sheets))
  }

  // Render each SSR sheet
  for (const sheet of ssrSheets) {
    parts.push(
      rateAnalysisRecipeToTypst(
        sheet.recipe,
        sheet.leadApplications,
        sheet.leadVariants
      )
    )
  }

  return parts.join('\n')
}
