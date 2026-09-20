import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type {
  EestimateApi,
  OpenResult,
  RecentEntry,
  SaveResult
} from '../types/eestimateApi'

function subscribe<T>(event: string, cb: (payload: T) => void): () => void {
  let unlisten: UnlistenFn | null = null
  void listen<T>(event, (ev) => {
    cb(ev.payload)
  }).then((fn) => {
    unlisten = fn
  })
  return () => {
    if (unlisten) void unlisten()
  }
}

function subscribeVoid(event: string, cb: () => void): () => void {
  return subscribe<unknown>(event, () => cb())
}

/** Tauri invoke adapter — implements window.api for the WebView2 shell. */
export function createTauriApi(): EestimateApi {
  return {
    window: {
      minimize: () => {
        void invoke('window_minimize')
      },
      toggleMaximize: () => {
        void invoke('window_toggle_maximize')
      },
      close: () => {
        void invoke('window_close')
      },
      isMaximized: () => invoke<boolean>('window_is_maximized'),
      onMaximizedChanged: (cb) => subscribe<boolean>('window:maximized-changed', cb)
    },
    project: {
      save: (data, currentPath, name) =>
        // Tauri commands with a struct argument require the argument name
        // (`payload`), rather than spreading the struct fields at top level.
        invoke<SaveResult>('project_save', { payload: { data, currentPath, name } }),
      saveAs: (data, name) =>
        invoke<SaveResult>('project_save_as', { payload: { data, name } }),
      open: () => invoke<OpenResult>('project_open'),
      openPath: (path) => invoke<OpenResult>('project_open_path', { path })
    },
    cluster: {
      save: (data, currentPath, name) =>
        invoke<SaveResult>('project_save', { payload: { data, currentPath, name } }),
      saveAs: (data, name) =>
        invoke<SaveResult>('cluster_save_as', { payload: { data, name } }),
      open: () => invoke<OpenResult>('cluster_open')
    },
    recent: {
      list: () => invoke<RecentEntry[]>('recent_list'),
      clear: () => invoke<RecentEntry[]>('recent_clear')
    },
    bund: {
      // `bund_simulate` receives a Rust `args: BundSimulateArgs` parameter, so
      // Tauri expects the request struct to be nested under the `args` key.
      simulate: (request) => invoke('bund_simulate', { args: { request } }),
      cancel: (runId) => invoke<boolean>('bund_cancel', { runId }),
      onProgress: (cb) => subscribe('bund:simulation-progress', cb)
    },
    typst: {
      compile: (mainContent, inputs, shadowFiles, opts?: { contentHash?: string; preferPath?: boolean }) =>
        invoke('typst_compile', {
          req: {
            mainContent,
            inputs,
            shadowFiles,
            contentHash: opts?.contentHash,
            preferPath: opts?.preferPath
          }
        })
    },
    excel: {
      compile: (payload) => invoke('excel_compile', { payload })
    },
    image: {
      embedRemote: (url) => invoke('image_embed_remote', { payload: { url } })
    },
    export: {
      pdf: (data, name, defaultPath?, opts?: { sourcePath?: string }) =>
        invoke('export_pdf', { payload: { data, name, defaultPath, sourcePath: opts?.sourcePath } }),
      workbook: (data, name, defaultPath?, opts?: { sourcePath?: string }) =>
        invoke('export_workbook', { payload: { data, name, defaultPath, sourcePath: opts?.sourcePath } }),
      png: (data, name, defaultPath?, opts?: { sourcePath?: string }) =>
        invoke('export_png', { payload: { data, name, defaultPath, sourcePath: opts?.sourcePath } }),
      reveal: (path) => invoke('export_reveal', { path })
    },
    update: {
      // TODO: wire tauri-plugin-updater — commands below invoke stub handlers in update.rs
      status: () => invoke('update_status'),
      check: () => invoke('update_check'),
      download: () => invoke('update_download'),
      install: () => {
        void invoke('update_install')
      },
      onChecking: (cb) => subscribeVoid('update:checking-for-update', cb),
      onAvailable: (cb) => subscribe('update:available', cb),
      onNotAvailable: (cb) => subscribe('update:not-available', cb),
      onDownloadProgress: (cb) => subscribe('update:download-progress', cb),
      onDownloaded: (cb) => subscribe('update:downloaded', cb),
      onError: (cb) => subscribe<string>('update:error', cb)
    }
  }
}
