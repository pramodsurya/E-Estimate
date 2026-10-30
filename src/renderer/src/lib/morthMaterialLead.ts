import type { ConveyanceClass, LeadApplication, LeadVariant } from '../types/project'
import type { RateAnalysisRecipe } from '../types/rateAnalysis'
import materialMappings from './morthLeadMaterials'

/** Original SDB chapter 1, 1.04(v): 15 t payload, loaded 20 / return 30 km/h. */
export const CONCRETE_TRANSPORT_KEY = 'morth:transit_truck_agitator_6_cum_transport_tkm'
export function concreteTransportParameter(raw: Record<string, unknown>): string | undefined {
  const expression = raw.quantity_expression as Record<string, unknown> | undefined
  return (raw.resource_key === CONCRETE_TRANSPORT_KEY || (raw.unit === 'tonne-km' && /concrete|shotcrete/.test(String(expression?.parameter)))) && expression?.parameter_unit === 'km'
    ? String(expression.parameter) : undefined
}


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
  appendixPath?: string[]
  analysisPath: string[]
  manualRateOnly?: boolean
  handlingIncluded?: boolean
  error?: string
}
interface TransportBinding {
  mode: 'excluded' | 'fixed' | 'operations' | 'native'
  fixedQuantity?: number
  parameter: string
}
export function morthTransportBinding(raw: Raw): TransportBinding | null {
  const key = String(raw.material_lead_source_key ?? raw.resource_key ?? '')
  const expression = object(raw.quantity_expression)
  if (concreteTransportParameter(raw)) return { mode: 'native', parameter: String(expression.parameter) }
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
  return binding ? { ...raw, material_lead: { version: MORTH_LEAD_MODEL, ...binding } } : Object.fromEntries(Object.entries(raw).filter(([key]) => key !== 'material_lead'))
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
  const walk = (current: RateAnalysisRecipe, scale: number | null, path: string, ancestors: Set<RateAnalysisRecipe>, appendixPath: string[], analysisPath: string[]): void => {
    if (!current.morth || ancestors.has(current)) {
      inventory.push({ identity: path, name: 'Material delivery', conveyanceClass: 'STEEL', quantity: null, unit: 'tonne', usagePath: path, analysisPath, error: 'Circular or unavailable material dependency' })
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
          const label = `Appendix ${dependency.morth?.printedItem || dependency.itemCode.replace(/^MORTH-2019-/, '')} — ${dependency.description}`
          walk(dependency, childScale === null ? null : childScale * (number(object(raw.price_lookup).rate_multiplier) ?? 1), usagePath, visited, [...appendixPath, label], [...analysisPath, id])
        } else if (section === 'materials' && mappings[key]) {
          const mapping = mappings[key], value = converted(signed, String(raw.unit ?? ''), mapping.conveyanceClass)
          inventory.push({ identity: key, ...mapping, ...value, usagePath, appendixPath, analysisPath,
            ...(value.quantity === null ? { error: `Review material quantity/unit: ${raw.desc}` } : {}) })
        }
        const binding = morthTransportBinding(raw)
        if (!binding) continue
        // Water and steel are bound to their physical material inventory below.
        if (binding.mode !== 'excluded' && binding.mode !== 'native') continue
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
        if (binding.mode === 'native') {
          inventory.push({ identity: `${current.itemCode}:${key}`, name, conveyanceClass: 'STEEL', quantity: 1, unit: 'km', usagePath, appendixPath, analysisPath, handlingIncluded: true })
          continue
        }
        inventory.push({ identity: `${current.itemCode}:${key}`, name, conveyanceClass: 'STEEL',
          quantity: mass === null || scale === null ? null : mass * scale * (number(raw.sign) ?? 1), unit: 'tonne', usagePath, appendixPath, analysisPath,
          handlingIncluded: name === 'Concrete delivery' && list(source.machinery).some(row => row.resource_key === 'morth:transit_truck_agitator_6_cum'),
          manualRateOnly: name !== 'Steel', ...(mass === null ? { error: `Review physical material quantity for ${raw.desc}` } : {}) })
      }
    }
    // Every split must have a physical replacement, even if the source material
    // is missing or a dependency was replaced with a manual supply rate.
    for (const raw of list(source.machinery)) {
      const binding = morthTransportBinding(raw)
      if (!binding || binding.mode === 'excluded' || binding.mode === 'native') continue
      const name = String(raw.material_lead_source_key ?? raw.resource_key).includes('water_tanker') ? 'Water' : 'Steel'
      for (const entry of inventory)
        if (entry.usagePath.startsWith(path + '/') && entry.name === name) entry.handlingIncluded = true
      if (!inventory.some(entry => entry.usagePath.startsWith(path + '/') && entry.name === name))
        inventory.push({ identity: `${current.itemCode}:${raw.resource_key}`, name,
          conveyanceClass: name === 'Water' ? 'WATER' : 'STEEL', quantity: null,
          unit: name === 'Water' ? '1000_litres' : 'tonne', usagePath: path, appendixPath, analysisPath,
          error: `Review ${name} quantity for material Lead` })
    }
  }
  walk(recipe, 1, recipe.itemCode, new Set(), [], [])
  return inventory
}

