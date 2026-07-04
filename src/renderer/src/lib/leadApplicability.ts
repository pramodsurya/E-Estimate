import type { ProjectItemGroup } from './projectItems'
import { CONVEYANCE_CLASSES } from './lead'
import type {
  ConveyanceClass,
  LeadIncludedBasis,
  LeadPolicy,
  LeadQuantityBasis,
  LeadTransportPurpose,
  LeadVariant
} from '../types/project'
import type { RateAnalysisLine, RateAnalysisRecipe } from '../types/rateAnalysis'

export interface LeadInfo {
  classes: ConveyanceClass[]
  materials: Record<string, ConveyanceClass>
  earthwork: boolean
  builtinLeadKm: number | null
  initialLeadM: number | null
  includedInitialLiftM: number | null
  allLeads: boolean
  includesAllLifts: boolean
  policy: LeadPolicy | null
}

export interface DataLiftInfo {
  includedInitialLiftM: number
  includesAllLifts: boolean
}

export interface LeadMaterialRef {
  name: string
  conveyanceClass: ConveyanceClass
  source: string
}

export interface QuantityMatch {
  quantity: number
  unit: string
  source: string
}

export function parseLeadInfo(value: unknown): LeadInfo {
  const source = record(value)
  const builtin = record(source.builtin)
  const rawMaterials = record(source.materials)
  const materials: Record<string, ConveyanceClass> = {}
  for (const [key, raw] of Object.entries(rawMaterials)) {
    if (isConveyanceClass(raw)) materials[key] = normalizeMaterialConveyanceClass(key, raw)
  }
  const materialClasses = new Set(Object.values(materials))
  const rawClasses = Array.isArray(source.classes)
    ? source.classes.filter(isConveyanceClass)
    : []
  const classes = rawMaterials && Object.keys(rawMaterials).length
    ? uniqueClasses([
        ...rawClasses.filter(
          (classKey) => materialClasses.has(classKey) || (classKey === 'EARTH' && Boolean(source.earthwork))
        ),
        ...materialClasses
      ])
    : rawClasses
  return {
    classes,
    materials,
    earthwork: Boolean(source.earthwork),
    builtinLeadKm: numericOrNull(builtin.builtin_lead_km),
    initialLeadM: numericOrNull(builtin.initial_lead_m),
    includedInitialLiftM: numericOrNull(builtin.initial_lift_m),
    allLeads: Boolean(builtin.all_leads),
    includesAllLifts: Boolean(builtin.all_lifts),
    policy: parseLeadPolicy(source.lead_policy ?? source.leadPolicy)
  }
}

export function liftInfoForData(info: LeadInfo, description: string, itemCode = ''): DataLiftInfo {
  if (info.policy) {
    return {
      includedInitialLiftM: info.policy.includedLiftM,
      includesAllLifts: info.policy.includesAllLifts
    }
  }
  const parsedIncludedLiftM = initialLiftFromDescription(description)
  const itemDefaultsAllLifts = isIrrStandardDataItem(itemCode) && parsedIncludedLiftM === null
  return {
    includedInitialLiftM: info.includedInitialLiftM ?? parsedIncludedLiftM ?? 3,
    includesAllLifts:
      info.includesAllLifts || descriptionIncludesAllLifts(description) || itemDefaultsAllLifts
  }
}

export const DISPOSAL_LEAD_MATERIAL_NAME = 'Disposal Lead'

export function isDisposalLeadMaterial(materialName: string): boolean {
  return normalizeDescription(materialName) === normalizeDescription(DISPOSAL_LEAD_MATERIAL_NAME)
}

export function materialRefsForLeadInfo(info: LeadInfo, _description = ''): LeadMaterialRef[] {
  if (info.policy?.purpose === 'NO_EXTRA_LEAD' || info.policy?.purpose === 'REVIEW_REQUIRED') {
    return []
  }
  if (info.policy?.purpose === 'EXCAVATED_DISPOSAL') {
    return [
      {
        name: DISPOSAL_LEAD_MATERIAL_NAME,
        conveyanceClass: info.policy.defaultConveyanceClass ?? 'EARTH',
        source: 'Reviewed DATA lead policy'
      }
    ]
  }

  const refs: LeadMaterialRef[] = []
  for (const [description, conveyanceClass] of Object.entries(info.materials)) {
    refs.push({
      name: materialNameFor(description, conveyanceClass),
      conveyanceClass,
      source: description
    })
  }
  if (info.earthwork && info.classes.includes('EARTH')) {
    refs.push({ name: 'Earth', conveyanceClass: 'EARTH', source: 'Earthwork item quantity' })
  }
  for (const conveyanceClass of info.classes) {
    if (!refs.some((ref) => ref.conveyanceClass === conveyanceClass)) {
      refs.push({
        name: materialNameFor('', conveyanceClass),
        conveyanceClass,
        source: 'DATA lead applicability'
      })
    }
  }
  return uniqueRefs(refs)
}

