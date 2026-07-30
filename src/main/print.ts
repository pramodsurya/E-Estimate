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

/** How long one page may spend loading before it is printed as-is. */
const LOAD_TIMEOUT_MS = 20000

/**
 * Chromium's printToPDF can wedge and never settle. Requests are queued, so one
 * wedged call would stall every later page: give it a hard stop and report a
 * failure instead of holding the queue open.
 */
const PRINT_TIMEOUT_MS = 90000

function withTimeout<T>(work: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  return Promise.race([
    work,
    new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms)
    })
  ]).finally(() => {
    if (timer) clearTimeout(timer)
  }) as Promise<T>
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

    // `loadFile` settles on did-finish-load, which never fires while a
    // sub-resource is still outstanding — a stalled map tile or image would
    // otherwise leave the export waiting for good. Print what has arrived once
    // the budget is spent rather than hanging.
    let timer: NodeJS.Timeout | undefined
    await Promise.race([
      win.loadFile(temporaryPath).catch(() => undefined),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, LOAD_TIMEOUT_MS)
      })
    ]).finally(() => {
      if (timer) clearTimeout(timer)
    })
    if (win.isDestroyed()) return { ok: false, error: 'The print window closed early.' }

    // Give layout/fonts a tick to settle before snapshotting.
    await new Promise((r) => setTimeout(r, 80))

    const o = req.options
    const pdf = await withTimeout(
      win.webContents.printToPDF({
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
      }),
      PRINT_TIMEOUT_MS,
      `Rendering this page timed out after ${Math.round(PRINT_TIMEOUT_MS / 1000)}s.`
    )

    return { ok: true, data: pdf.toString('base64') }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  } finally {
    if (win && !win.isDestroyed()) win.destroy()
    if (temporaryPath) await fs.unlink(temporaryPath).catch(() => undefined)
  }
}

/**
 * Chromium's print path is not safe to drive from several hidden windows at
 * once — concurrent printToPDF calls can wedge and never settle. The renderer
 * is free to prepare many sections in parallel; the actual rendering is taken
 * one at a time here.
 */
let printQueue: Promise<unknown> = Promise.resolve()

function enqueue(req: PrintToPdfRequest): Promise<PrintToPdfResult> {
  const result = printQueue.then(() => renderPdf(req))
  printQueue = result.catch(() => undefined)
  return result
}

export function registerPrintIpc(): void {
  ipcMain.handle('print:to-pdf', async (_e, req: PrintToPdfRequest): Promise<PrintToPdfResult> => {
    if (!req || typeof req.html !== 'string' || !req.options) {
      return { ok: false, error: 'Invalid print request' }
    }
    return enqueue(req)
  })
}
