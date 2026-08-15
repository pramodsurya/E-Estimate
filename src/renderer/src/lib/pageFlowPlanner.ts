/**
 * Document-aware page planner.
 *
 * The old rule was "fill the page, then patch the end". That produces the
 * failure everyone recognises: a sheet whose last page carries one lonely row,
 * no heading above it and no signatures below it.
 *
 * This planner instead knows three things about a page, and every rule here is
 * one of those three written down as arithmetic:
 *
 *  1. A page has a ROLE. An opening page carries the subject heading and
 *     description; a continuation repeats only a short "contd." lead; the
 *     closing page is the one that must reserve room for totals and the
 *     signature block. Nothing else repeats, so nothing else is reserved.
 *  2. Content FLOWS. Blocks are one continuous run, not per-subject silos. A
 *     subject heading is itself a block that must keep with what follows, so a
 *     short subject may legitimately share a sheet with the next one instead of
 *     claiming a page of its own.
 *  3. A page that is nearly empty looks accidental. Emptiness is therefore a
 *     cost, not an afterthought — and because the planner optimises the whole
 *     flow at once, relieving a thin last page automatically loosens the pages
 *     before it. That backward recalibration is the point.
 *
 * Page count is minimised first and is never traded away for looks: a plan with
 * fewer sheets always beats a prettier plan with more. Balance is chosen only
 * among the plans that use the minimum number of sheets.
 */

export type FlowDensity = 'normal' | 'compact' | 'tight'

export interface FlowBlock<T> {
  value: T
  /** Laid-out height in px, already multiplied by any zoom/scale. */
  height: number
  /** Headings and totals are not "content"; a page of them alone is empty. */
  detail?: boolean
  /** A total must never open a page — its detail rows sit above it. */
  keepWithPrevious?: boolean
  /** A heading must never close a page — its rows sit below it. */
  keepWithNext?: boolean
}

export type PageRole = 'only' | 'first' | 'middle' | 'last'

export interface FlowPage<T> {
  blocks: FlowBlock<T>[]
  role: PageRole
  /** Usable height for this page after its role's reserves. */
  capacity: number
  used: number
  /** 0..1 — how full the sheet reads to a person holding it. */
  fill: number
  /** Continuations repeat the short subject lead and the column headers. */
  repeatsLead: boolean
  /** Only the closing page carries totals and the signature block. */
  carriesClosing: boolean
}

export interface FlowGeometry {
  /** Usable content height of a bare page, in px. */
  body: number
  /** Height the opening page loses to the full heading + description. */
  opening?: number
  /** Height each continuation loses to the repeated "contd." lead. */
  continuationLead?: number
  /** Height the closing page must reserve for totals + signatures. */
  closing?: number
}

export interface FlowProfile<T> {
  density: FlowDensity
  blocks: FlowBlock<T>[]
  geometry: FlowGeometry
}

export interface FlowPlan<T> {
  density: FlowDensity
  pages: FlowPage<T>[]
  /** A page in this plan still reads as empty or stranded. */
  hasSparsePage: boolean
}

/** A sheet holding fewer than this many real rows reads as a mistake. */
const MIN_DETAIL_BLOCKS = 3
/** A sheet under this fraction of its usable height reads as blank. */
const MIN_FILL = 0.22

const SPARSE_PENALTY = 1e7
const KEEP_PENALTY = 1e9
const OVERFLOW_PENALTY = 1e11
/** Scales slack² into the same units as the penalties above. */
const BALANCE_WEIGHT = 1e4

interface Solution {
  pages: number
  cost: number
  /** Index at which the page starting here ends. */
  next: number
}

function pageCapacity(geometry: FlowGeometry, isFirst: boolean, isLast: boolean): number {
  const lead = isFirst ? (geometry.opening ?? 0) : (geometry.continuationLead ?? 0)
  const closing = isLast ? (geometry.closing ?? 0) : 0
  return Math.max(1, geometry.body - lead - closing)
}

function blockHeight<T>(block: FlowBlock<T>): number {
  return Math.max(1, block.height)
}

/**
 * What one page costs. Slack is squared so the solver spreads content evenly
 * rather than cramming the early sheets and starving the last one; the discrete
 * penalties above it are large enough that no amount of balance buys a stranded
 * total or an empty sheet.
 */
