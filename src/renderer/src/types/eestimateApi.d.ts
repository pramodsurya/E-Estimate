import type { EestimateProject } from './project'
import type { BundSimulationEngineRequest } from '../lib/bundSimulation'
import type {
  BundSimulationEngineResponse
} from './bundSimulation'
import type { BundSimulationProgressUpdate } from '../store/useStore'

export interface TypstCompileResult {
  ok: boolean
  /** base64-encoded PDF when ok. */
  data?: string
  error?: string
  durationMs?: number
  /** Invisible metadata emitted beside rendered project content. Missing on older engines. */
  printedContent?: string[]
}

export interface RecentEntry {
  path: string
  name: string
  openedAt: string
}

export interface SaveResult {
  canceled: boolean
  path?: string
}

export interface OpenResult {
  canceled: boolean
  path?: string
  data?: EestimateProject
  error?: string
}

export interface EestimateApi {
  window: {
    minimize: () => void
    toggleMaximize: () => void
    close: () => void
    isMaximized: () => Promise<boolean>
    onMaximizedChanged: (cb: (v: boolean) => void) => () => void
  }
  project: {
    save: (data: unknown, currentPath: string | null, name: string) => Promise<SaveResult>
    saveAs: (data: unknown, name: string) => Promise<SaveResult>
    open: () => Promise<OpenResult>
    openPath: (path: string) => Promise<OpenResult>
  }
  recent: {
    list: () => Promise<RecentEntry[]>
    clear: () => Promise<RecentEntry[]>
  }
  bund: {
    /** Run one headless XSLOPE stability case for a bund section. */
    simulate: (request: BundSimulationEngineRequest) => Promise<BundSimulationEngineResponse>
    /** Cancel an active sidecar run by its unique run id. */
    cancel: (runId: string) => Promise<boolean>
    /** Shell phase updates survive Simulation-tab navigation. */
    onProgress: (cb: (progress: BundSimulationProgressUpdate) => void) => () => void
  }
  typst: {
    compile: (
      mainContent: string,
      inputs?: Record<string, string>,
      shadowFiles?: Record<string, string>
    ) => Promise<TypstCompileResult>
  }
  image: {
    /** Download an http(s) image in the shell and return a portable data URL. */
    embedRemote: (url: string) => Promise<{ ok: boolean; data?: string; error?: string }>
  }
  export: {
    /** Ask where to save, then write the base64 PDF there. */
    pdf: (data: string, name: string, defaultPath?: string) => Promise<SaveResult>
    /** Same, for the workbook the comparative statement is also issued as. */
    workbook: (data: string, name: string, defaultPath?: string) => Promise<SaveResult>
    /** Ask where to save, then write a PNG image there. */
    png: (data: string, name: string, defaultPath?: string) => Promise<SaveResult>
    reveal: (path: string) => Promise<void>
  }
  update: {
    status: () => Promise<unknown>
    check: () => Promise<unknown>
    download: () => Promise<unknown>
    install: () => void
    onChecking: (cb: () => void) => () => void
    onAvailable: (cb: (info: unknown) => void) => () => void
    onNotAvailable: (cb: (info: unknown) => void) => () => void
    onDownloadProgress: (cb: (p: { percent: number; bytesPerSecond: number }) => void) => () => void
    onDownloaded: (cb: (info: unknown) => void) => () => void
    onError: (cb: (msg: string) => void) => () => void
  }
}

declare global {
  interface Window {
    api: EestimateApi
  }
}

export {}
