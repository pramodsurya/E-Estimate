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

/** Stop at the first edit and copy only its ancestors; unchanged branches retain identity. */
function editTree(root: ProjectNode, edit: (node: ProjectNode) => ProjectNode): ProjectNode {
  const updated = edit(root)
  if (updated !== root) return updated

  for (let index = 0; index < root.children.length; index += 1) {
    const child = root.children[index]
    const nextChild = editTree(child, edit)
    if (nextChild !== child) {
      const children = root.children.slice()
      children[index] = nextChild
      return { ...root, children }
    }
  }
  return root
}

/** Immutable update of the first node with matching id. */
export function patchNode(root: ProjectNode, id: string, patch: Partial<ProjectNode>): ProjectNode {
  return editTree(root, (node) => node.id === id ? { ...node, ...patch } : node)
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
  return editTree(root, (node) => node.id === parentId
    ? { ...node, children: [...node.children, ...childrenToAdd] }
    : node)
}

/**
 * Return a sibling-safe display name without changing the requested base name.
 * Matching is case-insensitive because names that differ only by capitalization
 * are still indistinguishable in the Explorer and printed section list.
 */
export function uniqueChildName(parent: ProjectNode | null, requestedName: string): string {
  const base = requestedName.trim()
  if (!parent || !base) return base

  const used = new Set(parent.children.map((child) => child.name.trim().toLocaleLowerCase()))
  if (!used.has(base.toLocaleLowerCase())) return base

  let suffix = 2
  while (used.has(`${base} (${suffix})`.toLocaleLowerCase())) suffix += 1
  return `${base} (${suffix})`
}

export type ReorderEdge = 'above' | 'below'

/**
 * Move `childId` to just above or below its sibling `targetId`. Returns `root`
 * unchanged when the two are not siblings.
 */
export function reorderSibling(
  root: ProjectNode,
  childId: string,
  targetId: string,
  edge: ReorderEdge = 'above'
): ProjectNode {
  if (childId === targetId) return root
  const parent = findParent(root, childId)
  if (!parent || findParent(root, targetId)?.id !== parent.id) return root

  const from = parent.children.findIndex((child) => child.id === childId)
  if (from < 0) return root

  const children = parent.children.slice()
  const [moved] = children.splice(from, 1)
  // The target index is resolved after removal so it stays correct whether the
  // node moved up or down the list.
  const to = children.findIndex((child) => child.id === targetId)
  if (to < 0) return root
  children.splice(edge === 'above' ? to : to + 1, 0, moved)

  if (children.every((child, index) => child === parent.children[index])) return root
  return patchNode(root, parent.id, { children })
}

/**
 * Any ordinary sibling may be placed before or after another sibling. This is
 * what lets supporting pages sit between components, sub-components, and DATA
 * items. The caller still verifies that both nodes share the same parent.
 */
export function canReorderBetween(a: ProjectNode, b: ProjectNode): boolean {
  if (a.id === b.id) return false
  if (a.pageTemplate || b.pageTemplate) return false
  if (a.templateGenerated || b.templateGenerated) return false
  return true
}

export type MoveDirection = 'up' | 'down'

/**
 * Whether `id` may be moved one position in `direction` among its siblings.
 * Template-generated rows are hidden in the Explorer and pinned pages cannot be
 * crossed, and the in-between slots are filled only by visible siblings, so the
 * arrows move a node only across nodes the user is allowed to reorder past.
 */
export function canMoveNode(
  root: ProjectNode,
  id: string,
  direction: MoveDirection
): boolean {
  const siblings = findParent(root, id)?.children
  if (!siblings) return false
  const index = siblings.findIndex((child) => child.id === id)
  if (index < 0) return false
  const moved = siblings[index]
  const step = direction === 'up' ? -1 : 1
  for (let i = index + step; i >= 0 && i < siblings.length; i += step) {
    const neighbor = siblings[i]
    if (neighbor.templateGenerated) continue
    return canReorderBetween(moved, neighbor)
  }
  return false
}

/**
 * Move `id` one position in `direction` among its siblings. Template-generated
 * rows are skipped so a node shifts across only the visible siblings, and any
 * pinned page in the way blocks the move. Returns `root` unchanged when there
 * is nothing to move onto.
 */
export function moveNode(
  root: ProjectNode,
  id: string,
  direction: MoveDirection
): ProjectNode {
  const parent = findParent(root, id)
  if (!parent) return root
  const siblings = parent.children
  const index = siblings.findIndex((child) => child.id === id)
  if (index < 0) return root
  const moved = siblings[index]
  const step = direction === 'up' ? -1 : 1
  for (let i = index + step; i >= 0 && i < siblings.length; i += step) {
    const neighbor = siblings[i]
    if (neighbor.templateGenerated) continue
    if (!canReorderBetween(moved, neighbor)) return root
    const children = siblings.slice()
    // Swap the two positions; any template-generated rows between them stay put.
    children[index] = neighbor
    children[i] = moved
    return patchNode(root, parent.id, { children })
  }
  return root
}

export function removeNode(root: ProjectNode, id: string): ProjectNode {
  return editTree(root, (node) => {
    const directIndex = node.children.findIndex((child) => child.id === id)
    if (directIndex < 0) return node
    return {
      ...node,
      children: node.children.filter((_, index) => index !== directIndex)
    }
  })
}

/** A node is "addable to" as a parent for items if it is a component or sub-component. */
export function isComponentLike(node: ProjectNode): boolean {
  return node.kind === 'component' || node.kind === 'subcomponent'
}

/** Resolve the parent that a new item/sub-item should be added under, given the current selection. */
export function resolveItemParent(root: ProjectNode, selectedId: string | null): ProjectNode {
  if (!selectedId) return root
  const selected = findNode(root, selectedId)
  if (!selected) return root
  if (isComponentLike(selected)) return selected
  // Item selected -> add as sibling under its parent component.
  if (selected.kind === 'item') {
    const parent = findParent(root, selected.id)
    if (parent && isComponentLike(parent)) return parent
  }
  return root
}
