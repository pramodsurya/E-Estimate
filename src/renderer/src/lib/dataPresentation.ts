import type { LeadApplication, LeadVariant } from '../types/project'
import type {
  RateAnalysisRecipe,
  RateAnalysisSectionKey,
  RateAnalysisStoredRow
} from '../types/rateAnalysis'
import {
  calculateBaseRateAnalysis,
  calculateOptionalAddition,
  calculateRateAnalysis,
  labourRowsForDisplay
} from './rateAnalysis'
import { addonLeadRuleForVariant, parseLeadInfo } from './leadApplicability'
import { defaultRateAnalysisLayout } from './rateAnalysisVisibility'

export interface NormalizedStoredRow {
  label: string
  basis: string
  qualifier: string
  amount: string
}

export interface NormalizedLabourRow {
  label: string
  percent: string
  qualifier: string
  amount: string
  kind: 'allowance' | 'total' | 'component' | 'final'
}

export function buildDataPresentation(
  recipe: RateAnalysisRecipe,
  leadApplications: LeadApplication[] = [],
  leadVariants: LeadVariant[] = []
) {
  const summary = calculateBaseRateAnalysis(recipe)
  const adoptedSummary = calculateRateAnalysis(recipe)
  const calculatedAddon = calculateOptionalAddition(recipe)
  const selectedAddonId = recipe.dataVariant?.addonId
  const parsedLeadInfo = parseLeadInfo(recipe.leadApplicability)
  const addonLeadApplications = selectedAddonId
    ? leadApplications.filter((application) => {
        if (application.addonId) return application.addonId === selectedAddonId
        const variant = leadVariants.find((candidate) => candidate.id === application.variantId)
        return variant ? addonLeadRuleForVariant(parsedLeadInfo, variant)?.addonId === selectedAddonId : false
      })
    : []
  const addonLeadIds = new Set(addonLeadApplications.map((application) => application.id))
  const regularLeadApplications = leadApplications.filter(
    (application) => !application.addonId && !addonLeadIds.has(application.id)
  )
  const addonLeadTotal = addonLeadApplications.reduce((total, application) => total + application.grossAmount, 0)
  const abstractRows = recipe.recalculation?.abstract ?? recipe.storedValues?.abstract ?? []
  const publishedAbstractRows = recipe.storedValues?.abstract ?? []
  const layout = recipe.layout ?? defaultRateAnalysisLayout(recipe.description)

  return {
    summary,
    adoptedSummary,
    calculatedAddon,
    layout,
    labourRows: labourRowsForDisplay(recipe),
    abstractRows,
    normalizedLabourRows: normalizeLabourRows(labourRowsForDisplay(recipe)),
    normalizedAbstractRows: normalizeStoredRows(abstractRows),
    publishedAbstractRows,
    affectedAbstractSections: new Set(recipe.recalculation?.affectedSections ?? []),
    addonLeadApplications,
    regularLeadApplications,
    addonLeadTotal,
    hasUserLineChanges: recipe.sections.some((section) =>
      section.lines.some((line) => line.userAdded || (line.editedFields?.length ?? 0) > 0)
    ),
    dualMeasurement: recipe.multiRateClassification?.kind === 'dual_measurement_basis' &&
      (recipe.publishedRateBlocks?.length ?? 0) > 1
  }
}

export function normalizeLabourRows(rows: RateAnalysisStoredRow[]): NormalizedLabourRow[] {
  const result: NormalizedLabourRow[] = []
  for (const source of rows) {
    const label = source.label.trim()
    const value = source.value.trim()
    const percent = uniqueText(source.percent, source.unit)
    if (!label && !value && percent && result.length) {
      result[result.length - 1].percent = uniqueText(result[result.length - 1].percent, percent)
      continue
    }
    if (!label && (!value || /^Rs:?$/i.test(value))) continue
    if (/^Add towards highly skilled labour charges/i.test(label)) {
      result.push({ label, percent, qualifier: value && !numberText(value) ? value : '', amount: source.amount || (numberText(value) ? value : ''), kind: 'allowance' })
      continue
    }
    if (/^Total (?:Cost of Labour|Labour Cost including Area Allowance)$/i.test(label)) {
      result.push({ label, percent, qualifier: value && !numberText(value) ? value : '', amount: source.amount || (numberText(value) ? value : ''), kind: 'total' })
      continue
    }
    const isFinal = /including contractor's/i.test(label)
    result.push({
      label: isFinal && /contractor's$/i.test(label) ? `${label} profit)` : label,
      percent,
      qualifier: value && !numberText(value) ? value : '',
      amount: source.amount || (numberText(value) ? value : ''),
      kind: isFinal ? 'final' : 'component'
    })
  }
  return result
}

