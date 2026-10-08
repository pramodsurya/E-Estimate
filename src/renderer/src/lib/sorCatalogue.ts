import { supabase } from './supabase'
import type {
  SorCatalogueCommercialTerms,
  SorCatalogueDimensionValue,
  SorPublishedReference
} from '../types/project'

export const SOR_CATALOGUE_CATEGORY = 'sor_catalogue'

export interface SorDimensionDefinition {
  type: 'number' | 'boolean' | 'text' | string
  values: Array<string | number | boolean>
}

export type SorDimensionSchema = Record<string, SorDimensionDefinition>

export interface SorCatalogue {
  catalogue_code: string
  name: string
  part: string
  section: string
  dimension_schema: SorDimensionSchema
}

export interface SorCatalogueOptionRow {
  dimension_key: string
  dimension_value: string
  matching_items: number
}

export interface SorCatalogueOption {
  rawValue: string
  value: Exclude<SorCatalogueDimensionValue, null>
  matchingItems: number
}

export type SorCatalogueOptionsByDimension = Record<string, SorCatalogueOption[]>

export interface SorCataloguePriceMatch {
  item_code: string
  item_name: string
  unit: string | null
  dimensions: Record<string, SorCatalogueDimensionValue>
  rate: number | null
  rate_text: string
  effective_from: string | null
  source: string | null
  source_page: number | null
  source_context: Record<string, unknown>
}

export interface SorCatalogueItemSearchMatch extends SorCataloguePriceMatch {
  catalogue_code: string
  catalogue_name: string
  part: string
  section: string
}

const AUDIT_DIMENSIONS = new Set(['matrix_row', 'matrix_column'])
const PRINTED_AXIS_DIMENSIONS = new Set(['row_label', 'column_label'])

const DIMENSION_PRIORITY: Record<string, number> = {
  rate_component: 0,
  pipe_class: 10,
  pressure: 20,
  material_type: 30,
  type: 40,
  floor: 50,
  diameter_mm: 60,
  width_mm: 70,
  height_mm: 80,
  thickness_mm: 90,
  length_mm: 100,
  column_label: 800,
  row_label: 900
}

let catalogueRequest: Promise<SorCatalogue[]> | null = null

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeSchema(value: unknown): SorDimensionSchema {
  return Object.fromEntries(
    Object.entries(record(value)).flatMap(([key, rawDefinition]) => {
      const definition = record(rawDefinition)
      const values = Array.isArray(definition.values)
        ? definition.values.filter(
            (candidate): candidate is string | number | boolean =>
              typeof candidate === 'string' ||
              typeof candidate === 'number' ||
              typeof candidate === 'boolean'
          )
        : []
      return [[key, { type: String(definition.type ?? 'text'), values }]]
    })
  )
}

export async function fetchSorCatalogues(): Promise<SorCatalogue[]> {
  if (!catalogueRequest) {
    catalogueRequest = (async () => {
      const { data, error } = await supabase
        .from('sor_catalogue')
        .select('catalogue_code,name,part,section,dimension_schema')
        .order('part')
        .order('name')
      if (error) throw error
      return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        catalogue_code: String(row.catalogue_code ?? ''),
        name: String(row.name ?? ''),
        part: String(row.part ?? ''),
        section: String(row.section ?? ''),
        dimension_schema: normalizeSchema(row.dimension_schema)
      }))
    })().catch((error) => {
      catalogueRequest = null
      throw error
    })
  }
  return catalogueRequest
}

export async function fetchSorCatalogueOptions(
  catalogueCode: string,
  sorYear: string,
  filters: Record<string, SorCatalogueDimensionValue>
): Promise<SorCatalogueOptionRow[]> {
  const { data, error } = await supabase.rpc('get_sor_catalogue_options', {
    p_catalogue_code: catalogueCode,
    p_sor_year: sorYear,
    p_filters: filters
  })
  if (error) throw error
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    dimension_key: String(row.dimension_key ?? ''),
    dimension_value: String(row.dimension_value ?? ''),
    matching_items: finiteNumber(row.matching_items) ?? 0
  }))
}

