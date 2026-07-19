import { supabase } from './supabase'
import type { DataVariantKind, DataVariantSelection } from '../types/project'
import type {
  RateAnalysisOptionalAdditionAnalysis,
  RateAnalysisAddonLeadSummary,
  RateAnalysisAddonSeigniorageSummary,
  RateAnalysisRecipe,
  RateAnalysisSectionKey,
  RateAnalysisStoredRow,
  RateAnalysisVariantLeadMaterial
} from '../types/rateAnalysis'

type JsonRecord = Record<string, unknown>

interface SourceRateValue {
  label: string
  value: number
  addValue: number | null
  addPercent: number | null
}

interface SourceModifier {
  note: string
  percent: number | null
}

interface SourceVariantDefinition {
  id: string
  label: string
  kind: string
  baseVariant: string
  addPercent: number | null
  sourceItem: string
}

export interface DataVariantOption {
  key: string
  label: string
  rate: number
  upperLimitM?: number
  basisQuantity?: number
  basisUnit?: string
  abstractEndIndex?: number
  lowerLimitM?: number
  addOnRate?: number
  addPercent?: number
  baseVariantLabel?: string
  componentRates?: number[]
  additionAnalysis?: RateAnalysisOptionalAdditionAnalysis
  leadMaterials?: RateAnalysisVariantLeadMaterial[]
  /** Exact backend id; absent for the base/no-add-on option and legacy variants. */
  addonId?: string
  addonLead?: RateAnalysisAddonLeadSummary
  addonSeigniorage?: RateAnalysisAddonSeigniorageSummary
  /** Rate is derived from the calculated DATA total, even for the zero-percent base option. */
  postRate?: boolean
  postRateMultiplier?: number
  postRateStepPercent?: number
  postRateSteps?: number
}

export type DataMultiRateKind = DataVariantKind | 'dual_basis' | 'adjustment_chain'

export type DataMultiRateClassification =
  | 'dual_measurement_basis'
  | 'type_variants'
  | 'optional_addition'
  | 'quantity_depth_bands'
  | 'derived_adjustment_chain'

export interface DataVariantSpec {
  code: string
  year: string
  description?: string
  kind: DataMultiRateKind
  classification: DataMultiRateClassification
  requiresSelection: boolean
  prompt: string
  baseRate: number
  options: DataVariantOption[]
  defaultOptionKey?: string
  adoptedOptionKey?: string
}

interface AddonBuildInput {
  addonTable?: unknown
  addonRates?: unknown
  leadApplicability?: unknown
  seigniorageApplicability?: unknown
  sourceAddonTables?: Record<string, unknown>
  sourceAddonRates?: Record<string, unknown>
}

const CODE_CLASSIFICATIONS: Record<string, DataMultiRateClassification> = {
  'IRR-CAW-7-31': 'optional_addition',
  'IRR-CAW-8-1': 'optional_addition',
  'IRR-CCDW-3-1': 'quantity_depth_bands',
  'IRR-DAW-1-10': 'quantity_depth_bands',
  'IRR-DAW-5-5': 'derived_adjustment_chain',
  'IRR-GAW-1-3': 'dual_measurement_basis',
  'IRR-GAW-2-7': 'dual_measurement_basis',
  'IRR-GAW-2-9': 'dual_measurement_basis',
  'IRR-GAW-2-10': 'dual_measurement_basis',
  'IRR-TAW-1-5': 'optional_addition'
}

const PMW_DEPTH_MODIFIER_CODES = new Set([
  'IRR-PMW-2-5',
  'IRR-PMW-2-6',
  'IRR-PMW-2-7',
  'IRR-PMW-2-8',
  'IRR-PMW-2-9'
])

function rows(value: unknown): JsonRecord[] {
  return Array.isArray(value)
    ? value.filter(
        (row): row is JsonRecord => Boolean(row) && typeof row === 'object' && !Array.isArray(row)
      )
    : []
}

function text(value: unknown): string {
  return value == null ? '' : String(value).trim()
}

function number(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const match = String(value).replaceAll(',', '').match(/-?\d+(?:\.\d+)?/)
  if (!match) return null
  const parsed = Number(match[0])
  return Number.isFinite(parsed) ? parsed : null
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {}
}

function multiRateClassification(code: string, rateStructure: unknown): DataMultiRateClassification | null {
  const configured = text(record(rateStructure).multi_rate_classification)
  if (configured === 'post_rate_depth_variants') return 'quantity_depth_bands'
  if (configured === 'post_rate_method_variants') return 'type_variants'
  if (
    configured === 'dual_measurement_basis' ||
    configured === 'type_variants' ||
    configured === 'optional_addition' ||
    configured === 'quantity_depth_bands' ||
    configured === 'derived_adjustment_chain'
  ) {
    return configured
  }
  const definitions = variantDefinitions(rateStructure)
  if (definitions.some((definition) => definition.kind === 'additive_value')) {
    return 'optional_addition'
  }
  if (definitions.some((definition) => definition.kind === 'percent_variant')) {
    return 'type_variants'
  }
  return CODE_CLASSIFICATIONS[code] ?? null
}

function optionalAdditionLabel(code: string, rateStructure: unknown): string {
  const configured = text(record(rateStructure).optional_addition_label)
  if (configured) return configured
  const structured = variantDefinitions(rateStructure).find(
    (definition) => definition.kind === 'additive_value'
  )?.label
  if (structured) return structured
  if (code === 'IRR-CAW-7-31') return 'Add sand backing'
  if (code === 'IRR-CAW-8-1') return 'Add 15 cm thick murum bed below pitching'
  if (code === 'IRR-TAW-1-5') return 'Mucking through shaft using winch (+8%)'
  return 'Include published optional addition'
}

function rateValues(value: unknown): SourceRateValue[] {
  return rows(value)
    .map((row) => ({
      label: text(row.label),
      value: number(row.value),
      addValue: number(row.add_value),
      addPercent: number(row.add_percent)
    }))
    .filter((row): row is SourceRateValue => Boolean(row.label) && row.value !== null)
}

function modifiers(value: unknown): SourceModifier[] {
  return rows(value).map((row) => ({
    note: text(row.note),
    percent: number(row.percent)
  }))
}

function variantDefinitions(rateStructure: unknown): SourceVariantDefinition[] {
  return rows(record(rateStructure).variants).map((row) => ({
    id: text(row.id),
    label: text(row.label),
    kind: text(row.kind),
    baseVariant: text(row.base_variant),
    addPercent: number(row.add_percent),
    sourceItem: text(row.source_item)
  }))
}

