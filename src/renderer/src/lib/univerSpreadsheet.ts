import {
  BooleanNumber,
  CellValueType,
  LocaleType,
  type ICellData,
  type IWorkbookData,
  type IWorksheetData
} from '@univerjs/core'
import type {
  CellRange,
  LegacySpreadsheetDocument,
  ProjectNode,
  SpreadsheetCell,
  SpreadsheetDocument
} from '../types/project'

// Keep a practical Excel-like working area available without eagerly creating
// cell objects. Univer virtualizes the empty grid, so these dimensions do not
// materially increase the saved workbook size.
const DEFAULT_ROWS = 1000
const DEFAULT_COLUMNS = 100

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
  if (isUniverWorkbookData(node.spreadsheet)) return ensureWorkbookCapacity(node.spreadsheet)
  if (isLegacySpreadsheetDocument(node.spreadsheet)) return legacyToUniverWorkbook(node)
  return blankUniverWorkbook(node, DEFAULT_ROWS, DEFAULT_COLUMNS, {})
}

function ensureWorkbookCapacity(workbook: IWorkbookData): Partial<IWorkbookData> {
  const sheets = Object.fromEntries(
    Object.entries(workbook.sheets).map(([id, sheet]) => [
      id,
      {
        ...sheet,
        rowCount: Math.max(sheet.rowCount ?? 0, DEFAULT_ROWS),
        columnCount: Math.max(sheet.columnCount ?? 0, DEFAULT_COLUMNS)
      }
    ])
  )

  return { ...workbook, sheets }
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

/**
 * Build a complete workbook snapshot from literal rows (template-generated
 * measurement sheets). Numbers become numeric cells so `finalCell` roll-up and
 * printing read them like user-entered values.
 */
export function workbookFromRows(
  node: ProjectNode,
  rows: (string | number | null)[][]
): IWorkbookData {
  const cellData: IWorksheetData['cellData'] = {}
  rows.forEach((row, r) => {
    row.forEach((value, c) => {
      if (value === null || value === '') return
      cellData[r] = cellData[r] ?? {}
      cellData[r][c] =
        typeof value === 'number'
          ? { v: value, t: CellValueType.NUMBER }
          : { v: value, t: CellValueType.STRING }
    })
  })
  return blankUniverWorkbook(
    node,
    Math.max(rows.length + 20, DEFAULT_ROWS),
    DEFAULT_COLUMNS,
    cellData
  ) as IWorkbookData
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

  return blankUniverWorkbook(
    node,
    Math.max(legacy.rows, DEFAULT_ROWS),
    Math.max(legacy.columns, DEFAULT_COLUMNS),
    cellData
  )
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

/**
 * The block every written cell on a sheet falls inside — the print area to use
 * when the item does not name one.
 *
 * `PrintConfig.range` has always documented "unset means the whole used range";
 * this is what computes that range. It takes the smallest and largest row and
 * column holding anything — a value or a formula — so a sheet's working columns
 * off to the right are included if they were written to, and trailing blank rows
 * are not.
 *
 * Blank-but-styled cells deliberately do not count. A stray border or fill would
 * otherwise drag the printed area out across empty space, which is the sort of
 * thing nobody notices until it reaches paper.
 *
 * Returns null when the sheet is empty, which callers should read as "no opinion"
 * and fall back to whatever they did before.
 */
export function usedCellRange(spreadsheet: SpreadsheetDocument | undefined): CellRange | null {
  if (!spreadsheet) return null

  const raw = spreadsheet as unknown as {
    sheets?: Record<string, { cellData?: Record<string, Record<string, CellLike>> }>
    cells?: Record<string, CellLike>
  }

  let startRow = Number.POSITIVE_INFINITY
  let startColumn = Number.POSITIVE_INFINITY
  let endRow = -1
  let endColumn = -1

  const note = (row: number, column: number): void => {
    if (!Number.isFinite(row) || !Number.isFinite(column)) return
    if (row < startRow) startRow = row
    if (column < startColumn) startColumn = column
    if (row > endRow) endRow = row
    if (column > endColumn) endColumn = column
  }

  if (raw.sheets) {
    // One sheet per item, so every sheet in the snapshot belongs to this item;
    // walking them all cannot pick the wrong one.
    for (const sheet of Object.values(raw.sheets)) {
      for (const [rowKey, row] of Object.entries(sheet?.cellData ?? {})) {
        for (const [columnKey, cell] of Object.entries(row ?? {})) {
          if (!cellHasContent(cell)) continue
          note(Number(rowKey), Number(columnKey))
        }
      }
    }
  } else if (raw.cells) {
    // Legacy shape: a flat map keyed by A1 reference.
    for (const [ref, cell] of Object.entries(raw.cells)) {
      if (!cellHasContent(cell)) continue
      const parsed = parseCellRef(ref)
      if (parsed) note(parsed[0], parsed[1])
    }
  }

  if (endRow < 0 || endColumn < 0) return null
  return { startRow, startColumn, endRow, endColumn }
}

type CellLike = { v?: unknown; f?: unknown } | null | undefined

function cellHasContent(cell: CellLike): boolean {
  if (!cell) return false
  const hasValue = cell.v !== undefined && cell.v !== null && String(cell.v).trim() !== ''
  const hasFormula = cell.f !== undefined && cell.f !== null && String(cell.f).trim() !== ''
  return hasValue || hasFormula
}
