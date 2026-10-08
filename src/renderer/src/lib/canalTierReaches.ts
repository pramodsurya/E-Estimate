import type { CanalBankReach, CanalBankTier, CanalData, CanalSection } from '../types/project'
import { canalBedLevelAt, canalSectionDepth, canalSectionBankSignedHeight } from './canal'

export type CanalTierReachStatus = 'fill' | 'cut' | 'level' | 'unassigned' | 'missing'

/** Kilometres, limited to three decimal places (one metre). */
export function formatCanalReachChainage(chainage: number): string {
  if (!Number.isFinite(chainage)) return '—'
  return `Km ${(Math.max(0, chainage) / 1000).toFixed(3)}`
}

/** Keep displayed lengths consistent with their displayed whole-metre endpoints. */
export function canalReachDisplayLength(from: number, to: number): number {
  return Math.max(0, Math.round(to) - Math.round(from))
}

export interface CanalTierInterval {
  from: number
  to: number
  fromTopRl: number | null
  toTopRl: number | null
  fromBankTopRl: number | null
  toBankTopRl: number | null
  /** Positive fill; negative ground above bank top. */
  fromHeight: number | null
  toHeight: number | null
}

export interface CanalTierReach {
  from: number
  to: number
  tierId: string | null
  status: CanalTierReachStatus
  minHeight: number | null
  maxHeight: number | null
  /** Preserve every chainage interval within the continuous reach. */
  intervals: CanalTierInterval[]
}

/**
 * Partition using entered chainage intervals. The starting station's height
 * assigns its interval; a new tier starts at the next entered station where
 * its class changes. Missing levels and uninvestigated ends remain explicit.
 * Never turn a negative height into a positive bund height.
 */
export function canalTierReaches(data: CanalData, sections: CanalSection[], tiers: CanalBankTier[]): CanalTierReach[] {
  const byChainage = new Map<number, number | null>()
  const end = Number.isFinite(data.lengthM) && data.lengthM > 0
    ? data.lengthM : Math.max(0, ...sections.filter(s => Number.isFinite(s.chainage)).map(s => s.chainage))
  const conflicts = new Set<number>()
  for (const section of sections) {
    const ch = section.chainage
    if (!Number.isFinite(ch) || ch < 0 || ch > end) continue
    const top = Number.isFinite(section.strataTopRl) ? section.strataTopRl! : null
    const previous = byChainage.get(ch)
    if (top != null && previous != null && Math.abs(top - previous) > 1e-9) conflicts.add(ch)
    // An empty generated duplicate must not replace an investigation entry.
    if (!byChainage.has(ch) || top != null) byChainage.set(ch, top)
  }
  for (const ch of conflicts) byChainage.set(ch, null)
  if (!byChainage.has(0)) byChainage.set(0, null)
  if (!byChainage.has(end)) byChainage.set(end, null)
  const points = [...byChainage].sort(([a], [b]) => a - b).map(([ch, top]) => {
    const bed = canalBedLevelAt(data, ch)
    const bank = bed == null ? null : bed + canalSectionDepth(data.design)
    return { ch, top, bank: bank != null && Number.isFinite(bank) ? bank : null }
  })
  const brackets = [...tiers].sort((a, b) => a.minFillHeight - b.minFillHeight)
  // The app stores the unbounded top tier as 9999.
  const ceiling = (tier: CanalBankTier): number => tier.maxFillHeight === 9999 ? Infinity : tier.maxFillHeight
  const reaches: CanalTierReach[] = []
  const append = (interval: CanalTierInterval, status: CanalTierReachStatus, tierId: string | null): void => {
    // The To station belongs to the following interval and may already be cutting.
    const heights = [interval.fromHeight].filter((h): h is number => h != null)
    const minHeight = heights.length ? Math.min(...heights) : null
    const maxHeight = heights.length ? Math.max(...heights) : null
    const last = reaches[reaches.length - 1]
    if (last && last.tierId === tierId && last.status === status && last.to === interval.from) {
      last.to = interval.to
      last.intervals.push(interval)
      if (minHeight != null) last.minHeight = Math.min(last.minHeight ?? minHeight, minHeight)
      if (maxHeight != null) last.maxHeight = Math.max(last.maxHeight ?? maxHeight, maxHeight)
    } else reaches.push({ from: interval.from, to: interval.to, tierId, status, minHeight, maxHeight, intervals: [interval] })
  }
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i]
    const ha = a.bank != null && a.top != null ? a.bank - a.top : null
    const hb = b.bank != null && b.top != null ? b.bank - b.top : null
    if (ha == null || hb == null) {
      append({ from: a.ch, to: b.ch, fromTopRl: a.top, toTopRl: b.top, fromBankTopRl: a.bank, toBankTopRl: b.bank, fromHeight: ha, toHeight: hb }, 'missing', null)
      continue
    }
    const tier = ha > 0 ? brackets.find(t => ha >= t.minFillHeight && ha < ceiling(t)) : undefined
    const status = ha < 0 ? 'cut' : ha === 0 ? 'level' : tier ? 'fill' : 'unassigned'
    append({ from: a.ch, to: b.ch, fromTopRl: a.top, toTopRl: b.top, fromBankTopRl: a.bank, toBankTopRl: b.bank, fromHeight: ha, toHeight: hb }, status, tier?.id ?? null)
  }
  return reaches
}

