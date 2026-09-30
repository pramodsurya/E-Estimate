/**
 * Installed-Univer display text for the PDF path (`cell._ee`).
 *
 * The runtime sheet paints number patterns through
 * `@univerjs/sheets-numfmt`'s cell-content interceptor, whose single call is
 * `getPatternPreviewIgnoreGeneral(pattern, Number(v), locale)` (installed
 * dist `sheets-numfmt/lib/index.js`). This module runs that same call ahead
 * of time so the Typst renderer consumes displayed text verbatim and never
 * reformats it. Excel never sees `_ee`: it keeps the original `v` plus the
 * verbatim pattern.
 *
 * Installed chain mirrored here (read from the dists, which are not edited):
 * - trigger: `v` present, `t` neither BOOLEAN (3) nor FORCE_STRING (4),
 *   composed style carries `n.pattern`, pattern not default (`General`);
 *   interceptor dist lines ~702/714/717.
 * - text: `numfmt.format(pattern, value, { locale: 'en', throws: false })`;
 *   the section color surfaces only when `value < 0` (dist ~571-575).
 * - color: installed `numfmt.formatColor` returns the bare name (`red`); the
 *   runtime resolves it via `themeService.getColorFromTheme(`${color}.500`)`
 *   (lodash `get` on the
 *   active theme — the app never calls `setTheme`, so this is always
 *   `defaultTheme`) and falls back to the raw string, which the canvas then
 *   drops to default ink (`getColorStyle` -> invalid -> default). `[ColorN]`
 *   arrives already hex (numfmt default `indexColors: true`).
 *
 * Not covered, by installed design, not by omission:
 * - plain booleans (no pattern) never reach numfmt: the interceptor skips
 *   `t: 3`, so TRUE/FALSE stays an explicit Typst branch. Nothing here
 *   resolves the boolean display tone.
 * - `General`/missing patterns: the runtime shows `String(v)`; the Typst
 *   fallback `str(v)` already agrees, so no `_ee` is attached.
 * - non-finite numbers: left to the Typst fallback (`str(v)`).
 */

import { DEFAULT_NUMBER_FORMAT, get, numfmt } from '@univerjs/core'
import { defaultTheme } from '@univerjs/themes'
import { composeUniverCellStyle } from '../excel-output/univerResolve'

/** Displayed text plus optional Univer-hex ink, attached as `cell._ee`. */
export interface EeDisplayText {
  /** Verbatim displayed text: Typst renders it as-is, never reformats. */
  d: string
  /** Univer hex (`#RRGGBB`) when the winning section carries a color. */
  c?: string
}

/** Locale the runtime preview formats with (app Univer instance is EN_US). */
const EE_LOCALE = 'en'

/**
 * Resolve an installed section-color string to Univer hex upfront, exactly
 * like the runtime (`getColorFromTheme(`${color}.500`) ?? color`, then canvas
 * `getColorStyle` validity). Returns `undefined` when the canvas would fall
 * back to default ink, so Typst never probes color names.
 */
export function eeSectionColorToHex(color: unknown): string | undefined {
  if (typeof color !== 'string') return undefined
  const raw = color.trim()
  if (raw === '') return undefined
  // `[ColorN]` is already palette hex via numfmt's default indexColors.
  // Only canonical CSS lengths pass through (3/4/6/8 digits); 5/7-digit
  // strings are never emitted by the formatter and fail canvas validity.
  if (/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(raw)) return raw
  // Installed `numfmt@3.2.6 formatColor` returns the color token's capture
  // (`s[1]` of `/^\[(black|…|red|…|color\s*\d+)\]/i`), lowercased — i.e. the
  // bare name `red`, never the bracketed `[red]`. Accept both shapes so the
  // installed output and pattern-derived spellings resolve identically.
  const named = /^(?:\[\s*([A-Za-z]+)\s*\]|([A-Za-z]+))$/.exec(raw)
  if (!named) return undefined
  // lodash `get(theme, 'red.500')` reads `theme.red['500']`; only names
  // present in defaultTheme resolve (black/white/cyan/magenta miss and the
  // canvas drops them to default ink).
  const hex = get(defaultTheme, `${(named[1] ?? named[2]).toLowerCase()}.500`)
  return typeof hex === 'string' && hex !== '' ? hex : undefined
}

/**
 * Displayed text for one numeric value + pattern: the installed
 * `getPatternPreview` body with the color resolved to hex upfront.
 * Returns `null` when the runtime would show the raw value instead.
 */