function postRateVariantSpec(input: {
  code: string
  year: string
  description?: string
  baseRate: number
  rateStructure?: unknown
}): DataVariantSpec | null {
  const source = record(input.rateStructure)
  const configured = text(source.multi_rate_classification)
  const definitions = variantDefinitions(input.rateStructure)
  const base = definitions.find((definition) => definition.kind === 'base')
  const adjustments = definitions.filter(
    (definition) => definition.kind === 'post_rate_percent' && definition.addPercent !== null
  )
  if (!base || !adjustments.length) return null
  const depth = configured === 'post_rate_depth_variants'
  const options: DataVariantOption[] = [{
    key: `variant:${base.id || 'base'}`,
    label: base.label || 'Base DATA',
    rate: input.baseRate,
    componentRates: [input.baseRate],
    postRate: true,
    postRateMultiplier: 1
  }]
  for (const definition of adjustments) {
    const percent = definition.addPercent as number
    const addOnRate = Math.round(input.baseRate * percent) / 100
    options.push({
      key: `variant:${definition.id || options.length}`,
      label: definition.label,
      rate: Math.round((input.baseRate + addOnRate) * 100) / 100,
      addOnRate,
      addPercent: percent,
      baseVariantLabel: base.label,
      componentRates: [input.baseRate, addOnRate],
      postRate: true,
      postRateMultiplier: 1 + percent / 100
    })
  }
  return {
    code: input.code,
    year: input.year,
    description: input.description,
    kind: depth ? 'quantity_band' : 'type',
    classification: depth ? 'quantity_depth_bands' : 'type_variants',
    requiresSelection: true,
    prompt: depth
      ? 'Which published depth interval applies?'
      : 'Which published working method applies?',
    baseRate: input.baseRate,
    options,
    defaultOptionKey: options[0].key
  }
}

function rowText(row: JsonRecord): string {
  return `${text(row.label)} ${text(row.basis)} ${text(row.unit)}`.replace(/\s+/g, ' ').trim()
}

function depthLimits(value: string): number[] {
  const withUnit = Array.from(value.matchAll(/(\d+(?:\.\d+)?)\s*m\b/gi)).map((match) =>
    Number(match[1])
  )
  const byKeyword = /\b(?:m|metre|meter|depth|surface)\b/i.test(value)
    ? Array.from(value.matchAll(/\b(?:up\s*to|upto|beyond)\s*(\d+(?:\.\d+)?)/gi)).map(
        (match) => Number(match[1])
      )
    : []
  return Array.from(new Set([...withUnit, ...byKeyword])).filter(Number.isFinite)
}

function upperDepth(value: string): number | null {
  const limits = depthLimits(value)
  return limits.length ? Math.max(...limits) : null
}

function lowerDepth(value: string): number | null {
  const limits = depthLimits(value)
  return limits.length ? Math.min(...limits) : null
}

function isDepthText(value: string): boolean {
  return /\b(?:up\s*to|upto|beyond)\b/i.test(value) && /\b(?:m|metre|meter|depth|surface)\b/i.test(value)
}

function cleanTypeLabel(value: string): string {
  const cleaned = value
    .replace(/\([^)]*[A-D](?:\+[A-D]){1,}[^)]*\)\s*\/\s*[\d.]+/gi, '')
    .replace(/^rate\s+pe?r\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : 'Published rate'
}

