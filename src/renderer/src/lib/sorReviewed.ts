import { supabase } from './supabase'
import { SOR_CATALOGUE_CATEGORY, sorCommercialTerms } from './sorCatalogue'
import type { MasterItem } from './masterData'
import type {
  ReviewedSorCalculation, ReviewedSorDetail, ReviewedSorObservation,
  ReviewedSorRule, ReviewedSorSelection
} from '../types/sorReviewed'

export interface ReviewedSorCatalogue {
  catalogue_code: string
  table_name: string
  published_variants: number
  cost_ready_variants: number
}

export function sorRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {}
}

function number(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function normalizeReviewedObservation(value: unknown): ReviewedSorObservation {
  const row = sorRecord(value)
  const reference = sorRecord(row.source_reference)
  const basis = sorRecord(row.unit_basis)
  const assessment = sorRecord(row.assessment)
  const context = sorRecord(row.source_context)
  return {
    occurrence_id: String(row.occurrence_id ?? ''), item_id: String(row.item_id ?? ''),
    sor_year: String(row.sor_year ?? reference.sor_year ?? ''),
    catalogue_code: String(row.catalogue_code ?? reference.catalogue_code ?? ''),
    table_name: String(row.table_name ?? reference.table_name ?? ''),
    printed_code: String(row.printed_code ?? reference.printed_code ?? ''),
    serial_number: String(row.serial_number ?? reference.serial_number ?? ''),
    pdf_page: number(row.pdf_page ?? reference.pdf_page),
    description: String(row.description ?? ''),
    effective_description: String(row.effective_description ?? row.description ?? ''),
    family_label: String(row.family_label ?? context.parent_description ?? row.effective_description ?? row.description ?? ''),
    variant_label: String(row.variant_label ?? row.effective_description ?? row.description ?? ''),
    group_label: String(row.group_label ?? context.variant_group ?? ''),
    rate: number(row.rate), unit: String(row.unit ?? basis.unit ?? ''),
    basis_quantity: number(row.basis_quantity ?? basis.quantity),
    assessment_status: String(row.assessment_status ?? assessment.status ?? 'unresolved'),
    cost_ready: row.cost_ready === true,
    has_reviewed_correction: row.has_reviewed_correction === true || Boolean(context.specification_review || context.unit_resolution),
    features: sorRecord(row.features)
  }
}

async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw new Error(error.message)
  return data
}

export async function listReviewedSorCatalogues(year: string): Promise<ReviewedSorCatalogue[]> {
  const data = await rpc('list_sor_reviewed_catalogues', { p_sor_year: year })
  return (Array.isArray(data) ? data : []).map(value => {
    const row = sorRecord(value)
    return { catalogue_code: String(row.catalogue_code), table_name: String(row.table_name),
      published_variants: number(row.published_variants) ?? 0, cost_ready_variants: number(row.cost_ready_variants) ?? 0 }
  })
}

