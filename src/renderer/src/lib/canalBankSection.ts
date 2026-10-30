import type { CanalData, CanalPoint, CanalSection } from '../types/project'
import { buildCanalBankSectionInput, buildCanalBankExportInput } from './canalBankExport'
import { canalSuitableBankExcavation } from './canal'

export interface BankSectionShape { key: string; label: string; points: CanalPoint[] }
export interface BankSectionMeasurement {
  foundationWidth: number
  automaticFilterLength: number
  blanketRanges: Array<[number, number]>
  values: Record<string, number>
  grossFill: number
  deductedFill: number
  shapes: BankSectionShape[]
  fillPolygons: CanalPoint[][]
  strippingPolygons: CanalPoint[][]
  slopeSegments: CanalPoint[][]
  bermSegments: CanalPoint[][]
  outerSlopeLength: number
  bermShelfWidth: number
}
export interface BankSectionWork { key: string; label: string; code: string; block: string; sectionUnit: string; unit: string }
export interface BankSectionResult {
  design: CanalPoint[]
  ground: CanalPoint[]
  banks: BankSectionMeasurement[]
  works: BankSectionWork[]
  cutting: number
  grossFill: number
  netFill: number
  cutPolygons: CanalPoint[][]
  cutPolygonAreas: number[]
  errors: string[]
}
interface Engine {
  memory: WebAssembly.Memory
  canal_alloc(length: number): number
  canal_free(pointer: number, length: number): void
  canal_section(pointer: number, length: number): bigint
}
const runtime = globalThis as typeof globalThis & { __canalSectionEngine?: Engine }
export function initializeCanalSectionEngine(bytes: BufferSource): void {
  runtime.__canalSectionEngine = new WebAssembly.Instance(new WebAssembly.Module(bytes), {}).exports as unknown as Engine
}
function engine(): Engine {
  // Node/SSR tests load the compiled Rust module without a browser bootstrap.
  // This branch never runs in the desktop WebView or browser bundle.
  if (!runtime.__canalSectionEngine) {
    const host = globalThis as typeof globalThis & { process?: { cwd(): string; getBuiltinModule?(name: string): unknown } }
    const nodeModule = host.process?.getBuiltinModule?.('node:module') as { createRequire(path: string): (name: string) => unknown } | undefined
    nodeModule?.createRequire(`${host.process!.cwd()}/package.json`)('./scripts/canal-section-engine-runtime.cjs')
  }
  if (!runtime.__canalSectionEngine) throw new Error('The canal section engine has not loaded.')
  return runtime.__canalSectionEngine
}
const caches = new WeakMap<CanalData, Map<string, BankSectionResult>>()
function callEngine<T>(json: string): T {
  const wasm = engine(), source = new TextEncoder().encode(json)
  const pointer = wasm.canal_alloc(source.length)
  let resultPointer = 0, resultLength = 0
  try {
    new Uint8Array(wasm.memory.buffer, pointer, source.length).set(source)
    const packed = wasm.canal_section(pointer, source.length)
    resultPointer = Number(packed & 0xffffffffn); resultLength = Number(packed >> 32n)
    const result = JSON.parse(new TextDecoder().decode(new Uint8Array(wasm.memory.buffer, resultPointer, resultLength))) as { data?: T; error?: string }
    if (!result.data) throw new Error(result.error ?? 'Cannot measure the canal section.')
    return result.data
  } finally {
    wasm.canal_free(pointer, source.length)
    if (resultPointer) wasm.canal_free(resultPointer, resultLength)
  }
}
/** One Rust result owns the diagram polygons and every measured section value. */
export function measureCanalBankSection(data: CanalData, section: CanalSection): BankSectionResult {
  const input = buildCanalBankSectionInput(data, section)
  const json = JSON.stringify(input)
  const cache = caches.get(data) ?? new Map<string, BankSectionResult>()
  const saved = cache.get(json)
  if (saved) return saved
  const result = callEngine<BankSectionResult>(json)
  if (cache.size >= 4096) cache.clear()
  cache.set(json, result); caches.set(data, cache)
  return result
}
export interface BankQuantityRow { from: number; to: number; side: 'left' | 'right'; reachId: string; profileId: string; quantities: Record<string, number>; grossFill: number; cutting: number }
export interface BankQuantityResult { rows: BankQuantityRow[]; works: BankSectionWork[]; errors: string[] }
const quantityCaches = new WeakMap<CanalData, Map<string, BankQuantityResult>>()
export function measureCanalBankQuantities(data: CanalData, boundaries: number[] = []): BankQuantityResult {
  const input = buildCanalBankExportInput(data, { strict: false, boundaries })
  const json = JSON.stringify({ operation: 'quantities', input })
  const cache = quantityCaches.get(data) ?? new Map<string, BankQuantityResult>()
  const saved = cache.get(json)
  if (saved) return saved
  const result = callEngine<BankQuantityResult>(json)
  if (cache.size > 50) cache.clear()
  cache.set(json, result); quantityCaches.set(data, cache)
  return result
}
export function openSectionPolygon(points: CanalPoint[]): CanalPoint[] {
  const last = points.at(-1)
  return points.length > 2 && last?.offset === points[0].offset && last.rl === points[0].rl ? points.slice(0, -1) : points
}

