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
import { qualifyFormula, type FormulaCellVerdict } from './formulaGate'

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
  align?: 'left' | 'center' | 'right'
  wrap?: boolean
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
  rowData?: Record<string, { h?: number; hd?: number }>
  columnData?: Record<string, { w?: number; hd?: number }>
  defaultColW?: number
  defaultRowH?: number
}

export interface UnivCell {
  v?: string | number | boolean | null
  s?: UnivStyle | string | null
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
  cl?: { rgb?: string }
  bg?: { rgb?: string }
}

export interface UnivStyle extends UnivTextStyle {
  vt?: unknown
  ht?: unknown
  tb?: number
  n?: { pattern?: string } | null
  bd?: {
    t?: { s?: number; cl?: { rgb?: string } }
    l?: { s?: number; cl?: { rgb?: string } }
    b?: { s?: number; cl?: { rgb?: string } }
    r?: { s?: number; cl?: { rgb?: string } }
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

function mapTextStyle(ts: UnivTextStyle | undefined): GridCellStyle {
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
  const color = normRgb(ts.cl?.rgb)
  if (color) style.colorRgb = color
  const bg = normRgb(ts.bg?.rgb)
  if (bg) style.bgRgb = bg
  return style
}

/** Border style codes follow the old ExcelJS adapters (2 medium, 3 dashed, 6 double). */
function mapBorderSide(side?: { s?: number; cl?: { rgb?: string } }): GridBorderSide | undefined {
  if (!side) return undefined
  const out: GridBorderSide = {}
  if (typeof side.s === 'number') {
    out.style = side.s === 2 ? 'medium' : side.s === 3 ? 'dashed' : side.s === 6 ? 'double' : 'thin'
  }
  const color = normRgb(side.cl?.rgb)
  if (color) out.colorRgb = color
  return out.style || out.colorRgb ? out : undefined
}

export function mapUniverStyle(style: UnivStyle | null | undefined): { cell: GridCellStyle; numFmt?: string; border?: GridCell['border'] } {
  if (!style) return { cell: {} }
  const cell = mapTextStyle(style)
  if (style.ht === 'l' || style.ht === 1) cell.align = 'left'
  else if (style.ht === 'c' || style.ht === 2) cell.align = 'center'
  else if (style.ht === 'r' || style.ht === 3) cell.align = 'right'
  if (style.tb === 2) cell.wrap = true
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
    if (end > start) runs.push({ text: stream.slice(start, end), style: mapTextStyle(run.ts) })
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
      const rawStyle = typeof cell.s === 'string' ? sheet.styles?.[cell.s] : cell.s
      const mapped = mapUniverStyle(rawStyle ?? null)
      const out: GridCell = { r: r - range.startRow, c: c - range.startColumn }
      const stream = cell.p?.body?.dataStream
      if (typeof stream === 'string' && stream.length) {
        const runs = runsFromStream(stream, cell.p?.body?.textRuns ?? [])
        if (runs.length) out.runs = runs
        else out.value = stream
      } else if (cell.v !== null && cell.v !== undefined && typeof cell.v !== 'object') {
        out.value = cell.v
      }
      const rawFormula = typeof cell.f === 'string' ? cell.f.trim() : ''
      if (rawFormula) {
        const verdict = qualifyFormula(rawFormula, {
          startRow: range.startRow,
          startColumn: range.startColumn,
          endRow: range.endRow,
          endColumn: range.endColumn,
          sheetName: opts?.sheetName
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

  // Hidden rows/columns zero out like the Typst sheet (worksheetTypst gives
  // them zero width/height). Rust writes 0 as hidden instead of clamping.
  const defW = sheet.defaultColW ?? 88
  const colWidthsChars: number[] = []
  for (let c = range.startColumn; c <= range.endColumn; c++) {
    if (sheet.columnData?.[String(c)]?.hd === 1) {
      colWidthsChars.push(0)
      continue
    }
    const px = sheet.columnData?.[String(c)]?.w ?? defW
    colWidthsChars.push(Math.max(8.5, Math.round((px / 7) * 100) / 100))
  }
  const defH = sheet.defaultRowH ?? 24
  const rowHeightsPt: Array<number | null> = []
  for (let r = range.startRow; r <= range.endRow; r++) {
    if (sheet.rowData?.[String(r)]?.hd === 1) {
      rowHeightsPt.push(0)
      continue
    }
    const px = sheet.rowData?.[String(r)]?.h
    rowHeightsPt.push(typeof px === 'number' && px > 0 ? Math.round(px * 0.75 * 100) / 100 : null)
  }

  return { cells, merges, colWidthsChars, rowHeightsPt, images: [], rowBreaks: [] }
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
