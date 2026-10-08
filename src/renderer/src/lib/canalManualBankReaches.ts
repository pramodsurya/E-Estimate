import type { CanalBankDesignConfig, CanalBankReach, CanalBankTier, CanalData } from '../types/project'
import { validateCanalBankReaches } from './canalTierReaches'

export function newCanalManualBankProfile(reachId: string, profileId: string, name: string): CanalBankTier {
  return { id: profileId, manualReachId: reachId, name, minFillHeight: 0, maxFillHeight: 9999,
    crestWidth: 2, sectionType: 'homogeneous', baseSlope: 1.5, berms: [], heartingTopWidth: 1.5, heartingSideSlope: 1 }
}

/** Older shared manual profiles become independent designs without changing their geometry. */
export function normalizeCanalManualBankConfig(config: CanalBankDesignConfig): CanalBankDesignConfig {
  if (config.mode !== 'manual') return config
  const convert = (profiles: CanalBankTier[], rows: CanalBankReach[]): { profiles: CanalBankTier[]; rows: CanalBankReach[] } => {
    const used = new Set<string>()
    const result: CanalBankTier[] = []
    const reaches = rows.flatMap(row => {
      const source = profiles.find(t => t.id === row.tierId)
      // Gaps are derived by the shared resolver; only user-created designs are stored.
      if (row.status !== 'fill' || !source) return []
      const id = used.has(source.id) ? `${source.id}-reach-${row.id}` : source.id
      used.add(id)
      const name = source.manualReachId ? source.name : `Reach ${result.length + 1}`
      result.push({ ...structuredClone(source), id, manualReachId: row.id, name, minFillHeight: 0, maxFillHeight: 9999 })
      return [{ ...row, tierId: id }]
    })
    return { profiles: result, rows: reaches }
  }
  const left = convert(config.leftTiers, config.leftManualReaches ?? [])
  const right = config.linkSymmetrical ? structuredClone(left) : convert(config.rightTiers, config.rightManualReaches ?? [])
  return { ...config,
    leftProgrammaticTiers: config.leftProgrammaticTiers ?? (config.leftTiers.some(t => !t.manualReachId) ? structuredClone(config.leftTiers) : undefined),
    rightProgrammaticTiers: config.rightProgrammaticTiers ?? (config.rightTiers.some(t => !t.manualReachId) ? structuredClone(config.rightTiers) : undefined),
    leftTiers: left.profiles, rightTiers: right.profiles,
    leftManualTiers: left.profiles, rightManualTiers: right.profiles, leftManualReaches: left.rows, rightManualReaches: right.rows }
}

export function switchCanalBankDesignMode(config: CanalBankDesignConfig, mode: CanalBankDesignConfig['mode'], defaults: CanalBankDesignConfig): CanalBankDesignConfig {
  if (config.mode === mode) return config
  const stored = { ...config,
    ...(config.mode === 'manual' ? { leftManualTiers: config.leftTiers, rightManualTiers: config.rightTiers }
      : config.mode === 'tiered' ? { leftProgrammaticTiers: config.leftTiers, rightProgrammaticTiers: config.rightTiers } : {}) }
  if (mode === 'manual') return normalizeCanalManualBankConfig({ ...stored, mode,
    leftTiers: stored.leftManualTiers ?? config.leftTiers, rightTiers: stored.rightManualTiers ?? config.rightTiers })
  if (mode === 'tiered') return { ...stored, mode,
    leftTiers: stored.leftProgrammaticTiers ?? defaults.leftTiers, rightTiers: stored.rightProgrammaticTiers ?? defaults.rightTiers }
  return { ...stored, mode }
}

/** A saved manual reach owns one profile. Creation and editing never read height brackets. */
export function saveCanalManualBankReach(data: CanalData, side: 'left' | 'right', reach: CanalBankReach, profile: CanalBankTier): { config: CanalBankDesignConfig; error: string | null } {
  const config = data.design.bankConfig!
  const bank = config.linkSymmetrical ? 'left' : side
  const rows = bank === 'left' ? config.leftManualReaches ?? [] : config.rightManualReaches ?? []
  const profiles = bank === 'left' ? config.leftTiers : config.rightTiers
  const original = rows.find(r => r.id === reach.id)
  const ownProfile = { ...structuredClone(profile), manualReachId: reach.id, minFillHeight: 0, maxFillHeight: 9999 }
  const nextProfiles = [...profiles.filter(t => t.id !== ownProfile.id && t.id !== original?.tierId), ownProfile]
  const nextRows = [...rows.filter(r => r.id !== reach.id), { ...reach, tierId: ownProfile.id, status: 'fill' as const }].sort((a, b) => a.from - b.from)
  const updated = { ...config,
    ...(config.linkSymmetrical || bank === 'left' ? { leftTiers: nextProfiles, leftManualTiers: nextProfiles, leftManualReaches: nextRows } : {}),
    ...(config.linkSymmetrical || bank === 'right' ? { rightTiers: nextProfiles, rightManualTiers: nextProfiles, rightManualReaches: nextRows } : {}) }
  const error = validateCanalBankReaches({ ...data, design: { ...data.design, bankConfig: updated } }, side, nextRows)
  return { config: error ? config : updated, error }
}

export function removeCanalManualBankReach(config: CanalBankDesignConfig, side: 'left' | 'right', id: string): CanalBankDesignConfig {
  const bank = config.linkSymmetrical ? 'left' : side
  const rows = bank === 'left' ? config.leftManualReaches ?? [] : config.rightManualReaches ?? []
  const profileId = rows.find(r => r.id === id)?.tierId
  const nextRows = rows.filter(r => r.id !== id)
  const profiles = (bank === 'left' ? config.leftTiers : config.rightTiers).filter(t => t.id !== profileId)
  return { ...config,
    ...(config.linkSymmetrical || bank === 'left' ? { leftTiers: profiles, leftManualTiers: profiles, leftManualReaches: nextRows } : {}),
    ...(config.linkSymmetrical || bank === 'right' ? { rightTiers: profiles, rightManualTiers: profiles, rightManualReaches: nextRows } : {}) }
}
