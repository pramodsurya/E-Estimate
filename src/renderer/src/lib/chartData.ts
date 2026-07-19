// Convert a 2D block of cell values + a ChartDef into a Chart.js config.
// Pure (no Chart.js import) so it can be unit-tested and reused for print.

import type { CellRange, ChartDef, ChartType } from '../types/project'

export type CellValue = string | number | boolean | null | undefined

type SnapshotCell = {
  v?: unknown
  p?: { body?: { dataStream?: unknown } } | null
}

type SnapshotSheet = {
  cellData?: Record<number, Record<number, SnapshotCell>>
}

type WorkbookSnapshot = {
  sheetOrder?: string[]
  sheets?: Record<string, SnapshotSheet>
}

/** Minimal Chart.js config shape (avoids importing chart.js types here). */
export interface ChartJsConfig {
  type: string
  data: {
    labels: string[]
    datasets: Array<{
      label: string
      data: number[] | Array<{ x: number; y: number }>
      backgroundColor?: string | string[]
      borderColor?: string | string[]
      borderWidth?: number
      fill?: boolean
      tension?: number
    }>
  }
  options: Record<string, unknown>
}

const PALETTE = [
  '#4e79a7',
  '#f28e2b',
  '#e15759',
  '#76b7b2',
  '#59a14f',
  '#edc948',
  '#b07aa1',
  '#ff9da7',
  '#9c755f',
  '#bab0ac'
]

function validRange(range: CellRange | null | undefined): range is CellRange {
  if (!range) return false
  return (
    Number.isInteger(range.startRow) &&
    Number.isInteger(range.startColumn) &&
    Number.isInteger(range.endRow) &&
    Number.isInteger(range.endColumn) &&
    range.startRow >= 0 &&
    range.startColumn >= 0 &&
    range.endRow >= range.startRow &&
    range.endColumn >= range.startColumn &&
    (range.endRow - range.startRow + 1) * (range.endColumn - range.startColumn + 1) <= 100_000
  )
}

function firstSnapshotSheet(snapshot: WorkbookSnapshot): SnapshotSheet | null {
  const firstId = snapshot.sheetOrder?.[0]
  if (firstId && snapshot.sheets?.[firstId]) return snapshot.sheets[firstId]
  const fallbackId = Object.keys(snapshot.sheets ?? {})[0]
  return fallbackId ? snapshot.sheets?.[fallbackId] ?? null : null
}

function snapshotCellValue(cell: SnapshotCell | undefined): CellValue {
  const value = cell?.v
  if (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    if (value !== null && value !== undefined) return value
  }
  const stream = cell?.p?.body?.dataStream
  if (typeof stream === 'string') {
    return stream.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '').replace(/\n+$/g, '')
  }
  return null
}

/**
 * Read a chart range directly from a saved Univer workbook snapshot. This is a
 * restore-time fallback for the brief period before the live sheet facade is ready.
 */
export function readChartValuesFromSnapshot(
  snapshot: unknown,
  range: CellRange | null | undefined
): CellValue[][] {
  if (!snapshot || typeof snapshot !== 'object' || !validRange(range)) return []
  const sheet = firstSnapshotSheet(snapshot as WorkbookSnapshot)
  if (!sheet) return []

  const values: CellValue[][] = []
  for (let row = range.startRow; row <= range.endRow; row += 1) {
    const current: CellValue[] = []
    for (let column = range.startColumn; column <= range.endColumn; column += 1) {
      current.push(snapshotCellValue(sheet.cellData?.[row]?.[column]))
    }
    values.push(current)
  }
  return values
}

/** True when at least one cell can contribute a label or numeric chart value. */
export function chartValuesContainData(values: CellValue[][]): boolean {
  return values.some((row) =>
    row.some((value) => value !== null && value !== undefined && String(value).trim() !== '')
  )
}

function toNumber(v: CellValue): number {
  if (typeof v === 'number') return v
  if (typeof v === 'boolean') return v ? 1 : 0
  if (typeof v === 'string') {
    const n = Number(v.replace(/[, ]+/g, ''))
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

function toLabel(v: CellValue): string {
  if (v === null || v === undefined) return ''
  return String(v)
}

function rgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!m) return hex
  const r = parseInt(m[1], 16)
  const g = parseInt(m[2], 16)
  const b = parseInt(m[3], 16)
  return `rgba(${r},${g},${b},${alpha})`
}

