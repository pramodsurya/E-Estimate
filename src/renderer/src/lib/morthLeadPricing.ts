import { concreteTransportParameter } from './morthMaterialLead'
import type { LeadApplication, LeadVariant } from '../types/project'
import type { RateAnalysisRecipe, RateAnalysisLine } from '../types/rateAnalysis'
import { morthLeadPricingReady, morthLeadPricingSignature, morthLeadSourceSignature, morthLeadVariantSignature, morthQuantityForLead, normalizeMorthLeadApplications } from './morthMaterialLead'

/** Rebase applications to an appendix; amounts and quantities are already on its own DATA basis. */
export function morthApplicationsAtPath(applications: LeadApplication[], path: string[]): LeadApplication[] {
  return applications.filter(app => path.every((id, index) => app.morthAppendixPath?.[index] === id))
    .map(app => ({ ...app, morthAppendixPath: app.morthAppendixPath?.slice(path.length) }))
}

/** Remove derived Lead rows before every recalculation. Never compound a previous application. */
export function withoutMorthLead(recipe: RateAnalysisRecipe): RateAnalysisRecipe {
  if (!recipe.morth) return recipe
  const inputs = Object.fromEntries(Object.entries(recipe.morth.inputs)
    .filter(([, input]) => input.raw.material_lead_charge !== true)
    .map(([id, input]) => [id, { ...input, ...(input.dependency ? { dependency: withoutMorthLead(input.dependency) } : {}) }]))
  return {
    ...recipe,
    sections: recipe.sections.map(section => ({ ...section, lines: section.lines.filter(line => recipe.morth?.inputs[line.id]?.raw.material_lead_charge !== true) })),
    morth: {
      ...recipe.morth, inputs, appliedLeadApplications: [], appliedLeadVariants: [], leadPricingSignature: undefined, leadPricingBaseAmount: undefined, transportLeadKm: undefined,
      source: Object.fromEntries(Object.entries(recipe.morth.source).map(([key, value]) => [key,
        ['materials', 'machinery', 'labour'].includes(key) && Array.isArray(value) ? value.filter(raw => raw.material_lead_charge !== true) : value
      ]))
    }
  }
}

function attachCharges(recipe: RateAnalysisRecipe, applications: LeadApplication[], variants: LeadVariant[]): RateAnalysisRecipe {
  if (!recipe.morth) return recipe
  const inputs = Object.fromEntries(Object.entries(recipe.morth.inputs).map(([id, input]) => [id, {
    ...input,
    ...(input.dependency ? { dependency: attachCharges(input.dependency, morthApplicationsAtPath(applications, [id]), variants) } : {})
  }]))
  const materials = [...(Array.isArray(recipe.morth.source.materials) ? recipe.morth.source.materials : [])]
  const lines: RateAnalysisLine[] = []
  const transportLeadKm: Record<string, number> = {}
  const appliedLeadApplications: LeadApplication[] = []
  for (const app of applications.filter(application => (application.morthAppendixPath?.length ?? 0) === 0)) {
    const variant = variants.find(candidate => candidate.id === app.variantId && candidate.active !== false)
    if (!variant || app.morthLeadVariantSignature !== morthLeadVariantSignature(variant) || app.rateYear !== recipe.year || app.rateZone !== recipe.zone) continue
    try {
      const required = morthQuantityForLead(recipe, variant, true)
      if (required.unit !== app.unit || Math.abs(required.quantity - app.quantity) > 1e-6 * Math.max(1, Math.abs(required.quantity)) || !Number.isFinite(app.grossRate) || !Number.isFinite(app.grossAmount)) continue
      if (variant.materialName === 'Concrete delivery') {
        const distance = variant.actualLeadKm ?? variant.leadKm;
        if (!Number.isFinite(distance) || distance < 0) continue;
        for (const input of Object.values(inputs)) {
          const parameter = concreteTransportParameter(input.raw);
          if (parameter) transportLeadKm[parameter] = distance;
        }
        continue; // Native machinery row owns the entire transport amount.
      }
      const id = `materials-${materials.length}`
      appliedLeadApplications.push(app)
      const description = `${variant.materialName} Lead · ${variant.variantName || `${variant.leadKm ?? 0} km`}`
      const unit = app.unit === '1000_litres' ? 'kL' : app.unit
      const raw = { desc: description, resource_key: `project:material_lead:${app.id}`, material_lead_charge: true, material_lead_route_signature: app.morthLeadVariantSignature, quantity: app.quantity, unit }
      materials.push(raw)
      const rate = app.grossRate
      inputs[id] = { raw, rate }
      lines.push({ id, slNo: String(materials.length), description, unit, quantity: app.quantity, rate, amount: app.grossAmount, rateSource: 'Applied material Lead' })
    } catch {
      // Invalid or superseded applications remain pending; they never enter an unrelated analysis.
    }
  }
  const sections = recipe.sections.map(section => section.key === 'materials' ? { ...section, lines: [...section.lines, ...lines] } : section)
  if (lines.length && !sections.some(section => section.key === 'materials')) sections.unshift({ key: 'materials', label: 'Materials', lines })
  return {
    ...recipe, sections,
    morth: { ...recipe.morth, inputs, transportLeadKm, appliedLeadApplications, appliedLeadVariants: variants.filter(variant => appliedLeadApplications.some(app => app.variantId === variant.id)), source: { ...recipe.morth.source, materials }, leadPricingBaseAmount: recipe.morth.startingSummary?.totalCost, leadPricingSignature: morthLeadPricingSignature(applications) }
  }
}

/** A private tree per item usage; native dependency arithmetic owns all rounding and percentages. */
export async function priceMorthLead(recipe: RateAnalysisRecipe, applications: LeadApplication[], variants: LeadVariant[]): Promise<RateAnalysisRecipe> {
  applications = normalizeMorthLeadApplications(recipe, applications, variants)
  if (!recipe.morth || morthLeadPricingReady(recipe, applications)) return recipe
  const { prepareMorthRecipe } = await import('./morthEstimate')
  const base = await prepareMorthRecipe(withoutMorthLead(recipe))
  const priced = await prepareMorthRecipe(attachCharges(base, applications, variants))
  const stamp = (current: RateAnalysisRecipe): void => {
    if (!current.morth) return
    for (const input of Object.values(current.morth.inputs)) if (input.dependency) stamp(input.dependency)
    current.morth.leadPricingInputSignature = morthLeadSourceSignature(current)
  }
  stamp(priced)
  return priced
}
