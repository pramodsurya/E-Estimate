import { supabase } from './supabase'
import { evaluateLeadExpression, matchesLeadCondition } from './lead'
import type {
  PipeLeadQuote,
  PipeLeadSource,
  SorZone
} from '../types/project'
import type { LeadChargeBreakdown } from './lead'

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

export async function fetchPipeLeadQuoteForMaterial(input: {
  materialItemCode: string
  sorYear: string
  distanceKm: number
  quantity: number
  zone?: string | null
  /** The estimator's saved conveyance selection, independent of SSR policy. */
  source?: PipeLeadSource
}): Promise<PipeLeadQuote> {
  if (input.source?.leadRuleCode) return fetchReviewedPipeLeadQuote(input.source.materialItemCode,input.sorYear,input.distanceKm,input.quantity,input.zone)
  if (input.source) return fetchPipeConveyanceQuote(input.source, input)
  if (input.materialItemCode.startsWith('SOR-')) {
    return fetchReviewedPipeLeadQuote(input.materialItemCode, input.sorYear, input.distanceKm, input.quantity, input.zone)
  }
  throw new Error('Select the pipe conveyance table, class and diameter before calculating Lead. The retired material lookup is unavailable.')
}

export async function fetchPipeLeadQuote(input: {
  pipeLeadItemCode: string
  sorYear: string
  distanceKm: number
  quantity: number
  zone?: string | null
  source?: PipeLeadSource
}): Promise<PipeLeadQuote> {
  if (input.source?.leadRuleCode) return fetchReviewedPipeLeadQuote(input.source.materialItemCode,input.sorYear,input.distanceKm,input.quantity,input.zone)
  if (input.source) return fetchPipeConveyanceQuote(input.source, input)
  if (input.pipeLeadItemCode.startsWith('SOR-')) {
    return fetchReviewedPipeLeadQuote(input.pipeLeadItemCode, input.sorYear, input.distanceKm, input.quantity, input.zone)
  }
  throw new Error('Select a current pipe conveyance table, class and diameter.')
}

