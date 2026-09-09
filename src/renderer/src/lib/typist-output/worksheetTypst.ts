/**
 * Render a Univer worksheet to Typst table markup.
 *
 * Univer's open-source build has no print engine, so today the app reconstructs a
 * faithful HTML table from the workbook snapshot (`lib/printRender.ts`). This is
 * the Typst twin: it reads the same snapshot fields (values, rich text, merges,
 * column widths, row styles, borders, fills, alignment, floating images) and
 * emits a `#table(...)` the E-Estimate Print Studio can compile straight to PDF.
 *
 * Everything the estimator types into the sheet survives: formatting, merges,
 * borders and gridlines, column widths, rich text runs and any image or chart.
 * What changes is who owns the page: the HTML path handed page size, margins and
 * scaling to Chromium's `printToPDF`; Typst owns fonts, page geometry and
 * pagination. The "Print Layout" dialog is gone — `#set page(...)` replaces it.
 *
 * Typst has no first-class per-row-height (rows grow to their content) and no
 * "nowrap", so those two translate loosely. See `normColor` for the colour
 * syntax accepted (Univer stores colours several ways; Typst wants `rgb("...")`).
 */

import type { CellRange, ChartDef, PrintConfig } from '../../types/project'
import { computeUsedRange, PAPER_MM, PX_PER_MM } from '../printRender'

/* ------------------------------------------------------------------ */
/* Minimal structural views of the Univer snapshot (mirrors printRender). */
/* ------------------------------------------------------------------ */

interface ColorStyle {
  rgb?: string
}
interface BorderStyle {
  s?: number
  cl?: ColorStyle
}
interface BorderData {
  t?: BorderStyle | null
  r?: BorderStyle | null
  b?: BorderStyle | null
  l?: BorderStyle | null
}
interface StyleData {
  ff?: string
  fs?: number
  it?: number
  bl?: number
  ul?: { s?: number } | null
  st?: { s?: number } | null
  cl?: ColorStyle | null
  bg?: ColorStyle | null
  ht?: number | null
  vt?: number | null
  tb?: number | null
  bd?: BorderData | null
  /** Text rotation { a: angle, v: vertical stack }. */
  tr?: { a?: number; v?: number } | null
  /** Cell padding in px. */
  pd?: { t?: number; r?: number; b?: number; l?: number } | null
  /** Number-format pattern, e.g. "#,##0.00", "0.0%", "₹#,##0". */
  n?: { pattern?: string } | null
}
interface CellData {
  v?: string | number | boolean | null
  s?: StyleData | string | null
  p?: { body?: { dataStream?: string; textRuns?: { st: number; ed: number; ts?: Record<string, unknown> }[] } } | null
  f?: string | null
}
interface WorksheetSnapshot {
  cellData?: Record<number, Record<number, CellData>>
  mergeData?: CellRange[]
  rowData?: Record<number, { h?: number; hd?: number }>
  columnData?: Record<number, { w?: number; hd?: number }>
  defaultColumnWidth?: number
  defaultRowHeight?: number
}
export interface WorksheetSnapshotLike {
  sheetOrder?: string[]
  sheets?: Record<string, WorksheetSnapshot>
  styles?: Record<string, StyleData>
  /** Plugin resources (drawings/images live here as JSON strings). */
  resources?: { name?: string; data?: string }[]
}

/** A floating image, positioned in px from the A1 grid origin. */
export interface SheetTypstImage {
  source: string
  left: number
  top: number
  width: number
  height: number
}

/* ------------------------------------------------------------------ */
/* Options                                                              */
/* ------------------------------------------------------------------ */

export interface SheetTypstOptions {
  /** Print the A/B/C column letters and row numbers. */
  showRowColHeaders?: boolean
  /** Number of leading data rows repeated as the table header on every page. */
  repeatHeaderRows?: number
  /** Scale applied to column widths so the sheet fits the printable area. */
  columnScale?: number
  /** Show gridlines when no explicit border is set (default true). */
  showGridlines?: boolean
  /**
   * Map a data-URL image to a path the Typst `image(...)` call can resolve.
   * The app's Typst compiler can only read images from a file on disk relative
   * to the workspace, never from an inline data URL — callers must materialise
   * the bytes and return a path. Omit to drop images (the table still prints).
   */
  imageResolver?: (dataUrl: string, index: number) => string | null
}

