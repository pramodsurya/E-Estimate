/**
 * Schedule ordering shared by the Component Abstract and the BOQ.
 *
 * Flow: jungle clearance first, then excavation, then any other code,
 * then SOR codes last.
 *
 * - Clearance band: the whole IRR-PMW-1 chapter (1-1 thin jungle, 1-2 thick
 *   jungle, 1-3..1-16 stumps/bamboo/jauliflora/tree-cutting/marshy) followed
 *   by IRR-PMW-3-20(a)-(f) weed removal. Numeric-aware code order puts 1-1
 *   and 1-2 first naturally.
 * - Excavation band: the 32 SSR descriptions beginning with "Excavation"
 *   (CAW-1-1..12, CCDW-1-1/3/4/5/6/7, DAW-1-1..7, TAW-1-1..5, PMW-3-15/16)
 *   plus PMW-2-1/2-2 trial-pit earthwork and CCDW-1-2 foundation earthwork.
 *   Embankment/filling items that merely mention excavation stay in Any.
 * - SOR band: anything attached through the SOR catalogue (itemSource SOR).
 */

import type { ProjectNode } from '../types/project'

/**
 * 0 = clearance, 1 = excavation, 2 = any, 3 = SOR.
 *
 * A present code always decides (deterministic SSR identity — this also keeps
 * jungle-wood material codes like TAW-3-5 out of the clearance band). The
 * description text decides only for codeless items: clearance on
 * "jungle"/"clearing", excavation on a leading "Excavat…" or
 * "earth (work in) excavation".
 */
export function scheduleBand(node: ProjectNode): number {
  if (node.itemSource === 'SOR') return 3
  const code = (node.itemCode ?? '').trim().toUpperCase()
  if (!code) {
    const text = `${node.itemDescription ?? ''} ${node.name ?? ''}`.toLowerCase()
    if (text.includes('jungle') || text.includes('clearing')) return 0
    if (/^\s*excavat/.test(text) || text.includes('earthwork excavation') || text.includes('earth work in excavation')) return 1
    return 2
  }
  if (/(^|-)PMW-1-\d+$/.test(code) || /(^|-)PMW-3-20\([A-F]\)$/.test(code)) return 0
  if (EXCAVATION_CODES.has(code)) return 1
  return 2
}

function range(from: number, to: number): number[] {
  const out: number[] = []
  for (let n = from; n <= to; n++) out.push(n)
  return out
}

/** Confirmed excavation set (Supabase ssr_item, verified against descriptions). */
const EXCAVATION_CODES = new Set<string>([
  ...range(1, 12).map((n) => `IRR-CAW-1-${n}`),
  ...[1, 3, 4, 5, 6, 7].map((n) => `IRR-CCDW-1-${n}`),
  ...range(1, 7).map((n) => `IRR-DAW-1-${n}`),
  ...range(1, 5).map((n) => `IRR-TAW-1-${n}`),
  'IRR-PMW-3-15',
  'IRR-PMW-3-16',
  'IRR-PMW-2-1',
  'IRR-PMW-2-2',
  'IRR-CCDW-1-2'
])

type CodeChunk = string | number

function splitCode(code: string): CodeChunk[] {
  return code
    .toUpperCase()
    .split(/(\d+)/)
    .filter((part) => part !== '')
    .map((part) => (/^\d+$/.test(part) ? Number(part) : part))
}

/** Numeric-aware code order: PMW-1-2 sorts before PMW-1-10. */
export function compareScheduleCodes(aCode: string, bCode: string): number {
  const a = (aCode ?? '').trim()
  const b = (bCode ?? '').trim()
  if (!a && !b) return 0
  if (!a) return 1
  if (!b) return -1
  const ac = splitCode(a)
  const bc = splitCode(b)
  for (let i = 0; i < Math.max(ac.length, bc.length); i++) {
    const x = ac[i]
    const y = bc[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    if (typeof x === 'number' && typeof y === 'number') {
      if (x !== y) return x - y
    } else {
      const xs = String(x)
      const ys = String(y)
      if (xs !== ys) return xs < ys ? -1 : 1
    }
  }
  return 0
}

function compareScheduleNodes(a: ProjectNode, b: ProjectNode): number {
  const band = scheduleBand(a) - scheduleBand(b)
  if (band !== 0) return band
  return compareScheduleCodes(a.itemCode ?? '', b.itemCode ?? '')
}

/** Stable schedule sort: band first, then numeric-aware code order. */
export function sortScheduleItems(items: ProjectNode[]): ProjectNode[] {
  return items
    .map((node, index) => ({ node, index }))
    .sort((a, b) => compareScheduleNodes(a.node, b.node) || a.index - b.index)
    .map((entry) => entry.node)
}
