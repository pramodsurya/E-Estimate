import { projectNodePath } from './projectItems'
import { findNode } from './tree'
import type {
  EestimateProject,
  ProjectAreaAllowance,
  ProjectNode
} from '../types/project'

export interface EffectiveAllowance {
  percent: number
  label: string
  /** The stored allowance when a component/sub-component supplies one. */
  allowance: ProjectAreaAllowance | null
  /** Component/sub-component that owns the allowance, when not project-level. */
  ownerId: string | null
  ownerName: string | null
  source: 'component' | 'project'
}

/** Nearest component/sub-component carrying an explicit allowance, if any. */
export function owningAllowanceNode(
  project: EestimateProject,
  nodeId: string
): ProjectNode | null {
  const self = findNode(project.root, nodeId)
  if (
    self &&
    (self.kind === 'component' || self.kind === 'subcomponent') &&
    self.areaAllowance
  ) {
    return self
  }
  const path = projectNodePath(project.root, nodeId)
  for (let index = path.length - 1; index >= 0; index -= 1) {
    const ancestor = path[index]
    if (ancestor.kind !== 'component' && ancestor.kind !== 'subcomponent') continue
    if (ancestor.areaAllowance) return ancestor
  }
  return null
}

/**
 * Allowance in force for an item (or any node): the nearest ancestor
 * component/sub-component allowance wins, otherwise the project allowance.
 */
export function effectiveAllowanceForNode(
  project: EestimateProject,
  nodeId: string
): EffectiveAllowance {
  const owner = owningAllowanceNode(project, nodeId)
  if (owner?.areaAllowance) {
    return {
      percent: Math.max(0, Number(owner.areaAllowance.percent) || 0),
      label: owner.areaAllowance.label,
      allowance: owner.areaAllowance,
      ownerId: owner.id,
      ownerName: owner.name,
      source: 'component'
    }
  }
  return {
    percent: Math.max(0, Number(project.meta.areaAllowancePercent) || 0),
    label:
      project.meta.areaAllowanceLabel ??
      (project.meta.areaAllowance?.label ?? 'No area allowance'),
    allowance: null,
    ownerId: null,
    ownerName: null,
    source: 'project'
  }
}

/** Stable grouping key so one source DATA can compile per allowance. */
export function allowanceGroupKey(effective: EffectiveAllowance): string {
  return `${effective.percent}|${effective.label}`
}

/**
 * Every component/sub-component allowance in the tree, for compile
 * signatures: changing any of them must invalidate synced dashboards.
 */
export function componentAllowanceAudit(
  project: EestimateProject
): { id: string; percent: number; label: string; type: string | null }[] {
  const out: { id: string; percent: number; label: string; type: string | null }[] = []
  const visit = (node: ProjectNode): void => {
    if (
      (node.kind === 'component' || node.kind === 'subcomponent') &&
      node.areaAllowance
    ) {
      out.push({
        id: node.id,
        percent: Math.max(0, Number(node.areaAllowance.percent) || 0),
        label: node.areaAllowance.label,
        type: node.areaAllowance.type
      })
    }
    node.children.forEach(visit)
  }
  visit(project.root)
  return out.sort((a, b) => a.id.localeCompare(b.id))
}

/** Geographic middle of a drawn working line; the allowance lookup point. */
export function workingLineCentroid(
  points: { lat: number; lng: number }[]
): { lat: number; lng: number } | null {
  const valid = points.filter(
    (point) =>
      Number.isFinite(point.lat) &&
      Number.isFinite(point.lng) &&
      Math.abs(point.lat) <= 90 &&
      Math.abs(point.lng) <= 180
  )
  if (!valid.length) return null
  return {
    lat: valid.reduce((total, point) => total + point.lat, 0) / valid.length,
    lng: valid.reduce((total, point) => total + point.lng, 0) / valid.length
  }
}
