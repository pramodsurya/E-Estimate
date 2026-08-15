/**
 * The comparative statement as a workbook.
 *
 * The PDF is the document that gets signed; the workbook is the one that gets
 * worked with — sorted, filtered, pasted into a note. So the figures go in as
 * numbers with formats rather than as pre-formatted strings, and every sheet is
 * left ready to read: headings frozen, columns sized, totals bold.
 *
 * A blank is deliberately blank. Where a row exists in one year only, or a
 * percentage has no base to stand on, the cell is empty rather than zero — a
 * zero in a spreadsheet gets summed, and summing a figure that was never a
 * figure is how a wrong total reaches a sanctioning authority.
 */

import ExcelJS from 'exceljs'
import type { EestimateProject } from '../types/project'
import type { ComparativeStatement } from './comparativeStatement'
import type { ComparativeRow } from './comparativeRows'

const MONEY_FORMAT = '#,##0.00;[Red]-#,##0.00'
const PERCENT_FORMAT = '0.00"%";[Red]-0.00"%"'
const QUANTITY_FORMAT = '#,##0.000'

const INK = 'FF1F2933'
const HEADER_FILL = 'FF1D3A54'
const TOTAL_FILL = 'FFEFF3F6'
const RULE = 'FF8FA0AD'

const BORDER = {
  top: { style: 'thin' as const, color: { argb: RULE } },
  left: { style: 'thin' as const, color: { argb: RULE } },
  bottom: { style: 'thin' as const, color: { argb: RULE } },
  right: { style: 'thin' as const, color: { argb: RULE } }
}

interface Column {
  header: string
  width: number
  format?: string
}

function titleBlock(
  sheet: ExcelJS.Worksheet,
  columns: Column[],
  project: EestimateProject,
  heading: string,
  subheading: string
): void {
  const span = columns.length
  sheet.mergeCells(1, 1, 1, span)
  sheet.mergeCells(2, 1, 2, span)
  sheet.mergeCells(3, 1, 3, span)

  const name = sheet.getCell(1, 1)
  name.value = project.meta.name || project.root.name
  name.font = { bold: true, size: 14, color: { argb: INK } }
  name.alignment = { vertical: 'middle' }
  sheet.getRow(1).height = 22

  const title = sheet.getCell(2, 1)
  title.value = heading
  title.font = { bold: true, size: 12, color: { argb: INK } }

  const sub = sheet.getCell(3, 1)
  sub.value = subheading
  sub.font = { size: 10, italic: true, color: { argb: 'FF5C7080' } }
  sheet.getRow(4).height = 6
}

function headerRow(sheet: ExcelJS.Worksheet, columns: Column[], rowNumber: number): void {
  const row = sheet.getRow(rowNumber)
  columns.forEach((column, index) => {
    const cell = row.getCell(index + 1)
    cell.value = column.header
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.border = BORDER
  })
  row.height = 30
  sheet.columns = columns.map((column) => ({ width: column.width }))
  // Everything above and including the headings stays put while the figures scroll.
  sheet.views = [{ state: 'frozen', ySplit: rowNumber }]
}

/** A number, or a genuinely empty cell — never a zero standing in for "unknown". */
function figure(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function writeRow(
  sheet: ExcelJS.Worksheet,
  rowNumber: number,
  columns: Column[],
  values: Array<string | number | null>,
  emphasis: 'none' | 'total'
): void {
  const row = sheet.getRow(rowNumber)
  values.forEach((value, index) => {
    const cell = row.getCell(index + 1)
    cell.value = value
    cell.border = BORDER
    const format = columns[index]?.format
    if (format && typeof value === 'number') cell.numFmt = format
    cell.alignment = {
      horizontal: typeof value === 'number' ? 'right' : index === 1 ? 'left' : 'center',
      vertical: 'top',
      wrapText: index === 1
    }
    cell.font = { size: 10, color: { argb: INK }, bold: emphasis === 'total' }
    if (emphasis === 'total') {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TOTAL_FILL } }
      cell.border = { ...BORDER, top: { style: 'medium', color: { argb: INK } } }
    }
  })
}

function isTotalRow(row: ComparativeRow): boolean {
  return row.kind === 'total' || row.kind === 'grand'
}

