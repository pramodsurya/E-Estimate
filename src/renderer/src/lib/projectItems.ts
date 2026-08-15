import type { EestimateProject, ProjectNode } from '../types/project'
import type { RateAnalysisRecipe } from '../types/rateAnalysis'

export interface ItemUsage {
  node: ProjectNode
  path: ProjectNode[]
}

export interface ItemUsageBranch {
  id: string
  name: string
  kind: 'component' | 'subcomponent'
  itemNodeIds: string[]
  children: ItemUsageBranch[]
}

export interface ProjectItemGroup {
  key: string
  code: string
  displayName: string
  description: string
  source: string
  categoryKey: string
  usages: ItemUsage[]
  branches: ItemUsageBranch[]
}

export interface RateAnalysisOverrideResolution {
  recipe: RateAnalysisRecipe | null
  scope: 'shared' | 'component'
  scopeNodeId?: string
  scopeName?: string
}

const nodePathCache = new WeakMap<ProjectNode, Map<string, ProjectNode[]>>()

/** User-facing item identity. SOR catalogue codes remain internal database keys. */
export function projectItemDisplayName(
  node: Pick<
    ProjectNode,
    | 'name'
    | 'kind'
    | 'itemSource'
    | 'itemCode'
    | 'itemDescription'
    | 'projectDataId'
    | 'splitFromItemKey'
    | 'dataVariant'
  >
): string {
  if (node.kind !== 'item') return node.name
  if (node.projectDataId) return node.itemCode?.trim() || node.name
  if (node.splitFromItemKey) return node.name
  if (node.itemSource === 'SOR') {
    return node.itemDescription?.trim() || node.name
  }
  if (node.itemCode) {
    return node.dataVariant
      ? `${node.itemCode} - ${node.dataVariant.label}`
      : node.itemCode
  }
  return node.name
}

export function projectItemKey(node: ProjectNode): string {
  if (node.projectDataId) return `PROJECT_DATA:${node.projectDataId}`
  if (node.splitFromItemKey) return `SPLIT:${node.createdDataId ?? node.id}`
  const source = node.itemSource ?? 'OTHERS'
  const category = node.categoryKey ?? 'custom'
  const code = node.itemCode?.trim() || node.id
  const variant = node.dataVariant
    ? `:${node.dataVariant.kind}:${node.dataVariant.key}`
    : ''
  return `${source}:${category}:${code}${variant}`
}

/** Find the structural ancestors of an item, from Title down to its direct parent. */
export function projectNodePath(root: ProjectNode, nodeId: string): ProjectNode[] {
  let paths = nodePathCache.get(root)
  if (!paths) {
    paths = new Map<string, ProjectNode[]>()
    const index = (node: ProjectNode, path: ProjectNode[]): void => {
      paths?.set(node.id, path)
      node.children.forEach((child) => index(child, [...path, node]))
    }
    index(root, [])
    nodePathCache.set(root, paths)
  }
  return paths.get(nodeId) ?? []
}

/**
 * Resolve the recipe used by one Item usage. The nearest component/sub-component
 * override wins; otherwise every usage shares the project-wide DATA override.
 */
export function rateAnalysisOverrideForNode(
  project: EestimateProject,
  node: ProjectNode
): RateAnalysisRecipe | null {
  return rateAnalysisOverrideResolution(project, node).recipe
}

/** Resolve both the effective recipe edit and the structural scope that owns it. */
export function rateAnalysisOverrideResolution(
  project: EestimateProject,
  node: ProjectNode
): RateAnalysisOverrideResolution {
  const itemKey = projectItemKey(node)
  const path = projectNodePath(project.root, node.id)
  for (let index = path.length - 1; index >= 0; index -= 1) {
    const ancestor = path[index]
    if (ancestor.kind !== 'component' && ancestor.kind !== 'subcomponent') continue
    const scoped = project.rateAnalysisScopedOverrides?.[ancestor.id]?.[itemKey]
    if (scoped) {
      return {
        recipe: scoped,
        scope: 'component',
        scopeNodeId: ancestor.id,
        scopeName: ancestor.name
      }
    }
  }
  return {
    recipe: project.rateAnalysisOverrides?.[itemKey] ?? null,
    scope: 'shared'
  }
}

function addBranch(
  branches: ItemUsageBranch[],
  structuralPath: ProjectNode[],
  itemNodeId: string
): void {
  let current = branches
  for (const node of structuralPath) {
    if (node.kind !== 'component' && node.kind !== 'subcomponent') continue
    let branch = current.find((candidate) => candidate.id === node.id)
    if (!branch) {
      branch = {
        id: node.id,
        name: node.name,
        kind: node.kind,
        itemNodeIds: [],
        children: []
      }
      current.push(branch)
    }
    if (!branch.itemNodeIds.includes(itemNodeId)) branch.itemNodeIds.push(itemNodeId)
    current = branch.children
  }
}

/**
 * One grouping per project version, shared by everything that asks for it.
 *
 * `collectProjectItemGroups` walks the whole tree and allocates a group, a
 * usage list and a branch list for every distinct item. That is fine once; it
 * was not fine per item, which is what `getItemLeadRate` was doing — a full
 * tree walk for each item it priced, so totalling a component was quadratic in
 * the size of the project. Several panels mounted at once each paid for their
 * own walk too.
 *
 * Mutations replace the root object (see `patchNode`), so the root is exactly
 * the right cache key: a new version misses, and the old entry goes when the
 * old tree does. Nothing mutates the returned groups, so sharing them is safe.
 */
const groupsByRoot = new WeakMap<ProjectNode, ProjectItemGroup[]>()
const groupIndexByRoot = new WeakMap<ProjectNode, Map<string, ProjectItemGroup>>()

/** Memoised `collectProjectItemGroups`. Prefer this on any hot path. */
export function projectItemGroups(root: ProjectNode): ProjectItemGroup[] {
  let groups = groupsByRoot.get(root)
  if (!groups) {
    groups = collectProjectItemGroups(root)
    groupsByRoot.set(root, groups)
  }
  return groups
}

/** The same grouping, addressed by item key instead of scanned for one. */
export function projectItemGroupIndex(root: ProjectNode): Map<string, ProjectItemGroup> {
  let index = groupIndexByRoot.get(root)
  if (!index) {
    index = new Map(projectItemGroups(root).map((group) => [group.key, group]))
    groupIndexByRoot.set(root, index)
  }
  return index
}

export function collectProjectItemGroups(root: ProjectNode): ProjectItemGroup[] {
  const groups = new Map<string, ProjectItemGroup>()

  function visit(node: ProjectNode, path: ProjectNode[]): void {
    if (node.kind === 'item') {
      const key = projectItemKey(node)
      let group = groups.get(key)
      if (!group) {
        const code = node.itemCode?.trim() || node.name
        const displayName = projectItemDisplayName(node)
        group = {
          key,
          code,
          displayName,
          description: node.itemDescription ?? node.name,
          source: node.itemSource ?? 'OTHERS',
          categoryKey: node.categoryKey ?? 'custom',
          usages: [],
          branches: []
        }
        groups.set(key, group)
      }
      group.description = node.itemDescription ?? group.description
      group.displayName = projectItemDisplayName(node)
      group.usages.push({ node, path })
      addBranch(group.branches, path, node.id)
      return
    }

    const nextPath =
      node.kind === 'component' || node.kind === 'subcomponent' ? [...path, node] : path
    node.children.forEach((child) => visit(child, nextPath))
  }

  visit(root, [])
  return Array.from(groups.values()).sort((a, b) =>
    a.code.localeCompare(b.code, undefined, { numeric: true })
  )
}
