import type { ProjectNode } from '../types/project'

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
  if (node.splitFromItemKey) return `SPLIT:${node.id}`
  const source = node.itemSource ?? 'OTHERS'
  const category = node.categoryKey ?? 'custom'
  const code = node.itemCode?.trim() || node.id
  return `${source}:${category}:${code}`
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
        group = {
          key,
          code: node.itemCode?.trim() || node.name,
          displayName: node.splitFromItemKey ? node.name : node.itemCode?.trim() || node.name,
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
