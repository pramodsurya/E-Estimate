// Print-to-PDF for the Print Layout preview. The renderer builds the printable
// HTML and the Electron printToPDF options; the main process rasterizes it in a
// hidden, isolated window and returns the PDF as base64 for in-app preview.

import { promises as fs } from 'fs'
import { join } from 'path'
import { app, BrowserWindow, ipcMain } from 'electron'

export interface PrintToPdfRequest {
  html: string
  options: {
    pageSize: 'A4' | 'A3' | 'A2' | 'Letter' | 'Legal'
    landscape: boolean
    margins: { top: number; bottom: number; left: number; right: number }
    printBackground: boolean
    scale: number
    displayHeaderFooter: boolean
    headerTemplate: string
    footerTemplate: string
    preferCSSPageSize: boolean
  }
}

export interface PrintToPdfResult {
  ok: boolean
  /** base64-encoded PDF when ok. */
  data?: string
  error?: string
}

async function renderPdf(req: PrintToPdfRequest): Promise<PrintToPdfResult> {
  let win: BrowserWindow | null = null
  let temporaryPath: string | null = null
  try {
    win = new BrowserWindow({
      show: false,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        // Page is static HTML we generated; no scripts needed.
        javascript: false,
        offscreen: false
      }
    })

    temporaryPath = join(
      app.getPath('temp'),
      `eestimate-print-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.html`
    )
    await fs.writeFile(temporaryPath, req.html, 'utf-8')
    await win.loadFile(temporaryPath)

    // Give layout/fonts a tick to settle before snapshotting.
    await new Promise((r) => setTimeout(r, 80))

    const o = req.options
    const pdf = await win.webContents.printToPDF({
      pageSize: o.pageSize,
      landscape: o.landscape,
      printBackground: o.printBackground,
      margins: {
        marginType: 'custom',
        top: o.margins.top,
        bottom: o.margins.bottom,
        left: o.margins.left,
        right: o.margins.right
      },
      scale: o.scale,
      displayHeaderFooter: o.displayHeaderFooter,
      headerTemplate: o.headerTemplate,
      footerTemplate: o.footerTemplate,
      preferCSSPageSize: o.preferCSSPageSize
    })

    return { ok: true, data: pdf.toString('base64') }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  } finally {
    if (win && !win.isDestroyed()) win.destroy()
    if (temporaryPath) await fs.unlink(temporaryPath).catch(() => undefined)
  }
}

export function registerPrintIpc(): void {
  ipcMain.handle('print:to-pdf', async (_e, req: PrintToPdfRequest): Promise<PrintToPdfResult> => {
    if (!req || typeof req.html !== 'string' || !req.options) {
      return { ok: false, error: 'Invalid print request' }
    }
    return renderPdf(req)
  })
}
