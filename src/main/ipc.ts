import { promises as fs } from 'fs'
import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import { readProject, writeProject } from './projectIo'
import { addRecent, clearRecent, listRecent, removeRecent } from './recentStore'

/** The most recent thing the updater reported, for a renderer that missed it. */
export type UpdateState =
  | { stage: 'idle' }
  | { stage: 'checking' }
  | { stage: 'available'; info: unknown }
  | { stage: 'not-available' }
  | { stage: 'downloading'; percent: number }
  | { stage: 'downloaded'; info: unknown }
  | { stage: 'error'; message: string }

let lastUpdateState: UpdateState = { stage: 'idle' }

const FILE_FILTERS = [{ name: 'E-Estimate Project', extensions: ['eestimate'] }]
const PDF_FILTERS = [{ name: 'PDF Document', extensions: ['pdf'] }]
const WORKBOOK_FILTERS = [{ name: 'Excel Workbook', extensions: ['xlsx'] }]

function sanitize(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'Project'
}

export function registerIpc(): void {
  // --- Window controls (custom frame) ---
  ipcMain.on('window:minimize', (e) => BrowserWindow.fromWebContents(e.sender)?.minimize())
  ipcMain.on('window:toggle-maximize', (e) => {
    const w = BrowserWindow.fromWebContents(e.sender)
    if (!w) return
    if (w.isMaximized()) w.unmaximize()
    else w.maximize()
  })
  ipcMain.on('window:close', (e) => BrowserWindow.fromWebContents(e.sender)?.close())
  ipcMain.handle(
    'window:is-maximized',
    (e) => BrowserWindow.fromWebContents(e.sender)?.isMaximized() ?? false
  )

  // --- Project file operations ---
  ipcMain.handle('project:save', async (e, payload: SavePayload) => {
    const { data, currentPath, name } = payload
    let target = currentPath
    if (!target) {
      const w = BrowserWindow.fromWebContents(e.sender)!
      const res = await dialog.showSaveDialog(w, {
        title: 'Save Project',
        defaultPath: `${sanitize(name)}.eestimate`,
        filters: FILE_FILTERS
      })
      if (res.canceled || !res.filePath) return { canceled: true }
      target = res.filePath
    }
    await writeProject(target, data)
    addRecent(target, name)
    return { canceled: false, path: target }
  })

  ipcMain.handle('project:save-as', async (e, payload: SavePayload) => {
    const { data, name } = payload
    const w = BrowserWindow.fromWebContents(e.sender)!
    const res = await dialog.showSaveDialog(w, {
      title: 'Save Project As',
      defaultPath: `${sanitize(name)}.eestimate`,
      filters: FILE_FILTERS
    })
    if (res.canceled || !res.filePath) return { canceled: true }
    await writeProject(res.filePath, data)
    addRecent(res.filePath, name)
    return { canceled: false, path: res.filePath }
  })

  ipcMain.handle('project:open', async (e) => {
    const w = BrowserWindow.fromWebContents(e.sender)!
    const res = await dialog.showOpenDialog(w, {
      title: 'Open Project',
      properties: ['openFile'],
      filters: FILE_FILTERS
    })
    if (res.canceled || res.filePaths.length === 0) return { canceled: true }
    const path = res.filePaths[0]
    try {
      const data = await readProject(path)
      addRecent(path, (data as { meta?: { name?: string } })?.meta?.name)
      return { canceled: false, path, data }
    } catch (err) {
      return { canceled: false, error: String(err), path }
    }
  })

  ipcMain.handle('project:open-path', async (_e, path: string) => {
    try {
      const data = await readProject(path)
      addRecent(path, (data as { meta?: { name?: string } })?.meta?.name)
      return { canceled: false, path, data }
    } catch (err) {
      removeRecent(path)
      return { canceled: false, error: String(err), path }
    }
  })

  // --- Export ---
  // The renderer assembles the PDF and passes it as base64; this only asks the
  // user where to put it and writes the bytes.
  ipcMain.handle('export:pdf', async (e, payload: ExportPdfPayload) => {
    const { data, name, defaultPath } = payload
    const w = BrowserWindow.fromWebContents(e.sender)!
    const res = await dialog.showSaveDialog(w, {
      title: 'Export PDF',
      defaultPath: defaultPath || `${sanitize(name)}.pdf`,
      filters: PDF_FILTERS
    })
    if (res.canceled || !res.filePath) return { canceled: true }
    const target = res.filePath.toLowerCase().endsWith('.pdf') ? res.filePath : `${res.filePath}.pdf`
    await fs.writeFile(target, Buffer.from(data, 'base64'))
    return { canceled: false, path: target }
  })

  // The comparative statement is issued as a signed sheet *and* as something to
  // work with, so the save path cannot be PDF-only.
  ipcMain.handle('export:workbook', async (e, payload: ExportPdfPayload) => {
    const { data, name, defaultPath } = payload
    const w = BrowserWindow.fromWebContents(e.sender)!
    const res = await dialog.showSaveDialog(w, {
      title: 'Export Excel Workbook',
      defaultPath: defaultPath || `${sanitize(name)}.xlsx`,
      filters: WORKBOOK_FILTERS
    })
    if (res.canceled || !res.filePath) return { canceled: true }
    const target = res.filePath.toLowerCase().endsWith('.xlsx')
      ? res.filePath
      : `${res.filePath}.xlsx`
    await fs.writeFile(target, Buffer.from(data, 'base64'))
    return { canceled: false, path: target }
  })

  ipcMain.handle('export:reveal', (_e, path: string) => {
    shell.showItemInFolder(path)
  })

  // --- Recent projects ---
  ipcMain.handle('recent:list', () => listRecent())
  ipcMain.handle('recent:clear', () => {
    clearRecent()
    return listRecent()
  })

  // --- Auto-update ---
  // Forward autoUpdater events to the renderer so the UI can react, and keep the
  // latest one.
  //
  // Forwarding alone loses the result. The check starts as soon as the app is
  // ready, while the renderer only subscribes once React has mounted, so the
  // single 'update-available' could be sent to a window that was not listening
  // yet. Nothing downloads without the user pressing Download, and nothing asks
  // again, so a missed event meant the app never offered the update at all.
  const broadcast = (channel: string, payload?: unknown): void => {
    for (const w of BrowserWindow.getAllWindows()) {
      w.webContents.send(channel, payload)
    }
  }
  autoUpdater.on('checking-for-update', () => {
    lastUpdateState = { stage: 'checking' }
    broadcast('update:checking-for-update')
  })
  autoUpdater.on('update-available', (info) => {
    lastUpdateState = { stage: 'available', info }
    broadcast('update:available', info)
  })
  autoUpdater.on('update-not-available', (info) => {
    lastUpdateState = { stage: 'not-available' }
    broadcast('update:not-available', info)
  })
  autoUpdater.on('download-progress', (progress) => {
    lastUpdateState = { stage: 'downloading', percent: progress?.percent ?? 0 }
    broadcast('update:download-progress', progress)
  })
  autoUpdater.on('update-downloaded', (info) => {
    lastUpdateState = { stage: 'downloaded', info }
    broadcast('update:downloaded', info)
  })
  autoUpdater.on('error', (err) => {
    const message = err?.message ?? String(err)
    lastUpdateState = { stage: 'error', message }
    broadcast('update:error', message)
  })

  // Allow the renderer to trigger check / download / install, and to ask what
  // was found before it was listening.
  ipcMain.handle('update:status', () => lastUpdateState)
  ipcMain.handle('update:check', () => autoUpdater.checkForUpdates())
  ipcMain.handle('update:download', () => autoUpdater.downloadUpdate())
  ipcMain.handle('update:install', () => {
    autoUpdater.quitAndInstall(false, true)
  })
}

interface SavePayload {
  data: unknown
  currentPath: string | null
  name: string
}

interface ExportPdfPayload {
  /** base64-encoded PDF bytes. */
  data: string
  name: string
  defaultPath?: string
}
