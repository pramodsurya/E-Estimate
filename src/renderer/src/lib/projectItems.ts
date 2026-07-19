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

export function projectItemKey(node: ProjectNode): string {
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
  const path: ProjectNode[] = []
  const visit = (node: ProjectNode): boolean => {
    if (node.id === nodeId) return true
    for (const child of node.children) {
      path.push(node)
      if (visit(child)) return true
      path.pop()
    }
    return false
  }
  return visit(root) ? path : []
}

/**
 * Resolve the recipe used by one Item usage. The nearest component/sub-component
 * override wins; otherwise every usage shares the project-wide DATA override.
 */
export function rateAnalysisOverrideForNode(
  project: EestimateProject,
  node: ProjectNode
): RateAnalysisRecipe | null {
  const itemKey = projectItemKey(node)
  const path = projectNodePath(project.root, node.id)
  for (let index = path.length - 1; index >= 0; index -= 1) {
    const ancestor = path[index]
    if (ancestor.kind !== 'component' && ancestor.kind !== 'subcomponent') continue
    const scoped = project.rateAnalysisScopedOverrides?.[ancestor.id]?.[itemKey]
    if (scoped) return scoped
  }
  return project.rateAnalysisOverrides?.[itemKey] ?? null
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

export function collectProjectItemGroups(root: ProjectNode): ProjectItemGroup[] {
  const groups = new Map<string, ProjectItemGroup>()

  function visit(node: ProjectNode, path: ProjectNode[]): void {
    if (node.kind === 'item') {
      const key = projectItemKey(node)
      let group = groups.get(key)
      if (!group) {
        const code = node.itemCode?.trim() || node.name
        const displayName = node.dataVariant ? `${code} - ${node.dataVariant.label}` : code
        group = {
          key,
          code,
          displayName: node.splitFromItemKey ? node.name : displayName,
          description: node.itemDescription ?? node.name,
          source: node.itemSource ?? 'OTHERS',
          categoryKey: node.categoryKey ?? 'custom',
          usages: [],
          branches: []
        }
        groups.set(key, group)
      }
      group.description = node.itemDescription ?? group.description
      if (node.splitFromItemKey) group.displayName = node.name
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
