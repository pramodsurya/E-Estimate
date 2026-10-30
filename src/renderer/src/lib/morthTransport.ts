import type { RateAnalysisRecipe } from '../types/rateAnalysis'
import { concreteTransportParameter } from './morthMaterialLead'

/** Show the source coefficient multiplied by the effective lead distance. */
export function morthTransportQuantityLabel(recipe: RateAnalysisRecipe, raw: Record<string, unknown>): string | undefined {
  const parameter = concreteTransportParameter(raw)
  if (!parameter) return undefined
  const expression = raw.quantity_expression as Record<string, unknown>
  if (expression.type !== 'affine' || Number(expression.constant ?? 0) !== 0) return undefined
  const coefficient = expression.coefficient
  if (typeof coefficient !== 'number' || !Number.isFinite(coefficient)) return undefined
  const format = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 8 })
  return `${format.format(coefficient)} × ${format.format(morthTransportDistance(recipe, parameter).km)}`
}

export function morthTransportDistance(recipe: RateAnalysisRecipe, parameter: string) {
  const manual = recipe.morth?.transportManualKm?.[parameter]
  const lead = recipe.morth?.transportLeadKm?.[parameter]
  if (manual !== undefined && Number.isFinite(manual) && manual >= 0) return { km: manual, source: 'Manual' as const }
  if (lead !== undefined && Number.isFinite(lead) && lead >= 0) return { km: lead, source: 'From Lead' as const }
  return { km: 1, source: 'Default' as const }
}

export function withMorthManualDistance(recipe: RateAnalysisRecipe, path: string[], parameter: string, km: number | undefined): RateAnalysisRecipe {
  if (!recipe.morth) throw new Error('MoRTH analysis is unavailable.')
  if (km !== undefined && (!Number.isFinite(km) || km < 0)) throw new Error('Enter a finite nonnegative distance in km.')
  if (path.length) {
    const [id, ...rest] = path, input = recipe.morth.inputs[id]
    if (!input?.dependency) throw new Error('The consuming appendix is unavailable.')
    return { ...recipe, morth: { ...recipe.morth, inputs: { ...recipe.morth.inputs, [id]: { ...input, dependency: withMorthManualDistance(input.dependency, rest, parameter, km) } } } }
  }
  const manual = { ...recipe.morth.transportManualKm }
  if (km === undefined) delete manual[parameter]
  else manual[parameter] = km
  return { ...recipe, morth: { ...recipe.morth, transportManualKm: manual } }
}