/** SSR retains its own payable scope. Only numeric table tariffs come from SOR. */
async function fetchPipeConveyanceQuote(source: PipeLeadSource, input: {
  sorYear: string; distanceKm: number; quantity: number; zone?: string | null
}): Promise<PipeLeadQuote> {
  if (![input.distanceKm, input.quantity].every(value => Number.isFinite(value) && value >= 0)) {
    throw new Error('Pipe Lead distance and quantity must be finite nonnegative numbers.')
  }
  const zone = input.zone ?? 'zone_3'
  if (!['zone_1', 'zone_2', 'zone_3'].includes(zone)) throw new Error('Select a valid Pipe Lead pricing zone.')
  const table = source.pipeEndType === 'PLAIN_ENDED' ? 'P04-T06'
    : source.pipeEndType === 'SOCKET_SPIGOT' ? 'P04-T07' : undefined
  const pipeClass = source.pipeClassGroup.replaceAll('_', '/')
  if (!table || !['NP2', 'NP3/NP4', 'NP2/P1', 'P2'].includes(pipeClass) ||
      !Number.isFinite(source.diameterMm) || source.diameterMm <= 0 ||
      !['m', 'metre', 'meter'].includes(source.unit ?? 'm')) {
    throw new Error('The saved pipe conveyance selection needs a supported table, class, diameter and metre quantity basis.')
  }
  const response = await supabase.from('SOR_Recipie')
    .select('recipe_code,cell:metadata->public_health_cell')
    .eq('table_code', table).eq('metadata->>item_type', 'conveyance_matrix_cell')
    .eq('metadata->public_health_cell->row->>id', `${source.diameterMm} mm dia`)
  if (response.error) throw new Error(`Unable to load pipe conveyance cells: ${response.error.message}`)
  const cells = (response.data ?? []) as Array<{ recipe_code: string; cell: unknown }>
  const cellFor = (band: string): string => {
    const matches = cells.filter(row => record(record(row.cell).column).id === `${pipeClass} — ${band}`)
    if (matches.length !== 1) throw new Error(`No unique ${table} ${pipeClass} ${source.diameterMm} mm ${band} conveyance cell exists.`)
    return matches[0].recipe_code
  }
  const codes = [cellFor('up to 5 km'), cellFor('each additional km or part')]
  const quotes = await Promise.all(codes.map(async code => {
    const response = await supabase.rpc('sor_resource_quote', {
      p_recipe_code: code, p_year: input.sorYear, p_zone: zone, p_component: 'rate', p_unit: 'm'
    })
    const quote = record(response.data)
    if (response.error || quote.status !== 'priced' || quote.year !== input.sorYear || quote.zone !== zone ||
        quote.unit !== 'm' || !quote.year_row_code) {
      throw new Error(`Pipe conveyance tariff ${code} is unavailable for ${input.sorYear}, ${zone}.`)
    }
    const rate = requiredNumber(quote.rate, 'conveyance tariff')
    if (rate < 0) throw new Error('Invalid negative pipe conveyance tariff.')
    return { code, quote, rate }
  }))
  const money = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100
  const additionalStartedKm = Math.ceil(Math.max(0, input.distanceKm - 5))
  const leadRate = input.distanceKm === 0 ? 0 : money(quotes[0].rate + additionalStartedKm * quotes[1].rate)
  return {
    status: 'PRICED', sorYear: input.sorYear, materialItemCode: source.materialItemCode,
    pipeLeadItemCode: source.pipeLeadItemCode, pipeLeadCatalogueCode: source.pipeLeadCatalogueCode,
    catalogueName: pipeLeadCatalogueLabel(source), pipeEndType: source.pipeEndType!,
    pipeClassGroup: source.pipeClassGroup, pipeClasses: pipeClass.split('/'), diameterMm: source.diameterMm,
    unit: 'm', distanceKm: input.distanceKm, quantity: input.quantity,
    upto5KmRate: quotes[0].rate, additionalPerStartedKmRate: quotes[1].rate, additionalStartedKm,
    leadRatePerMetre: leadRate, amount: money(leadRate * input.quantity),
    rateScope: 'Selected RCC conveyance table; loading, unloading and stacking included.', selectedZone: zone,
    sourcePage: null, handlingIncluded: ['loading', 'unloading', 'stacking'],
    calculation: {
      rows: input.distanceKm === 0 ? [{ label: 'No conveyance', expression: '0 km', amount: 0 }] : [
        { label: 'Conveyance up to 5 km', expression: quotes[0].rate.toFixed(2), amount: quotes[0].rate },
        ...(additionalStartedKm ? [{ label: 'Additional started kilometres', quantity: additionalStartedKm,
          unitRate: quotes[1].rate, expression: `${additionalStartedKm} × ${quotes[1].rate.toFixed(2)}`,
          amount: money(additionalStartedKm * quotes[1].rate) }] : [])
      ], fullLeadRate: leadRate, deductedLeadRate: 0, netLeadRate: leadRate, unit: 'm',
      evidence: { policySource: 'SSR', year: input.sorYear, zone, tariffs: quotes.map(({ code, quote }) => ({
        recipeCode: code, resolvedRecipeCode: String(quote.recipe_code), yearRowCode: String(quote.year_row_code),
        year: input.sorYear, zone
      })) }
    }
  }
}

