/**
 * Detail-sheet grid model + flatteners (native rust_xlsxwriter path — no ExcelJS).
 *
 * The model walk is ported from our own converters: the sheet walk mirrors
 * `worksheetTypst.ts` (CellData v/s/p/f, style map, mergeData, row/column
 * dims, drawing resources) and the document walk mirrors `documentTypst.ts`
 * (`TypstDocData`: paragraphs, runs, tables with spans, floating images).
 * Community Univer→ExcelJS converters (mertdeveci5/univerimportexport,
 * casualoffice/sheets) were used only as a cross-check: they target ExcelJS
 * and cover sheets, never Documents — nothing was copied.
 *
 * Approximations (declared, not hidden):
 * - Univer formulas pass the formula teacher (`formulaGate.ts`): proven
 *   Excel-safe formulas are written live (references rebased to the exported
 *   grid); everything else is carried as the computed value.
 * - Hidden rows/columns export zero-sized (hidden), matching the Typst
 *   sheet; the teacher still sees their cells, so references into hidden
 *   rows keep working.
 * - Document sheets use one column profile taken from the widest table;
 *   paragraphs merge across it.
 * - Images anchor at the nearest cell; floating point positions are approximate.
 */
import type { TypstDocData } from '../typist-output/documentTypst'
import { qualifyFormula, rewriteItemCellRefs, type FormulaCellVerdict } from './formulaGate'
import {
  composeUniverCellStyle,
  pxToChars,
  pxToPt,
  resolveColWidthPx,
  resolveIColorRgb,
  resolveRowHeightPx,
  type UnivIColorStyle
} from './univerResolve'

export type { FormulaCellVerdict } from './formulaGate'

export interface GridCellStyle {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  sizePt?: number
  fontName?: string
  colorRgb?: string
  bgRgb?: string
  align?: 'left' | 'center' | 'right' | 'justify'
  valign?: 'top' | 'middle' | 'bottom'
  wrap?: boolean
  /**
   * Excel rotation degrees (-90..90). Univer renders tr (angle a, vertical
   * flag v) by rotating laid-out lines on canvas (see convertTextRotation in
   * engine-render): tr.v === 1 is a continuous 90-degree clockwise rotation
   * reading top-to-bottom, i.e. Excel -90 — never stacked 255/270 text.
   */
  rotation?: number
  /** Writer-level stacked text (Excel 255); nothing in the Univer mapping sets this. */
  verticalText?: boolean
  /** Univer td: 1 = left-to-right, 2 = right-to-left. Omitted when unspecified. */
  readingOrder?: 1 | 2
}

export interface GridRichRun {
  text: string
  style: GridCellStyle
}

export interface GridBorderSide {
  style?: string
  colorRgb?: string
}

export interface GridCell {
  r: number
  c: number
  value?: string | number | boolean | null
  formula?: string
  numFmt?: string
  style?: GridCellStyle
  runs?: GridRichRun[]
  border?: { top?: GridBorderSide; left?: GridBorderSide; bottom?: GridBorderSide; right?: GridBorderSide }
}

export interface GridMerge {
  r1: number
  c1: number
  r2: number
  c2: number
}

export interface GridImage {
  r: number
  c: number
  dataBase64: string
  mime: string
  scaleW: number
  scaleH: number
}

export interface DetailGrid {
  cells: GridCell[]
  merges: GridMerge[]
  colWidthsChars: number[]
  /**
   * Resolved source pixel widths (0 = hidden), present when the grid comes
   * 1:1 from a snapshot via flattenSheet. The Rust writer prefers these via
   * set_column_width_pixels (exact, no char conversion); stacked grids built
   * from mixed sources omit them and the writer falls back to chars.
   */
  colWidthsPx?: number[]
  rowHeightsPt: Array<number | null>
  images: GridImage[]
  /** 0-based grid rows after which Excel inserts a horizontal page break. */
  rowBreaks: number[]
  /** Optional resolved print geometry. Omission retains the native house defaults. */
  pageSetup?: {
    paperSize?: 'A2' | 'A3' | 'A4' | 'Letter' | 'Legal'
    marginsMm?: { top: number; right: number; bottom: number; left: number }
  }
}

