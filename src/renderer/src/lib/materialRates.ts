import { supabase } from './supabase'
import type {
  EestimateProject,
  MaterialRateOverride,
  ProjectNode
} from '../types/project'
import type { RateAnalysisLine, RateAnalysisRecipe } from '../types/rateAnalysis'

/**
 * Cement, steel and Public Health rates move every month by G.O. circular, while the
 * published SSR/SOR rate for an item is frozen for the whole year. These helpers link
 * the two: they resolve which master material governs a DATA line, and re-price that
 * line from the month the estimator has chosen for the project.
 *
 * Two rate tables exist and they are NOT duplicates:
 *   material_rate          - the yearly published SOR rate, one row per sor_year
 *   material_rate_monthly  - the monthly G.O. circulars, one row per month issued
 * A disagreement between them is normal; the monthly circular wins for its month.
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

const MONTHLY_TABLE = 'material_rate_monthly'
const YEARLY_TABLE = 'material_rate'
const ALIAS_TABLE = 'ssr_material_alias'

/**
 * Must stay byte-identical to the SQL that seeded ssr_material_alias:
 *   lower(regexp_replace(trim(desc), '\s+', ' ', 'g'))
 */
export function normalizeMaterialDesc(description: string): string {
  return description.trim().replace(/\s+/g, ' ').toLowerCase()
}

function tonneFactor(unit: string): number | null {
  const text = unit.trim().toLowerCase().replace(/\./g, '')
  if (/^(t|mt|ton|tons|tonne|tonnes|metric ton|metric tons)$/.test(text)) return 1000
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
let periodsCache: Promise<MaterialRatePeriod[]> | null = null
let aliasCache: Promise<Map<string, string>> | null = null

export function invalidateMaterialRateCache(): void {
  materialsCache = null
  periodsCache = null
  aliasCache = null
}

export async function fetchMonthlyMaterials(): Promise<MonthlyMaterial[]> {
  if (!materialsCache) {
    materialsCache = (async () => {
      const { data, error } = await supabase
        .from('material')
        .select('material_code, name, unit, category')
        .eq('update_frequency', 'MONTHLY')
        .order('category')
        .order('material_code')
      if (error) throw error
      return (data ?? []).map((row) => ({
        materialCode: String(row.material_code ?? ''),
        name: String(row.name ?? ''),
        unit: String(row.unit ?? ''),
        category: String(row.category ?? '')
      }))
    })().catch((reason) => {
      materialsCache = null
      throw reason
    })
  }
  return materialsCache
}

export async function fetchMaterialRatePeriods(): Promise<MaterialRatePeriod[]> {
  if (!periodsCache) {
    periodsCache = (async () => {
      const { data, error } = await supabase
        .from(MONTHLY_TABLE)
        .select('material_code, rate, effective_from, effective_to, sor_year, source')
        .order('effective_from', { ascending: false })
      if (error) throw error
      return (data ?? []).map((row) => ({
        materialCode: String(row.material_code ?? ''),
        rate: Number(row.rate ?? 0),
        effectiveFrom: String(row.effective_from ?? ''),
        effectiveTo: row.effective_to ? String(row.effective_to) : null,
        sorYear: String(row.sor_year ?? ''),
        source: String(row.source ?? '')
      }))
    })().catch((reason) => {
      periodsCache = null
      throw reason
    })
  }
  return periodsCache
}

export async function fetchMaterialAliases(): Promise<Map<string, string>> {
  if (!aliasCache) {
    aliasCache = (async () => {
      const { data, error } = await supabase
        .from(ALIAS_TABLE)
        .select('desc_normalized, material_code')
      if (error) throw error
      const map = new Map<string, string>()
      for (const row of data ?? []) {
        map.set(String(row.desc_normalized ?? ''), String(row.material_code ?? ''))
      }
      return map
    })().catch((reason) => {
      aliasCache = null
      throw reason
    })
  }
  return aliasCache
}

export async function fetchYearlyMaterialRates(
  sorYear: string
): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from(YEARLY_TABLE)
    .select('material_code, rate')
    .eq('sor_year', sorYear)
  if (error) throw error
  const map = new Map<string, number>()
  for (const row of data ?? []) {
    map.set(String(row.material_code ?? ''), Number(row.rate ?? 0))
  }
  return map
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
        line.materialCode ?? aliases.get(normalizeMaterialDesc(line.description))
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
    } else if (item.categoryKey === 'material') {
      add(code, { code, description, source: 'SOR' })
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
          line.materialCode ?? aliases.get(normalizeMaterialDesc(line.description))
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
        const materialCode = aliases.get(normalizeMaterialDesc(description))
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
      const code = line.materialCode ?? aliases.get(normalizeMaterialDesc(line.description))
      if (code) codes.add(code)
    }
  }
  if (recipe.itemSource === 'SOR' && recipe.categoryKey === 'material' && recipe.itemCode) {
    codes.add(recipe.itemCode)
  }
  return Array.from(codes)
}
