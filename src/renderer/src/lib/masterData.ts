import type { MorthSelection } from '../types/individualCosts'
import { supabase } from './supabase'
import { normalizePlaceNameOrNull } from './placeNormalization'
import type {
  ConveyanceClass,
  DataVariantSelection,
  ProjectAreaAllowance,
  ProjectLocation,
  SorCatalogueItemSelection,
  SorZone
} from '../types/project'

// ---------------------------------------------------------------------------
// SSR work categories. Current SOR navigation lives in sorSource.ts.
// ---------------------------------------------------------------------------

export interface SsrCategory {
  key: string
  label: string
}

export const SSR_CATEGORIES: SsrCategory[] = [
  { key: 'IRR-TAW', label: 'TAW' },
  { key: 'IRR-DAW', label: 'DAW' },
  { key: 'IRR-CAW', label: 'CAW' },
  { key: 'IRR-GAW', label: 'GAW' },
  { key: 'IRR-CCDW', label: 'CCDW' },
  { key: 'IRR-PMW', label: 'PMW' }
]

export interface MasterItem {
  /** Source side. */
  side: 'SSR' | 'SOR' | 'MORTH'
  /** Source category, e.g. 'IRR-TAW' or 'SOR_Recipie'. */
  category: string
  /** Stable identity of the source row. */
  code: string
  /** Display text (description for SSR, name for SOR). */
  description: string
  /** Published SSR section heading that introduces this item, when provided. */
  sectionHeading?: string
  unit: string | null
  /** Set by the add-DATA variant review step. */
  dataVariant?: DataVariantSelection
  /** Exact current SOR recipe, annual quote and configured variant snapshot. */
  morth?: MorthSelection
  sorCatalogue?: SorCatalogueItemSelection
  /** Authoritative Lead decision stored on the selected SOR resource. */
  lead?: {
    applicable: boolean
    conveyanceClass?: ConveyanceClass
    materialName?: string
  }
}

const itemCache = new Map<string, Promise<MasterItem[]>>()
let sorYearsCache: Promise<string[]> | null = null
const SSR_ITEM_TABLE = 'ssr_item'
const SSR_YEAR_TABLE = 'ssr_year'
const CACHE_PREFIX = 'eestimate:master:v4:'
const CACHE_TTL_MS = 6 * 60 * 60 * 1000

/**
 * Catalogues held in memory at once, per cache.
 *
 * These maps used to grow for the whole session: every SSR and SOR category
 * opened, and every rate table for every year/zone combination looked at,
 * stayed resident whether or not it was wanted again. Evicting is close to free
 * because every consumer goes through `cachedPersistent`, so a miss is a
 * `JSON.parse` out of localStorage rather than a Supabase round trip — the
 * network is only touched again once the six-hour TTL has expired anyway.
 */
const MAX_CACHED_CATALOGUES = 24

/** Entries still in flight are never evicted: dropping one duplicates a fetch. */
const settled = new WeakSet<Promise<unknown>>()

function evictOldest<T>(cache: Map<string, Promise<T>>): void {
  if (cache.size <= MAX_CACHED_CATALOGUES) return
  for (const [key, entry] of cache) {
    if (!settled.has(entry)) continue
    cache.delete(key)
    return
  }
}

function cached<T>(cache: Map<string, Promise<T>>, key: string, load: () => Promise<T>): Promise<T> {
  const existing = cache.get(key)
  if (existing) {
    // Re-insert so Map iteration order is least-recently-used first.
    cache.delete(key)
    cache.set(key, existing)
    return existing
  }
  const pending = load().catch((error) => {
    cache.delete(key)
    throw error
  })
  void pending.then(
    () => settled.add(pending),
    () => undefined
  )
  cache.set(key, pending)
  evictOldest(cache)
  return pending
}

