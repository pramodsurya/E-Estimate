import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { autoUpdater } from 'electron-updater'
import { registerIpc } from './ipc'
import { registerPrintIpc } from './print'

let mainWindow: BrowserWindow | null = null

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 940,
    minHeight: 600,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#1e1e1e',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow = win
  win.on('ready-to-show', () => win.show())
  win.on('closed', () => {
    mainWindow = null
  })

  // Notify the renderer when the maximize state changes so the title bar icon can update.
  const sendMaxState = (): void => {
    if (!win.isDestroyed()) win.webContents.send('window:maximized-changed', win.isMaximized())
  }
  win.on('maximize', sendMaxState)
  win.on('unmaximize', sendMaxState)

  // Open external links in the system browser, never in-app.
  win.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    void win.loadURL(devUrl)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

app.whenReady().then(() => {
  registerIpc()
  registerPrintIpc()
  createWindow()

  // ── Auto-updater: check for updates on startup ──
  // In development, set the env ELECTRON_RENDERER_URL so we skip the check.
  if (!process.env['ELECTRON_RENDERER_URL']) {
    autoUpdater.autoDownload = false   // Let the user decide when to download
    autoUpdater.autoInstallOnAppQuit = false
    autoUpdater.checkForUpdates().catch((err) => {
      console.error('Auto-update check failed:', err)
    })
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
