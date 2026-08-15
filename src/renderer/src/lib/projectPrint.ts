/**
 * Project-wide PDF assembly.
 *
 * Only the General Abstract has a layout of its own here. Component pages come
 * from the same `buildCombinedComponentPdf` the component dashboard uses, so a
 * component prints identically either way.
 *
 * The seigniorage and lead generators below are interim: they duplicate layouts
 * that already exist as on-screen previews and are being replaced by those
 * components. The cover page is now the Front Page canvas, and the Introduction
 * is a rich document, so both of those generators have been removed.
 */

import { PDFDocument } from 'pdf-lib'
import type {
  EestimateProject,
  Orientation,
  ProjectNode
} from '../types/project'
import type { RateAnalysisRecipe } from '../types/rateAnalysis'
import type { PdfOptions } from './printRender'
import type { ProjectPrintSettings } from './projectPrintSettings'
import { buildCombinedComponentPdf } from './componentPrint'
import { componentItemsTotal } from './finalNumber'
import type { ProjectAbstract } from './projectAbstract'
import { PERMIT_GO_REFERENCE, seigniorageItemDisplayName } from './seigniorage'
import type { SeigniorageCalculation, SeigniorageItemRow } from './seigniorage'
import {
  LEAD_SIGNATURE_SCOPE,
  PROJECT_SIGNATURE_SCOPE,
  resolveSignatureFooter,
  SEIGNIORAGE_SIGNATURE_SCOPE
} from './signatureFooter'
import { renderSignedPdf as placeClosingBlock } from './closingBlock'

export type {
  ProjectPrintSectionKey,
  ProjectPrintSettings
} from './projectPrintSettings'
export {
  DEFAULT_PROJECT_PRINT_SETTINGS,
  resolveProjectPrintSettings
} from './projectPrintSettings'

