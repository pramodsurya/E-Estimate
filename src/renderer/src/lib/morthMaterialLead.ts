import type { ConveyanceClass, LeadApplication, LeadVariant } from '../types/project'
import type { RateAnalysisRecipe } from '../types/rateAnalysis'
import materialMappings from './morthLeadMaterials'

// Stable source identities from the 2026-10-24 catalogue audit. Never remove a
// row because its caption happens to mention transport or a mobile machine.
export const MORTH_LEAD_MODEL = 'morth-material-lead-v1'
const pureCarriage = new Set([
  'morth:tipper_18_cum_transport_tkm', 'morth:tipper_14_cum_transport_tkm',
  'morth:tipper_10_cum_transport_tkm', 'morth:tipper_10_cum_transport_tkm_tunnel',
  'morth:transit_truck_agitator_6_cum_transport_tkm', 'morth:trailer_30_tonne_transport_tkm'
])
const combined = new Set([
  'morth:water_tanker_16_kl', 'morth:water_tanker_12_kl', 'morth:water_tanker_6_kl',
  'morth:trailer_30_tonne_structural_hours'
])
type Raw = Record<string, unknown>
const object = (v: unknown): Raw => v && typeof v === 'object' && !Array.isArray(v) ? v as Raw : {}
const list = (v: unknown): Raw[] => Array.isArray(v) ? v.map(object) : []
const number = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null
  const parsed = Number(typeof v === 'string' ? v.replaceAll(',', '') : v)
  return Number.isFinite(parsed) ? parsed : null
}

export interface MorthLeadMaterial {
  identity: string
  name: string
  conveyanceClass: ConveyanceClass
  quantity: number | null
  unit: string
  usagePath: string
  manualRateOnly?: boolean
  handlingIncluded?: boolean
  error?: string
}
interface TransportBinding {
  mode: 'excluded' | 'fixed' | 'operations'
  fixedQuantity?: number
  parameter: string
}
export function morthTransportBinding(raw: Raw): TransportBinding | null {
  const key = String(raw.material_lead_source_key ?? raw.resource_key ?? '')
  const expression = object(raw.quantity_expression)
  if (pureCarriage.has(key)) return { mode: 'excluded', parameter: String(expression.parameter ?? '') }
  if (combined.has(key) && raw.material_lead_fixed_operations === true && expression.type === 'parameter')
    return { mode: 'operations', parameter: String(expression.parameter) }
  // A capacity substitution has a new, explicitly supplied operating-hour
  // parameter. Do not reuse the original vehicle's fixed hours for it.
  if (combined.has(key) && expression.type === 'affine' && expression.parameter_unit === 'km' &&
      number(expression.constant) !== null && number(expression.coefficient) !== null) {
    return { mode: 'fixed', fixedQuantity: Number(expression.constant), parameter: String(expression.parameter) }
  }
  return null
}
export function activeMorthRow(raw: Raw): Raw {
  const binding = morthTransportBinding(raw)
  return binding ? { ...raw, material_lead: { version: MORTH_LEAD_MODEL, ...binding } } : raw
}
export function morthRowIsExcluded(raw: Raw): boolean {
  return morthTransportBinding(raw)?.mode === 'excluded'
}

function converted(quantity: number | null, unit: string, cls: ConveyanceClass): { quantity: number | null; unit: string } {
  const u = unit.toLowerCase().replace(/\s/g, '')
  const target = cls === 'CEMENT' || cls === 'STEEL' ? 'tonne' : cls === 'WATER' ? '1000_litres' : cls === 'BRICKS' ? '1000_nos' : 'cum'
  const factors: Record<string, Record<string, number>> = {
    tonne: { tonne: 1, tonnes: 1, mt: 1, kg: .001, quintal: .1 },
    cum: { cum: 1, m3: 1, 'm³': 1 },
    '1000_litres': { kl: 1, cum: 1, m3: 1, litre: .001, litres: .001, '1000_litres': 1 },
    '1000_nos': { each: .001, no: .001, nos: .001, '1000_nos': 1 }
  }
  const factor = factors[target]?.[u]
  return { quantity: quantity === null || factor === undefined ? null : quantity * factor, unit: target }
}
function rowQuantity(recipe: RateAnalysisRecipe, id: string, raw: Raw): number | null {
  const expression = object(raw.quantity_expression)
  if (Object.keys(expression).length) {
    const value = number(recipe.morth?.parameters[String(expression.parameter)])
    if (value === null || (expression.positive === true && value <= 0) || !['parameter','affine'].includes(String(expression.type))) return null
  } else if (number(raw.quantity) === null) return null
  // Use native signed quantities, including expression evaluation. Inventory
  // only scales dependency consumption; it never recalculates DATA arithmetic.
  return number(object(object(recipe.morth?.startingSummary?.computedLines)[id]).quantity)
}