export function morthLeadApplicability(recipe: RateAnalysisRecipe, directOnly = false) {
  const inventory = morthMaterialInventory(recipe).filter(row => !directOnly || row.analysisPath.length === 0)
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
export function morthRecipeAtPath(recipe: RateAnalysisRecipe, path: string[] = []): RateAnalysisRecipe | undefined {
  let current: RateAnalysisRecipe | undefined = recipe
  for (const id of path) current = current?.morth?.inputs[id]?.dependency
  return current
}

export function morthLeadScopes(recipe: RateAnalysisRecipe, materialName?: string, conveyanceClass?: ConveyanceClass) {
  const paths = new Map<string, { path: string[]; label: string; recipe: RateAnalysisRecipe; factor: number | null }>()
  for (const row of morthMaterialInventory(recipe)) {
    if (materialName && row.name.toLowerCase() !== materialName.toLowerCase()) continue
    if (conveyanceClass && row.conveyanceClass !== conveyanceClass) continue
    const owner = morthRecipeAtPath(recipe, row.analysisPath)
    if (owner) paths.set(JSON.stringify(row.analysisPath), { path: row.analysisPath, label: row.appendixPath?.join(' → ') || `DATA ${recipe.morth?.printedItem || recipe.itemCode}`, recipe: owner, factor: morthScopeFactor(recipe, row.analysisPath) })
  }
  return [...paths.values()]
}

export function morthScopeFactor(recipe: RateAnalysisRecipe, path: string[]): number | null {
  let factor = 1, current = recipe
  for (const id of path) {
    const input = current.morth?.inputs[id], child = input?.dependency
    if (!child || child.outputQuantity <= 0) return null
    const quantity = number(object(object(current.morth?.startingSummary?.computedLines)[id]).quantity)
    if (quantity === null) return null
    factor *= quantity / child.outputQuantity * (number(object(input.raw.price_lookup).rate_multiplier) ?? 1)
    current = child
  }
  return factor
}

export function morthLeadPricingSignature(applications: LeadApplication[]): string {
  return 'after-abstract-v3-scope-basis:' + JSON.stringify(applications.map(app => [app.id, app.variantId, app.morthAppendixPath, app.quantity, app.unit, app.grossRate, app.grossAmount, app.rateYear, app.rateZone, app.morthLeadVariantSignature]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))))
}

export function morthLeadPricingReady(recipe: RateAnalysisRecipe, applications: LeadApplication[]): boolean {
  const variants = new Map<string, LeadVariant>()
  const visit = (current: RateAnalysisRecipe): void => {
    for (const variant of current.morth?.appliedLeadVariants ?? []) variants.set(variant.id, variant)
    for (const input of Object.values(current.morth?.inputs ?? {})) if (input.dependency) visit(input.dependency)
  }
  visit(recipe)
  const effective = normalizeMorthLeadApplications(recipe, applications, [...variants.values()])
  return recipe.morth?.leadPricingSignature === morthLeadPricingSignature(effective) && recipe.morth?.leadPricingInputSignature === morthLeadSourceSignature(recipe)
}

