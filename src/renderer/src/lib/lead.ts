import { supabase } from './supabase'
import type { SorLeadRateSource, SorLeadRule } from '../types/sorLead'
import type {
  ConveyanceClass,
  LeadChargeCode,
  LeadHandlingMode,
  LeadIncludedBasis,
  LeadRateCalculationDetail,
  LeadRateCalculationLine,
  LeadVariant,
  SorZone
} from '../types/project'
export type { LeadHandlingMode } from '../types/project'

/**
 * Route colours for lead variants. A variant may pin one of its own; anything
 * unpinned falls back to this cycle so two routes on the same map stay apart.
 *
 * One palette serves both the on-screen map and the print map, so a route keeps
 * the same colour wherever it is drawn — which is the whole point of letting
 * the user pin it in the first place.
 */
export const LEAD_ROUTE_COLORS = [
  '#16a085',
  '#e67e22',
  '#8e44ad',
  '#c49a00',
  '#2471a3',
  '#c0392b',
  '#2d7d46',
  '#b03a7a'
]

export function leadRouteColor(
  variant: Pick<LeadVariant, 'mapColor'> | undefined,
  index: number
): string {
  const pinned = variant?.mapColor?.trim()
  if (pinned && /^#[0-9a-f]{6}$/i.test(pinned)) return pinned
  return LEAD_ROUTE_COLORS[index % LEAD_ROUTE_COLORS.length]
}

export const CONVEYANCE_CLASSES: ConveyanceClass[] = [
  'EARTH',
  'STONE',
  'CEMENT',
  'STEEL',
  'SLAB_WOOD',
  'WATER',
  'BRICKS',
  'RCC_PIPE'
]

export const CPOH_FACTOR = 1.13615

export interface LeadRateRow {
  charge_code: string
  year: string
  slab_key: string
  column_key: string
  applies_to: string[]
  unit: string
  basis: 'initial' | 'cumulative_total' | 'per_km_increment' | 'per_m_increment' | 'per_operation'
  slab_label: string
  range_from: number | null
  range_to: number | null
  range_unit: string | null
  rate: number
  selectedZone: SorZone
  source?: SorLeadRateSource
  /** Stored once on the first chart row; serialized with the dashboard snapshot. */
  reviewedRules?: SorLeadRule[]
}

export interface LeadChargeInput {
  year: string
  zone?: SorZone
  conveyanceClass: ConveyanceClass
  distanceKm: number
  quantity?: number
  liftM?: number
  includedInitialLiftM?: number | null
  includesAllLifts?: boolean
  mechanicalConveyanceReachesFinalPoint?: boolean
  handlingMode?: LeadHandlingMode
  materialName?: string
  chargeCode?: LeadChargeCode
  /** Exact SOR_Year lead binding, when the source material provides one. */
  leadRuleCode?: string
}

export interface LeadVariantChargeInput extends LeadChargeInput {
  includedBasis?: LeadIncludedBasis
  customGrossRate?: number | null
  /** Repeated haul legs represented by the same mapped route (for example fabricated parts). */
  leadMultiplier?: number
}

export interface LeadChargeBreakdown {
  year: string
  zone: SorZone
  conveyanceClass: ConveyanceClass
  unit: string
  quantity: number
  distanceKm: number
  chargedKm: number | null
  totalLeadM: number
  mode: 'head_load' | 'mechanical'
  handlingMode: LeadHandlingMode
  leadRate: number
  loadingRate: number
  unloadingRate: number
  liftRate: number
  grossRate: number
  netRate: number
  grossAmount: number
  netAmount: number
  calculation: LeadRateCalculationDetail
  notes: string[]
}

export const LOADING_UNLOADING_CAUTION =
  'Common Preamble caution: charges already covered in the parent DATA item should not be duplicated. Loading/unloading from this Lead variant is an extra charge; add it only when separately admissible and not already included in the DATA item.'

export const LOADING_UNLOADING_INITIAL_LEAD_CAUTION =
  'This DATA has 1 km initial lead, so the lead chart deduction is applied. Common Preamble caution still applies to loading/unloading: add L/U only when separately admissible and not already included in the DATA item.'

export interface SsrLeadApplicability {
  code: string
  description: string
  unit: string
  lead_applicability: unknown
  lead_policy: unknown
}

const rateCache = new Map<string, LeadRateRow[]>()
const leadApplicabilityCache = new Map<string, SsrLeadApplicability>()

export function conveyanceClassLabel(value: ConveyanceClass): string {
  const labels: Record<ConveyanceClass, string> = {
    EARTH: 'Earth / embankment',
    STONE: 'Stone / aggregate',
    CEMENT: 'Cement',
    STEEL: 'Steel / packed material',
    SLAB_WOOD: 'Slabs / wood',
    WATER: 'Water',
    BRICKS: 'Bricks',
    RCC_PIPE: 'RCC pipe conveyance'
  }
  return labels[value]
}

export function effectiveAssignmentKm(assignment: {
  osmKm?: number | null
  manualKm?: number | null
}): number | null {
  const manual = numericOrNull(assignment.manualKm)
  if (manual !== null) return manual
  return numericOrNull(assignment.osmKm)
}

export async function fetchLeadRates(
  year: string,
  zone: SorZone = 'zone_3',
  refresh = false
): Promise<LeadRateRow[]> {
  const cacheKey = `${year}:${zone}`
  const cached = rateCache.get(cacheKey)
  if (cached && !refresh) return cached

  const [definitions, annual, rules] = await Promise.all([
    supabase.from('SOR_Recipie').select('recipe_code,unit,cell:metadata->matrix_cell')
      .eq('table_code', 'P01-T09').eq('metadata->>item_type', 'conveyance_matrix_cell'),
    supabase.from('SOR_Year').select('recipe_code,year_row_code,status:metadata->>rate_status')
      .eq('table_code', 'P01-T09').eq('year', year),
    supabase.from('SOR_Lead_Rule').select('rule_code,year,material_codes,scope_label,effective_from,rules,review')
      .eq('year', year).eq('rules->>schema_version', '2')
  ])
  for (const response of [definitions, annual, rules]) {
    if (response.error) throw new Error(`Unable to load reviewed Lead tables: ${response.error.message}`)
  }
  if (!annual.data?.length) {
    throw new Error(`Reviewed Lead tables are unavailable for SOR ${year}.`)
  }
  const definitionsByCode = new Map((definitions.data ?? []).map(row => [row.recipe_code, row]))
  // Included initial lead/lift rows intentionally have no numeric price.
  const requests = annual.data.filter(row => row.status === 'published_numeric')
    .map(row => ({ recipe_code: row.recipe_code, component: 'rate' }))
  const quotes: Record<string, unknown>[] = []
  if (year === '2025-26' || year === '2026-27') {
    // The public role has a short statement timeout. Small batches keep the
    // reviewed lineage/quote work below that budget even for the full chart.
    for (let offset = 0; offset < requests.length; offset += 8) {
      const response = await supabase.rpc('morth_pricing_snapshot', {
        p_year: year, p_zone: zone, p_requests: requests.slice(offset, offset + 8), p_resource_codes: []
      })
      if (response.error) throw new Error(`Unable to quote Lead tariffs: ${response.error.message}`)
      const result = leadRecord(response.data)
      if (result.year !== year || result.zone !== zone || !Array.isArray(result.quotes)) {
        throw new Error('Lead tariff response does not match the requested year and zone.')
      }
      quotes.push(...result.quotes.map(leadRecord))
    }
  } else {
    // The existing batch RPC supports only two editions. Future editions use
    // the same authoritative resolver with bounded requests, never another year.
    for (let offset = 0; offset < requests.length; offset += 6) {
      const page = await Promise.all(requests.slice(offset, offset + 6).map(async request => {
        const response = await supabase.rpc('sor_resource_quote', {
          p_recipe_code: request.recipe_code, p_year: year, p_zone: zone, p_component: 'rate', p_unit: null
        })
        if (response.error) throw new Error(`Unable to quote Lead tariff: ${response.error.message}`)
        return { recipe_code: request.recipe_code, quote: response.data }
      }))
      quotes.push(...page)
    }
  }
  const rows = quotes.flatMap(entry => {
    const definition = definitionsByCode.get(String(entry.recipe_code))
    if (!definition) throw new Error(`Missing Lead definition ${entry.recipe_code}.`)
    const quote = leadRecord(entry.quote)
    if (quote.status !== 'priced') return [] // A referenced unavailable cell fails when used, never becomes zero.
    if (quote.year !== year || quote.zone !== zone || typeof quote.rate !== 'number' || !Number.isFinite(quote.rate) || quote.rate < 0) {
      throw new Error(`Invalid annual Lead quote for ${entry.recipe_code}.`)
    }
    return [reviewedLeadRow(definition as unknown as Record<string, unknown>, quote, year, zone)]
  })
  if (!rows.length) throw new Error(`No priced Lead tariffs are available for SOR ${year}, ${zone}.`)
  rows[0].reviewedRules = (rules.data ?? []) as unknown as SorLeadRule[]
  rateCache.set(cacheKey, rows)
  return rows
}

export async function calculateLeadCharge(input: LeadChargeInput): Promise<LeadChargeBreakdown> {
  const rows = await fetchLeadRates(input.year, input.zone)
  return calculateLeadChargeFromRows(rows, input)
}

export async function calculateLeadVariantCharge(
  input: LeadVariantChargeInput
): Promise<LeadChargeBreakdown> {
  const rows = await fetchLeadRates(input.year, input.zone)
  return calculateLeadVariantChargeFromRows(rows, input)
}

export function calculateLeadChargeFromRows(
  rows: LeadRateRow[],
  input: LeadChargeInput
): LeadChargeBreakdown {
  const reviewedRules = rows.find(row => row.reviewedRules)?.reviewedRules
  if (rows.some(row => row.source)) {
    if (rows.some(row => row.year !== input.year || row.selectedZone !== (input.zone ?? 'zone_3'))) {
      throw new Error('Lead tables are stale. Sync for the selected SOR year and zone.')
    }
  }
  // SSR owns its parent-work policy. A SOR material rule is used only when
  // explicitly bound; a material class must never import delivery inclusions.
  if (input.leadRuleCode) {
    const rule = selectReviewedLeadRule(reviewedRules ?? [], input)
    if (rule) return calculateReviewedLeadCharge(rows, input, rule)
  }
  const quantity = Math.max(0, numberValue(input.quantity, 1))
  const distanceKm = Math.max(0, numberValue(input.distanceKm))
  const totalLeadM = distanceKm * 1000
  const handlingMode = input.handlingMode ?? 'manual_with_idle'
  const liftM = Math.max(0, numberValue(input.liftM))
  const includedInitialLiftM = Math.max(rows.some(row => row.source) ? 3 : 0, numberValue(input.includedInitialLiftM, 3))
  const includesAllLifts = input.includesAllLifts === true
  const notes: string[] = []
  const usedTariffs: LeadRateRow[] = []
  let unit = ''
  let chargedKm: number | null = null
  let leadRate = 0
  let loadingRate = 0
  let unloadingRate = 0
  let liftRate = 0
  let mode: LeadChargeBreakdown['mode'] = 'head_load'
  let calculation: LeadRateCalculationDetail

  if (totalLeadM <= 150) {
    mode = 'head_load'
    const head = headLoadRate(rows, input.conveyanceClass, totalLeadM)
    leadRate = head.rate
    unit = head.unit
    calculation = head.calculation
    if (totalLeadM <= 50) {
      notes.push('Initial lead up to 50 m is included in the item rate.')
    } else {
      notes.push('Head-load charge selected as one cumulative slab; slabs are not summed.')
    }
    if (shouldChargeLift({
      mode,
      liftM,
      includedInitialLiftM,
      includesAllLifts,
      mechanicalConveyanceReachesFinalPoint: input.mechanicalConveyanceReachesFinalPoint
    })) {
      const lift = liftCharge(rows, input.conveyanceClass, liftM, includedInitialLiftM)
      liftRate = lift.rate
      usedTariffs.push(...lift.tariffs)
      unit ||= lift.unit
      notes.push(`COM-LDLFT-6 lift applies beyond the included ${includedInitialLiftM} m.`)
    } else if (includesAllLifts) {
      notes.push('Lift is not payable because the parent item includes all lifts.')
    } else if (liftM > 0 && liftM <= includedInitialLiftM) {
      notes.push(`Lift is within the included ${includedInitialLiftM} m.`)
    }
    notes.push('Loading and unloading are not payable for head-load conveyance.')
  } else {
    mode = 'mechanical'
    const mechanical = mechanicalLeadRate(rows, input.conveyanceClass, distanceKm)
    leadRate = mechanical.rate
    unit = mechanical.unit
    chargedKm = mechanical.chargedKm
    calculation = mechanical.calculation
    notes.push(rows.some(row => row.source)
      ? 'Published cumulative bands apply through 5 km; additional distance uses the reviewed incremental rate.'
      : `Mechanical lead rounded up to ${mechanical.chargedKm} km for slab selection.`)
    if (handlingMode !== 'none') {
      const handling = handlingRates(rows, input.conveyanceClass, handlingMode, input.materialName)
      loadingRate = handling.loading
      unloadingRate = handling.unloading
      usedTariffs.push(...handling.tariffs)
      unit ||= handling.unit
      notes.push(...handling.notes)
    }
    if (shouldChargeLift({
      mode,
      liftM,
      includedInitialLiftM,
      includesAllLifts,
      mechanicalConveyanceReachesFinalPoint: input.mechanicalConveyanceReachesFinalPoint
    })) {
      const lift = liftCharge(rows, input.conveyanceClass, liftM, includedInitialLiftM)
      liftRate = lift.rate
      usedTariffs.push(...lift.tariffs)
      unit ||= lift.unit
      notes.push(
        `COM-LDLFT-6 lift applies because mechanical conveyance stops before the final placing point and manual lift exceeds ${includedInitialLiftM} m.`
      )
    } else if (includesAllLifts) {
      notes.push('Lift is not payable because the parent item includes all lifts.')
    } else if (liftM > 0 && liftM <= includedInitialLiftM) {
      notes.push(`Lift is within the included ${includedInitialLiftM} m.`)
    } else if (liftM > includedInitialLiftM) {
      notes.push('Lift is not added when mechanical conveyance reaches the final placing point.')
    }
  }

  const grossRate = roundMoney(leadRate + loadingRate + unloadingRate + liftRate)
  const netRate = roundMoney(grossRate / CPOH_FACTOR)
  const tariffs = [...(calculation.evidence?.tariffs ?? []), ...usedTariffs.flatMap(row => row.source ? [row.source] : [])]
  if (rows.some(row => row.source)) calculation.evidence = {
    policySource: 'SSR', year: input.year, zone: input.zone ?? 'zone_3',
    tariffs: [...new Map(tariffs.map(source => [source.recipeCode, source])).values()]
  }
  if (input.chargeCode && input.chargeCode !== 'AUTO') {
    notes.push(`${input.chargeCode} was selected on the Lead variant; payable rates are still selected by the SoR distance, handling, and lift rules.`)
  }
  return {
    year: input.year,
    zone: input.zone ?? 'zone_3',
    conveyanceClass: input.conveyanceClass,
    unit,
    quantity,
    distanceKm,
    chargedKm,
    totalLeadM,
    mode,
    handlingMode,
    leadRate: roundMoney(leadRate),
    loadingRate: roundMoney(loadingRate),
    unloadingRate: roundMoney(unloadingRate),
    liftRate: roundMoney(liftRate),
    grossRate,
    netRate,
    grossAmount: roundMoney(grossRate * quantity),
    netAmount: roundMoney(netRate * quantity),
    calculation,
    notes
  }
}

export function calculateLeadVariantChargeFromRows(
  rows: LeadRateRow[],
  input: LeadVariantChargeInput
): LeadChargeBreakdown {
  if (input.materialName === 'Concrete delivery') {
    if (!Number.isFinite(input.distanceKm) || input.distanceKm < 0) throw new Error('Enter a finite nonnegative plant-to-site distance.')
    const base = zeroDisposalBreakdown(input)
    return { ...base, unit: 'km', quantity: 1,
      calculation: leadCalculation([{ label: 'Distance supplied to MoRTH transport', expression: `${input.distanceKm} km → original machinery quantity`, amount: 0 }], 'km'),
      notes: ['Distance only. Transport is calculated in the original MoRTH machinery row, with no additional SOR Lead charge.'] }
  }
  const disposalLead = isDisposalLeadMaterial(input.materialName)
  const normalizedInput: LeadVariantChargeInput = disposalLead
    ? {
        ...input,
        liftM: 0,
        includesAllLifts: true,
        mechanicalConveyanceReachesFinalPoint: true,
        handlingMode: 'none'
      }
    : input
  const basis = normalizedInput.includedBasis ?? 'none'
  if (disposalLead && basis === 'initial_1km' && numberValue(normalizedInput.distanceKm) <= 1) {
    return zeroDisposalBreakdown(normalizedInput)
  }
  if (basis === 'all_leads') {
    const zero = zeroDisposalBreakdown(normalizedInput)
    return { ...zero, notes: ['This DATA item includes all leads, so no additional lead is payable.'] }
  }
  if (normalizedInput.customGrossRate !== null && normalizedInput.customGrossRate !== undefined) {
    if (!Number.isFinite(normalizedInput.customGrossRate) || normalizedInput.customGrossRate < 0) {
      throw new Error('Enter a finite nonnegative manual Lead rate.')
    }
    const base = zeroDisposalBreakdown(normalizedInput)
    base.mode = normalizedInput.distanceKm <= 0.15 ? 'head_load' : 'mechanical'
    return rebuildBreakdown(base, normalizedInput.customGrossRate, 0, 0, 0,
      ['Using a project-local manual gross rate for this Lead material.'],
      manualLeadCalculation(normalizedInput.customGrossRate, base.unit))
  }
  const total = calculateLeadChargeFromRows(rows, normalizedInput)

  let leadRate = total.leadRate
  let calculation = total.calculation
  let loadingRate = total.loadingRate
  let unloadingRate = total.unloadingRate
  if (basis === 'initial_1km' && total.mode === 'mechanical') {
    const included = calculateLeadChargeFromRows(rows, {
      ...normalizedInput,
      distanceKm: 1,
      liftM: 0,
      handlingMode: 'none',
      quantity: normalizedInput.quantity
    })
    leadRate = Math.max(0, total.leadRate - included.leadRate)
    calculation = withLeadDeduction(
      total.calculation,
      total.leadRate,
      'Less initial 1 km included in parent item',
      included.leadRate
    )
    if (calculation.evidence && included.calculation.evidence) {
      calculation.evidence.tariffs = [...new Map([
        ...calculation.evidence.tariffs, ...included.calculation.evidence.tariffs
      ].map(source => [source.recipeCode, source])).values()]
    }
    total.notes.push('Deducted the 1 km COM-LDLFT lead already included in the DATA item.')
    if (loadingRate || unloadingRate) {
      total.notes.push(LOADING_UNLOADING_INITIAL_LEAD_CAUTION)
    }
  } else if (basis === 'initial_50m') {
    total.notes.push('Initial 50 m is treated as internal lead; no mechanical chart deduction is made.')
  }

  const leadMultiplier = Math.max(1, Math.floor(numberValue(normalizedInput.leadMultiplier, 1)))
  if (leadMultiplier > 1) {
    leadRate = roundMoney(leadRate * leadMultiplier)
    calculation = withLeadMultiplier(calculation, leadMultiplier)
    total.notes.push(
      `${leadMultiplier} separately payable haul legs use the same mapped route and lead deduction.`
    )
  }

  return rebuildBreakdown(
    total,
    leadRate,
    loadingRate,
    unloadingRate,
    total.liftRate,
    total.notes,
    calculation
  )
}

function isDisposalLeadMaterial(materialName = ''): boolean {
  return materialName.trim().toLowerCase() === 'disposal lead'
}

function zeroDisposalBreakdown(input: LeadVariantChargeInput): LeadChargeBreakdown {
  const quantity = Math.max(0, numberValue(input.quantity, 1))
  const distanceKm = Math.max(0, numberValue(input.distanceKm))
  const unit = defaultUnitForConveyanceClass(input.conveyanceClass)
  return {
    year: input.year,
    zone: input.zone ?? 'zone_3',
    conveyanceClass: input.conveyanceClass,
    unit,
    quantity,
    distanceKm,
    chargedKm: null,
    totalLeadM: distanceKm * 1000,
    mode: 'mechanical',
    handlingMode: 'none',
    leadRate: 0,
    loadingRate: 0,
    unloadingRate: 0,
    liftRate: 0,
    grossRate: 0,
    netRate: 0,
    grossAmount: 0,
    netAmount: 0,
    calculation: leadCalculation([
      {
        label: 'Disposal lead within initial 1 km',
        expression: 'included',
        amount: 0
      }
    ], unit),
    notes: [
      'Disposal to approved dump area is within the 1 km initial lead included in the DATA item.',
      'Loading/unloading and lift are not payable for this disposal lead item.'
    ]
  }
}

function defaultUnitForConveyanceClass(conveyanceClass: ConveyanceClass): string {
  if (conveyanceClass === 'RCC_PIPE') return 'metre'
  if (conveyanceClass === 'CEMENT' || conveyanceClass === 'STEEL') return 'tonne'
  if (conveyanceClass === 'WATER') return '1000_litres'
  if (conveyanceClass === 'BRICKS') return '1000_nos'
  return 'cum'
}

export function loadingUnloadingCautionForBreakdown(
  breakdown: Pick<LeadChargeBreakdown, 'loadingRate' | 'unloadingRate' | 'calculation'>,
  handlingMode: LeadHandlingMode
): string {
  if (handlingMode === 'none') return ''
  return breakdown.calculation.deductedLeadRate > 0
    ? LOADING_UNLOADING_INITIAL_LEAD_CAUTION
    : LOADING_UNLOADING_CAUTION
}

export async function fetchSsrLeadApplicability(
  codes: string[]
): Promise<Map<string, SsrLeadApplicability>> {
  const uniqueCodes = Array.from(new Set(codes.map((code) => code.trim()).filter(Boolean)))
  const out = new Map<string, SsrLeadApplicability>()
  const missing = uniqueCodes.filter((code) => {
    const cached = leadApplicabilityCache.get(code)
    if (cached) out.set(code, cached)
    return !cached
  })
  if (missing.length === 0) return out

  const primary = await supabase
    .from('ssr_item')
    .select('code,description,unit,lead_applicability,lead_policy')
    .in('code', missing)
  let data = primary.data as Array<Record<string, unknown>> | null
  let error = primary.error

  if (error && /lead_policy/i.test(error.message)) {
    const fallback = await supabase
      .from('ssr_item')
      .select('code,description,unit,lead_applicability')
      .in('code', missing)
    data = fallback.data as Array<Record<string, unknown>> | null
    error = fallback.error
  }

  if (error) throw new Error(`Unable to load DATA lead applicability: ${error.message}`)

  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const item: SsrLeadApplicability = {
      code: String(row.code ?? ''),
      description: String(row.description ?? ''),
      unit: String(row.unit ?? ''),
      lead_applicability: withLeadPolicy(row.lead_applicability, row.lead_policy),
      lead_policy: row.lead_policy
    }
    if (item.code) {
      leadApplicabilityCache.set(item.code, item)
      out.set(item.code, item)
    }
  }

  return out
}