/** A serial is table-scoped. R&B is a schedule hint, never a globally unique code. */
export function parseReviewedSorSearch(input: string): { query: string; serial: string | null; roadsAndBridges: boolean } {
  const serial = /\b(?:sl\.?\s*(?:no\.?)?|serial\s*(?:no\.?)?)\s*[:#-]?\s*(\d+[a-z]?)/i.exec(input)
  const roadsAndBridges = /\br\s*&\s*b\b|roads?\s+and\s+bridges?/i.test(input)
  const query = input.replace(serial?.[0] ?? /$^/, '').replace(/\br\s*&\s*b\b|roads?\s+and\s+bridges?/ig, '').trim()
  return { query, serial: serial?.[1] ?? null, roadsAndBridges }
}

export function normallySelectable(row: ReviewedSorObservation): boolean {
  return !['deleted', 'not_applicable'].includes(row.assessment_status)
}

export async function searchReviewedSorItems(year: string, input: string, catalogue: string | null, offset = 0, parseReference = true): Promise<{ rows: ReviewedSorObservation[]; hasMore: boolean }> {
  const parsed = parseReference ? parseReviewedSorSearch(input) : { query: input, serial: null, roadsAndBridges: false }
  const data = await rpc('search_sor_reviewed_items', {
    p_sor_year: year, p_query: parsed.query, p_catalogue_code: catalogue,
    p_serial_number: parsed.serial, p_limit: 100, p_offset: offset
  })
  const raw = Array.isArray(data) ? data : []
  return { rows: raw.map(normalizeReviewedObservation).filter(normallySelectable)
    .filter(row => !parsed.roadsAndBridges || row.catalogue_code.startsWith('RB_')), hasMore: raw.length === 100 }
}

export async function getReviewedSorItem(id: string): Promise<ReviewedSorDetail> {
  const data = await rpc('get_sor_reviewed_item', { p_occurrence_id: id })
  if (!data) throw new Error('This annual observation is no longer in the active reviewed release. Choose it again.')
  const result = sorRecord(data)
  const payload = sorRecord(result.observation)
  const rules = (Array.isArray(result.rules) ? result.rules : []).map(value => {
    const rule = sorRecord(value)
    return { ...rule, value_pct: number(rule.value_pct) ?? undefined } as unknown as ReviewedSorRule
  })
  return { observation: normalizeReviewedObservation(payload), payload,
    sourceContext: sorRecord(payload.source_context), recipe: sorRecord(result.recipe), rules }
}

export async function getReviewedSorHistory(id: string): Promise<ReviewedSorObservation[]> {
  const data = await rpc('get_sor_reviewed_history', { p_item_id: id })
  return (Array.isArray(data) ? data : []).map(normalizeReviewedObservation)
}

export function readyReviewedRules(detail: ReviewedSorDetail): ReviewedSorRule[] {
  const row = detail.observation
  return detail.rules.filter(rule => rule.calculation_ready === true && rule.sor_year === row.sor_year &&
    rule.kind === 'percentage_extra' && rule.base === 'selected_observation_published_rate' &&
    rule.applies_to_occurrences?.includes(row.occurrence_id) && Number.isFinite(rule.value_pct))
}

export async function calculateReviewedSorSelection(id: string, quantity: number, ruleIds: string[]): Promise<ReviewedSorCalculation> {
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Enter a positive quantity.')
  const data = sorRecord(await rpc('calculate_sor_reviewed_selection', {
    p_occurrence_id: id, p_quantity: quantity, p_rule_ids: ruleIds
  }))
  const numericKeys = ['quantity', 'basis_quantity', 'published_rate', 'adjusted_rate_per_basis', 'base_amount', 'extra_amount', 'total_amount'] as const
  for (const key of numericKeys) {
    const parsed = number(data[key])
    if (parsed === null) throw new Error('The server did not return a complete costing result.')
    data[key] = parsed
  }
  if (data.occurrence_id !== id || !data.release_id || Number(data.basis_quantity) <= 0) throw new Error('The costing result does not match this annual observation.')
  return data as unknown as ReviewedSorCalculation
}

export function reviewedReference(row: ReviewedSorObservation): string {
  return [tableLabel(row.table_name), row.printed_code, row.serial_number ? `Sl. No. ${row.serial_number}` : '', row.sor_year].filter(Boolean).join(' · ')
}

export function tableLabel(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase())
}

export function reviewedCostStatus(row: ReviewedSorObservation): string {
  if (row.cost_ready && row.assessment_status === 'numeric' && row.rate !== null && row.basis_quantity && row.unit) return 'Ready for costing'
  const labels: Record<string, string> = {
    analysis_required: 'Rate analysis required', monthly_rate_required: 'Monthly inputs required',
    conflicting_source_rates: 'Conflicting rates — clarification required', blank_in_source: 'No published rate — clarification required',
    market_rate_required: 'Market rate required', coefficient_requires_base_rate: 'Analysis and base rate required',
    percentage_requires_base_cost: 'Verified base cost required', external_reference: 'External rate reference required',
    zero_requires_review: 'Zero rate requires review', deleted: 'Deleted', not_applicable: 'Not applicable'
  }
  return labels[row.assessment_status] ?? 'Clarification required'
}

export const sorMoney = (value: number): string => `₹${value.toLocaleString('en-IN', { minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2 })}`

