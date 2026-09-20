/**
 * Bounded caching + stable hashing for the JS assemble stage of Typst PDF compilation.
 *
 * INVALIDATION (applies to every cached stage):
 *   contentHash = hash(COMPILER_VERSION || stableStringify({ mainContent, inputs })
 *     || sorted shadow files as path + byteLength + hash(bytes)
 *     || figure refs as objectPath + updatedAt/size/version).
 * Any edit in any of these five directions MUST change the hash: the compiler
 * version feeds the preimage, mainContent/inputs feed it via stableStringify,
 * every shadow path plus its payload length and payload hash feeds it, and every
 * figure ref feeds it via objectPath plus its version signal.
 *
 * Cache discipline: a hit is served only after the caller verifies the stored
 * output is still usable (non-empty; the JS side owns no files). When in doubt,
 * miss and recompile. All caches here are bounded (entry + byte caps, oldest
 * evicted first) with best-effort cleanup. This module is dependency-free and
 * exported for tests.
 */

/** Desktop Typst engine version (see `src-tauri/src/typst_compile.rs`: `typst = "0.15.1"`). Bump on engine upgrades. */
export const COMPILER_VERSION = 'typst:0.15.1'

/** Deterministic JSON for JSON-compatible values (object keys sorted recursively). */
export function stableStringify(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'string') return JSON.stringify(value) ?? 'null'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'bigint') return JSON.stringify(`${value.toString()}#bigint`) ?? 'null'
  if (typeof value === 'undefined' || typeof value === 'function' || typeof value === 'symbol') return 'null'
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`
  }
  const record = value as Record<string, unknown>
  const parts: string[] = []
  for (const key of Object.keys(record).sort()) {
    const serialized = record[key]
    if (typeof serialized === 'undefined' || typeof serialized === 'function' || typeof serialized === 'symbol') continue
    parts.push(`${JSON.stringify(key)}:${stableStringify(serialized)}`)
  }
  return `{${parts.join(',')}}`
}

function fnv1a32(text: string, seed: number): number {
  let hash = seed >>> 0
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** Non-cryptographic 64-bit change detector (two seeded FNV-1a passes, hex). */
export function hashText64(text: string): string {
  const hi = fnv1a32(`\u0001${text}`, 0x01000193).toString(16).padStart(8, '0')
  const lo = fnv1a32(text, 0x811c9dc5).toString(16).padStart(8, '0')
  return `${hi}${lo}`
}

/** Figure identity as carried by the app today (version fields optional; see below). */
export interface FigureRefLike {
  objectPath: string
  updatedAt?: unknown
  updated_at?: unknown
  size?: unknown
  byteSize?: unknown
  version?: unknown
  figureVersion?: unknown
}

/** Which version signal a figure-cache key was built from (strongest first). */
export type FigureVersionSignalUsed = 'updatedAt' | 'size' | 'figureVersion' | 'unversioned'

const signalText = (value: unknown): string | null => {
  if (typeof value === 'string') return value ? value : null
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

/**
 * Strongest available version signal for one figure: updatedAt, else size, else
 * the app figureVersion token. The current figure schema carries none of these,
 * so keys record `unversioned` (scoped by objectPath) until the schema gains a
 * version field — at which point the key automatically strengthens and old
 * entries miss instead of serving stale bytes.
 */
export function figureVersionSignal(
  figure: FigureRefLike | null | undefined
): { key: string; used: FigureVersionSignalUsed } {
  const updated = signalText(figure?.updatedAt ?? figure?.updated_at)
  if (updated !== null) return { key: `updatedAt:${updated}`, used: 'updatedAt' }
  const size = figure?.size ?? figure?.byteSize
  if (typeof size === 'number' && Number.isFinite(size)) return { key: `size:${size}`, used: 'size' }
  const version = signalText(figure?.figureVersion ?? figure?.version)
  if (version !== null) return { key: `figureVersion:${version}`, used: 'figureVersion' }
  return { key: 'unversioned', used: 'unversioned' }
}

/** Figure-bytes cache key: objectPath plus the strongest version signal found. */
export function figureCacheKey(objectPath: string, figure?: FigureRefLike | null): string {
  return `${objectPath}\n${figureVersionSignal(figure).key}`
}

export interface CompileFingerprint {
  mainContent: string
  inputs: Record<string, string>
  shadowFiles: Record<string, string>
  figureRefs?: FigureRefLike[]
  compilerVersion?: string
}

/** Invalidation hash: all five INVALIDATION directions feed the preimage. */
export function contentHash(fingerprint: CompileFingerprint): string {
  const compiler = fingerprint.compilerVersion ?? COMPILER_VERSION
  const core = stableStringify({ inputs: fingerprint.inputs, mainContent: fingerprint.mainContent })
  const shadows = Object.keys(fingerprint.shadowFiles)
    .sort()
    .map((path) => {
      const payload = fingerprint.shadowFiles[path] as string
      return `${path}\n${payload.length}\n${hashText64(payload)}`
    })
    .join('\n')
  const figures = (fingerprint.figureRefs ?? [])
    .map((figure) => `${figure.objectPath}\n${figureVersionSignal(figure).key}`)
    .sort()
    .join('\n')
  return hashText64(`${compiler}\n\x00\n${core}\n\x00\n${shadows}\n\x00\n${figures}`)
}

export interface BoundedCacheOptions {
  maxEntries: number
  maxBytes: number
}

export interface BoundedCache<T> {
  get(key: string): T | undefined
  set(key: string, value: T, byteLength: number): void
  readonly size: number
  readonly bytes: number
  clear(): void
}

/** Map-backed LRU: reads refresh recency, writes evict oldest past either cap. */
export function createBoundedCache<T>(options: BoundedCacheOptions): BoundedCache<T> {
  const entries = new Map<string, { value: T; bytes: number }>()
  const maxEntries = Math.max(1, Math.floor(options.maxEntries))
  const maxBytes = Math.max(1, Math.floor(options.maxBytes))
  let totalBytes = 0
  const evict = (): void => {
    while (entries.size > maxEntries || totalBytes > maxBytes) {
      const oldest = entries.keys().next()
      if (oldest.done) break
      const victim = entries.get(oldest.value)
      entries.delete(oldest.value)
      totalBytes -= victim?.bytes ?? 0
    }
    if (totalBytes < 0) totalBytes = 0
  }
  return {
    get(key: string): T | undefined {
      const hit = entries.get(key)
      if (!hit) return undefined
      entries.delete(key)
      entries.set(key, hit)
      return hit.value
    },
    set(key: string, value: T, byteLength: number): void {
      const bytes = Math.max(0, Math.floor(byteLength))
      if (bytes > maxBytes) return
      const prior = entries.get(key)
      if (prior) {
        totalBytes -= prior.bytes
        entries.delete(key)
      }
      entries.set(key, { value, bytes })
      totalBytes += bytes
      evict()
    },
    get size(): number {
      return entries.size
    },
    get bytes(): number {
      return totalBytes
    },
    clear(): void {
      entries.clear()
      totalBytes = 0
    }
  }
}
