/**
 * Core Excel page setup, column scaling, style resolution, and Univer adapters.
 * Mirrors worksheetTypst.ts function-by-function for ExcelJS.
 */
/**
 * Minimal local ExcelJS shape declarations. The `exceljs` package is removed
 * (the native rust_xlsxwriter compiler owns all .xlsx output); these are
 * structural types only with no runtime import.
 */
declare namespace ExcelJS {
  type BorderStyle =
    | 'thin' | 'dotted' | 'dashDot' | 'hair' | 'dashed' | 'medium'
    | 'mediumDashed' | 'mediumDashDot' | 'slantDashDot' | 'double'
  interface Color { argb?: string }
  interface Font {
    name?: string; size?: number; family?: number; bold?: boolean
    italic?: boolean; underline?: boolean; strike?: boolean; color?: Color
  }
  interface Alignment { vertical?: string; horizontal?: string; wrapText?: boolean }
  interface Border { style?: BorderStyle; color?: Color }
  interface Borders { top?: Border; left?: Border; bottom?: Border; right?: Border; diagonal?: Border }
  interface Fill { type?: string; pattern?: string; fgColor?: Color; bgColor?: Color }
  interface RichText { text?: string; font?: Font }
  interface PageSetup {
    paperSize?: number; orientation?: string; fitToPage?: boolean
    fitToWidth?: number; fitToHeight?: number
    margins?: { left?: number; right?: number; top?: number; bottom?: number; header?: number; footer?: number }
    horizontalCentered?: boolean; printArea?: string; printTitlesRow?: string
  }
  interface Column { width?: number }
  interface Cell {
    font?: Font; fill?: Fill; alignment?: Alignment; border?: Borders
    numFmt?: string; value?: unknown
  }
  interface Worksheet { getColumn(n: number): Column; mergeCells(top: number, left: number, bottom: number, right: number): void }
}
import type { CellRange, Margins, Orientation, PaperSize } from '../../types/project'
import type { DocumentSettings } from '../typist-output/documentSettings'
import { PAPER_MM, PX_PER_MM } from '../printRender'

/** Paper dimensions mapping in millimeters. */
const PAPER_SIZES_MM: Record<string, { width: number; height: number; excelPaperSize: number }> = {
  a4: { width: 210, height: 297, excelPaperSize: 9 },
  a3: { width: 297, height: 420, excelPaperSize: 8 },
  a5: { width: 148, height: 210, excelPaperSize: 11 },
  letter: { width: 215.9, height: 279.4, excelPaperSize: 1 },
  legal: { width: 215.9, height: 355.6, excelPaperSize: 5 }
}

/**
 * 1. resolveExcelPageSetup(settings, range, widths)
 * Translates DocumentSettings & print area into ExcelJS pageSetup:
 * paper, orientation, margins, printArea, and fitToWidth=1, fitToHeight=0.
 */
export function resolveExcelPageSetup(
  settings: DocumentSettings | { pageSize?: PaperSize; orientation?: Orientation; margins?: Margins },
  range?: { startRow: number; endRow: number; startCol: number; endCol: number },
  repeatHeaderRows?: { from: number; to: number }
): Partial<ExcelJS.PageSetup> {
  const paperKey = (settings.pageSize || 'A4').toLowerCase()
  const paper = PAPER_SIZES_MM[paperKey] ?? PAPER_SIZES_MM.a4
  const orientation = settings.orientation || 'portrait'
  const isLandscape = orientation === 'landscape'

  // Standard margins in inches (ExcelJS uses inches)
  const margins = settings.margins ?? { top: 10, right: 10, bottom: 10, left: 15 }
  const leftInches = (margins.left ?? 15) / 25.4
  const rightInches = (margins.right ?? 10) / 25.4
  const topInches = (margins.top ?? 10) / 25.4
  const bottomInches = (margins.bottom ?? 10) / 25.4

  const setup: Partial<ExcelJS.PageSetup> = {
    paperSize: paper.excelPaperSize,
    orientation: isLandscape ? 'landscape' : 'portrait',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: {
      left: Number(leftInches.toFixed(4)),
      right: Number(rightInches.toFixed(4)),
      top: Number(topInches.toFixed(4)),
      bottom: Number(bottomInches.toFixed(4)),
      header: 0.2,
      footer: 0.2
    },
    horizontalCentered: true
  }

  if (range) {
    const colToLetter = (c: number): string => {
      let letter = ''
      while (c > 0) {
        const mod = (c - 1) % 26
        letter = String.fromCharCode(65 + mod) + letter
        c = Math.floor((c - mod) / 26)
      }
      return letter
    }
    const startColLet = colToLetter(range.startCol)
    const endColLet = colToLetter(range.endCol)
    setup.printArea = `${startColLet}${range.startRow}:${endColLet}${range.endRow}`
  }

  if (repeatHeaderRows) {
    setup.printTitlesRow = `${repeatHeaderRows.from}:${repeatHeaderRows.to}`
  }

  return setup
}

