import { supabase } from './supabase'
import type {
  EestimateProject,
  MaterialRateOverride,
  ProjectNode
} from '../types/project'
import type { RateAnalysisLine, RateAnalysisRecipe } from '../types/rateAnalysis'

/**
 * Current SOR identities and quote functions supply annual cement/steel prices.
 * SOR_Monthly_Rate supplies dated circulars with explicit recipe/resource bindings;
 * project overrides remain separately supported.
 */

export interface MonthlyMaterial {
  materialCode: string
  name: string
  unit: string
  category: string
}

export interface MaterialRatePeriod {
  materialCode: string
  rate: number
  effectiveFrom: string
  effectiveTo: string | null
  sorYear: string
  source: string
}

export interface MaterialRateCircular {
  /** effective_from shared by every row the circular published. */
  effectiveFrom: string
  effectiveTo: string | null
  sorYear: string
  source: string
  materialCodes: string[]
}

export type MaterialRateOrigin = 'OVERRIDE' | 'MONTHLY' | 'YEARLY' | 'NONE'

export interface ResolvedMaterialRate {
  rate: number | null
  origin: MaterialRateOrigin
  /** Printable provenance, e.g. "G.O. monthly material circular - May 2026". */
  label: string
  effectiveFrom?: string
}

/**
 * Shared normalization for exact resource names and unambiguous current aliases.
 */
export function normalizeMaterialDesc(description: string): string {
  return description.trim().replace(/\s+/g, ' ').toLowerCase()
}

function tonneFactor(unit: string): number | null {
  const text = unit.trim().toLowerCase().replace(/\./g, '').replace(/^one\s+/, '')
  if (/^(t|mt|ton|tons|tonne|tonnes|metric tons?|metric tonnes?)$/.test(text)) return 1000
  if (/^(kg|kgs|kilo|kilos|kilogram|kilograms)$/.test(text)) return 1
  return null
}

/**
 * Convert a master rate quoted per `masterUnit` into the unit the DATA line uses.
 * Returns null when the units are not weight-comparable, so the caller can leave the
 * published rate alone rather than silently writing a wrong number.
 */
export function convertMasterRate(
  masterRate: number,
  masterUnit: string,
  lineUnit: string
): number | null {
  const from = tonneFactor(masterUnit)
  const to = tonneFactor(lineUnit)
  if (from === null || to === null) return null
  // Multiply before dividing: masterRate * (to / from) leaves float noise that shows
  // up as 5.1000000000000005 per kg and defeats the unchanged-rate comparison.
  const converted = (masterRate * to) / from
  if (!Number.isFinite(converted)) return null
  return Math.round((converted + Number.EPSILON) * 1e6) / 1e6
}

// Master data changes rarely within a session, but the Cement/Steel page has an
// explicit refresh, so keep this in memory only and let that button clear it.
let materialsCache: Promise<MonthlyMaterial[]> | null = null
let aliasCache: Promise<Map<string, string>> | null = null
interface CurrentMonthlyRate {
  recipe_code: string | null
  resource_code: string | null
  year: string
  effective_from: string
  effective_to: string | null
  rate: number | string
  source: string
  unit: string | null
}
let monthlyCache: Promise<CurrentMonthlyRate[]> | null = null
function currentMonthlyRows(): Promise<CurrentMonthlyRate[]> {
  if (!monthlyCache) monthlyCache = (async () => {
    const {data,error} = await supabase.from('SOR_Monthly_Rate')
      .select('recipe_code,resource_code,year,effective_from,effective_to,rate,source,unit:metadata->>unit')
      .order('effective_from',{ascending:false})
    if (error) throw error
    return (data ?? []) as unknown as CurrentMonthlyRate[]
  })().catch(reason=>{monthlyCache=null;throw reason})
  return monthlyCache
}

export function invalidateMaterialRateCache(): void {
  materialsCache = null
  aliasCache = null
  monthlyCache = null
}

