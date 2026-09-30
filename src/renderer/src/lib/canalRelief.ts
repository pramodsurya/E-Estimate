import type { CanalData, CanalFilterDrainReach, CanalLiningReach, CanalLiningSurface, CanalReliefChapter, CanalReliefOutlet } from '../types/project'
import { chapterSurfaces, normalizeLiningChapter } from './canalLiningChapter'

export const GI_RELIEF_CODES = [
  { code: 'IRR-CAW-7-19', lengthCm: 12.5 },
  { code: 'IRR-CAW-7-20', lengthCm: 22.5 },
  { code: 'IRR-CAW-7-21', lengthCm: 30 },
  { code: 'IRR-CAW-7-22', lengthCm: 45 },
  { code: 'IRR-CAW-7-23', lengthCm: 75 }
] as const

export const defaultReliefChapter = (): CanalReliefChapter => ({ version: 1, required: null, outlets: [] })
export const newReliefOutlet = (kind: 'gi' | 'pvc', id: string): CanalReliefOutlet => ({
  id, kind, surfaces: [], code: kind === 'gi' ? '' : 'IRR-CAW-7-24', placement: null,
  firstChainage: null, spacingM: null, chainagesText: '', approvedCount: null,
  rockHoleCount: kind === 'gi' ? 0 : null, filterPocketCount: kind === 'gi' ? 0 : null
})

export function normalizeReliefChapter(raw: CanalReliefChapter): CanalReliefChapter {
  const num = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null
  return {
    version: 1, completed: raw.completed === true,
    required: typeof raw.required === 'boolean' ? raw.required : null,
    outlets: Array.isArray(raw.outlets) ? raw.outlets.filter(outlet => outlet && typeof outlet.id === 'string').map(outlet => ({
      ...newReliefOutlet(outlet.kind === 'pvc' ? 'pvc' : 'gi', outlet.id), ...outlet,
      kind: outlet.kind === 'pvc' ? 'pvc' : 'gi',
      surfaces: chapterSurfaces.filter(surface => outlet.surfaces?.includes(surface)),
      code: typeof outlet.code === 'string' ? outlet.code : '',
      placement: ['spacing', 'chainages', 'approved'].includes(outlet.placement ?? '') ? outlet.placement : null,
      firstChainage: num(outlet.firstChainage), spacingM: num(outlet.spacingM),
      chainagesText: typeof outlet.chainagesText === 'string' ? outlet.chainagesText : '',
      approvedCount: num(outlet.approvedCount), rockHoleCount: num(outlet.rockHoleCount), filterPocketCount: num(outlet.filterPocketCount)
    })) : []
  }
}

export function reliefDrainWorksForReach(data: CanalData, reach: CanalLiningReach) {
  return data.filterDrainReaches.filter(work => {
    if (work.kind !== '5-8' && work.kind !== '5-9') return false
    const from = Math.min(work.fromChainage, work.toChainage)
    const to = Math.max(work.fromChainage, work.toChainage)
    return from < reach.toChainage && (to > reach.fromChainage || (from === to && to === reach.fromChainage))
  })
}

/** Informational portion inside one lining reach; billing stays with the single shared record. */
export function drainQuantityWithinReach(data: CanalData, work: CanalFilterDrainReach, reach: CanalLiningReach): number | null {
  const from = Math.max(work.fromChainage, reach.fromChainage)
  const to = Math.min(work.toChainage, reach.toChainage)
  if (!(to > from)) return 0
  if (work.kind === '5-8' && work.orientation === 'longitudinal') return to - from
  const positions = work.placementMode === 'manual'
    ? (work.manualChainages ?? []).filter(chainage => chainage >= from && (chainage < to || (to === work.toChainage && chainage === to))).length
    : work.placementMode === 'spacing' && work.spacing > 0
      ? Math.max(0, Math.floor((to - work.fromChainage + (to === work.toChainage ? 1e-9 : -1e-9)) / work.spacing) - Math.ceil((from - work.fromChainage - 1e-9) / work.spacing) + 1)
      : null
  if (positions == null) return null
  if (work.kind === '5-9') return positions * (work.plugLocations?.length ?? 1)
  if (work.kind === '5-8' && work.orientation === 'cross') return positions * Math.max(0, work.crossDrainLength ?? data.design.bedWidth)
  return null
}

export function reliefOutletLocations(reach: CanalLiningReach, outlet: CanalReliefOutlet): { locations: number[]; count: number; errors: string[] } {
  const errors: string[] = []
  let locations: number[] = []
  if (outlet.placement === 'spacing') {
    const first = outlet.firstChainage, spacing = outlet.spacingM
    if (first == null || first < reach.fromChainage || first > reach.toChainage) errors.push('Enter the first outlet chainage within this reach.')
    if (!(spacing != null && spacing > 0)) errors.push('Enter a positive outlet spacing.')
    if (!errors.length && first != null && spacing != null) {
      const count = Math.floor((reach.toChainage - first + 1e-7) / spacing) + 1
      if (count > 10000) errors.push('More than 10,000 outlet positions. Increase spacing or split the reach.')
      else locations = Array.from({ length: count }, (_, index) => first + index * spacing)
    }
  } else if (outlet.placement === 'chainages') {
    const tokens = outlet.chainagesText.trim().split(/[\s,;]+/).filter(Boolean)
    if (!tokens.length) errors.push('Enter at least one outlet chainage.')
    if (tokens.length > 10000) errors.push('More than 10,000 outlet entries. Split the reach.')
    else {
      if (tokens.some(token => !/^\d+(?:\.\d+)?$/.test(token))) errors.push('Use numeric chainages separated by commas, spaces or new lines.')
      locations = [...new Set(tokens.map(Number).filter(Number.isFinite))].sort((a, b) => a - b)
      if (locations.some(chainage => chainage < reach.fromChainage || chainage > reach.toChainage)) errors.push('Every outlet chainage must lie within this reach.')
    }
  } else if (outlet.placement === 'approved') {
    if (!(outlet.approvedCount != null && Number.isInteger(outlet.approvedCount) && outlet.approvedCount > 0)) errors.push('Enter a positive whole-number approved outlet count.')
  } else errors.push('Choose how the outlet positions are specified.')
  return { locations: errors.length ? [] : locations, count: outlet.placement === 'approved' ? outlet.approvedCount ?? 0 : locations.length * outlet.surfaces.length, errors }
}

