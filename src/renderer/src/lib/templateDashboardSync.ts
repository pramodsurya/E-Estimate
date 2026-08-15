import type { ProjectNode } from '../types/project'
import {
  GUIDE_WALL_DEFAULT_BASE_CODE,
  GUIDE_WALL_DEFAULT_EXCAVATION_CODE,
  GUIDE_WALL_DEFAULT_WALL_CODE
} from './guideWall'
import { unresolvedBundMaterialCodes } from './bund'
import { migrateMiSluiceNewData, unresolvedMiSluiceNewMaterialCodes } from './miSluiceNew'
import { fetchSsrItems, type MasterItem } from './masterData'

export interface TemplateMaterialActions {
  setGuideWallMaterial: (
    nodeId: string,
    role: 'wall' | 'base' | 'excavation',
    item: MasterItem
  ) => void
  resolveBundMaterials: (nodeId: string, masters: MasterItem[]) => string[]
  resolveMiSluiceNewMaterials: (nodeId: string, masters: MasterItem[]) => string[]
}

/**
 * Resolve bare template material references before an aggregate component or
 * project sync. Detailed template screens never need their own Sync button.
 */
export async function resolveTemplateDashboardMaterials(
  root: ProjectNode,
  actions: TemplateMaterialActions
): Promise<void> {
  const nodes: ProjectNode[] = []
  const visit = (node: ProjectNode): void => {
    if (
      node.templateId === 'guide-wall' ||
      node.templateId === 'bund' ||
      node.templateId === 'mi-sluice-new'
    ) {
      nodes.push(node)
    }
    node.children.forEach(visit)
  }
  visit(root)

  const guideNodes = nodes.filter(
    (node) =>
      node.templateId === 'guide-wall' &&
      node.guideWall &&
      (!node.guideWall.wallMaterial.unit ||
        !node.guideWall.baseMaterial.unit ||
        !node.guideWall.excavationMaterial)
  )
  const bundPending = nodes.flatMap((node) =>
    node.templateId === 'bund' && node.bund
      ? unresolvedBundMaterialCodes(node.bund).map((code) => ({ node, code }))
      : []
  )
  const sluicePending = nodes.flatMap((node) =>
    node.templateId === 'mi-sluice-new' && node.miSluiceNew
      ? unresolvedMiSluiceNewMaterialCodes(migrateMiSluiceNewData(node.miSluiceNew)).map((code) => ({
          node,
          code
        }))
      : []
  )
  const prefixes = new Set<string>()
  if (guideNodes.length) prefixes.add('IRR-CCDW')
  for (const { code } of [...bundPending, ...sluicePending]) {
    prefixes.add(code.split('-').slice(0, 2).join('-'))
  }
  if (!prefixes.size) return

  const masters = (
    await Promise.all(Array.from(prefixes, (prefix) => fetchSsrItems(prefix)))
  ).flat()
  const byCode = new Map(masters.map((master) => [master.code, master]))

  for (const node of guideNodes) {
    const data = node.guideWall
    if (!data) continue
    const wall = byCode.get(GUIDE_WALL_DEFAULT_WALL_CODE)
    const base = byCode.get(GUIDE_WALL_DEFAULT_BASE_CODE)
    const excavation = byCode.get(GUIDE_WALL_DEFAULT_EXCAVATION_CODE)
    if (!data.wallMaterial.unit && wall) actions.setGuideWallMaterial(node.id, 'wall', wall)
    if (!data.baseMaterial.unit && base) actions.setGuideWallMaterial(node.id, 'base', base)
    if (!data.excavationMaterial && excavation) {
      actions.setGuideWallMaterial(node.id, 'excavation', excavation)
    }
  }

  for (const node of nodes) {
    if (node.templateId !== 'bund' || !node.bund) continue
    const pending = unresolvedBundMaterialCodes(node.bund)
    if (!pending.length) continue
    const remaining = actions.resolveBundMaterials(node.id, masters)
    if (remaining.length) {
      throw new Error(`Could not resolve template code(s): ${remaining.join(', ')}`)
    }
  }

  for (const { node } of dedupeByNode(sluicePending)) {
    const remaining = actions.resolveMiSluiceNewMaterials(node.id, masters)
    if (remaining.length) {
      throw new Error(`Could not resolve template code(s): ${remaining.join(', ')}`)
    }
  }
}

/** One entry per node — a node with several bare codes is resolved in one pass. */
function dedupeByNode(entries: { node: ProjectNode; code: string }[]): { node: ProjectNode }[] {
  const seen = new Set<string>()
  return entries.filter(({ node }) => {
    if (seen.has(node.id)) return false
    seen.add(node.id)
    return true
  })
}