/** Structural Univer sheet input (no @univerjs import needed). */
export interface SheetSnapshotInput {
  cellData?: Record<string, Record<string, UnivCell>>
  mergeData?: Array<{ startRow: number; startColumn: number; endRow: number; endColumn: number }>
  styles?: Record<string, UnivStyle>
  rowData?: Record<string, { h?: number; ia?: number; ah?: number; hd?: number; s?: UnivStyle | string | null }>
  columnData?: Record<string, { w?: number; hd?: number; s?: UnivStyle | string | null }>
  defaultColW?: number
  defaultRowH?: number
  /** Worksheet/workbook default style (id or inline); lowest precedence. */
  defaultStyle?: UnivStyle | string | null
  /**
   * Mirrors `_isRowStylePrecedeColumnStyle`; omit for the active renderer
   * default `false` (column precedes row — the render skeleton forces the
   * config to `false` and the app never overrides it).
   */
  rowPrecedesColumn?: boolean
}

export interface UnivCell {
  v?: string | number | boolean | null
  /** Cell value type: 1 string / 2 number / 3 boolean / 4 forced string. */
  t?: number | null
  s?: UnivStyle | string | null
  /** Cell theme style, composed between row/column and cell styles. */
  themeStyle?: UnivStyle | null
  p?: { body?: { dataStream?: string; textRuns?: Array<{ st: number; ed: number; ts?: UnivTextStyle }> } } | null
  f?: string | null
}

export interface UnivTextStyle {
  bl?: unknown
  it?: unknown
  ul?: { s?: unknown } | unknown
  st?: { s?: unknown } | unknown
  fs?: number
  ff?: string
  cl?: UnivIColorStyle
  bg?: UnivIColorStyle
}

export interface UnivStyle extends UnivTextStyle {
  vt?: unknown
  ht?: unknown
  tb?: number
  /** Text rotation { a: angle degrees, v: 1 = 90-degree canvas rotation (Excel -90) }. */
  tr?: { a?: number; v?: number } | null
  /** Text direction: 1 = left-to-right, 2 = right-to-left. */
  td?: number | null
  n?: { pattern?: string } | null
  bd?: {
    t?: { s?: number; cl?: UnivIColorStyle }
    l?: { s?: number; cl?: UnivIColorStyle }
    b?: { s?: number; cl?: UnivIColorStyle }
    r?: { s?: number; cl?: UnivIColorStyle }
  } | null
}

export interface CellRangeLike {
  startRow: number
  startColumn: number
  endRow: number
  endColumn: number
}

/**
 * Normalize a stored print range (object or [startRow, startColumn, endRow,
 * endColumn] tuple) to grid coordinates. Null/invalid yields null so the
 * caller falls back to the used range — never a corrupt clip.
 */
export function toRangeLike(raw: unknown): CellRangeLike | null {
  const num = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : null
  let sr: number | null = null
  let sc: number | null = null
  let er: number | null = null
  let ec: number | null = null
  if (Array.isArray(raw) && raw.length >= 4) {
    ;[sr, sc, er, ec] = [num(raw[0]), num(raw[1]), num(raw[2]), num(raw[3])]
  } else if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>
    sr = num(o.startRow)
    sc = num(o.startColumn)
    er = num(o.endRow)
    ec = num(o.endColumn)
  }
  if (sr == null || sc == null || er == null || ec == null) return null
  return {
    startRow: Math.min(sr, er),
    startColumn: Math.min(sc, ec),
    endRow: Math.max(sr, er),
    endColumn: Math.max(sc, ec)
  }
}

/** Image input in print-range-relative px (ItemMediaItem relLeftPx/relTopPx). */
export interface GridImageInput {
  relLeftPx: number
  relTopPx: number
  widthPx: number
  heightPx: number
  origWPx: number
  origHPx: number
  dataBase64: string
  mime: string
}

