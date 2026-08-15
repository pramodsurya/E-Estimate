import { supabase } from './supabase'
import type {
  PipeLeadQuote,
  PipeLeadSource,
  SorZone
} from '../types/project'
import type { LeadChargeBreakdown } from './lead'

export interface PipeLeadCatalogue {
  pipeLeadCatalogueCode: string
  catalogueName: string
  pipeEndType: string
  pipeClassGroups: string[]
  diametersMm: number[]
  itemCount: number
}

export interface PipeLeadOption {
  pipeLeadItemCode: string
  catalogueName: string
  pipeEndType: string
  pipeClassGroup: string
  pipeClasses: string[]
  diameterMm: number
  unit: string
  upto5KmRate: number
  additionalPerStartedKmRate: number
  rateScope: string
  zoneRates: Record<string, number> | null
}

export interface PipeLeadYearRate {
  sorYear: string
  effectiveFrom: string | null
  upto5KmRate: number
  additionalPerStartedKmRate: number
  rateScope: string
  sourcePage: number | null
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

function numbers(value: unknown): number[] {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        const parsed = finiteNumber(item)
        return parsed === null ? [] : [parsed]
      })
    : []
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function requiredNumber(value: unknown, field: string): number {
  const parsed = finiteNumber(value)
  if (parsed === null) throw new Error(`Pipe Lead quote did not return a valid ${field}.`)
  return parsed
}

function quotePayload(data: unknown): Record<string, unknown> {
  if (Array.isArray(data)) return record(data[0])
  return record(data)
}

export function pipeLeadSourceFromContext(
  sourceContext: Record<string, unknown>,
  materialItemCode: string
): PipeLeadSource | undefined {
  const source = record(sourceContext.pipe_lead)
  const pipeLeadItemCode =
    typeof source.pipe_lead_item_code === 'string' ? source.pipe_lead_item_code.trim() : ''
  const pipeLeadCatalogueCode =
    typeof source.pipe_lead_catalogue_code === 'string'
      ? source.pipe_lead_catalogue_code.trim()
      : ''
  const pipeClassGroup =
    typeof source.pipe_class_group === 'string' ? source.pipe_class_group.trim() : ''
  const diameterMm = finiteNumber(source.diameter_mm)
  if (!materialItemCode.trim() || !pipeLeadItemCode || !pipeLeadCatalogueCode || !pipeClassGroup) {
    return undefined
  }
  if (diameterMm === null) return undefined
  return {
    materialItemCode: materialItemCode.trim(),
    pipeLeadItemCode,
    pipeLeadCatalogueCode,
    catalogueName: typeof source.catalogue_name === 'string' ? source.catalogue_name : undefined,
    pipeEndType: typeof source.pipe_end_type === 'string' ? source.pipe_end_type : undefined,
    pipeClassGroup,
    diameterMm,
    unit: typeof source.unit === 'string' ? source.unit : 'metre',
    rateScope: typeof source.rate_scope === 'string' ? source.rate_scope : undefined,
    autoApply: source.auto_apply !== false,
    distanceInputRequired: source.distance_input_required !== false,
    handlingIncluded: strings(source.handling_included)
  }
}

export function pipeLeadMaterialName(source: PipeLeadSource): string {
  const endType =
    source.pipeEndType === 'PLAIN_ENDED'
      ? 'plain-ended'
      : source.pipeEndType === 'SOCKET_SPIGOT'
        ? 'socket-and-spigot'
        : 'RCC'
  const classGroup = source.pipeClassGroup.replaceAll('_', ' / ')
  return `RCC ${endType} pipe · ${classGroup} · ${source.diameterMm} mm`
}

export function pipeLeadCatalogueLabel(source: PipeLeadSource): string {
  if (source.catalogueName?.trim()) return source.catalogueName.trim()
  if (source.pipeEndType === 'PLAIN_ENDED') return 'RCC plain-ended pipe conveyance'
  if (source.pipeEndType === 'SOCKET_SPIGOT') return 'RCC socket-and-spigot pipe conveyance'
  return 'RCC pipe conveyance'
}

