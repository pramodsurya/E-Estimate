import { BrowserWindow, dialog, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'
import { readProject, writeProject } from './projectIo'
import { addRecent, clearRecent, listRecent, removeRecent } from './recentStore'

const FILE_FILTERS = [{ name: 'E-Estimate Project', extensions: ['eestimate'] }]

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

  // --- Recent projects ---
  ipcMain.handle('recent:list', () => listRecent())
  ipcMain.handle('recent:clear', () => {
    clearRecent()
    return listRecent()
  })

  // --- Auto-update ---
  // Forward autoUpdater events to the renderer so the UI can react.
  autoUpdater.on('checking-for-update', () => {
    for (const w of BrowserWindow.getAllWindows()) {
      w.webContents.send('update:checking-for-update')
    }
  })
  autoUpdater.on('update-available', (_info) => {
    for (const w of BrowserWindow.getAllWindows()) {
      w.webContents.send('update:available', _info)
    }
  })
  autoUpdater.on('update-not-available', (_info) => {
    for (const w of BrowserWindow.getAllWindows()) {
      w.webContents.send('update:not-available', _info)
    }
  })
  autoUpdater.on('download-progress', (progress) => {
    for (const w of BrowserWindow.getAllWindows()) {
      w.webContents.send('update:download-progress', progress)
    }
  })
  autoUpdater.on('update-downloaded', (_info) => {
    for (const w of BrowserWindow.getAllWindows()) {
      w.webContents.send('update:downloaded', _info)
    }
  })
  autoUpdater.on('error', (err) => {
    for (const w of BrowserWindow.getAllWindows()) {
      w.webContents.send('update:error', err?.message ?? String(err))
    }
  })

  // Allow the renderer to trigger check / download / install.
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
