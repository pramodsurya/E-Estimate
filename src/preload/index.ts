import { contextBridge, ipcRenderer } from 'electron'

const api = {
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
    close: () => ipcRenderer.send('window:close'),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:is-maximized'),
    onMaximizedChanged: (cb: (v: boolean) => void): (() => void) => {
      const listener = (_e: unknown, v: boolean): void => cb(v)
      ipcRenderer.on('window:maximized-changed', listener)
      return () => ipcRenderer.removeListener('window:maximized-changed', listener)
    }
  },
  project: {
    save: (data: unknown, currentPath: string | null, name: string) =>
      ipcRenderer.invoke('project:save', { data, currentPath, name }),
    saveAs: (data: unknown, name: string) =>
      ipcRenderer.invoke('project:save-as', { data, currentPath: null, name }),
    open: () => ipcRenderer.invoke('project:open'),
    openPath: (path: string) => ipcRenderer.invoke('project:open-path', path)
  },
  recent: {
    list: () => ipcRenderer.invoke('recent:list'),
    clear: () => ipcRenderer.invoke('recent:clear')
  },
  print: {
    toPdf: (html: string, options: unknown) =>
      ipcRenderer.invoke('print:to-pdf', { html, options })
  },
  // ── Auto-update ──
  update: {
    check: (): Promise<unknown> => ipcRenderer.invoke('update:check'),
    download: (): Promise<unknown> => ipcRenderer.invoke('update:download'),
    install: (): void => { ipcRenderer.invoke('update:install') },
    onChecking: (cb: () => void) => {
      const l = (): void => cb()
      ipcRenderer.on('update:checking-for-update', l)
      return () => ipcRenderer.removeListener('update:checking-for-update', l)
    },
    onAvailable: (cb: (info: unknown) => void) => {
      const l = (_e: unknown, info: unknown): void => cb(info)
      ipcRenderer.on('update:available', l)
      return () => ipcRenderer.removeListener('update:available', l)
    },
    onNotAvailable: (cb: (info: unknown) => void) => {
      const l = (_e: unknown, info: unknown): void => cb(info)
      ipcRenderer.on('update:not-available', l)
      return () => ipcRenderer.removeListener('update:not-available', l)
    },
    onDownloadProgress: (cb: (p: { percent: number; bytesPerSecond: number }) => void) => {
      const l = (_e: unknown, p: { percent: number; bytesPerSecond: number }): void => cb(p)
      ipcRenderer.on('update:download-progress', l)
      return () => ipcRenderer.removeListener('update:download-progress', l)
    },
    onDownloaded: (cb: (info: unknown) => void) => {
      const l = (_e: unknown, info: unknown): void => cb(info)
      ipcRenderer.on('update:downloaded', l)
      return () => ipcRenderer.removeListener('update:downloaded', l)
    },
    onError: (cb: (msg: string) => void) => {
      const l = (_e: unknown, msg: string): void => cb(msg)
      ipcRenderer.on('update:error', l)
      return () => ipcRenderer.removeListener('update:error', l)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)
