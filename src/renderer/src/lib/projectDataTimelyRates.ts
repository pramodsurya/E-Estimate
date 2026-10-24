import type { ProjectDataDefinition, ProjectDataRateSource, ProjectNode, SorZone } from '../types/project'
import type { RateAnalysisLine, RateAnalysisRecipe } from '../types/rateAnalysis'
import { fetchRateAnalysis } from './rateAnalysis'
import { supabase } from './supabase'
import { annualRate, sourceLineFor } from './ssrResourceRates'
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
    if(source.itemCode.startsWith('SOR-') && (!source.sorCatalogue || source.component && source.component!=='rate')) {
      const key=JSON.stringify([source.itemCode,source.component,unit,year,zone])
      let request=componentRates.get(key)
      if(!request){request=(async()=>{
        const {data,error}=await supabase.rpc('sor_resource_quote',{p_recipe_code:source.itemCode,p_year:year,p_zone:zone,p_component:source.component ?? 'rate',p_unit:unit})
        const quote=data as Record<string,unknown>|null
        if(error||quote?.status!=='priced'||quote.year!==year||quote.zone!==zone||quote.unit!==unit||typeof quote.rate!=='number'||!Number.isFinite(quote.rate))throw new Error(error?.message ?? `No compatible ${year} ${zone} SOR rate exists for ${source.itemCode}.`)
        return quote.rate
      })();componentRates.set(key,request)}
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

    const rateRefresh = { status: 'ready' as const, year, zone }
    if (definition.kind === 'sor') {
      if (!definition.rateSource || definition.rateSource.itemSource !== 'SOR') {
        throw new Error('Select a SOR code before enabling Timely rates for this DATA.')
      }
      const rate = await sorPrice(definition.rateSource, definition.unit)
      return { ...definition, rate, rateRefresh, updatedAt: new Date().toISOString() }
    }

    const sections = await Promise.all(definition.sections.map(async section => ({
      ...section,
      lines: await Promise.all(section.lines.map(async (line): Promise<RateAnalysisLine> => {
        if (!projectDataRowTimely(line)) return line
        let rate: number
        if (line.ssrRateLink) {
          const recipe = await fetchSource({itemSource:'SSR',categoryKey:'ssr_item',itemCode:line.ssrRateLink.itemCode})
          const sourceLine = sourceLineFor(line,recipe)
          sameUnit(line.unit,sourceLine.unit,line.description)
          if(line.ssrRateLink.section!=='materials'&&sourceLine.resourceIdentity?.sourceTable==='SOR_Year'){
            const section=recipe.sections.find(section=>section.key===line.ssrRateLink!.section)
            const index=section?.lines.indexOf(sourceLine) ?? -1
            const {data,error}=await supabase.rpc('ssr_linked_resource_quote',{p_recipe_code:recipe.itemCode,p_analysis_scope:line.ssrRateLink.section,p_line_index:index,p_year:year,p_zone:zone})
            const quote=data as Record<string,unknown>|null
            if(error||quote?.status!=='priced'||quote.year!==year||quote.zone!==zone||quote.unit!==line.unit||typeof quote.rate!=='number'||!Number.isFinite(quote.rate))throw new Error(error?.message ?? `No compatible ${year} ${zone} source rate exists for ${line.description}.`)
            rate=quote.rate
          }else rate=annualRate(sourceLine)
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
      const source = definition.rateSource
      if (!source || source.itemSource !== 'SSR') throw new Error('Select an SSR source for Timely overhead.')
      overheadPercent = (await fetchSource(source)).overheadPercent
      if (!Number.isFinite(overheadPercent) || overheadPercent < 0) {
        throw new Error(`No valid ${year} SSR profit/overhead percentage exists for ${source.itemCode}.`)
      }
    }
    return { ...definition, sections, overheadPercent, rateRefresh, updatedAt: new Date().toISOString() }
  }
}

/** The same resolver is used by the library, normal Sync and both comparison years. */
export async function resolveTimelyProjectData(
  definition: ProjectDataDefinition, year: string, zone: SorZone, force = false
): Promise<ProjectDataDefinition> {
  return createProjectDataRateResolver(year,zone)(definition,force)
}