/** Reach abstract consumes the same Rust interval quantities as the workbook. */
export function canalBankReachSummary(data: CanalData) {
  const result = measureCanalBankQuantities(data)
  if (result.errors.length) throw new Error(result.errors.join(' '))
  const intervals = new Map<string, BankQuantityRow[]>()
  for (const row of result.rows) { const key = `${row.from}:${row.to}`; const rows = intervals.get(key) ?? []; rows.push(row); intervals.set(key, rows) }
  const tiers = [...(data.design.bankConfig?.leftTiers ?? []), ...(data.design.bankConfig?.rightTiers ?? [])]
  const reaches: Array<{ reachIndex: number; tierName: string; fromChainage: number; toChainage: number; length: number; sectionCount: number; leftVolume: number; rightVolume: number; strippingVolume: number; totalBankVolume: number; isPureCut: boolean; identity: string }> = []
  for (const rows of intervals.values()) {
    const a = rows[0], identity = rows.map(row => `${row.side}:${row.reachId}`).join('|')
    const fill = (row: BankQuantityRow) => ['filling', 'hearting', 'casing'].reduce((sum, key) => sum + (row.quantities[key] ?? 0), 0)
    const left = rows.filter(row => row.side === 'left').reduce((sum, row) => sum + fill(row), 0)
    const right = rows.filter(row => row.side === 'right').reduce((sum, row) => sum + fill(row), 0)
    const stripping = rows.reduce((sum, row) => sum + (row.quantities.stripping ?? 0), 0)
    const isPureCut = rows.every(row => row.grossFill <= 1e-8)
    const last = reaches.at(-1)
    if (last && last.identity === identity && last.isPureCut === isPureCut && last.toChainage === a.from) {
      last.toChainage = a.to; last.length += a.to - a.from; last.sectionCount++; last.leftVolume += left; last.rightVolume += right; last.strippingVolume += stripping; last.totalBankVolume += left + right
    } else {
      const names = [...new Set(rows.map(row => tiers.find(tier => tier.id === row.profileId)?.name ?? 'Fixed bank design'))]
      reaches.push({ identity, reachIndex: reaches.length + 1, tierName: isPureCut ? 'Full cutting' : names.join(' / '), fromChainage: a.from, toChainage: a.to, length: a.to - a.from, sectionCount: 2, leftVolume: left, rightVolume: right, strippingVolume: stripping, totalBankVolume: left + right, isPureCut })
    }
  }
  const sum = (key: string) => result.rows.reduce((total, row) => total + (row.quantities[key] ?? 0), 0)
  const zones = { homogeneous: sum('filling'), hearting: sum('hearting'), casing: sum('casing') }
  const allocated = (source: string) => (data.design.bankMaterialAllocations ?? []).filter(row => row.source === source).reduce((total, row) => total + zones[row.zone] * row.percentage / 100, 0)
  return { reaches, sections: data.sections.filter(section => section.designPopulated !== false && section.ground.length >= 2),
    totalHomogeneousVolume: zones.homogeneous, totalHeartingVolume: zones.hearting, totalCasingVolume: zones.casing,
    soilAllocation: { suitableCutAvailableM3: canalSuitableBankExcavation(data), allocatedFromCutM3: allocated('canal-excavation'), allocatedFromBorrowM3: allocated('borrow-area') },
    totalLeftBankVolume: reaches.reduce((sum, row) => sum + row.leftVolume, 0), totalRightBankVolume: reaches.reduce((sum, row) => sum + row.rightVolume, 0),
    totalStrippingVolume: reaches.reduce((sum, row) => sum + row.strippingVolume, 0), totalBankVolume: reaches.reduce((sum, row) => sum + row.totalBankVolume, 0) }
}
