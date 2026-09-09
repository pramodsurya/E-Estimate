import { toPng } from 'html-to-image'
import type { NormalizedLeadPrintSettings } from './leadPrintLayout'
import type { SignatureFooterSettings } from '../types/project'
import {
  computeLeadMapPageGeometry,
  leadMapCapturePixels,
  LEAD_MAP_TILE_CACHE_PREFIX
} from './leadMapGeometry'
import { waitForMapAssets } from './leadMapAssets'

export const LEAD_MAP_SELECTOR = '.lead-print-map'

export interface LeadMapCaptureResult {
  /** data:image/png;base64,... */
  dataUrl: string
  widthPx: number
  heightPx: number
  /** Remote tiles downloaded into the `.eestimate` for this capture. */
  tileFiles?: Record<string, string>
}

export function formatMapCaptureError(error: unknown): string {
  if (error instanceof Error && error.message && error.message !== '[object Event]') {
    return error.message
  }
  if (typeof Event !== 'undefined' && error instanceof Event) {
    return 'A map tile could not be captured. Wait for the map to finish loading, then Save again.'
  }
  const text = String(error ?? '').trim()
  if (!text || text === '[object Event]' || text === '[object Object]') {
    return 'The route map could not be captured.'
  }
  return text
}

export function stripLeadMapShadowFiles(
  existing: Record<string, string> | undefined,
  pngPath: string
): Record<string, string> | undefined {
  const next: Record<string, string> = {}
  for (const [path, data] of Object.entries(existing ?? {})) {
    if (path.startsWith(LEAD_MAP_TILE_CACHE_PREFIX) || path === pngPath) continue
    next[path] = data
  }
  return Object.keys(next).length ? next : undefined
}

export function mergeLeadMapShadowFiles(
  existing: Record<string, string> | undefined,
  pngDataUrl: string,
  tileFiles: Record<string, string>,
  pngPath: string
): Record<string, string> {
  const next: Record<string, string> = {}
  for (const [path, data] of Object.entries(existing ?? {})) {
    if (path.startsWith(LEAD_MAP_TILE_CACHE_PREFIX) || path === pngPath) continue
    next[path] = data
  }
  Object.assign(next, tileFiles)
  next[pngPath] = pngDataUrl
  return next
}

async function tileCachePath(url: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(url))
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${LEAD_MAP_TILE_CACHE_PREFIX}${hex.slice(0, 32)}`
}

async function downloadRemoteImage(url: string): Promise<string | null> {
  try {
    const result = await window.api.image.embedRemote(url)
    if (result.ok && result.data) return result.data
  } catch {
    /* fall through to the copy already stored in the project */
  }
  return null
}

async function inlineRemoteMapImages(
  root: HTMLElement,
  existingCache: Record<string, string>
): Promise<Record<string, string>> {
  const images = Array.from(root.querySelectorAll('img')).filter((image) => {
    const src = image.currentSrc || image.src
    return /^https?:/i.test(src)
  })
  const tileFiles: Record<string, string> = {}
  if (images.length === 0) return tileFiles

  const byUrl = new Map<string, string>()
  const embed = async (image: HTMLImageElement): Promise<void> => {
    const url = image.currentSrc || image.src
    let dataUrl = byUrl.get(url)
    if (!dataUrl) {
      const path = await tileCachePath(url)
      const downloaded = await downloadRemoteImage(url)
      const cached = existingCache[path]
      if (downloaded) {
        dataUrl = downloaded
        tileFiles[path] = downloaded
      } else if (cached) {
        dataUrl = cached
        tileFiles[path] = cached
      } else {
        throw new Error('A visible map tile could not be downloaded. Check the connection and Fix again.')
      }
      byUrl.set(url, dataUrl)
    }
    image.src = dataUrl
  }

  const batchSize = 6
  for (let index = 0; index < images.length; index += batchSize) {
    await Promise.all(images.slice(index, index + batchSize).map((image) => embed(image)))
  }
  await Promise.all(images.map((image) => {
    if (image.complete && image.naturalWidth > 0) return Promise.resolve()
    return new Promise<void>((resolve) => {
      image.addEventListener('load', () => resolve(), { once: true })
      image.addEventListener('error', () => resolve(), { once: true })
    })
  }))
  return tileFiles
}

export async function captureLeadMapPng(
  pageRoot: HTMLElement | null,
  layout: NormalizedLeadPrintSettings,
  signatureFooter?: SignatureFooterSettings,
  interactive = true,
  existingCache: Record<string, string> = {}
): Promise<LeadMapCaptureResult> {
  if (!pageRoot) throw new Error('The route map page is not ready.')
  const mapElement = pageRoot.querySelector<HTMLElement>(LEAD_MAP_SELECTOR)
  if (!mapElement) throw new Error('The route map frame is not ready.')

  const tileFiles = await inlineRemoteMapImages(mapElement, existingCache)

  const unresolvedTiles = Array.from(mapElement.querySelectorAll<HTMLImageElement>('img.leaflet-tile'))
    .filter((image) => !image.src.startsWith('data:') || !image.complete || image.naturalWidth === 0)
  if (unresolvedTiles.length > 0) {
    throw new Error('The visible map tiles are not fully available. Wait for the map to load and Fix again.')
  }

  const geometry = computeLeadMapPageGeometry(layout, signatureFooter, interactive)
  const { widthPx, heightPx, pixelRatio } = leadMapCapturePixels(geometry, mapElement)

  try {
    const dataUrl = await toPng(mapElement, {
      pixelRatio,
      cacheBust: false,
      includeQueryParams: true,
      skipFonts: true,
      imagePlaceholder:
        'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=',
      style: {
        transform: 'none'
      },
      filter: (node) => {
        if (node instanceof HTMLElement && node.classList.contains('lead-print-map-resize')) {
          return false
        }
        return true
      }
    })
    return { dataUrl, widthPx, heightPx, tileFiles }
  } catch (error) {
    throw new Error(formatMapCaptureError(error))
  }
}

export async function prepareLeadMapForCapture(pageRoot: HTMLElement | null): Promise<void> {
  await waitForMapAssets(pageRoot)
}
