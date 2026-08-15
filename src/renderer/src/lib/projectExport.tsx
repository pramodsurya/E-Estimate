/**
 * File > Export > PDF.
 *
 * The export is the Project Print View, written to one file. Every section is
 * produced by the same code that draws it on screen: documents and components
 * through their own print builders, the DATA codes through their sheet flow,
 * and the previews that only exist as live components (General Abstract, Lead,
 * Seigniorage) by mounting them and printing the markup they settle into.
 * Nothing about an estimate is recalculated here.
 */

import { PDFDocument } from 'pdf-lib'
import type { CSSProperties } from 'react'
import type { EestimateProject, Margins, PrintConfig, ProjectNode } from '../types/project'
import GeneralAbstractPage from '../components/print/GeneralAbstractPage'
import LeadPrintPreviewModal from '../components/lead/LeadPrintPreviewModal'
import { SeignioragePrintPages } from '../components/seigniorage/SeignioragePrintPreviewModal'
import { buildCombinedComponentPdf } from './componentPrint'
import { buildDocumentPrintHtml } from './documentPrint'
import { collectDataSheets } from './dataSheets'
import { buildDataSheetsPrintPdf } from './dataSheetPrint'
import { componentItemsTotal } from './finalNumber'
import { isDocumentEmpty } from './documentHtml'
import { ensureEmblemInlined } from './emblem'
import { renderLiveHtml } from './liveRender'
import { resolveNodeSettings } from './nodeSettings'
import { paperMm } from './seignioragePrintLayout'
import {
  previewPdfOptions,
  previewPrintHtml,
  splitPreviewPages,
  type PreviewPageRun
} from './previewPrint'
import {
  computeProjectPrintInputs,
  projectDashboardIsReady
} from './projectPrintInputs'
import {
  frontCoverHasEstimatedCost,
  updateFrontCoverEstimatedCost
} from './univerDocument'
import {
  applySignatureFooterToPdf,
  LEAD_SIGNATURE_SCOPE,
  resolveDocumentSignatureFooter,
  resolveSignatureFooter,
  SEIGNIORAGE_SIGNATURE_SCOPE
} from './signatureFooter'

const DEFAULT_MARGINS: Margins = { top: 20, right: 15, bottom: 20, left: 25 }

/**
 * A seigniorage sheet packs its rows into the height left after reserving a
 * bottom band for the signatures — but the signature block is laid out in flow
 * after those rows, so on paper it lands past the bottom of the sheet and takes
 * a page of its own. Spend the reserved band on the block that was meant to
 * occupy it, and trim the block's own generous screen spacing to fit.
 */
const SEIGNIORAGE_FOOTER_CSS = `
  .seig-print-page{padding-bottom:6mm!important}
  .seig-print-page .signature-print-footer{margin-top:10px;padding:12px 12px 0}
`

export type ExportSectionState = 'queued' | 'rendering' | 'done' | 'skipped' | 'failed'

export interface ExportSection {
  label: string
  state: ExportSectionState
  /** Milliseconds spent so far, so a slow section is visible while it runs. */
  elapsedMs?: number
  /** What this section is doing right now, so a stall names its own step. */
  detail?: string
  error?: string
  /** Internal: when this section started, used to tick `elapsedMs`. */
  startedAt?: number
}

/** Reports the step a section has reached. */
export type PhaseReporter = (detail: string) => void

/** Hand the browser a turn so the progress screen can paint between steps. */
function yieldToUi(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

/** Thrown when the user cancels; the caller treats it as "nothing happened". */
export class ExportCanceled extends Error {
  constructor() {
    super('Export canceled.')
    this.name = 'ExportCanceled'
  }
}

/**
 * A single section may not hold the export open forever. The print renderer has
 * its own load budget; this is the outer stop for a section that never returns.
 */
const SECTION_TIMEOUT_MS = 180000

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new ExportCanceled()
}