export interface ProjectPrintInput {
  project: EestimateProject
  abstract: ProjectAbstract
  seigniorage: SeigniorageCalculation
  recipes: Record<string, RateAnalysisRecipe>
  rateOf: (node: ProjectNode) => number | undefined
  settings: ProjectPrintSettings
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const rupees = (value: number): string =>
  value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const estimateRupees = (value: number): string =>
  value.toLocaleString('en-IN', { maximumFractionDigits: 0 })

const qty = (value: number | null): string =>
  value == null ? '-' : value.toLocaleString('en-IN', { maximumFractionDigits: 3 })

function baseCss(fontScale: number): string {
  return `
    *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    html,body{margin:0;color:#111;background:#fff}
    body{font:${11 * fontScale}px "Times New Roman",serif}
    table{width:100%;border-collapse:collapse;table-layout:fixed}
    th,td{border:1px solid #777;padding:5px 7px;vertical-align:top}
    th{background:#eee;text-align:center;font-family:Arial;font-size:${10 * fontScale}px;
       text-transform:uppercase;letter-spacing:.4px}
    .num{text-align:right;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
    .ctr{text-align:center}
    td{overflow-wrap:anywhere}
  `
}

function pdfOptions(settings: ProjectPrintSettings, orientation?: Orientation): PdfOptions {
  const m = settings.margins
  return {
    pageSize: settings.pageSize,
    landscape: (orientation ?? settings.orientation) === 'landscape',
    // printToPDF margins are inches; the settings are millimetres.
    margins: {
      top: m.top / 25.4,
      bottom: m.bottom / 25.4,
      left: m.left / 25.4,
      right: m.right / 25.4
    },
    printBackground: true,
    scale: 1,
    displayHeaderFooter: false,
    headerTemplate: '<span></span>',
    footerTemplate: '<span></span>',
    preferCSSPageSize: false
  }
}

/**
 * The Introduction page is a rich document now, so the printed pages take their
 * work name from project meta. The cover and introduction sections below are
 * superseded by the Front Page canvas and the document itself.
 */
function workName(project: EestimateProject): string {
  return project.meta.name || project.root.name
}

// ---------------------------------------------------------------------------
// General Abstract
// ---------------------------------------------------------------------------

export function generalAbstractHtml(input: ProjectPrintInput): string {
  const { project, abstract, settings } = input
  const scale = settings.fontPercent / 100
  const nameOfWork = workName(project)

  const rows = abstract.lines
    .map((line) => {
      // TOTAL and GRAND TOTAL span the Sl. No. and description columns, as in
      // the printed abstract they are modelled on.
      const isSummary = line.kind === 'total' || line.kind === 'grand'
      const cells = isSummary
        ? `<td class="ctr summary-label" colspan="2">${escapeHtml(line.label)}:&nbsp;&nbsp;Rs.</td>`
        : `<td class="ctr">${line.slNo ?? ''}</td><td>${escapeHtml(line.label)}</td>`
      const amount = line.kind === 'grand' ? estimateRupees(line.amount) : rupees(line.amount)
      return `<tr class="${isSummary ? line.kind : ''}">${cells}<td class="num">${amount}</td></tr>`
    })
    .join('')

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    ${baseCss(scale)}
    body{padding:0}
    .work{margin-bottom:6mm;font-size:${13 * scale}px;font-weight:700;text-align:center;
          line-height:1.5}
    h1{margin:0 0 6mm;font-size:${16 * scale}px;text-align:center;text-decoration:underline;
       text-underline-offset:4px;letter-spacing:1px}
    td{font-size:${12 * scale}px}
    tr.total td,tr.grand td{background:#eee;font-weight:700}
    tr.grand td{border-top:2px solid #111;font-size:${13 * scale}px}
    .summary-label{text-align:right;padding-right:10mm}
  </style></head><body>
    <div class="work">Name of Work : ${escapeHtml(nameOfWork)}</div>
    <h1>GENERAL ABSTRACT</h1>
    <table>
      <colgroup><col style="width:10%"><col style="width:62%"><col style="width:28%"></colgroup>
      <thead><tr><th>Sl. No.</th><th>Item of Work</th><th>Amount</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </body></html>`
}

// ---------------------------------------------------------------------------
// Seigniorage statement
// ---------------------------------------------------------------------------

export function seigniorageHtml(input: ProjectPrintInput): string | null {
  const { seigniorage, settings } = input
  if (seigniorage.rows.length === 0) return null
  const scale = settings.fontPercent / 100

  const rows = seigniorage.rows
    .map(
      (row: SeigniorageItemRow, index: number) => `<tr>
        <td class="ctr">${index + 1}</td>
        <td><strong>${escapeHtml(seigniorageItemDisplayName(row))}</strong><br><span>${escapeHtml(
          row.description
        )}</span>${
          row.materialLabel ? `<br><small>${escapeHtml(row.materialLabel)}</small>` : ''
        }</td>
        <td class="num">${qty(row.quantity)} ${escapeHtml(row.unit ?? '')}</td>
        <td class="num">${row.seigRate != null ? rupees(row.seigRate) : '-'}</td>
        <td class="num">${row.seigniorage != null ? rupees(row.seigniorage) : '-'}</td>
        <td class="num">${row.dmft != null ? rupees(row.dmft) : '-'}</td>
        <td class="num">${row.smft != null ? rupees(row.smft) : '-'}</td>
        <td class="num">${
          row.permit != null
            ? `${rupees(row.permit)}<span class="pct">@ ${row.permitPercent}%</span>`
            : '-'
        }</td>
      </tr>`
    )
    .join('')

  const permitNote = `Permit fee is charged at 80% of the seigniorage fee for minor minerals and 40% for Colour and Black Granite, per ${escapeHtml(
    PERMIT_GO_REFERENCE
  )}.`

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    ${baseCss(scale)}
    body{padding:0}
    h1{margin:0 0 5mm;font-size:${15 * scale}px;text-align:center;text-decoration:underline;
       text-underline-offset:4px;letter-spacing:1px}
    td{font-size:${10 * scale}px}
    td span{font-size:${9 * scale}px}
    td small{color:#555;font-size:${8.5 * scale}px}
    tr.total td{background:#eee;font-weight:700}
    .pct{display:block;color:#555;font-size:${8.5 * scale}px}
    .note{margin-top:4mm;font-size:${9.5 * scale}px;color:#444}
  </style></head><body>
    <h1>SEIGNIORAGE, DMFT, SMET &amp; PERMIT FEE</h1>
    <table>
      <colgroup><col style="width:4%"><col style="width:26%"><col style="width:12%"><col style="width:10%">
        <col style="width:14%"><col style="width:11%"><col style="width:11%"><col style="width:12%"></colgroup>
      <thead><tr>
        <th>Sl.</th><th>Description</th><th>Quantity</th><th>Rate</th>
        <th>Seigniorage</th><th>DMFT 30%</th><th>SMET 2%</th><th>Permit fee<br>(% of seigniorage)</th>
      </tr></thead>
      <tbody>${rows}
        <tr class="total">
          <td class="ctr"></td><td>TOTAL</td><td></td><td></td>
          <td class="num">${rupees(seigniorage.totalSeigniorage)}</td>
          <td class="num">${rupees(seigniorage.totalDmft)}</td>
          <td class="num">${rupees(seigniorage.totalSmft)}</td>
          <td class="num">${rupees(seigniorage.totalPermit)}</td>
        </tr>
        <tr class="total">
          <td class="ctr"></td><td colspan="6">GRAND TOTAL:  Rs.</td>
          <td class="num">${rupees(seigniorage.grandTotal)}</td>
        </tr>
      </tbody>
    </table>
    <p class="note">${permitNote}</p>
  </body></html>`
}

// ---------------------------------------------------------------------------
// Lead summary
// ---------------------------------------------------------------------------

export function leadHtml(input: ProjectPrintInput): string | null {
  const applications = input.project.leadChart?.applications ?? []
  if (applications.length === 0) return null
  const scale = input.settings.fontPercent / 100

  const rows = applications
    .map(
      (application, index) => `<tr>
        <td class="ctr">${index + 1}</td>
        <td><strong>${escapeHtml(application.itemCode)}</strong></td>
        <td class="num">${qty(application.quantity)} ${escapeHtml(application.unit ?? '')}</td>
        <td class="num">${rupees(application.leadRate)}</td>
        <td class="num">${rupees(application.loadingRate + application.unloadingRate)}</td>
        <td class="num">${rupees(application.liftRate)}</td>
        <td class="num">${rupees(application.grossRate)}</td>
        <td class="num">${rupees(application.netAmount)}</td>
      </tr>`
    )
    .join('')

  const total = applications.reduce((sum, application) => sum + application.netAmount, 0)

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    ${baseCss(scale)}
    body{padding:0}
    h1{margin:0 0 5mm;font-size:${15 * scale}px;text-align:center;text-decoration:underline;
       text-underline-offset:4px;letter-spacing:1px}
    td{font-size:${10 * scale}px}
    tr.total td{background:#eee;font-weight:700}
  </style></head><body>
    <h1>LEAD CHARGES APPLIED</h1>
    <table>
      <colgroup><col style="width:4%"><col style="width:22%"><col style="width:12%"><col style="width:12%">
        <col style="width:14%"><col style="width:10%"><col style="width:12%"><col style="width:14%"></colgroup>
      <thead><tr>
        <th>Sl.</th><th>DATA</th><th>Quantity</th><th>Lead rate</th>
        <th>Load / unload</th><th>Lift</th><th>Gross rate</th><th>Amount</th>
      </tr></thead>
      <tbody>${rows}
        <tr class="total"><td class="ctr"></td><td colspan="6">TOTAL:  Rs.</td>
          <td class="num">${rupees(total)}</td></tr>
      </tbody>
    </table>
  </body></html>`
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

async function renderPdf(html: string, options: PdfOptions): Promise<Uint8Array> {
  const result = await window.api.print.toPdf(html, options)
  if (!result.ok || !result.data) {
    throw new Error(result.error ?? 'Could not render the project print pages.')
  }
  return decodeBase64(result.data)
}

/**
 * The General Abstract, the seigniorage statement and the lead statement are
 * free-flowing documents with no page model of their own, so their signatures
 * are placed against the real print engine rather than simply appended — see
 * `closingBlock.ts`. Otherwise a statement that happens to end near the foot of
 * a sheet signs itself off on a page carrying nothing else.
 */
async function renderSignedPdf(
  project: EestimateProject,
  scopeKey: string,
  html: string,
  options: PdfOptions
): Promise<Uint8Array> {
  return placeClosingBlock(
    { html, options, signature: resolveSignatureFooter(project, scopeKey) },
    renderPdf
  )
}

export async function buildProjectPdf(input: ProjectPrintInput): Promise<Uint8Array> {
  const { project, settings } = input
  const merged = await PDFDocument.create()

  const append = async (bytes: Uint8Array): Promise<void> => {
    const source = await PDFDocument.load(bytes)
    const pages = await merged.copyPages(source, source.getPageIndices())
    pages.forEach((page) => merged.addPage(page))
  }

  if (settings.sections.abstract) {
    await append(
      await renderSignedPdf(
        project,
        PROJECT_SIGNATURE_SCOPE,
        generalAbstractHtml(input),
        pdfOptions(settings, 'portrait')
      )
    )
  }

  // Each component prints exactly as it does from its own dashboard.
  if (settings.sections.components) {
    const components = project.root.children.filter((child) => child.kind === 'component')
    for (const component of components) {
      await append(
        await buildCombinedComponentPdf({
          project,
          section: component,
          recipes: input.recipes,
          rateOf: input.rateOf,
          total: componentItemsTotal(project, component, input.rateOf, true),
          fontScale: settings.fontPercent / 100
        })
      )
    }
  }

  if (settings.sections.seigniorage) {
    const html = seigniorageHtml(input)
    // The seigniorage table is wide, so it always prints landscape.
    if (html) {
      await append(
        await renderSignedPdf(
          project,
          SEIGNIORAGE_SIGNATURE_SCOPE,
          html,
          pdfOptions(settings, 'landscape')
        )
      )
    }
  }

  if (settings.sections.lead) {
    const html = leadHtml(input)
    if (html) {
      await append(
        await renderSignedPdf(
          project,
          LEAD_SIGNATURE_SCOPE,
          html,
          pdfOptions(settings, 'landscape')
        )
      )
    }
  }

  return merged.save()
}
