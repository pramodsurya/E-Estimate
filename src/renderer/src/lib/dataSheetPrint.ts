/** Native Typst DATA Dashboard PDF compilation. */
import { supabase } from './supabase'
import { contentHash, createBoundedCache, figureCacheKey, type BoundedCache, type FigureRefLike } from './typist-output/compileCache'
import type { DataSheet } from './dataSheets'
import type { EestimateProject, Margins, Orientation, PaperSize } from '../types/project'
import {
  dataSheetsCompileInputs,
  dataSignatureSettings,
  resolvedDataTypstSource
} from './typist-output/dataTypst'

export interface DataSheetPrintGeometry {
  pageSize: PaperSize
  orientation: Orientation
  margins: Margins
  fontScale: number
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_')
}

function extensionOf(dataUrl: string): string {
  const mime = /^data:image\/([^;]+);base64,/i.exec(dataUrl)?.[1]?.toLowerCase()
  if (mime === 'jpeg' || mime === 'jpg') return 'jpg'
  if (mime === 'svg+xml') return 'svg'
  if (mime === 'webp') return 'webp'
  return 'png'
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string'
      ? resolve(reader.result)
      : reject(new Error('The published figure could not be encoded.'))
    reader.onerror = () => reject(reader.error ?? new Error('The published figure could not be read.'))
    reader.readAsDataURL(blob)
  })
}

/**
 * Downloaded figure bytes, keyed by objectPath plus the strongest version signal
 * available on the figure (updatedAt, else size, else the app figureVersion token;
 * `unversioned` while the schema carries none). A key match is never refetched.
 */
const figureBytesCache: BoundedCache<string> = createBoundedCache<string>({
  maxEntries: 40,
  maxBytes: 64 * 1024 * 1024
})

/** Compiled DATA PDFs, keyed by contentHash (INVALIDATION spec). Few entries, capped bytes. */
const dataSheetsPdfCache: BoundedCache<string> = createBoundedCache<string>({
  maxEntries: 3,
  maxBytes: 24 * 1024 * 1024
})

/**
 * Fresh modification stamps for stored figures, one cheap `list()` per folder.
 * A figure replaced remotely at the same path carries a new `updated_at`,
 * which flows into the figure-cache key — so a remote edit can never serve
 * stale cached bytes. A failed listing (offline) falls back to last-known
 * bytes and is reported by the caller.
 */
async function figureUpdatedAtByPath(objectPaths: string[]): Promise<Map<string, string>> {
  const byPath = new Map<string, string>()
  const dirs = new Map<string, string[]>()
  for (const objectPath of objectPaths) {
    const slash = objectPath.lastIndexOf('/')
    const dir = slash < 0 ? '' : objectPath.slice(0, slash)
    const name = slash < 0 ? objectPath : objectPath.slice(slash + 1)
    const bucket = dirs.get(dir)
    if (bucket) bucket.push(name)
    else dirs.set(dir, [name])
  }
  for (const [dir, names] of dirs) {
    try {
      const { data, error } = await supabase.storage.from('ssr-figures').list(dir || undefined, { limit: 1000 })
      if (error || !data) continue
      const wanted = new Set(names)
      for (const entry of data) {
        if (wanted.has(entry.name) && entry.updated_at) {
          byPath.set(dir ? `${dir}/${entry.name}` : entry.name, entry.updated_at)
        }
      }
    } catch {
      // Offline or denied: caller keeps last-known bytes for this folder.
    }
  }
  return byPath
}