export function normalizeStoredRows(rows: RateAnalysisStoredRow[]): NormalizedStoredRow[] {
  const normalized: NormalizedStoredRow[] = []
  for (const row of rows) {
    const current = normalizeStoredRow(row)
    if (current.basis === current.qualifier) current.basis = ''
    if (!current.label && /^rate per\b/i.test(current.basis)) {
      current.label = uniqueText(current.basis, current.qualifier)
      current.basis = ''
      current.qualifier = ''
    }
    const previous = normalized.at(-1)
    if (previous && /^F\.\s|contractor.*(?:profit|overhead)/i.test(previous.label) && /^\([A-F](?:\+[A-F])+\)$/i.test(current.label)) {
      previous.label = uniqueText(previous.label, current.label)
      previous.basis = uniqueText(previous.basis, current.basis)
      previous.qualifier = uniqueText(previous.qualifier, current.qualifier)
      if (previous.basis === previous.qualifier) previous.basis = ''
      if (!previous.amount) previous.amount = current.amount
      continue
    }
    if (!current.label && normalized.length) {
      const preceding = normalized[normalized.length - 1]
      if (/^F\.\s|^Total cost for/i.test(preceding.label)) {
        preceding.basis = uniqueText(preceding.basis, current.basis)
        preceding.qualifier = uniqueText(preceding.qualifier, current.qualifier)
        if (preceding.basis === preceding.qualifier) preceding.qualifier = ''
        if (!preceding.amount) preceding.amount = current.amount
        continue
      }
    }
    if (/^te per\b/i.test(current.label)) current.label = `Ra${current.label}`
    if (/^vertical lift gates/i.test(current.label) && current.basis) {
      current.label = `${current.label} ${current.basis}`
      current.basis = ''
    }
    normalized.push(current)
  }
  return normalized
}

function normalizeStoredRow(row: RateAnalysisStoredRow): NormalizedStoredRow {
  let label = row.label.trim()
  let qualifier = uniqueText(row.percent, row.unit)
  const brokenSuffix = row.unit.match(/^(.*?)(-?\d+(?:\.\d+)?%)$/)
  if (brokenSuffix && label && !/^(Rs:|Total)$/i.test(row.unit)) {
    const suffix = brokenSuffix[1].trim()
    if (suffix && /[A-Za-z)]/.test(suffix)) label = `${label} ${suffix}`.replace(/\s+/g, ' ')
    qualifier = brokenSuffix[2]
  }
  if (/^Rs:$/i.test(row.unit)) qualifier = ''
  return { label, basis: row.basis, qualifier, amount: row.amount || row.value }
}

function numberText(value: string): boolean {
  return /^-?\d+(?:\.\d+)?$/.test(value.trim())
}

export function numericText(value: string): number | null {
  const normalized = value.replaceAll(',', '').trim()
  if (!normalized) return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

export function abstractSectionKey(label: string): RateAnalysisSectionKey | null {
  const text = label.trim().toLowerCase()
  if (/^a\s*[.)]?\s*(cost of )?materials?\b/.test(text)) return 'materials'
  if (/^b\s*[.)]?\s*(hire charges? of |cost of )?(machinery|plant)\b/.test(text)) return 'machinery'
  if (/^c\s*[.)]?\s*(cost of )?labou?r\b/.test(text)) return 'labour'
  return null
}

function uniqueText(...values: string[]): string {
  const out: string[] = []
  for (const raw of values) {
    const value = raw.trim()
    if (value && !out.includes(value)) out.push(value)
  }
  return out.join(' ')
}