export function materialNameFor(description: string, conveyanceClass: ConveyanceClass): string {
  const text = normalizeDescription(description)
  if (/\bcement\b/.test(text)) return 'Cement'
  if (/\bsteel\b|reinforcement|tmt|hysd|structural steel|wire fabric|g\.?i\.? sheet/.test(text)) {
    return 'Steel'
  }
  if (isFineAggregate(text) || /\bsand\b/.test(text)) return 'Sand'
  if (isCoarseAggregate(text) || /aggregate|rubble|stone|boulder|khandki/.test(text)) return 'Stone'
  if (/water/.test(text)) return 'Water'
  if (/bricks?/.test(text)) return 'Bricks'
  if (/wood|slab|laterite|cc block|pcc slab|shahabad/.test(text)) return 'Slab/Wood'

  const labels: Record<ConveyanceClass, string> = {
    EARTH: 'Earth',
    STONE: 'Stone',
    CEMENT: 'Cement',
    STEEL: 'Steel',
    SLAB_WOOD: 'Slab/Wood',
    WATER: 'Water',
    BRICKS: 'Bricks'
  }
  return labels[conveyanceClass]
}

export function isEligibleForLead(group: ProjectItemGroup, variant: LeadVariant, info: LeadInfo): boolean {
  if (group.source !== 'SSR') return false
  if (info.allLeads) return false
  const variantName = variant.materialName.toLowerCase()
  return materialRefsForLeadInfo(info, group.description).some(
    (ref) =>
      ref.conveyanceClass === variant.conveyanceClass &&
      ref.name.toLowerCase() === variantName
  )
}

export function basisForData(
  info: LeadInfo,
  fallback: LeadIncludedBasis,
  description = ''
): LeadIncludedBasis {
  if (info.policy?.purpose === 'NO_EXTRA_LEAD') return 'all_leads'
  if (info.policy?.purpose === 'EXCAVATED_DISPOSAL') {
    if (info.policy.includedLeadM >= 1000) return 'initial_1km'
    if (info.policy.includedLeadM === 50) return 'initial_50m'
    return fallback
  }
  const descriptionBasis = leadBasisFromDescription(description)
  if (info.allLeads) return 'all_leads'
  if (descriptionBasis === 'all_leads') return 'all_leads'
  if (info.builtinLeadKm !== null && info.builtinLeadKm >= 1) return 'initial_1km'
  if (info.initialLeadM !== null && info.initialLeadM >= 1000) return 'initial_1km'
  if (descriptionBasis === 'initial_1km') return 'initial_1km'
  if (info.initialLeadM !== null && info.initialLeadM <= 50) return 'initial_50m'
  if (descriptionBasis === 'initial_50m') return 'initial_50m'
  return fallback
}