/** Repair saved appendix paths that still carry quantities on their parent's DATA basis. */
export function normalizeMorthLeadApplications(recipe: RateAnalysisRecipe, applications: LeadApplication[], variants: LeadVariant[]): LeadApplication[] {
  if (!recipe.morth) return applications
  const close = (a: number, b: number): boolean => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b))
  const money = (value: number): number => Math.sign(value) * Math.round(Math.abs(value) * 100) / 100
  return applications.map(app => {
    const path = app.morthAppendixPath
    if (!path?.length || app.quantityManuallyEdited) return app
    const owner = morthRecipeAtPath(recipe, path), factor = morthScopeFactor(recipe, path)
    const variant = variants.find(candidate => candidate.id === app.variantId && candidate.active !== false)
    if (!owner || !variant || factor === null || factor <= 0 ||
        app.rateYear !== owner.year || app.rateZone !== owner.zone ||
        app.morthLeadVariantSignature !== morthLeadVariantSignature(variant) ||
        !close(app.outputQuantity ?? NaN, recipe.outputQuantity) || close(owner.outputQuantity, recipe.outputQuantity) ||
        !close(app.morthRootFactor ?? NaN, factor) ||
        !app.quantitySource?.includes(`${recipe.itemCode}/`) ||
        !Number.isFinite(app.grossRate) || app.grossRate < 0 ||
        !close(app.grossAmount, money(app.quantity * app.grossRate))) return app
    try {
      const required = morthQuantityForLead(owner, variant, true)
      if (app.unit !== required.unit || !close(app.quantity, required.quantity * factor)) return app
      const grossAmount = money(required.quantity * app.grossRate)
      const format = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 6 })
      const source = `Appendix ${owner.morth?.printedItem || owner.description}: ${format.format(required.quantity)} ${required.unit} per ${format.format(owner.outputQuantity)} ${owner.unit} output`
      return { ...app, quantity: required.quantity, quantitySource: source,
        outputQuantity: owner.outputQuantity, grossAmount,
        ...(Number.isFinite(app.netRate) ? { netAmount: money(required.quantity * app.netRate) } : {}),
        morthRootFactor: factor, morthRootOutputQuantity: recipe.outputQuantity,
        rateAddition: grossAmount * factor / recipe.outputQuantity }
    } catch { return app }
  })
}

export function morthLeadSourceSignature(recipe: RateAnalysisRecipe): string {
  return JSON.stringify({ transportModel: 'morth-concrete-distance-v1', year: recipe.year, zone: recipe.zone, output: recipe.outputQuantity, parameters: recipe.morth?.parameters, transportManualKm: recipe.morth?.transportManualKm, transportLeadKm: recipe.morth?.transportLeadKm, calculation: recipe.morth?.source.calculation,
    sections: recipe.sections.map(section => [section.key, section.lines.filter(line => recipe.morth?.inputs[line.id]?.raw.material_lead_charge !== true).map(line => [line.id, line.quantity, line.rate, line.unit, line.description, line.editedFields])]),
    dependencies: Object.entries(recipe.morth?.inputs ?? {}).filter(([, input]) => input.raw.material_lead_charge !== true).map(([id, input]) => [id, input.raw, input.rate, input.dependency ? morthLeadSourceSignature(input.dependency) : null]) })
}

/** Native pricing includes Lead in the consuming analysis and propagates its rate upward. */
export function morthFinalRate(recipe: RateAnalysisRecipe, baseAmount: number, applications: LeadApplication[]): number {
  if (applications.length && !morthLeadPricingReady(recipe, applications)) return NaN
  const delta = morthLeadPricingReady(recipe, applications)
    ? (recipe.morth?.startingSummary?.totalCost ?? 0) - (recipe.morth?.leadPricingBaseAmount ?? 0) : 0
  const amount = baseAmount + delta
  const rate = amount / recipe.outputQuantity
  return Math.sign(rate) * Math.round(Math.abs(rate) * 100) / 100
}
export function morthQuantityForLead(recipe: RateAnalysisRecipe, variant: Pick<LeadVariant, 'materialName' | 'conveyanceClass' | 'rateSource' | 'customGrossRate'>, directOnly = false) {
  const matches = morthMaterialInventory(recipe).filter(row => (!directOnly || row.analysisPath.length === 0) && row.name.toLowerCase() === variant.materialName.toLowerCase() && row.conveyanceClass === variant.conveyanceClass)
  if (!matches.length || matches.some(row => row.quantity === null || row.error))
    throw new Error(`Review the exact ${variant.materialName} quantity and unit before applying Lead.`)
  if (matches.some(row => row.manualRateOnly) && (variant.rateSource === 'chart' || number(variant.customGrossRate) === null || Number(variant.customGrossRate) < 0))
    throw new Error(`${variant.materialName} needs an explicit material Lead rate; a general SOR tariff does not establish this delivery scope.`)
  if (variant.materialName === 'Concrete delivery') return { quantity: 1, unit: 'km', source: 'Plant-to-site distance supplied to original MoRTH machinery' }
  return { quantity: matches.reduce((sum, row) => sum + row.quantity!, 0), unit: matches[0].unit,
    source: matches.map(row => `${row.identity}: ${row.quantity} ${row.unit} (${row.usagePath})`).join('; ') }
}