export async function fetchSorCataloguePrice(
  catalogueCode: string,
  sorYear: string,
  dimensions: Record<string, SorCatalogueDimensionValue>
): Promise<SorCataloguePriceMatch[]> {
  const { data, error } = await supabase.rpc('get_sor_catalogue_price', {
    p_catalogue_code: catalogueCode,
    p_sor_year: sorYear,
    p_dimensions: dimensions
  })
  if (error) throw error
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    item_code: String(row.item_code ?? ''),
    item_name: String(row.item_name ?? ''),
    unit: row.unit == null ? null : String(row.unit),
    dimensions: record(row.dimensions) as Record<string, SorCatalogueDimensionValue>,
    rate: finiteNumber(row.rate),
    rate_text: String(row.rate_text ?? ''),
    effective_from: row.effective_from == null ? null : String(row.effective_from),
    source: row.source == null ? null : String(row.source),
    source_page: finiteNumber(row.source_page),
    source_context: record(row.source_context)
  }))
}

export async function searchSorCatalogueItems(
  query: string,
  sorYear: string,
  limit = 40
): Promise<SorCatalogueItemSearchMatch[]> {
  const { data, error } = await supabase.rpc('search_sor_catalogue_items', {
    p_sor_year: sorYear,
    p_query: query,
    p_limit: limit
  })
  if (error) throw error
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    item_code: String(row.item_code ?? ''),
    item_name: String(row.item_name ?? ''),
    unit: row.unit == null ? null : String(row.unit),
    dimensions: record(row.dimensions) as Record<string, SorCatalogueDimensionValue>,
    rate: finiteNumber(row.rate),
    rate_text: String(row.rate_text ?? ''),
    effective_from: row.effective_from == null ? null : String(row.effective_from),
    source: row.source == null ? null : String(row.source),
    source_page: finiteNumber(row.source_page),
    source_context: record(row.source_context),
    catalogue_code: String(row.catalogue_code ?? ''),
    catalogue_name: String(row.catalogue_name ?? ''),
    part: String(row.part ?? ''),
    section: String(row.section ?? '')
  }))
}

export function dimensionValue(
  schema: SorDimensionSchema,
  key: string,
  value: string
): Exclude<SorCatalogueDimensionValue, null> {
  const type = schema[key]?.type
  if (type === 'number') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : value
  }
  if (type === 'boolean') return value.toLowerCase() === 'true'
  return value
}

export function groupSorCatalogueOptions(
  rows: SorCatalogueOptionRow[],
  schema: SorDimensionSchema
): SorCatalogueOptionsByDimension {
  const grouped: SorCatalogueOptionsByDimension = {}
  for (const row of rows) {
    if (!row.dimension_key || AUDIT_DIMENSIONS.has(row.dimension_key)) continue
    const options = grouped[row.dimension_key] ?? []
    options.push({
      rawValue: row.dimension_value,
      value: dimensionValue(schema, row.dimension_key, row.dimension_value),
      matchingItems: row.matching_items
    })
    grouped[row.dimension_key] = options
  }
  for (const [key, options] of Object.entries(grouped)) {
    const numeric = schema[key]?.type === 'number'
    options.sort((left, right) =>
      numeric
        ? Number(left.value) - Number(right.value)
        : String(left.value).localeCompare(String(right.value), undefined, {
            numeric: true,
            sensitivity: 'base'
          })
    )
  }
  return grouped
}

export function staticSorCatalogueOptions(
  schema: SorDimensionSchema
): SorCatalogueOptionsByDimension {
  return Object.fromEntries(
    Object.entries(schema)
      .filter(([key]) => !AUDIT_DIMENSIONS.has(key))
      .map(([key, definition]) => [
        key,
        definition.values
          .map((value) => ({
            rawValue: String(value),
            value: dimensionValue(schema, key, String(value)),
            matchingItems: 0
          }))
          .sort((left, right) =>
            definition.type === 'number'
              ? Number(left.value) - Number(right.value)
              : String(left.value).localeCompare(String(right.value), undefined, {
                  numeric: true,
                  sensitivity: 'base'
                })
          )
      ])
  )
}

export function singletonSorDimensions(
  options: SorCatalogueOptionsByDimension,
  filters: Record<string, SorCatalogueDimensionValue>
): Array<{ key: string; option: SorCatalogueOption }> {
  return Object.entries(options)
    .filter(([key, values]) => !(key in filters) && values.length === 1)
    .map(([key, values]) => ({ key, option: values[0] }))
}

export function nextSorDimension(
  options: SorCatalogueOptionsByDimension,
  filters: Record<string, SorCatalogueDimensionValue>
): string | null {
  const candidates = Object.entries(options)
    .filter(([key, values]) => !(key in filters) && values.length > 1)
    .map(([key, values]) => ({ key, count: values.length }))
  if (!candidates.length) return null

  const semantic = candidates.filter(({ key }) => !PRINTED_AXIS_DIMENSIONS.has(key))
  const pool = semantic.length ? semantic : candidates
  pool.sort(
    (left, right) =>
      (DIMENSION_PRIORITY[left.key] ?? 500) - (DIMENSION_PRIORITY[right.key] ?? 500) ||
      left.count - right.count ||
      left.key.localeCompare(right.key)
  )
  return pool[0].key
}