export type CanalAssignedBankReach = CanalTierReach & { id: string }

export function canalBankReachStations(data: CanalData): number[] {
  return [...new Set([0, data.lengthM, ...data.sections.map(s => s.chainage)])]
    .filter(ch => Number.isFinite(ch) && ch >= 0 && ch <= data.lengthM).sort((a, b) => a - b)
}

/** Align older interpolated programmatic boundaries to the next entered station. */
export function alignCanalBankReachAssignments(data: CanalData, rows: CanalBankReach[]): CanalBankReach[] {
  if (data.design.bankConfig?.mode !== 'tiered') return rows
  const stations = canalBankReachStations(data)
  const stationAt = (ch: number): number => stations.find(s => s >= ch - 1e-7) ?? data.lengthM
  return rows.map(row => ({ ...row, from: stationAt(row.from), to: stationAt(row.to) })).filter(row => row.to > row.from)
}

export function canalBankReachAssignments(data: CanalData, side: 'left' | 'right'): CanalBankReach[] | undefined {
  const config = data.design.bankConfig
  const bank = config?.linkSymmetrical ? 'left' : side
  return config?.mode === 'manual'
    ? (bank === 'left' ? config.leftManualReaches ?? [] : config.rightManualReaches ?? [])
    : (bank === 'left' ? config?.leftReachOverrides : config?.rightReachOverrides)
}

/** Datum partition before any user assignments, also used to guard reach edits. */
export function canalAutomaticBankReaches(data: CanalData, side: 'left' | 'right'): CanalTierReach[] {
  const config = data.design.bankConfig
  if (!config) return []
  const tiers = config.linkSymmetrical || side === 'left' ? config.leftTiers : config.rightTiers
  const sections = data.sections.map(s => {
    if (Number.isFinite(s.strataTopRl)) return s
    const bed = canalBedLevelAt(data, s.chainage)
    return { ...s, strataTopRl: bed == null || s.designPopulated === false || s.ground.length < 2 ? undefined : bed + canalSectionDepth(data.design) - canalSectionBankSignedHeight(data, s, side) }
  })
  return canalTierReaches(data, sections, tiers)
}

/** A mixed reach is eligible when some measured span has positive bank height. */
function hasPositiveBankHeight(physical: CanalTierReach[], row: Pick<CanalBankReach, 'from' | 'to'>): boolean {
  return physical.some(reach => reach.intervals.some(interval => {
    const from = Math.max(row.from, interval.from), to = Math.min(row.to, interval.to)
    if (to <= from || interval.fromHeight == null || interval.toHeight == null) return false
    const at = (ch: number): number => interval.fromHeight! + (interval.toHeight! - interval.fromHeight!) * (ch - interval.from) / (interval.to - interval.from)
    return Math.max(at(from), at(to)) > 0
  }))
}

