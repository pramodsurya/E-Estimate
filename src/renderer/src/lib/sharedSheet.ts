import type { ProjectNode } from '../types/project'
import { findNode } from './tree'

/**
 * Shared-sheet groups: one workbook, many logical items.
 *
 * Every member keeps a synced copy of the same grid bytes (fan-out on save),
 * so all existing per-item readers (`finalCell`, `print.range`, Excel/Typst
 * export) keep working unchanged. The group is identified by `sharedSheetId`;
 * the display name is mirrored on every member as `sharedSheetName`.
 */

export function isSharedSheetMember(node: ProjectNode): boolean {
  return node.kind === 'item' && typeof node.sharedSheetId === 'string' && node.sharedSheetId.length > 0
}

/** All members of a shared-sheet group, in tree order. */
export function collectSharedMembers(root: ProjectNode, sharedSheetId: string): ProjectNode[] {
  const out: ProjectNode[] = []
  const visit = (node: ProjectNode): void => {
    if (node.kind === 'item' && node.sharedSheetId === sharedSheetId) out.push(node)
    node.children.forEach(visit)
  }
  visit(root)
  return out
}

/** Distinct shared-sheet groups under a subtree (for the Add-Item picker). */
export function collectSharedGroups(root: ProjectNode): { id: string; name: string; memberIds: string[] }[] {
  const groups = new Map<string, { name: string; memberIds: string[] }>()
  const visit = (node: ProjectNode): void => {
    if (node.kind === 'item' && node.sharedSheetId) {
      const existing = groups.get(node.sharedSheetId)
      if (existing) existing.memberIds.push(node.id)
      else groups.set(node.sharedSheetId, { name: node.sharedSheetName ?? 'Shared sheet', memberIds: [node.id] })
    }
    node.children.forEach(visit)
  }
  visit(root)
  return Array.from(groups.entries()).map(([id, group]) => ({ id, ...group }))
}

/** Owner = first member in tree order; its snapshot seeds newly added members. */
export function findSharedOwner(root: ProjectNode, sharedSheetId: string): ProjectNode | null {
  return collectSharedMembers(root, sharedSheetId)[0] ?? null
}

/** The group's one print configuration, including projects saved before print areas were shared. */
export function findSharedPrintSource(root: ProjectNode, sharedSheetId: string): ProjectNode | null {
  const members = collectSharedMembers(root, sharedSheetId)
  return members.find((member) => member.print?.range) ?? members.find((member) => member.print) ?? members[0] ?? null
}

export function sharedSheetScopeKey(sharedSheetId: string): string {
  return `shared-sheet-${sharedSheetId}`
}

/** True when a stored workbook snapshot holds at least one cell. */
export function workbookHasContent(snapshot: unknown): boolean {
  if (!snapshot || typeof snapshot !== 'object') return false
  const sheets = (snapshot as { sheets?: Record<string, { cellData?: Record<string, unknown> }> }).sheets
  if (!sheets || typeof sheets !== 'object') return false
  return Object.values(sheets).some((sheet) => {
    const cells = sheet?.cellData
    return !!cells && Object.keys(cells).length > 0
  })
}

/**
 * Canonical grid source for a member editor: the first member holding
 * content. A member opening with a blank/stale copy adopts this instead of
 * showing (and then saving back) a blank grid over the group's content.
 */
export function findSharedContentSource(root: ProjectNode, sharedSheetId: string): ProjectNode | null {
  return collectSharedMembers(root, sharedSheetId).find((member) => workbookHasContent(member.spreadsheet)) ?? null
}

export function resolveSharedSheetName(node: ProjectNode, root: ProjectNode | null): string {
  if (node.sharedSheetName) return node.sharedSheetName
  if (root && node.sharedSheetId) {
    const owner = findSharedOwner(root, node.sharedSheetId)
    if (owner?.sharedSheetName) return owner.sharedSheetName
  }
  return 'Shared sheet'
}

/** Member ids (excluding `nodeId`) whose stored snapshot also needs rewriting. */
export function sharedSyncTargets(root: ProjectNode, nodeId: string): string[] {
  const node = findNode(root, nodeId)
  if (!node?.sharedSheetId) return []
  return collectSharedMembers(root, node.sharedSheetId)
    .map((member) => member.id)
    .filter((id) => id !== nodeId)
}
