/**
 * Reusable print-section space budgeting.
 *
 * A template supplies the amount of content already occupying its left and
 * right columns plus the number of compact items it still needs to place. The
 * decision is deliberately independent of bunds, quantities, HTML and CSS so
 * other print templates can use the same layout intelligence.
 */

export type SectionLayoutPlacement = 'left' | 'right' | 'full'

export interface SectionLayoutBudget {
  /** Number of compact cards/items still to place. */
  itemCount: number
  /** Estimated row-height already occupied in the left section column. */
  leftUsedRows: number
  /** Estimated row-height already occupied in the right section column. */
  rightUsedRows: number
  /** Columns available when the items occupy only one side. */
  sideColumns: number
  /** Columns available when the items span the complete section width. */
  fullColumns: number
  /** Set false when a template requires its items below both columns. */
  allowSidePlacement?: boolean
}

export interface SectionLayoutDecision {
  placement: SectionLayoutPlacement
  columns: number
  rows: number
  spareRows: number
}

export interface SectionNumberFitOptions {
  /** Decimal places retained even when they are zero. */
  minimumDecimals?: number
  /** Maximum precision available when the final digit is significant. */
  maximumDecimals?: number
  /** Character budget above which the cell should use compact type. */
  characterBudget?: number
}

export interface SectionNumberFit {
  text: string
  decimals: number
  compact: boolean
}

function nonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0
}

function positiveInteger(value: number): number {
  return Math.max(1, Math.floor(nonNegative(value)))
}

function decimalPlaces(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(8, Math.max(0, Math.floor(value)))
}

/**
 * Fits a section-table number to its column without discarding useful survey
 * precision. Trailing zeroes are removed down to the normal precision; a real
 * extra decimal is retained and marked for compact type instead of overflowing.
 */
export function fitSectionNumber(
  value: number,
  options: SectionNumberFitOptions = {}
): SectionNumberFit {
  const minimumDecimals = decimalPlaces(options.minimumDecimals ?? 2, 2)
  const maximumDecimals = Math.max(
    minimumDecimals,
    decimalPlaces(options.maximumDecimals ?? 3, 3)
  )
  const characterBudget = positiveInteger(options.characterBudget ?? 6)
  const zeroThreshold = 0.5 * 10 ** -maximumDecimals
  const finiteValue = Number.isFinite(value) ? value : 0
  const printableValue = Math.abs(finiteValue) < zeroThreshold ? 0 : finiteValue
  let text = printableValue.toFixed(maximumDecimals)
  let decimals = maximumDecimals

  while (decimals > minimumDecimals && text.endsWith('0')) {
    text = text.slice(0, -1)
    decimals -= 1
  }

  return {
    text,
    decimals,
    compact: decimals > minimumDecimals || text.length > characterBudget
  }
}

/**
 * Uses a side column only when its unused height can hold the complete side
 * grid. Otherwise the items move below both columns and use the full width.
 */
export function chooseSectionItemLayout(
  budget: SectionLayoutBudget
): SectionLayoutDecision {
  const itemCount = Math.floor(nonNegative(budget.itemCount))
  const leftUsedRows = nonNegative(budget.leftUsedRows)
  const rightUsedRows = nonNegative(budget.rightUsedRows)
  const sideColumns = positiveInteger(budget.sideColumns)
  const fullColumns = positiveInteger(budget.fullColumns)
  const sideRows = itemCount === 0 ? 0 : Math.ceil(itemCount / sideColumns)
  const fullRows = itemCount === 0 ? 0 : Math.ceil(itemCount / fullColumns)
  const spareRows = Math.abs(leftUsedRows - rightUsedRows)
  const sideFits =
    budget.allowSidePlacement !== false &&
    itemCount > 0 &&
    spareRows >= sideRows

  if (sideFits) {
    return {
      placement: leftUsedRows <= rightUsedRows ? 'left' : 'right',
      columns: sideColumns,
      rows: sideRows,
      spareRows
    }
  }

  return {
    placement: 'full',
    columns: fullColumns,
    rows: fullRows,
    spareRows
  }
}