/** Base arithmetic can be ready while material Lead is still pending. */
export function morthLeadIssues(recipe: RateAnalysisRecipe, applications: LeadApplication[], variants: LeadVariant[]): string[] {
  if (!recipe.morth) return []
  applications = normalizeMorthLeadApplications(recipe, applications, variants)
  if (recipe.morth.costingBasis !== MORTH_LEAD_MODEL) return ['Sync MoRTH DATA to use material Lead']
  if (!Number.isFinite(recipe.outputQuantity) || recipe.outputQuantity <= 0) return ['Review the MoRTH output quantity before applying material Lead']
  const scopes = morthLeadScopes(recipe)
  const problems = applications.flatMap(app => {
    const variant = variants.find(v => v.id === app.variantId)
    if (app.morthAppendixPath === undefined && variant && morthLeadScopes(recipe, variant.materialName, variant.conveyanceClass).some(scope => scope.path.length))
      return [`Reapply ${variant.materialName} Lead to its consuming appendix`]
    const owner = morthRecipeAtPath(recipe, app.morthAppendixPath)
    if (!owner) return ['Review a Lead application whose appendix is no longer used']
    if (!variant || !morthMaterialInventory(owner).some(row => row.analysisPath.length === 0 && row.name === variant.materialName && row.conveyanceClass === variant.conveyanceClass)) return ['Review a material Lead application that no longer matches its consuming analysis']
    return []
  })
  return [...new Set([...problems, ...scopes.flatMap(scope => morthLocalLeadIssues(scope.recipe, applications.filter(app => JSON.stringify(app.morthAppendixPath ?? []) === JSON.stringify(scope.path)), variants).map(issue => `${scope.label}: ${issue}`))])]
}

function morthLocalLeadIssues(recipe: RateAnalysisRecipe, applications: LeadApplication[], variants: LeadVariant[]): string[] {
  const inventory = morthMaterialInventory(recipe).filter(row => row.analysisPath.length === 0)
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
    if (name === 'Concrete delivery') continue // Native distance reminder is shown separately; no priced material application required.
    if (Math.abs(required) < 1e-9) continue
    const linked = applications.filter(app => variants.some(v => v.id === app.variantId && v.active !== false && v.materialName === name && v.conveyanceClass === rows[0].conveyanceClass && (!rows.some(row => row.manualRateOnly) || (v.rateSource !== 'chart' && number(v.customGrossRate) !== null && Number(v.customGrossRate) >= 0))))
    const valid = linked.every(app => {
      const expectedUnit = rows[0].unit
      return app.rateYear === recipe.year && app.rateZone === recipe.zone && app.unit === expectedUnit && Number.isFinite(app.grossAmount) && Number.isFinite(app.grossRate) && app.grossRate >= 0 && Math.abs(app.grossAmount - Math.sign(app.quantity * app.grossRate) * Math.round(Math.abs(app.quantity * app.grossRate) * 100) / 100) < .011
    })
    const applied = linked.reduce((sum, app) => sum + app.quantity, 0)
    if (!linked.length || !valid || !Number.isFinite(applied) || Math.abs(applied - required) > 1e-6 * Math.max(1, Math.abs(required)))
      issues.push(`${name} Lead pending · ${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 6 }).format(required)} ${rows[0].unit === '1000_litres' ? 'kL' : rows[0].unit} required`)
  }
  return [...new Set(issues)]
}