/** Resolve the exact annual PIPE binding; never match a pipe by approximate diameter/class text. */
async function fetchReviewedPipeLeadQuote(
  requestedCode: string, year: string, distanceKm: number, quantity: number, selectedZone?: string | null
): Promise<PipeLeadQuote> {
  if (![distanceKm, quantity].every(value => Number.isFinite(value) && value >= 0)) {
    throw new Error('Pipe Lead distance and quantity must be finite nonnegative numbers.')
  }
  const zone = selectedZone ?? 'zone_3'
  if (!['zone_1', 'zone_2', 'zone_3'].includes(zone)) throw new Error('Select a valid Pipe Lead pricing zone.')
  const resolution = await supabase.rpc('sor_resolve_recipe_year', { p_recipe_code: requestedCode, p_year: year })
  if (resolution.error) throw new Error(`Unable to resolve pipe material: ${resolution.error.message}`)
  const resolved = record(resolution.data)
  if (resolved.requires_review || !resolved.recipe_code) throw new Error('Review the pipe material replacement for the selected SOR year.')
  const code = String(resolved.recipe_code)
  const [annual, recipe] = await Promise.all([
    supabase.from('SOR_Year').select('year_row_code,lead_rule_code:metadata->>lead_rule_code')
      .eq('recipe_code', code).eq('year', year).single(),
    supabase.from('SOR_Recipie').select('recipe_code,section,unit,cell:metadata->public_health_cell')
      .eq('recipe_code', code).single()
  ])
  if (annual.error || recipe.error || !annual.data?.lead_rule_code) {
    throw new Error(`No unique reviewed pipe Lead binding exists in SOR ${year}.`)
  }
  const binding = await supabase.from('SOR_Lead_Rule')
    .select('rule_code,year,scope_label,rules,review').eq('rule_code', annual.data.lead_rule_code).eq('year', year).single()
  if (binding.error || !binding.data) throw new Error(`The selected-year pipe Lead rule is unavailable.`)
  const rules = record(binding.data.rules)
  if (rules.schema_version !== 3 || !strings(rules.source_recipe_codes).includes(code) || rules.quantity_unit !== 'm') {
    throw new Error('This material needs its own reviewed transport quantity basis; it is not a metre-based pipe Lead.')
  }
  const inputs = { lead_km: distanceKm, lift_m: 0, placement: 'mechanical', handling: 'mechanical_including_idle', disposal: 'none' }
  const lead = record(record(rules.components).lead)
  if (!Array.isArray(lead.cases)) throw new Error('Invalid reviewed pipe Lead rule.')
  const match = lead.cases.map(record).find(candidate => matchesLeadCondition(candidate.when, inputs))
  const result = record(match ? match.then : lead.otherwise)
  if (!['priced', 'included_in_item_rate', 'not_payable'].includes(String(result.status))) {
    throw new Error(String(result.reason ?? 'Pipe Lead needs review.'))
  }
  const terms = result.status === 'priced' && Array.isArray(result.terms) ? result.terms.map(record) : []
  if (result.status === 'priced' && !terms.length) throw new Error('The priced pipe Lead rule has no tariff references.')
  const handlingIncluded: string[] = []
  for (const key of ['loading', 'unloading']) {
    const component = record(record(rules.components)[key])
    if (!Array.isArray(component.cases)) throw new Error(`Invalid pipe ${key} rule.`)
    const selected = component.cases.map(record).find(candidate => matchesLeadCondition(candidate.when, inputs))
    const handling = record(selected ? selected.then : component.otherwise)
    if (!['included_in_item_rate', 'not_payable'].includes(String(handling.status))) {
      throw new Error(`Review the separate pipe ${key} requirements.`)
    }
    if (handling.status === 'included_in_item_rate') {
      handlingIncluded.push(key)
      if (key === 'unloading' && /stacking/i.test(String(handling.reason))) handlingIncluded.push('stacking')
    }
  }
  const quoted = await Promise.all(terms.map(async term => {
    const response = await supabase.rpc('sor_resource_quote', {
      p_recipe_code: term.recipe_code, p_year: year, p_zone: zone, p_component: 'rate', p_unit: 'm'
    })
    const quote = record(response.data)
    if (response.error || quote.status !== 'priced' || quote.year !== year || quote.zone !== zone || quote.unit !== 'm') {
      throw new Error(`Pipe conveyance tariff ${term.recipe_code} is unavailable in SOR ${year}.`)
    }
    return { term, quote, rate: requiredNumber(quote.rate, 'reviewed pipe tariff') }
  }))
  const amountAt = (km: number): number => quoted.reduce((sum, { term, rate }) => {
    const multiplier = evaluateLeadExpression(term.multiplier, { ...inputs, lead_km: km })
    if (multiplier < 0) throw new Error('Invalid negative pipe Lead multiplier.')
    return sum + multiplier * rate
  }, 0)
  const money = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100
  const cell = record(recipe.data.cell)
  const diameter = /^([0-9]+(?:\.[0-9]+)?)\s*mm\b/i.exec(String(record(cell.row).label ?? ''))
  if (!diameter) throw new Error('The reviewed pipe diameter is not recorded in millimetres.')
  const classLabel = String(record(cell.column).label ?? '')
  const leadRate = money(amountAt(distanceKm))
  const calculationRows = quoted.map(({ term, rate }) => {
    const multiplier = evaluateLeadExpression(term.multiplier, inputs)
    return { label: String(term.recipe_code), quantity: multiplier, unitRate: rate,
      expression: `${multiplier} × ${rate.toFixed(2)}`, amount: money(multiplier * rate) }
  })
  return {
    status: 'PRICED', sorYear: year, materialItemCode: requestedCode, pipeLeadItemCode: requestedCode,
    pipeLeadCatalogueCode: String(binding.data.scope_label), catalogueName: String(recipe.data.section),
    pipeEndType: /plain ended/i.test(String(cell.group)) ? 'PLAIN_ENDED'
      : /socket.*spigot/i.test(String(cell.group)) ? 'SOCKET_SPIGOT' : 'RCC',
    pipeClassGroup: classLabel, pipeClasses: [classLabel], diameterMm: Number(diameter[1]), unit: 'm',
    distanceKm, quantity, upto5KmRate: money(amountAt(5)),
    additionalPerStartedKmRate: money(amountAt(6) - amountAt(5)),
    additionalStartedKm: Math.ceil(Math.max(0, distanceKm - 5)), leadRatePerMetre: leadRate,
    amount: money(leadRate * quantity), rateScope: String(result.reason), selectedZone: zone,
    sourcePage: null, handlingIncluded,
    calculation: { rows: calculationRows, fullLeadRate: leadRate, deductedLeadRate: 0, netLeadRate: leadRate, unit: 'm',
      evidence: { ruleCode: String(binding.data.rule_code), year, zone, tariffs: quoted.map(({ term, quote }) => ({
        recipeCode: String(term.recipe_code), resolvedRecipeCode: String(quote.recipe_code),
        yearRowCode: String(quote.year_row_code), year, zone
      })) } }
  }
}

export function pipeLeadQuoteBreakdown(
  quote: PipeLeadQuote,
  zone: SorZone = 'zone_3'
): LeadChargeBreakdown {
  if (quote.selectedZone && quote.selectedZone !== zone) {
    throw new Error('Pipe Lead quote is stale. Refresh it for the selected project zone.')
  }
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
    calculation: quote.calculation ?? {
      rows,
      fullLeadRate: quote.leadRatePerMetre,
      deductedLeadRate: 0,
      netLeadRate: quote.leadRatePerMetre,
      unit: quote.unit
    },
    notes: quote.calculation ? [quote.rateScope,
      quote.calculation.evidence?.ruleCode ? `Reviewed pipe Lead rule ${quote.calculation.evidence.ruleCode}.`
        : `Conveyance tariffs for ${quote.sorYear}, ${quote.selectedZone}. SSR payable conditions remain separate.`] : [
      'Public Health RCC pipe-conveyance Table 6/7 rate.',
      'Loading, unloading, and stacking are included in the published rate.',
      'Every started kilometre beyond 5 km is charged as a full additional kilometre.'
    ]
  }
}