export async function fetchMonthlyMaterials(): Promise<MonthlyMaterial[]> {
  if(!materialsCache)materialsCache=(async()=>{
    const {data,error}=await supabase.from('SOR_Recipie').select('recipe_code,description,unit,lead_applicability')
      .in('lead_applicability',['CEMENT','STEEL']).order('recipe_code')
    if(error)throw error
    const materials = new Map((data ?? []).map(row=>[String(row.recipe_code),{materialCode:String(row.recipe_code),name:String(row.description),unit:String(row.unit),category:String(row.lead_applicability)}]))
    const monthly = await currentMonthlyRows()
    const missing = [...new Set(monthly.flatMap(row=>row.recipe_code&&!materials.has(row.recipe_code)?[row.recipe_code]:[]))]
    if (missing.length) {
      const extra=await supabase.from('SOR_Recipie').select('recipe_code,description,unit,lead_applicability').in('recipe_code',missing)
      if (extra.error) throw extra.error
      for (const row of extra.data ?? []) materials.set(String(row.recipe_code),{materialCode:String(row.recipe_code),name:String(row.description),unit:String(row.unit),category:String(row.lead_applicability ?? 'PUBLIC_HEALTH')})
    }
    for (const row of monthly) if (!row.recipe_code && row.resource_code && row.unit) materials.set(row.resource_code,{
      materialCode:row.resource_code,name:row.resource_code.replaceAll('_',' '),unit:row.unit,category:'PUBLIC_HEALTH'
    })
    return [...materials.values()]
  })().catch(reason=>{materialsCache=null;throw reason})
  return materialsCache
}

/** Preserve explicit current bindings and convert the published circular unit once. */
export async function fetchMaterialRatePeriods(): Promise<MaterialRatePeriod[]> {
  const [rows,materials] = await Promise.all([currentMonthlyRows(),fetchMonthlyMaterials()])
  const units = new Map(materials.map(material=>[material.materialCode,material.unit]))
  return rows.map(row=>{
    const materialCode=row.recipe_code ?? row.resource_code
    const targetUnit=materialCode?units.get(materialCode):undefined
    const raw=Number(row.rate)
    if(!materialCode||!targetUnit||!row.unit||!Number.isFinite(raw)||raw<0)throw new Error('A current monthly circular is missing its material, unit or rate.')
    const rate=targetUnit.trim().toLowerCase()===row.unit.trim().toLowerCase()?raw:convertMasterRate(raw,row.unit,targetUnit)
    if(rate===null)throw new Error(`The monthly circular unit for ${materialCode} does not match its SOR definition.`)
    return {materialCode,rate,effectiveFrom:row.effective_from,effectiveTo:row.effective_to,sorYear:row.year,source:row.source}
  })
}

/** Only reviewed SSR resource identities establish aliases; ambiguous names are omitted. */
export async function fetchMaterialAliases(): Promise<Map<string,string>> {
  if(!aliasCache)aliasCache=(async()=>{
    const codes=new Map<string,Set<string>>()
    for(let offset=0;;offset+=500){
      const {data,error}=await supabase.from('SSR_Recipe').select('materials').order('recipe_code').range(offset,offset+499)
      if(error)throw error
      for(const recipe of data ?? [])for(const raw of Array.isArray(recipe.materials)?recipe.materials:[]){
        const row=raw as Record<string,unknown>, identity=row.resource_identity as Record<string,unknown>|undefined
        if(identity?.source_table!=='SOR_Year'||typeof identity.master_code!=='string')continue
        const name=normalizeMaterialDesc(String(row.desc ?? ''));const values=codes.get(name)??new Set<string>();values.add(identity.master_code);codes.set(name,values)
      }
      if(!data||data.length<500)break
    }
    return new Map([...codes].filter(([,values])=>values.size===1).map(([name,values])=>[name,[...values][0]]))
  })().catch(reason=>{aliasCache=null;throw reason})
  return aliasCache
}

export async function fetchYearlyMaterialRates(sorYear:string,zone:'zone_1'|'zone_2'|'zone_3'='zone_3'):Promise<Map<string,number>> {
  const materials=await fetchMonthlyMaterials(),result=new Map<string,number>()
  for(let offset=0;offset<materials.length;offset+=6){
    await Promise.all(materials.slice(offset,offset+6).map(async material=>{
      if(!material.materialCode.startsWith('SOR-'))return
      const {data,error}=await supabase.rpc('sor_resource_quote',{p_recipe_code:material.materialCode,p_year:sorYear,p_zone:zone,p_component:'rate',p_unit:material.unit})
      if(error)throw error
      const quote=data as Record<string,unknown>|null
      if(quote?.status==='priced'&&quote.year===sorYear&&quote.zone===zone&&typeof quote.rate==='number'&&Number.isFinite(quote.rate))result.set(material.materialCode,quote.rate)
    }))
  }
  return result
}

