/**
 * The arithmetic of a comparative statement, kept apart from the fetching.
 *
 * Pricing two years means two full dashboard syncs; comparing them is pure
 * subtraction over the results. Separating the two keeps the part that decides
 * what a sanctioning authority reads — which rows appear, what a variation is,
 * when a percentage is meaningless — testable without a network.
 */

import type { AbstractLine } from './projectAbstract'

export interface ComparativeRow {
  key: string
  slNo: number | null
  label: string
  /** Null when the row exists on one side only. */
  left: number | null
  right: number | null
  difference: number
  /** Null rather than a fabricated figure — see `variation`. */
  percent: number | null
  kind: 'item' | 'component' | 'total' | 'charge' | 'grand'
  unit?: string
  quantity?: number | null
  leftRate?: number | null
  rightRate?: number | null
  /** Only on item rows; a summary line has a label and nothing to describe. */
  description?: string
}

/**
 * What changed between the two columns.
 *
 * A percentage is only reported where there is a base to compare against. A row
 * that did not exist in the earlier year, or stood at zero, has no meaningful
 * percentage change: "+100%" and "∞" would both be inventions, and on a
 * statement that goes to a sanctioning authority an invented figure is worse
 * than a blank.
 */
export function variation(
  left: number | null,
  right: number | null
): { difference: number; percent: number | null } {
  const from = left ?? 0
  const to = right ?? 0
  const difference = to - from
  const percent = left === null || from === 0 ? null : (difference / Math.abs(from)) * 100
  return { difference, percent }
}

function abstractKind(kind: AbstractLine['kind']): ComparativeRow['kind'] {
  if (kind === 'grand') return 'grand'
  if (kind === 'total') return 'total'
  if (kind === 'component') return 'component'
  return 'charge'
}

/**
 * The General Abstract of both years, line for line.
 *
 * Rows are keyed, not positional, and a row carried by only one year still
 * appears — a charge introduced this year, or a component priced to nothing
 * under the old schedule. Dropping it would leave that column's rows failing to
 * add up to its own grand total, which is the first thing anyone checks.
 */
export function compareAbstractLines(
  leftLines: AbstractLine[],
  rightLines: AbstractLine[]
): ComparativeRow[] {
  const rightByKey = new Map(rightLines.map((line) => [line.key, line]))
  const seen = new Set<string>()
  const rows: ComparativeRow[] = []

  for (const line of leftLines) {
    seen.add(line.key)
    const counterpart = rightByKey.get(line.key)
    const right = counterpart ? counterpart.amount : null
    rows.push({
      key: line.key,
      slNo: line.slNo,
      label: line.label,
      left: line.amount,
      right,
      kind: abstractKind(line.kind),
      ...variation(line.amount, right)
    })
  }
  for (const line of rightLines) {
    if (seen.has(line.key)) continue
    rows.push({
      key: line.key,
      slNo: line.slNo,
      label: line.label,
      left: null,
      right: line.amount,
      kind: abstractKind(line.kind),
      ...variation(null, line.amount)
    })
  }
  return rows
}

/** One item, already priced in both years by the caller. */
export interface ComparativeItemInput {
  id: string
  label: string
  /** The published clause, printed under the code. */
  description?: string
  unit?: string
  quantity: number | null
  leftRate: number | null
  rightRate: number | null
  leftAmount: number | null
  rightAmount: number | null
}

export function compareItemRows(items: ComparativeItemInput[]): ComparativeRow[] {
  return items.map((item, index) => ({
    key: `item:${item.id}`,
    slNo: index + 1,
    label: item.label,
    description: item.description,
    left: item.leftAmount,
    right: item.rightAmount,
    kind: 'item' as const,
    unit: item.unit,
    // Quantities are the estimator's own and do not move with the schedule, so
    // one column serves both sides.
    quantity: item.quantity,
    leftRate: item.leftRate,
    rightRate: item.rightRate,
    ...variation(item.leftAmount, item.rightAmount)
  }))
}

export function totalOf(rows: ComparativeRow[], side: 'left' | 'right'): number {
  return rows.reduce((sum, row) => sum + (row[side] ?? 0), 0)
}