function readPersistent<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}${key}`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { cachedAt: number; value: T }
    if (!parsed.cachedAt || Date.now() - parsed.cachedAt > CACHE_TTL_MS) {
      localStorage.removeItem(`${CACHE_PREFIX}${key}`)
      return null
    }
    return parsed.value
  } catch {
    return null
  }
}

function writePersistent<T>(key: string, value: T): void {
  try {
    localStorage.setItem(
      `${CACHE_PREFIX}${key}`,
      JSON.stringify({ cachedAt: Date.now(), value })
    )
  } catch {
    // Memory caching still works if storage is unavailable or full.
  }
}

function cachedPersistent<T>(
  cache: Map<string, Promise<T>>,
  key: string,
  load: () => Promise<T>
): Promise<T> {
  return cached(cache, key, async () => {
    const stored = readPersistent<T>(key)
    if (stored !== null) return stored
    const value = await load()
    writePersistent(key, value)
    return value
  })
}

// Supabase caps a single response at 1000 rows; paginate to fetch everything.
async function fetchAllRows(
  table: string,
  columns: string,
  orderCol: string,
  filter?: { column: string; value: string }
): Promise<Record<string, unknown>[]> {
  const pageSize = 1000
  let from = 0
  const out: Record<string, unknown>[] = []
  for (;;) {
    let query = supabase.from(table).select(columns)
    if (filter) query = query.eq(filter.column, filter.value)
    const { data, error } = await query
      .order(orderCol, { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw error
    const rows = (data ?? []) as unknown as Record<string, unknown>[]
    out.push(...rows)
    if (rows.length < pageSize) break
    from += pageSize
  }
  return out
}

export async function fetchSsrItems(categoryKey: string): Promise<MasterItem[]> {
  const cat = SSR_CATEGORIES.find((c) => c.key === categoryKey)
  if (!cat) return []
  return cachedPersistent(itemCache, `items:SSR:${categoryKey}`, async () => {
    const rows = await fetchAllRows(
      SSR_ITEM_TABLE,
      'code, description, section_heading, unit',
      'code',
      { column: 'subject', value: cat.key }
    )
    return rows
      .map((r) => ({
        side: 'SSR' as const,
        category: SSR_ITEM_TABLE,
        code: String(r.code ?? ''),
        description: String(r.description ?? ''),
        sectionHeading: String(r.section_heading ?? '').trim() || undefined,
        unit: (r.unit as string) ?? null
      }))
      .sort((a, b) => a.description.localeCompare(b.description))
  })
}

// ---------------------------------------------------------------------------
// SOR/SSR years and location flags.
// ---------------------------------------------------------------------------

export async function fetchSorYears(): Promise<string[]> {
  if (!sorYearsCache) {
    sorYearsCache = (async () => {
      const [allowanceRows, ssrRows, sorRows] = await Promise.all([
        fetchAllRows('allowance_rule', 'sor_year', 'sor_year'),
        fetchAllRows(SSR_YEAR_TABLE, 'year', 'year'),
        fetchAllRows('SOR_Year', 'year', 'year')
      ])
      const years = Array.from(
        new Set(
          [
            ...allowanceRows.map((r) => String(r.sor_year ?? '')),
              ...ssrRows.map((r) => String(r.year ?? '')),
              ...sorRows.map((r) => String(r.year ?? ''))
          ].filter((year): year is string => Boolean(year))
        )
      )
      years.sort().reverse()
      writePersistent('sor-years', years)
      return years
    })().catch((error) => {
      sorYearsCache = null
      throw error
    })
  }
  const years = await sorYearsCache
  // Years are a small changing list. Refresh it whenever the form is reopened so a
  // newly uploaded SOR year is not hidden behind the long-lived master-data cache.
  sorYearsCache = null
  return years
}

function labelize(t: string): string {
  if (t === 'GHMC') return 'GHMC'
  return t
    .split('_')
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ')
}

interface AllowanceAtRow {
  allowance_type: string | null
  name: string | null
  mandal: string | null
  district: string | null
  go_reference: string | null
}

export interface VillageLocationDetails {
  village: string | null
  mandal: string | null
  district: string | null
}

export interface AllowanceRuleRow {
  allowance_type: string
  value: number | string
  value_type: string
  description: string | null
  tier: string | null
  sor_year: string
  go_reference: string | null
  applies_to: string[] | null
}

export function allowanceTypeLabel(type: string): string {
  if (type === 'GHMC') return 'Greater Hyderabad (GHMC) area allowance'
  if (type === 'CORPORATION') return 'Municipal Corporation area allowance'
  if (type === 'MUNICIPALITY') return 'Municipality / District HQ area allowance'
  if (type === 'INDUSTRIAL') return 'Notified Industrial Area allowance'
  if (type === 'AGENCY_TRIBAL') return 'Agency / Tribal area allowance'
  return labelize(type)
}

async function allowancePlaceAt(location: ProjectLocation): Promise<AllowanceAtRow | undefined> {
  const { data, error } = await supabase.rpc('fn_allowance_at', {
    p_lng: location.lng,
    p_lat: location.lat
  })
  if (error) throw error
  return ((data ?? []) as AllowanceAtRow[])[0]
}

/** Read the village, mandal and district normalized in Title Case from village_allowance. */
export async function resolveVillageLocation(
  location: ProjectLocation
): Promise<VillageLocationDetails> {
  const place = await allowancePlaceAt(location)
  return {
    village: normalizePlaceNameOrNull(place?.name),
    mandal: normalizePlaceNameOrNull(place?.mandal),
    district: normalizePlaceNameOrNull(place?.district)
  }
}

/** Resolve the labour area allowance from the project coordinate and annual rule table. */
export async function resolveAreaAllowance(
  location: ProjectLocation,
  sorYear: string,
  /** Undefined keeps spatial auto-detection; null explicitly selects no allowance. */
  manualType?: string | null
): Promise<ProjectAreaAllowance> {
  const place = await allowancePlaceAt(location)
  const allowanceType = manualType === undefined ? place?.allowance_type ?? null : manualType
  const source = manualType === undefined ? 'automatic' : 'manual'
  const village = normalizePlaceNameOrNull(place?.name)
  const mandal = normalizePlaceNameOrNull(place?.mandal)
  const district = normalizePlaceNameOrNull(place?.district)
  if (!allowanceType) {
    return {
      type: null,
      label: source === 'manual' ? 'No area allowance (manual)' : 'No location-based area allowance',
      percent: 0,
      village,
      mandal,
      district,
      goReference: place?.go_reference ?? null,
      ruleYear: sorYear || null,
      source
    }
  }

  const select =
    'allowance_type,value,value_type,description,tier,sor_year,go_reference,applies_to'
  const exact = await supabase
    .from('allowance_rule')
    .select(select)
    .eq('allowance_type', allowanceType)
    .eq('sor_year', sorYear)
    .eq('value_type', 'PERCENTAGE')

  if (exact.error) throw exact.error
  let rules = (exact.data ?? []) as unknown as AllowanceRuleRow[]

  // A newly selected SOR year may precede its allowance upload. Keep the location
  // classification and use the latest published labour rule instead of silently
  // dropping the allowance.
  if (!rules.length) {
    const latest = await supabase
      .from('allowance_rule')
      .select(select)
      .eq('allowance_type', allowanceType)
      .eq('value_type', 'PERCENTAGE')
      .order('sor_year', { ascending: false })
    if (latest.error) throw latest.error
    const all = (latest.data ?? []) as unknown as AllowanceRuleRow[]
    const latestYear = all[0]?.sor_year
    rules = latestYear ? all.filter((rule) => rule.sor_year === latestYear) : []
  }

  const labourRules = rules.filter(
    (rule) => !rule.applies_to?.length || rule.applies_to.includes('LABOUR_COMPONENT')
  )
  const rule = [...labourRules].sort((a, b) => Number(b.value) - Number(a.value))[0]
  const percent = rule ? Number(rule.value) : 0

  return {
    type: allowanceType,
    label: allowanceTypeLabel(allowanceType),
    percent: Number.isFinite(percent) ? percent : 0,
    tier: rule?.tier ?? null,
    description: rule?.description ?? null,
    village,
    mandal,
    district,
    ruleYear: rule?.sor_year ?? sorYear ?? null,
    goReference: rule?.go_reference ?? place?.go_reference ?? null,
    source
  }
}
