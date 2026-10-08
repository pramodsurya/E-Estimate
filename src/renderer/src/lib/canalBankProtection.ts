import type { CanalBankProtectionConfig, CanalBankReachProtection, CanalData, CanalPoint, CanalSection } from '../types/project'
import { canalGroundLevelAt, canalSectionBankTier, canalSideProfile, orderedCanalSections } from './canal'
import { BANK_PROTECTION_ITEMS } from './canalBankProtectionCatalogue'
import { canalBankReachAt, canalBankReaches, type CanalAssignedBankReach } from './canalTierReaches'

export const defaultBankProtection = (): CanalBankProtectionConfig => ({ kind: 'none', stone: 'rubble', bedding: 'dry', thickness: 0.25, headers: true, sand: true })

function matchesReach(row: CanalBankReachProtection, mode: string, reach: CanalAssignedBankReach): boolean {
  if (row.mode !== mode) return false
  // Automatic indices change when heights change; only an exact range/profile can inherit their treatment.
  return reach.id.startsWith('auto-')
    ? row.from === reach.from && row.to === reach.to && row.tierId === reach.tierId
    : row.reachId === reach.id
}

export function bankProtectionForReach(data: CanalData, side: 'left' | 'right', reach: CanalAssignedBankReach): Pick<CanalBankReachProtection, 'slopes' | 'berms'> {
  const config = data.design.bankConfig
  const linkedSide = config?.linkSymmetrical ? 'left' : side
  const saved = (linkedSide === 'left' ? config?.leftReachProtection : config?.rightReachProtection)?.find(row => matchesReach(row, config?.mode ?? '', reach))
  const tiers = linkedSide === 'left' ? config?.leftTiers : config?.rightTiers
  return { slopes: { ...defaultBankProtection(), ...(saved?.slopes ?? tiers?.find(t => t.id === reach.tierId)?.bankProtection) },
    berms: { ...defaultBankProtection(), ...saved?.berms } }
}

export function bankProtectionAt(data: CanalData, section: CanalSection, side: 'left' | 'right'): Pick<CanalBankReachProtection, 'slopes' | 'berms'> {
  const sampled = section as CanalSection & { bankReachLookupChainage?: number; bankReachLookupChainageBySide?: Partial<Record<'left' | 'right', number>> }
  const reach = canalBankReachAt(data, sampled.bankReachLookupChainageBySide?.[side] ?? sampled.bankReachLookupChainage ?? section.chainage, side)
  return reach?.status === 'fill' ? bankProtectionForReach(data, side, reach) : { slopes: defaultBankProtection(), berms: defaultBankProtection() }
}

/** One saved update; no geometry or allocation changes while editing. */
export function saveBankReachProtection(data: CanalData, side: 'left' | 'right', reach: CanalAssignedBankReach, treatments: Pick<CanalBankReachProtection, 'slopes' | 'berms'>): CanalData {
  const config = data.design.bankConfig
  if (!config || config.mode === 'legacy' || reach.status !== 'fill') return data
  const key = config.linkSymmetrical || side === 'left' ? 'leftReachProtection' : 'rightReachProtection'
  const row: CanalBankReachProtection = { mode: config.mode, reachId: reach.id, tierId: reach.tierId, from: reach.from, to: reach.to, ...structuredClone(treatments) }
  return { ...data, design: { ...data.design, bankConfig: { ...config, [key]: [...(config[key] ?? []).filter(r => !matchesReach(r, config.mode, reach)), row] } } }
}

export function bankProtectionCode(config: CanalBankProtectionConfig): string | null {
  if (config.kind === 'none') return null
  if (config.kind === 'grass') return `IRR-CAW-8-${config.sand ? 15 : 16}`
  const t = config.thickness
  let item: number | null = null
  if (config.stone === 'khandki' && config.headers) {
    if (t === 0.3) item = config.bedding === 'dry' ? 11 : 13
    if (t === 0.45) item = config.bedding === 'dry' ? 12 : 14
  } else if (config.stone === 'rubble' && config.bedding === 'mortar' && t === 0.3) {
    item = config.headers ? 9 : 10
  } else if (config.stone === 'rubble' && config.bedding === 'dry') {
    item = t === 0.225 ? (config.headers ? 2 : 4) : t === 0.25 ? (config.headers ? 1 : 3) : t === 0.3 ? (config.headers ? 5 : 6) : t === 0.45 ? (config.headers ? 7 : 8) : null
  }
  return item == null ? null : `IRR-CAW-8-${item}`
}

export function bankProtectionItem(config: CanalBankProtectionConfig): typeof BANK_PROTECTION_ITEMS[number] | undefined {
  return BANK_PROTECTION_ITEMS.find((item) => item.code === bankProtectionCode(config))
}

