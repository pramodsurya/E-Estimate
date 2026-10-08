import type { CanalData, CanalBankTier, CanalDrainageReach, CanalTierFoundationConfig } from '../types/project'
import { defaultCanalBankDesignConfig, defaultCanalTierFoundationConfig } from './canal'
import { canalAutomaticBankReaches, canalBankReaches } from './canalTierReaches'

export interface CanalDrainageWorkRange { id: string; from: number; to: number; tierId: string | null }
export type CanalBankWorkChapter = 'bankDrainage' | 'bankToeDrainage'
const bankSide = (data: CanalData, side: 'left' | 'right'): 'left' | 'right' => data.design.bankConfig?.linkSymmetrical ? 'left' : side
let defaultHeightTiers: ReturnType<typeof defaultCanalBankDesignConfig> | undefined

/** Reuse saved height brackets, including when bank geometry is manual. */
export function canalDrainageTiers(data: CanalData, side: 'left' | 'right'): CanalBankTier[] {
  const config = data.design.bankConfig, bank = bankSide(data, side)
  const tiers = (config?.mode === 'tiered'
    ? bank === 'left' ? config.leftTiers : config.rightTiers
    : bank === 'left' ? config?.leftProgrammaticTiers : config?.rightProgrammaticTiers)
  if (tiers) return tiers
  const defaults = defaultHeightTiers ??= defaultCanalBankDesignConfig()
  return bank === 'left' ? defaults.leftTiers : defaults.rightTiers
}

export function canalManualDrainageReaches(data: CanalData, side: 'left' | 'right', chapterKey: CanalBankWorkChapter = 'bankDrainage'): CanalDrainageReach[] {
  const chapter = data.design[chapterKey]
  return (bankSide(data, side) === 'left' ? chapter?.leftReaches : chapter?.rightReaches) ?? []
}

const rangeCache = new WeakMap<CanalData, Map<string, { design: CanalData['design']; sections: CanalData['sections']; length: number; ranges: CanalDrainageWorkRange[] }>>()
export function canalDrainageWorkRanges(data: CanalData, side: 'left' | 'right', chapterKey: CanalBankWorkChapter = 'bankDrainage'): CanalDrainageWorkRange[] {
  const cacheKey = `${chapterKey}:${side}`
  const cached = rangeCache.get(data)?.get(cacheKey)
  if (cached?.design === data.design && cached.sections === data.sections && cached.length === data.lengthM) return cached.ranges
  const chapter = data.design[chapterKey]
  let ranges: CanalDrainageWorkRange[]
  if (chapter?.mode === 'manual') ranges = canalManualDrainageReaches(data, side, chapterKey).map(r => ({ ...r, tierId: null }))
  else if (data.design.bankConfig?.mode === 'tiered' || !chapter) ranges = canalBankReaches(data, side).filter(r => r.status === 'fill')
  else {
    const config = data.design.bankConfig ?? defaultCanalBankDesignConfig()
    const tiers = canalDrainageTiers(data, side)
    const view = { ...data, design: { ...data.design, bankConfig: { ...config, mode: 'tiered' as const, leftTiers: tiers, rightTiers: tiers } } }
    ranges = canalAutomaticBankReaches(view, side).filter(r => r.status === 'fill').map((r, i) => ({ ...r, id: `drainage-tier-${r.tierId}-${i}` }))
  }
  const cache = rangeCache.get(data) ?? new Map()
  cache.set(cacheKey, { design: data.design, sections: data.sections, length: data.lengthM, ranges })
  rangeCache.set(data, cache)
  return ranges
}

export function canalDrainageRangeAt(data: CanalData, ch: number, side: 'left' | 'right', chapterKey: CanalBankWorkChapter = 'bankDrainage'): CanalDrainageWorkRange | undefined {
  return canalDrainageWorkRanges(data, side, chapterKey).find(r => ch >= r.from && (ch < r.to || ch === data.lengthM && r.to === ch))
}

export function canalDrainageTierTreatment(data: CanalData, side: 'left' | 'right', tierId: string, chapterKey: CanalBankWorkChapter = 'bankDrainage'): CanalTierFoundationConfig {
  const chapter = data.design[chapterKey]
  const bank = bankSide(data, side), config = data.design.bankConfig
  const rows = bank === 'left' ? chapter?.leftTierTreatments : chapter?.rightTierTreatments
  const prior = (bank === 'left' ? config?.leftReachTreatment : config?.rightReachTreatment)?.find(r => r.mode === 'tiered' && r.tierId === tierId)
  return { ...defaultCanalTierFoundationConfig(), ...canalDrainageTiers(data, side).find(t => t.id === tierId)?.foundationTreatment, ...prior?.treatment, ...rows?.[tierId] }
}