function withLeadPolicy(leadApplicability: unknown, leadPolicy: unknown): unknown {
  if (!leadPolicy) return leadApplicability
  const base =
    leadApplicability && typeof leadApplicability === 'object' && !Array.isArray(leadApplicability)
      ? (leadApplicability as Record<string, unknown>)
      : {}
  return { ...base, lead_policy: leadPolicy }
}

function leadRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {}
}

/** Stable recorded matrix axes mapped to the existing chart/print column contract. */
function reviewedLeadRow(
  definition: Record<string, unknown>, quote: Record<string, unknown>, year: string, zone: SorZone
): LeadRateRow {
  const cell = leadRecord(definition.cell)
  const row = leadRecord(cell.row)
  const column = leadRecord(cell.column)
  const columns: Record<string, [string, string[]]> = {
    earth_stone_aggregate: ['EARTH_STONE', ['EARTH', 'STONE']],
    cement_steel: ['CEMENT_STEEL', ['CEMENT', 'STEEL']],
    slabs_blocks_wood: ['SLAB_WOOD', ['SLAB_WOOD']],
    earth_sand_gravel: ['EARTH', ['EARTH']],
    stone_aggregate: ['STONE', ['STONE']],
    cement_steel_packed: ['CEMENT_STEEL_PACKED', ['CEMENT', 'STEEL']],
    water: ['WATER', ['WATER']], bricks: ['BRICKS', ['BRICKS']],
    brick_work: ['BRICKS', ['BRICKS']],
    stone_aggregate_lime: ['STONE_LIME', ['STONE']],
    cement: ['CEMENT', ['CEMENT']], steel: ['STEEL', ['STEEL']],
    sand_gravel: ['EARTH', ['EARTH']]
  }
  const dimensions = columns[String(column.id)]
  const matrix = /-M000([1-6])$/.exec(String(cell.origin_matrix_recipe_code))
  let slab = String(row.id)
  if (/^lead_\d+km$/.test(slab)) slab = slab.replace('lead_', 'upto_')
  else slab = ({ lead_100m: 'upto_100m', lead_150m: 'upto_150m',
    additional_km_5_to_30: 'per_km_5_30', additional_km_beyond_30: 'per_km_beyond_30',
    additional_lift_1m: 'per_1m_beyond_3m' } as Record<string, string>)[slab] ?? slab
  if (!dimensions || !matrix || !quote.year_row_code || !quote.recipe_code) {
    throw new Error(`Unrecognized reviewed Lead coordinate ${definition.recipe_code}.`)
  }
  const basis: LeadRateRow['basis'] = row.basis === 'incremental_per_km' ? 'per_km_increment'
    : row.id === 'additional_lift_1m' ? 'per_m_increment'
      : row.id === 'loading' || row.id === 'unloading' ? 'per_operation' : 'cumulative_total'
  const rawUnit = String(quote.unit ?? definition.unit)
  const unit = /^1000\s+(?:litres?|liters?)$/i.test(rawUnit) ? '1000_litres'
    : /^1000\s+(?:nos?\.?|numbers?)$/i.test(rawUnit) ? '1000_nos' : rawUnit
  return {
    charge_code: `COM-LDLFT-${matrix[1]}`, year, slab_key: slab,
    column_key: dimensions[0], applies_to: dimensions[1], unit, basis,
    slab_label: String(row.label ?? slab), range_from: numberOrNull(row.beyond_km ?? row.beyond_m),
    range_to: numberOrNull(row.distance_km ?? row.distance_m ?? row.up_to_km),
    range_unit: row.distance_m != null || row.id === 'additional_lift_1m' ? 'm' : 'km',
    rate: quote.rate as number, selectedZone: zone,
    source: { recipeCode: String(definition.recipe_code), resolvedRecipeCode: String(quote.recipe_code),
      yearRowCode: String(quote.year_row_code), year, zone }
  }
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function selectReviewedLeadRule(rules: SorLeadRule[], input: LeadChargeInput): SorLeadRule | undefined {
  if (input.leadRuleCode) {
    const rule = rules.find(candidate => candidate.rule_code === input.leadRuleCode && candidate.year === input.year)
    if (!rule) throw new Error(`The bound Lead rule is unavailable in SOR ${input.year}.`)
    const materials: Record<ConveyanceClass, string[]> = {
      EARTH: ['EARTH', 'SAND', 'LIME'], STONE: ['STONE'], CEMENT: ['CEMENT'], STEEL: ['STEEL'],
      SLAB_WOOD: ['STONE', 'WOOD'], WATER: ['WATER'], BRICKS: ['BRICKS'], RCC_PIPE: ['PIPE']
    }
    if (!rule.material_codes.some(code => materials[input.conveyanceClass].includes(code))) {
      throw new Error('The bound Lead rule has a different material scope.')
    }
    return rule
  }
  return undefined
}

export function evaluateLeadExpression(value: unknown, inputs: Record<string, number | string>, depth = 0): number {
  if (depth > 24) throw new Error('Lead expression is too deeply nested.')
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const expression = leadRecord(value)
  if (typeof expression.input === 'string' && typeof inputs[expression.input] === 'number') {
    return inputs[expression.input] as number
  }
  const left = (): number => evaluateLeadExpression(expression.left, inputs, depth + 1)
  const right = (): number => evaluateLeadExpression(expression.right, inputs, depth + 1)
  let result: number
  switch (expression.op) {
    case 'add': result = left() + right(); break
    case 'subtract': result = left() - right(); break
    case 'multiply': result = left() * right(); break
    case 'max': result = Math.max(left(), right()); break
    case 'ceil': result = Math.ceil(evaluateLeadExpression(expression.value, inputs, depth + 1)); break
    default: throw new Error('Unsupported reviewed Lead expression.')
  }
  if (!Number.isFinite(result)) throw new Error('Invalid reviewed Lead expression result.')
  return result
}

export function matchesLeadCondition(value: unknown, inputs: Record<string, number | string>, depth = 0): boolean {
  if (depth > 24) throw new Error('Lead condition is too deeply nested.')
  const condition = leadRecord(value)
  if (Array.isArray(condition.all)) return condition.all.every(item => matchesLeadCondition(item, inputs, depth + 1))
  if (Array.isArray(condition.any)) return condition.any.some(item => matchesLeadCondition(item, inputs, depth + 1))
  const actual = inputs[String(condition.input)]
  if (actual == null) throw new Error(`Missing reviewed Lead input ${condition.input}.`)
  if (condition.op === 'eq') return actual === condition.value
  if (typeof actual !== 'number' || typeof condition.value !== 'number') throw new Error('Invalid Lead comparison.')
  switch (condition.op) {
    case 'lt': return actual < condition.value
    case 'lte': return actual <= condition.value
    case 'gt': return actual > condition.value
    case 'gte': return actual >= condition.value
    default: throw new Error('Unsupported Lead condition.')
  }
}

function calculateReviewedLeadCharge(rows: LeadRateRow[], input: LeadChargeInput, rule: SorLeadRule): LeadChargeBreakdown {
  const distanceKm = Math.max(0, numberValue(input.distanceKm))
  const quantity = Math.max(0, numberValue(input.quantity, 1))
  const liftM = Math.max(0, numberValue(input.liftM))
  const includedLift = Math.max(0, numberValue(input.includedInitialLiftM, 3))
  const handlingMode = input.handlingMode ?? 'manual_with_idle'
  const mode = distanceKm <= 0.15 ? 'head_load' : 'mechanical'
  const inputs: Record<string, number | string> = {
    lead_km: distanceKm, lift_m: liftM,
    placement: input.mechanicalConveyanceReachesFinalPoint === true ||
      (mode === 'mechanical' && input.mechanicalConveyanceReachesFinalPoint !== false) ? 'mechanical' : 'head_load',
    handling: handlingMode === 'manual_no_idle' ? 'manual_excluding_idle'
      : handlingMode === 'manual_with_idle' ? 'manual_including_idle' : 'mechanical_including_idle',
    disposal: 'none'
  }
  if (rule.rules.schema_version !== 2) throw new Error('Unsupported common Lead rule version.')
  const components = leadRecord(rule.rules.components)
  const notes = [`Reviewed Lead rule ${rule.rule_code} · SOR ${input.year} · ${input.zone ?? 'zone_3'}`]
  const tariffs = new Map<string, SorLeadRateSource>()
  let unit = defaultUnitForConveyanceClass(input.conveyanceClass)
  const calculationRows: LeadRateCalculationLine[] = []
  const component = (key: string, disabled = false): number => {
    if (disabled) return 0
    const definition = leadRecord(components[key])
    if (!Array.isArray(definition.cases)) throw new Error(`Invalid ${key} rule in ${rule.rule_code}.`)
    const match = definition.cases.map(leadRecord).find(candidate => matchesLeadCondition(candidate.when, inputs))
    const result = leadRecord(match ? match.then : definition.otherwise)
    const reason = String(result.reason ?? key)
    notes.push(`${key}: ${reason}`)
    if (result.status === 'review_required') throw new Error(`${key}: ${reason}`)
    if (result.status === 'not_payable' || result.status === 'included_in_item_rate') {
      if (key === 'lead') calculationRows.push({ label: reason, expression: String(result.status), amount: 0 })
      return 0
    }
    if (result.status !== 'priced' || !Array.isArray(result.terms) || !result.terms.length) {
      throw new Error(`Unsupported ${key} result in ${rule.rule_code}.`)
    }
    let total = 0
    for (const value of result.terms) {
      const term = leadRecord(value)
      const multiplier = evaluateLeadExpression(term.multiplier, inputs)
      if (multiplier < 0) throw new Error('A Lead tariff multiplier cannot be negative.')
      if (multiplier === 0) continue
      const row = rows.find(candidate => candidate.source?.recipeCode === term.recipe_code)
      if (!row?.source) throw new Error(`Published ${key} tariff ${term.recipe_code} is unavailable for SOR ${input.year}.`)
      if (row.unit !== unit) throw new Error(`Lead tariff quantity basis changed: ${unit} / ${row.unit}.`)
      unit = row.unit
      tariffs.set(row.source.recipeCode, row.source)
      const amount = row.rate * multiplier
      total += amount
      if (key === 'lead') calculationRows.push({ label: `${reason} · ${row.source.recipeCode}`,
        quantity: multiplier, unitRate: row.rate, expression: `${multiplier} × ${formatMoney(row.rate)}`, amount })
    }
    return roundMoney(total)
  }
  const leadRate = component('lead')
  let liftRate = component('lift', input.includesAllLifts === true || liftM <= includedLift)
  if (liftRate > 0 && includedLift > 3) {
    // Evaluate the published rule at both physical heights. A parent DATA
    // allowance must not rewrite the source rule's initial lift threshold.
    inputs.lift_m = includedLift
    const includedRate = component('lift')
    inputs.lift_m = liftM
    liftRate = roundMoney(Math.max(0, liftRate - includedRate))
    notes.push(`Less ${formatMoney(includedRate)} lift already included through ${includedLift} m in the parent DATA.`)
  }
  const loadingRate = component('loading', handlingMode === 'none')
  const unloadingRate = component('unloading', handlingMode === 'none')
  const calculation = { ...leadCalculation(calculationRows, unit),
    evidence: { ruleCode: rule.rule_code, year: input.year, zone: input.zone ?? 'zone_3', tariffs: [...tariffs.values()] } }
  const grossRate = roundMoney(leadRate + liftRate + loadingRate + unloadingRate)
  const netRate = roundMoney(grossRate / CPOH_FACTOR)
  return { year: input.year, zone: input.zone ?? 'zone_3', conveyanceClass: input.conveyanceClass,
    unit, quantity, distanceKm, totalLeadM: distanceKm * 1000, mode, handlingMode,
    chargedKm: mode === 'mechanical' ? (distanceKm <= 5 ? Math.ceil(distanceKm) : distanceKm) : null,
    leadRate, loadingRate, unloadingRate, liftRate, grossRate, netRate,
    grossAmount: roundMoney(grossRate * quantity), netAmount: roundMoney(netRate * quantity), calculation, notes }
}

function rebuildBreakdown(
  source: LeadChargeBreakdown,
  leadRate: number,
  loadingRate: number,
  unloadingRate: number,
  liftRate: number,
  notes: string[],
  calculation: LeadRateCalculationDetail = source.calculation
): LeadChargeBreakdown {
  const grossRate = roundMoney(leadRate + loadingRate + unloadingRate + liftRate)
  const netRate = roundMoney(grossRate / CPOH_FACTOR)
  return {
    ...source,
    leadRate: roundMoney(leadRate),
    loadingRate: roundMoney(loadingRate),
    unloadingRate: roundMoney(unloadingRate),
    liftRate: roundMoney(liftRate),
    grossRate,
    netRate,
    grossAmount: roundMoney(grossRate * source.quantity),
    netAmount: roundMoney(netRate * source.quantity),
    calculation: { ...calculation, netLeadRate: roundMoney(leadRate) },
    notes
  }
}

function headLoadRate(
  rows: LeadRateRow[],
  conveyanceClass: ConveyanceClass,
  totalLeadM: number
): { rate: number; unit: string; calculation: LeadRateCalculationDetail } {
  if (totalLeadM <= 50) {
    const unit = findRate(rows, 'COM-LDLFT-1', conveyanceClass, 'upto_100m')?.unit ?? ''
    return {
      rate: 0,
      unit,
      calculation: leadCalculation([{ label: 'Initial lead up to 50 m included', expression: 'included', amount: 0 }], unit)
    }
  }
  const slabKey = totalLeadM <= 100 ? 'upto_100m' : 'upto_150m'
  const row = requiredRate(rows, 'COM-LDLFT-1', conveyanceClass, slabKey)
  return {
    rate: row.rate,
    unit: row.unit,
    calculation: leadCalculation([
      {
        label: totalLeadM <= 100 ? 'Head-load lead up to 100 m' : 'Head-load lead up to 150 m',
        quantity: 1,
        unitRate: row.rate,
        expression: formatMoney(row.rate),
        amount: row.rate
      }
    ], row.unit, [row])
  }
}

function mechanicalLeadRate(
  rows: LeadRateRow[],
  conveyanceClass: ConveyanceClass,
  distanceKm: number
): { rate: number; unit: string; chargedKm: number; calculation: LeadRateCalculationDetail } {
  const chargedKm = rows.some(row => row.source) && distanceKm > 5
    ? distanceKm : Math.max(1, Math.ceil(distanceKm))
  if (chargedKm <= 5) {
    const row = requiredRate(rows, 'COM-LDLFT-2', conveyanceClass, `upto_${chargedKm}km`)
    return {
      rate: row.rate,
      unit: row.unit,
      chargedKm,
      calculation: leadCalculation([
        {
          label: `Lead up to ${chargedKm} km`,
          expression: formatMoney(row.rate),
          amount: row.rate
        }
      ], row.unit, [row])
    }
  }

  const upto5 = requiredRate(rows, 'COM-LDLFT-2', conveyanceClass, 'upto_5km')
  const per5To30 = requiredRate(rows, 'COM-LDLFT-2', conveyanceClass, 'per_km_5_30')
  const perBeyond30 = requiredRate(rows, 'COM-LDLFT-2', conveyanceClass, 'per_km_beyond_30')
  const firstIncrementKm = Math.min(chargedKm, 30) - 5
  const beyond30Km = Math.max(0, chargedKm - 30)
  const calculationRows: LeadRateCalculationLine[] = [
    {
      label: 'Lead up to 5 km',
      quantity: 1,
      unitRate: upto5.rate,
      expression: formatMoney(upto5.rate),
      amount: upto5.rate
    },
    {
      label: 'Lead from 5 to 30 km',
      expression: `${firstIncrementKm} x ${formatMoney(per5To30.rate)}`,
      quantity: firstIncrementKm,
      unitRate: per5To30.rate,
      amount: per5To30.rate * firstIncrementKm
    }
  ]
  if (beyond30Km > 0) {
    calculationRows.push({
      label: 'Lead beyond 30 km',
      expression: `${beyond30Km} x ${formatMoney(perBeyond30.rate)}`,
      quantity: beyond30Km,
      unitRate: perBeyond30.rate,
      amount: perBeyond30.rate * beyond30Km
    })
  }
  return {
    rate: roundMoney(upto5.rate + per5To30.rate * firstIncrementKm + perBeyond30.rate * beyond30Km),
    unit: upto5.unit,
    chargedKm,
    calculation: leadCalculation(calculationRows, upto5.unit, [upto5, per5To30, ...(beyond30Km > 0 ? [perBeyond30] : [])])
  }
}

function liftCharge(
  rows: LeadRateRow[],
  conveyanceClass: ConveyanceClass,
  liftM: number,
  includedInitialLiftM: number
): { rate: number; unit: string; tariffs: LeadRateRow[] } {
  const extraM = Math.max(0, rows.some(row => row.source)
    ? liftM - includedInitialLiftM : Math.ceil(liftM - includedInitialLiftM))
  if (!extraM) return { rate: 0, unit: '', tariffs: [] }
  const row = requiredRate(rows, 'COM-LDLFT-6', conveyanceClass, 'per_1m_beyond_3m')
  return { rate: row.rate * extraM, unit: row.unit, tariffs: [row] }
}

function shouldChargeLift({
  mode,
  liftM,
  includedInitialLiftM,
  includesAllLifts,
  mechanicalConveyanceReachesFinalPoint
}: {
  mode: LeadChargeBreakdown['mode']
  liftM: number
  includedInitialLiftM: number
  includesAllLifts: boolean
  mechanicalConveyanceReachesFinalPoint?: boolean
}): boolean {
  if (includesAllLifts) return false
  if (liftM <= includedInitialLiftM) return false
  if (mode === 'head_load') return true
  return mechanicalConveyanceReachesFinalPoint === false
}

function handlingRates(
  rows: LeadRateRow[],
  conveyanceClass: ConveyanceClass,
  handlingMode: LeadHandlingMode,
  materialName = ''
): { loading: number; unloading: number; unit: string; notes: string[]; tariffs: LeadRateRow[] } {
  const chargeCode =
    handlingMode === 'manual_no_idle'
      ? 'COM-LDLFT-3'
      : handlingMode === 'mechanical'
        ? 'COM-LDLFT-5'
        : 'COM-LDLFT-4'
  const notes: string[] = []

  if (handlingMode === 'mechanical' && conveyanceClass !== 'EARTH' && conveyanceClass !== 'STONE') {
    if (rows.some(row => row.source)) throw new Error('No reviewed material-column match for mechanical handling of this material.')
    notes.push('Mechanical loading/unloading is only available for EARTH and STONE classes.')
    return { loading: 0, unloading: 0, unit: '', notes, tariffs: [] }
  }

  const handlingClass = /lime/i.test(materialName) ? 'STONE' : conveyanceClass
  if (handlingClass !== conveyanceClass) {
    notes.push('Lime uses EARTH for lead but the STONE/LIME loading column.')
  }

  const loading = findRate(rows, chargeCode, handlingClass, 'loading')
  const unloading = findRate(rows, chargeCode, handlingClass, 'unloading')
  if (rows.some(row => row.source) && (!loading || !unloading)) {
    throw new Error(`Handling tariff is unavailable for ${conveyanceClass}.`)
  }
  if (!loading && !unloading) {
    notes.push(`No loading/unloading rows found for ${conveyanceClass}.`)
    return { loading: 0, unloading: 0, unit: '', notes, tariffs: [] }
  }

  const label =
    handlingMode === 'manual_no_idle'
      ? 'Manual handling without idle truck hire'
      : handlingMode === 'manual_with_idle'
        ? 'Manual handling including idle truck hire'
        : 'Mechanical handling'
  notes.push(`${label}: loading and unloading are charged once each.`)
  return {
    loading: loading?.rate ?? 0,
    unloading: unloading?.rate ?? 0,
    unit: loading?.unit ?? unloading?.unit ?? '',
    tariffs: [loading, unloading].filter((row): row is LeadRateRow => Boolean(row)),
    notes
  }
}

function findRate(
  rows: LeadRateRow[],
  chargeCode: string,
  conveyanceClass: ConveyanceClass,
  slabKey: string
): LeadRateRow | undefined {
  return rows.find(
    (row) =>
      row.charge_code === chargeCode &&
      row.slab_key === slabKey &&
      row.applies_to.includes(conveyanceClass)
  )
}

function requiredRate(
  rows: LeadRateRow[],
  chargeCode: string,
  conveyanceClass: ConveyanceClass,
  slabKey: string
): LeadRateRow {
  const row = findRate(rows, chargeCode, conveyanceClass, slabKey)
  if (!row) {
    throw new Error(`${chargeCode} ${slabKey} is not available for ${conveyanceClass}.`)
  }
  return row
}

function leadCalculation(
  rows: LeadRateCalculationLine[],
  unit: string,
  tariffs: LeadRateRow[] = []
): LeadRateCalculationDetail {
  const roundedRows = rows.map((row) => ({ ...row, amount: roundMoney(row.amount) }))
  const fullLeadRate = roundMoney(roundedRows.reduce((sum, row) => sum + row.amount, 0))
  return {
    rows: roundedRows,
    fullLeadRate,
    deductedLeadRate: 0,
    netLeadRate: fullLeadRate,
    unit,
    ...(tariffs[0]?.source ? { evidence: {
      policySource: 'SSR' as const, year: tariffs[0].year, zone: tariffs[0].selectedZone,
      tariffs: tariffs.flatMap(row => row.source ? [row.source] : [])
    } } : {})
  }
}

function withLeadDeduction(
  calculation: LeadRateCalculationDetail,
  fullLeadRate: number,
  label: string,
  deductedLeadRate: number
): LeadRateCalculationDetail {
  const roundedFull = roundMoney(fullLeadRate)
  const roundedDeduction = roundMoney(deductedLeadRate)
  const netLeadRate = roundMoney(Math.max(0, roundedFull - roundedDeduction))
  return {
    ...calculation,
    rows: [
      ...calculation.rows,
      {
        label,
        expression: `-${formatMoney(roundedDeduction)}`,
        amount: -roundedDeduction
      },
      {
        label: 'Net payable lead rate',
        expression: `${formatMoney(roundedFull)} - ${formatMoney(roundedDeduction)}`,
        amount: netLeadRate
      }
    ],
    fullLeadRate: roundedFull,
    deductedLeadRate: roundedDeduction,
    netLeadRate
  }
}

function withLeadMultiplier(
  calculation: LeadRateCalculationDetail,
  multiplier: number
): LeadRateCalculationDetail {
  const fullLeadRate = roundMoney(calculation.fullLeadRate * multiplier)
  const deductedLeadRate = roundMoney(calculation.deductedLeadRate * multiplier)
  const netLeadRate = roundMoney(calculation.netLeadRate * multiplier)
  return {
    ...calculation,
    rows: [
      ...calculation.rows,
      {
        label: `${multiplier} haul legs`,
        quantity: multiplier,
        unitRate: calculation.netLeadRate,
        expression: `${multiplier} x ${formatMoney(calculation.netLeadRate)}`,
        amount: netLeadRate
      }
    ],
    fullLeadRate,
    deductedLeadRate,
    netLeadRate
  }
}

function manualLeadCalculation(rate: number, unit: string): LeadRateCalculationDetail {
  const roundedRate = roundMoney(rate)
  return {
    rows: [
      {
        label: 'Project-local manual lead rate',
        expression: formatMoney(roundedRate),
        amount: roundedRate
      }
    ],
    fullLeadRate: roundedRate,
    deductedLeadRate: 0,
    netLeadRate: roundedRate,
    unit
  }
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function numericOrNull(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function formatMoney(value: number): string {
  return roundMoney(value).toFixed(2)
}
