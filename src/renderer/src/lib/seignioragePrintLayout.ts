/**
 * Page layout for the seigniorage print preview: grouping rows by mineral and
 * splitting them across pages. Kept out of the modal so the pagination rules
 * can be tested without rendering.
 */

import type { PaperSize } from '../types/project'
import type { SeigniorageItemRow } from './seigniorage'

const qtyFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 })
const rateFmt = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

export function paperMm(paper: PaperSize): { w: number; h: number } {
  if (paper === 'A3') return { w: 297, h: 420 }
  if (paper === 'A2') return { w: 420, h: 594 }
  if (paper === 'Letter') return { w: 216, h: 279 }
  if (paper === 'Legal') return { w: 216, h: 356 }
  return { w: 210, h: 297 }
}

/** The "qty x ratio = applicable" working shown in the Seigniorage Qty column. */
export function seigQtyCalc(row: SeigniorageItemRow): string {
  if (row.conversionRequired) return 'Conversion required'
  const mode = row.mode
  if (mode === 'FULL_ITEM_QUANTITY') {
    return row.itemQuantity != null
      ? `${qtyFmt.format(row.itemQuantity)} ${row.itemUnit || row.unit}`
      : '-'
  }
  if (mode === 'DIRECT_RECIPE_QTY') {
    return row.recipeMaterialQty != null
      ? `${qtyFmt.format(row.recipeMaterialQty)} ${row.recipeMaterialUnit || row.unit}`
      : 'Review'
  }
  if (row.itemQuantity == null || row.quantityRatio == null) return '-'
  const parts = [qtyFmt.format(row.itemQuantity), rateFmt.format(row.quantityRatio)]
  if (row.conversionFactor != null && row.conversionFactor !== 1) {
    parts.push(rateFmt.format(row.conversionFactor))
  }
  const applicable = row.quantity
  return `${parts.join(' × ')} = ${
    applicable != null ? `${qtyFmt.format(applicable)} ${row.unit}` : '—'
  }`
}

// --- Height estimates in mm ---
/** Page header, repeated on every page. */
export const HDR_H = 30
/** Summary cards row, first page only. */
export const SUMMARY_H = 38
export const SEC_HEADING_H = 12
export const TBL_HEADER_H = 11
export const SUBTOTAL_H = 8
export const GRAND_H = 52
const LINE_H = 4.2
const ROW_PAD = 3

/**
 * Rows vary a lot in height: descriptions wrap to several lines and the permit
 * cell always carries its percentage on a second line. A flat per-row estimate
 * under-counts, which over-packs the page and forces spurious splits.
 */
export function rowHeight(row: SeigniorageItemRow, fontScale = 1): number {
  const description = [row.itemCode, row.materialLabel, row.recipeMaterialDesc]
    .filter(Boolean)
    .join(' ')
  // Larger text fits fewer characters per line as well as making each line
  // taller, so the wrap width scales down as the line height scales up.
  const descriptionLines = Math.ceil(description.length / (24 / fontScale))
  const calcLines = Math.ceil(seigQtyCalc(row).length / (20 / fontScale))
  const permitLines = 2 // amount, then "@ 80%"
  return (
    Math.max(descriptionLines, calcLines, permitLines, 1) * LINE_H * fontScale +
    ROW_PAD * fontScale
  )
}

export interface MatGroup {
  key: string
  label: string
  rows: SeigniorageItemRow[]
  s: number
  d: number
  m: number
  p: number
}

export function groupByMat(rows: SeigniorageItemRow[]): MatGroup[] {
  const map = new Map<string, MatGroup>()
  for (const row of rows) {
    if (!row.materialKey && !row.charge && row.seigRate === null) continue
    const key = row.materialKey || row.materialLabel || row.charge?.seig_code || 'UNASSIGNED'
    const group =
      map.get(key) ??
      {
        key,
        label: row.materialLabel || row.charge?.mineral_name || 'Unassigned',
        rows: [],
        s: 0,
        d: 0,
        m: 0,
        p: 0
      }
    group.rows.push(row)
    group.s += row.seigniorage ?? 0
    group.d += row.dmft ?? 0
    group.m += row.smft ?? 0
    group.p += row.permit ?? 0
    map.set(key, group)
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label))
}

/** Content on a single printed page. */
export interface PageChunk {
  /** First page gets the summary cards under the header. */
  isFirst: boolean
  sections: SectionChunk[]
  /** The last page carries the grand total block. */
  showGrandTotal: boolean
}

export interface SectionChunk {
  group: MatGroup
  rowStart: number
  /** Exclusive. */
  rowEnd: number
  /** Set when this chunk continues a group that started on an earlier page. */
  isContinuation: boolean
  showSubtotal: boolean
}

/**
 * Lays rows out across pages. The page break is decided *before* the chunk is
 * sized, so a chunk is always measured against the page it actually lands on —
 * sizing first and breaking afterwards used to strand a part-chunk at the top
 * of a fresh page and then start a second table of the same group below it.
 *
 * A group therefore contributes at most one table per page.
 */
export function buildPages(
  groups: MatGroup[],
  pageH: number,
  /** Report font scale (1 = 100%). Every text-driven height scales with it. */
  fontScale = 1
): PageChunk[] {
  const headerH = HDR_H * fontScale
  const summaryH = SUMMARY_H * fontScale
  const chromeH = (SEC_HEADING_H + TBL_HEADER_H) * fontScale
  const subtotalH = SUBTOTAL_H * fontScale
  const grandH = GRAND_H * fontScale

  const pages: PageChunk[] = [{ isFirst: true, sections: [], showGrandTotal: false }]
  let used = headerH + summaryH

  const newPage = (): void => {
    pages.push({ isFirst: false, sections: [], showGrandTotal: false })
    used = headerH
  }

  for (const group of groups) {
    let rowIdx = 0
    let isContinuation = false

    while (rowIdx < group.rows.length) {
      // Break first: a heading plus one row must fit, or this belongs overleaf.
      if (used > headerH && used + chromeH + rowHeight(group.rows[rowIdx], fontScale) > pageH) {
        newPage()
      }

      const available = pageH - used - chromeH
      let taken = 0
      let contentH = 0
      while (rowIdx + taken < group.rows.length) {
        const height = rowHeight(group.rows[rowIdx + taken], fontScale)
        const isFinalRow = rowIdx + taken === group.rows.length - 1
        const withSubtotal = contentH + height + (isFinalRow ? subtotalH : 0)
        if (withSubtotal > available && taken > 0) break
        contentH += height
        taken += 1
        // A single row taller than the page still has to go somewhere.
        if (contentH > available) break
      }

      const isLastChunk = rowIdx + taken >= group.rows.length
      pages[pages.length - 1].sections.push({
        group,
        rowStart: rowIdx,
        rowEnd: rowIdx + taken,
        isContinuation,
        showSubtotal: isLastChunk
      })

      used += chromeH + contentH + (isLastChunk ? subtotalH : 0)
      rowIdx += taken
      isContinuation = true
    }
  }

  const lastPage = pages[pages.length - 1]
  if (used + grandH <= pageH) {
    lastPage.showGrandTotal = true
  } else {
    newPage()
    pages[pages.length - 1].showGrandTotal = true
  }

  return pages
}