export function quantityForVariant(
  recipe: RateAnalysisRecipe,
  variant: LeadVariant,
  info: LeadInfo
): QuantityMatch {
  if (isDisposalLeadMaterial(variant.materialName)) {
    const targetUnit = leadQuantityUnitForClass(variant.conveyanceClass)
    const converted = convertQuantityToLeadUnit(recipe.outputQuantity || 1, recipe.unit, targetUnit)
    return {
      quantity: converted ?? (recipe.outputQuantity || 1),
      unit: targetUnit,
      source: converted === null
        ? `Excavated disposal quantity: ${recipe.outputQuantity || 1} ${recipe.unit}`
        : `Excavated disposal quantity: ${formatQuantity(converted)} ${targetUnit} from ${formatQuantity(recipe.outputQuantity || 1)} ${recipe.unit}`
    }
  }

  const materials = recipe.sections.find((section) => section.key === 'materials')?.lines ?? []
  const targetUnit = leadQuantityUnitForClass(variant.conveyanceClass)
  const mappedNames = Object.entries(info.materials)
    .filter(
      ([name, classKey]) =>
        classKey === variant.conveyanceClass &&
        materialNameFor(name, classKey).toLowerCase() === variant.materialName.toLowerCase()
    )
    .map(([name]) => name)
  const directMatches = materialMatches(materials, [
    variant.materialName,
    ...materialAliases(variant.materialName, variant.conveyanceClass),
    ...mappedNames
  ])
  if (directMatches.length) {
    const converted = sumConvertedQuantities(directMatches, targetUnit)
    if (converted.quantity > 0) {
      return {
        quantity: converted.quantity,
        unit: targetUnit,
        source: `DATA material quantity: ${converted.sources.join(', ')}`
      }
    }
    return {
      quantity: 1,
      unit: targetUnit,
      source: `Matched ${directMatches.map((line) => line.description).join(', ')}, but unit conversion to ${targetUnit} is unavailable; using 1 ${targetUnit}.`
    }
  }
  if (info.earthwork && info.classes.includes(variant.conveyanceClass)) {
    const converted = convertQuantityToLeadUnit(recipe.outputQuantity || 1, recipe.unit, targetUnit)
    return {
      quantity: converted ?? (recipe.outputQuantity || 1),
      unit: targetUnit,
      source: converted === null
        ? `DATA item quantity: ${recipe.outputQuantity || 1} ${recipe.unit}`
        : `DATA item quantity: ${formatQuantity(converted)} ${targetUnit} from ${formatQuantity(recipe.outputQuantity || 1)} ${recipe.unit}`
    }
  }
  return {
    quantity: 1,
    unit: targetUnit,
    source: `No exact material quantity found; using 1 ${targetUnit || 'unit'} for preview.`
  }
}

function materialMatches(lines: RateAnalysisLine[], names: string[]): RateAnalysisLine[] {
  const needles = names
    .map((name) => name.trim().toLowerCase())
    .filter((name) => name.length >= 3)
  if (!needles.length) return []
  return lines.filter((line) => {
    const text = `${line.description} ${line.resourceCode ?? ''}`.toLowerCase()
    return needles.some((needle) => text.includes(needle))
  })
}