/** Group the monthly rows into the circulars they were published as. */
export function circularsFromPeriods(periods: MaterialRatePeriod[]): MaterialRateCircular[] {
  const byDate = new Map<string, MaterialRateCircular>()
  for (const period of periods) {
    const existing = byDate.get(period.effectiveFrom)
    if (existing) {
      existing.materialCodes.push(period.materialCode)
      continue
    }
    byDate.set(period.effectiveFrom, {
      effectiveFrom: period.effectiveFrom,
      effectiveTo: period.effectiveTo,
      sorYear: period.sorYear,
      source: period.source,
      materialCodes: [period.materialCode]
    })
  }
  return Array.from(byDate.values()).sort((a, b) =>
    b.effectiveFrom.localeCompare(a.effectiveFrom)
  )
}

export function formatCircularMonth(effectiveFrom: string): string {
  const parsed = new Date(`${effectiveFrom}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return effectiveFrom
  return parsed.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}

/** Newest circular row for a material at or before `asOf` (ISO yyyy-mm-dd). */
export function periodForDate(
  periods: MaterialRatePeriod[],
  materialCode: string,
  asOf: string
): MaterialRatePeriod | null {
  let best: MaterialRatePeriod | null = null
  for (const period of periods) {
    if (period.materialCode !== materialCode) continue
    if (period.effectiveFrom > asOf) continue
    if (period.effectiveTo && period.effectiveTo < asOf) continue
    if (!best || period.effectiveFrom > best.effectiveFrom) best = period
  }
  return best
}

export function periodAt(
  periods: MaterialRatePeriod[],
  materialCode: string,
  effectiveFrom: string
): MaterialRatePeriod | null {
  return (
    periods.find(
      (period) =>
        period.materialCode === materialCode && period.effectiveFrom === effectiveFrom
    ) ?? null
  )
}

export interface MaterialRateContext {
  overrides: Record<string, MaterialRateOverride>
  periods: MaterialRatePeriod[]
  yearlyRates: Map<string, number>
  /** ISO date the project prices at; defaults to today where not set. */
  asOf: string
  sorYear: string
}

/**
 * Resolution order: per-project override -> monthly circular effective at `asOf`
 * -> yearly published SOR rate. Never falls back across projects.
 */
export function resolveMaterialRate(
  materialCode: string,
  context: MaterialRateContext
): ResolvedMaterialRate {
  const override = context.overrides[materialCode]
  if (override && Number.isFinite(override.rate)) {
    return {
      rate: override.rate,
      origin: 'OVERRIDE',
      label: override.label ?? 'Project rate',
      effectiveFrom: override.effectiveFrom
    }
  }
  const period = periodForDate(context.periods, materialCode, context.asOf)
  if (period) {
    return {
      rate: period.rate,
      origin: 'MONTHLY',
      label: period.source || `Circular ${formatCircularMonth(period.effectiveFrom)}`,
      effectiveFrom: period.effectiveFrom
    }
  }
  const yearly = context.yearlyRates.get(materialCode)
  if (yearly !== undefined && Number.isFinite(yearly)) {
    return { rate: yearly, origin: 'YEARLY', label: `Published SOR ${context.sorYear}` }
  }
  return { rate: null, origin: 'NONE', label: 'No rate available' }
}

export interface MaterialRateApplication {
  materialCode: string
  lineDescription: string
  previousRate: number
  nextRate: number
  label: string
}

/** A deliberately entered resource rate must never be replaced by a global update. */
export interface MaterialRateSkip {
  materialCode: string
  lineDescription: string
  reason: 'MANUAL_RATE'
}

/**
 * Re-price every material line whose description maps to an overridden material.
 *
 * The line is marked as a 'rate' edit so recalculateRateAnalysis treats it as
 * financially changed and rebuilds the abstract from quantity x rate. Without that
 * marking, calculateBaseRateAnalysis would keep returning the published stored totals
 * and the new rate would display but never reach the item rate.
 */
export function applyMaterialRateOverrides(
  recipe: RateAnalysisRecipe,
  overrides: Record<string, MaterialRateOverride>,
  aliases: Map<string, string>,
  materials: Map<string, MonthlyMaterial>
): {
  recipe: RateAnalysisRecipe
  applications: MaterialRateApplication[]
  skipped: MaterialRateSkip[]
} {
  const overriddenCodes = Object.keys(overrides)
  if (!overriddenCodes.length) return { recipe, applications: [], skipped: [] }

  const applications: MaterialRateApplication[] = []
  const skipped: MaterialRateSkip[] = []
  let changed = false
  const sections = recipe.sections.map((section) => {
    if (section.key !== 'materials') return section
    const lines = section.lines.map((line): RateAnalysisLine => {
      const materialCode =
        line.materialCode ?? (line.resourceIdentity?.sourceTable==='SOR_Year'?line.resourceIdentity.masterCode:undefined) ?? aliases.get(normalizeMaterialDesc(line.description))
      if (!materialCode) return line
      const override = overrides[materialCode]
      if (!override || !Number.isFinite(override.rate)) return line

      // A manually entered/extracted row, or a source row whose rate was explicitly
      // edited, is intentionally fixed. A previous global rate override is not a
      // manual lock: it keeps its original published rate in rateOverride and may be
      // updated by a later circular.
      const manuallyLocked =
        line.userAdded ||
        (line.editedFields?.includes('rate') === true && !line.rateOverride)
      if (manuallyLocked) {
        skipped.push({
          materialCode,
          lineDescription: line.description,
          reason: 'MANUAL_RATE'
        })
        return line
      }

      const master = materials.get(materialCode)
      const masterUnit = master?.unit ?? 'tonne'
      const nextRate = convertMasterRate(override.rate, masterUnit, line.unit)
      // Unit is not weight-comparable (LS, sqm, Nos): leave the published rate alone.
      if (nextRate === null) return line
      const publishedRate = line.rateOverride?.publishedRate ?? line.rate
      const provenance = {
        materialCode,
        label: override.label ?? 'Project rate',
        masterRate: override.rate,
        masterUnit,
        publishedRate
      }
      const markedAsOverridden = Array.from(
        new Set([...(line.editedFields ?? []), 'rate' as const])
      )
      // The project rate can land exactly on the published one - cement is 5,100 a
      // tonne in both the yearly SOR and the circular. The row is still governed by
      // the project rate, so it has to carry the same provenance as a row whose
      // number moved. Leaving it bare showed it as an untouched published rate, and
      // projectData strips a rateOverride on every recompute expecting this pass to
      // put it back, so the marking was lost for good on the next edit.
      if (Math.abs(nextRate - line.rate) < 0.0005) {
        if (
          line.materialCode === materialCode &&
          line.rateOverride &&
          line.editedFields?.includes('rate')
        ) {
          return line
        }
        changed = true
        return {
          ...line,
          materialCode,
          editedFields: markedAsOverridden,
          rateOverride: provenance
        }
      }

      applications.push({
        materialCode,
        lineDescription: line.description,
        previousRate: line.rate,
        nextRate,
        label: override.label ?? 'Project rate'
      })
      return {
        ...line,
        materialCode,
        rate: nextRate,
        amount: Math.round((line.quantity * nextRate + Number.EPSILON) * 100) / 100,
        editedFields: markedAsOverridden,
        rateOverride: provenance
      }
    })
    return { ...section, lines }
  })

  if (!applications.length && !changed) return { recipe, applications: [], skipped }
  return { recipe: { ...recipe, sections }, applications, skipped }
}

const SSR_CATEGORY_KEYS = new Set(['ssr_item', 'taw', 'daw', 'caw', 'gaw', 'ccdw', 'pmw'])

export interface MaterialUsageRef {
  /** SSR/SOR item code, e.g. IRR-CAW-8-10. Empty for Project DATA without a code. */
  code: string
  /** Full item description. */
  description: string
  source: 'SSR' | 'SOR' | 'PROJECT_DATA'
}

export interface MaterialUsage {
  materialCode: string
  /** Items in this project that consume the material. */
  usedBy: MaterialUsageRef[]
}

/**
 * An SSR item is identified by its code — the description is a long specification
 * that truncates to uselessness. SOR resources and Project DATA are the other way
 * round: the description is the name, and the code is opaque.
 */
export function usageLabel(ref: MaterialUsageRef): string {
  if (ref.source === 'SSR') return ref.code || ref.description
  return ref.description || ref.code
}

function collectItemNodes(node: ProjectNode): ProjectNode[] {
  if (node.kind === 'item') return [node]
  return node.children.flatMap(collectItemNodes)
}

/**
 * Which monthly materials this project actually consumes. Drives the Cement/Steel page
 * so the estimator only sees rates that matter to the estimate in front of them.
 *
 * Three routes in: SSR items resolved through the alias table, SOR material resources
 * added directly (their item code IS the material code), and Project DATA definitions.
 */
export async function materialUsageForProject(
  project: EestimateProject
): Promise<MaterialUsage[]> {
  const items = collectItemNodes(project.root)
  const aliases = await fetchMaterialAliases()
  const usage = new Map<string, Map<string, MaterialUsageRef>>()
  const add = (code: string, ref: MaterialUsageRef): void => {
    const existing = usage.get(code) ?? new Map<string, MaterialUsageRef>()
    existing.set(`${ref.source}:${ref.code}:${ref.description}`, ref)
    usage.set(code, existing)
  }

  const ssrCodes = new Set<string>()
  const refForSsrCode = new Map<string, MaterialUsageRef>()
  for (const item of items) {
    const code = item.itemCode?.trim()
    if (!code) continue
    const description = item.itemDescription?.trim() || item.name
    if (item.itemSource === 'SSR' || SSR_CATEGORY_KEYS.has(item.categoryKey ?? '')) {
      ssrCodes.add(code)
      if (!refForSsrCode.has(code)) {
        refForSsrCode.set(code, { code, description, source: 'SSR' })
      }
    } else if (item.itemSource === 'SOR' && item.sorCatalogue) {
      add(item.sorCatalogue.resolvedRecipeCode, { code, description, source: 'SOR' })
    }
  }

  // Project DATA definitions carry their own resource rows.
  const usedDefinitionIds = new Set(
    items.map((item) => item.projectDataId).filter((id): id is string => Boolean(id))
  )
  for (const definition of project.projectData ?? []) {
    if (!usedDefinitionIds.has(definition.id) || definition.kind !== 'ssr') continue
    for (const section of definition.sections) {
      for (const line of section.lines) {
        const code =
          line.materialCode ?? (line.resourceIdentity?.sourceTable==='SOR_Year'?line.resourceIdentity.masterCode:undefined) ?? aliases.get(normalizeMaterialDesc(line.description))
        if (code) {
          add(code, {
            code: definition.code,
            description: definition.description || definition.code,
            source: 'PROJECT_DATA'
          })
        }
      }
    }
  }

  if (ssrCodes.size) {
    const { data, error } = await supabase
      .from('ssr_item')
      .select('code, materials')
      .in('code', Array.from(ssrCodes))
    if (error) throw error
    for (const row of data ?? []) {
      const code = String(row.code ?? '')
      const ref = refForSsrCode.get(code) ?? { code, description: code, source: 'SSR' as const }
      const materials = Array.isArray(row.materials) ? row.materials : []
      for (const entry of materials) {
        const description =
          entry && typeof entry === 'object'
            ? String((entry as Record<string, unknown>).desc ?? '')
            : ''
        if (!description) continue
        const identity=(entry as Record<string,unknown>).resource_identity as Record<string,unknown>|undefined
        const materialCode = identity?.source_table==='SOR_Year'&&typeof identity.master_code==='string'
          ? identity.master_code : aliases.get(normalizeMaterialDesc(description))
        if (materialCode) add(materialCode, ref)
      }
    }
  }

  return Array.from(usage.entries())
    .map(([materialCode, refs]) => ({
      materialCode,
      usedBy: Array.from(refs.values()).sort((a, b) =>
        usageLabel(a).localeCompare(usageLabel(b), undefined, { numeric: true })
      )
    }))
    .sort((a, b) => a.materialCode.localeCompare(b.materialCode))
}

/** Materials actually referenced by a recipe, for the Cement/Steel page's item list. */
export function materialCodesInRecipe(
  recipe: RateAnalysisRecipe,
  aliases: Map<string, string>
): string[] {
  const codes = new Set<string>()
  for (const section of recipe.sections) {
    for (const line of section.lines) {
      const code = line.materialCode ?? (line.resourceIdentity?.sourceTable==='SOR_Year'?line.resourceIdentity.masterCode:undefined) ?? aliases.get(normalizeMaterialDesc(line.description))
      if (code) codes.add(code)
    }
  }
  if (recipe.itemSource === 'SOR' && recipe.sor) {
    codes.add(recipe.sor.resolvedRecipeCode)
  }
  return Array.from(codes)
}
