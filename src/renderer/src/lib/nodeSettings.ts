// Shared page/layout settings defaults and inheritance resolution.

import type { EestimateProject, NodeSettings, ProjectNode } from '../types/project'
import { findNode } from './tree'

export const SETTINGS_DEFAULTS: Required<NodeSettings> = {
  pageSize: 'A4',
  orientation: 'portrait',
  margins: { top: 20, right: 15, bottom: 20, left: 25 },
  borders: true,
  printArea: 'constrain-columns'
}

/** Build the path of nodes from the root down to (and including) the target. */
function pathToNode(root: ProjectNode, id: string, trail: ProjectNode[] = []): ProjectNode[] | null {
  const next = [...trail, root]
  if (root.id === id) return next
  for (const child of root.children) {
    const found = pathToNode(child, id, next)
    if (found) return found
  }
  return null
}

/**
 * Resolve effective page settings for a node by merging every `settings`
 * override along the root → node path. Closer ancestors and the node itself
 * win. Falls back to {@link SETTINGS_DEFAULTS}.
 */
export function resolveNodeSettings(
  root: ProjectNode,
  nodeId: string
): Required<NodeSettings> {
  const path = pathToNode(root, nodeId) ?? [root]
  const merged: Required<NodeSettings> = {
    ...SETTINGS_DEFAULTS,
    margins: { ...SETTINGS_DEFAULTS.margins }
  }
  for (const node of path) {
    const s = node.settings
    if (!s) continue
    if (s.pageSize) merged.pageSize = s.pageSize
    if (s.orientation) merged.orientation = s.orientation
    if (s.borders !== undefined) merged.borders = s.borders
    if (s.printArea) merged.printArea = s.printArea
    if (s.margins) merged.margins = { ...merged.margins, ...s.margins }
  }
  return merged
}

/** Convenience: resolve settings for a node id within a project (or defaults). */
export function resolveProjectNodeSettings(
  project: EestimateProject | null,
  nodeId: string | null
): Required<NodeSettings> {
  if (!project || !nodeId) {
    return { ...SETTINGS_DEFAULTS, margins: { ...SETTINGS_DEFAULTS.margins } }
  }
  const node = findNode(project.root, nodeId)
  if (!node) return { ...SETTINGS_DEFAULTS, margins: { ...SETTINGS_DEFAULTS.margins } }
  return resolveNodeSettings(project.root, nodeId)
}
