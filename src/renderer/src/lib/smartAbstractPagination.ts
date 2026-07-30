/**
 * Shared pagination policy for project, component and sub-component abstracts.
 *
 * The caller supplies measured (or conservatively estimated) row heights and
 * page capacities. This module owns the document rules: totals stay with the
 * row before them, a continuation is never left with one lonely detail row,
 * and a slightly denser profile is used only when it removes that orphan.
 */

export type AbstractDensity = 'normal' | 'compact' | 'tight'

export interface SmartAbstractRow<T> {
  value: T
  height: number
  /** True for an ordinary item/provision rather than a total row. */
  detail: boolean
  /** Totals must not become the first row of a continuation page. */
  keepWithPrevious?: boolean
}

export interface SmartAbstractCapacities {
  first: number
  continuation: number
  finalFirst: number
  finalContinuation: number
}

export interface SmartAbstractPage<T> {
  rows: SmartAbstractRow<T>[]
  isContinuation: boolean
  isFinal: boolean
}

export interface SmartAbstractPlan<T> {
  density: AbstractDensity
  pages: SmartAbstractPage<T>[]
  /** The raw greedy split had a one-detail-row continuation. */
  avoidedOrphan: boolean
}

export interface SmartAbstractProfile<T> {
  density: AbstractDensity
  rows: SmartAbstractRow<T>[]
  capacities: SmartAbstractCapacities
}

// A continuation with only one or two provisions looks accidental and wastes
// most of the sheet. Carry a small balanced tail forward whenever it fits.
const MIN_FINAL_DETAIL_ROWS = 4
const MIN_FINAL_ROWS = 5

function rowsHeight<T>(rows: SmartAbstractRow<T>[]): number {
  return rows.reduce((sum, row) => sum + Math.max(1, row.height), 0)
}

function finalCapacity(capacities: SmartAbstractCapacities, pageIndex: number): number {
  return pageIndex === 0 ? capacities.finalFirst : capacities.finalContinuation
}

function flowCapacity(capacities: SmartAbstractCapacities, pageIndex: number): number {
  return pageIndex === 0 ? capacities.first : capacities.continuation
}

function rawPages<T>(
  rows: SmartAbstractRow<T>[],
  capacities: SmartAbstractCapacities
): { pages: SmartAbstractRow<T>[][]; forcedFinalTail: boolean } {
  if (rows.length === 0) return { pages: [[]], forcedFinalTail: false }
  const pages: SmartAbstractRow<T>[][] = []
  let remaining = [...rows]
  let forcedFinalTail = false

  while (remaining.length > 0) {
    const pageIndex = pages.length
    if (rowsHeight(remaining) <= finalCapacity(capacities, pageIndex)) {
      pages.push(remaining)
      break
    }

    const capacity = flowCapacity(capacities, pageIndex)
    const page: SmartAbstractRow<T>[] = []
    let used = 0
    while (remaining.length > 0) {
      const candidate = remaining[0]
      const nextHeight = used + Math.max(1, candidate.height)
      if (page.length > 0 && nextHeight > capacity) break
      page.push(candidate)
      remaining.shift()
      used = nextHeight
    }

    // If the next row is a total, carry one ordinary row forward with it.
    // This is the table equivalent of widows/orphans control.
    if (remaining[0]?.keepWithPrevious && page.length > 1) {
      remaining.unshift(page.pop()!)
    }

    // The flow capacity is intentionally larger than the final-page capacity
    // because the latter reserves totals and signatures. Never consume every
    // row into that larger space: leave a useful tail for the measured final
    // page instead of creating a hidden signature overflow.
    if (remaining.length === 0 && page.length > 1) {
      forcedFinalTail = true
      const tail: SmartAbstractRow<T>[] = []
      const nextFinalCapacity = capacities.finalContinuation
      while (page.length > 1 && tail.length < MIN_FINAL_ROWS) {
        const candidate = page[page.length - 1]
        if (tail.length > 0 && rowsHeight(tail) + candidate.height > nextFinalCapacity) break
        tail.unshift(page.pop()!)
      }
      if (tail.length === 0) tail.unshift(page.pop()!)
      remaining = tail
    }
    pages.push(page)
  }

  return { pages, forcedFinalTail }
}

function finalIsOrphan<T>(pages: SmartAbstractRow<T>[][]): boolean {
  if (pages.length <= 1) return false
  const final = pages[pages.length - 1]
  const detailCount = final.filter((row) => row.detail).length
  return detailCount < MIN_FINAL_DETAIL_ROWS || final.length < MIN_FINAL_ROWS
}

function rebalanceFinalPage<T>(
  sourcePages: SmartAbstractRow<T>[][],
  capacities: SmartAbstractCapacities
): SmartAbstractRow<T>[][] {
  const pages = sourcePages.map((page) => [...page])
  if (pages.length <= 1) return pages
  const final = pages[pages.length - 1]
  const previous = pages[pages.length - 2]
  const capacity = finalCapacity(capacities, pages.length - 1)

  const finalNeedsRows = (): boolean =>
    final.filter((row) => row.detail).length < MIN_FINAL_DETAIL_ROWS ||
    final.length < MIN_FINAL_ROWS ||
    final[0]?.keepWithPrevious === true

  while (finalNeedsRows() && previous.length > 1) {
    const candidate = previous[previous.length - 1]
    if (rowsHeight(final) + candidate.height > capacity) break
    final.unshift(previous.pop()!)
  }
  return pages
}

function planForProfile<T>(profile: SmartAbstractProfile<T>): SmartAbstractPlan<T> {
  const raw = rawPages(profile.rows, profile.capacities)
  const orphan = raw.forcedFinalTail || finalIsOrphan(raw.pages)
  const balanced = rebalanceFinalPage(raw.pages, profile.capacities)
  return {
    density: profile.density,
    pages: balanced.map((rows, index) => ({
      rows,
      isContinuation: index > 0,
      isFinal: index === balanced.length - 1
    })),
    avoidedOrphan: orphan
  }
}

/**
 * Prefer normal typography. A compact profile is selected only when the
 * preceding profile produced an orphan and the denser profile removes a page
 * or removes the orphan. This prevents needless shrinking on ordinary sheets.
 */
export function chooseSmartAbstractPlan<T>(
  profiles: SmartAbstractProfile<T>[]
): SmartAbstractPlan<T> {
  if (profiles.length === 0) {
    return { density: 'normal', pages: [], avoidedOrphan: false }
  }
  let chosen = planForProfile(profiles[0])
  for (const profile of profiles.slice(1)) {
    if (!chosen.avoidedOrphan) break
    const candidate = planForProfile(profile)
    const removesPage = candidate.pages.length < chosen.pages.length
    const removesOrphan = !candidate.avoidedOrphan
    if (removesPage || removesOrphan) chosen = candidate
  }
  return chosen
}