/** Expand consumption per dependency edge; deduplicate definitions, never usages. */
export function morthMaterialInventory(recipe: RateAnalysisRecipe): MorthLeadMaterial[] {
  if (!recipe.morth) return []
  const inventory: MorthLeadMaterial[] = []
  const mappings = materialMappings as Record<string, { name: string; conveyanceClass: ConveyanceClass }>
  const walk = (current: RateAnalysisRecipe, scale: number | null, path: string, ancestors: Set<RateAnalysisRecipe>): void => {
    if (!current.morth || ancestors.has(current)) {
      inventory.push({ identity: path, name: 'Material delivery', conveyanceClass: 'STEEL', quantity: null, unit: 'tonne', usagePath: path, error: 'Circular or unavailable material dependency' })
      return
    }
    const visited = new Set(ancestors).add(current)
    const source = current.morth.source
    for (const section of ['materials', 'machinery', 'labour']) {
      for (const [index, raw] of list(source[section]).entries()) {
        const id = `${section}-${index}`, key = String(raw.resource_key ?? '')
        const input = current.morth.inputs[id]
        const usagePath = `${path}/${key || id}:${index}`
        const q = rowQuantity(current, id, raw)
        const signed = q === null || scale === null ? null : q * scale
        const dependency = input?.dependency
        if (dependency) {
          const childScale = signed === null || dependency.outputQuantity <= 0 ? null : signed / dependency.outputQuantity
          // rate_multiplier is an explicit source unit factor on the dependency edge.
          walk(dependency, childScale === null ? null : childScale * (number(object(raw.price_lookup).rate_multiplier) ?? 1), usagePath, visited)
        } else if (section === 'materials' && mappings[key]) {
          const mapping = mappings[key], value = converted(signed, String(raw.unit ?? ''), mapping.conveyanceClass)
          inventory.push({ identity: key, ...mapping, ...value, usagePath,
            ...(value.quantity === null ? { error: `Review material quantity/unit: ${raw.desc}` } : {}) })
        }
        const binding = morthTransportBinding(raw)
        if (!binding) continue
        // Water and steel are bound to their physical material inventory below.
        if (binding.mode !== 'excluded') continue
        const parameter = binding.parameter
        let name = 'Material delivery'
        if (key.includes('transit_truck') || /concrete|shotcrete/.test(parameter)) name = 'Concrete delivery'
        else if (/hot_mix|fresh_mix/.test(parameter)) name = 'Hot mix delivery'
        else if (/girder|fascia/.test(parameter)) name = 'Precast delivery'
        else if (/tunnel/.test(parameter)) name = 'Disposal material'
        else if (/steel|reinforcement/.test(parameter)) name = 'Steel'
        const localMaterials = inventory.filter(row => row.usagePath.startsWith(path + '/'))
        if (name === 'Steel' && localMaterials.some(row => row.name === 'Steel')) continue
        if (name === 'Material delivery') {
          const expected = /aggregate/.test(parameter) ? 'Stone' : /borrow|fill/.test(parameter) ? 'Earth' : null
          if (expected ? localMaterials.some(row => row.name === expected) : localMaterials.length > 0) continue
        }
        // A mass-distance coefficient supplies tonnes, never an invented density.
        // Fixed tonne-km without a reviewed distance stays explicitly unresolved.
        const expression = object(raw.quantity_expression)
        const mass = raw.unit === 'tonne-km' && expression.type === 'affine' && number(expression.constant) === 0 ? number(expression.coefficient) : null
        inventory.push({ identity: `${current.itemCode}:${key}`, name, conveyanceClass: 'STEEL',
          quantity: mass === null || scale === null ? null : mass * scale * (number(raw.sign) ?? 1), unit: 'tonne', usagePath,
          handlingIncluded: name === 'Concrete delivery' && list(source.machinery).some(row => row.resource_key === 'morth:transit_truck_agitator_6_cum'),
          manualRateOnly: name !== 'Steel', ...(mass === null ? { error: `Review physical material quantity for ${raw.desc}` } : {}) })
      }
    }
    // Every split must have a physical replacement, even if the source material
    // is missing or a dependency was replaced with a manual supply rate.
    for (const raw of list(source.machinery)) {
      const binding = morthTransportBinding(raw)
      if (!binding || binding.mode === 'excluded') continue
      const name = String(raw.material_lead_source_key ?? raw.resource_key).includes('water_tanker') ? 'Water' : 'Steel'
      for (const entry of inventory)
        if (entry.usagePath.startsWith(path + '/') && entry.name === name) entry.handlingIncluded = true
      if (!inventory.some(entry => entry.usagePath.startsWith(path + '/') && entry.name === name))
        inventory.push({ identity: `${current.itemCode}:${raw.resource_key}`, name,
          conveyanceClass: name === 'Water' ? 'WATER' : 'STEEL', quantity: null,
          unit: name === 'Water' ? '1000_litres' : 'tonne', usagePath: path,
          error: `Review ${name} quantity for material Lead` })
    }
  }
  walk(recipe, 1, recipe.itemCode, new Set())
  return inventory
}

