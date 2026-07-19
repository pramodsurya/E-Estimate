import { supabase } from './supabase'
import type {
  ConveyanceClass,
  LeadChargeCode,
  LeadHandlingMode,
  LeadIncludedBasis,
  LeadRateCalculationDetail,
  LeadRateCalculationLine
} from '../types/project'
export type { LeadHandlingMode } from '../types/project'

export const CONVEYANCE_CLASSES: ConveyanceClass[] = [
  'EARTH',
  'STONE',
  'CEMENT',
  'STEEL',
  'SLAB_WOOD',
  'WATER',
  'BRICKS'
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
}

export interface LeadChargeInput {
  year: string
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
}

export interface LeadVariantChargeInput extends LeadChargeInput {
  includedBasis?: LeadIncludedBasis
  customGrossRate?: number | null
  /** Repeated haul legs represented by the same mapped route (for example fabricated parts). */
  leadMultiplier?: number
}

export interface LeadChargeBreakdown {
  year: string
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
    BRICKS: 'Bricks'
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

export async function fetchLeadRates(year: string): Promise<LeadRateRow[]> {
  const cached = rateCache.get(year)
  if (cached) return cached

  const { data, error } = await supabase
    .from('lead_rate')
    .select(
      'charge_code,year,slab_key,column_key,applies_to,unit,basis,slab_label,range_from,range_to,range_unit,rate'
    )
    .eq('year', year)
    .order('charge_code')
    .order('range_from', { nullsFirst: true })
    .order('slab_key')
    .order('column_key')

  if (error) throw new Error(`Unable to load lead rates: ${error.message}`)
  const rows = (data ?? []).map(normalizeLeadRateRow)
  rateCache.set(year, rows)
  return rows
}

export async function calculateLeadCharge(input: LeadChargeInput): Promise<LeadChargeBreakdown> {
  const rows = await fetchLeadRates(input.year)
  return calculateLeadChargeFromRows(rows, input)
}

export async function calculateLeadVariantCharge(
  input: LeadVariantChargeInput
): Promise<LeadChargeBreakdown> {
  const rows = await fetchLeadRates(input.year)
  return calculateLeadVariantChargeFromRows(rows, input)
}

export function calculateLeadChargeFromRows(
  rows: LeadRateRow[],
  input: LeadChargeInput
): LeadChargeBreakdown {
  const quantity = Math.max(0, numberValue(input.quantity, 1))
  const distanceKm = Math.max(0, numberValue(input.distanceKm))
  const totalLeadM = distanceKm * 1000
  const handlingMode = input.handlingMode ?? 'manual_with_idle'
  const liftM = Math.max(0, numberValue(input.liftM))
  const includedInitialLiftM = Math.max(0, numberValue(input.includedInitialLiftM, 3))
  const includesAllLifts = input.includesAllLifts === true
  const notes: string[] = []
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
    notes.push(`Mechanical lead rounded up to ${mechanical.chargedKm} km for slab selection.`)
    if (handlingMode !== 'none') {
      const handling = handlingRates(rows, input.conveyanceClass, handlingMode, input.materialName)
      loadingRate = handling.loading
      unloadingRate = handling.unloading
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
  if (input.chargeCode && input.chargeCode !== 'AUTO') {
    notes.push(`${input.chargeCode} was selected on the Lead variant; payable rates are still selected by the SoR distance, handling, and lift rules.`)
  }
  return {
    year: input.year,
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
  const total = calculateLeadChargeFromRows(rows, normalizedInput)

  if (basis === 'all_leads') {
    return rebuildBreakdown(total, 0, 0, 0, 0, [
      ...total.notes,
      'This DATA item says all leads are included, so no additional lead is payable.'
    ], withLeadDeduction(total.calculation, total.leadRate, 'Less all leads included in parent item', total.leadRate))
  }

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
    total.notes.push('Deducted the 1 km COM-LDLFT lead already included in the DATA item.')
    if (loadingRate || unloadingRate) {
      total.notes.push(LOADING_UNLOADING_INITIAL_LEAD_CAUTION)
    }
  } else if (basis === 'initial_50m') {
    total.notes.push('Initial 50 m is treated as internal lead; no mechanical chart deduction is made.')
  }

  if (normalizedInput.customGrossRate !== null && normalizedInput.customGrossRate !== undefined) {
    return rebuildBreakdown(total, normalizedInput.customGrossRate, 0, 0, 0, [
      ...total.notes,
      'Using project-local DTL/manual gross rate for this Lead material.'
    ], manualLeadCalculation(normalizedInput.customGrossRate, total.unit))
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

function normalizeLeadRateRow(row: Record<string, unknown>): LeadRateRow {
  return {
    charge_code: String(row.charge_code ?? ''),
    year: String(row.year ?? ''),
    slab_key: String(row.slab_key ?? ''),
    column_key: String(row.column_key ?? ''),
    applies_to: Array.isArray(row.applies_to) ? row.applies_to.map(String) : [],
    unit: String(row.unit ?? ''),
    basis: String(row.basis ?? 'cumulative_total') as LeadRateRow['basis'],
    slab_label: String(row.slab_label ?? ''),
    range_from: numericOrNull(row.range_from),
    range_to: numericOrNull(row.range_to),
    range_unit: row.range_unit == null ? null : String(row.range_unit),
    rate: numberValue(row.rate)
  }
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
        expression: formatMoney(row.rate),
        amount: row.rate
      }
    ], row.unit)
  }
}

