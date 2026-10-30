import { measureCanalBankSection, measureCanalBankQuantities } from './canalBankSection'
import type { CanalBankProtectionConfig, CanalBankReachProtection, CanalData, CanalPoint, CanalSection } from '../types/project'
import { canalGroundLevelAt, canalSectionBankTier, orderedCanalSections } from './canal'
import { BANK_PROTECTION_ITEMS } from './canalBankProtectionCatalogue'
import { canalBankReachAt, type CanalAssignedBankReach } from './canalTierReaches'

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
  if (config?.mode === 'tiered' && reach.tierId) return bankProtectionForTier(data, side, reach.tierId)
  const linkedSide = config?.linkSymmetrical ? 'left' : side
  const saved = (linkedSide === 'left' ? config?.leftReachProtection : config?.rightReachProtection)?.find(row => matchesReach(row, config?.mode ?? '', reach))
  const tiers = linkedSide === 'left' ? config?.leftTiers : config?.rightTiers
  return { slopes: { ...defaultBankProtection(), ...(saved?.slopes ?? tiers?.find(t => t.id === reach.tierId)?.bankProtection) },
    berms: { ...defaultBankProtection(), ...saved?.berms } }
}

export function bankProtectionForTier(data: CanalData, side: 'left' | 'right', tierId: string): Pick<CanalBankReachProtection, 'slopes' | 'berms'> {
  const config = data.design.bankConfig, bank = config?.linkSymmetrical ? 'left' : side
  const tier = (bank === 'left' ? config?.leftTiers : config?.rightTiers)?.find(t => t.id === tierId)
  const prior = (bank === 'left' ? config?.leftReachProtection : config?.rightReachProtection)?.find(r => r.mode === 'tiered' && r.tierId === tierId)
  return { slopes: { ...defaultBankProtection(), ...(prior?.slopes ?? tier?.bankProtection) },
    berms: { ...defaultBankProtection(), ...(prior?.berms ?? tier?.bankBermProtection) } }
}

/** Programmatic works belong to the design and cover all of its disjoint reaches. */
export function saveBankTierProtection(data: CanalData, side: 'left' | 'right', tierId: string, treatments: Pick<CanalBankReachProtection, 'slopes' | 'berms'>): CanalData {
  const config = data.design.bankConfig
  if (config?.mode !== 'tiered') return data
  const bank = config.linkSymmetrical ? 'left' : side
  const tiers = bank === 'left' ? config.leftTiers : config.rightTiers
  if (!tiers.some(t => t.id === tierId)) return data
  const updated = tiers.map(t => t.id === tierId ? { ...t, bankProtection: structuredClone(treatments.slopes), bankBermProtection: structuredClone(treatments.berms) } : t)
  const clear = (rows: CanalBankReachProtection[] | undefined): CanalBankReachProtection[] => (rows ?? []).filter(r => r.mode !== 'tiered' || r.tierId !== tierId)
  return { ...data, design: { ...data.design, bankConfig: { ...config,
    ...(config.linkSymmetrical || bank === 'left' ? { leftTiers: updated, leftReachProtection: clear(config.leftReachProtection) } : {}),
    ...(config.linkSymmetrical || bank === 'right' ? { rightTiers: updated, rightReachProtection: clear(config.rightReachProtection) } : {})
  } } }
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
  if (config.mode === 'tiered') return reach.tierId ? saveBankTierProtection(data, side, reach.tierId, treatments) : data
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
  const bank = measureCanalBankSection(data, section).banks[side === 'left' ? 0 : 1]
  return (surface === 'slopes' ? bank.slopeSegments : bank.bermSegments) as Array<[CanalPoint, CanalPoint]>
}

export function bankProtectionSlopeLength(data: CanalData, section: CanalSection, side: 'left' | 'right'): number {
  if (section.designPopulated === false || section.ground.length < 2 || !canalSectionBankTier(data, section, side)) return 0
  return measureCanalBankSection(data, section).banks[side === 'left' ? 0 : 1].outerSlopeLength
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
  const model = measureCanalBankQuantities(data)
  const totals = new Map<string, BankProtectionQuantity>()
  for (const interval of model.rows) {
    const reach = canalBankReachAt(data, (interval.from + interval.to) / 2, interval.side)
    if (!reach || !reach.tierId || reach.status !== 'fill') continue
    for (const work of model.works) {
      const surface = work.key.startsWith('slope_protection_') ? 'slopes' as const : work.key.startsWith('berm_protection_') ? 'berms' as const : null
      if (!surface || !(interval.quantities[work.key] > 0)) continue
      const key = interval.side + ':' + reach.id + ':' + surface + ':' + work.code
      const row = totals.get(key) ?? { side: interval.side, tierId: reach.tierId, reachId: reach.id, from: reach.from, to: reach.to, surface, code: work.code, area: 0 }
      row.area += interval.quantities[work.key]; totals.set(key, row)
    }
  }
  return [...totals.values()].map(row => ({ ...row, area: Math.round(row.area * 1000) / 1000 }))
}
