import type { ProjectNode } from '../types/project'
import type { SorAnnual, SorRecipe } from '../types/sor'

/** The annual publication owns the description; permanent recipes can be abbreviated. */
export function sorItemDescription(
  annual?: Pick<SorAnnual, 'to_be_printed' | 'description'>,
  recipe?: Pick<SorRecipe, 'description'>,
  fallback = ''
): string {
  return annual?.to_be_printed?.description?.trim() ||
    annual?.description?.trim() || recipe?.description?.trim() || fallback
}

/** Printed SOR identity comes from the book, never the catalogue lookup key. */
export function printedItemCode(node: Pick<ProjectNode, 'itemSource' | 'itemCode' | 'sorCatalogue'>): string {
  if (node.itemSource !== 'SOR') return node.itemCode ?? ''
  const code = node.sorCatalogue?.annual.item_code?.trim() ?? ''
  return /^(?:SOR-|P\d+-T\d+(?:$|-))/i.test(code) ? '' : code
}

export function printedItemDescription(node: Pick<ProjectNode, 'itemSource' | 'sorCatalogue' | 'itemDescription' | 'name'>): string {
  if (node.itemSource === 'SOR') {
    const published = sorItemDescription(node.sorCatalogue?.annual, node.sorCatalogue?.recipe)
    if (published) return published
  }
  return node.itemDescription || node.name
}