function normalizedRateLabel(value: string): string {
  return cleanTypeLabel(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function uniqueOptions(options: DataVariantOption[]): DataVariantOption[] {
  const seen = new Set<string>()
  return options.filter((option) => {
    if (seen.has(option.key)) return false
    seen.add(option.key)
    return true
  })
}

function upToOptionsFromAbstract(abstract: JsonRecord[]): DataVariantOption[] {
  return uniqueOptions(
    abstract
      .map((row, index) => ({ row, index, value: rowText(row) }))
      .filter(({ value }) => isDepthText(value) && !/^for\b/i.test(value))
      .map(({ row, index, value }): DataVariantOption | null => {
        const limit = upperDepth(value)
        const rate = number(row.amount) ?? number(row.value)
        if (limit === null || rate === null) return null
        return {
          key: `upto:${limit}`,
          label: `Up to ${limit} m`,
          rate,
          upperLimitM: limit,
          abstractEndIndex: index
        }
      })
      .filter((option): option is DataVariantOption => option !== null)
      .sort((left, right) => (left.upperLimitM ?? 0) - (right.upperLimitM ?? 0))
  )
}

function upToOptionsFromRanges(
  values: SourceRateValue[],
  abstract: JsonRecord[]
): DataVariantOption[] {
  const headings = abstract
    .map((row, index) => ({ value: rowText(row), index }))
    .filter(({ value }) => isDepthText(value) && /\bbeyond\b/i.test(value))
  if (!headings.length || values.length !== headings.length + 1) return []
  const firstLimit = lowerDepth(headings[0].value)
  if (firstLimit === null) return []
  const options: DataVariantOption[] = [{
    key: `upto:${firstLimit}`,
    label: `Up to ${firstLimit} m`,
    rate: values[0].value,
    upperLimitM: firstLimit,
    abstractEndIndex: Math.max(0, headings[0].index - 1)
  }]
  headings.forEach((heading, index) => {
    const limit = upperDepth(heading.value)
    if (limit === null) return
    options.push({
      key: `upto:${limit}`,
      label: `Up to ${limit} m`,
      rate: values[index + 1].value,
      upperLimitM: limit,
      abstractEndIndex: findFollowingRateRow(abstract, heading.index, values[index + 1].value)
    })
  })
  return uniqueOptions(options)
}

function upToOptionsFromRateLabels(values: SourceRateValue[]): DataVariantOption[] {
  return uniqueOptions(
    values
      .map((entry, index): DataVariantOption | null => {
        if (!isDepthText(entry.label)) return null
        const limit = upperDepth(entry.label)
        if (limit === null) return null
        return {
          key: `upto:${limit}`,
          label: `Up to ${limit} m`,
          rate: entry.value,
          upperLimitM: limit,
          abstractEndIndex: index
        }
      })
      .filter((option): option is DataVariantOption => option !== null)
  )
}

function upToOptionsFromModifiers(
  code: string,
  baseRate: number,
  description: string,
  sourceModifiers: SourceModifier[],
  abstract: JsonRecord[]
): DataVariantOption[] {
  let depthModifiers = sourceModifiers.filter(
    (modifier) => modifier.percent !== null && isDepthText(modifier.note) && !/items?\s+IRR-/i.test(modifier.note)
  )
  const baseLimit = upperDepth(description)
  const needsReviewedPmwFallback =
    PMW_DEPTH_MODIFIER_CODES.has(code) &&
    baseLimit !== null &&
    sourceModifiers.length >= 2 &&
    (depthModifiers.length < 2 ||
      new Set(depthModifiers.map((modifier) => upperDepth(modifier.note))).size < 2 ||
      depthModifiers.some((modifier) => (upperDepth(modifier.note) ?? 0) <= baseLimit))
  if (needsReviewedPmwFallback) {
    const byPercent = [...sourceModifiers]
      .filter((modifier) => modifier.percent !== null)
      .sort((left, right) => (left.percent ?? 0) - (right.percent ?? 0))
    const reviewedLimits = [60, 90]
    depthModifiers = byPercent.slice(0, reviewedLimits.length).map((modifier, index) => ({
      ...modifier,
      note: `Up to ${reviewedLimits[index]} m from surface. ${modifier.note}`
    }))
  }
  if (!depthModifiers.length) return []
  const abstractDepthRows = abstract
    .map((row, index) => ({ index, value: rowText(row) }))
    .filter(({ value }) => isDepthText(value))
  const options: DataVariantOption[] = []
  if (baseLimit !== null) {
    options.push({
      key: `upto:${baseLimit}`,
      label: `Up to ${baseLimit} m`,
      rate: baseRate,
      upperLimitM: baseLimit,
      abstractEndIndex: findPreviousRateRow(abstract, abstractDepthRows[0]?.index ?? abstract.length)
    })
  }
  for (const modifier of depthModifiers) {
    const limit = upperDepth(modifier.note)
    if (limit === null || modifier.percent === null) continue
    options.push({
      key: `upto:${limit}`,
      label: `Up to ${limit} m`,
      rate: Math.round(baseRate * (1 + modifier.percent / 100) * 100) / 100,
      upperLimitM: limit,
      abstractEndIndex: abstractDepthRows.find((row) => upperDepth(row.value) === limit)?.index
    })
  }
  return uniqueOptions(options).sort(
    (left, right) => (left.upperLimitM ?? 0) - (right.upperLimitM ?? 0)
  )
}

function findPreviousRateRow(abstract: JsonRecord[], before: number): number {
  for (let index = Math.min(before - 1, abstract.length - 1); index >= 0; index -= 1) {
    const row = abstract[index]
    if (/\brate\b/i.test(rowText(row)) && (number(row.amount) ?? number(row.value)) !== null) {
      return index
    }
  }
  return Math.max(0, before - 1)
}

function findFollowingRateRow(abstract: JsonRecord[], start: number, rate: number): number {
  for (let index = start; index < abstract.length; index += 1) {
    const row = abstract[index]
    const amount = number(row.amount) ?? number(row.value)
    if (/\brate\b/i.test(rowText(row)) && amount !== null && Math.abs(amount - rate) < 0.011) {
      return index
    }
  }
  return abstract.length - 1
}

function typeBasis(optionLabel: string, abstract: JsonRecord[]): { quantity?: number; unit?: string } {
  const target = optionLabel.toLowerCase()
  const candidates = abstract
    .map((row) => ({
      row,
      quantity: number(row.basis),
      unit: `${text(row.unit)} ${text(row.label)}`.toLowerCase()
    }))
    .filter((candidate) => candidate.quantity !== null)
  const scored = candidates
    .map((candidate) => {
      let score = 0
      if (/capacit/.test(target) && /capacit/.test(candidate.unit)) score += 10
      if (/\b(?:wt|weight)\b/.test(target) && /\b(?:wt|weight)\b/.test(candidate.unit)) score += 10
      if (/tonne/.test(target) && /tonne|\bt\b/.test(candidate.unit)) score += 3
      if (/sqm/.test(target) && /sqm/.test(candidate.unit)) score += 3
      if (/\brm\b/.test(target) && /\brm\b/.test(candidate.unit)) score += 3
      return { ...candidate, score }
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score)
  const best = scored[0]
  return best
    ? { quantity: best.quantity ?? undefined, unit: text(best.row.unit) || undefined }
    : {}
}

function typeOptions(values: SourceRateValue[], abstract: JsonRecord[]): DataVariantOption[] {
  if (values.length < 2) return []
  const labels = values.map((entry) => normalizedRateLabel(entry.label))
  if (new Set(labels).size < 2) return []
  const meaningful = labels.some((label) =>
    /\b(?:capacity|weight|wt|with|without|type|class|diameter|dia|thick)\b/.test(label)
  )
  if (!meaningful) return []
  return values.map((entry, index) => {
    const label = cleanTypeLabel(entry.label)
    const basis = typeBasis(label, abstract)
    return {
      key: `type:${normalizedRateLabel(entry.label) || index}`,
      label,
      rate: entry.value,
      basisQuantity: basis.quantity,
      basisUnit: basis.unit
    }
  })
}

function structuredTypeOptions(
  values: SourceRateValue[],
  rateStructure: unknown,
  abstract: JsonRecord[],
  baseRate: number
): DataVariantOption[] {
  const definitions = variantDefinitions(rateStructure).filter(
    (definition) => definition.kind === 'percent_variant'
  )
  if (!definitions.length) return []
  const baseLabel = definitions.find((definition) => definition.baseVariant)?.baseVariant || 'Base variant'
  const baseValue = values.find((entry) => Math.abs(entry.value - baseRate) < 0.011) ?? values[0]
  if (!baseValue) return []
  const baseBasis = typeBasis(baseLabel, abstract)
  const options: DataVariantOption[] = [{
    key: `type:${normalizedRateLabel(baseLabel)}`,
    label: baseLabel,
    rate: baseValue.value,
    baseVariantLabel: baseLabel,
    basisQuantity: baseBasis.quantity,
    basisUnit: baseBasis.unit,
    postRate: true,
    postRateMultiplier: 1
  }]
  for (const definition of definitions) {
    const matchingRate = values.find((entry) =>
      (definition.addPercent !== null && entry.addPercent !== null &&
        Math.abs(definition.addPercent - entry.addPercent) < 0.0001) ||
      normalizedRateLabel(entry.label).includes(normalizedRateLabel(definition.label))
    )
    if (!matchingRate) continue
    const basis = typeBasis(definition.label, abstract)
    const addOnRate = matchingRate.addValue ??
      Math.round((matchingRate.value - baseValue.value) * 100) / 100
    const addPercent = definition.addPercent ?? matchingRate.addPercent ??
      (baseValue.value
        ? Math.round((addOnRate / baseValue.value) * 10_000) / 100
        : null)
    options.push({
      key: `type:${normalizedRateLabel(definition.label)}`,
      label: definition.label,
      rate: matchingRate.value,
      addOnRate,
      addPercent: addPercent ?? undefined,
      baseVariantLabel: definition.baseVariant || baseLabel,
      basisQuantity: basis.quantity,
      basisUnit: basis.unit,
      componentRates: [baseValue.value, addOnRate],
      postRate: true,
      postRateMultiplier: 1 + (addPercent ?? 0) / 100
    })
  }
  return uniqueOptions(options)
}

function exactDepthBand(value: string): { lower: number; upper: number; label: string } | null {
  const limits = depthLimits(value)
  if (!limits.length) return null
  const upper = Math.max(...limits)
  const lower = /\b(?:beyond|for)\b/i.test(value) && limits.length >= 2
    ? Math.min(...limits)
    : 0
  return {
    lower,
    upper,
    label: lower > 0 ? `Beyond ${lower} m up to ${upper} m` : `Up to ${upper} m`
  }
}

function quantityBandOptionsFromAbstract(abstract: JsonRecord[]): DataVariantOption[] {
  return uniqueOptions(
    abstract
      .map((row, index): DataVariantOption | null => {
        const value = rowText(row)
        if (!isDepthText(value)) return null
        const rate = number(row.amount) ?? number(row.value)
        const band = exactDepthBand(value)
        if (rate === null || !band) return null
        return {
          key: `band:${band.lower}:${band.upper}`,
          label: band.label,
          rate,
          lowerLimitM: band.lower,
          upperLimitM: band.upper,
          abstractEndIndex: index
        }
      })
      .filter((option): option is DataVariantOption => option !== null)
  ).sort((left, right) =>
    (left.lowerLimitM ?? 0) - (right.lowerLimitM ?? 0) ||
    (left.upperLimitM ?? 0) - (right.upperLimitM ?? 0)
  )
}

function quantityBandOptionsFromRateValues(
  values: SourceRateValue[],
  abstract: JsonRecord[]
): DataVariantOption[] {
  return uniqueOptions(
    values
      .map((entry): DataVariantOption | null => {
        const band = exactDepthBand(entry.label)
        if (!band) return null
        const abstractEndIndex = abstract.findIndex((row) => {
          const rowBand = exactDepthBand(rowText(row))
          const rowRate = number(row.amount) ?? number(row.value)
          return Boolean(
            rowBand &&
            rowBand.lower === band.lower &&
            rowBand.upper === band.upper &&
            rowRate !== null &&
            Math.abs(rowRate - entry.value) < 0.011
          )
        })
        return {
          key: `band:${band.lower}:${band.upper}`,
          label: band.label,
          rate: entry.value,
          lowerLimitM: band.lower,
          upperLimitM: band.upper,
          abstractEndIndex: abstractEndIndex >= 0 ? abstractEndIndex : undefined
        }
      })
      .filter((option): option is DataVariantOption => option !== null)
  ).sort((left, right) =>
    (left.lowerLimitM ?? 0) - (right.lowerLimitM ?? 0) ||
    (left.upperLimitM ?? 0) - (right.upperLimitM ?? 0)
  )
}

function quantityBandOptionsFromRanges(
  values: SourceRateValue[],
  abstract: JsonRecord[]
): DataVariantOption[] {
  const headings = abstract
    .map((row, index) => ({ value: rowText(row), index }))
    .map((heading) => ({ ...heading, band: exactDepthBand(heading.value) }))
    .filter(
      (heading): heading is { value: string; index: number; band: { lower: number; upper: number; label: string } } =>
        Boolean(heading.band && heading.band.lower > 0)
    )
  if (!headings.length || values.length !== headings.length + 1) return []
  const firstUpper = headings[0].band.lower
  const options: DataVariantOption[] = [{
    key: `band:0:${firstUpper}`,
    label: `Up to ${firstUpper} m`,
    rate: values[0].value,
    lowerLimitM: 0,
    upperLimitM: firstUpper,
    abstractEndIndex: Math.max(0, headings[0].index - 1)
  }]
  headings.forEach((heading, index) => {
    options.push({
      key: `band:${heading.band.lower}:${heading.band.upper}`,
      label: heading.band.label,
      rate: values[index + 1].value,
      lowerLimitM: heading.band.lower,
      upperLimitM: heading.band.upper,
      abstractEndIndex: findFollowingRateRow(abstract, heading.index, values[index + 1].value)
    })
  })
  return uniqueOptions(options)
}

function dualBasisSpec(
  input: { code: string; year: string; description?: string },
  values: SourceRateValue[],
  abstract: JsonRecord[],
  baseRate: number
): DataVariantSpec | null {
  const options = typeOptions(values, abstract)
  if (options.length < 2) return null
  const adopted = options.find((option) => /capacit/i.test(option.label)) ??
    options.find((option) => Math.abs(option.rate - baseRate) < 0.011) ??
    options.at(-1)
  if (!adopted) return null
  return {
    ...input,
    kind: 'dual_basis',
    classification: 'dual_measurement_basis',
    requiresSelection: false,
    prompt: 'Both measurement bases belong to one analysis; the capacity rate is adopted automatically.',
    baseRate: adopted.rate,
    options,
    adoptedOptionKey: adopted.key
  }
}

const OPTIONAL_SECTION_LABELS: Record<RateAnalysisSectionKey, string> = {
  materials: 'Materials',
  machinery: 'Machinery',
  labour: 'Labour'
}

function embeddedOptionalSection(value: string): RateAnalysisSectionKey | null {
  if (/^A\.\s*MATERIALS/i.test(value)) return 'materials'
  if (/^B\.\s*MACHINERY/i.test(value)) return 'machinery'
  if (/^C\.\s*LABOU?R/i.test(value)) return 'labour'
  return null
}

function optionalAdditionAnalysis(
  abstract: JsonRecord[],
  label: string,
  addOnRate: number
): RateAnalysisOptionalAdditionAnalysis | undefined {
  const markerIndex = abstract.findIndex((row) => /^rate\s+analysis$/i.test(text(row.label)))
  if (markerIndex < 0) return undefined

  const lines: Record<RateAnalysisSectionKey, RateAnalysisOptionalAdditionAnalysis['sections'][number]['lines']> = {
    materials: [],
    machinery: [],
    labour: []
  }
  const sectionTotals: Partial<Record<RateAnalysisSectionKey, number>> = {}
  let currentSection: RateAnalysisSectionKey | null = null
  let outputQuantity = 0
  let outputUnit = ''
  let overheadPercent: number | undefined
  let overheadAmount: number | undefined
  let totalCost: number | undefined
  let publishedRate = addOnRate

  abstract.slice(markerIndex + 1).forEach((row, offset) => {
    const labelText = text(row.label)
    const section = embeddedOptionalSection(labelText)
    if (section) {
      currentSection = section
      return
    }

    const totalSection = /^total (?:cost|hire charges) of\s+(materials|machinery|labou?r)/i.exec(labelText)
    if (totalSection) {
      const key = totalSection[1].toLowerCase().startsWith('material')
        ? 'materials'
        : totalSection[1].toLowerCase().startsWith('machin')
          ? 'machinery'
          : 'labour'
      const amount = number(row.amount)
      if (amount !== null) sectionTotals[key] = amount
      return
    }

    if (/^D\.\s*Add for contractor/i.test(labelText)) {
      overheadPercent = number(row.percent) ?? number(row.unit) ?? undefined
      overheadAmount = number(row.amount) ?? undefined
      return
    }
    if (/^total cost for/i.test(labelText)) {
      outputQuantity = number(row.basis) ?? outputQuantity
      outputUnit = text(row.unit) || outputUnit
      totalCost = number(row.amount) ?? totalCost
      return
    }
    if (/^rate\s+per/i.test(labelText)) {
      publishedRate = number(row.amount) ?? number(row.value) ?? publishedRate
      return
    }

    const item = /^\s*(\d+)\s+(.+)$/.exec(labelText)
    if (!currentSection || !item) return
    const quantity = number(row.unit)
    const amount = number(row.amount)
    const description = item[2].trim()
    if (quantity === null || amount === null) return
    if (/^ni?ll?$/i.test(description) && quantity === 0 && amount === 0) return
    lines[currentSection].push({
      id: `optional-${currentSection}-${offset}-${item[1]}`,
      slNo: item[1],
      description,
      unit: text(row.basis),
      quantity,
      rate: quantity ? Math.round((amount / quantity) * 100) / 100 : 0,
      amount,
      sourceValues: {
        quantity: text(row.unit),
        amount: text(row.amount)
      }
    })
  })

  const sections = (Object.keys(lines) as RateAnalysisSectionKey[])
    .filter((key) => lines[key].length > 0)
    .map((key) => ({ key, label: OPTIONAL_SECTION_LABELS[key], lines: lines[key] }))
  if (!sections.length) return undefined
  for (const section of sections) {
    if (sectionTotals[section.key] === undefined) {
      sectionTotals[section.key] = Math.round(
        section.lines.reduce((sum, line) => sum + line.amount, 0) * 100
      ) / 100
    }
  }
  return {
    label,
    outputQuantity: outputQuantity || 1,
    unit: outputUnit,
    sections,
    sectionTotals,
    overheadPercent,
    overheadAmount,
    totalCost,
    rate: publishedRate
  }
}

function optionalLeadMaterials(
  label: string,
  analysis: RateAnalysisOptionalAdditionAnalysis | undefined
): RateAnalysisVariantLeadMaterial[] {
  const materials = analysis?.sections.find((section) => section.key === 'materials')?.lines ?? []
  const fromAnalysis = materials.flatMap((line): RateAnalysisVariantLeadMaterial[] => {
    const value = line.description.toLowerCase()
    const conveyanceClass = /\b(?:mur+um|mor+um|earth|soil|sand)\b/.test(value)
      ? 'EARTH'
      : /\b(?:stone|rubble|aggregate|boulder)\b/.test(value)
        ? 'STONE'
        : null
    if (!conveyanceClass || line.quantity <= 0) return []
    return [{
      name: /\b(?:mur+um|mor+um)\b/.test(value) ? 'Murum' : line.description,
      conveyanceClass,
      quantity: line.quantity,
      unit: line.unit,
      basisQuantity: analysis?.outputQuantity || 1,
      basisUnit: analysis?.unit || ''
    }]
  })
  if (fromAnalysis.length) return fromAnalysis

  // Reviewed CAW source note: a 15 cm compacted murum bed consumes
  // 0.18 cum of murum per sqm (18 cum for the published 100 sqm DATA).
  if (/15\s*cm.*\b(?:mur+um|mor+um)\b/i.test(label)) {
    return [{
      name: 'Murum',
      conveyanceClass: 'EARTH',
      quantity: 18,
      unit: 'cum',
      basisQuantity: 100,
      basisUnit: 'sqm'
    }]
  }
  return []
}

function addonLeadMaterials(
  addonId: string,
  leadApplicability: unknown,
  basisQuantity: number,
  basisUnit: string
): RateAnalysisVariantLeadMaterial[] {
  const rule = rows(record(leadApplicability).addons).find(
    (candidate) => text(candidate.addon_id) === addonId
  )
  if (!rule || rule.applicable !== true) return []
  const quantityRatio = number(rule.quantity_ratio)
  const conveyanceClass = text(rule.conveyance_class)
  if (quantityRatio === null || quantityRatio <= 0 || (conveyanceClass !== 'EARTH' && conveyanceClass !== 'STONE')) {
    return []
  }
  return [{
    name: text(rule.material_desc) || (conveyanceClass === 'EARTH' ? 'Earth' : 'Stone'),
    conveyanceClass,
    quantity: quantityRatio * basisQuantity,
    unit: text(rule.material_unit) || 'CUM',
    basisQuantity,
    basisUnit
  }]
}

function addonLeadSummary(
  addonId: string,
  leadApplicability: unknown
): RateAnalysisAddonLeadSummary | undefined {
  const rule = rows(record(leadApplicability).addons).find(
    (candidate) => text(candidate.addon_id) === addonId
  )
  if (!rule) return undefined
  const loading = record(rule.loading)
  const unloading = record(rule.unloading)
  const applicable = rule.applicable === true
  return {
    applicable,
    materialName: text(rule.material_desc),
    conveyanceClass:
      rule.conveyance_class === 'EARTH' || rule.conveyance_class === 'STONE'
        ? rule.conveyance_class
        : undefined,
    quantityRatio: number(rule.quantity_ratio),
    materialUnit: text(rule.material_unit) || 'CUM',
    includedLeadM: number(rule.included_lead_m) ?? 0,
    distanceRule: !applicable
      ? 'NOT_APPLICABLE'
      : rule.distance_rule === 'CHARGE_BEYOND_INCLUDED'
        ? 'CHARGE_BEYOND_INCLUDED'
        : 'FULL_SOURCE_TO_SITE',
    loadingIncluded: loading.add_charge === false,
    unloadingAddedByDefault: unloading.add_charge_by_default === true,
    note: text(rule.notes) || undefined
  }
}

function addonSeigniorageSummary(
  addonId: string,
  seigniorageApplicability: unknown
): RateAnalysisAddonSeigniorageSummary | undefined {
  const group = rows(record(seigniorageApplicability).addons).find(
    (candidate) => text(candidate.addon_id) === addonId
  )
  if (!group) return undefined
  const policyRows = rows(group.rows)
  return {
    applicable: group.applicable === true,
    codes: policyRows.map((row) => text(row.seig_code)).filter(Boolean),
    conversionRequired: policyRows.some((row) => row.conversion_required === true),
    conversionConfigured: policyRows.every(
      (row) => row.conversion_required !== true || number(row.conversion_factor) !== null
    )
  }
}

function addonAnalysis(
  definition: JsonRecord,
  annual: JsonRecord,
  label: string,
  publishedRate: number
): RateAnalysisOptionalAdditionAnalysis | undefined {
  const rated = record(annual.rates)
  const sectionTotals: Partial<Record<RateAnalysisSectionKey, number>> = {}
  const abstract = rows(annual.abstract)
  const sectionPrefixes: Record<RateAnalysisSectionKey, RegExp> = {
    materials: /^A\.\s*(?:Cost of )?Materials/i,
    machinery: /^B\.\s*(?:Hire charges of )?Machinery/i,
    labour: /^C\.\s*(?:Cost of )?Labou?r/i
  }
  const sections = (Object.keys(OPTIONAL_SECTION_LABELS) as RateAnalysisSectionKey[]).flatMap((key) => {
    const lines = rows(rated[key]).flatMap((row, index) => {
      const quantity = number(row.quantity)
      const rate = number(row.rate)
      const amount = number(row.amount)
      const description = text(row.desc ?? row.description)
      if (!description || quantity === null || rate === null || amount === null) return []
      if (/^ni?ll?$/i.test(description) && quantity === 0 && amount === 0) return []
      return [{
        id: `addon-${text(annual.id)}-${key}-${index}`,
        slNo: text(row.sl ?? row.sl_no) || String(index + 1),
        description,
        unit: text(row.unit),
        quantity,
        rate,
        amount,
        sourceValues: {
          quantity: text(row.quantity),
          rate: text(row.rate),
          amount: text(row.amount)
        }
      }]
    })
    const totalRow = abstract.find((row) => sectionPrefixes[key].test(text(row.label)))
    const total = number(totalRow?.amount)
    sectionTotals[key] = total ?? Math.round(lines.reduce((sum, line) => sum + line.amount, 0) * 100) / 100
    return lines.length ? [{ key, label: OPTIONAL_SECTION_LABELS[key], lines }] : []
  })
  if (!sections.length) return undefined
  const overheadRow = abstract.find((row) => /^D\.\s*Add for contractor/i.test(text(row.label)))
  const totalRow = abstract.find((row) => /^Total cost for/i.test(text(row.label)))
  return {
    label,
    outputQuantity: number(definition.quantity) ?? number(totalRow?.basis) ?? 1,
    unit: text(definition.unit) || text(totalRow?.unit),
    sections,
    sectionTotals,
    overheadPercent: number(overheadRow?.percent) ?? number(overheadRow?.unit) ?? undefined,
    overheadAmount: number(overheadRow?.amount) ?? undefined,
    totalCost: number(totalRow?.amount) ?? undefined,
    rate: publishedRate
  }
}

function structuredAddonSpec(
  input: {
    code: string
    year: string
    description?: string
    baseRate: number
  } & AddonBuildInput
): DataVariantSpec | null {
  const definitions = rows(input.addonTable)
  const annualById = new Map(rows(input.addonRates).map((annual) => [text(annual.id), annual]))
  const options: DataVariantOption[] = [{
    key: 'addon:none',
    label: 'Base DATA only',
    rate: input.baseRate,
    componentRates: [input.baseRate]
  }]

  for (const definition of definitions) {
    const addonId = text(definition.id)
    const annual = annualById.get(addonId)
    if (!addonId || !annual) continue

    const sourceItem = text(definition.source_item)
    const sourceAddonId = text(definition.source_addon_id) || addonId
    const sourceDefinition = sourceItem
      ? rows(input.sourceAddonTables?.[sourceItem]).find((candidate) => text(candidate.id) === sourceAddonId)
      : undefined
    const recipeDefinition = sourceDefinition ?? definition
    const sourceAnnual = sourceItem
      ? rows(input.sourceAddonRates?.[sourceItem]).find((candidate) => text(candidate.id) === sourceAddonId)
      : undefined
    const detailAnnual = Object.keys(record(annual.rates)).length ? annual : sourceAnnual ?? annual
    const addOnRate = number(annual.base_rate)
      ?? rateValues(annual.rate_values)[0]?.addValue
      ?? rateValues(annual.rate_values)[0]?.value
    if (addOnRate === null || addOnRate === undefined) continue
    const label = text(annual.label) || text(definition.label) || text(recipeDefinition.label)
    const basisQuantity = number(recipeDefinition.quantity) ?? 1
    const basisUnit = text(recipeDefinition.unit)
    options.push({
      key: `addon:${addonId}`,
      addonId,
      label,
      rate: Math.round((input.baseRate + addOnRate) * 100) / 100,
      addOnRate,
      componentRates: [input.baseRate, addOnRate],
      additionAnalysis: addonAnalysis(recipeDefinition, detailAnnual, label, addOnRate),
      leadMaterials: addonLeadMaterials(
        addonId,
        input.leadApplicability,
        basisQuantity,
        basisUnit
      ),
      addonLead: addonLeadSummary(addonId, input.leadApplicability),
      addonSeigniorage: addonSeigniorageSummary(addonId, input.seigniorageApplicability)
    })
  }
  if (options.length < 2) return null
  return {
    code: input.code,
    year: input.year,
    description: input.description,
    kind: 'optional_addition',
    classification: 'optional_addition',
    requiresSelection: true,
    prompt: 'Include the separately published optional addition?',
    baseRate: input.baseRate,
    options,
    defaultOptionKey: 'addon:none'
  }
}

function optionalAdditionSpec(
  input: {
    code: string
    year: string
    description?: string
    rateStructure?: unknown
    modifiers?: unknown
  },
  values: SourceRateValue[],
  abstract: JsonRecord[],
  baseRate: number
): DataVariantSpec | null {
  const addOn = values.find((entry) =>
    entry.addValue !== null || Math.abs(entry.value - baseRate) >= 0.011
  )
  const percentModifier = modifiers(input.modifiers).find(
    (modifier) => modifier.percent !== null && !isDepthText(modifier.note)
  )
  const addOnRate = addOn?.addValue ?? addOn?.value ??
    (percentModifier?.percent !== null && percentModifier?.percent !== undefined
      ? Math.round(baseRate * percentModifier.percent) / 100
      : null)
  if (addOnRate === null) return null
  const additionLabel = optionalAdditionLabel(input.code, input.rateStructure)
  const additionAnalysis = optionalAdditionAnalysis(abstract, additionLabel, addOnRate)
  const leadMaterials = optionalLeadMaterials(additionLabel, additionAnalysis)
  const baseOption: DataVariantOption = {
    key: 'optional:none',
    label: 'Base DATA only',
    rate: baseRate,
    componentRates: [baseRate]
  }
  const withAddition: DataVariantOption = {
    key: 'optional:included',
    label: additionLabel,
    rate: Math.round((baseRate + addOnRate) * 100) / 100,
    addOnRate,
    componentRates: [baseRate, addOnRate],
    additionAnalysis,
    leadMaterials
  }
  return {
    code: input.code,
    year: input.year,
    description: input.description,
    kind: 'optional_addition',
    classification: 'optional_addition',
    requiresSelection: true,
    prompt: 'Include the separately published optional addition?',
    baseRate,
    options: [baseOption, withAddition],
    defaultOptionKey: baseOption.key
  }
}

function quantityBandSpec(
  input: { code: string; year: string; description?: string; rateStructure?: unknown },
  values: SourceRateValue[],
  abstract: JsonRecord[],
  baseRate: number
): DataVariantSpec | null {
  const published = quantityBandOptionsFromRateValues(values, abstract)
  const direct = quantityBandOptionsFromAbstract(abstract)
  // Explicit rate_values/rate_structure entries are the authoritative list of
  // payable bands. Some abstracts include the next band's working calculation
  // only to derive the last published band and must not expose it as a choice.
  const options = published.length >= 2
    ? published
    : direct.length >= 2
      ? direct
      : quantityBandOptionsFromRanges(values, abstract)
  if (options.length < 2) return null
  const calculatedOptions = input.code === 'IRR-DAW-1-10'
    ? options.map((option, index) => {
        return {
          ...option,
          postRate: true,
          postRateStepPercent: 10,
          postRateSteps: index,
          baseVariantLabel: options[0]?.label ?? 'Up to 6 m'
        }
      })
    : options
  return {
    ...input,
    kind: 'quantity_band',
    classification: 'quantity_depth_bands',
    requiresSelection: true,
    prompt: 'Which depth interval does this DATA quantity belong to?',
    baseRate,
    options: calculatedOptions
  }
}

function adjustmentChainSpec(
  input: { code: string; year: string; description?: string },
  values: SourceRateValue[],
  baseRate: number
): DataVariantSpec {
  const options = values.map((entry, index) => ({
    key: `adjustment:${index}`,
    label: cleanTypeLabel(entry.label),
    rate: entry.value
  }))
  const adopted = options.find((option) => Math.abs(option.rate - baseRate) < 0.011) ?? options.at(-1)
  return {
    ...input,
    kind: 'adjustment_chain',
    classification: 'derived_adjustment_chain',
    requiresSelection: false,
    prompt: 'The published deductions and additions form one calculation; the final rate is adopted automatically.',
    baseRate: adopted?.rate ?? baseRate,
    options,
    adoptedOptionKey: adopted?.key
  }
}

export function buildDataVariantSpec(input: {
  code: string
  year: string
  description?: string
  baseRate?: unknown
  rateValues?: unknown
  modifiers?: unknown
  abstract?: unknown
  rateStructure?: unknown
  addonTable?: unknown
  addonRates?: unknown
  leadApplicability?: unknown
  seigniorageApplicability?: unknown
  sourceAddonTables?: Record<string, unknown>
  sourceAddonRates?: Record<string, unknown>
}): DataVariantSpec | null {
  const values = rateValues(input.rateValues)
  const abstract = rows(input.abstract)
  const baseRate = number(input.baseRate) ?? values[0]?.value ?? 0
  if (!baseRate) return null

  const addonSpec = structuredAddonSpec({ ...input, baseRate })
  if (addonSpec) return addonSpec
  const postRateSpec = postRateVariantSpec({ ...input, baseRate })
  if (postRateSpec) return postRateSpec

  const classification = multiRateClassification(input.code, input.rateStructure)
  if (classification === 'dual_measurement_basis') {
    return dualBasisSpec(input, values, abstract, baseRate)
  }
  if (classification === 'optional_addition') {
    return optionalAdditionSpec(input, values, abstract, baseRate)
  }
  if (classification === 'type_variants') {
    const options = structuredTypeOptions(values, input.rateStructure, abstract, baseRate)
    if (options.length < 2) return null
    return {
      code: input.code,
      year: input.year,
      description: input.description,
      kind: 'type',
      classification: 'type_variants',
      requiresSelection: true,
      prompt: 'Which published class / type applies?',
      baseRate,
      options
    }
  }
  if (classification === 'quantity_depth_bands') {
    return quantityBandSpec(input, values, abstract, baseRate)
  }
  if (classification === 'derived_adjustment_chain') {
    return adjustmentChainSpec(input, values, baseRate)
  }

  const directUpTo = upToOptionsFromAbstract(abstract)
  const rangedUpTo = directUpTo.length >= 2 ? directUpTo : upToOptionsFromRanges(values, abstract)
  const labelledUpTo = rangedUpTo.length >= 2 ? rangedUpTo : upToOptionsFromRateLabels(values)
  const modifierUpTo = labelledUpTo.length >= 2
    ? labelledUpTo
    : upToOptionsFromModifiers(
        input.code,
        baseRate,
        input.description ?? '',
        modifiers(input.modifiers),
        abstract
      )
  if (modifierUpTo.length >= 2) {
    return {
      code: input.code,
      year: input.year,
      description: input.description,
      kind: 'upto',
      classification: 'quantity_depth_bands',
      requiresSelection: true,
      prompt: 'Prepare DATA up to which limit?',
      baseRate: modifierUpTo[0].rate,
      options: modifierUpTo
    }
  }

  const types = typeOptions(values, abstract)
  if (types.length >= 2) {
    return {
      code: input.code,
      year: input.year,
      description: input.description,
      kind: 'type',
      classification: 'type_variants',
      requiresSelection: true,
      prompt: 'Which DATA type / rate basis applies?',
      baseRate,
      options: types
    }
  }
  return null
}

export async function fetchDataVariantSpecs(
  codes: string[],
  year: string
): Promise<Record<string, DataVariantSpec>> {
  const unique = Array.from(new Set(codes.map((code) => code.trim()).filter(Boolean)))
  if (!unique.length || !year) return {}
  const [yearResult, itemResult] = await Promise.all([
    supabase
      .from('ssr_year')
      .select('code,year,base_rate,rate_values,modifiers,abstract,addon_rates')
      .eq('year', year)
      .in('code', unique),
    supabase
      .from('ssr_item')
      .select('code,description,rate_structure,addon_table,lead_applicability,seigniorage_applicability')
      .in('code', unique)
  ])
  if (yearResult.error) throw yearResult.error
  if (itemResult.error) throw itemResult.error
  const itemMetadata = new Map(
    ((itemResult.data ?? []) as unknown as JsonRecord[]).map((row) => [text(row.code), row])
  )
  const sourceCodes = Array.from(new Set(
    Array.from(itemMetadata.values()).flatMap((item) =>
      rows(item.addon_table).map((definition) => text(definition.source_item)).filter(Boolean)
    )
  ))
  const sourceAddonTables: Record<string, unknown> = {}
  const sourceAddonRates: Record<string, unknown> = {}
  if (sourceCodes.length) {
    const [sourceItems, sourceYears] = await Promise.all([
      supabase.from('ssr_item').select('code,addon_table').in('code', sourceCodes),
      supabase
        .from('ssr_year')
        .select('code,addon_rates')
        .eq('year', year)
        .in('code', sourceCodes)
    ])
    if (sourceItems.error) throw sourceItems.error
    if (sourceYears.error) throw sourceYears.error
    for (const row of (sourceItems.data ?? []) as unknown as JsonRecord[]) {
      sourceAddonTables[text(row.code)] = row.addon_table
    }
    for (const row of (sourceYears.data ?? []) as unknown as JsonRecord[]) {
      sourceAddonRates[text(row.code)] = row.addon_rates
    }
  }
  const specs: Record<string, DataVariantSpec> = {}
  for (const raw of (yearResult.data ?? []) as unknown as JsonRecord[]) {
    const code = text(raw.code)
    const item = itemMetadata.get(code)
    const spec = buildDataVariantSpec({
      code,
      year: text(raw.year),
      description: text(item?.description),
      baseRate: raw.base_rate,
      rateValues: raw.rate_values,
      modifiers: raw.modifiers,
      abstract: raw.abstract,
      rateStructure: item?.rate_structure,
      addonTable: item?.addon_table,
      addonRates: raw.addon_rates,
      leadApplicability: item?.lead_applicability,
      seigniorageApplicability: item?.seigniorage_applicability,
      sourceAddonTables,
      sourceAddonRates
    })
    if (spec?.requiresSelection) specs[spec.code] = spec
  }
  return specs
}

export function resolveDataVariant(
  spec: DataVariantSpec | null,
  selection: DataVariantSelection | undefined
): DataVariantOption | null {
  if (!spec) return null
  if (!spec.requiresSelection) {
    return spec.options.find((option) => option.key === spec.adoptedOptionKey) ?? null
  }
  if (!selection && spec.kind === 'optional_addition' && spec.defaultOptionKey) {
    return spec.options.find((option) => option.key === spec.defaultOptionKey) ?? null
  }
  if (!selection || selection.kind !== spec.kind) return null
  const exact = spec.options.find((option) => option.key === selection.key)
  if (exact) return exact
  // Existing project files used one positional optional-addition key. Resolve it
  // only when the new backend exposes exactly one ID-keyed add-on.
  if (spec.kind === 'optional_addition' && selection.key === 'optional:included') {
    const addons = spec.options.filter((option) => option.addonId)
    if (addons.length === 1) return addons[0]
  }
  return null
}

function baseOptionalAbstract(
  rows: RateAnalysisStoredRow[],
  baseRate: number
): RateAnalysisStoredRow[] {
  const baseRateIndex = rows.findIndex((row) => {
    const value = `${row.label} ${row.basis} ${row.unit}`
    const amount = number(row.amount) ?? number(row.value)
    return /\brate\s+per\b/i.test(value) && amount !== null && Math.abs(amount - baseRate) < 0.011
  })
  if (baseRateIndex >= 0) return rows.slice(0, baseRateIndex + 1)

  const embeddedAnalysisIndex = rows.findIndex((row) => /^rate\s+analysis$/i.test(row.label.trim()))
  if (embeddedAnalysisIndex >= 0) {
    let end = embeddedAnalysisIndex
    while (end > 0 && !rows[end - 1].amount && !rows[end - 1].value) end -= 1
    return rows.slice(0, end)
  }
  return rows
}

function withSelectedAddon(
  leadApplicability: unknown,
  addonId: string | undefined
): unknown {
  if (!addonId) return leadApplicability
  const source = record(leadApplicability)
  return {
    ...source,
    selected_addon_ids: [addonId]
  }
}

function preparedAbstract(
  rows: RateAnalysisStoredRow[],
  spec: DataVariantSpec,
  selected: DataVariantOption
): RateAnalysisStoredRow[] {
  if (selected.postRate) {
    // DAW 1-10 publishes a successive 10% working chain. Retain the source
    // working only through the selected depth instead of collapsing it into an
    // invented cumulative percentage. Other post-rate families remain one
    // base DATA plus a separately presented adjustment.
    if (
      selected.postRateSteps !== undefined &&
      selected.abstractEndIndex !== undefined
    ) {
      return rows.slice(0, selected.abstractEndIndex + 1)
    }
    return basePostRateAbstract(rows)
  }
  if (spec.kind === 'optional_addition') {
    return baseOptionalAbstract(rows, spec.baseRate)
  }
  if (
    (spec.kind === 'upto' || spec.kind === 'quantity_band') &&
    selected.abstractEndIndex !== undefined
  ) {
    return rows.slice(0, selected.abstractEndIndex + 1)
  }
  if (spec.kind !== 'type') return rows
  const otherRates = spec.options
    .filter((option) => option.key !== selected.key)
    .map((option) => option.rate)
  const otherBasisQuantities = spec.options
    .filter((option) => option.key !== selected.key && option.basisQuantity !== undefined)
    .map((option) => option.basisQuantity as number)
  const sharedTotal = rows
    .filter((row) => /total cost for/i.test(row.label))
    .map((row) => number(row.amount))
    .find((amount): amount is number => amount !== null)
  return rows.filter((row) => {
    const amount = number(row.amount) ?? number(row.value)
    const value = `${row.label} ${row.basis} ${row.unit}`
    const basis = number(row.basis)
    return !(
      (amount !== null &&
        /\brate\b/i.test(value) &&
        otherRates.some((rate) => Math.abs(rate - amount) < 0.011)) ||
      (/total cost for/i.test(row.label) &&
        basis !== null &&
        otherBasisQuantities.some((quantity) => Math.abs(quantity - basis) < 0.0001))
    )
  }).map((row) => {
    if (
      sharedTotal !== undefined &&
      /total cost for/i.test(row.label) &&
      number(row.amount) === null
    ) {
      return { ...row, amount: String(sharedTotal) }
    }
    return row
  })
}

/**
 * Post-rate variants use one common DATA analysis. Later source rows merely
 * document how the published variants were derived and must not be rendered or
 * recalculated as part of the selected DATA.
 */
function basePostRateAbstract(rows: RateAnalysisStoredRow[]): RateAnalysisStoredRow[] {
  const totalCostIndex = rows.findIndex((row) => /total cost for/i.test(row.label))
  if (totalCostIndex < 0) return rows
  const rateIndex = rows.findIndex((row, index) =>
    index > totalCostIndex && /\brate\s+pe?r\b/i.test(`${row.label} ${row.basis} ${row.unit}`)
  )
  return rows.slice(0, (rateIndex >= 0 ? rateIndex : totalCostIndex) + 1)
}

export function applyDataVariantToRecipe(
  recipe: RateAnalysisRecipe,
  spec: DataVariantSpec | null,
  selection: DataVariantSelection | undefined
): RateAnalysisRecipe {
  const selected = resolveDataVariant(spec, selection)
  if (!spec) return recipe
  const classification = {
    kind: spec.classification,
    label: multiRateClassificationLabel(spec.classification),
    adoptedRate: selected?.rate ?? spec.baseRate,
    sourceRates: spec.options.map((option) => option.addOnRate ?? option.rate),
    note: spec.prompt,
    sourceQuantity: spec.classification === 'dual_measurement_basis'
      ? spec.options.find((option) => /\b(?:wt|weight)\b/i.test(option.label))?.basisQuantity
      : undefined,
    sourceUnit: spec.classification === 'dual_measurement_basis'
      ? spec.options.find((option) => /\b(?:wt|weight)\b/i.test(option.label))?.basisUnit
      : undefined
  } satisfies NonNullable<RateAnalysisRecipe['multiRateClassification']>
  if (!selected) return { ...recipe, multiRateClassification: classification }

  if (!spec.requiresSelection) {
    const publishedRateBlocks = recipe.publishedRateBlocks?.map((block) => ({
      ...block,
      primary: Math.abs(block.rate - selected.rate) < 0.011
    }))
    return {
      ...recipe,
      outputQuantity: spec.kind === 'dual_basis'
        ? selected.basisQuantity ?? recipe.outputQuantity
        : recipe.outputQuantity,
      unit: spec.kind === 'dual_basis' && selected.basisUnit ? selected.basisUnit : recipe.unit,
      publishedRate: selected.rate,
      publishedRateBlocks,
      multiRateClassification: classification
    }
  }

  const basisQuantity = spec.kind === 'type' ? selected.basisQuantity : undefined
  const optionalAddition = spec.kind === 'optional_addition'
  return {
    ...recipe,
    documentTitle: recipe.documentTitle
      ? `${recipe.documentTitle} · ${selected.label}`
      : selected.label,
    outputQuantity: basisQuantity ?? recipe.outputQuantity,
    unit: spec.kind === 'type' && selected.basisUnit ? selected.basisUnit : recipe.unit,
    publishedRate: selected.rate,
    publishedRateBlocks: optionalAddition ? undefined : recipe.publishedRateBlocks,
    multiRateClassification: classification,
    leadApplicability: withSelectedAddon(recipe.leadApplicability, selected.addonId),
    storedValues: recipe.storedValues
      ? {
          ...recipe.storedValues,
          abstract: preparedAbstract(recipe.storedValues.abstract, spec, selected)
        }
      : recipe.storedValues,
    dataVariant: {
      kind: spec.kind as DataVariantKind,
      key: selected.key,
      label: selected.label,
      rate: selected.rate,
      baseRate: spec.baseRate,
      rateMultiplier: spec.baseRate ? selected.rate / spec.baseRate : 1,
      basisQuantity: selected.basisQuantity,
      basisUnit: selected.basisUnit,
      componentRates: selected.componentRates,
      addOnRate: selected.addOnRate,
      addonId: selected.addonId,
      addonLead: selected.addonLead,
      addonSeigniorage: selected.addonSeigniorage,
      postRate: selected.postRate,
      postRateMultiplier: selected.postRateMultiplier,
      postRateStepPercent: selected.postRateStepPercent,
      postRateSteps: selected.postRateSteps,
      addPercent: selected.addPercent,
      baseVariantLabel: selected.baseVariantLabel,
      additionAnalysis: selected.additionAnalysis,
      leadMaterials: selected.leadMaterials
    }
  }
}

function multiRateClassificationLabel(value: DataMultiRateClassification): string {
  if (value === 'dual_measurement_basis') return 'Dual measurement basis'
  if (value === 'type_variants') return 'Published type / class'
  if (value === 'optional_addition') return 'Optional addition'
  if (value === 'quantity_depth_bands') return 'Quantity / depth bands'
  return 'Derived adjustment chain'
}
