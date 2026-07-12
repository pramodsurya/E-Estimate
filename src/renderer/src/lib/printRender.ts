// Render a Univer worksheet print area to printable HTML + Electron printToPDF
// options. Univer's open-source build has no print engine, so we reconstruct a
// faithful HTML table from the workbook snapshot (values, styles, merges,
// column widths, row heights) and let Chromium paginate it.

import type { CellRange, ChartDef, Margins, PaperSize, PrintConfig } from '../types/project'

/* ------------------------------------------------------------------ */
/* Minimal structural views of the Univer snapshot (avoids importing    */
/* heavy runtime types; field names verified against @univerjs/core).   */
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
}
interface DocBody {
  dataStream?: string
}
interface CellData {
  v?: string | number | boolean | null
  s?: StyleData | string | null
  p?: { body?: DocBody } | null
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
interface WorkbookSnapshot {
  sheetOrder?: string[]
  sheets?: Record<string, WorksheetSnapshot>
  styles?: Record<string, StyleData>
  /** Plugin resources (drawings/images live here as JSON strings). */
  resources?: { name: string; data: string }[]
}

/** A floating image extracted from the drawing resource. */
interface PrintImage {
  source: string
  /** Absolute pixel position from the A1 grid origin. */
  left: number
  top: number
  width: number
  height: number
}

/* ------------------------------------------------------------------ */
/* Public shapes                                                        */
/* ------------------------------------------------------------------ */

/** Electron `webContents.printToPDF` options (serializable over IPC). */
export interface PdfOptions {
  pageSize: PaperSize
  landscape: boolean
  /** Inches. */
  margins: { top: number; bottom: number; left: number; right: number }
  printBackground: true
  scale: number
  displayHeaderFooter: boolean
  headerTemplate: string
  footerTemplate: string
  preferCSSPageSize: false
}

export interface PrintRenderContext {
  projectName: string
  title: string
}

export interface PrintRenderResult {
  html: string
  pdfOptions: PdfOptions
  /** The range actually rendered (used range when config.range is empty). */
  range: CellRange
  /** True when the print area is empty (nothing to render). */
  empty: boolean
}

/* ------------------------------------------------------------------ */
/* Constants                                                            */
/* ------------------------------------------------------------------ */

const DEFAULT_COL_W = 88
const DEFAULT_ROW_H = 24
const PX_PER_MM = 96 / 25.4 // CSS px at 96 dpi

/** Paper sizes in mm (portrait). */
const PAPER_MM: Record<PaperSize, { w: number; h: number }> = {
  A4: { w: 210, h: 297 },
  A3: { w: 297, h: 420 },
  A2: { w: 420, h: 594 },
  Letter: { w: 215.9, h: 279.4 },
  Legal: { w: 215.9, h: 355.6 }
}

const HEADER_CSS =
  'background:#f1f3f5;border:1px solid #c8ccd0;font:11px Arial,sans-serif;color:#555;text-align:center;padding:2px 4px'
const CELL_BASE_CSS = 'padding:1px 4px;overflow:hidden;font:11px Arial,sans-serif;color:#111'
const BASE_STYLE =
  '*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
  'body{margin:0}' +
  'table{border-collapse:collapse;table-layout:fixed}' +
  'td,th{word-break:break-word}'

// Control characters (everything < 0x20 except newline 0x0A, plus DEL).
// eslint-disable-next-line no-control-regex
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function colorOf(c: ColorStyle | null | undefined): string | null {
  if (!c || !c.rgb) return null
  return c.rgb
}

/** Extract plain text from a cell, preferring rich-text body, then value. */
function cellText(cell: CellData): string {
  const stream = cell.p?.body?.dataStream
  if (typeof stream === 'string' && stream.length) {
    return stream.replace(/\r\n?/g, '\n').replace(CONTROL_CHARS, '').replace(/\n+$/g, '')
  }
  if (cell.v === null || cell.v === undefined) return ''
  return String(cell.v)
}

function borderCss(b: BorderStyle | null | undefined): string | null {
  if (!b || !b.s) return null
  const color = colorOf(b.cl) ?? '#000'
  switch (b.s) {
    case 0:
      return null
    case 2: // HAIR
    case 1: // THIN
      return `1px solid ${color}`
    case 3: // DOTTED
      return `1px dotted ${color}`
    case 4: // DASHED
    case 5: // DASH_DOT
    case 6: // DASH_DOT_DOT
      return `1px dashed ${color}`
    case 7: // DOUBLE
      return `3px double ${color}`
    case 8: // MEDIUM and friends
    case 9:
    case 10:
    case 11:
    case 12:
      return `2px solid ${color}`
    case 13: // THICK
      return `3px solid ${color}`
    default:
      return `1px solid ${color}`
  }
}

/** Resolve a cell's style object whether stored inline or by id. */
function resolveStyle(
  cell: CellData,
  styles: Record<string, StyleData> | undefined
): StyleData | null {
  const s = cell.s
  if (!s) return null
  if (typeof s === 'string') return styles?.[s] ?? null
  return s
}

function styleToCss(style: StyleData | null, gridline: boolean): string {
  const parts: string[] = []
  if (style) {
    if (style.ff) parts.push(`font-family:${style.ff.replace(/[;"]/g, '')}`)
    if (style.fs) parts.push(`font-size:${style.fs}pt`)
    if (style.bl) parts.push('font-weight:700')
    if (style.it) parts.push('font-style:italic')
    const deco: string[] = []
    if (style.ul?.s) deco.push('underline')
    if (style.st?.s) deco.push('line-through')
    if (deco.length) parts.push(`text-decoration:${deco.join(' ')}`)
    const fg = colorOf(style.cl)
    if (fg) parts.push(`color:${fg}`)
    const bg = colorOf(style.bg)
    if (bg) parts.push(`background-color:${bg}`)
    if (style.ht === 1) parts.push('text-align:left')
    else if (style.ht === 2) parts.push('text-align:center')
    else if (style.ht === 3) parts.push('text-align:right')
    if (style.vt === 1) parts.push('vertical-align:top')
    else if (style.vt === 2) parts.push('vertical-align:middle')
    else if (style.vt === 3) parts.push('vertical-align:bottom')
    if (style.tb === 3) parts.push('white-space:normal')
    else parts.push('white-space:nowrap')

    // Explicit cell borders override the default gridline per side.
    const bd = style.bd
    let hasExplicit = false
    if (bd) {
      const top = borderCss(bd.t)
      const right = borderCss(bd.r)
      const bottom = borderCss(bd.b)
      const left = borderCss(bd.l)
      if (top) {
        parts.push(`border-top:${top}`)
        hasExplicit = true
      }
      if (right) {
        parts.push(`border-right:${right}`)
        hasExplicit = true
      }
      if (bottom) {
        parts.push(`border-bottom:${bottom}`)
        hasExplicit = true
      }
      if (left) {
        parts.push(`border-left:${left}`)
        hasExplicit = true
      }
    }
    if (gridline && !hasExplicit) parts.push('border:1px solid #d0d0d0')
  } else if (gridline) {
    parts.push('border:1px solid #d0d0d0')
  }
  return parts.join(';')
}

/* ------------------------------------------------------------------ */
/* Used-range detection                                                 */
/* ------------------------------------------------------------------ */

export function computeUsedRange(sheet: WorksheetSnapshot | undefined): CellRange | null {
  const cellData = sheet?.cellData
  if (!cellData) return null
  let maxRow = -1
  let maxCol = -1
  for (const rowKey of Object.keys(cellData)) {
    const row = Number(rowKey)
    const cols = cellData[row]
    if (!cols) continue
    let rowHasContent = false
    for (const colKey of Object.keys(cols)) {
      const cell = cols[Number(colKey)]
      if (cell && cellText(cell) !== '') {
        rowHasContent = true
        if (Number(colKey) > maxCol) maxCol = Number(colKey)
      }
    }
    if (rowHasContent && row > maxRow) maxRow = row
  }
  if (maxRow < 0 || maxCol < 0) return null
  return { startRow: 0, startColumn: 0, endRow: maxRow, endColumn: maxCol }
}

function firstSheet(snapshot: WorkbookSnapshot): WorksheetSnapshot | undefined {
  const id = snapshot.sheetOrder?.[0]
  if (id && snapshot.sheets?.[id]) return snapshot.sheets[id]
  const sheets = snapshot.sheets
  if (!sheets) return undefined
  const firstKey = Object.keys(sheets)[0]
  return firstKey ? sheets[firstKey] : undefined
}

/**
 * Pull floating images out of the workbook's drawing resources. The drawing
 * plugin serializes images into `resources` as JSON strings; rather than
 * hard-coding its (versioned) nesting schema, we parse every resource and walk
 * it for objects that look like an image drawing (have a `source` and a
 * `transform` with size). Each workbook here holds a single sheet, so we don't
 * filter by subUnitId.
 */
function extractSheetImages(snapshot: WorkbookSnapshot): PrintImage[] {
  const resources = snapshot.resources
  if (!Array.isArray(resources)) return []
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
    if (
      typeof source === 'string' &&
      source.length > 0 &&
      transform &&
      typeof transform === 'object'
    ) {
      const left = Number(transform.left ?? 0)
      const top = Number(transform.top ?? 0)
      const width = Number(transform.width ?? 0)
      const height = Number(transform.height ?? 0)
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

/** Sum of column widths for columns [0, count). */
function sumColWidths(sheet: WorksheetSnapshot, count: number, def: number): number {
  let total = 0
  for (let c = 0; c < count; c += 1) total += sheet.columnData?.[c]?.w ?? def
  return total
}

/** Sum of row heights for rows [0, count). */
function sumRowHeights(sheet: WorksheetSnapshot, count: number, def: number): number {
  let total = 0
  for (let r = 0; r < count; r += 1) total += sheet.rowData?.[r]?.h ?? def
  return total
}

/* ------------------------------------------------------------------ */
/* Header / footer templates (Electron classes: date,pageNumber,...)    */
/* ------------------------------------------------------------------ */

function tokenize(text: string, ctx: PrintRenderContext): string {
  const PAGE = 'PAGE'
  const PAGES = 'PAGES'
  const DATE = 'DATE'
  const marked = text
    .replace(/\{project\}/g, ctx.projectName)
    .replace(/\{title\}/g, ctx.title)
    .replace(/\{page\}/g, PAGE)
    .replace(/\{pages\}/g, PAGES)
    .replace(/\{date\}/g, DATE)
  return escapeHtml(marked)
    .replace(new RegExp(PAGE, 'g'), '<span class="pageNumber"></span>')
    .replace(new RegExp(PAGES, 'g'), '<span class="totalPages"></span>')
    .replace(new RegExp(DATE, 'g'), '<span class="date"></span>')
}

function hfTemplate(
  parts: { left?: string; center?: string; right?: string } | undefined,
  ctx: PrintRenderContext,
  show: boolean | undefined
): string {
  if (!show) return '<span></span>'
  const left = tokenize(parts?.left ?? '', ctx)
  const center = tokenize(parts?.center ?? '', ctx)
  const right = tokenize(parts?.right ?? '', ctx)
  return (
    '<div style="font-size:9px;width:100%;padding:0 8mm;' +
    'display:flex;justify-content:space-between;align-items:center;' +
    'color:#444;font-family:Arial,sans-serif;">' +
    `<span style="flex:1;text-align:left">${left}</span>` +
    `<span style="flex:1;text-align:center">${center}</span>` +
    `<span style="flex:1;text-align:right">${right}</span>` +
    '</div>'
  )
}

/* ------------------------------------------------------------------ */
/* Main entry                                                           */
/* ------------------------------------------------------------------ */

export function buildPrintHtml(
  snapshot: WorkbookSnapshot,
  config: PrintConfig,
  geom: { pageSize: PaperSize; orientation: 'portrait' | 'landscape'; margins: Margins },
  ctx: PrintRenderContext,
  charts: ChartDef[] = []
): PrintRenderResult {
  const sheet = firstSheet(snapshot)
  const used = computeUsedRange(sheet)
  const range = config.range ?? used

  const landscape = geom.orientation === 'landscape'
  const marginsIn = {
    top: geom.margins.top / 25.4,
    bottom: geom.margins.bottom / 25.4,
    left: geom.margins.left / 25.4,
    right: geom.margins.right / 25.4
  }

  if (!sheet || !range) {
    return {
      html:
        '<!doctype html><html><body style="font-family:Arial;padding:24px;color:#888">' +
        'Nothing to print — the sheet is empty.</body></html>',
      pdfOptions: {
        pageSize: geom.pageSize,
        landscape,
        margins: marginsIn,
        printBackground: true,
        scale: 1,
        displayHeaderFooter: false,
        headerTemplate: '<span></span>',
        footerTemplate: '<span></span>',
        preferCSSPageSize: false
      },
      range: range ?? { startRow: 0, startColumn: 0, endRow: 0, endColumn: 0 },
      empty: true
    }
  }

  const styles = snapshot.styles
  const gridline = config.showGridlines !== false
  const showRC = config.showRowColHeaders === true
  const defColW = sheet.defaultColumnWidth ?? DEFAULT_COL_W
  const defRowH = sheet.defaultRowHeight ?? DEFAULT_ROW_H

  // Build a merge lookup: anchor map + covered set.
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

  // Column widths (px) across the range.
  const colWidths: number[] = []
  let contentWidthPx = 0
  for (let c = range.startColumn; c <= range.endColumn; c += 1) {
    const w = sheet.columnData?.[c]?.w ?? defColW
    colWidths.push(w)
    contentWidthPx += w
  }
  const rowHeaderW = showRC ? 40 : 0
  contentWidthPx += rowHeaderW

  // <colgroup>
  let colgroup = '<colgroup>'
  if (showRC) colgroup += `<col style="width:${rowHeaderW}px" />`
  for (const w of colWidths) colgroup += `<col style="width:${w}px" />`
  colgroup += '</colgroup>'

  // Column-letter header row.
  let colHeaderRow = ''
  if (showRC) {
    colHeaderRow = '<tr>' + `<th style="${HEADER_CSS}"></th>`
    for (let c = range.startColumn; c <= range.endColumn; c += 1) {
      colHeaderRow += `<th style="${HEADER_CSS}">${columnLabel(c)}</th>`
    }
    colHeaderRow += '</tr>'
  }

  const renderRow = (r: number): string => {
    const h = sheet.rowData?.[r]?.h ?? defRowH
    let tr = `<tr style="height:${h}px">`
    if (showRC) tr += `<th style="${HEADER_CSS}">${r + 1}</th>`
    for (let c = range.startColumn; c <= range.endColumn; c += 1) {
      const key = `${r}:${c}`
      if (covered.has(key)) continue
      const cell = sheet.cellData?.[r]?.[c] ?? {}
      const style = resolveStyle(cell, styles)
      const css = styleToCss(style, gridline)
      const span = anchors.get(key)
      const spanAttr = span
        ? `${span.colSpan > 1 ? ` colspan="${span.colSpan}"` : ''}${
            span.rowSpan > 1 ? ` rowspan="${span.rowSpan}"` : ''
          }`
        : ''
      const text = escapeHtml(cellText(cell)).replace(/\n/g, '<br/>')
      tr += `<td${spanAttr} style="${CELL_BASE_CSS};${css}">${text || '&nbsp;'}</td>`
    }
    tr += '</tr>'
    return tr
  }

  // Repeat header rows go in <thead> (Chromium repeats them on each page).
  const rowCount = range.endRow - range.startRow + 1
  const repeat = Math.max(0, Math.min(config.repeatHeaderRows ?? 0, rowCount))
  let thead = ''
  if (colHeaderRow || repeat > 0) {
    thead = '<thead>'
    if (colHeaderRow) thead += colHeaderRow
    for (let r = range.startRow; r < range.startRow + repeat; r += 1) thead += renderRow(r)
    thead += '</thead>'
  }
  let tbody = '<tbody>'
  for (let r = range.startRow + repeat; r <= range.endRow; r += 1) tbody += renderRow(r)
  tbody += '</tbody>'

  // Position overlay: sheet images (kept when they intersect the print area)
  // plus charts (always included). Both are placed absolutely at their sheet
  // pixel position, so charts print exactly where you arranged them — like
  // images — never on a separate page.
  const colHeaderH = showRC ? 20 : 0
  const rangeLeft = sumColWidths(sheet, range.startColumn, defColW)
  const rangeTop = sumRowHeights(sheet, range.startRow, defRowH)
  const rangeRight = sumColWidths(sheet, range.endColumn + 1, defColW)
  const rangeBottom = sumRowHeights(sheet, range.endRow + 1, defRowH)

  const overlay: PrintImage[] = []
  for (const img of extractSheetImages(snapshot)) {
    const intersects =
      img.left < rangeRight &&
      img.left + img.width > rangeLeft &&
      img.top < rangeBottom &&
      img.top + img.height > rangeTop
    if (intersects) overlay.push(img)
  }
  for (const ch of charts) {
    if (!ch.png) continue
    overlay.push({
      source: ch.png,
      left: ch.position.startX,
      top: ch.position.startY,
      width: ch.position.width,
      height: ch.position.height
    })
  }

  let overlayHtml = ''
  let maxRight = contentWidthPx
  let maxBottom = colHeaderH + (rangeBottom - rangeTop)
  for (const o of overlay) {
    const left = rowHeaderW + (o.left - rangeLeft)
    const top = colHeaderH + (o.top - rangeTop)
    maxRight = Math.max(maxRight, left + o.width)
    maxBottom = Math.max(maxBottom, top + o.height)
    overlayHtml +=
      `<img src="${escapeHtml(o.source)}" style="position:absolute;` +
      `left:${left}px;top:${top}px;width:${o.width}px;height:${o.height}px;` +
      `object-fit:fill" />`
  }

  // Scaling — based on the full content width, including charts/images that
  // extend beyond the table, so everything fits the page together.
  const paper = PAPER_MM[geom.pageSize]
  const pageWmm = landscape ? paper.h : paper.w
  const pageHmm = landscape ? paper.w : paper.h
  const printableWmm = pageWmm - geom.margins.left - geom.margins.right
  const printableHmm = pageHmm - geom.margins.top - geom.margins.bottom
  const printableWpx = printableWmm * PX_PER_MM
  const printableHpx = printableHmm * PX_PER_MM
  let scale = 1
  if (config.scaleMode === 'percent') {
    scale = Math.min(4, Math.max(0.1, (config.scalePercent ?? 100) / 100))
  } else if (config.scaleMode === 'fit-width') {
    scale = Math.min(1, printableWpx / Math.max(1, maxRight))
  } else if (config.scaleMode === 'fit-height') {
    scale = Math.min(1, printableHpx / Math.max(1, maxBottom))
  } else if (config.scaleMode === 'fit-sheet') {
    scale = Math.min(
      1,
      printableWpx / Math.max(1, maxRight),
      printableHpx / Math.max(1, maxBottom)
    )
  } else if (config.scaleMode === 'fit-page') {
    const pages = Math.max(1, config.fitToWidthPages ?? 1)
    scale = Math.min(1, (printableWpx * pages) / Math.max(1, maxRight))
  }

  const table = `<table style="width:${contentWidthPx}px">${colgroup}${thead}${tbody}</table>`
  const body = overlayHtml
    ? `<div style="position:relative;width:${maxRight}px;min-height:${maxBottom}px">${table}${overlayHtml}</div>`
    : table

  const html =
    '<!doctype html><html><head><meta charset="utf-8" />' +
    `<style>${BASE_STYLE}</style></head><body>` +
    body +
    '</body></html>'

  return {
    html,
    pdfOptions: {
      pageSize: geom.pageSize,
      landscape,
      margins: marginsIn,
      printBackground: true,
      scale,
      displayHeaderFooter: !!(config.showHeader || config.showFooter),
      headerTemplate: hfTemplate(config.header, ctx, config.showHeader),
      footerTemplate: hfTemplate(config.footer, ctx, config.showFooter),
      preferCSSPageSize: false
    },
    range,
    empty: false
  }
}