export async function fetchPipeLeadCatalogues(sorYear: string): Promise<PipeLeadCatalogue[]> {
  const { data, error } = await supabase.rpc('list_pipe_lead_catalogues', {
    p_sor_year: sorYear
  })
  if (error) throw new Error(`Unable to load RCC pipe Lead catalogues: ${error.message}`)
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    pipeLeadCatalogueCode: String(row.pipe_lead_catalogue_code ?? ''),
    catalogueName: String(row.catalogue_name ?? ''),
    pipeEndType: String(row.pipe_end_type ?? ''),
    pipeClassGroups: strings(row.pipe_class_groups),
    diametersMm: numbers(row.diameters_mm),
    itemCount: finiteNumber(row.item_count) ?? 0
  }))
}

export async function fetchPipeLeadOptions(
  pipeLeadCatalogueCode: string,
  sorYear: string
): Promise<PipeLeadOption[]> {
  const { data, error } = await supabase.rpc('get_pipe_lead_options', {
    p_pipe_lead_catalogue_code: pipeLeadCatalogueCode,
    p_sor_year: sorYear
  })
  if (error) throw new Error(`Unable to load RCC pipe Lead rates: ${error.message}`)
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => {
    const zoneRates = record(row.zone_rates)
    return {
      pipeLeadItemCode: String(row.pipe_lead_item_code ?? ''),
      catalogueName: String(row.catalogue_name ?? ''),
      pipeEndType: String(row.pipe_end_type ?? ''),
      pipeClassGroup: String(row.pipe_class_group ?? ''),
      pipeClasses: strings(row.pipe_classes),
      diameterMm: finiteNumber(row.diameter_mm) ?? 0,
      unit: String(row.unit ?? 'metre'),
      upto5KmRate: finiteNumber(row.upto_5km_rate) ?? 0,
      additionalPerStartedKmRate:
        finiteNumber(row.additional_per_started_km_rate) ?? 0,
      rateScope: String(row.rate_scope ?? ''),
      zoneRates: Object.keys(zoneRates).length
        ? Object.fromEntries(
            Object.entries(zoneRates).flatMap(([key, value]) => {
              const rate = finiteNumber(value)
              return rate === null ? [] : [[key, rate]]
            })
          )
        : null
    }
  })
}

export async function fetchPipeLeadQuoteForMaterial(input: {
  materialItemCode: string
  sorYear: string
  distanceKm: number
  quantity: number
  zone?: string | null
}): Promise<PipeLeadQuote> {
  const { data, error } = await supabase.rpc('get_pipe_lead_quote_for_material', {
    p_material_item_code: input.materialItemCode,
    p_sor_year: input.sorYear,
    p_distance_km: input.distanceKm,
    p_quantity: input.quantity,
    p_zone: input.zone ?? null
  })
  if (error) throw new Error(`Unable to quote RCC pipe Lead: ${error.message}`)
  return normalizePipeLeadQuote(data)
}

export async function fetchPipeLeadQuote(input: {
  pipeLeadItemCode: string
  sorYear: string
  distanceKm: number
  quantity: number
  zone?: string | null
}): Promise<PipeLeadQuote> {
  const { data, error } = await supabase.rpc('get_pipe_lead_quote', {
    p_pipe_lead_item_code: input.pipeLeadItemCode,
    p_sor_year: input.sorYear,
    p_distance_km: input.distanceKm,
    p_quantity: input.quantity,
    p_zone: input.zone ?? null
  })
  if (error) throw new Error(`Unable to quote RCC pipe Lead: ${error.message}`)
  return normalizePipeLeadQuote(data)
}

export async function fetchPipeLeadYearRates(
  pipeLeadItemCode: string
): Promise<PipeLeadYearRate[]> {
  const { data, error } = await supabase
    .from('pipe_lead_rate')
    .select(
      'sor_year,effective_from,upto_5km_rate,additional_per_started_km_rate,rate_scope,source_page'
    )
    .eq('pipe_lead_item_code', pipeLeadItemCode)
    .order('effective_from')
  if (error) throw new Error(`Unable to compare RCC pipe Lead years: ${error.message}`)
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    sorYear: String(row.sor_year ?? ''),
    effectiveFrom: row.effective_from == null ? null : String(row.effective_from),
    upto5KmRate: finiteNumber(row.upto_5km_rate) ?? 0,
    additionalPerStartedKmRate:
      finiteNumber(row.additional_per_started_km_rate) ?? 0,
    rateScope: String(row.rate_scope ?? ''),
    sourcePage: finiteNumber(row.source_page)
  }))
}