async function withTimeout<T>(work: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                `${label} did not finish within ${Math.round(SECTION_TIMEOUT_MS / 1000)}s.`
              )
            ),
          SECTION_TIMEOUT_MS
        )
      })
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** Called with the whole section list whenever any section changes state. */
export type ExportProgress = (sections: ExportSection[]) => void

/**
 * How many sections are prepared at once within a stage. The print renderer
 * itself takes one page at a time, so this parallelises the markup building and
 * the waiting, not the printing.
 */
const RENDER_CONCURRENCY = 3

/**
 * The order the estimate is built in, which is not the order it is bound in.
 *
 * An estimate is an orchestra: Lead feeds DATA, DATA gives the components their
 * rates and descriptions, the components give Seigniorage its quantities, and
 * only once all of that is costed can the General Abstract state a total. The
 * covers are written last because they carry that total. Pages are merged back
 * into print-view order afterwards, so the bound PDF still reads front to back.
 *
 * The Lead route map has to wait on map tiles from the network, so Lead is
 * started first and then left to run alongside every later stage rather than
 * holding them up.
 */
const STAGE = {
  lead: 0,
  data: 1,
  components: 2,
  seigniorage: 3,
  abstract: 4,
  covers: 5
} as const

const STAGE_NAMES: Record<number, string> = {
  [STAGE.lead]: 'Lead',
  [STAGE.data]: 'DATA',
  [STAGE.components]: 'Components',
  [STAGE.seigniorage]: 'Seigniorage',
  [STAGE.abstract]: 'General Abstract',
  [STAGE.covers]: 'Front Page and Introduction'
}

/** Run `worker` over `items` with at most `limit` in flight, preserving order. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = next
      next += 1
      if (index >= items.length) return
      results[index] = await worker(items[index], index)
    }
  })
  await Promise.all(runners)
  return results
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

export function encodeBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk))
  }
  return btoa(binary)
}

async function renderPdf(html: string, options: Parameters<typeof window.api.print.toPdf>[1]): Promise<Uint8Array> {
  const result = await window.api.print.toPdf(html, options)
  if (!result.ok || !result.data) {
    throw new Error(result.error ?? 'The print renderer returned no pages.')
  }
  return decodeBase64(result.data)
}

/** A rich document page (Front Page, Introduction, any supporting Page). */
async function documentPdf(
  project: EestimateProject,
  node: ProjectNode,
  phase: PhaseReporter = () => undefined
): Promise<Uint8Array | null> {
  if (isDocumentEmpty(node.documentData)) return null
  phase('building markup')
  // A cover may carry the Government emblem; embed it before the markup is
  // handed to the print renderer, which cannot resolve app asset paths.
  await ensureEmblemInlined()
  const inherited = resolveNodeSettings(project.root, node.id)
  const config: PrintConfig = {
    ...node.print,
    pageSize: node.print?.pageSize ?? inherited.pageSize ?? 'A4',
    orientation: node.print?.orientation ?? inherited.orientation ?? 'portrait',
    margins: node.print?.margins ?? inherited.margins ?? DEFAULT_MARGINS,
    scaleMode: node.print?.scaleMode ?? 'fit-width',
    scalePercent: node.print?.scalePercent ?? 100
  }
  const built = buildDocumentPrintHtml(
    node,
    config,
    {
      pageSize: config.pageSize ?? 'A4',
      orientation: config.orientation ?? 'portrait',
      margins: config.margins ?? DEFAULT_MARGINS
    },
    { projectName: project.meta.name, title: node.name }
  )
  if (built.empty) return null
  const signed = applySignatureFooterToPdf(
    built.html,
    built.pdfOptions,
    resolveDocumentSignatureFooter(project, node)
  )
  phase('printing')
  await yieldToUi()
  return renderPdf(signed.html, signed.options)
}

/**
 * Print each run of settled preview pages that shares one paper geometry.
 * These pages already carry whatever signature block the preview shows, so
 * none is added on top of them here.
 */