function mechanicalLeadRate(
  rows: LeadRateRow[],
  conveyanceClass: ConveyanceClass,
  distanceKm: number
): { rate: number; unit: string; chargedKm: number; calculation: LeadRateCalculationDetail } {
  const chargedKm = Math.max(1, Math.ceil(distanceKm))
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
      ], row.unit)
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
      expression: formatMoney(upto5.rate),
      amount: upto5.rate
    },
    {
      label: 'Lead from 5 to 30 km',
      expression: `${firstIncrementKm} x ${formatMoney(per5To30.rate)}`,
      amount: per5To30.rate * firstIncrementKm
    }
  ]
  if (beyond30Km > 0) {
    calculationRows.push({
      label: 'Lead beyond 30 km',
      expression: `${beyond30Km} x ${formatMoney(perBeyond30.rate)}`,
      amount: perBeyond30.rate * beyond30Km
    })
  }
  return {
    rate: roundMoney(upto5.rate + per5To30.rate * firstIncrementKm + perBeyond30.rate * beyond30Km),
    unit: upto5.unit,
    chargedKm,
    calculation: leadCalculation(calculationRows, upto5.unit)
  }
}

function liftCharge(
  rows: LeadRateRow[],
  conveyanceClass: ConveyanceClass,
  liftM: number,
  includedInitialLiftM: number
): { rate: number; unit: string } {
  const extraM = Math.max(0, Math.ceil(liftM - includedInitialLiftM))
  if (!extraM) return { rate: 0, unit: '' }
  const row = requiredRate(rows, 'COM-LDLFT-6', conveyanceClass, 'per_1m_beyond_3m')
  return { rate: row.rate * extraM, unit: row.unit }
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
): { loading: number; unloading: number; unit: string; notes: string[] } {
  const chargeCode =
    handlingMode === 'manual_no_idle'
      ? 'COM-LDLFT-3'
      : handlingMode === 'mechanical'
        ? 'COM-LDLFT-5'
        : 'COM-LDLFT-4'
  const notes: string[] = []

  if (handlingMode === 'mechanical' && conveyanceClass !== 'EARTH' && conveyanceClass !== 'STONE') {
    notes.push('Mechanical loading/unloading is only available for EARTH and STONE classes.')
    return { loading: 0, unloading: 0, unit: '', notes }
  }

  const handlingClass = /lime/i.test(materialName) ? 'STONE' : conveyanceClass
  if (handlingClass !== conveyanceClass) {
    notes.push('Lime uses EARTH for lead but the STONE/LIME loading column.')
  }

  const loading = findRate(rows, chargeCode, handlingClass, 'loading')
  const unloading = findRate(rows, chargeCode, handlingClass, 'unloading')
  if (!loading && !unloading) {
    notes.push(`No loading/unloading rows found for ${conveyanceClass}.`)
    return { loading: 0, unloading: 0, unit: '', notes }
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
  unit: string
): LeadRateCalculationDetail {
  const roundedRows = rows.map((row) => ({ ...row, amount: roundMoney(row.amount) }))
  const fullLeadRate = roundMoney(roundedRows.reduce((sum, row) => sum + row.amount, 0))
  return {
    rows: roundedRows,
    fullLeadRate,
    deductedLeadRate: 0,
    netLeadRate: fullLeadRate,
    unit
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
        label: 'Project-local DTL/manual lead rate',
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