export function columnLabel(index: number): string {
  let n = index
  let label = ''
  do {
    label = String.fromCharCode(65 + (n % 26)) + label
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return label
}

/** Excel sheet names: at most 31 chars, none of []:*?/\\ — caller dedupes. */
export function sanitizeSheetName(raw: string): string {
  const clean = raw.replace(/[[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim() || 'Sheet'
  return clean.slice(0, 31)
}

function isOn(value: unknown): boolean {
  return value === 1 || value === true
}

/** rrggbb for rust_xlsxwriter Color::RGB; drops alpha, rejects garbage. */
export function normRgb(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined
  const value = raw.trim().replace(/^#/, '')
  if (/^[0-9a-fA-F]{6}$/.test(value)) return value.toUpperCase()
  if (/^[0-9a-fA-F]{8}$/.test(value)) return value.slice(2).toUpperCase()
  const rgb = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/.exec(raw.trim())
  if (rgb) {
    const hex = (n: string): string => Math.max(0, Math.min(255, Number(n))).toString(16).padStart(2, '0')
    return `${hex(rgb[1])}${hex(rgb[2])}${hex(rgb[3])}`.toUpperCase()
  }
  return undefined
}

/**
 * Installed font-colour resolution differs by paint path: document cells
 * (rich `p` or nonzero rotation) resolve `{th}` through getColorStyle, while
 * plain-text font and sheet cell fills read `.rgb` only (engine-render
 * _renderText/Text.drawWith and _setBgStylesCache). `themeFont` selects the
 * document path for the FONT channel; fills never resolve `th` (canvas
 * parity: a theme-only fill paints nothing).
 */
function mapTextStyle(ts: UnivTextStyle | undefined, opts?: { themeFont?: boolean }): GridCellStyle {
  if (!ts) return {}
  const style: GridCellStyle = {}
  if (ts.bl !== undefined) style.bold = isOn(ts.bl)
  if (ts.it !== undefined) style.italic = isOn(ts.it)
  const ul = ts.ul as { s?: unknown } | undefined
  if (ts.ul !== undefined) style.underline = isOn(ul?.s) || isOn(ts.ul)
  const st = ts.st as { s?: unknown } | undefined
  if (ts.st !== undefined) style.strike = isOn(st?.s) || isOn(ts.st)
  if (typeof ts.fs === 'number' && ts.fs > 0) style.sizePt = ts.fs
  if (typeof ts.ff === 'string' && ts.ff) style.fontName = ts.ff
  const color = resolveIColorRgb(ts.cl, normRgb, { theme: opts?.themeFont })
  if (color) style.colorRgb = color
  const bg = resolveIColorRgb(ts.bg, normRgb)
  if (bg) style.bgRgb = bg
  return style
}

/**
 * Border codes follow the installed Univer BorderStyleTypes (0 NONE, 1 THIN,
 * 2 HAIR, 3 DOTTED, 4 DASHED, 5 DASH_DOT, 6 DASH_DOT_DOT, 7 DOUBLE, 8 MEDIUM,
 * 9 MEDIUM_DASHED, 10 MEDIUM_DASH_DOT, 11 MEDIUM_DASH_DOT_DOT,
 * 12 SLANT_DASH_DOT, 13 THICK). Tokens pass through to the Rust writer, which
 * maps each to the matching Excel border; unknown codes fall back to thin.
 */
const BORDER_TOKENS: Record<number, string> = {
  1: 'thin', 2: 'hair', 3: 'dotted', 4: 'dashed', 5: 'dashDot', 6: 'dashDotDot',
  7: 'double', 8: 'medium', 9: 'mediumDashed', 10: 'mediumDashDot',
  11: 'mediumDashDotDot', 12: 'slantDashDot', 13: 'thick'
}
function mapBorderSide(side?: { s?: number; cl?: UnivIColorStyle }): GridBorderSide | undefined {
  if (!side) return undefined
  if (side.s === 0) return undefined
  const out: GridBorderSide = {}
  if (typeof side.s === 'number') {
    out.style = BORDER_TOKENS[side.s] ?? 'thin'
  }
  // Installed sheet borders resolve {th} (_setBorderProps getColorStyle).
  const color = resolveIColorRgb(side.cl, normRgb, { theme: true })
  if (color) out.colorRgb = color
  return out.style || out.colorRgb ? out : undefined
}

/**
 * Excel rotation is whole degrees spanning -90..90: fold any angle into that
 * window and round, so the payload always fits the Rust `i16` rotation field.
 */
function normRotation(deg: number): number {
  return Math.round(((deg + 90) % 180 + 180) % 180 - 90)
}

export function mapUniverStyle(
  style: UnivStyle | null | undefined,
  valueType?: number | null,
  opts?: { hasRichText?: boolean }
): { cell: GridCellStyle; numFmt?: string; border?: GridCell['border'] } {
  if (!style) return { cell: {} }
  // Document paint path (rich `p` or nonzero rotation) resolves font `{th}`;
  // plain font reads `.rgb` only (engine-render _setFontStylesCache picks
  // the document skeleton exactly when `p || vertexAngle || centerAngle`).
  const tr0 = style.tr
  const rotated0 =
    !!tr0 && typeof tr0 === 'object' &&
    (tr0.v === 1 || (typeof tr0.a === 'number' && Number.isFinite(tr0.a) && tr0.a % 360 !== 0))
  const cell = mapTextStyle(style, { themeFont: opts?.hasRichText === true || rotated0 })
  if (style.ht === 'l' || style.ht === 1) cell.align = 'left'
  else if (style.ht === 'c' || style.ht === 2) cell.align = 'center'
  else if (style.ht === 'r' || style.ht === 3) cell.align = 'right'
  // Univer JUSTIFIED (4), BOTH (5) and DISTRIBUTED (6) have no Excel
  // BOTH/DISTRIBUTED equivalent, so all three fall back to justified.
  else if (style.ht === 4 || style.ht === 5 || style.ht === 6) cell.align = 'justify'
  if (cell.align === undefined) {
    // Installed General rule (_horizontalHandler) for ROTATED text: vertical
    // mode centers; rotated-down (a > 0 except 90, or a == -90) rights; other
    // nonzero angles fall back to the value type (2 number -> right,
    // 3 boolean -> center, else left). Plain unrotated cells stay unset —
    // Excel's native General already rights numbers, centers booleans and
    // lefts text (pinned by flattenSheet tests), and live formula results
    // deserve live General, so callers pass no value type for formulas.
    const tr = style.tr
    if (tr && typeof tr === 'object') {
      if (tr.v === 1) cell.align = 'center'
      else if (typeof tr.a === 'number' && Number.isFinite(tr.a) && tr.a !== 0) {
        if ((tr.a > 0 && tr.a !== 90) || tr.a === -90) cell.align = 'right'
        else if (valueType === 2) cell.align = 'right'
        else if (valueType === 3) cell.align = 'center'
        else cell.align = 'left'
      }
    }
  }
  if (style.vt === 1) cell.valign = 'top'
  else if (style.vt === 2) cell.valign = 'middle'
  else if (style.vt === 3) cell.valign = 'bottom'
  // WrapStrategy: only WRAP (3) wraps. CLIP (2) and OVERFLOW (1) never wrap
  // (Excel clips by default when wrap is off); UNSPECIFIED (0) stays default.
  if (style.tb === 3) cell.wrap = true
  const tr = style.tr
  if (tr && typeof tr === 'object') {
    // Univer canvas-rotates the whole laid-out line (convertTextRotation):
    // v === 1 forces a 90-degree clockwise rotation reading top-to-bottom,
    // which is Excel -90 (continuous rotated string), not stacked 255 text.
    if (tr.v === 1) cell.rotation = -90
    else if (typeof tr.a === 'number' && Number.isFinite(tr.a) && tr.a % 360 !== 0) {
      cell.rotation = normRotation(tr.a)
    }
  }
  if (style.td === 1) cell.readingOrder = 1
  else if (style.td === 2) cell.readingOrder = 2
  const numFmt = typeof style.n?.pattern === 'string' && style.n.pattern ? style.n.pattern : undefined
  const border = style.bd
    ? {
        top: mapBorderSide(style.bd.t),
        left: mapBorderSide(style.bd.l),
        bottom: mapBorderSide(style.bd.b),
        right: mapBorderSide(style.bd.r)
      }
    : undefined
  const out: { cell: GridCellStyle; numFmt?: string; border?: GridCell['border'] } = { cell }
  if (numFmt) out.numFmt = numFmt
  if (border && (border.top || border.left || border.bottom || border.right)) out.border = border
  return out
}

function runsFromStream(
  stream: string,
  textRuns: Array<{ st: number; ed: number; ts?: UnivTextStyle }>
): GridRichRun[] {
  const sorted = [...textRuns].sort((a, b) => a.st - b.st)
  const runs: GridRichRun[] = []
  let cursor = 0
  for (const run of sorted) {
    const start = Math.max(0, Math.min(run.st, stream.length))
    const end = Math.max(start, Math.min(run.ed, stream.length))
    if (start > cursor) runs.push({ text: stream.slice(cursor, start), style: {} })
    if (end > start) runs.push({ text: stream.slice(start, end), style: mapTextStyle(run.ts, { themeFont: true }) })
    cursor = Math.max(cursor, end)
  }
  if (cursor < stream.length) runs.push({ text: stream.slice(cursor), style: {} })
  return runs.filter((run) => run.text.length > 0)
}

export interface FlattenSheetOptions {
  /** Sheet name for same-sheet qualifier checks; omitted = any qualifier fails. */
  sheetName?: string
  /** Receives one verdict per formula cell, in scan order. */
  verdicts?: FormulaCellVerdict[]
  /**
   * Cross-sheet tabs exported alongside this grid (upper-cased item code to
   * tab name). `ITEMCELL("CODE","C18")` rewrites to a native `'Tab'!C18`
   * reference; codes missing here keep the old cached-value fallback.
   */
  itemCellTabs?: Map<string, string>
}

/**
 * Flatten one Univer sheet (clipped to range, rebased to 0,0) to a grid.
 * Merged non-origin cells are skipped. Formula cells go through the teacher:
 * safe formulas are kept live (plus the cached value), the rest downgrade to
 * the computed value. A cell carrying both rich runs and a passing formula
 * keeps the formula — Rust writes the formula and drops the runs.
 */
export function flattenSheet(sheet: SheetSnapshotInput, range: CellRangeLike, opts?: FlattenSheetOptions): DetailGrid {
  const cells: GridCell[] = []
  const merges: GridMerge[] = []

  const mergedAt = (r: number, c: number): boolean =>
    (sheet.mergeData ?? []).some(
      (m) =>
        r >= m.startRow && r <= m.endRow && c >= m.startColumn && c <= m.endColumn &&
        (r !== m.startRow || c !== m.startColumn)
    )

  for (let r = range.startRow; r <= range.endRow; r++) {
    for (let c = range.startColumn; c <= range.endColumn; c++) {
      if (mergedAt(r, c)) continue
      const cell = sheet.cellData?.[String(r)]?.[String(c)]
      if (!cell) continue
      // Effective style, composed property by property (workbook default,
      // column, row, cell theme, cell) per Univer's composeStyles — a partial
      // cell {bl: 1} keeps inherited font, alignment and fill.
      const composed = composeUniverCellStyle({
        cell,
        rowDatum: sheet.rowData?.[String(r)],
        colDatum: sheet.columnData?.[String(c)],
        defaultStyle: sheet.defaultStyle,
        styles: sheet.styles as Record<string, unknown> | undefined,
        rowPrecedesColumn: sheet.rowPrecedesColumn
      })
      const rawFormula = typeof cell.f === 'string' ? cell.f.trim() : ''
      // General-alignment inference needs the value type, but live formula
      // results deserve live Excel General — never infer from a cached type.
      const mapped = mapUniverStyle(composed as unknown as UnivStyle, rawFormula ? undefined : cell.t ?? undefined, { hasRichText: cell.p != null })
      const out: GridCell = { r: r - range.startRow, c: c - range.startColumn }
      const stream = cell.p?.body?.dataStream
      if (typeof stream === 'string' && stream.length) {
        const runs = runsFromStream(stream, cell.p?.body?.textRuns ?? [])
        if (runs.length) out.runs = runs
        else out.value = stream
      } else if (cell.v !== null && cell.v !== undefined && typeof cell.v !== 'object') {
        // Booleans stored as 1/0 (t: 3, the runtime's save shape) become real
        // booleans — Excel shows TRUE/FALSE and centers them under General.
        // Forced text (t: 4) stays a string even when the stored value is
        // numeric — a numeric-looking string must not become a numeric cell.
        if (cell.t === 3) out.value = cell.v === true || cell.v === 1
        else out.value = cell.t === 4 && typeof cell.v === 'number' ? String(cell.v) : cell.v
      }
      if (rawFormula) {
        const rewritten = opts?.itemCellTabs
          ? rewriteItemCellRefs(rawFormula, opts.itemCellTabs)
          : null
        const verdict = qualifyFormula(rewritten?.ok ? rewritten.text : rawFormula, {
          startRow: range.startRow,
          startColumn: range.startColumn,
          endRow: range.endRow,
          endColumn: range.endColumn,
          sheetName: opts?.sheetName,
          extraSheets: opts?.itemCellTabs ? Array.from(new Set(opts.itemCellTabs.values())) : undefined
        })
        if (verdict.ok) out.formula = verdict.excel
        opts?.verdicts?.push({
          addr: `${columnLabel(c)}${r + 1}`,
          ok: verdict.ok,
          reason: verdict.ok ? undefined : verdict.reason
        })
      }
      if (mapped.numFmt) out.numFmt = mapped.numFmt
      if (Object.keys(mapped.cell).length) out.style = mapped.cell
      if (mapped.border) out.border = mapped.border
      if (out.value !== undefined || out.formula !== undefined || out.runs || out.style || out.border || out.numFmt) {
        cells.push(out)
      }
    }
  }

  for (const m of sheet.mergeData ?? []) {
    const r1 = Math.max(m.startRow, range.startRow) - range.startRow
    const c1 = Math.max(m.startColumn, range.startColumn) - range.startColumn
    const r2 = Math.min(m.endRow, range.endRow) - range.startRow
    const c2 = Math.min(m.endColumn, range.endColumn) - range.startColumn
    if (r2 >= r1 && c2 >= c1 && (r2 > r1 || c2 > c1)) merges.push({ r1, c1, r2, c2 })
  }

  // Geometry mirrors the row manager: hidden rows/columns zero out (the Rust
  // writer keeps 0 as hidden); otherwise resolved widths/heights flow through
  // with no minimum floor — narrow source geometry is legitimate. Absent row
  // data keeps the Excel default (null).
  const defW = sheet.defaultColW && sheet.defaultColW > 0 ? sheet.defaultColW : 88
  const colWidthsChars: number[] = []
  const colWidthsPx: number[] = []
  for (let c = range.startColumn; c <= range.endColumn; c++) {
    const datum = sheet.columnData?.[String(c)]
    if (datum?.hd === 1) {
      colWidthsChars.push(0)
      colWidthsPx.push(0)
      continue
    }
    const px = resolveColWidthPx(datum, defW)
    colWidthsChars.push(pxToChars(px))
    colWidthsPx.push(Math.round(px * 100) / 100)
  }
  const defH = sheet.defaultRowH && sheet.defaultRowH > 0 ? sheet.defaultRowH : 24
  // The resolved height is always supplied — including the sheet default for
  // rows without data — mirroring the row manager (null never survives).
  const rowHeightsPt: Array<number | null> = []
  for (let r = range.startRow; r <= range.endRow; r++) {
    const datum = sheet.rowData?.[String(r)]
    if (datum?.hd === 1) {
      rowHeightsPt.push(0)
      continue
    }
    rowHeightsPt.push(pxToPt(resolveRowHeightPx(datum, defH)))
  }

  return { cells, merges, colWidthsChars, colWidthsPx, rowHeightsPt, images: [], rowBreaks: [] }
}

/**
 * Anchor a print-range-relative px position to the nearest grid cell by
 * walking cumulative column widths / row heights. Approximate by design.
 */
export function anchorCellAt(
  colWidthsPx: number[],
  rowHeightsPx: number[],
  leftPx: number,
  topPx: number
): { r: number; c: number } {
  // Exact 0 = hidden (zero geometry, like the grid); other non-positive
  // values fall back to the defaults.
  let c = 0
  let acc = 0
  for (let i = 0; i < colWidthsPx.length; i++) {
    const raw = colWidthsPx[i]
    const w = raw === 0 ? 0 : raw > 0 ? raw : 88
    if (leftPx < acc + w) {
      c = i
      break
    }
    acc += w
    c = i
  }
  let r = 0
  acc = 0
  for (let i = 0; i < rowHeightsPx.length; i++) {
    const raw = rowHeightsPx[i]
    const h = raw === 0 ? 0 : raw > 0 ? raw : 24
    if (topPx < acc + h) {
      r = i
      break
    }
    acc += h
    r = i
  }
  return { r, c }
}

/** Split a data URL (or bare base64 with a fallback mime) into parts. */
export function splitDataUrl(source: string, fallbackMime = 'image/png'): { mime: string; dataBase64: string } | null {
  const text = source.trim()
  if (!text) return null
  const match = /^data:([^;,]+)?(?:;base64)?,(.*)$/s.exec(text)
  if (match) return { mime: match[1] || fallbackMime, dataBase64: match[2] }
  if (/^[A-Za-z0-9+/=\s]+$/.test(text)) return { mime: fallbackMime, dataBase64: text.replace(/\s+/g, '') }
  return null
}

/** Decode pixel dimensions via the DOM (call-time only; never at import). */
export function measureImageDimensions(dataUrl: string): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    try {
      const img = new Image()
      img.onload = (): void => {
        resolve(img.naturalWidth > 0 && img.naturalHeight > 0 ? { w: img.naturalWidth, h: img.naturalHeight } : null)
      }
      img.onerror = (): void => resolve(null)
      img.src = dataUrl
    } catch {
      resolve(null)
    }
  })
}

export function anchorImage(
  colWidthsPx: number[],
  rowHeightsPx: number[],
  input: GridImageInput
): GridImage {
  const at = anchorCellAt(colWidthsPx, rowHeightsPx, Math.max(0, input.relLeftPx), Math.max(0, input.relTopPx))
  return {
    r: at.r,
    c: at.c,
    dataBase64: input.dataBase64,
    mime: input.mime,
    scaleW: input.origWPx > 0 ? input.widthPx / input.origWPx : 1,
    scaleH: input.origHPx > 0 ? input.heightPx / input.origHPx : 1
  }
}

/**
 * Flatten a parsed Univer document to a grid. Paragraphs become single rows
 * (merged across the table profile, rich runs kept); tables become cell grids
 * with spans as merges. One column profile per sheet, taken from the widest
 * table — narrower tables use the leading columns. Pagination is always
 * automatic: pageBreakBefore marks stay Typst-only, rowBreaks is empty.
 */
export function flattenDocument(doc: TypstDocData): DetailGrid {
  const cells: GridCell[] = []
  const merges: GridMerge[] = []

  let maxCols = 1
  for (const para of doc.paragraphs) {
    if (para.table) {
      let cols = 0
      for (const row of para.table.rows) {
        let span = 0
        for (const cell of row.cells) span += Math.max(1, cell.colSpan)
        cols = Math.max(cols, span)
      }
      maxCols = Math.max(maxCols, cols)
    }
  }
  const colWidthsChars = Array<number>(maxCols).fill(28)

  // Excel pagination stays fully automatic: document pageBreakBefore marks
  // are Typst-only (see univerDoc.typ) and never become Excel breaks.
  const rowBreaks: number[] = []
  let r = 0
  for (const para of doc.paragraphs) {
    if (para.table) {
      for (const row of para.table.rows) {
        let c = 0
        for (const cell of row.cells) {
          const span = Math.max(1, cell.colSpan)
          const rowSpan = Math.max(1, cell.rowSpan)
          const out: GridCell = { r, c, value: cell.text || undefined }
          if (para.align === 'center' || para.align === 'right') out.style = { align: para.align, wrap: true }
          else out.style = { wrap: true }
          if (cell.backgroundHex) {
            const bg = normRgb(cell.backgroundHex)
            if (bg) out.style = { ...out.style, bgRgb: bg }
          }
          if (out.value !== undefined) cells.push(out)
          if (span > 1 || rowSpan > 1) {
            merges.push({
              r1: r,
              c1: Math.min(c, maxCols - 1),
              r2: r + rowSpan - 1,
              c2: Math.min(c + span - 1, maxCols - 1)
            })
          }
          c += span
        }
        r += 1
      }
      continue
    }
    if (para.isBlank) {
      r += 1
      continue
    }
    const text = `${para.listMarker ?? ''}${para.runs.map((run) => run.text).join('')}`
    if (!text) {
      r += 1
      continue
    }
    const out: GridCell = { r, c: 0, runs: para.runs.map((run) => ({ text: run.text, style: docRunStyle(run) })) }
    if (para.align === 'center' || para.align === 'right') out.style = { align: para.align, wrap: true }
    else out.style = { wrap: true }
    if (para.backgroundHex) {
      const bg = normRgb(para.backgroundHex)
      if (bg) out.style = { ...out.style, bgRgb: bg }
    }
    cells.push(out)
    if (maxCols > 1) merges.push({ r1: r, c1: 0, r2: r, c2: maxCols - 1 })
    r += 1
  }

  return { cells, merges, colWidthsChars, rowHeightsPt: [], images: [], rowBreaks }
}

/**
 * Resolve a selected Univer document range to the exact Excel cell produced
 * by `flattenDocument`. Paragraphs become column-A cells; table selections
 * retain their table row/column position.
 */
export function locateDocumentSourceCell(
  doc: TypstDocData,
  startIndex: number,
  endIndex: number
): { ref: { r: number; c: number }; text: string } | null {
  let r = 0
  for (const para of doc.paragraphs) {
    if (para.table) {
      for (const row of para.table.rows) {
        let c = 0
        for (const cell of row.cells) {
          const from = cell.sourceStartIndex
          const to = cell.sourceEndIndex
          if (from != null && to != null && startIndex >= from && endIndex <= to) {
            return { ref: { r, c }, text: cell.text }
          }
          c += Math.max(1, cell.colSpan)
        }
        r += 1
      }
      continue
    }
    const from = para.sourceStartIndex
    const to = para.sourceEndIndex
    if (from != null && to != null && startIndex >= from && endIndex <= to) {
      return {
        ref: { r, c: 0 },
        text: `${para.listMarker ?? ''}${para.runs.map((run) => run.text).join('')}`
      }
    }
    r += 1
  }
  return null
}

function docRunStyle(run: {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  sizePt?: number
  fontFamily?: string
  colorHex?: string
  backgroundHex?: string
}): GridCellStyle {
  const style: GridCellStyle = {}
  if (run.bold) style.bold = true
  if (run.italic) style.italic = true
  if (run.underline) style.underline = true
  if (run.strike) style.strike = true
  if (typeof run.sizePt === 'number' && run.sizePt > 0) style.sizePt = run.sizePt
  if (run.fontFamily) style.fontName = run.fontFamily
  const color = normRgb(run.colorHex)
  if (color) style.colorRgb = color
  const bg = normRgb(run.backgroundHex)
  if (bg) style.bgRgb = bg
  return style
}