/** Map our chart type to Chart.js base type (area => line + fill). */
function baseType(type: ChartType): string {
  if (type === 'area') return 'line'
  return type
}

function transposeMatrix(m: CellValue[][]): CellValue[][] {
  const cols = m.reduce((max, r) => Math.max(max, r?.length ?? 0), 0)
  const out: CellValue[][] = []
  for (let c = 0; c < cols; c += 1) {
    out.push(m.map((r) => r?.[c] ?? null))
  }
  return out
}

export function buildChartConfig(values: CellValue[][], def: ChartDef): ChartJsConfig {
  const rows = def.transpose
    ? transposeMatrix(Array.isArray(values) ? values : [])
    : Array.isArray(values)
      ? values
      : []
  const firstRowIsHeader = def.firstRowIsHeader ?? true
  const firstColumnIsLabels = def.firstColumnIsLabels ?? true

  const headerRow = firstRowIsHeader ? rows[0] ?? [] : null
  const bodyRows = firstRowIsHeader ? rows.slice(1) : rows
  const colCount = rows.reduce((max, r) => Math.max(max, r?.length ?? 0), 0)
  const dataColStart = firstColumnIsLabels ? 1 : 0

  const labels = bodyRows.map((r, i) =>
    firstColumnIsLabels ? toLabel(r?.[0]) : `Row ${i + 1}`
  )

  const seriesName = (col: number): string => {
    if (headerRow) return toLabel(headerRow[col]) || `Series ${col - dataColStart + 1}`
    return `Series ${col - dataColStart + 1}`
  }

  const type = baseType(def.type)
  const isPie = def.type === 'pie' || def.type === 'doughnut'
  const isScatter = def.type === 'scatter'
  const isArea = def.type === 'area'

  const datasets: ChartJsConfig['data']['datasets'] = []

  if (isScatter) {
    // Pair the first two data columns into {x, y} points.
    const xCol = dataColStart
    const yCol = dataColStart + 1
    const points = bodyRows.map((r) => ({ x: toNumber(r?.[xCol]), y: toNumber(r?.[yCol]) }))
    datasets.push({
      label: seriesName(yCol),
      data: points,
      backgroundColor: PALETTE[0],
      borderColor: PALETTE[0]
    })
  } else if (isPie) {
    // One ring: first data column, colored per slice.
    const col = dataColStart
    const data = bodyRows.map((r) => toNumber(r?.[col]))
    datasets.push({
      label: seriesName(col),
      data,
      backgroundColor: bodyRows.map((_, i) => PALETTE[i % PALETTE.length]),
      borderColor: '#ffffff',
      borderWidth: 1
    })
  } else {
    let colorIndex = 0
    for (let col = dataColStart; col < colCount; col += 1) {
      const color = PALETTE[colorIndex % PALETTE.length]
      colorIndex += 1
      datasets.push({
        label: seriesName(col),
        data: bodyRows.map((r) => toNumber(r?.[col])),
        backgroundColor: type === 'line' ? rgba(color, isArea ? 0.25 : 1) : color,
        borderColor: color,
        borderWidth: 2,
        fill: isArea,
        tension: type === 'line' ? 0.25 : 0
      })
    }
  }

  const legendDefault = isPie ? true : datasets.length > 1
  const legendDisplay = def.showLegend ?? legendDefault
  const legendPosition = def.legendPosition ?? 'top'

  const options: Record<string, unknown> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    // Crisper canvas backing store -> sharper PNG export for print.
    devicePixelRatio: 2,
    plugins: {
      title: { display: !!def.title, text: def.title ?? '' },
      legend: { display: legendDisplay, position: legendPosition }
    }
  }

  // Axes (bar / line / area / scatter). Pie & doughnut have none.
  if (!isPie) {
    const stacked = !!def.stacked && (def.type === 'bar' || isArea)
    const xTitle = def.xAxisTitle?.trim()
    const yTitle = def.yAxisTitle?.trim()
    options.scales = {
      x: {
        stacked,
        title: xTitle ? { display: true, text: xTitle } : { display: false }
      },
      y: {
        beginAtZero: true,
        stacked,
        title: yTitle ? { display: true, text: yTitle } : { display: false }
      }
    }
  }

  return { type, data: { labels, datasets }, options }
}