export function visibleSorDimensions(
  dimensions: Record<string, SorCatalogueDimensionValue>
): Record<string, SorCatalogueDimensionValue> {
  return Object.fromEntries(
    Object.entries(dimensions).filter(([key]) => !AUDIT_DIMENSIONS.has(key))
  )
}

export function sorCommercialTerms(
  sourceContext: Record<string, unknown>
): SorCatalogueCommercialTerms | undefined {
  const terms = record(sourceContext.commercial_terms)
  const basis = typeof terms.basis === 'string' ? terms.basis : undefined
  const transportation =
    typeof terms.transportation === 'string' ? terms.transportation : undefined
  const taxes = typeof terms.taxes === 'string' ? terms.taxes : undefined
  return basis || transportation || taxes ? { basis, transportation, taxes } : undefined
}

export function sourceContextTitle(sourceContext: Record<string, unknown>): string | null {
  return typeof sourceContext.title === 'string' ? sourceContext.title : null
}

function printedText(value: unknown): string | undefined {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value).trim() || undefined
    : undefined
}

/** Read printed cells by their header, never from a hash, sort order or matrix row index. */
export function sorPublishedReference(
  catalogueName: string,
  sourceContext: Record<string, unknown>,
  dimensions: Record<string, SorCatalogueDimensionValue> = {}
): SorPublishedReference {
  const headers = Array.isArray(sourceContext.headers) ? sourceContext.headers : []
  const row = Array.isArray(sourceContext.raw_row) ? sourceContext.raw_row : []
  const cell = (names: string[]): string | undefined => {
    const index = headers.findIndex((header) =>
      names.includes(String(header).toLowerCase().replace(/[^a-z0-9]/g, ''))
    )
    return index >= 0 ? printedText(row[index]) : undefined
  }
  return {
    tableName: printedText(sourceContext.table_name) || printedText(sourceContext.title) || catalogueName,
    serialNumber: printedText(sourceContext.serial_number) || cell(['slno', 'sno', 'serialno', 'serialnumber']),
    scheduleItemNumber: printedText(sourceContext.schedule_item_number) || cell(['ssitemno', 'ssitemnumber', 'itemno', 'itemnumber']),
    rowLabel: printedText(dimensions.row_label),
    columnLabel: printedText(dimensions.column_label)
  }
}

export function sorPublishedReferenceLabel(reference: SorPublishedReference): string {
  return [
    reference.tableName,
    reference.serialNumber ? `Sl. No. ${reference.serialNumber}` : reference.rowLabel,
    !reference.serialNumber ? reference.columnLabel : undefined
  ].filter(Boolean).join(' · ')
}

const referenceRequests = new Map<string, Promise<{ reference: SorPublishedReference; description: string; page: number | null } | null>>()

/** Compatibility lookup for saved projects which predate printed-reference metadata. */
export function fetchSorPublishedReference(itemCode: string, sorYear: string): Promise<{
  reference: SorPublishedReference
  description: string
  page: number | null
} | null> {
  const key = JSON.stringify([itemCode, sorYear])
  let request = referenceRequests.get(key)
  if (!request) {
    request = (async () => {
      const [itemResult, rateResult, catalogues] = await Promise.all([
        supabase.from('sor_catalogue_item').select('catalogue_code,name,dimensions,source_context').eq('item_code', itemCode).maybeSingle(),
        supabase.from('sor_catalogue_rate').select('source_page').eq('item_code', itemCode).eq('sor_year', sorYear).maybeSingle(),
        fetchSorCatalogues()
      ])
      if (itemResult.error) throw itemResult.error
      if (rateResult.error) throw rateResult.error
      if (!itemResult.data || !rateResult.data) return null
      const item = itemResult.data
      const catalogue = catalogues.find((candidate) => candidate.catalogue_code === item.catalogue_code)
      if (!catalogue) return null
      return {
        reference: sorPublishedReference(catalogue.name, record(item.source_context), record(item.dimensions) as Record<string, SorCatalogueDimensionValue>),
        description: String(item.name ?? ''),
        page: finiteNumber(rateResult.data.source_page)
      }
    })().catch((error) => {
      referenceRequests.delete(key)
      throw error
    })
    referenceRequests.set(key, request)
  }
  return request
}