export async function buildDataFigureBundle(
  sheets: DataSheet[],
  onPhase: (detail: string) => void
): Promise<{
  shadowFiles: Record<string, string>
  figurePaths: Record<string, Array<{ path: string; caption: string }>>
}> {
  const shadowFiles: Record<string, string> = {}
  const figurePaths: Record<string, Array<{ path: string; caption: string }>> = {}
  const downloads = new Map<string, Promise<string | null>>()

  const download = (objectPath: string, figure?: FigureRefLike): Promise<string | null> => {
    const key = figureCacheKey(objectPath, figure)
    const cached = figureBytesCache.get(key)
    if (cached !== undefined) return Promise.resolve(cached)
    const existing = downloads.get(key)
    if (existing) return existing
    const pending = supabase.storage.from('ssr-figures').download(objectPath).then(async ({ data, error }) => {
      if (error || !data) return null
      const dataUrl = await blobToDataUrl(data)
      figureBytesCache.set(key, dataUrl, dataUrl.length)
      return dataUrl
    })
    downloads.set(key, pending)
    return pending
  }

  const updatedAtByPath = await figureUpdatedAtByPath(
    sheets.flatMap((sheet) => (sheet.recipe.sourceFigures ?? []).map((figure) => figure.objectPath))
  )
  for (const sheet of sheets) {
    const figures: Array<{ data: string; caption: string; identity: string }> = []
    if (sheet.recipe.projectDataImageUrl) {
      figures.push({
        data: sheet.recipe.projectDataImageUrl,
        caption: 'Estimator-supplied DATA figure',
        identity: 'project-data'
      })
    }
    for (const figure of [...(sheet.recipe.sourceFigures ?? [])].sort((a, b) => a.sequence - b.sequence)) {
      const stampedAt = updatedAtByPath.get(figure.objectPath)
      const data = await download(
        figure.objectPath,
        stampedAt === undefined ? figure : { ...figure, updatedAt: stampedAt }
      )
      if (!data) continue
      figures.push({
        data,
        caption: [figure.page ? `Published source page ${figure.page}` : 'Published source figure', figure.after].filter(Boolean).join(' — '),
        identity: figure.key
      })
    }
    figurePaths[sheet.id] = figures.map((figure, index) => {
      const path = `/__eestimate_data/${safeName(sheet.id)}-${index}-${safeName(figure.identity)}.${extensionOf(figure.data)}`
      shadowFiles[path] = figure.data
      return { path, caption: figure.caption }
    })
  }
  onPhase(downloads.size > 0 ? `embedded ${downloads.size} published figure(s)` : 'no published figures to embed')
  return { shadowFiles, figurePaths }
}

export async function buildDataSheetsPrintPdf({
  project,
  sheets,
  geometry,
  onPhase = () => undefined
}: {
  project: EestimateProject
  sheets: DataSheet[]
  geometry: DataSheetPrintGeometry
  onPhase?: (detail: string) => void
}): Promise<Uint8Array> {
  if (sheets.length === 0) throw new Error('No compiled SSR/SOR code sheet is available to print.')

  onPhase('preparing DATA figures')
  const { shadowFiles, figurePaths } = await buildDataFigureBundle(sheets, onPhase)
  onPhase(`compiling ${sheets.length} DATA sheet${sheets.length === 1 ? '' : 's'} with Typst`)
  const mainContent = resolvedDataTypstSource(project)
  const inputs = dataSheetsCompileInputs(sheets, {
    projectName: project.meta.name,
    sorYear: project.meta.sorYear,
    sorZone: project.meta.sorZone,
    pageSize: geometry.pageSize,
    orientation: geometry.orientation,
    fontScale: geometry.fontScale,
    figurePaths,
    signature: dataSignatureSettings(project)
  })
  const cacheKey = contentHash({
    mainContent,
    inputs,
    shadowFiles,
    figureRefs: sheets.flatMap((sheet) => sheet.recipe.sourceFigures ?? [])
  })
  const cachedPdf = dataSheetsPdfCache.get(cacheKey)
  if (cachedPdf !== undefined && cachedPdf.length > 0) return decodeBase64(cachedPdf)
  const result = await window.api.typst.compile(mainContent, inputs, shadowFiles, {
    contentHash: cacheKey
  })
  if (!result.ok || !result.data) {
    throw new Error(result.error ?? 'Could not compile the DATA Dashboard Typst document.')
  }
  dataSheetsPdfCache.set(cacheKey, result.data, result.data.length)
  return decodeBase64(result.data)
}
