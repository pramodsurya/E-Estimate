// Print-to-PDF for the Print Layout preview. The renderer builds the printable
// HTML and the Electron printToPDF options; the main process rasterizes it in a
// hidden, isolated window and returns the PDF as base64 for in-app preview.

import { BrowserWindow, ipcMain } from 'electron'

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

    const loaded = win.webContents
      ? new Promise<void>((resolve, reject) => {
          const wc = win!.webContents
          const onLoad = (): void => {
            cleanup()
            resolve()
          }
          const onFail = (_e: unknown, code: number, desc: string): void => {
            cleanup()
            reject(new Error(`Failed to load print document (${code}): ${desc}`))
          }
          const cleanup = (): void => {
            wc.off('did-finish-load', onLoad)
            wc.off('did-fail-load', onFail)
          }
          wc.once('did-finish-load', onLoad)
          wc.once('did-fail-load', onFail)
        })
      : Promise.reject(new Error('No web contents'))

    const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(req.html)}`
    // Large documents can exceed data-URL limits in some platforms; fall back is
    // not needed in practice for a single sheet, and avoids temp-file cleanup.
    void win.loadURL(dataUrl)
    await loaded

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
