import type { CanalBankTier } from '../types/project'

/** Validate and apply both edited endpoints as one saved change. */
export function saveCanalBankTierHeightRange(tiers: CanalBankTier[], id: string, min: number, max: number): { tiers: CanalBankTier[]; error: string | null } {
  const sorted = [...tiers].sort((a, b) => a.minFillHeight - b.minFillHeight)
  const index = sorted.findIndex(t => t.id === id)
  if (index < 0) return { tiers, error: 'This tier is no longer available.' }
  if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max > 9999 || max - min < 0.1 - 1e-9) {
    return { tiers, error: 'Enter valid height limits with at least 0.1 m between them.' }
  }
  if ((index === 0 && min !== 0) || (index === sorted.length - 1 && max !== 9999)) {
    return { tiers, error: 'The first tier starts at zero and the last tier ends at Max.' }
  }
  if (min < index * 0.1 - 1e-9 || max > 9999 - (sorted.length - index - 1) * 0.1 + 1e-9) {
    return { tiers, error: 'Leave at least 0.1 m for each neighbouring tier.' }
  }
  let updated = tiers
  if (min !== sorted[index].minFillHeight) updated = updateCanalBankTierBoundary(updated, id, 'min', min)
  if (max !== sorted[index].maxFillHeight) updated = updateCanalBankTierBoundary(updated, id, 'max', max)
  return { tiers: updated, error: null }
}

/** Move a shared height boundary; push neighbouring brackets when necessary. */
export function updateCanalBankTierBoundary(tiers: CanalBankTier[], id: string, edge: 'min' | 'max', value: number): CanalBankTier[] {
  const sorted = tiers.map(t => ({ ...t })).sort((a, b) => a.minFillHeight - b.minFillHeight)
  const index = sorted.findIndex(t => t.id === id)
  const boundary = edge === 'min' ? index : index + 1
  if (index < 0 || boundary === 0 || boundary === sorted.length || !Number.isFinite(value)) return sorted
  const step = 0.1
  const limits = [0, ...sorted.slice(0, -1).map(t => t.maxFillHeight), 9999]
  const widths = sorted.map(t => Math.max(step, t.maxFillHeight - t.minFillHeight))
  limits[boundary] = Math.min(9999 - (sorted.length - boundary) * step, Math.max(boundary * step, value))
  for (let i = boundary - 1; i > 0; i--) {
    if (limits[i] >= limits[i + 1]) limits[i] = Math.max(i * step, limits[i + 1] - widths[i])
  }
  for (let i = boundary + 1; i < sorted.length; i++) {
    if (limits[i] <= limits[i - 1]) limits[i] = Math.min(9999 - (sorted.length - i) * step, limits[i - 1] + widths[i - 1])
  }
  return sorted.map((tier, i) => ({ ...tier, minFillHeight: limits[i], maxFillHeight: limits[i + 1] }))
}