export function reviewedTariff(row: Pick<ReviewedSorObservation, 'rate' | 'unit' | 'basis_quantity'>, context: Record<string, unknown> = {}): string {
  if (row.rate === null || !row.basis_quantity || !row.unit) return 'Tariff awaiting clarification'
  const unit = ({ m: 'metre', litre: 'litre', litres: 'litres', l: 'litres', cum: 'cubic metre', sqm: 'square metre' } as Record<string, string>)[row.unit.toLowerCase()] ?? row.unit
  const resolution = sorRecord(context.unit_resolution)
  const confirmed = String(resolution.confirmation_text ?? '').replace(/^yes,?\s*/i, '').replace(/^per\s+(?:one|1)\s*/i, '')
  const basis = row.basis_quantity === 1 ? (confirmed || unit) : `${row.basis_quantity.toLocaleString('en-IN')} ${unit}`
  return `${sorMoney(row.rate)} per ${basis}`
}

export function reviewedFamilyKey(row: ReviewedSorObservation): string {
  return JSON.stringify([row.catalogue_code, row.table_name, row.family_label])
}

export function makeReviewedMasterItem(detail: ReviewedSorDetail, calculation: ReviewedSorCalculation, ruleIds: string[]): MasterItem {
  const row = detail.observation
  if (!row.cost_ready || row.assessment_status !== 'numeric' || !normallySelectable(row) ||
      calculation.occurrence_id !== row.occurrence_id || calculation.item_id !== row.item_id || calculation.sor_year !== row.sor_year ||
      calculation.published_rate !== row.rate || calculation.basis_quantity !== row.basis_quantity || calculation.quantity_unit !== row.unit) {
    throw new Error('Choose a costing-ready annual variant before adding it.')
  }
  const reviewed: ReviewedSorSelection = {
    recipeId: row.item_id, observationId: row.occurrence_id, releaseId: calculation.release_id,
    year: row.sor_year, quantity: calculation.quantity, basisQuantity: calculation.basis_quantity,
    selectedRuleIds: [...ruleIds], calculation, observation: row, sourceContext: detail.sourceContext, rules: detail.rules
  }
  const extras = calculation.adjustments.map(rule => rule.label).join(', ')
  return { side: 'SOR', category: SOR_CATALOGUE_CATEGORY, code: row.item_id,
    description: extras ? `${row.effective_description} — ${extras}` : row.effective_description, unit: row.unit,
    sorCatalogue: { catalogueCode: row.catalogue_code, catalogueName: tableLabel(row.table_name), part: '', section: '',
      dimensions: {}, selectedYear: row.sor_year, publishedRate: row.rate, rateText: null,
      commercialTerms: sorCommercialTerms({ commercial_terms: row.features.commercial_terms ?? detail.sourceContext.commercial_terms }),
      effectiveFrom: String(detail.payload.effective_from ?? '') || null, source: null, sourcePage: row.pdf_page,
      publishedReference: { tableName: tableLabel(row.table_name), serialNumber: row.serial_number || undefined,
        scheduleItemNumber: row.printed_code || undefined }, reviewed }
  }
}

/** Follow stable identity only. Missing editions and invalid extras fail closed. */
export async function resolveReviewedSelection(saved: ReviewedSorSelection, year: string, refresh = false): Promise<ReviewedSorSelection> {
  if (!refresh && year === saved.year) return saved
  const history = await getReviewedSorHistory(saved.recipeId)
  const annual = history.filter(row => row.sor_year === year && normallySelectable(row))
  if (annual.length !== 1) throw new Error(`No unique compatible reviewed observation exists in SOR ${year}. Select an annual variant again.`)
  const detail = await getReviewedSorItem(annual[0].occurrence_id)
  const ready = readyReviewedRules(detail)
  const ruleIds = saved.selectedRuleIds.map(id => {
    const previous = saved.rules.find(rule => rule.rule_id === id)
    const matches = ready.filter(rule => rule.rule_id === id || (previous?.exclusive_group &&
      rule.exclusive_group === previous.exclusive_group && rule.kind === previous.kind && rule.base === previous.base && rule.label === previous.label))
    if (matches.length !== 1) throw new Error(`The saved extra is not verified for SOR ${year}. Review the annual variant and extras again.`)
    return matches[0].rule_id
  })
  const calculation = await calculateReviewedSorSelection(detail.observation.occurrence_id, saved.quantity, ruleIds)
  return makeReviewedMasterItem(detail, calculation, ruleIds).sorCatalogue!.reviewed!
}