async function previewRunPdfs(
  runs: PreviewPageRun[],
  pageSelector: string,
  phase: PhaseReporter = () => undefined,
  options: { extraCss?: string; preservePageBox?: boolean } = {}
): Promise<Uint8Array[]> {
  const { extraCss = '', preservePageBox = false } = options
  const parts: Uint8Array[] = []
  for (const [position, run] of runs.entries()) {
    phase(`printing sheet ${position + 1} of ${runs.length}`)
    await yieldToUi()
    parts.push(
      await renderPdf(
        previewPrintHtml(run.html, pageSelector, extraCss, { preservePageBox }),
        previewPdfOptions(run.pageSize, run.orientation)
      )
    )
  }
  return parts
}

export interface ProjectExportResult {
  bytes: Uint8Array
  /** Sections that produced no pages, so the caller can say what was skipped. */
  skipped: string[]
}

export async function buildProjectExportPdf(
  project: EestimateProject,
  onProgress: ExportProgress = () => undefined,
  signal?: AbortSignal,
  /** Whole-export steps that are not a single section: stages, merge, encode. */
  onActivity: (text: string) => void = () => undefined
): Promise<ProjectExportResult> {
  throwIfAborted(signal)
  const activity = (text: string): void => {
    console.info(`[export] ${text}`)
    onActivity(text)
  }
  const inputs = computeProjectPrintInputs(project)
  const { settings } = inputs

  const storedFront = project.root.children.find((child) => child.pageTemplate === 'front')
  // Export is built after the General Abstract total has settled. Refresh only
  // the existing cost drawing in the export snapshot so a stale/blank cover can
  // never disagree with the current synced Dashboard, while preserving every
  // user edit and the drawing's chosen position.
  const front =
    storedFront &&
    frontCoverHasEstimatedCost(storedFront) &&
    projectDashboardIsReady(project, inputs.items)
      ? {
          ...storedFront,
          documentData: updateFrontCoverEstimatedCost(
            storedFront,
            inputs.abstract.grandTotal
          )
        }
      : storedFront
  const introduction = project.root.children.find(
    (child) => child.pageTemplate === 'introduction'
  )
  const bodyChildren = project.root.children.filter((child) => !child.pageTemplate)

  interface ExportTask {
    label: string
    /** Dependency phase; see STAGE below. Lower phases finish first. */
    stage: number
    produce: (phase: PhaseReporter) => Promise<Uint8Array | Uint8Array[] | null>
  }
  const tasks: ExportTask[] = []
  const task = (label: string, stage: number, produce: ExportTask['produce']): void => {
    tasks.push({ label, stage, produce })
  }

  if (settings.sections.cover && front) {
    task('Front Page', STAGE.covers, (phase) => documentPdf(project, front, phase))
  }
  if (settings.sections.introduction && introduction) {
    task('Introduction', STAGE.covers, (phase) => documentPdf(project, introduction, phase))
  }

  if (settings.sections.abstract) {
    const paper = paperMm(settings.pageSize)
    const width = settings.orientation === 'landscape' ? paper.h : paper.w
    const height = settings.orientation === 'landscape' ? paper.w : paper.h
    const pageStyle: CSSProperties = {
      width: `${width}mm`,
      height: `${height}mm`,
      minHeight: `${height}mm`,
      padding: `${settings.margins.top}mm ${settings.margins.right}mm ${settings.margins.bottom}mm ${settings.margins.left}mm`,
      fontSize: `${settings.fontPercent}%`
    }
    task('General Abstract', STAGE.abstract, async (phase) => {
      phase('laying out the abstract')
      let abstractPageCount = 0
      const html = await renderLiveHtml(
        <GeneralAbstractPage
          project={project}
          abstract={inputs.abstract}
          pageStyle={pageStyle}
        />,
        {
          signal,
          onMeasure: (host) => {
            abstractPageCount = host.querySelectorAll('.ga-sheet.pp-page').length
          }
        }
      )
      console.info(`[export] General Abstract: ${Math.max(1, abstractPageCount)} smart page(s) settled`)
      if (abstractPageCount > 1) phase(`printing ${abstractPageCount} balanced abstract sheets`)
      const runs = splitPreviewPages(html, '.pp-page', {
        pageSize: settings.pageSize,
        orientation: settings.orientation
      })
      return previewRunPdfs(runs, '.pp-page', phase, {
        // The preview owns every page break, so PDF output cannot fragment the
        // Abstract differently from View Print View.
        preservePageBox: true
      })
    })
  }

  // Explorer order, exactly as the print view walks it.
  for (const child of bodyChildren) {
    if (child.kind === 'page') {
      task(child.name, STAGE.covers, (phase) => documentPdf(project, child, phase))
    } else if (child.kind === 'component' && settings.sections.components) {
      task(child.name, STAGE.components, async (phase) => {
        phase('printing component pages')
        await yieldToUi()
        return buildCombinedComponentPdf({
          project,
          section: child,
          recipes: inputs.recipes,
          rateOf: inputs.rateOf,
          total: componentItemsTotal(project, child, inputs.rateOf, true),
          fontScale: settings.fontPercent / 100
        })
      })
    }
  }

  if (settings.sections.lead) {
    task('Lead Print Preview', STAGE.lead, async (phase) => {
      phase('drawing the chart and waiting for map tiles')
      // Mounted for real: the route map only exists once Leaflet has drawn it.
      const html = await renderLiveHtml(
        <LeadPrintPreviewModal
          year={project.meta.sorYear}
          zone={project.meta.sorZone ?? 'zone_3'}
          variants={project.leadChart?.variants ?? []}
          applications={project.leadChart?.applications ?? []}
          assignments={project.leadChart?.assignments ?? []}
          points={project.leadChart?.points ?? []}
          site={project.meta.location ?? null}
          mapDirections={project.leadChart?.mapDirections ?? []}
          printSettings={project.leadChart?.printSettings}
          signatureFooter={resolveSignatureFooter(project, LEAD_SIGNATURE_SCOPE)}
          onUpdatePrintSettings={() => undefined}
          onClose={() => undefined}
          rates={project.dashboardSnapshot?.leadRates ?? []}
          embedded
        />,
        { timeoutMs: 25000, quietMs: 400, signal }
      )
      return previewRunPdfs(
        splitPreviewPages(html, '.lead-print-page'),
        '.lead-print-page',
        phase
      )
    })
  }

  if (settings.sections.seigniorage) {
    task('Seigniorage Print Preview', STAGE.seigniorage, async (phase) => {
      phase('laying out the charge pages')
      const html = await renderLiveHtml(
        <SeignioragePrintPages
          calc={inputs.seigniorage}
          projectName={project.meta.name || project.root.name}
          printSettings={project.seignioragePrintSettings}
          signatureFooter={resolveSignatureFooter(project, SEIGNIORAGE_SIGNATURE_SCOPE)}
        />,
        { signal }
      )
      return previewRunPdfs(
        splitPreviewPages(html, '.seig-print-page'),
        '.seig-print-page',
        phase,
        { extraCss: SEIGNIORAGE_FOOTER_CSS }
      )
    })
  }

  if (settings.sections.data) {
    task('DATA code sheets', STAGE.data, async (phase) => {
      phase('resolving code sheets')
      const sheets = collectDataSheets(
        project,
        project.dashboardSnapshot?.dataDashboardEntries ?? []
      )
      if (sheets.length === 0) return null
      await yieldToUi()
      return buildDataSheetsPrintPdf({
        project,
        sheets,
        onPhase: phase,
        geometry: {
          pageSize: settings.pageSize,
          orientation: settings.orientation,
          margins: settings.margins,
          fontScale: settings.fontPercent / 100
        }
      })
    })
  }

  // Every section is listed before any work starts, so the progress screen is
  // populated immediately instead of sitting on "Preparing…".
  const sections: ExportSection[] = tasks.map(({ label }) => ({ label, state: 'queued' }))
  const report = (): void => onProgress(sections.map((section) => ({ ...section })))
  report()

  const ticker = window.setInterval(() => {
    let changed = false
    for (const section of sections) {
      if (section.state === 'rendering' && section.startedAt) {
        section.elapsedMs = Date.now() - section.startedAt
        changed = true
      }
    }
    if (changed) report()
  }, 500)

  const produced: Uint8Array[][] = tasks.map(() => [])
  const run = async (entry: ExportTask, index: number): Promise<void> => {
    throwIfAborted(signal)
    const started = Date.now()
    sections[index].state = 'rendering'
    sections[index].startedAt = started
    sections[index].elapsedMs = 0
    sections[index].detail = undefined
    report()
    const phase: PhaseReporter = (detail) => {
      sections[index].detail = detail
      // Also on the console, so a stall can be read off DevTools with timings.
      console.info(`[export] ${entry.label}: ${detail} (+${Date.now() - started}ms)`)
      report()
    }
    try {
      const result = await withTimeout(entry.produce(phase), entry.label)
      const parts = result === null ? [] : Array.isArray(result) ? result : [result]
      produced[index] = parts
      sections[index].state = parts.length === 0 ? 'skipped' : 'done'
      sections[index].elapsedMs = Date.now() - started
      sections[index].detail = undefined
      console.info(`[export] ${entry.label}: ${sections[index].state} in ${sections[index].elapsedMs}ms`)
      report()
    } catch (reason: unknown) {
      if (signal?.aborted) throw new ExportCanceled()
      sections[index].state = 'failed'
      sections[index].elapsedMs = Date.now() - started
      sections[index].error = reason instanceof Error ? reason.message : String(reason)
      console.error(`[export] ${entry.label} failed after ${sections[index].elapsedMs}ms`, reason)
      report()
      throw reason
    }
  }

  const indexed = tasks.map((entry, index) => ({ entry, index }))
  try {
    // Lead leads, but nothing queues behind it: its route map is waiting on
    // network tiles, so it runs alongside every stage that follows.
    const leadInFlight = indexed
      .filter(({ entry }) => entry.stage === STAGE.lead)
      .map(({ entry, index }) => run(entry, index))
    // Swallowed here and re-awaited below, so a Lead failure cannot surface as
    // an unhandled rejection while a later stage is still running.
    const leadSettled = Promise.allSettled(leadInFlight)

    const laterStages = Array.from(
      new Set(
        indexed
          .filter(({ entry }) => entry.stage !== STAGE.lead)
          .map(({ entry }) => entry.stage)
      )
    ).sort((left, right) => left - right)

    for (const stage of laterStages) {
      throwIfAborted(signal)
      const inStage = indexed.filter(({ entry }) => entry.stage === stage)
      activity(
        `${STAGE_NAMES[stage] ?? `stage ${stage}`}: ${inStage.length} section${
          inStage.length === 1 ? '' : 's'
        }`
      )
      await mapWithConcurrency(inStage, RENDER_CONCURRENCY, ({ entry, index }) =>
        run(entry, index)
      )
    }

    activity('waiting for the Lead route map')
    for (const result of await leadSettled) {
      if (result.status === 'rejected') throw result.reason
    }
  } finally {
    window.clearInterval(ticker)
  }
  throwIfAborted(signal)

  // Built in dependency order above; bound in print-view order here.
  activity('collating pages into one document')
  const merged = await PDFDocument.create()
  for (const [position, parts] of produced.entries()) {
    if (parts.length === 0) continue
    activity(`collating ${sections[position].label}`)
    for (const bytes of parts) {
      const source = await PDFDocument.load(bytes)
      const pages = await merged.copyPages(source, source.getPageIndices())
      pages.forEach((page) => merged.addPage(page))
    }
  }

  if (merged.getPageCount() === 0) {
    throw new Error(
      'Nothing to export. Sync the Project Dashboard, then choose the sections to print in Print Layout.'
    )
  }
  activity(`writing ${merged.getPageCount()} pages`)
  const bytes = await merged.save()
  activity('choosing where to save')
  return {
    bytes,
    skipped: sections.filter((section) => section.state === 'skipped').map((s) => s.label)
  }
}