/**
 * 2. applyScaledColumnWidths(ws, widths, printableWidthPx)
 * Reuses columnScaleFor() logic (min(1, printable/content)).
 * Converts pixel widths to Excel column character widths, never stretching.
 */
export function applyScaledColumnWidths(
  ws: ExcelJS.Worksheet,
  columnWidthsPx: number[],
  printableWidthPx: number
): void {
  const contentWidthPx = columnWidthsPx.reduce((sum, w) => sum + w, 0)
  const scale = contentWidthPx > 0 ? Math.min(1, printableWidthPx / contentWidthPx) : 1

  // 1 Excel character width ~ 7.5 px on standard 10-11pt fonts (char width padding ~ 0.7)
  const PX_PER_EXCEL_CHAR = 7.5

  columnWidthsPx.forEach((widthPx, index) => {
    const colNum = index + 1
    const scaledPx = Math.max(20, widthPx * scale)
    const excelWidth = Number((scaledPx / PX_PER_EXCEL_CHAR).toFixed(2))
    ws.getColumn(colNum).width = excelWidth
  })
}

/**
 * 3. applyMerges(ws, mergeData, range)
 * Clips Univer sheet.mergeData to the active export range and merges cells.
 */
export function applyMerges(
  ws: ExcelJS.Worksheet,
  mergeData: CellRange[] = [],
  range?: { startRow: number; endRow: number; startCol: number; endCol: number }
): void {
  for (const m of mergeData) {
    // Univer ranges are 0-indexed: startRow, endRow, startColumn, endColumn
    const top = m.startRow + 1
    const bottom = m.endRow + 1
    const left = m.startColumn + 1
    const right = m.endColumn + 1

    if (range) {
      if (bottom < range.startRow || top > range.endRow || right < range.startCol || left > range.endCol) {
        continue
      }
      const cTop = Math.max(top, range.startRow)
      const cBottom = Math.min(bottom, range.endRow)
      const cLeft = Math.max(left, range.startCol)
      const cRight = Math.min(right, range.endCol)
      if (cTop < cBottom || cLeft < cRight) {
        ws.mergeCells(cTop, cLeft, cBottom, cRight)
      }
    } else {
      if (top < bottom || left < right) {
        ws.mergeCells(top, left, bottom, right)
      }
    }
  }
}

/**
 * 4. applyCellStyle(cell, style)
 * Font name, size, bold, italic, underline, strike, color, fill, alignment + wrap, borders.
 */