// This chapter owns blankets and internal filters. Rock toes/open ditches keep
// their separate chapter settings when drainage modes are changed.
const drainageKeys = ['blanket', 'blanketWidthMode', 'blanketLeftWidth', 'blanketRightWidth', 'blanketThickness',
  'horizontalFilter', 'filterLengthMode', 'filterLeftLength', 'filterRightLength', 'filterThickness',
  'rockToe', 'rockToeSide', 'rockToeWidth', 'rockToeHeight', 'toeFilter', 'toeFilterSide', 'toeFilterKind', 'toeFilterWidth', 'toeFilterDepth'] as const
const toeKeys = ['rockToeProtection', 'rockToeProtectionSide', 'rockToeTopWidth', 'rockToeProtectionHeight', 'rockToeInnerSlope', 'rockToeFilter',
  'toeDrain', 'toeDrainSide', 'toeDrainBottomWidth', 'toeDrainDepth', 'toeDrainLeftSlope', 'toeDrainRightSlope', 'toeDrainBermWidth', 'toeDrainProtection'] as const
export function canalDrainageTreatmentAt(data: CanalData, ch: number, side: 'left' | 'right', base: CanalTierFoundationConfig, chapterKey: CanalBankWorkChapter = 'bankDrainage'): CanalTierFoundationConfig {
  const chapter = data.design[chapterKey]
  if (!chapter) return base
  const range = canalDrainageRangeAt(data, ch, side, chapterKey)
  const spec = chapter.mode === 'programmatic' && range?.tierId
    ? canalDrainageTierTreatment(data, side, range.tierId, chapterKey)
    : { ...defaultCanalTierFoundationConfig(), ...canalManualDrainageReaches(data, side, chapterKey).find(r => r.id === range?.id)?.treatment }
  const keys = chapterKey === 'bankDrainage' ? drainageKeys : toeKeys
  return { ...base, ...Object.fromEntries(keys.map(key => [key, spec[key]])) }
}

export function saveCanalDrainageTier(data: CanalData, side: 'left' | 'right', tierId: string, patch: Partial<CanalTierFoundationConfig>, chapterKey: CanalBankWorkChapter = 'bankDrainage'): CanalData {
  const chapter = data.design[chapterKey] ?? { mode: 'programmatic' as const }
  const key = bankSide(data, side) === 'left' ? 'leftTierTreatments' : 'rightTierTreatments'
  const rows = chapter[key] ?? {}
  return { ...data, design: { ...data.design, [chapterKey]: { ...chapter, mode: 'programmatic', [key]: { ...rows, [tierId]: { ...rows[tierId], ...patch } } } } }
}

export function saveCanalManualDrainageReach(data: CanalData, side: 'left' | 'right', row: CanalDrainageReach, chapterKey: CanalBankWorkChapter = 'bankDrainage'): { data: CanalData; error: string | null } {
  const rows = canalManualDrainageReaches(data, side, chapterKey)
  if (!Number.isFinite(row.from) || !Number.isFinite(row.to) || row.from < 0 || row.to > data.lengthM || row.to <= row.from)
    return { data, error: `Enter From–To chainages within 0–${data.lengthM.toLocaleString('en-IN')} m, with To greater than From.` }
  if (!Number.isInteger(row.from) || !Number.isInteger(row.to)) return { data, error: 'Enter chainages in whole metres.' }
  if (rows.some(r => r.id !== row.id && r.from < row.to && r.to > row.from)) return { data, error: 'This reach overlaps another reach in this chapter. Adjust its From–To chainages.' }
  const key = bankSide(data, side) === 'left' ? 'leftReaches' : 'rightReaches'
  const chapter = data.design[chapterKey] ?? { mode: 'manual' as const }
  return { error: null, data: { ...data, design: { ...data.design, [chapterKey]: { ...chapter, mode: 'manual', [key]: [...rows.filter(r => r.id !== row.id), row].sort((a, b) => a.from - b.from) } } } }
}

export function removeCanalManualDrainageReach(data: CanalData, side: 'left' | 'right', id: string, chapterKey: CanalBankWorkChapter = 'bankDrainage'): CanalData {
  const key = bankSide(data, side) === 'left' ? 'leftReaches' : 'rightReaches'
  return { ...data, design: { ...data.design, [chapterKey]: { ...data.design[chapterKey], mode: 'manual', [key]: canalManualDrainageReaches(data, side, chapterKey).filter(r => r.id !== id) } } }
}
