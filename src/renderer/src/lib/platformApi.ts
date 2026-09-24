import type { EestimateApi } from '../types/eestimateApi'
import { R2_TILE_HOST, R2_TILES_DEV_PROXY } from './r2Tiles'
import {
  browserClearRecent,
  browserListRecent,
  browserOpenCluster,
  browserOpenPath,
  browserOpenProject,
  browserSaveCluster,
  browserSaveClusterAs,
  browserSaveProject,
  browserSaveProjectAs
} from './browserProjectIo'

const BROWSER_HINT =
  'Needs the desktop window. Leave npm run dev running until Tauri opens.'

function noopSubscribe(): () => void {
  return () => undefined
}

/**
 * Browser-session image download. R2 tiles have no CORS headers, so they go
 * through the Vite dev proxy (same-origin); other hosts (OSM, Esri) send `*`
 * and are fetched directly. The desktop path never reaches this function.
 */
async function browserEmbedRemote(
  url: string
): Promise<{ ok: boolean; data?: string; error?: string }> {
  let target = url
  try {
    const parsed = new URL(url)
    // Bare /__r2_tiles URLs cannot point anywhere real in a plain browser.
    if (parsed.hostname === R2_TILE_HOST) {
      target = `${R2_TILES_DEV_PROXY}${parsed.pathname}${parsed.search}`
    }
  } catch {
    return { ok: false, error: 'Invalid image URL.' }
  }
  try {
    const response = await fetch(target)
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}` }
    const mime = (response.headers.get('content-type') ?? 'image/png').split(';')[0].trim()
    if (!mime.startsWith('image/')) return { ok: false, error: 'The URL is not an image.' }
    const blob = await response.blob()
    if (blob.size === 0) return { ok: false, error: 'The image is empty.' }
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result ?? ''))
      reader.onerror = () => reject(reader.error ?? new Error('Could not read the image.'))
      reader.readAsDataURL(blob)
    })
    return data ? { ok: true, data } : { ok: false, error: 'Could not read the image.' }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/** Browser Vite session (Chrome while Rust compiles) — UI works; native IPC does not. */
export function createBrowserApi(): EestimateApi {
  const canceled = async (): Promise<{ canceled: true }> => ({ canceled: true })
  return {
    window: {
      minimize: () => undefined,
      toggleMaximize: () => undefined,
      close: () => undefined,
      isMaximized: async () => false,
      onMaximizedChanged: () => noopSubscribe()
    },
    project: {
      save: (data, currentPath, name) => browserSaveProject(data, currentPath, name),
      saveAs: (data, name) => browserSaveProjectAs(data, name),
      open: () => browserOpenProject(),
      openPath: (path) => browserOpenPath(path)
    },
    cluster: {
      save: (data, currentPath, name) => browserSaveCluster(data, currentPath, name),
      saveAs: (data, name) => browserSaveClusterAs(data, name),
      open: () => browserOpenCluster()
    },
    recent: {
      list: () => browserListRecent(),
      clear: () => browserClearRecent()
    },
    bund: {
      simulate: async (request) => ({
        schemaVersion: 1,
        runId: request.runId,
        status: 'error',
        message: BROWSER_HINT
      }),
      cancel: async () => false,
      onProgress: () => noopSubscribe()
    },
    canal: {
      calculateQuantities: async () => {
        throw new Error(BROWSER_HINT)
      }
    },
    rateAnalysis: {
      calculate: async () => {
        throw new Error(BROWSER_HINT)
      },
      calculateBase: async () => {
        throw new Error(BROWSER_HINT)
      },
      batchCalculate: async () => {
        throw new Error(BROWSER_HINT)
      }
    },
    typst: {
      compile: async () => ({ ok: false, error: BROWSER_HINT })
    },
    excel: {
      compile: async () => ({ ok: false, error: BROWSER_HINT })
    },
    image: {
      embedRemote: (url) => browserEmbedRemote(url)
    },
    export: {
      pdf: canceled,
      workbook: canceled,
      png: canceled,
      reveal: async () => undefined
    },
    update: {
      status: async () => ({ idle: true }),
      check: async () => ({ idle: true }),
      download: async () => ({ idle: true }),
      install: () => undefined,
      onChecking: () => noopSubscribe(),
      onAvailable: () => noopSubscribe(),
      onNotAvailable: () => noopSubscribe(),
      onDownloadProgress: () => noopSubscribe(),
      onDownloaded: () => noopSubscribe(),
      onError: () => noopSubscribe()
    }
  }
}

/** Detect the Tauri 2 + WebView2 desktop shell. */
export function isTauriRuntime(): boolean {
  if (typeof window === 'undefined') return false
  return '__TAURI_INTERNALS__' in window || '__TAURI__' in window
}

/** Install window.api from the Tauri invoke adapter, or a browser stub. */
export async function installPlatformApi(): Promise<void> {
  if (typeof window.api !== 'undefined') return
  if (!isTauriRuntime()) {
    window.api = createBrowserApi()
    console.info('[platformApi] Browser session: File → Open Project to load a .eestimate. Typst and bund still need the Tauri window.')
    return
  }
  const { createTauriApi } = await import('./tauriApi')
  window.api = createTauriApi()
}
