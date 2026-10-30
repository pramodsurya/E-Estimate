import type {
  RateAnalysisLine,
  RateAnalysisRecipe,
  RateAnalysisSectionKey
} from '../types/rateAnalysis'
import { individualCostGroupKey } from './individualCostIdentity'

export interface IndividualItemOutput {
  key: string
  owner: 'SSR' | 'MORTH'
  kind: RateAnalysisSectionKey
  description: string
  unit: string
  rate: number | null
  source: string
  usages: string[]
  local: boolean
  derived_from?: string
  factor?: number
}

/** A rate input is shared only when its source identity, unit and adopted rate agree. */
export function individualItemsOutput(recipes: RateAnalysisRecipe[]) {
  const groups = new Map<string, IndividualItemOutput>()
  const lineKeys = new WeakMap<RateAnalysisLine, string>()
  const visited = new Set<RateAnalysisRecipe>()
  function walk(recipe: RateAnalysisRecipe, scope: string) {
    if (visited.has(recipe) || recipe.itemSource === 'SOR') return
    visited.add(recipe)
    const owner = recipe.itemSource === 'MORTH' ? 'MORTH' : 'SSR'
    for (const section of recipe.sections)
      for (const line of section.lines) {
        const input = recipe.morth?.inputs?.[line.id]
        // Applied Lead is priced in the Lead workspace, not as a second resource input.
        if (input?.raw.material_lead_charge === true) continue
        const dependency = input?.dependency
        const local = Boolean(
          line.editedFields?.some(
            (field) => field === 'rate' || field === 'amount'
          ) &&
          !line.individualCost &&
          !line.rateOverride
        )
        if (dependency && !local) {
          walk(dependency, `${scope}/${line.id}`)
          continue
        }
        const description = line.description.trim()
        if (
          /^(?:nil|nill|none|n\s*\/?\s*a|unit|description|total|sub[ -]?total|[-–—.]+)?$/i.test(
            description
          ) &&
          !line.quantity &&
          !line.rate &&
          !line.amount
        )
          continue
        const rate =
          recipe.morth?.inputs[line.id]?.rate === null
            ? null
            : Number.isFinite(line.rate)
              ? line.rate
              : null
        const identity = line.individualCostInput
          ? individualCostGroupKey(line.individualCostInput)
          : JSON.stringify([
              owner,
              section.key,
              description,
              line.unit,
              line.rateSource
            ])
        const key = JSON.stringify([
          identity,
          rate,
          local ? [scope, recipe.itemKey, line.id] : 'shared'
        ])
        const row = groups.get(key) ?? {
          key,
          owner,
          kind: section.key,
          description: description || 'Unnamed resource',
          unit: line.unit,
          rate,
          source: line.rateSource ?? line.individualCost?.label ?? '',
          usages: [],
          local
        }
        const usage = recipe.itemCode
        if (!row.usages.includes(usage)) row.usages.push(usage)
        groups.set(key, row)
        lineKeys.set(line, key)
      }
    // Preserve the original 6 cum truck's hourly-to-tonne-km relationship in Excel.
    const machinery =
      recipe.sections.find((section) => section.key === 'machinery')?.lines ??
      []
    const hourly = machinery.find(
      (line) =>
        recipe.morth?.inputs[line.id]?.raw.resource_key ===
        'morth:transit_truck_agitator_6_cum'
    )
    for (const line of machinery) {
      const raw = recipe.morth?.inputs[line.id]?.raw
      const key = lineKeys.get(line),
        parent = hourly && lineKeys.get(hourly)
      if (
        key &&
        parent &&
        raw?.transport_rate_derived === true &&
        !groups.get(key)?.local
      ) {
        Object.assign(groups.get(key)!, {
          derived_from: parent,
          factor: 1 / 180
        })
      }
    }
    const addition = recipe.dataVariant?.additionAnalysis
    if (addition)
      walk(
        {
          ...recipe,
          itemKey: recipe.itemKey + ':addition',
          morth: undefined,
          dataVariant: undefined,
          sections: addition.sections
        },
        scope + ':addition'
      )
  }
  recipes.forEach((recipe, index) => walk(recipe, `usage-${index}`))
  const order = { materials: 0, machinery: 1, labour: 2 }
  return {
    rows: [...groups.values()].sort(
      (a, b) =>
        order[a.kind] - order[b.kind] ||
        a.description.localeCompare(b.description, undefined, {
          numeric: true
        }) ||
        a.owner.localeCompare(b.owner)
    ),
    lineKeys
  }
}
