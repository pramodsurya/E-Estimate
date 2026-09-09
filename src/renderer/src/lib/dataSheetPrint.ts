/** Native Typst DATA Dashboard PDF compilation. */
import { supabase } from './supabase'
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

  const download = (objectPath: string): Promise<string | null> => {
    const existing = downloads.get(objectPath)
    if (existing) return existing
    const pending = supabase.storage.from('ssr-figures').download(objectPath).then(async ({ data, error }) => {
      if (error || !data) return null
      return blobToDataUrl(data)
    })
    downloads.set(objectPath, pending)
    return pending
  }

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
      const data = await download(figure.objectPath)
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
  const result = await window.api.typst.compile(
    resolvedDataTypstSource(project),
    dataSheetsCompileInputs(sheets, {
      projectName: project.meta.name,
      sorYear: project.meta.sorYear,
      sorZone: project.meta.sorZone,
      pageSize: geometry.pageSize,
      orientation: geometry.orientation,
      fontScale: geometry.fontScale,
      figurePaths,
      signature: dataSignatureSettings(project)
    }),
    shadowFiles
  )
  if (!result.ok || !result.data) {
    throw new Error(result.error ?? 'Could not compile the DATA Dashboard Typst document.')
  }
  return decodeBase64(result.data)
}
