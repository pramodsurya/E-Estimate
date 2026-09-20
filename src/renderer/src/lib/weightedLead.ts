import type { LeadApplication, LeadVariant, ProjectNode } from '../types/project'

export interface WeightedLeadEntryInput {
  variantId: string
  variantName: string
  leadKm: number
  quantity: number
  /** Quantity unit from the first contributing Lead application ("cum", "MT", …). */
  unit: string
}

export interface WeightedLeadScopeGroup {
  key: string
  usages: { node: { id: string }; path: { id: string }[] }[]
}

/** Applied stone quantity behind one application (output units win). */
export function applicationWeight(
  application: Pick<LeadApplication, 'outputQuantity' | 'quantity'>
): number {
  const value = application.outputQuantity ?? application.quantity
  return Number.isFinite(value) && value > 0 ? value : 0
}

/**
 * One entry per applied, non-weighted lead: weight w(n) is the variant's total
 * applied quantity, length l(n) its actual (or chart) lead. Weighted leads are
 * never entries, so averages cannot recurse into themselves.
 */
export function weightedLeadEntries(
  variants: LeadVariant[],
  applications: LeadApplication[]
): WeightedLeadEntryInput[] {
  return variants
    .filter((variant) => !variant.weightedLead)
    .map((variant) => {
      const own = applications.filter((application) => application.variantId === variant.id)
      return {
        variantId: variant.id,
        variantName: variant.componentName || variant.variantName || variant.materialName,
        leadKm: variant.actualLeadKm ?? variant.leadKm,
        quantity: own.reduce((sum, application) => sum + applicationWeight(application), 0),
        unit: own[0]?.unit || ''
      }
    })
    .filter((entry) => entry.quantity > 0)
}

/** Names of live leads with no applied quantity (blockers for averaging). */
export function unappliedLeadNames(
  variants: LeadVariant[],
  applications: LeadApplication[]
): string[] {
  const applied = new Set(applications.map((application) => application.variantId))
  return variants
    .filter((variant) => !variant.weightedLead && !applied.has(variant.id))
    .map((variant) => variant.componentName || variant.variantName || variant.materialName)
}

/** (w1*l1 + w2*l2 + …) / W. Empty input gives a zero average, never NaN. */
export function weightedAverageKm(entries: { leadKm: number; quantity: number }[]): {
  avgKm: number
  totalQuantity: number
} {
  let weightedSum = 0
  let totalQuantity = 0
  for (const entry of entries) {
    if (!(entry.quantity > 0) || !Number.isFinite(entry.leadKm)) continue
    weightedSum += entry.quantity * entry.leadKm
    totalQuantity += entry.quantity
  }
  return { avgKm: totalQuantity > 0 ? weightedSum / totalQuantity : 0, totalQuantity }
}

/**
 * Component/sub-component names that use the material but have no lead applied
 * to a directly-owned item. A group-level (itemNodeId-less) application counts
 * when its item is used directly under the component.
 */
export function uncoveredLeadScopes(
  root: ProjectNode,
  groups: WeightedLeadScopeGroup[],
  applications: LeadApplication[]
): string[] {
  const directParentOf = new Map<string, string>()
  const directKeysOf = new Map<string, Set<string>>()
  for (const group of groups) {
    for (const usage of group.usages) {
      const parent = usage.path[usage.path.length - 1]
      if (!parent) continue
      directParentOf.set(usage.node.id, parent.id)
      let keys = directKeysOf.get(parent.id)
      if (!keys) {
        keys = new Set<string>()
        directKeysOf.set(parent.id, keys)
      }
      keys.add(group.key)
    }
  }
  const missing: string[] = []
  const visit = (node: ProjectNode): void => {
    if (node.kind === 'component' || node.kind === 'subcomponent') {
      const keys = directKeysOf.get(node.id)
      if (keys && keys.size > 0) {
        const covered = applications.some((application) =>
          application.itemNodeId
            ? directParentOf.get(application.itemNodeId) === node.id
            : (directKeysOf.get(node.id) ?? new Set<string>()).has(application.itemKey)
        )
        if (!covered) missing.push(node.name)
      }
    }
    node.children.forEach(visit)
  }
  visit(root)
  return missing
}
