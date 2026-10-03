import type { ProjectNode, ProjectSsrDataDefinition, SorZone } from '../types/project'
import type { RateAnalysisLine, RateAnalysisRecipe, RateAnalysisSection } from '../types/rateAnalysis'
import { fetchRateAnalysis } from './rateAnalysis'
import { parseLeadInfo } from './leadApplicability'
import { projectDataRatesReady } from './projectDataDefaults'
import { supabase } from './supabase'

const normalize = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const money = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100

function ssrNode(code: string): ProjectNode {
  return { id: `builtin-source:${code}`, kind: 'item', name: code, children: [],
    itemSource: 'SSR', itemCode: code, categoryKey: 'ssr_item' }
}

/** Quantities are read from the published M25 wearing-coat specification. */
export function m25WearingMix(description: string): {
  cement: number; coarseLarge: number; coarseSmall: number; fine: number; plasticizer: number
} {
  if (!/M\s*-?\s*25\b/i.test(description) || !/wearing coat/i.test(description)) {
    throw new Error('The M25 quantity source is not an M25 wearing-coat specification.')
  }
  const read = (pattern: RegExp, name: string): number => {
    const match = description.match(pattern)
    const value = match ? Number(match[1]) : Number.NaN
    if (!Number.isFinite(value) || value <= 0) throw new Error(`Missing ${name} in the M25 SSR specification.`)
    return value
  }
  const cement = read(/cement content\s*:\s*([\d.]+)\s*kg/i, 'cement content')
  const coarse = read(/\bCA\s*:\s*([\d.]+)/i, 'coarse aggregate')
  const fine = read(/\bFA\s*:\s*([\d.]+)/i, 'fine aggregate')
  const blend = description.match(/(?:blending\s+)?ratio\s+of\s+CA\s*[-:]+\s*(\d+)\s*:\s*(\d+)/i)
  if (!blend || Number(blend[1]) + Number(blend[2]) !== 100) {
    throw new Error('The M25 SSR coarse-aggregate blend is missing or unsupported.')
  }
  const dose = read(/plastic(?:is|iz)er\s*\(?\s*([\d.]+)\s*%/i, 'superplasticizer dosage')
  return { cement, coarseLarge: coarse * Number(blend[1]) / 100,
    coarseSmall: coarse * Number(blend[2]) / 100, fine, plasticizer: cement * dose / 100 }
}

function sameIdentity(left: RateAnalysisLine['resourceIdentity'], right: RateAnalysisLine['resourceIdentity']): boolean {
  if (!left || !right) return false
  if (left.resourceKey && right.resourceKey) return left.resourceKey === right.resourceKey
  return Boolean(left.sourceTable && left.masterCode &&
    left.sourceTable === right.sourceTable && left.masterCode === right.masterCode &&
    left.rateComponent === right.rateComponent)
}

export function sourceLineFor(line: RateAnalysisLine, source: RateAnalysisRecipe): RateAnalysisLine {
  const link = line.ssrRateLink!
  const rows = source.sections.find((section) => section.key === link.section)?.lines ?? []
  const identityMatches = rows.filter((row) => sameIdentity(link.resourceIdentity, row.resourceIdentity))
  if (identityMatches.length === 1) return identityMatches[0]
  const matches = (identityMatches.length ? identityMatches : rows).filter((row) =>
    normalize(row.description) === normalize(link.description) && normalize(row.unit) === normalize(link.unit)
  )
  if (matches.length !== 1) throw new Error(`Cannot match the annual SSR rate for ${line.description}.`)
  return matches[0]
}

export function annualRate(line: RateAnalysisLine): number {
  // Some schedules contain an amount without a printed unit rate.
  const printedRate = line.sourceValues?.rate?.trim()
  const printedAmount = line.sourceValues?.amount?.trim()
  if (line.sourceValues && !printedRate && !printedAmount) {
    throw new Error(`Missing SSR rate for ${line.description}.`)
  }
  const rate = !printedRate && printedAmount && line.quantity > 0
    ? Number(printedAmount.replace(/,/g, '')) / line.quantity
    : line.rate
  if (!Number.isFinite(rate) || rate < 0) throw new Error(`Missing SSR rate for ${line.description}.`)
  return rate
}

/** Published SSR rows supply prices; linked labour/machinery respect project zones. */
export async function withZonedSourceRates(source: RateAnalysisRecipe, year: string, zone: SorZone): Promise<RateAnalysisRecipe> {
  const rows = source.sections.flatMap((section) => section.lines)
  const requests = await Promise.all((['labour_rate', 'machinery_rate'] as const).map(async (table) => {
    const codes = [...new Set(rows.filter((line) => line.sorRef?.table === table).map((line) => line.sorRef!.code))]
    if (!codes.length) return { table, data: [] as Record<string, unknown>[] }
    const codeColumn = table === 'labour_rate' ? 'labour_code' : 'machinery_code'
    const { data, error } = await supabase.from(table).select('*').eq('sor_year', year).in(codeColumn, codes)
    if (error) throw new Error(error.message)
    return { table, data: (data ?? []) as Record<string, unknown>[] }
  }))
  return { ...source, sections: source.sections.map((section) => ({ ...section, lines: section.lines.map((line) => {
    if (!line.sorRef) return line
    const ref = line.sorRef
    const codeColumn = ref.table === 'labour_rate' ? 'labour_code' : 'machinery_code'
    const row = requests.find((request) => request.table === ref.table)?.data.find((entry) => entry[codeColumn] === ref.code)
    if (!row) throw new Error(`No ${year} rate exists for ${line.description}.`)
    const zoned = (row.zone_rates as Record<string, unknown> | null)?.[zone]
    const field = ref.table === 'labour_rate' ? 'rate' : ref.component
    if (!field) throw new Error(`Missing machinery rate component for ${line.description}.`)
    const raw = ref.table === 'labour_rate' ? zoned ?? row[field]
      : (zoned as Record<string, unknown> | null)?.[field] ?? row[field]
    if (raw === null || raw === undefined || !Number.isFinite(Number(raw)) || Number(raw) < 0) {
      throw new Error(`Missing ${year} ${zone} rate for ${line.description}.`)
    }
    return { ...line, rate: Number(raw), amount: money(line.quantity * Number(raw)), sourceValues: undefined }
  }) })) }
}

function initializedSections(source: RateAnalysisRecipe, mixSource: RateAnalysisRecipe): RateAnalysisSection[] {
  const mix = m25WearingMix(mixSource.description)
  const matched = new Set<string>()
  const leadInfo = parseLeadInfo(source.leadApplicability)
  const mineralRows = source.seigniorageApplicability?.rows ?? source.seigniorageApplicability?.materials ?? []
  const sections = source.sections.map((section) => ({ ...section, lines: section.lines
    .filter((line) => line.quantity !== 0 || Boolean(line.unit.trim()))
    .map((line) => {
      const description = normalize(line.description)
      let perUnit: number | undefined
      let role = ''
      if (section.key === 'materials') {
        if (/^cement for mix$/.test(description)) { perUnit = mix.cement; role = 'cement' }
        else if (/^coarse aggregate 20 10 mm$/.test(description)) { perUnit = mix.coarseLarge; role = 'coarseLarge' }
        else if (/^coarse aggregate 10 mm below$/.test(description)) { perUnit = mix.coarseSmall; role = 'coarseSmall' }
        else if (/^fine aggregate/.test(description)) { perUnit = mix.fine; role = 'fine' }
        else if (/^super plastic(?:is|iz)er$/.test(description)) { perUnit = mix.plasticizer; role = 'plasticizer' }
      }
      if (role) {
        if (matched.has(role)) throw new Error(`Ambiguous M20 SSR material row for ${role}.`)
        matched.add(role)
      }
      const quantity = perUnit === undefined ? line.quantity : Math.round(perUnit * source.outputQuantity * 1e8) / 1e8
      const rate = annualRate(line)
      const leadEntry = section.key === 'materials' || section.key === 'machinery'
        ? Object.entries(leadInfo.materials).find(([name]) => normalize(name) === description) : undefined
      const mineral = section.key === 'materials' ? mineralRows.find((row) => {
        const text = normalize(row.material_desc ?? row.recipe_material_desc ?? '')
        return text && (text.includes(description) || description.includes(text))
      }) : undefined
      const result: RateAnalysisLine = { ...line, id: `builtin:${line.id}`, quantity, rate,
        amount: money(quantity * rate), sourceValues: undefined, editedFields: [], rateOverride: undefined,
        timelyRates: true,
        ssrRateLink: { itemCode: source.itemCode, section: section.key, description: line.description,
          unit: line.unit, resourceIdentity: line.resourceIdentity },
        rateSource: `SSR ${source.itemCode} · ${source.year}`,
        lead: leadEntry ? { applicable: true, materialName: leadEntry[0], conveyanceClass: leadEntry[1] } : { applicable: false },
        seigniorageApplicable: Boolean(mineral), seigniorageCode: mineral?.seig_code ?? undefined }
      return result
    }) }))
  if (matched.size !== 5) {
    throw new Error('The M20 wearing-coat material rows cannot be adapted to the M25 specification.')
  }
  return sections
}

/** Pure merge: quantities, deleted/added rows and deliberate rate edits survive refresh. */
export function mergeBuiltInSsrRates(
  definition: ProjectSsrDataDefinition,
  source: RateAnalysisRecipe,
  mixSource: RateAnalysisRecipe | undefined,
  zone: SorZone
): ProjectSsrDataDefinition {
  const builtIn = definition.builtIn!
  if ((source.unresolvedLines ?? 0) > 0 || source.outputQuantity <= 0 || !source.sections.length || source.sectionRules?.length) {
    throw new Error('The source SSR analysis has missing rates or unsupported section rules.')
  }
  const first = !builtIn.initialized
  if (first && !mixSource) throw new Error('The M25 SSR quantity source is missing.')
  const sections = first ? initializedSections(source, mixSource!) : definition.sections.map((section) => ({
    ...section, lines: section.lines.map((line) => {
      if (line.timelyRates === false || !line.ssrRateLink || line.editedFields?.includes('rate') || line.rateFormula?.trim()) return line
      if (line.ssrRateLink.itemCode !== source.itemCode) throw new Error('The built-in DATA source link does not match its SSR.')
      const sourceLine = sourceLineFor(line, source)
      const rate = annualRate(sourceLine)
      return { ...line, rate, amount: money(line.quantity * rate), rateOverride: undefined,
        rateSource: `SSR ${source.itemCode} · ${source.year}`, sourceValues: undefined }
    })
  }))
  const description = first ? source.description.split(/\nNote:/i)[0]
    .replace(/M\s*-\s*20\b/ig, 'M-25').replace(/not less than\s+20\s+N/ig, 'not less than 25 N')
    : definition.description
  return { ...definition, description, unit: first ? source.unit : definition.unit,
    outputQuantity: first ? source.outputQuantity : definition.outputQuantity,
    overheadPercent: first || (definition.timelyOverhead !== false && definition.overheadPercent === builtIn.sourceOverheadPercent)
      ? source.overheadPercent : definition.overheadPercent,
    sections, updatedAt: new Date().toISOString(),
    builtIn: { ...builtIn, initialized: true, rateStatus: 'ready', resolvedYear: source.year,
      quantitySourceYear: first ? source.year : builtIn.quantitySourceYear,
      resolvedZone: zone, sourceOverheadPercent: source.overheadPercent,
      sourceLeadApplicability: source.leadApplicability, error: undefined } }
}

export async function resolveBuiltInProjectData(
  definition: ProjectSsrDataDefinition,
  year: string,
  zone: SorZone,
  force = false
): Promise<ProjectSsrDataDefinition> {
  if (!definition.builtIn) return definition
  if (!year) throw new Error('Select the project SOR/SSR year to load M25 DATA rates.')
  if (!force && projectDataRatesReady(definition, year, zone)) return definition
  const [source, mixSource] = await Promise.all([
    fetchRateAnalysis(ssrNode(definition.builtIn.sourceItemCode), year, { zone }),
    definition.builtIn.initialized ? Promise.resolve(undefined)
      : fetchRateAnalysis(ssrNode(definition.builtIn.mixItemCode), year, { zone })
  ])
  const zonedSource = await withZonedSourceRates(source, year, zone)
  return mergeBuiltInSsrRates(definition, zonedSource, mixSource, zone)
}
