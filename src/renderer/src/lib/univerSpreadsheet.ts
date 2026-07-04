import {
  BooleanNumber,
  CellValueType,
  LocaleType,
  type ICellData,
  type IWorkbookData,
  type IWorksheetData
} from '@univerjs/core'
import type {
  LegacySpreadsheetDocument,
  ProjectNode,
  SpreadsheetCell,
  SpreadsheetDocument
} from '../types/project'

const DEFAULT_ROWS = 100
const DEFAULT_COLUMNS = 26

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '-')
}

function workbookId(nodeId: string): string {
  return `workbook-${safeId(nodeId)}`
}

function sheetId(nodeId: string): string {
  return `sheet-${safeId(nodeId)}-1`
}

function workbookName(node: ProjectNode): string {
  return node.itemCode || node.name || 'Spreadsheet'
}

export function isUniverWorkbookData(
  spreadsheet: SpreadsheetDocument | undefined
): spreadsheet is IWorkbookData {
  if (!spreadsheet || typeof spreadsheet !== 'object') return false
  const maybeWorkbook = spreadsheet as Partial<IWorkbookData>
  return Array.isArray(maybeWorkbook.sheetOrder) && typeof maybeWorkbook.sheets === 'object'
}

export function isLegacySpreadsheetDocument(
  spreadsheet: SpreadsheetDocument | undefined
): spreadsheet is LegacySpreadsheetDocument {
  if (!spreadsheet || typeof spreadsheet !== 'object') return false
  const maybeLegacy = spreadsheet as Partial<LegacySpreadsheetDocument>
  return (
    typeof maybeLegacy.rows === 'number' &&
    typeof maybeLegacy.columns === 'number' &&
    typeof maybeLegacy.cells === 'object'
  )
}

export function createUniverWorkbookData(node: ProjectNode): Partial<IWorkbookData> {
  if (isUniverWorkbookData(node.spreadsheet)) return node.spreadsheet
  if (isLegacySpreadsheetDocument(node.spreadsheet)) return legacyToUniverWorkbook(node)
  return blankUniverWorkbook(node, DEFAULT_ROWS, DEFAULT_COLUMNS, {})
}

function blankUniverWorkbook(
  node: ProjectNode,
  rows: number,
  columns: number,
  cellData: IWorksheetData['cellData']
): Partial<IWorkbookData> {
  const unitId = workbookId(node.id)
  const subUnitId = sheetId(node.id)

  return {
    id: unitId,
    name: workbookName(node),
    appVersion: '0.25.0',
    locale: LocaleType.EN_US,
    styles: {},
    sheetOrder: [subUnitId],
    sheets: {
      [subUnitId]: {
        id: subUnitId,
        name: 'Sheet1',
        rowCount: Math.max(rows, 1),
        columnCount: Math.max(columns, 1),
        cellData,
        rowData: {},
        columnData: {},
        mergeData: [],
        freeze: { xSplit: 0, ySplit: 0, startRow: 0, startColumn: 0 },
        hidden: BooleanNumber.FALSE,
        showGridlines: BooleanNumber.TRUE,
        rightToLeft: BooleanNumber.FALSE,
        tabColor: '',
        zoomRatio: 1,
        scrollTop: 0,
        scrollLeft: 0,
        defaultColumnWidth: 88,
        defaultRowHeight: 24,
        rowHeader: { width: 46 },
        columnHeader: { height: 20 }
      }
    }
  }
}

function legacyToUniverWorkbook(node: ProjectNode): Partial<IWorkbookData> {
  const legacy = node.spreadsheet as LegacySpreadsheetDocument
  const cellData: IWorksheetData['cellData'] = {}

  for (const [ref, cell] of Object.entries(legacy.cells)) {
    const position = parseCellRef(ref)
    if (!position) continue

    const data = legacyCellToUniver(cell)
    if (!data) continue

    const [row, column] = position
    cellData[row] = cellData[row] ?? {}
    cellData[row][column] = data
  }

  return blankUniverWorkbook(node, legacy.rows, legacy.columns, cellData)
}

function legacyCellToUniver(cell: SpreadsheetCell): ICellData | null {
  const formula = cell.formula?.trim()
  if (formula) return { f: formula.startsWith('=') ? formula : `=${formula}` }
  if (cell.value === undefined || cell.value === '') return null
  return { v: cell.value, t: CellValueType.STRING }
}

function parseCellRef(ref: string): [row: number, column: number] | null {
  const match = /^([A-Z]+)([1-9]\d*)$/i.exec(ref.trim())
  if (!match) return null

  let column = 0
  for (const char of match[1].toUpperCase()) {
    column = column * 26 + (char.charCodeAt(0) - 64)
  }

  return [Number(match[2]) - 1, column - 1]
}