/** Validate all assignments together: no reversed, overlapping or out-of-alignment ranges. */
export function validateCanalBankReaches(data: CanalData, side: 'left' | 'right', rows: CanalBankReach[]): string | null {
  const config = data.design.bankConfig
  const tiers = config?.linkSymmetrical || side === 'left' ? config?.leftTiers : config?.rightTiers
  const ids = new Set<string>()
  const stations = config?.mode === 'tiered' ? new Set(canalBankReachStations(data)) : null
  const physical = config?.mode === 'tiered' ? canalAutomaticBankReaches(data, side) : []
  const sorted = [...rows].sort((a, b) => a.from - b.from)
  for (let i = 0; i < sorted.length; i++) {
    const row = sorted[i]
    if (ids.has(row.id)) return 'Each reach must have a unique identifier.'
    ids.add(row.id)
    if (!Number.isFinite(row.from) || !Number.isFinite(row.to) || row.from < 0 || row.to > data.lengthM || row.to <= row.from) return 'Enter From Ch below To Ch, within the canal length.'
    if (stations && (!stations.has(row.from) || !stations.has(row.to))) return 'Choose From Ch and To Ch from the entered Soil Strata or Sections chainages.'
    if (i && sorted[i - 1].to > row.from + 1e-7) return 'Reaches cannot overlap. Adjust the adjoining reach boundary first.'
    if (row.status === 'fill' && !tiers?.some(t => t.id === row.tierId)) return 'Select an existing bank profile for every fill reach.'
    if (row.status !== 'fill' && row.tierId != null) return 'Only fill reaches can have a bank profile.'
    if (row.status === 'fill' && config?.mode === 'tiered') {
      const overlaps = physical.filter(r => r.from < row.to && r.to > row.from)
      const missing = overlaps.find(r => r.status === 'missing')
      if (missing) {
        const range = `${formatCanalReachChainage(Math.max(row.from, missing.from))} → ${formatCanalReachChainage(Math.min(row.to, missing.to))}`
        return `Levels are missing for ${range}. Enter Top RL in Soil Strata or Ground RL in Sections before assigning a bund.`
      }
      if (!hasPositiveBankHeight(overlaps, row)) {
        const range = `${formatCanalReachChainage(row.from)} → ${formatCanalReachChainage(row.to)}`
        return overlaps.some(r => r.status === 'cut')
          ? `This reach is in pure cutting (${range}). Set the correct Top RL in Soil Strata or Ground RL in Sections before assigning a bund.`
          : `This reach has no positive bund height (${range}). Check Top RL in Soil Strata or Ground RL in Sections.`
      }
    }
  }
  return null
}

/** Replace a range and trim every overlapping neighbour, keeping all tiers exclusive. */
export function assignCanalBankReach(data: CanalData, side: 'left' | 'right', rows: CanalBankReach[], updated: CanalBankReach): { rows: CanalBankReach[]; error: string | null } {
  const ownError = validateCanalBankReaches(data, side, [updated])
  if (ownError) return { rows, error: ownError }
  const original = rows.find(r => r.id === updated.id)
  const remaining = rows.filter(r => r.id !== updated.id).map(row => {
    if (original && updated.from > original.from && Math.abs(row.to - original.from) < 1e-7) return { ...row, to: updated.from }
    if (original && updated.to < original.to && Math.abs(row.from - original.to) < 1e-7) return { ...row, from: updated.to }
    return row
  })
  const next = remaining.flatMap(row => {
    if (row.to <= updated.from || row.from >= updated.to) return [row]
    return [row.from < updated.from ? { ...row, to: updated.from } : null,
      row.to > updated.to ? { ...row, id: row.from < updated.from ? `${row.id}-after-${updated.to}` : row.id, from: updated.to } : null]
      .filter((r): r is CanalBankReach => r !== null)
  })
  next.push(updated)
  next.sort((a, b) => a.from - b.from)
  const error = validateCanalBankReaches(data, side, next)
  return { rows: error ? rows : next, error }
}

/** Moving a shared endpoint adjusts adjoining reaches, including fully consumed ones. */
export function editCanalBankReach(data: CanalData, side: 'left' | 'right', rows: CanalBankReach[], id: string, patch: Partial<CanalBankReach>): { rows: CanalBankReach[]; error: string | null } {
  const original = rows.find(r => r.id === id)
  if (!original) return { rows, error: 'The reach no longer exists.' }
  return assignCanalBankReach(data, side, rows, { ...original, ...patch, id })
}

const reachCache = new WeakMap<CanalData, Map<string, { sections: CanalSection[]; design: CanalData['design']; length: number; reaches: CanalAssignedBankReach[] }>>()