/** Actual outer faces or horizontal berm shelves below the crest. Crest/road platforms are excluded. */
export function bankProtectionSegments(data: CanalData, section: CanalSection, side: 'left' | 'right', surface: 'slopes' | 'berms' = 'slopes'): Array<[CanalPoint, CanalPoint]> {
  if (section.designPopulated === false || section.ground.length < 2 || !canalSectionBankTier(data, section, side)) return []
  const points = canalSideProfile(data, section, side)
  const top = Math.max(...points.map((point) => point.rl))
  const outerTop = points.reduce((last, point, index) => Math.abs(point.rl - top) < 1e-6 ? index : last, -1)
  const segments: Array<[CanalPoint, CanalPoint]> = []
  for (let index = outerTop + 1; index < points.length; index++) {
    const a = points[index - 1], b = points[index]
    if (surface === 'slopes' ? a.rl - b.rl > 1e-6 : Math.abs(a.rl - b.rl) <= 1e-6 && Math.abs(a.offset - b.offset) > 1e-6) segments.push([a, b])
  }
  return segments
}

export function bankProtectionSlopeLength(data: CanalData, section: CanalSection, side: 'left' | 'right'): number {
  return bankProtectionSegments(data, section, side).reduce((sum, [a, b]) => sum + Math.hypot(b.offset - a.offset, b.rl - a.rl), 0)
}

export function bankProtectionSectionAt(data: CanalData, chainage: number): CanalSection | undefined {
  const sections = orderedCanalSections(data)
  const exact = sections.find(s => s.chainage === chainage && s.designPopulated !== false && s.ground.length >= 2)
  if (exact) return exact
  const index = sections.findIndex(s => s.chainage > chainage)
  if (index <= 0) return undefined
  const a = sections[index - 1], b = sections[index]
  if (a.designPopulated === false || b.designPopulated === false || a.ground.length < 2 || b.ground.length < 2) return undefined
  return between(a, b, chainage)
}

function between(a: CanalSection, b: CanalSection, chainage: number): CanalSection {
  const fraction = (chainage - a.chainage) / (b.chainage - a.chainage)
  const offsets = [...new Set([...a.ground, ...b.ground].map((point) => point.offset))].sort((x, y) => x - y)
  const ground = offsets.flatMap((offset) => {
    const left = canalGroundLevelAt(a.ground, offset), right = canalGroundLevelAt(b.ground, offset)
    return left == null || right == null ? [] : [{ offset, rl: left + (right - left) * fraction }]
  })
  return { ...a, chainage, ground }
}

export interface BankProtectionQuantity { tierId: string; reachId: string; from: number; to: number; surface: 'slopes' | 'berms'; side: 'left' | 'right'; code: string; area: number }

/** Average developed slope length or berm width × distance, split at shared reach and road boundaries. */
export function bankProtectionQuantities(data: CanalData): BankProtectionQuantity[] {
  const sections = orderedCanalSections(data)
  const totals = new Map<string, BankProtectionQuantity>()
  for (let i = 1; i < sections.length; i++) {
    const a = sections[i - 1], b = sections[i]
    if (a.designPopulated === false || b.designPopulated === false || a.ground.length < 2 || b.ground.length < 2 || b.chainage <= a.chainage) continue
    for (const side of ['left', 'right'] as const) {
      const boundaries = new Set([a.chainage, b.chainage])
      for (const reach of canalBankReaches(data, side)) {
        for (const ch of [reach.from, reach.to]) if (ch > a.chainage && ch < b.chainage) boundaries.add(ch)
      }
      for (const road of data.design.serviceRoadReaches ?? []) {
        for (const ch of [road.fromChainage, road.toChainage]) if (ch > a.chainage && ch < b.chainage) boundaries.add(ch)
      }
      const ordered = [...boundaries].sort((x, y) => x - y)
      for (let j = 1; j < ordered.length; j++) {
        const start = ordered[j - 1], end = ordered[j], length = end - start
        const reach = canalBankReachAt(data, (start + end) / 2, side)
        if (!reach || reach.status !== 'fill' || !reach.tierId) continue
        const treatments = bankProtectionForReach(data, side, reach)
        const epsilon = Math.min(length * 1e-7, 1e-5)
        for (const surface of ['slopes', 'berms'] as const) {
          const spec = treatments[surface]
          const code = bankProtectionCode(spec)
          if (!code || (data.mode === 'new' && spec.kind === 'stone' && spec.thickness === 0.225)) continue
          const developed = (ch: number): number => bankProtectionSegments(data, between(a, b, ch), side, surface).reduce((sum, [p, q]) => sum + Math.hypot(q.offset - p.offset, q.rl - p.rl), 0)
          const area = (developed(start + epsilon) + developed(end - epsilon)) / 2 * length
          const key = `${side}:${reach.id}:${surface}:${code}`
          const row = totals.get(key) ?? { side, tierId: reach.tierId, reachId: reach.id, from: reach.from, to: reach.to, surface, code, area: 0 }
          row.area += area
          totals.set(key, row)
        }
      }
    }
  }
  return [...totals.values()].map((row) => ({ ...row, area: Math.round(row.area * 1000) / 1000 })).filter((row) => row.area > 0)
}