function summarySheet(
  workbook: ExcelJS.Workbook,
  project: EestimateProject,
  statement: ComparativeStatement
): void {
  const columns: Column[] = [
    { header: 'Sl.', width: 6 },
    { header: 'Description', width: 52 },
    { header: `Amount ${statement.leftYear}`, width: 18, format: MONEY_FORMAT },
    { header: `Amount ${statement.rightYear}`, width: 18, format: MONEY_FORMAT },
    { header: 'Difference', width: 18, format: MONEY_FORMAT },
    { header: '%', width: 11, format: PERCENT_FORMAT }
  ]
  const sheet = workbook.addWorksheet('Summary', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
  })
  titleBlock(
    sheet,
    columns,
    project,
    statement.wholeEstimate ? 'Comparative Statement — General Abstract' : 'Comparative Statement — Selected Work',
    `${statement.leftYear} compared with ${statement.rightYear}` +
      (statement.wholeEstimate
        ? ''
        : ' · part of the estimate only; charges and GST are levied on the whole work and are not shown')
  )
  const headerAt = 5
  headerRow(sheet, columns, headerAt)

  statement.abstractRows.forEach((row, index) => {
    writeRow(
      sheet,
      headerAt + 1 + index,
      columns,
      [
        row.slNo ?? '',
        row.label,
        figure(row.left),
        figure(row.right),
        figure(row.difference),
        figure(row.percent)
      ],
      isTotalRow(row) ? 'total' : 'none'
    )
  })

  if (statement.warnings.length > 0) {
    let at = headerAt + statement.abstractRows.length + 3
    const heading = sheet.getCell(at, 1)
    heading.value = 'Read with these qualifications'
    heading.font = { bold: true, size: 11, color: { argb: 'FF9C2B22' } }
    for (const warning of statement.warnings) {
      at += 1
      sheet.mergeCells(at, 1, at, columns.length)
      const cell = sheet.getCell(at, 1)
      cell.value = warning.detail ? `${warning.message} ${warning.detail}` : warning.message
      cell.alignment = { wrapText: true, vertical: 'top' }
      cell.font = { size: 10, color: { argb: 'FF7A2018' } }
      sheet.getRow(at).height = 28
    }
  }
}

function componentSheet(
  workbook: ExcelJS.Workbook,
  project: EestimateProject,
  statement: ComparativeStatement,
  component: ComparativeStatement['components'][number],
  usedNames: Set<string>
): void {
  const columns: Column[] = [
    { header: 'Sl.', width: 6 },
    { header: 'Description', width: 62 },
    { header: 'Unit', width: 9 },
    { header: 'Quantity', width: 14, format: QUANTITY_FORMAT },
    { header: `Rate ${statement.leftYear}`, width: 15, format: MONEY_FORMAT },
    { header: `Rate ${statement.rightYear}`, width: 15, format: MONEY_FORMAT },
    { header: `Amount ${statement.leftYear}`, width: 18, format: MONEY_FORMAT },
    { header: `Amount ${statement.rightYear}`, width: 18, format: MONEY_FORMAT },
    { header: 'Difference', width: 18, format: MONEY_FORMAT },
    { header: '%', width: 11, format: PERCENT_FORMAT }
  ]
  const sheet = workbook.addWorksheet(uniqueSheetName(component.name, usedNames), {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
  })
  titleBlock(
    sheet,
    columns,
    project,
    component.name,
    `Component Abstract · ${statement.leftYear} compared with ${statement.rightYear}`
  )
  const headerAt = 5
  headerRow(sheet, columns, headerAt)

  component.rows.forEach((row, index) => {
    writeRow(
      sheet,
      headerAt + 1 + index,
      columns,
      [
        row.slNo ?? '',
        // Code and clause in one cell, as the sheet prints them.
        row.description ? `${row.label}
${row.description}` : row.label,
        row.unit ?? '',
        figure(row.quantity),
        figure(row.leftRate),
        figure(row.rightRate),
        figure(row.left),
        figure(row.right),
        figure(row.difference),
        figure(row.percent)
      ],
      'none'
    )
  })

  writeRow(
    sheet,
    headerAt + 1 + component.rows.length,
    columns,
    [
      '',
      'COMPONENT TOTAL',
      '',
      null,
      null,
      null,
      figure(component.leftTotal),
      figure(component.rightTotal),
      figure(component.difference),
      figure(component.percent)
    ],
    'total'
  )
}

/**
 * Excel forbids []:*?/\ in a sheet name, caps it at 31 characters, and refuses
 * duplicates — a component named after a chainage runs into all three.
 */
function uniqueSheetName(name: string, used: Set<string>): string {
  const cleaned = name.replace(/[[\]:*?/\\]/g, ' ').trim() || 'Component'
  let candidate = cleaned.slice(0, 31)
  let suffix = 2
  while (used.has(candidate.toLowerCase())) {
    const tail = ` (${suffix})`
    candidate = `${cleaned.slice(0, 31 - tail.length)}${tail}`
    suffix += 1
  }
  used.add(candidate.toLowerCase())
  return candidate
}

export async function buildComparativeWorkbook(
  project: EestimateProject,
  statement: ComparativeStatement
): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'E-Estimate'
  workbook.created = new Date()

  summarySheet(workbook, project, statement)
  const used = new Set<string>(['summary'])
  if (statement.leadRows.length > 0) {
    componentSheet(
      workbook,
      project,
      statement,
      {
        nodeId: 'lead',
        name: 'Lead charges',
        rows: statement.leadRows.filter((row) => row.kind !== 'total'),
        leftTotal: statement.leadRows.reduce(
          (sum, row) => (row.kind === 'total' ? row.left ?? 0 : sum),
          0
        ),
        rightTotal: statement.leadRows.reduce(
          (sum, row) => (row.kind === 'total' ? row.right ?? 0 : sum),
          0
        ),
        difference: 0,
        percent: null
      },
      used
    )
  }
  for (const component of statement.components) {
    componentSheet(workbook, project, statement, component, used)
  }

  const buffer = await workbook.xlsx.writeBuffer()
  return new Uint8Array(buffer as ArrayBuffer)
}
