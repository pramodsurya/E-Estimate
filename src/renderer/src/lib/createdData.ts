import type { ProjectNode, SorCatalogueItemSelection } from '../types/project'

export type CreatedDataSourceFields = Pick<
  ProjectNode,
  | 'itemSource'
  | 'itemCode'
  | 'itemDescription'
  | 'itemEditorType'
  | 'unit'
  | 'categoryKey'
  | 'dataVariant'
  | 'sorCatalogue'
>

function cloneSorCatalogueSelection(
  selection: SorCatalogueItemSelection | undefined
): SorCatalogueItemSelection | undefined {
  if (!selection) return undefined
  return {
    ...selection,
    dimensions: { ...selection.dimensions },
    commercialTerms: selection.commercialTerms
      ? { ...selection.commercialTerms }
      : undefined
  }
}

/**
 * Source metadata that must follow an Item when it becomes a project-local DATA.
 *
 * SOR catalogue items are resolved by their catalogue code plus logical
 * dimensions. Dropping that selection leaves a `sor_catalogue` item that cannot
 * be prepared again for the active SOR year.
 */
export function createdDataSourceFields(source: ProjectNode): CreatedDataSourceFields {
  return {
    itemSource: source.itemSource,
    itemCode: source.itemCode,
    itemDescription: source.itemDescription,
    itemEditorType: source.itemEditorType ?? 'spreadsheet',
    unit: source.unit,
    categoryKey: source.categoryKey,
    dataVariant: source.dataVariant,
    sorCatalogue: cloneSorCatalogueSelection(source.sorCatalogue)
  }
}

/** SSR recipes and exact SOR catalogue cells can both become independent DATAs. */
export function canCreateDataFromItem(node: ProjectNode): boolean {
  if (node.kind !== 'item') return false
  if (node.itemSource === 'SSR') return true
  return node.itemSource === 'SOR' && Boolean(node.sorCatalogue)
}

/**
 * Repair catalogue DATAs created by builds that copied the category but omitted
 * the logical catalogue selection. The original Item is addressed by the
 * already-persisted `splitFromNodeId`.
 */
export function repairCreatedDataCatalogueSelections(root: ProjectNode): ProjectNode {
  const nodes = new Map<string, ProjectNode>()
  const index = (node: ProjectNode): void => {
    nodes.set(node.id, node)
    node.children.forEach(index)
  }
  index(root)

  const selectionFor = (
    node: ProjectNode,
    visited = new Set<string>()
  ): SorCatalogueItemSelection | undefined => {
    if (node.sorCatalogue) return cloneSorCatalogueSelection(node.sorCatalogue)
    if (!node.splitFromNodeId || visited.has(node.id)) return undefined
    visited.add(node.id)
    const source = nodes.get(node.splitFromNodeId)
    return source ? selectionFor(source, visited) : undefined
  }

  const repair = (node: ProjectNode): ProjectNode => {
    let childrenChanged = false
    const children = node.children.map((child) => {
      const repaired = repair(child)
      if (repaired !== child) childrenChanged = true
      return repaired
    })
    const selection =
      node.kind === 'item' &&
      node.itemSource === 'SOR' &&
      !node.sorCatalogue &&
      node.splitFromItemKey
        ? selectionFor(node)
        : undefined
    if (!childrenChanged && !selection) return node
    return {
      ...node,
      children,
      ...(selection ? { sorCatalogue: selection } : {})
    }
  }

  return repair(root)
}