function uniqueRefs(refs: LeadMaterialRef[]): LeadMaterialRef[] {
  const seen = new Set<string>()
  const out: LeadMaterialRef[] = []
  for (const ref of refs) {
    const key = `${ref.conveyanceClass}:${ref.name.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(ref)
  }
  return out
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function isConveyanceClass(value: unknown): value is ConveyanceClass {
  return typeof value === 'string' && CONVEYANCE_CLASSES.includes(value as ConveyanceClass)
}

function parseLeadPolicy(value: unknown): LeadPolicy | null {
  const source = record(value)
  const purpose = enumValue<LeadTransportPurpose>(
    source.purpose ?? source.transport_purpose,
    [
      'EXCAVATED_DISPOSAL',
      'MATERIAL_SUPPLY',
      'REUSE_FROM_DUMP',
      'REUSE_FROM_HEAP',
      'NO_EXTRA_LEAD',
      'REVIEW_REQUIRED'
    ]
  )
  if (!purpose) return null

  const quantityBasis = enumValue<LeadQuantityBasis>(
    source.quantityBasis ?? source.quantity_basis,
    ['PARENT_CUM', 'DERIVED_LOOSE_CUM', 'MANUAL_LOOSE_CUM']
  ) ?? 'PARENT_CUM'
  const defaultClass = source.defaultConveyanceClass ?? source.default_conveyance_class

  return {
    purpose,
    includedLeadM: numericOrNull(source.includedLeadM ?? source.included_lead_m) ?? 0,
    includedLiftM: numericOrNull(source.includedLiftM ?? source.included_lift_m) ?? 0,
    includesAllLifts: Boolean(source.includesAllLifts ?? source.includes_all_lifts),
    quantityBasis,
    allowLoading: Boolean(source.allowLoading ?? source.allow_loading),
    allowUnloading: Boolean(source.allowUnloading ?? source.allow_unloading),
    scrutinyRequired: Boolean(source.scrutinyRequired ?? source.scrutiny_required),
    defaultConveyanceClass: isConveyanceClass(defaultClass) ? defaultClass : undefined,
    note: typeof source.note === 'string' ? source.note : undefined,
    policyVersion:
      typeof (source.policyVersion ?? source.policy_version) === 'string'
        ? String(source.policyVersion ?? source.policy_version)
        : undefined
  }
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null
}

function numericOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeMaterialConveyanceClass(
  description: string,
  conveyanceClass: ConveyanceClass
): ConveyanceClass {
  const text = normalizeDescription(description)
  if (isCoarseAggregate(text)) return 'STONE'
  return conveyanceClass
}

function uniqueClasses(classes: ConveyanceClass[]): ConveyanceClass[] {
  const seen = new Set<ConveyanceClass>()
  const out: ConveyanceClass[] = []
  for (const classKey of classes) {
    if (seen.has(classKey)) continue
    seen.add(classKey)
    out.push(classKey)
  }
  return out
}

function materialAliases(materialName: string, conveyanceClass: ConveyanceClass): string[] {
  const text = normalizeDescription(materialName)
  if (text === 'sand' || text.includes('sand')) {
    return ['fine aggregate', 'fine aggt', 'un-screened sand', 'unscreened sand']
  }
  if (conveyanceClass === 'STONE') {
    return ['coarse aggregate', 'coarse aggt', 'metal', 'rubble', 'stone', 'boulder', 'khandki']
  }
  return []
}

function leadQuantityUnitForClass(conveyanceClass: ConveyanceClass): string {
  if (conveyanceClass === 'CEMENT' || conveyanceClass === 'STEEL') return 'tonne'
  if (conveyanceClass === 'WATER') return '1000_litres'
  if (conveyanceClass === 'BRICKS') return '1000_nos'
  return 'cum'
}

function sumConvertedQuantities(
  lines: RateAnalysisLine[],
  targetUnit: string
): { quantity: number; sources: string[] } {
  let total = 0
  const sources: string[] = []
  for (const line of lines) {
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) continue
    const converted = convertQuantityToLeadUnit(line.quantity, line.unit, targetUnit)
    if (converted === null) continue
    total += converted
    sources.push(formatConvertedLine(line, converted, targetUnit))
  }
  return { quantity: total, sources }
}

function convertQuantityToLeadUnit(
  quantity: number,
  sourceUnitValue: string,
  targetUnit: string
): number | null {
  const sourceUnit = normalizeQuantityUnit(sourceUnitValue)
  if (!targetUnit) return quantity
  if (sourceUnit === targetUnit) return quantity
  if (sourceUnit === 'kg' && targetUnit === 'tonne') return quantity / 1000
  if (sourceUnit === 'gram' && targetUnit === 'tonne') return quantity / 1_000_000
  if (sourceUnit === 'litre' && targetUnit === '1000_litres') return quantity / 1000
  if (sourceUnit === 'nos' && targetUnit === '1000_nos') return quantity / 1000
  return null
}

function normalizeQuantityUnit(unit: string): string {
  const text = normalizeDescription(unit)
    .replace(/cu\.?\s*m/g, 'cum')
    .replace(/m\^?3/g, 'cum')
  if (!text) return ''
  if (/\b(?:kg|kgs|kilogram|kilograms)\b/.test(text)) return 'kg'
  if (/\b(?:g|gm|gram|grams)\b/.test(text)) return 'gram'
  if (/\b(?:tonne|tonnes|metric\s*ton|metric\s*tons|mt)\b/.test(text)) return 'tonne'
  if (/\b(?:cum|cubic\s*met(?:er|re)s?)\b/.test(text)) return 'cum'
  if (/\b(?:1000|thousand)\s*(?:litre|litres|liter|liters|ltr|ltrs)\b/.test(text)) return '1000_litres'
  if (/\b(?:litre|litres|liter|liters|ltr|ltrs)\b/.test(text)) return 'litre'
  if (/\b(?:1000|thousand)\s*(?:nos|no|numbers?)\b/.test(text)) return '1000_nos'
  if (/\b(?:nos|no|numbers?|each|eachs)\b/.test(text)) return 'nos'
  return ''
}

function formatConvertedLine(
  line: RateAnalysisLine,
  convertedQuantity: number,
  targetUnit: string
): string {
  const sourceUnit = normalizeQuantityUnit(line.unit)
  if (sourceUnit === targetUnit) {
    return `${line.description} (${formatQuantity(convertedQuantity)} ${targetUnit})`
  }
  return `${line.description} (${formatQuantity(convertedQuantity)} ${targetUnit} from ${formatQuantity(line.quantity)} ${line.unit || 'units'})`
}

function formatQuantity(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
}

function descriptionIncludesAllLifts(description: string): boolean {
  const text = normalizeDescription(description)
  return (
    /\ball\s+leads?\s*(?:,|and|&)\s*(?:all\s+)?lifts?\b/.test(text) ||
    /\ball\s+lifts?\b/.test(text) ||
    /\blifts?\s+at\s+all\s+(?:heights?|levels?)\b/.test(text)
  )
}

function isIrrStandardDataItem(itemCode: string): boolean {
  return /^IRR-(?:TAW|DAW|CAW|CCDW)(?:-|$)/i.test(itemCode.trim())
}

function initialLiftFromDescription(description: string): number | null {
  if (descriptionIncludesAllLifts(description)) return null
  const text = normalizeDescription(description)
  const patterns = [
    /\binitial\s+lift\s*(?:up\s*to|upto|not\s+exceeding|of|:|-)?\s*(\d+(?:\.\d+)?)\s*(?:m|metres?|meters?)\b/,
    /\blift\s*(?:up\s*to|upto|not\s+exceeding)\s*(\d+(?:\.\d+)?)\s*(?:m|metres?|meters?)\b/,
    /\b(\d+(?:\.\d+)?)\s*(?:m|metres?|meters?)\s+initial\s+lift\b/
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (!match) continue
    const value = Number(match[1])
    if (Number.isFinite(value) && value >= 0) return value
  }
  return null
}

function leadBasisFromDescription(description: string): LeadIncludedBasis | null {
  const text = normalizeDescription(description)
  if (descriptionIncludesAllLeads(text)) return 'all_leads'
  const patterns = [
    /\binitial\s+leads?\s*(?:up\s*to|upto|not\s+exceeding|of|:|-)?\s*(\d+(?:\.\d+)?)\s*(km|kilometres?|kilometers?|m|metres?|meters?)\b/,
    /\bincluding\s+(?:the\s+)?(?:initial\s+)?leads?\s*(?:up\s*to|upto|not\s+exceeding|of|:|-)?\s*(\d+(?:\.\d+)?)\s*(km|kilometres?|kilometers?|m|metres?|meters?)\b/,
    /\bleads?\s*(?:up\s*to|upto|not\s+exceeding)\s*(\d+(?:\.\d+)?)\s*(km|kilometres?|kilometers?|m|metres?|meters?)\b/
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    const basis = leadBasisFromDistance(match?.[1], match?.[2])
    if (basis) return basis
  }
  return null
}

function descriptionIncludesAllLeads(description: string): boolean {
  const text = normalizeDescription(description)
  return (
    /\ball\s+leads?\b/.test(text) ||
    /\ball\s+ordinary\s+leads?\b/.test(text) ||
    /\bleads?\s+at\s+all\s+(?:distances?|places?)\b/.test(text)
  )
}

function leadBasisFromDistance(valueText?: string, unitText?: string): LeadIncludedBasis | null {
  if (!valueText || !unitText) return null
  const value = Number(valueText)
  if (!Number.isFinite(value) || value < 0) return null
  const unit = unitText.toLowerCase()
  const metres = /^k/.test(unit) ? value * 1000 : value
  if (metres >= 1000) return 'initial_1km'
  if (metres <= 50) return 'initial_50m'
  return null
}

function disposalLeadClassFromDescription(description: string): ConveyanceClass | null {
  const text = normalizeDescription(description)
  const isExcavatedMaterial = /\bexcavat(?:e|ed|ion)\b/.test(text)
  const hasApprovedDump =
    /\bapproved\s+dump\s+area\b/.test(text) ||
    /\bdump\s+area\b/.test(text) ||
    /\bdumping\s+yard\b/.test(text)
  const describesDisposal =
    /\bplacing\s+the\s+excavated\b/.test(text) ||
    /\bconvey(?:ing|ance)?\s+.*\b(?:dump|disposal)\b/.test(text) ||
    /\bdispos(?:al|ing|e)\b/.test(text)

  if (!isExcavatedMaterial || !hasApprovedDump || !describesDisposal) return null
  if (/\bhard\s+rock\b|\brock\b|\bboulders?\b|\bstone\b/.test(text)) return 'STONE'
  return 'EARTH'
}

function normalizeDescription(description: string): string {
  return description.toLowerCase().replace(/\s+/g, ' ').trim()
}

function isFineAggregate(text: string): boolean {
  return /\bfine\s+(?:aggregate|aggt)\b/.test(text)
}

function isCoarseAggregate(text: string): boolean {
  return /\b(?:coarse|c\.?\s*a\.?)\s+(?:aggregate|aggt)\b/.test(text)
}
