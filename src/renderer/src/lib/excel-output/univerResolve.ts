/**
 * Shared Univer snapshot normalization for the export pipelines.
 *
 * Mirrors the installed Univer implementation (node_modules/@univerjs/core):
 * - Style composition follows `composeStyles` / `getComposedCellStyleByCellData`:
 *   later styles override earlier properties, per key, shallowly. Only
 *   `undefined` (absent) falls through — explicit `null`, 0 and false block
 *   inheritance. Precedence low→high: workbook/worksheet default, column,
 *   row, cell themeStyle, cell. Row-versus-column order is configurable
 *   (`_isRowStylePrecedeColumnStyle`, installed default `true`); it is a
 *   parameter here, never hardcoded.
 * - Row heights follow the installed RENDER path (SheetSkeleton
 *   `_generateRowMatrixCache`, which is what paints rows): hidden and
 *   filtered rows are 0 (hidden handled by callers via `hd`, as Univer
 *   separates visibility; filtered rows are not modeled); otherwise
 *   `(ia == null || ia === 1) && typeof ah === 'number' && ah > 0` yields
 *   `ah`, else `h` (falling back to the worksheet default). An absent `ia`
 *   still allows `ah` — `ia === 1` is not required. Note RowManager's own
 *   `getRowHeight` lacks the positive guard, but the render accumulation
 *   (the painted geometry) has it, and that is what exports mirror.
 *
 * Both the native Excel path (detailGrid/pageExcel/componentDetailPrep) and
 * the Typst renderer (univerSheet.typ re-implements the same two rules; see
 * its header notes) must stay consistent with this file.
 */

/** Row datum subset used for geometry + style composition. */
export interface UnivRowDatum {
  h?: number
  ia?: number
  ah?: number
  hd?: number
  s?: unknown
}

/** Column datum subset used for geometry + style composition. */
export interface UnivColDatum {
  w?: number
  hd?: number
  s?: unknown
}

/** Minimal style-bearing views for composition (unknown-typed: any snapshot shape fits). */
export interface UnivStyleBearing {
  s?: unknown
}

/** Minimal cell view for style composition. */
export interface UnivCellLike extends UnivStyleBearing {
  themeStyle?: unknown
}

/** Resolve one style reference against the style registry. */
export function resolveUniverStyleRef(
  ref: unknown,
  styles: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (ref == null) return undefined
  if (typeof ref === 'string' || typeof ref === 'number') {
    const found: unknown = styles?.[String(ref)]
    if (found === null || found === undefined || typeof found !== 'object') return undefined
    return found as Record<string, unknown>
  }
  return typeof ref === 'object' ? (ref as Record<string, unknown>) : undefined
}

export interface ComposeCellStyleArgs {
  cell?: UnivCellLike | null
  rowDatum?: UnivStyleBearing | null
  colDatum?: UnivStyleBearing | null
  defaultStyle?: unknown
  styles?: Record<string, unknown>
  /**
   * Mirrors `_isRowStylePrecedeColumnStyle`. The installed render skeleton
   * forces this from config `isRowStylePrecedeColumnStyle ?? false`, and the
   * app never configures it — so the active renderer uses `false` (column
   * precedes row), not the model constructor default `true`.
   */
  rowPrecedesColumn?: boolean
}

/**
 * Compose the effective cell style property by property, exactly like
 * Univer's `composeStyles(default, col, row, themeStyle, cell)` (or with row
 * and column swapped when `rowPrecedesColumn` is false). Only absent
 * (`undefined`) keys fall through; explicit `null`, 0 and `false` win and
 * block lower layers. Objects are replaced wholesale — no deep merge.
 */
export function composeUniverCellStyle(args: ComposeCellStyleArgs): Record<string, unknown> {
  const { cell, styles } = args
  const rowPrecedes = args.rowPrecedesColumn ?? false
  const rowSt = resolveUniverStyleRef(args.rowDatum?.s ?? undefined, styles)
  const colSt = resolveUniverStyleRef(args.colDatum?.s ?? undefined, styles)
  const defaultSt = resolveUniverStyleRef(args.defaultStyle, styles)
  const themeSt =
    cell?.themeStyle && typeof cell.themeStyle === 'object' ? cell.themeStyle : undefined
  const cellSt = resolveUniverStyleRef(cell?.s ?? undefined, styles)
  // Low → high precedence in the list; traverse back-to-front keeping the
  // first defined property — exactly Univer's composeStyles loop, so the
  // highest-priority layer wins. Only absent (`undefined`) keys fall through;
  // explicit `null`, 0 and `false` block lower layers. Shallow replacement.
  const layers = rowPrecedes
    ? [defaultSt, colSt, rowSt, themeSt, cellSt]
    : [defaultSt, rowSt, colSt, themeSt, cellSt]
  const out: Record<string, unknown> = {}
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i]
    if (!layer) continue
    for (const key of Object.keys(layer)) {
      if (out[key] === undefined) out[key] = (layer as Record<string, unknown>)[key]
    }
  }
  return out
}

