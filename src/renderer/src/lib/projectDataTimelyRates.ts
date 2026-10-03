import type { ProjectDataDefinition, ProjectDataRateSource, ProjectNode, SorZone } from '../types/project'
import type { RateAnalysisLine, RateAnalysisRecipe } from '../types/rateAnalysis'
import { fetchRateAnalysis } from './rateAnalysis'
import { supabase } from './supabase'
import { annualRate, resolveBuiltInProjectData, sourceLineFor } from './builtInProjectData'
import { projectDataRatesReady } from './projectDataDefaults'
import { projectDataRowTimely, projectDataSorRateLink, projectDataUsesTimelyRates } from './projectDataRateLinks'

const money = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100
const unitKey = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, '')

function sourceNode(source: ProjectDataRateSource): ProjectNode {
  return { id: `timely:${source.itemSource}:${source.categoryKey}:${source.itemCode}`,
    kind: 'item', name: source.itemCode, children: [], ...source }
}

function sameUnit(current: string, source: string, description: string): void {
  if (unitKey(current) !== unitKey(source)) {
    throw new Error(`${description}: the catalogue unit is ${source}; link a matching unit before using Timely rates.`)
  }
}

/** One request cache per pricing pass; comparative columns never share a year. */
export function createProjectDataRateResolver(year: string, zone: SorZone) {
  const sources = new Map<string, Promise<RateAnalysisRecipe>>()
  const componentRates = new Map<string, Promise<number>>()
  const fetchSource = (source: ProjectDataRateSource): Promise<RateAnalysisRecipe> => {
    const key = JSON.stringify([source.itemSource,source.categoryKey,source.itemCode,source.sorCatalogue,source.dataVariant])
    let request = sources.get(key)
    if (!request) {
      request = fetchRateAnalysis(sourceNode(source), year, { zone })
      sources.set(key, request)
    }
    return request
  }

  const sorPrice = async (source: ProjectDataRateSource & { component?: string }, unit: string): Promise<number> => {
    // A fuel/hire subcomponent is not the machinery master's total hire rate.
    if (source.component && (source.categoryKey === 'machinery' || source.categoryKey === 'labour')) {
      const key = JSON.stringify(source)
      let request = componentRates.get(key)
      if (!request) {
        request = (async () => {
          const labour = source.categoryKey === 'labour'
          const { data, error } = await supabase.from(labour ? 'labour_rate' : 'machinery_rate').select('*')
            .eq(labour ? 'labour_code' : 'machinery_code', source.itemCode).eq('sor_year', year).maybeSingle()
          if (error || !data) throw new Error(error?.message ?? `No ${year} ${source.categoryKey} rate exists for ${source.itemCode}.`)
          const row = data as Record<string, unknown>
          const zoned = (row.zone_rates as Record<string, unknown> | null)?.[zone]
          const raw = labour ? zoned ?? row.rate
            : (zoned as Record<string,unknown> | null)?.[source.component!] ?? row[source.component!]
          if (raw === null || raw === undefined || !Number.isFinite(Number(raw)) || Number(raw) < 0) {
            throw new Error(`Missing ${year} ${zone} ${source.component} rate for ${source.itemCode}.`)
          }
          return Number(raw)
        })()
        componentRates.set(key, request)
      }
      return request
    }
    const recipe = await fetchSource(source)
    sameUnit(unit, recipe.unit, source.itemCode)
    const price = recipe.publishedRate
    if ((recipe.unresolvedLines ?? 0) > 0 || typeof price !== 'number' || !Number.isFinite(price) || price < 0) {
      throw new Error(`No numeric ${year} SOR rate exists for ${source.itemCode}.`)
    }
    return price
  }

  return async (definition: ProjectDataDefinition, force = false): Promise<ProjectDataDefinition> => {
    if (!projectDataUsesTimelyRates(definition)) return definition
    if (!force && projectDataRatesReady(definition, year, zone)) return definition
    if (!year) throw new Error('Select a SOR/SSR year to load Timely rates.')

    if (definition.kind === 'ssr' && definition.builtIn && !definition.builtIn.initialized) {
      definition = await resolveBuiltInProjectData(definition, year, zone, true)
      return { ...definition, rateRefresh:{status:'ready',year,zone} }
    }
    const rateRefresh = { status: 'ready' as const, year, zone }
    if (definition.kind === 'sor') {
      if (!definition.rateSource || definition.rateSource.itemSource !== 'SOR') {
        throw new Error('Select a SOR code before enabling Timely rates for this DATA.')
      }
      const rate = await sorPrice(definition.rateSource, definition.unit)
      return { ...definition, rate, rateRefresh, updatedAt: new Date().toISOString() }
    }

    const legacyBuiltIn = Boolean(definition.builtIn)
    const sections = await Promise.all(definition.sections.map(async section => ({
      ...section,
      lines: await Promise.all(section.lines.map(async (line): Promise<RateAnalysisLine> => {
        if (!projectDataRowTimely(line, legacyBuiltIn)) return line
        let rate: number
        if (line.ssrRateLink) {
          const recipe = await fetchSource({itemSource:'SSR',categoryKey:'ssr_item',itemCode:line.ssrRateLink.itemCode})
          const sourceLine = sourceLineFor(line,recipe)
          sameUnit(line.unit,sourceLine.unit,line.description)
          if (sourceLine.sorRef?.table === 'machinery_rate' && !sourceLine.sorRef.component) {
            throw new Error(`Missing machinery price component for ${line.description}.`)
          }
          rate = sourceLine.sorRef
            ? await sorPrice({itemSource:'SOR',categoryKey:sourceLine.sorRef.table === 'labour_rate' ? 'labour' : 'machinery',
                itemCode:sourceLine.sorRef.code,component:sourceLine.sorRef.table === 'labour_rate' ? 'rate' : sourceLine.sorRef.component},line.unit)
            : annualRate(sourceLine)
        } else {
          const link = projectDataSorRateLink(line)
          if (!link) throw new Error(`Select a catalogue source for ${line.description}.`)
          rate = await sorPrice(link,line.unit)
        }
        return { ...line, rate, amount: money(line.quantity * rate),
          sourceValues: undefined, rateOverride: undefined,
          editedFields: line.editedFields?.filter(field => field !== 'rate' && field !== 'amount'),
          rateSource: `${line.ssrRateLink ? 'SSR ' + line.ssrRateLink.itemCode : 'SOR ' + projectDataSorRateLink(line)!.itemCode} · ${year} · ${zone}` }
      }))
    })))
    let overheadPercent = definition.overheadPercent
    if (definition.timelyOverhead) {
      const source = definition.rateSource ?? (definition.builtIn
        ? {itemSource:'SSR' as const,categoryKey:'ssr_item',itemCode:definition.builtIn.sourceItemCode}
        : undefined)
      if (!source || source.itemSource !== 'SSR') throw new Error('Select an SSR source for Timely overhead.')
      overheadPercent = (await fetchSource(source)).overheadPercent
      if (!Number.isFinite(overheadPercent) || overheadPercent < 0) {
        throw new Error(`No valid ${year} SSR profit/overhead percentage exists for ${source.itemCode}.`)
      }
    }
    return { ...definition, sections, overheadPercent, rateRefresh, updatedAt: new Date().toISOString(),
      ...(definition.builtIn ? {builtIn:{...definition.builtIn,rateStatus:'ready' as const,
        resolvedYear:year,resolvedZone:zone,error:undefined}} : {}) }
  }
}

/** The same resolver is used by the library, normal Sync and both comparison years. */
export async function resolveTimelyProjectData(
  definition: ProjectDataDefinition, year: string, zone: SorZone, force = false
): Promise<ProjectDataDefinition> {
  return createProjectDataRateResolver(year,zone)(definition,force)
}