export function measureReliefChapter(data: CanalData, reach: CanalLiningReach) {
  const chapter = normalizeReliefChapter(reach.reliefChapter ?? defaultReliefChapter())
  const errors: string[] = []
  const lines: { code: string; quantity: number; unit: 'NOS' }[] = []
  const existing = reliefDrainWorksForReach(data, reach)
  if (chapter.required == null) errors.push('Answer whether drainage or pressure relief is specified.')
  if (chapter.required === false && (chapter.outlets.length || existing.length)) errors.push('Remove the existing drainage and outlet works before choosing No.')
  if (chapter.required !== true) return { errors, lines, existing }
  if (!existing.length && !chapter.outlets.length) errors.push('Add a bed drain, porous plug or pressure-relief outlet.')
  for (const [index, work] of existing.entries()) {
    const errorStart = errors.length
    if (!(work.fromChainage >= 0 && work.toChainage > work.fromChainage && work.toChainage <= data.lengthM)) errors.push('Drainage work must have increasing chainages within the canal length.')
    if ((work.kind === '5-8' && work.orientation === 'cross') || work.kind === '5-9') {
      if (work.placementMode === 'spacing' && !(work.spacing > 0)) errors.push('Drainage spacing must be positive.')
      if (work.placementMode === 'manual' && (!(work.manualChainages?.length) || work.manualChainages.some(chainage => chainage < work.fromChainage || chainage > work.toChainage))) errors.push('Enter at least one drainage chainage within the work limits.')
    }
    if (work.kind === '5-8' && work.orientation === 'cross' && !(work.crossDrainLength != null && work.crossDrainLength > 0)) errors.push('Enter a positive length for each cross bed drain.')
    if (work.kind === '5-9' && work.placementMode === 'count' && !(Number.isInteger(work.count) && work.count > 0)) errors.push('Enter a positive whole-number plug-location count.')
    if (work.kind === '5-9' && !work.plugLocations?.length) errors.push('Select at least one plug surface.')
    for (let i = errorStart; i < errors.length; i++) errors[i] = `Drainage work ${index + 1}: ${errors[i]}`
  }
  const lined = reach.liningChapter ? normalizeLiningChapter(reach.liningChapter).surfaces : []
  const occupied = new Set<string>()
  for (const [index, outlet] of chapter.outlets.entries()) {
    const prefix = `Outlet ${index + 1}: `
    if (!outlet.surfaces.length) errors.push(prefix + 'choose at least one lined surface.')
    for (const surface of outlet.surfaces) {
      if (!lined.includes(surface)) errors.push(prefix + `${surface} is not selected for lining in Chapter 2.`)
    }
    if (outlet.kind === 'gi' && !GI_RELIEF_CODES.some(item => item.code === outlet.code)) errors.push(prefix + 'choose a published GI pipe length.')
    if (outlet.kind === 'pvc' && outlet.code !== 'IRR-CAW-7-24') errors.push(prefix + 'invalid PVC weep-hole code.')
    const measured = reliefOutletLocations(reach, outlet)
    errors.push(...measured.errors.map(error => prefix + error))
    if (outlet.placement !== 'approved') for (const chainage of measured.locations) for (const surface of outlet.surfaces) {
      const key = `${surface}:${chainage.toFixed(6)}`
      if (occupied.has(key)) errors.push(prefix + `another outlet is already scheduled on ${surface} at Ch ${chainage} m.`)
      occupied.add(key)
    }
    if (outlet.kind === 'gi') {
      for (const [label, count] of [['Rock holes', outlet.rockHoleCount], ['Filter pockets', outlet.filterPocketCount]] as const) {
        if (!(count != null && Number.isInteger(count) && count >= 0 && count <= measured.count)) errors.push(prefix + `${label.toLowerCase()} must be a whole number from 0 to the GI pipe count.`)
      }
    }
    if (!errors.some(error => error.startsWith(prefix))) {
      lines.push({ code: outlet.code, quantity: measured.count, unit: 'NOS' })
      if (outlet.kind === 'gi' && outlet.rockHoleCount) lines.push({ code: 'IRR-CAW-7-25', quantity: outlet.rockHoleCount, unit: 'NOS' })
      if (outlet.kind === 'gi' && outlet.filterPocketCount) lines.push({ code: 'IRR-CAW-7-26', quantity: outlet.filterPocketCount, unit: 'NOS' })
    }
  }
  return { errors: [...new Set(errors)], lines, existing }
}

export function reliefSurfaceName(surface: CanalLiningSurface): string {
  return surface === 'bed' ? 'Bed' : surface === 'left' ? 'Left inner side' : 'Right inner side'
}