/** Single source of chainage boundaries, used by every bank chapter and measurement. */
export function canalBankReaches(data: CanalData, side: 'left' | 'right'): CanalAssignedBankReach[] {
  const config = data.design.bankConfig
  if (!config || config.mode === 'legacy') return []
  let cache = reachCache.get(data)
  if (!cache) { cache = new Map(); reachCache.set(data, cache) }
  const cached = cache.get(side)
  if (cached?.sections === data.sections && cached.design === data.design && cached.length === data.lengthM) return cached.reaches
  const tiers = config.linkSymmetrical || side === 'left' ? config.leftTiers : config.rightTiers
  const base = config.mode === 'manual' ? canalTierReaches(data, data.sections, tiers) : canalAutomaticBankReaches(data, side)
  const saved = canalBankReachAssignments(data, side)
  let reaches: CanalAssignedBankReach[]
  if (saved === undefined) reaches = base.map((r, i) => ({ ...r, id: `auto-${side}-${i}` }))
  else {
    const assigned = [...alignCanalBankReachAssignments(data, saved)].sort((a, b) => a.from - b.from)
    const ranges: CanalBankReach[] = []
    let cursor = 0
    for (const row of assigned) {
      if (row.from > cursor) ranges.push({ id: `gap-${side}-${cursor}`, from: cursor, to: row.from, tierId: null, status: 'unassigned' })
      ranges.push(row.status === 'fill' && !tiers.some(t => t.id === row.tierId) ? { ...row, tierId: null, status: 'unassigned' } : row)
      cursor = row.to
    }
    if (cursor < data.lengthM) ranges.push({ id: `gap-${side}-${cursor}`, from: cursor, to: data.lengthM, tierId: null, status: 'unassigned' })
    // Preserve mixed fill/cut assignments; a pure-cut reach cannot retain a bund.
    const guarded = config.mode === 'manual' ? ranges : ranges.flatMap(row => {
      const overlaps = base.filter(r => r.from < row.to && r.to > row.from)
      if (row.status === 'fill' && !overlaps.some(r => r.status === 'missing') && hasPositiveBankHeight(overlaps, row)) return [row]
      const parts: CanalBankReach[] = []
      for (const physical of base) {
        const from = Math.max(row.from, physical.from), to = Math.min(row.to, physical.to)
        if (to <= from) continue
        const positive = physical.status === 'fill' || physical.status === 'unassigned'
        const status = positive ? row.status === 'fill' ? 'fill' : 'unassigned' : physical.status
        const tierId = status === 'fill' ? row.tierId : null
        const last = parts[parts.length - 1]
        if (last && last.to === from && last.status === status && last.tierId === tierId) last.to = to
        else parts.push({ id: parts.length ? `${row.id}-at-${from}` : row.id, from, to, tierId, status })
      }
      return parts
    })
    reaches = guarded.map(row => {
      const intervals = base.flatMap(r => r.intervals).flatMap(interval => {
        const from = Math.max(interval.from, row.from), to = Math.min(interval.to, row.to)
        if (to <= from) return []
        const at = (a: number | null, b: number | null, ch: number): number | null => a == null || b == null ? null : a + (b - a) * (ch - interval.from) / (interval.to - interval.from)
        return [{ from, to,
          fromTopRl: at(interval.fromTopRl, interval.toTopRl, from), toTopRl: at(interval.fromTopRl, interval.toTopRl, to),
          fromBankTopRl: at(interval.fromBankTopRl, interval.toBankTopRl, from), toBankTopRl: at(interval.fromBankTopRl, interval.toBankTopRl, to),
          fromHeight: at(interval.fromHeight, interval.toHeight, from), toHeight: at(interval.fromHeight, interval.toHeight, to) }]
      })
      const heights = intervals.flatMap(i => [i.fromHeight, i.toHeight]).filter((h): h is number => h != null)
      return { ...row, intervals, minHeight: heights.length ? Math.min(...heights) : null, maxHeight: heights.length ? Math.max(...heights) : null }
    })
  }
  cache.set(side, { sections: data.sections, design: data.design, length: data.lengthM, reaches })
  return reaches
}

export function canalBankReachAt(data: CanalData, chainage: number, side: 'left' | 'right'): CanalAssignedBankReach | undefined {
  // Half-open intervals; the final endpoint belongs to the last reach.
  return canalBankReaches(data, side).find(r => chainage >= r.from && (chainage < r.to || chainage === data.lengthM && r.to === data.lengthM))
}