export function normalizePipeLeadQuote(data: unknown): PipeLeadQuote {
  const row = quotePayload(data)
  const status = String(row.status ?? '')
  if (status !== 'PRICED') {
    throw new Error(
      typeof row.message === 'string'
        ? row.message
        : `RCC pipe Lead is not priced for the selected SOR year (${status || 'unknown status'}).`
    )
  }
  return {
    status,
    sorYear: String(row.sor_year ?? ''),
    materialItemCode:
      typeof row.material_item_code === 'string' ? row.material_item_code : undefined,
    pipeLeadItemCode: String(row.pipe_lead_item_code ?? ''),
    pipeLeadCatalogueCode: String(row.pipe_lead_catalogue_code ?? ''),
    catalogueName: String(row.catalogue_name ?? ''),
    pipeEndType: String(row.pipe_end_type ?? ''),
    pipeClassGroup: String(row.pipe_class_group ?? ''),
    pipeClasses: strings(row.pipe_classes),
    diameterMm: requiredNumber(row.diameter_mm, 'diameter'),
    unit: String(row.unit ?? 'metre'),
    distanceKm: requiredNumber(row.distance_km, 'distance'),
    quantity: requiredNumber(row.quantity, 'quantity'),
    upto5KmRate: requiredNumber(row.upto_5km_rate, 'up-to-5-km rate'),
    additionalPerStartedKmRate: requiredNumber(
      row.additional_per_started_km_rate,
      'additional-per-started-km rate'
    ),
    additionalStartedKm: requiredNumber(row.additional_started_km, 'additional kilometre count'),
    leadRatePerMetre: requiredNumber(row.lead_rate_per_metre, 'Lead rate per metre'),
    amount: requiredNumber(row.amount, 'amount'),
    rateScope: String(row.rate_scope ?? ''),
    selectedZone: row.selected_zone == null ? null : String(row.selected_zone),
    sourcePage: finiteNumber(row.source_page),
    handlingIncluded: strings(row.handling_included)
  }
}

export function pipeLeadQuoteBreakdown(
  quote: PipeLeadQuote,
  zone: SorZone = 'zone_3'
): LeadChargeBreakdown {
  const rows = quote.distanceKm <= 0
    ? [{
        label: 'No conveyance charge',
        expression: 'Distance = 0 km',
        amount: 0
      }]
    : [
        {
          label: 'Published rate up to 5 km',
          expression: quote.upto5KmRate.toFixed(2),
          amount: quote.upto5KmRate
        },
        ...(quote.additionalStartedKm > 0
          ? [{
              label: 'Additional started kilometre(s)',
              expression:
                `${quote.additionalStartedKm} x ${quote.additionalPerStartedKmRate.toFixed(2)}`,
              amount: quote.additionalStartedKm * quote.additionalPerStartedKmRate
            }]
          : [])
      ]
  return {
    year: quote.sorYear,
    zone,
    conveyanceClass: 'RCC_PIPE',
    unit: quote.unit,
    quantity: quote.quantity,
    distanceKm: quote.distanceKm,
    chargedKm: quote.additionalStartedKm,
    totalLeadM: quote.distanceKm * 1000,
    mode: 'mechanical',
    handlingMode: 'none',
    leadRate: quote.leadRatePerMetre,
    loadingRate: 0,
    unloadingRate: 0,
    liftRate: 0,
    grossRate: quote.leadRatePerMetre,
    netRate: quote.leadRatePerMetre,
    grossAmount: quote.amount,
    netAmount: quote.amount,
    calculation: {
      rows,
      fullLeadRate: quote.leadRatePerMetre,
      deductedLeadRate: 0,
      netLeadRate: quote.leadRatePerMetre,
      unit: quote.unit
    },
    notes: [
      'Public Health RCC pipe-conveyance Table 6/7 rate.',
      'Loading, unloading, and stacking are included in the published rate.',
      'Every started kilometre beyond 5 km is charged as a full additional kilometre.'
    ]
  }
}
