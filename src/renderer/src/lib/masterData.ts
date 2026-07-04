import { supabase } from './supabase'

// ---------------------------------------------------------------------------
// Category definitions. SSR = the 6 "works" tables. SOR = the basic-rate tables.
// See memory: ssr-sor-data-model.
// ---------------------------------------------------------------------------

export interface SsrCategory {
  key: string
  label: string
}

export interface SorCategory {
  key: string
  label: string
  codeCol: string
  nameCol: string
}

export const SSR_CATEGORIES: SsrCategory[] = [
  { key: 'IRR-TAW', label: 'TAW' },
  { key: 'IRR-DAW', label: 'DAW' },
  { key: 'IRR-CAW', label: 'CAW' },
  { key: 'IRR-GAW', label: 'GAW' },
  { key: 'IRR-CCDW', label: 'CCDW' },
  { key: 'IRR-PMW', label: 'PMW' }
]

export const SOR_CATEGORIES: SorCategory[] = [
  { key: 'material', label: 'Material', codeCol: 'material_code', nameCol: 'name' },
  { key: 'labour', label: 'Labour', codeCol: 'labour_code', nameCol: 'name' },
  { key: 'machinery', label: 'Machinery', codeCol: 'machinery_code', nameCol: 'name' },
  { key: 'plumbing', label: 'Plumbing', codeCol: 'plumbing_code', nameCol: 'name' },
  { key: 'electrical', label: 'Electrical', codeCol: 'elec_code', nameCol: 'name' },
  { key: 'civil', label: 'Civil', codeCol: 'civil_code', nameCol: 'name' }
]

export interface MasterItem {
  /** Source side. */
  side: 'SSR' | 'SOR'
  /** Source table key, e.g. 'taw' or 'material'. */
  category: string
  /** Stable identity of the source row. */
  code: string
  /** Display text (description for SSR, name for SOR). */
  description: string
  unit: string | null
}

const itemCache = new Map<string, Promise<MasterItem[]>>()
const flagsCache = new Map<string, Promise<FlagDef[]>>()
let sorYearsCache: Promise<string[]> | null = null
const SSR_ITEM_TABLE = 'ssr_item'
const SSR_YEAR_TABLE = 'ssr_year'
const CACHE_PREFIX = 'eestimate:master:v2:'
const CACHE_TTL_MS = 6 * 60 * 60 * 1000

function cached<T>(cache: Map<string, Promise<T>>, key: string, load: () => Promise<T>): Promise<T> {
  const existing = cache.get(key)
  if (existing) return existing
  const pending = load().catch((error) => {
    cache.delete(key)
    throw error
  })
  cache.set(key, pending)
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
      'code, description, unit',
      'code',
      { column: 'subject', value: cat.key }
    )
    return rows
      .map((r) => ({
        side: 'SSR' as const,
        category: SSR_ITEM_TABLE,
        code: String(r.code ?? ''),
        description: String(r.description ?? ''),
        unit: (r.unit as string) ?? null
      }))
      .sort((a, b) => a.description.localeCompare(b.description))
  })
}

export async function fetchSorItems(categoryKey: string): Promise<MasterItem[]> {
  const cat = SOR_CATEGORIES.find((c) => c.key === categoryKey)
  if (!cat) return []
  return cachedPersistent(itemCache, `items:SOR:${categoryKey}`, async () => {
    const rows = await fetchAllRows(cat.key, `${cat.codeCol}, ${cat.nameCol}, unit`, cat.codeCol)
    return rows
      .map((r) => ({
        side: 'SOR' as const,
        category: cat.key,
        code: String(r[cat.codeCol] ?? ''),
        description: String(r[cat.nameCol] ?? ''),
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
      const stored = readPersistent<string[]>('sor-years')
      if (stored !== null) return stored
      const [
        { data: allowanceRows, error: allowanceError },
        { data: ssrRows, error: ssrError }
      ] = await Promise.all([
        supabase.from('allowance_rule').select('sor_year'),
        supabase.from(SSR_YEAR_TABLE).select('year')
      ])
      if (allowanceError) throw allowanceError
      if (ssrError) throw ssrError
      const years = Array.from(
        new Set(
          [
            ...(allowanceRows ?? []).map((r) => (r as { sor_year: string }).sor_year),
            ...(ssrRows ?? []).map((r) => (r as { year: string }).year)
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
  return sorYearsCache
}

export interface FlagDef {
  type: string
  label: string
  description: string | null
}

function labelize(t: string): string {
  if (t === 'GHMC') return 'GHMC'
  return t
    .split('_')
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ')
}

export async function fetchFlags(sorYear?: string): Promise<FlagDef[]> {
  return cachedPersistent(flagsCache, `flags:${sorYear ?? '*'}`, async () => {
    let q = supabase.from('allowance_rule').select('allowance_type, description, sor_year')
    if (sorYear) q = q.eq('sor_year', sorYear)
    const { data, error } = await q
    if (error) throw error
    const map = new Map<string, FlagDef>()
    for (const r of (data ?? []) as { allowance_type: string; description: string | null }[]) {
      if (!r.allowance_type || map.has(r.allowance_type)) continue
      map.set(r.allowance_type, {
        type: r.allowance_type,
        label: labelize(r.allowance_type),
        description: r.description ?? null
      })
    }
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label))
  })
}
