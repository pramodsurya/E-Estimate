import type { CanalBankMaterialAllocation, CanalBankProtectionConfig, CanalData, CanalPoint, CanalSection, CanalTierFoundationConfig } from '../types/project'
import {
  canalBedLevelAt, canalDesignProfile, canalHeartingSection, canalInterpolateSection,
  canalSectionBankTier, canalSectionBankTreatment, canalSideProfile, canalStrippingDepthAt,
  orderedCanalSections, canalUsesLegacyZonedReaches, canalFoundationDepthAtSection, canalFoundationFillBands
} from './canal'
import { bankProtectionAt } from './canalBankProtection'
import { canalBankReachAt, canalBankReaches } from './canalTierReaches'
import { canalDrainageWorkRanges } from './canalDrainageDesign'
import { cnsCode, treatmentLayerPolygon } from './canalCns'
import { liningBackingOffsets } from './canalLiningChapter'

export interface CanalBankExportBank {
  side: 'left' | 'right'
  reachId: string
  profileName: string
  profileId: string
  designReference: string
  status: string
  construction: 'homogeneous' | 'zoned'
  profile: CanalPoint[]
  slopes: CanalBankProtectionConfig
  berms: CanalBankProtectionConfig
  treatment: CanalTierFoundationConfig
}

export interface CanalBankExportSample {
  validationErrors?: string[]
  chainage: number
  bedLevel: number
  strippingDepth: number
  ground: CanalPoint[]
  design: CanalPoint[]
  cores: CanalPoint[][]
  trenches: CanalPoint[][]
  /** Full canal lining/CNS shells replacing ordinary bank earth. */
  cns: CanalPoint[][]
  banks: CanalBankExportBank[]
  foundationFills?: Array<{ side: 'left' | 'right'; kind: string; points: CanalPoint[] }>
}

export function buildCanalBankSectionInput(data: CanalData, section: CanalSection) {
  const sampled = section as CanalSection & { bankReachLookupChainage?: number; bankReachLookupChainageBySide?: Partial<Record<'left' | 'right', number>> }
  const lookup = sampled.bankReachLookupChainage ?? section.chainage
  const view: CanalData = { ...data, design: { ...data.design,
    serviceRoadReaches: (data.design.serviceRoadReaches ?? []).filter(r => lookup >= r.fromChainage && (lookup < r.toChainage || lookup === data.lengthM && r.toChainage === data.lengthM))
  } }
  const mode = view.design.bankConfig?.mode ?? 'legacy'
  const core = canalHeartingSection(view, section)
  const validationErrors = [...core.errors]
  let cns: CanalPoint[][] = []
  try { cns = canalReplacementLayers(view, section.chainage, lookup) } catch (error) { validationErrors.push(String(error)) }
  const sample: CanalBankExportSample = {
    validationErrors, chainage: section.chainage, bedLevel: canalBedLevelAt(view, section.chainage) ?? view.design.bedLevelAtStart,
    strippingDepth: canalStrippingDepthAt(view, section.chainage), ground: section.ground, design: canalDesignProfile(view, section),
    cores: core.profiles.flatMap(p => p.pieces ?? [p.points]), trenches: core.trenches, cns,
    banks: (['left', 'right'] as const).map(side => {
      const reach = canalBankReachAt(view, sampled.bankReachLookupChainageBySide?.[side] ?? lookup, side), tier = canalSectionBankTier(view, section, side)
      const legacyZoned = canalUsesLegacyZonedReaches(view) || mode === 'legacy' && view.design.bankSectionType === 'zoned'
      return { side, reachId: reach?.id ?? `legacy-${side}`, profileName: tier?.name ?? 'Fixed bank design', profileId: tier?.id ?? '',
        designReference: [tier?.id ?? 'fixed', ...view.design.serviceRoadReaches.filter(r => r.side === side || r.side === 'both').map(r => r.id)].join(':'),
        status: reach?.status ?? (mode === 'legacy' ? 'fill' : tier ? 'fill' : 'unassigned'),
        construction: legacyZoned ? 'zoned' : tier?.sectionType ?? 'homogeneous', profile: canalSideProfile(view, section, side),
        ...bankProtectionAt(view, section, side), treatment: canalSectionBankTreatment(view, section, side) }
    })
  }
  const depth = canalFoundationDepthAtSection(view, section)
  sample.foundationFills = depth > 0 ? sample.banks.flatMap(bank => bank.treatment.foundation === 'none' ? [] :
    canalFoundationFillBands(view, section, depth * Math.min(100, Math.max(0, bank.treatment.foundationPercentage)) / 100)
      .filter(points => (points.reduce((total, p) => total + p.offset, 0) < 0) === (bank.side === 'left'))
      .map(points => ({ side: bank.side, kind: bank.treatment.foundation, points }))) : []
  return { workMode: view.mode, bedWidth: view.design.bedWidth, fullSupplyDepth: view.design.fullSupplyDepth, sample }
}

