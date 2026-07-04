import type { EestimateProject } from '../renderer/src/types/project'
import type { PdfOptions } from '../renderer/src/lib/printRender'

export interface PrintPdfResult {
  ok: boolean
  /** base64-encoded PDF when ok. */
  data?: string
  error?: string
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
  print: {
    toPdf: (html: string, options: PdfOptions) => Promise<PrintPdfResult>
  }
  update: {
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