function pageCost<T>(
  blocks: FlowBlock<T>[],
  used: number,
  capacity: number,
  isOnlyPage: boolean,
  isLastPage: boolean
): number {
  let cost = 0

  if (used > capacity) {
    cost += OVERFLOW_PENALTY + (used - capacity)
  }

  const slack = Math.max(0, capacity - used)
  const fill = capacity > 0 ? Math.min(1, used / capacity) : 1
  cost += BALANCE_WEIGHT * (slack / capacity) ** 2

  if (!isOnlyPage) {
    const detail = blocks.filter((block) => block.detail !== false).length
    if (detail < MIN_DETAIL_BLOCKS || fill < MIN_FILL) cost += SPARSE_PENALTY
  }

  if (blocks[0]?.keepWithPrevious) cost += KEEP_PENALTY
  if (!isLastPage && blocks[blocks.length - 1]?.keepWithNext) cost += KEEP_PENALTY

  return cost
}

function better(a: Solution, b: Solution): Solution {
  if (a.pages !== b.pages) return a.pages < b.pages ? a : b
  return a.cost <= b.cost ? a : b
}

/**
 * Minimum sheets first, best-looking arrangement second. Solved over the whole
 * flow at once (memoised on "start index x is this the opening page"), which is
 * what lets a thin final page push rows back onto pages that were already laid
 * out — the recalibration a greedy fill can never do.
 */
function solveProfile<T>(profile: FlowProfile<T>): FlowPlan<T> {
  const { blocks, geometry } = profile
  const count = blocks.length
  if (count === 0) {
    return { density: profile.density, pages: [], hasSparsePage: false }
  }

  const memo = new Map<string, Solution>()

  const solve = (start: number, isFirst: boolean): Solution => {
    if (start >= count) return { pages: 0, cost: 0, next: start }
    const key = `${start}:${isFirst ? 1 : 0}`
    const cached = memo.get(key)
    if (cached) return cached

    // Placeholder guards against the self-reference a malformed flow could
    // otherwise create while this state is still being solved.
    memo.set(key, { pages: count + 1, cost: OVERFLOW_PENALTY * count, next: start + 1 })

    let best: Solution | null = null
    let used = 0

    for (let end = start + 1; end <= count; end += 1) {
      used += blockHeight(blocks[end - 1])
      const isLast = end === count
      const capacity = pageCapacity(geometry, isFirst, isLast)
      // Once a page overflows, adding further blocks only makes it worse — but
      // a single oversized block still has to land somewhere.
      if (used > capacity && end > start + 1) break

      const page = blocks.slice(start, end)
      const rest = solve(end, false)
      const candidate: Solution = {
        pages: 1 + rest.pages,
        cost:
          pageCost(page, used, capacity, isFirst && isLast, isLast) + rest.cost,
        next: end
      }
      best = best ? better(best, candidate) : candidate
    }

    const resolved = best ?? { pages: 1, cost: OVERFLOW_PENALTY, next: count }
    memo.set(key, resolved)
    return resolved
  }

  const pages: FlowPage<T>[] = []
  let cursor = 0
  let first = true
  while (cursor < count) {
    const step = solve(cursor, first)
    const end = Math.max(cursor + 1, step.next)
    const slice = blocks.slice(cursor, end)
    const isLast = end >= count
    const capacity = pageCapacity(geometry, first, isLast)
    const used = slice.reduce((sum, block) => sum + blockHeight(block), 0)
    pages.push({
      blocks: slice,
      role: 'middle',
      capacity,
      used,
      fill: capacity > 0 ? Math.min(1, used / capacity) : 1,
      repeatsLead: !first,
      carriesClosing: isLast
    })
    cursor = end
    first = false
  }

  for (let index = 0; index < pages.length; index += 1) {
    const only = pages.length === 1
    pages[index].role = only
      ? 'only'
      : index === 0
        ? 'first'
        : index === pages.length - 1
          ? 'last'
          : 'middle'
  }

  const hasSparsePage = pages.some((page) => {
    if (page.role === 'only') return false
    const detail = page.blocks.filter((block) => block.detail !== false).length
    return detail < MIN_DETAIL_BLOCKS || page.fill < MIN_FILL
  })

  return { density: profile.density, pages, hasSparsePage }
}

/**
 * Prefer normal typography. A denser profile is accepted only when it saves a
 * sheet or rescues a page that still reads as empty, so ordinary documents are
 * never shrunk for no reason.
 */
export function planPageFlow<T>(profiles: FlowProfile<T>[]): FlowPlan<T> {
  if (profiles.length === 0) {
    return { density: 'normal', pages: [], hasSparsePage: false }
  }
  let chosen = solveProfile(profiles[0])
  for (const profile of profiles.slice(1)) {
    if (!chosen.hasSparsePage) break
    const candidate = solveProfile(profile)
    const savesPage = candidate.pages.length < chosen.pages.length
    if (savesPage || !candidate.hasSparsePage) chosen = candidate
  }
  return chosen
}