export interface CanalBankExportInput {
  version: 1
  mode: string
  workMode: string
  lengthM: number
  bedWidth: number
  fullSupplyDepth: number
  materialAllocations: CanalBankMaterialAllocation[]
  intervals: Array<{ from: number; to: number; start: CanalBankExportSample; end: CanalBankExportSample }>
}

function canalReplacementLayers(data: CanalData, chainage: number, lookup: number): CanalPoint[][] {
  return (data.liningReaches ?? []).filter(r => r.provide && lookup >= r.fromChainage && lookup < r.toChainage).flatMap(r => {
    const end = liningBackingOffsets(r)
    const c = r.cnsChapter
    if (c?.required === true) {
      if (!cnsCode(c) || !c.coverage || !(c.bedThicknessMm != null && c.bedThicknessMm > 0) ||
        c.coverage === 'bed-and-sides' && !(c.sideThicknessMm != null && c.sideThicknessMm > 0)) {
        throw new Error(`Complete the enabled CNS specification for Ch ${r.fromChainage}–${r.toChainage} m before exporting bank quantities.`)
      }
      end.bed += c.bedThicknessMm / 1000
      if (c.coverage === 'bed-and-sides') { end.left += c.sideThicknessMm! / 1000; end.right += c.sideThicknessMm! / 1000 }
    }
    return Object.values(end).some(t => t > 0)
      ? [treatmentLayerPolygon(data, chainage, { bed: 0, left: 0, right: 0 }, end)] : []
  })
}

/**
 * Geometry adapter only. Reuse the saved reach resolver and the coordinates
 * drawn by CanalSectionDiagram. Rust owns measurement, deductions, grouping,
 * optional columns, quantities and the Excel formula lineage.
 */
export function buildCanalBankExportInput(data: CanalData, options: { strict?: boolean; boundaries?: number[] } = {}): CanalBankExportInput {
  const strict = options.strict !== false
  const config = data.design.bankConfig
  const mode = config?.mode ?? 'legacy'
  const stations = orderedCanalSections(data).filter(s => s.designPopulated !== false && s.ground.length >= 2)
  if (strict && stations.length < 2) throw new Error('Enter at least two surveyed sections before exporting bank quantities.')
  if (strict && (stations[0].chainage > 1e-7 || stations.at(-1)!.chainage < data.lengthM - 1e-7)) {
    throw new Error('Surveyed sections must cover the canal start and end before exporting bank quantities.')
  }
  if (stations.some((s, i) => i > 0 && s.chainage <= stations[i - 1].chainage)) throw new Error('Bank export requires unique, increasing section chainages.')
  const boundaries = [...new Set([
    ...(options.boundaries ?? []),
    ...(['left', 'right'] as const).flatMap(side => [
      ...canalBankReaches(data, side), ...canalDrainageWorkRanges(data, side),
      ...canalDrainageWorkRanges(data, side, 'bankToeDrainage')
    ].flatMap(r => [r.from, r.to])),
    ...(data.design.serviceRoadReaches ?? []).flatMap(r => [r.fromChainage, r.toChainage]),
    ...(data.design.zonedReaches ?? []).flatMap(r => [r.fromChainage, r.toChainage]),
    ...(data.liningReaches ?? []).flatMap(r => [r.fromChainage, r.toChainage])
  ])]
  const intervals: CanalBankExportInput['intervals'] = []
  for (let i = 1; i < stations.length; i++) {
    const a = stations[i - 1], b = stations[i]
    const cuts = [a.chainage, ...boundaries.filter(ch => ch > a.chainage && ch < b.chainage), b.chainage].sort((x, y) => x - y)
    for (let j = 1; j < cuts.length; j++) {
      const from = cuts[j - 1], to = cuts[j], lookup = (from + to) / 2
      // Road rules use inclusive ends in the editor. Select this interval's
      // active roads explicitly so a shared end cannot leak into its neighbour.
      const view: CanalData = { ...data, design: { ...data.design,
        serviceRoadReaches: (data.design.serviceRoadReaches ?? []).filter(r => lookup >= r.fromChainage && lookup < r.toChainage)
      } }
      const sample = (chainage: number): CanalBankExportSample => {
        const source = chainage === a.chainage ? a : chainage === b.chainage ? b : canalInterpolateSection(a, b, chainage)
        const section = { ...source, chainage, bankReachLookupChainage: lookup } as CanalSection
        const result = buildCanalBankSectionInput(view, section).sample
        if (strict && result.validationErrors?.length) throw new Error(`Bank section at Ch ${chainage} m: ${result.validationErrors.join(' ')}`)
        return result
      }
      intervals.push({ from, to, start: sample(from), end: sample(to) })
    }
  }
  return { version: 1, mode, workMode: data.mode, lengthM: data.lengthM,
    bedWidth: data.design.bedWidth, fullSupplyDepth: data.design.fullSupplyDepth,
    materialAllocations: data.design.bankMaterialAllocations ?? [], intervals }
}
