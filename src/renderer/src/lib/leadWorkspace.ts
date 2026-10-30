import type { RateAnalysisRecipe } from '../types/rateAnalysis'
import type { ProjectItemGroup } from './projectItems'
import { morthLeadApplicability, morthMaterialInventory } from './morthMaterialLead'

/** DATA Sync already expands appendix materials; Lead must use that same recipe. */
export function leadMetadataForGroup(
  group: ProjectItemGroup,
  metadata: unknown,
  recipes: Record<string, RateAnalysisRecipe> = {}
): unknown {
  if (group.source === 'MORTH') {
    const current = group.usages.flatMap(({ node }) => {
      const recipe = recipes[node.id]
      return recipe?.morth ? [morthLeadApplicability(recipe)] : []
    })
    if (current.length) {
      metadata = {
        model: current[0].model,
        materials: Object.assign({}, ...current.map(row => row.materials)),
        classes: [...new Set(current.flatMap(row => row.classes))],
        handling_included_materials: [...new Set(current.flatMap(row => row.handling_included_materials))]
      }
    }
  }
  const addonIds = [...new Set(group.usages.map(({ node }) => node.dataVariant?.addonId).filter(Boolean))]
  if (!addonIds.length || !metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return metadata
  return { ...metadata, selected_addon_ids: addonIds }
}

/** Show appendix consumption on its parent usage, where Lead is charged once. */
export function leadAppendixSources(recipe: RateAnalysisRecipe | undefined, materialName: string): string[] {
  if (!recipe?.morth) return []
  const sources = new Map<string, { quantity: number | null; unit: string }>()
  for (const row of morthMaterialInventory(recipe)) {
    if (row.name.toLowerCase() !== materialName.toLowerCase() || !row.appendixPath?.length) continue
    const label = row.appendixPath.join(' → ')
    const previous = sources.get(label)
    sources.set(label, {
      quantity: row.quantity === null || previous?.quantity === null ? null : (previous?.quantity ?? 0) + row.quantity,
      unit: row.unit === '1000_litres' ? 'kL' : row.unit
    })
  }
  const quantity = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 6 })
  return [...sources].map(([label, row]) => `${label} · ${row.quantity === null ? 'Review quantity' : `${quantity.format(row.quantity)} ${row.unit} per DATA basis`}`)
}

export function showAllLeadData(variantId: string | undefined, showAllVariantId: string | null, hasScope: boolean, hasLinks: boolean): boolean {
  return !variantId || showAllVariantId === variantId || (!hasScope && !hasLinks)
}