export function morthLeadApplicability(recipe: RateAnalysisRecipe): unknown {
  const inventory = morthMaterialInventory(recipe)
  const materials = Object.fromEntries(inventory.map(row => [row.name, row.conveyanceClass]))
  return { materials, classes: [...new Set(Object.values(materials))], model: MORTH_LEAD_MODEL,
    handling_included_materials: [...new Set(inventory.filter(row => row.handlingIncluded).map(row => row.name))] }
}
export function morthLeadVariantSignature(variant: LeadVariant): string {
  return JSON.stringify({
    material: variant.materialName, class: variant.conveyanceClass,
    source: variant.startPointId, destination: variant.endPointId, via: variant.viaPointIds,
    distance: variant.leadKm, actualDistance: variant.actualLeadKm, lift: variant.liftM,
    includedBasis: variant.includedBasis, handling: variant.handlingMode,
    includedLift: variant.includedInitialLiftM, allLifts: variant.includesAllLifts,
    reachesFinalPoint: variant.mechanicalConveyanceReachesFinalPoint,
    rateSource: variant.rateSource, customRate: variant.customGrossRate, chargeCode: variant.chargeCode,
    weightedLead: variant.weightedLead
  })
}
/** Adopt the final rate after adding Lead to the complete native DATA amount. */
export function morthFinalRate(recipe: RateAnalysisRecipe, baseAmount: number, applications: LeadApplication[]): number {
  const amount = baseAmount + applications.reduce((sum, app) => sum + app.grossAmount, 0)
  const rate = amount / recipe.outputQuantity
  return Math.sign(rate) * Math.round(Math.abs(rate) * 100) / 100
}
export function morthQuantityForLead(recipe: RateAnalysisRecipe, variant: Pick<LeadVariant, 'materialName' | 'conveyanceClass' | 'rateSource' | 'customGrossRate'>) {
  const matches = morthMaterialInventory(recipe).filter(row => row.name.toLowerCase() === variant.materialName.toLowerCase() && row.conveyanceClass === variant.conveyanceClass)
  if (!matches.length || matches.some(row => row.quantity === null || row.error))
    throw new Error(`Review the exact ${variant.materialName} quantity and unit before applying Lead.`)
  if (matches.some(row => row.manualRateOnly) && (variant.rateSource === 'chart' || number(variant.customGrossRate) === null || Number(variant.customGrossRate) < 0))
    throw new Error(`${variant.materialName} needs an explicit material Lead rate; a general SOR tariff does not establish this delivery scope.`)
  return { quantity: matches.reduce((sum, row) => sum + row.quantity!, 0), unit: matches[0].unit,
    source: matches.map(row => `${row.identity}: ${row.quantity} ${row.unit} (${row.usagePath})`).join('; ') }
}

/** Base arithmetic can be ready while material Lead is still pending. */
export function morthLeadIssues(recipe: RateAnalysisRecipe, applications: LeadApplication[], variants: LeadVariant[]): string[] {
  if (!recipe.morth) return []
  if (recipe.morth.costingBasis !== MORTH_LEAD_MODEL) return ['Sync MoRTH DATA to use material Lead']
  if (!Number.isFinite(recipe.outputQuantity) || recipe.outputQuantity <= 0) return ['Review the MoRTH output quantity before applying material Lead']
  const inventory = morthMaterialInventory(recipe)
  const issues = inventory.flatMap(row => row.error ? [row.error] : [])
  for (const app of applications) {
    const variant = variants.find(v => v.id === app.variantId)
    if (!variant || variant.active === false || !inventory.some(row => row.name === variant.materialName && row.conveyanceClass === variant.conveyanceClass))
      issues.push('Review a material Lead application that no longer matches this DATA')
    else if (app.morthLeadVariantSignature !== morthLeadVariantSignature(variant))
      issues.push(`${variant.materialName} Lead changed · sync or reapply it`)
    if (variant && inventory.some(row => row.name === variant.materialName && row.handlingIncluded) && (app.loadingRate || app.unloadingRate))
      issues.push('Remove overlapping Lead loading/unloading; fixed operations remain in DATA')
  }
  for (const name of new Set(inventory.map(row => row.name))) {
    const rows = inventory.filter(row => row.name === name)
    if (rows.some(row => row.quantity === null)) continue
    const required = rows.reduce((sum, row) => sum + row.quantity!, 0)
    if (Math.abs(required) < 1e-9) continue
    const linked = applications.filter(app => variants.some(v => v.id === app.variantId && v.active !== false && v.materialName === name && v.conveyanceClass === rows[0].conveyanceClass && (!rows.some(row => row.manualRateOnly) || (v.rateSource !== 'chart' && number(v.customGrossRate) !== null && Number(v.customGrossRate) >= 0))))
    const valid = linked.every(app => app.rateYear === recipe.year && app.rateZone === recipe.zone && app.unit === rows[0].unit && Number.isFinite(app.grossAmount))
    if (!linked.length || !valid || Math.abs(linked.reduce((sum, app) => sum + app.quantity, 0) - required) > 1e-6 * Math.max(1, Math.abs(required)))
      issues.push(`${name} Lead pending · ${required} ${rows[0].unit} required`)
  }
  return [...new Set(issues)]
}