export function eeDisplayForCell(value: number, pattern: string): EeDisplayText | null {
  if (!Number.isFinite(value)) return null
  if (typeof pattern !== 'string' || pattern === '' || pattern === DEFAULT_NUMBER_FORMAT) return null
  try {
    const sectionColor = numfmt.formatColor(pattern, value)
    const color = sectionColor ? String(sectionColor) : undefined
    const result = numfmt.format(pattern, value, { locale: EE_LOCALE, throws: false })
    const out: EeDisplayText = { d: String(result) }
    // Installed quirk, kept: the preview only surfaces the section color
    // for negative values.
    if (value < 0) {
      const hex = eeSectionColorToHex(color)
      if (hex) out.c = hex
    }
    return out
  } catch {
    return { d: String(value) }
  }
}

interface EeCellLike {
  v?: unknown
  t?: unknown
  s?: unknown
  themeStyle?: unknown
  [key: string]: unknown
}

interface EeSheetLike {
  cellData?: Record<string, Record<string, EeCellLike>>
  rowData?: Record<string, { s?: unknown }>
  columnData?: Record<string, { s?: unknown }>
  defaultStyle?: unknown
}

export interface EeWorkbookLike {
  sheets?: Record<string, EeSheetLike>
  styles?: Record<string, unknown>
  defaultStyle?: unknown
}

/**
 * Clone-on-write `_ee` attachment over every sheet of a workbook snapshot.
 * Cells are never mutated: annotated cells are shallow copies, untouched
 * rows keep their references, and the saved snapshot the caller holds stays
 * pristine (the fidelity suite asserts exactly that).
 */
export function attachEeDisplayText<T extends EeWorkbookLike>(snapshot: T): T {
  if (!snapshot || typeof snapshot !== 'object' || !snapshot.sheets) return snapshot
  let sheetsChanged = false
  const sheets: Record<string, EeSheetLike> = {}
  for (const [sheetId, sheet] of Object.entries(snapshot.sheets)) {
    if (!sheet || typeof sheet !== 'object' || !sheet.cellData) {
      sheets[sheetId] = sheet
      continue
    }
    let cellDataChanged = false
    const cellData: Record<string, Record<string, EeCellLike>> = {}
    for (const [rowKey, row] of Object.entries(sheet.cellData)) {
      if (!row || typeof row !== 'object') {
        cellData[rowKey] = row
        continue
      }
      let rowChanged = false
      const nextRow: Record<string, EeCellLike> = {}
      for (const [colKey, cell] of Object.entries(row)) {
        const annotated = maybeAnnotateCell(cell, sheet, snapshot, rowKey, colKey)
        nextRow[colKey] = annotated ?? cell
        if (annotated) rowChanged = true
      }
      cellData[rowKey] = rowChanged ? nextRow : row
      if (rowChanged) cellDataChanged = true
    }
    sheets[sheetId] = cellDataChanged ? { ...sheet, cellData } : sheet
    if (cellDataChanged) sheetsChanged = true
  }
  return sheetsChanged ? { ...snapshot, sheets } : snapshot
}

/**
 * Shallow-copy a cell with `_ee` when the installed interceptor would
 * repaint it, else `null`. Style comes from the shared composer (same
 * default/row/column/theme/cell precedence the Typst renderer uses), so the
 * `_ee` trigger agrees with the fallback branch it supersedes.
 */
function maybeAnnotateCell(
  cell: EeCellLike,
  sheet: EeSheetLike,
  workbook: EeWorkbookLike,
  rowKey: string,
  colKey: string
): EeCellLike | null {
  if (!cell || typeof cell !== 'object') return null
  if (typeof cell.v !== 'number' || !Number.isFinite(cell.v)) return null
  // Installed trigger skips booleans and forced strings (dist ~702): their
  // display never passes through numfmt (TRUE/FALSE stays explicit).
  if (cell.t === 3 || cell.t === 4) return null
  const composed = composeUniverCellStyle({
    cell,
    rowDatum: sheet.rowData?.[rowKey] ?? null,
    colDatum: sheet.columnData?.[colKey] ?? null,
    defaultStyle: sheet.defaultStyle ?? workbook.defaultStyle,
    styles: workbook.styles as Record<string, unknown> | undefined,
    rowPrecedesColumn: false
  })
  const n = composed.n as { pattern?: unknown } | undefined
  const pattern = n && typeof n === 'object' ? n.pattern : undefined
  if (typeof pattern !== 'string' || pattern === '') return null
  const ee = eeDisplayForCell(cell.v, pattern)
  if (!ee) return null
  return ee.c ? { ...cell, _ee: { d: ee.d, c: ee.c } } : { ...cell, _ee: { d: ee.d } }
}