/** Renderer context — project name and title used for the page header. */
export interface SheetTypstContext {
  projectName: string
  title: string
}

/* ------------------------------------------------------------------ */
/* Constants                                                            */
/* ------------------------------------------------------------------ */

const DEFAULT_COL_W = 88
const DEFAULT_ROW_H = 24

/* eslint-disable no-control-regex */
const CONTROL_CHARS = /[\u0000-\u0009\u000B-\u001F\u007F]/g

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

function columnLabel(index: number): string {
  let n = index
  let label = ''
  do {
    label = String.fromCharCode(65 + (n % 26)) + label
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return label
}

/** Extract the display text from a cell, preferring the rich body stream. */
function cellText(cell: CellData): string {
  const stream = cell.p?.body?.dataStream
  if (typeof stream === 'string' && stream.length) {
    return stream.replace(/\r\n?/g, '\n').replace(CONTROL_CHARS, '').replace(/\n+$/g, '')
  }
  if (cell.v === null || cell.v === undefined) return ''
  return String(cell.v)
}

/**
 * Format a raw numeric cell value with an Excel/Univer number-format pattern.
 * Supports the common estimator patterns: grouping (#,##0), a fixed number of
 * decimals (0.00), percent (0.0%), an inline currency prefix/suffix (₹#, ##0),
 * and negative-in-parentheses "(#,##0.00)". Conditional and text-quoted segments
 * are ignored — the aim is a faithful figure, not a full Excel formatter.
 */
function formatNumberPattern(value: number, pattern: string): string {
  const parts = pattern.split(';')
  const negative = value < 0
  const section = (negative && parts.length > 1 ? parts[1] : parts[0] ?? '') ?? ''
  if (!section) return String(value)

  const negativeParens = /^\(.*\)$/.test(section.trim())
  const percents = (section.match(/%/g) ?? []).length
  const dot = section.indexOf('.')
  const fraction = dot >= 0 ? section.slice(dot + 1) : ''
  const decimals = Math.min(8, (fraction.match(/[0#]/g) ?? []).length)
  const integer = dot >= 0 ? section.slice(0, dot) : section
  const grouped = /[0#],[0#]/.test(integer)

  const abs = Math.abs(value) * Math.pow(100, percents)
  let formatted: string
  if (grouped) {
    formatted = abs.toLocaleString('en-IN', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    })
  } else {
    formatted = abs.toFixed(decimals)
  }
  if (percents > 0) formatted += '%'.repeat(percents)

  const { prefix, suffix } = numberLiterals(section)
  const sign = negative && !negativeParens ? '-' : ''
  return negativeParens && negative ? `${prefix}(${formatted})${suffix}` : `${prefix}${sign}${formatted}${suffix}`
}

/** Literal text before/after a number pattern's placeholder region. */
function numberLiterals(section: string): { prefix: string; suffix: string } {
  const first = section.search(/[0#]/)
  if (first < 0) return { prefix: '', suffix: '' }
  let last = first
  for (let i = first; i < section.length; i += 1) {
    if (/[0#%,.]/.test(section[i])) last = i
    else break
  }
  const trim = (s: string): string =>
    s.replace(/"[^"]*"/g, (m) => m.slice(1, -1)).replace(/[^%]/g, (c) => c).trim()
  return {
    prefix: section.slice(0, first).replace(/"/g, '').trim(),
    suffix: section.slice(last + 1).replace(/"/g, '').replace(/%/g, '').trim()
  }
}

/** The value to print in a cell, honouring its number-format pattern. */
function cellDisplayText(cell: CellData, style: StyleData | null): string {
  if (typeof cell.v === 'number' && Number.isFinite(cell.v) && style?.n?.pattern) {
    return formatNumberPattern(cell.v, style.n.pattern)
  }
  return cellText(cell)
}

/**
 * Normalise a Univer colour string to a Typst `rgb("...")` literal.
 * Univer stores colours as "#rrggbb", "rrggbb", "rgb(r,g,b)", or 8-digit "aarrggbb".
 */
function normColor(raw: string | null | undefined): string | null {
  if (!raw) return null
  const value = raw.trim()
  if (!value) return null
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return `rgb("${value}")`
  if (/^#[0-9a-fA-F]{8}$/.test(value)) return `rgb("#${value.slice(1, -2)}")`
  if (/^[0-9a-fA-F]{6}$/.test(value)) return `rgb("#${value}")`
  if (/^[0-9a-fA-F]{8}$/.test(value)) return `rgb("#${value.slice(0, -2)}")`
  const rgb = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/.exec(value)
  if (rgb) {
    const toHex = (n: string): string => Number(n).toString(16).padStart(2, '0')
    return `rgb("#${toHex(rgb[1])}${toHex(rgb[2])}${toHex(rgb[3])}")`
  }
  return null
}

function colourOf(c: ColorStyle | null | undefined): string | null {
  if (!c || !c.rgb) return null
  return normColor(c.rgb)
}

function resolveStyle(
  cell: CellData,
  styles: Record<string, StyleData> | undefined
): StyleData | null {
  const s = cell.s
  if (!s) return null
  if (typeof s === 'string' || typeof s === 'number') return styles?.[String(s)] ?? null
  return s
}

function firstSheet(snapshot: WorksheetSnapshotLike): WorksheetSnapshot | null {
  const id = snapshot.sheetOrder?.[0]
  if (id && snapshot.sheets?.[id]) return snapshot.sheets[id]
  const sheets = snapshot.sheets
  if (!sheets) return null
  const firstKey = Object.keys(sheets)[0]
  return firstKey ? sheets[firstKey] : null
}

/** Horizontal alignment from Univer's `ht` (1 left, 2 centre, 3 right). */
function hAlign(style: StyleData | null): 'left' | 'center' | 'right' | null {
  if (!style) return null
  if (style.ht === 1) return 'left'
  if (style.ht === 2) return 'center'
  if (style.ht === 3) return 'right'
  return null
}

/* ------------------------------------------------------------------ */
/* Used-range detection                                                 */
/* ------------------------------------------------------------------ */

function resolveRange(snapshot: WorksheetSnapshotLike, config: PrintConfig): CellRange | null {
  const sheet = firstSheet(snapshot)
  const used = computeUsedRange(sheet ?? undefined)
  return config.range ?? used
}

/* ------------------------------------------------------------------ */
/* Image extraction                                                     */
/* ------------------------------------------------------------------ */

export interface PrintImage {
  source: string
  left: number
  top: number
  width: number
  height: number
}

export function extractSheetImages(snapshot: WorksheetSnapshotLike): PrintImage[] {
  const resources = snapshot.resources
  if (!Array.isArray(resources)) return []
  const sheet = (snapshot.sheets?.[snapshot.sheetOrder?.[0] ?? ''] ??
    Object.values(snapshot.sheets ?? {})[0]) as
    | {
        columnData?: Record<number, { w?: number; hd?: number }>
        rowData?: Record<number, { h?: number; ah?: number; hd?: number }>
        defaultColumnWidth?: number
        defaultRowHeight?: number
      }
    | undefined

  const defW = sheet?.defaultColumnWidth ?? 88
  const defH = sheet?.defaultRowHeight ?? 24

  const colW = (c: number): number => {
    if (sheet?.columnData?.[c]?.hd === 1) return 0
    return sheet?.columnData?.[c]?.w ?? defW
  }
  const rowH = (r: number): number => {
    if (sheet?.rowData?.[r]?.hd === 1) return 0
    return sheet?.rowData?.[r]?.ah ?? sheet?.rowData?.[r]?.h ?? defH
  }

  const images: PrintImage[] = []
  const seen = new Set<string>()

  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) {
      for (const item of value) visit(item)
      return
    }
    const obj = value as Record<string, unknown>
    const source = obj.source
    const transform = obj.transform as Record<string, unknown> | undefined
    const sheetTransform = (obj.sheetTransform || obj.axisAlignSheetTransform) as
      | {
          from?: { row?: number; rowOffset?: number; column?: number; columnOffset?: number }
          to?: { row?: number; rowOffset?: number; column?: number; columnOffset?: number }
        }
      | undefined

    if (
      typeof source === 'string' &&
      source.length > 0 &&
      (sheetTransform || (transform && typeof transform === 'object'))
    ) {
      let left = 0
      let top = 0
      let width = 0
      let height = 0

      // Univer sheet drawings store cell-anchored coordinates in `sheetTransform.from` and `sheetTransform.to`
      if (sheetTransform && sheetTransform.from) {
        const fromCol = Number(sheetTransform.from.column ?? 0)
        const fromColOffset = Number(sheetTransform.from.columnOffset ?? 0)
        const fromRow = Number(sheetTransform.from.row ?? 0)
        const fromRowOffset = Number(sheetTransform.from.rowOffset ?? 0)

        let startX = 0
        for (let c = 0; c < fromCol; c++) startX += colW(c)
        let startY = 0
        for (let r = 0; r < fromRow; r++) startY += rowH(r)

        left = startX + fromColOffset
        top = startY + fromRowOffset

        if (sheetTransform.to) {
          const toCol = Number(sheetTransform.to.column ?? 0)
          const toColOffset = Number(sheetTransform.to.columnOffset ?? 0)
          const toRow = Number(sheetTransform.to.row ?? 0)
          const toRowOffset = Number(sheetTransform.to.rowOffset ?? 0)

          let endX = 0
          for (let c = 0; c < toCol; c++) endX += colW(c)
          let endY = 0
          for (let r = 0; r < toRow; r++) endY += rowH(r)

          width = Math.max(0, endX + toColOffset - left)
          height = Math.max(0, endY + toRowOffset - top)
        } else if (transform) {
          width = Number(transform.width ?? 0)
          height = Number(transform.height ?? 0)
        }
      } else if (transform) {
        left = Number(transform.left ?? 0)
        top = Number(transform.top ?? 0)
        width = Number(transform.width ?? 0)
        height = Number(transform.height ?? 0)
        // Univer canvas coordinates include rowHeaderWidth (46px) and columnHeaderHeight (20px)
        if (left >= 46) left -= 46
        if (top >= 20) top -= 20
      }

      const key = `${source.slice(0, 32)}:${left}:${top}:${width}:${height}`
      if (width > 0 && height > 0 && !seen.has(key)) {
        seen.add(key)
        images.push({ source, left, top, width, height })
      }
    }
    for (const key of Object.keys(obj)) visit(obj[key])
  }

  for (const res of resources) {
    if (!res || typeof res.data !== 'string') continue
    try {
      visit(JSON.parse(res.data))
    } catch {
      /* ignore non-JSON resources */
    }
  }
  return images
}

/**
 * Images and charts that fall inside the printed area, offset in px from the A1
 * origin (same convention the HTML path uses). Callers materialise their data
 * URLs to files and feed them back through `imageResolver`.
 */
export function collectSheetImages(
  snapshot: WorksheetSnapshotLike,
  charts: ChartDef[],
  range: CellRange
): SheetTypstImage[] {
  const images: SheetTypstImage[] = []
  const within = (left: number, top: number, width: number, height: number): boolean =>
    left < (range.endColumn + 1) * DEFAULT_COL_W &&
    left + width > 0 &&
    top < (range.endRow + 1) * DEFAULT_ROW_H &&
    top + height > 0

  for (const img of extractSheetImages(snapshot)) {
    if (within(img.left, img.top, img.width, img.height)) images.push(img)
  }
  for (const ch of charts) {
    if (!ch.png) continue
    images.push({
      source: ch.png,
      left: ch.position.startX,
      top: ch.position.startY,
      width: ch.position.width,
      height: ch.position.height
    })
  }
  return images
}

/* ------------------------------------------------------------------ */
/* Cell rendering                                                       */
/* ------------------------------------------------------------------ */

function buildMergeLookup(
  sheet: WorksheetSnapshot,
  range: CellRange
): { anchors: Map<string, { rowSpan: number; colSpan: number }>; covered: Set<string> } {
  const anchors = new Map<string, { rowSpan: number; colSpan: number }>()
  const covered = new Set<string>()
  for (const m of sheet.mergeData ?? []) {
    if (
      m.endRow < range.startRow ||
      m.startRow > range.endRow ||
      m.endColumn < range.startColumn ||
      m.startColumn > range.endColumn
    ) {
      continue
    }
    anchors.set(`${m.startRow}:${m.startColumn}`, {
      rowSpan: m.endRow - m.startRow + 1,
      colSpan: m.endColumn - m.startColumn + 1
    })
    for (let r = m.startRow; r <= m.endRow; r += 1) {
      for (let c = m.startColumn; c <= m.endColumn; c += 1) {
        if (r === m.startRow && c === m.startColumn) continue
        covered.add(`${r}:${c}`)
      }
    }
  }
  return { anchors, covered }
}



function escapeTypst(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\[/g, '\\[').replace(/\]/g, '\\]')
    .replace(/#/g, '\\#').replace(/\$/g, '\\$').replace(/"/g, '\\"')
    .replace(/\*/g, '\\*').replace(/_/g, '\\_').replace(/@/g, '\\@')
}
function escapeQuoted(text: string): string { return text.replace(/\\/g, '\\\\').replace(/"/g, '\\"') }
function borderSide(b: BorderStyle | null | undefined): string | null {
  if (!b || !b.s) return null
  const color = colourOf(b.cl) ?? 'rgb("#000000")'
  const widths: Record<number, string> = { 1: '0.5pt', 2: '0.5pt', 3: '0.5pt', 4: '1pt', 5: '1pt', 6: '1pt', 7: '1.5pt', 8: '1pt', 9: '1pt', 10: '1pt', 11: '1pt', 12: '1pt', 13: '1.5pt' }
  return (widths[b.s] ?? '0.5pt') + ' + ' + color
}
function textArgs(style: StyleData | null): string {
  if (!style) return ''
  const parts: string[] = []
  if (style.ff) parts.push('font: "' + escapeQuoted(style.ff) + '"')
  if (style.fs && style.fs > 0) parts.push('size: ' + style.fs + 'pt')
  if (style.bl) parts.push('weight: "bold"')
  if (style.it) parts.push('style: "italic"')
  const fg = colourOf(style.cl)
  if (fg) parts.push('fill: ' + fg)
  const deco: string[] = []
  if (style.ul?.s) deco.push('underline')
  if (style.st?.s) deco.push('line-through')
  if (deco.length) parts.push('decor: (' + deco.join(', ') + ')')
  return parts.join(', ')
}
function runArgs(ts: Record<string, unknown> | undefined): string {
  if (!ts) return ''
  const parts: string[] = []
  if (ts.bl) parts.push('weight: "bold"')
  if (ts.it) parts.push('style: "italic"')
  const ul = ts.ul as { s?: unknown } | undefined
  const st = ts.st as { s?: unknown } | undefined
  const deco: string[] = []
  if (ul?.s) deco.push('underline')
  if (st?.s) deco.push('line-through')
  if (deco.length) parts.push('decor: (' + deco.join(', ') + ')')
  const colour = normColor((ts.cl as { rgb?: string } | undefined)?.rgb)
  if (colour) parts.push('fill: ' + colour)
  if (typeof ts.fs === 'number' && ts.fs > 0) parts.push('size: ' + ts.fs + 'pt')
  if (typeof ts.ff === 'string' && ts.ff) parts.push('font: "' + escapeQuoted(ts.ff) + '"')
  return parts.join(', ')
}
function cellContent(cell: CellData, style: StyleData | null): string {
  const body = cell.p?.body
  const stream = body?.dataStream
  const runs = body?.textRuns
  const base = textArgs(style)
  const plain = escapeTypst(cellDisplayText(cell, style)).replace(/\n/g, '#linebreak()')
  if (typeof stream !== 'string' || !stream.length || !runs?.length) {
    return rotationWrap(style, base ? '#text(' + base + ')[' + plain + ']' : plain)
  }
  const cssAt = new Array<string>(stream.length).fill(base)
  for (const run of runs) {
    const combined = [base, runArgs(run.ts)].filter(Boolean).join(', ')
    for (let i = Math.max(0, run.st); i < Math.min(stream.length, run.ed); i++) cssAt[i] = combined
  }
  const out: { args: string; text: string }[] = []
  let current: { args: string; text: string } | null = null
  for (let i = 0; i < stream.length; i++) {
    const ch = stream[i]
    if (ch === '\r' || ch === '\n' || ch === '\b') continue
    const args = cssAt[i]
    if (current && current.args === args) current.text += ch
    else { if (current) out.push(current); current = { args, text: ch } }
  }
  if (current) out.push(current)
  return rotationWrap(style, out.map(seg => seg.args ? '#text(' + seg.args + ')[' + escapeTypst(seg.text) + ']' : escapeTypst(seg.text)).join(''))
}
function rotationWrap(style: StyleData | null, content: string): string {
  const tr = style?.tr
  if (!tr) return content
  const vertical = tr.v === 1
  const angle = tr.a
  if (!vertical && (!angle || angle % 360 === 0)) return content
  return '#rotate(' + (vertical ? 90 : angle ?? 90) + 'deg)[' + content + ']'
}
interface CellState {
  stroke: string; fill: string; align: 'left' | 'center' | 'right' | null
  valign: 'top' | 'horizon' | 'bottom' | null; inset: string | null; content: string
}
function styleForCell(cell: CellData, styles: Record<string, StyleData> | undefined, gridline: boolean): CellState {
  const style = resolveStyle(cell, styles)
  let stroke = 'none'
  if (style?.bd) {
    const sides: string[] = []
    for (const [key, name] of [['t', 'top'], ['r', 'right'], ['b', 'bottom'], ['l', 'left']] as const) {
      const side = borderSide(style.bd[key]); if (side) sides.push(name + ': ' + side)
    }
    if (sides.length) stroke = '(' + sides.join(', ') + ')'
  }
  if (stroke === 'none' && gridline) stroke = '0.5pt + luma(200)'
  return { stroke, fill: colourOf(style?.bg) ?? 'none', align: hAlign(style),
    valign: style?.vt === 1 ? 'top' : style?.vt === 2 ? 'horizon' : style?.vt === 3 ? 'bottom' : null,
    inset: cellInset(style), content: cellContent(cell, style) }
}
function cellInset(style: StyleData | null): string | null {
  const pd = style?.pd
  if (!pd) return null
  const x = ((pd.l ?? 0) + (pd.r ?? 0)) * 0.75 / 2
  const y = ((pd.t ?? 0) + (pd.b ?? 0)) * 0.75 / 2
  return 'inset: (x: ' + x.toFixed(1) + 'pt, y: ' + y.toFixed(1) + 'pt)'
}
function cellBlock(state: CellState, span: { colspan?: number; rowspan?: number }, header: boolean, rowHeightMm?: string): string {
  const args: string[] = []
  if (header) args.push('fill: rgb("#f1f3f5")')
  else if (state.fill !== 'none') args.push('fill: ' + state.fill)
  args.push('stroke: ' + state.stroke)
  if (span.colspan && span.colspan > 1) args.push('colspan: ' + span.colspan)
  if (span.rowspan && span.rowspan > 1) args.push('rowspan: ' + span.rowspan)
  const h = header ? 'center' : state.align ?? 'left'
  const v = header ? null : state.valign
  if (v) args.push('align: (' + h + ' + ' + v + ')')
  else if (h !== 'left') args.push('align: ' + h)
  let content = header && state.content ? '#text(weight: "bold")[' + state.content + ']' : state.content
  if (state.inset) content = '#block(' + state.inset + ')[' + content + ']'
  if (rowHeightMm) content = '#block(height: ' + rowHeightMm + ')[' + content + ']'
  return 'table.cell(' + args.join(', ') + ')[' + content + ']'
}
function renderRowCells(sheet: WorksheetSnapshot, range: CellRange, row: number, anchors: Map<string, { rowSpan: number; colSpan: number }>, covered: Set<string>, styles: Record<string, StyleData> | undefined, gridline: boolean, showRC: boolean, header: boolean, rowHeightMm?: string): string[] {
  const parts: string[] = []
  if (showRC) parts.push('table.cell(fill: rgb("#f1f3f5"), stroke: 0.5pt + luma(200), align: center)[#text(weight: "bold")[' + (row + 1) + ']]')
  for (let c = range.startColumn; c <= range.endColumn; c++) {
    const key = row + ':' + c
    if (covered.has(key)) continue
    const cell = sheet.cellData?.[row]?.[c] ?? {}
    const span = anchors.get(key)
    parts.push(cellBlock(styleForCell(cell, styles, gridline), { colspan: span?.colSpan, rowspan: span?.rowSpan }, header, rowHeightMm))
  }
  return parts
}
function rowHeightMm(sheet: WorksheetSnapshot, row: number, defaultRowHeight?: number): string | undefined {
  const h = sheet.rowData?.[row]?.h
  if (!h || h <= (defaultRowHeight ?? DEFAULT_ROW_H)) return undefined
  return (h / PX_PER_MM).toFixed(2) + 'mm'
}
function imagesBlock(snapshot: WorksheetSnapshotLike, charts: ChartDef[], range: CellRange, options: SheetTypstOptions): string {
  if (!options.imageResolver) return ''
  const blocks = collectSheetImages(snapshot, charts, range).map((img, index) => {
    const path = options.imageResolver!(img.source, index)
    return path ? '#figure(image("' + escapeQuoted(path) + '", width: ' + (img.width / PX_PER_MM).toFixed(2) + 'mm), caption: [Figure ' + (index + 1) + '])' : ''
  }).filter(Boolean)
  return blocks.length ? '\n' + blocks.join('\n') : ''
}
export function worksheetToTypst(snapshot: WorksheetSnapshotLike, config: PrintConfig, charts: ChartDef[] = [], options: SheetTypstOptions = {}): string {
  const sheet = firstSheet(snapshot)
  const range = resolveRange(snapshot, config)
  if (!sheet || !range) return '[*Nothing to print — the sheet is empty.*]'
  const styles = snapshot.styles
  const gridline = options.showGridlines !== false
  const showRC = options.showRowColHeaders === true
  const defColW = sheet.defaultColumnWidth ?? DEFAULT_COL_W
  const repeat = Math.max(0, Math.min(options.repeatHeaderRows ?? 0, range.endRow - range.startRow + 1))
  const widths: string[] = []
  for (let c = range.startColumn; c <= range.endColumn; c++) widths.push(((sheet.columnData?.[c]?.w ?? defColW) / PX_PER_MM * (options.columnScale ?? 1)).toFixed(2) + 'mm')
  const columns = '(' + (showRC ? '10mm, ' : '') + widths.join(', ') + ')'
  const { anchors, covered } = buildMergeLookup(sheet, range)
  const headerCells: string[] = []
  if (showRC) {
    headerCells.push('table.cell(fill: rgb("#f1f3f5"), stroke: 0.5pt + luma(200), align: center)[#text(weight: "bold")[]]')
    for (let c = range.startColumn; c <= range.endColumn; c++) headerCells.push('table.cell(fill: rgb("#f1f3f5"), stroke: 0.5pt + luma(200), align: center)[#text(weight: "bold")[' + columnLabel(c) + ']]')
  }
  for (let r = range.startRow; r < range.startRow + repeat; r++) headerCells.push(...renderRowCells(sheet, range, r, anchors, covered, styles, gridline, showRC, true))
  const bodyCells: string[] = []
  for (let r = range.startRow + repeat; r <= range.endRow; r++) bodyCells.push(...renderRowCells(sheet, range, r, anchors, covered, styles, gridline, showRC, false, rowHeightMm(sheet, r)))
  const header = headerCells.length ? '  table.header(\n    repeat: true,\n    ' + headerCells.join(',\n    ') + '\n  ),' : ''
  const body = bodyCells.length ? '\n  ' + bodyCells.join(',\n  ') + '\n' : '\n'
  return '#table(\n  columns: ' + columns + ',\n  inset: 2pt,\n' + header + body + imagesBlock(snapshot, charts, range, options) + '\n)'
}
export function buildSheetTypstDocument(snapshot: WorksheetSnapshotLike, config: PrintConfig, ctx: SheetTypstContext, charts: ChartDef[] = [], options: SheetTypstOptions = {}): string {
  const pageSize = config.pageSize ?? 'A4'
  const landscape = config.orientation === 'landscape'
  const margins = config.margins ?? { top: 20, right: 15, bottom: 20, left: 25 }
  const paper = PAPER_MM[pageSize]
  const printableW = (landscape ? paper.h : paper.w) - margins.left - margins.right
  const sheet = firstSheet(snapshot), range = resolveRange(snapshot, config)
  let contentMm = 0
  if (sheet && range) for (let c = range.startColumn; c <= range.endColumn; c++) contentMm += (sheet.columnData?.[c]?.w ?? sheet.defaultColumnWidth ?? DEFAULT_COL_W) / PX_PER_MM
  const scale = contentMm > 0 && printableW > 0 ? Math.min(1, printableW / contentMm) : 1
  const table = worksheetToTypst(snapshot, config, charts, { ...options, columnScale: scale })
  return '#set page(\n  paper: "' + pageSize.toLowerCase() + '",\n  flipped: ' + landscape + ',\n  margin: (x: ' + margins.left + 'mm, right: ' + margins.right + 'mm, top: ' + margins.top + 'mm, bottom: ' + margins.bottom + 'mm),\n  header: [' + escapeTypst(ctx.projectName + ' — ' + ctx.title) + '],\n  numbering: "1 / 1",\n  number-align: center\n)\n#set text(font: ("Calibri", "Arial", "Liberation Sans", "Helvetica"), size: 9pt)\n' + table + '\n'
}
