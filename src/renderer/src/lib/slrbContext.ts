import type { ProjectNode } from '../types/project'
import type { SlrbContext, SlrbData } from '../types/slrb'
import { findParent } from './tree'
import { canalBedLevelAt, canalDesignAtChainage } from './canal'
import { polylineLengthM } from './guideWall'

/** A revision fingerprint for dependency invalidation, not a security checksum. */
export function slrbRevision(value: unknown): string {
  const text = JSON.stringify(value)
  let hash = 2166136261
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619)
  return (hash >>> 0).toString(16)
}

export function slrbLocationKey(node: ProjectNode, parent: ProjectNode | null): string {
  return JSON.stringify([parent?.id ?? null, node.location?.lat, node.location?.lng, parent?.canal?.alignment, parent?.canal?.lengthM])
}

/** All nearby projections are retained so a looping alignment cannot pick an arbitrary reach. */
export function slrbCrossingCandidates(node: ProjectNode, parent: ProjectNode): number[] {
  const line = parent.canal?.alignment ?? []
  const p = node.location
  if (!p || line.length < 2) return []
  const scaleX = 111320 * Math.cos(p.lat * Math.PI / 180)
  let walked = 0
  const matches: number[] = []
  for (let i = 1; i < line.length; i++) {
    const a = { x: (line[i - 1].lng - p.lng) * scaleX, y: (line[i - 1].lat - p.lat) * 111320 }
    const b = { x: (line[i].lng - p.lng) * scaleX, y: (line[i].lat - p.lat) * 111320 }
    const dx = b.x - a.x, dy = b.y - a.y
    const squared = dx * dx + dy * dy
    const t = squared > 0 ? Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / squared)) : 0
    const length = polylineLengthM([line[i - 1], line[i]])
    if (squared > 0 && Math.hypot(a.x + t * dx, a.y + t * dy) <= 10) matches.push(walked + t * length)
    walked += length
  }
  // At an ordinary vertex, adjacent segments describe the same crossing.
  return matches.sort((a,b) => a-b).filter((ch,index,all) => index === 0 || ch-all[index-1] > 20)
}

export function resolveSlrbContext(root: ProjectNode, node: ProjectNode, data: SlrbData): SlrbContext {
  const parent = findParent(root,node.id)
  const linked = parent?.templateId === 'canal'
  const parentId = linked ? parent!.id : ''
  const needsParentReview = data.acceptedParentId !== undefined && data.acceptedParentId !== (linked ? parentId : null)
  const locationKey = slrbLocationKey(node,parent)
  const base: SlrbContext = { mode: linked ? 'canal' : 'manual', parentId, parentName: linked ? parent!.name : '',
    revision: slrbRevision(linked ? parent?.canal : null), chainage:null, bedRl:null,fsl:null,bankRl:null,
    candidates:[],locationKey,needsParentReview }
  if (needsParentReview) base.issue = 'The parent changed. Review the new height source before adopting measurements.'
  if (!linked) return base
  const canal = parent?.canal
  if (!canal?.configured) return {...base,issue:'Complete the parent Canal setup before resolving this crossing.'}
  const candidates = slrbCrossingCandidates(node,parent!)
  const overrideValid = data.crossingConfirmationKey === locationKey && data.chainageOverride !== null &&
    Number.isFinite(data.chainageOverride) && data.chainageOverride >= 0 && data.chainageOverride <= canal.lengthM
  const chainage = overrideValid ? data.chainageOverride : candidates.length === 1 ? candidates[0] : null
  if (chainage === null || chainage > canal.lengthM) return {...base,canal,candidates,
    issue: candidates.length > 1 ? 'Several Canal reaches are close to this location. Confirm the crossing chainage.'
      : 'The saved location does not resolve a Canal reach. Edit the component location or confirm a surveyed chainage.'}
  const design = canalDesignAtChainage(canal.design,chainage)
  const bedRl = canalBedLevelAt(canal,chainage)
  const fsl = bedRl !== null && Number.isFinite(design.fullSupplyDepth) ? bedRl + design.fullSupplyDepth : null
  const bankRl = fsl !== null && Number.isFinite(design.freeBoard) ? fsl + design.freeBoard : null
  return {...base,canal,candidates,chainage,bedRl,fsl,bankRl}
}
