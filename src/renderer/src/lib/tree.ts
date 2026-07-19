import type { EestimateProject, NodeKind, ProjectNode } from '../types/project'

export function newId(): string {
  return 'n_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

export function createNode(kind: NodeKind, name: string, extra: Partial<ProjectNode> = {}): ProjectNode {
  return { id: newId(), kind, name, children: [], ...extra }
}

export function createDraftProject(): EestimateProject {
  const now = new Date().toISOString()
  return {
    formatVersion: 1,
    id: newId(),
    meta: { name: '', sorYear: '', location: null, flags: [] },
    root: createNode('title', 'Title'),
    leadChart: { points: [], assignments: [], itemChoices: [], variants: [], applications: [] },
    rateAnalysisOverrides: {},
    rateAnalysisScopedOverrides: {},
    leadDetailOverrides: {},
    miscellaneousItems: [],
    earthworkOverrides: {},
    createdAt: now,
    updatedAt: now
  }
}

/** Depth-first search for a node by id. */
export function findNode(root: ProjectNode, id: string): ProjectNode | null {
  if (root.id === id) return root
  for (const c of root.children) {
    const found = findNode(c, id)
    if (found) return found
  }
  return null
}

export function findParent(root: ProjectNode, id: string): ProjectNode | null {
  for (const c of root.children) {
    if (c.id === id) return root
    const found = findParent(c, id)
    if (found) return found
  }
  return null
}

/** Immutable map over the tree, replacing the node with matching id. */
export function patchNode(root: ProjectNode, id: string, patch: Partial<ProjectNode>): ProjectNode {
  if (root.id === id) return { ...root, ...patch }
  for (let index = 0; index < root.children.length; index += 1) {
    const child = root.children[index]
    const nextChild = patchNode(child, id, patch)
    if (nextChild !== child) {
      const children = root.children.slice()
      children[index] = nextChild
      return { ...root, children }
    }
  }
  return root
}

/** Immutable add of a child under parentId. */
export function addChild(root: ProjectNode, parentId: string, child: ProjectNode): ProjectNode {
  return addChildren(root, parentId, [child])
}

export function addChildren(
  root: ProjectNode,
  parentId: string,
  childrenToAdd: ProjectNode[]
): ProjectNode {
  if (childrenToAdd.length === 0) return root
  if (root.id === parentId) {
    return { ...root, children: [...root.children, ...childrenToAdd] }
  }
  for (let index = 0; index < root.children.length; index += 1) {
    const current = root.children[index]
    const nextChild = addChildren(current, parentId, childrenToAdd)
    if (nextChild !== current) {
      const children = root.children.slice()
      children[index] = nextChild
      return { ...root, children }
    }
  }
  return root
}

export function removeNode(root: ProjectNode, id: string): ProjectNode {
  const directIndex = root.children.findIndex((child) => child.id === id)
  if (directIndex >= 0) {
    return {
      ...root,
      children: root.children.filter((_, index) => index !== directIndex)
    }
  }
  for (let index = 0; index < root.children.length; index += 1) {
    const child = root.children[index]
    const nextChild = removeNode(child, id)
    if (nextChild !== child) {
      const children = root.children.slice()
      children[index] = nextChild
      return { ...root, children }
    }
  }
  return root
}

/** A node is "addable to" as a parent for items if it is a component or sub-component. */
export function isComponentLike(node: ProjectNode): boolean {
  return node.kind === 'component' || node.kind === 'subcomponent'
}

/** Resolve the parent that a new item/sub-item should be added under, given the current selection. */
export function resolveItemParent(root: ProjectNode, selectedId: string | null): ProjectNode {
  if (!selectedId) return root
  const sel = findNode(root, selectedId)
  if (!sel) return root
  if (isComponentLike(sel)) return sel
  // Item selected -> add as sibling under its parent component.
  if (sel.kind === 'item') {
    const parent = findParent(root, sel.id)
    if (parent && isComponentLike(parent)) return parent
  }
  return root
}
