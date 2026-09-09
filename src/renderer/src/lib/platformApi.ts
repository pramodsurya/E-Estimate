import type { EestimateApi } from '../types/eestimateApi'
import {
  browserClearRecent,
  browserListRecent,
  browserOpenPath,
  browserOpenProject,
  browserSaveProject,
  browserSaveProjectAs
} from './browserProjectIo'

const BROWSER_HINT =
  'Needs the desktop window. Leave npm run dev running until Tauri opens.'

function noopSubscribe(): () => void {
  return () => undefined
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
    typst: {
      compile: async () => ({ ok: false, error: BROWSER_HINT })
    },
    image: {
      embedRemote: async () => ({ ok: false, error: BROWSER_HINT })
    },
    export: {
      pdf: canceled,
      workbook: canceled,
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