export function applyCellStyle(
  cell: ExcelJS.Cell,
  style: any,
  isHeader = false
): void {
  if (!style) return

  // Font
  const font: Partial<ExcelJS.Font> = {
    name: style.ff || 'Trebuchet MS',
    size: style.fs || 10,
    family: 2
  }
  if (style.bl || isHeader) font.bold = true
  if (style.it) font.italic = true
  if (style.ul) font.underline = true
  if (style.st) font.strike = true

  const colorHex = normColorHex(style.cl?.rgb)
  if (colorHex) {
    font.color = { argb: 'FF' + colorHex }
  } else {
    font.color = { argb: 'FF000000' }
  }
  cell.font = font

  // Fill
  const bgHex = normColorHex(style.bg?.rgb)
  if (bgHex && bgHex !== 'ffffff') {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF' + bgHex }
    }
  }

  // Alignment
  const alignment: Partial<ExcelJS.Alignment> = {
    vertical: style.vt === 1 ? 'top' : style.vt === 3 ? 'bottom' : 'middle',
    wrapText: style.tb === 2 || style.tb === 3 || Boolean(style.wrapText)
  }
  if (style.ht === 2) alignment.horizontal = 'center'
  else if (style.ht === 3) alignment.horizontal = 'right'
  else if (style.ht === 1) alignment.horizontal = 'left'
  cell.alignment = alignment

  // Borders
  if (style.bd) {
    const borders: Partial<ExcelJS.Borders> = {}
    const borderSide = (s: any): Partial<ExcelJS.Border> => {
      if (!s) return { style: 'thin', color: { argb: 'FF000000' } }
      const hex = normColorHex(s.cl?.rgb) || '000000'
      const styleType: ExcelJS.BorderStyle = s.s === 2 ? 'medium' : s.s === 3 ? 'dashed' : s.s === 6 ? 'double' : 'thin'
      return { style: styleType, color: { argb: 'FF' + hex } }
    }
    if (style.bd.t) borders.top = borderSide(style.bd.t)
    if (style.bd.r) borders.right = borderSide(style.bd.r)
    if (style.bd.b) borders.bottom = borderSide(style.bd.b)
    if (style.bd.l) borders.left = borderSide(style.bd.l)
    cell.border = borders
  }
}

/**
 * 5. applyNumberFormats(cell, pattern)
 * Directly maps Univer n.pattern to ExcelJS numFmt.
 */
export function applyNumberFormats(cell: ExcelJS.Cell, pattern?: string | null): void {
  if (!pattern) return
  cell.numFmt = pattern
}

/**
 * 6. applyRichText(cell, p)
 * Converts Univer textRuns into ExcelJS richText fragments.
 */
export function applyRichText(
  cell: ExcelJS.Cell,
  p: { body?: { dataStream?: string; textRuns?: any[] } } | null | undefined
): boolean {
  if (!p?.body?.dataStream || !p.body.textRuns || p.body.textRuns.length === 0) return false
  const stream = p.body.dataStream
  const richText: ExcelJS.RichText[] = []

  let lastIdx = 0
  for (const run of p.body.textRuns) {
    if (run.st > lastIdx) {
      richText.push({
        text: stream.slice(lastIdx, run.st),
        font: { name: 'Trebuchet MS', size: 10, family: 2 }
      })
    }
    const font: Partial<ExcelJS.Font> = {
      name: 'Trebuchet MS',
      size: 10,
      family: 2
    }
    if (run.ts?.bl) font.bold = true
    if (run.ts?.it) font.italic = true
    if (run.ts?.ul) font.underline = true
    if (run.ts?.cl?.rgb) {
      const hex = normColorHex(run.ts.cl.rgb)
      if (hex) font.color = { argb: 'FF' + hex }
    }
    richText.push({
      text: stream.slice(run.st, run.ed),
      font
    })
    lastIdx = run.ed
  }

  if (lastIdx < stream.length) {
    richText.push({
      text: stream.slice(lastIdx),
      font: { name: 'Trebuchet MS', size: 10, family: 2 }
    })
  }

  if (richText.length > 0) {
    cell.value = { richText }
    return true
  }
  return false
}

/** Helper: normalize RGB/HEX color to 6-char hex. */
export function normColorHex(raw?: string | null): string | null {
  if (!raw) return null
  const s = raw.trim().replace(/^#/, '')
  if (/^[0-9a-fA-F]{6}$/.test(s)) return s.toUpperCase()
  if (/^[0-9a-fA-F]{8}$/.test(s)) return s.slice(0, 6).toUpperCase()
  const rgb = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i.exec(raw)
  if (rgb) {
    const toHex = (n: string) => Number(n).toString(16).padStart(2, '0').toUpperCase()
    return `${toHex(rgb[1])}${toHex(rgb[2])}${toHex(rgb[3])}`
  }
  return null
}