/**
 * Resolved row height in pixels, mirroring the row manager: hidden is NOT
 * handled here (callers map `hd === 1` to 0); `(ia == null || ia === 1)` with
 * a numeric `ah` yields `ah`; otherwise a numeric `h` wins (including zero),
 * matching Univer's RowManager. The caller maps hidden rows to zero too.
 */
export function resolveRowHeightPx(
  row: UnivRowDatum | undefined | null,
  defaultH: number
): number {
  if (row && (row.ia == null || row.ia === 1) && typeof row.ah === 'number') {
    return row.ah
  }
  if (row && typeof row.h === 'number') return row.h
  return defaultH > 0 ? defaultH : 24
}

/** Resolved column width in pixels: numeric `w`, including zero, else default. */
export function resolveColWidthPx(
  col: UnivColDatum | undefined | null,
  defaultW: number
): number {
  if (col && typeof col.w === 'number') return col.w
  return defaultW > 0 ? defaultW : 88
}

/**
 * Installed Office theme palette (THEME_COLORS.Office in core
 * theme-color-map.ts), as rrggbb without `#`: DARK1 0, LIGHT1 1, DARK2 2,
 * LIGHT2 3, ACCENT1..6 4..9, HYPERLINK 10, FOLLOWED_HYPERLINK 11.
 * Installed getColorStyle hardcodes the "Office" table — workbook UI-theme
 * customization (ThemeService named colours) never changes these — so the
 * table is a literal here, shared by every exporter (the Typst renderer
 * carries the same literal; see its header notes).
 */
export const OFFICE_THEME_COLORS: Record<number, string> = {
  0: '000000',
  1: 'FFFFFF',
  2: '44546A',
  3: 'E7E6E6',
  4: '4472C4',
  5: 'ED7D31',
  6: 'A5A5A5',
  7: '70AD47',
  8: '5B9BD5',
  9: '70AD47',
  10: '0563C1',
  11: '954F72'
}

/** Installed IColorStyle shape: explicit rgb wins, else indexed theme. */
export interface UnivIColorStyle {
  rgb?: string | null
  th?: number | null
}

/**
 * Indexed theme colour to rrggbb (no `#`), mirroring the `th` branch of
 * installed getColorStyle. Non-integer and out-of-range indexes yield
 * undefined — the CALLER applies the installed per-path fallback (font and
 * border paint black, fills paint nothing). Which paths resolve `th` at all
 * is also installed behavior, not a free choice: sheet borders and document
 * (rich/rotated) font resolve it; plain-text font and sheet cell fills read
 * `.rgb` only (engine-render _renderText/Text.drawWith and
 * _setBgStylesCache), so exporters must not resolve `th` there either.
 */
export function themeIndexToRgbHex(th: unknown): string | undefined {
  if (typeof th !== 'number' || !Number.isInteger(th)) return undefined
  return OFFICE_THEME_COLORS[th]
}

/**
 * Effective rrggbb for one IColorStyle with the installed precedence
 * (`if (color.rgb) ... else if (color.th != null)`): truthy rgb normalizes
 * through the caller's rgb normalizer; otherwise, when `theme` is set, the
 * theme index resolves through the Office table. Falsy rgb with no usable
 * index yields undefined for the caller's installed fallback.
 */
export function resolveIColorRgb(
  color: UnivIColorStyle | string | null | undefined,
  normRgb: (raw: string) => string | undefined,
  opts?: { theme?: boolean }
): string | undefined {
  if (typeof color === 'string') return normRgb(color)
  if (!color || typeof color !== 'object') return undefined
  if (color.rgb) return normRgb(color.rgb)
  if (opts?.theme) return themeIndexToRgbHex(color.th)
  return undefined
}

/** Pixels to Typst/Excel points. */
export function pxToPt(px: number): number {
  return Math.round(px * 0.75 * 100) / 100
}

/**
 * Pixels to Excel column-width characters. Excel's unit is the width of '0'
 * in the Normal font; px/7 approximates it for the usual sans defaults and
 * is verified by narrow/wide round-trip tests. No minimum floor — narrow
 * columns are legitimate source geometry (hidden stays 0 via callers).
 */
export function pxToChars(px: number): number {
  return Math.round((px / 7) * 100) / 100
}
