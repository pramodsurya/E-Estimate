import { PDFDocument } from 'pdf-lib'
import type {
  EestimateProject,
  Margins,
  Orientation,
  PaperSize,
  PrintConfig,
  ProjectNode,
  SignatureFooterSettings
} from '../types/project'
import type { RateAnalysisRecipe, RateAnalysisTextRun } from '../types/rateAnalysis'
import { createUniverWorkbookData } from './univerSpreadsheet'
import { buildPrintHtml, PAPER_MM, PX_PER_MM, type PdfOptions } from './printRender'
import { resolveNodeSettings } from './nodeSettings'
import { descriptionRunsForDisplay, plainTextRun } from './rateAnalysisVisibility'
import { nodeDisplayName } from '../components/nodeVisual'
import { componentItemsTotal, getItemFinal } from './finalNumber'
import { guideWallDetailHtml } from './guideWallPrint'
import { bundDetailPages, BUND_PRINT_MARGINS } from './bundPrint'
import { miSluiceDetailHtml } from './miSluicePrint'
import { migrateBundData } from './bund'
import { migrateGuideWallData } from './guideWall'
import { migrateMiSluiceNewData } from './miSluiceNew'
import { buildDocumentPrintHtml } from './documentPrint'
import {
  injectSubjectEndSignature,
  printableSignatureRows,
  resolveSignatureFooter,
  SIGNATURE_FOOTER_SLOT
} from './signatureFooter'
import { outerHeight, readMeasuredDocument } from './measuredPrintDocument'
import { renderSignedPdf, type PdfRenderer } from './closingBlock'
import {
  chooseSmartAbstractPlan,
  FILL_EACH_PAGE,
  type AbstractDensity,
  type SmartAbstractProfile
} from './smartAbstractPagination'
import { planPageFlow, type FlowBlock, type FlowGeometry } from './pageFlowPlanner'

const DEFAULT_MARGINS: Margins = { top: 20, right: 15, bottom: 20, left: 25 }
// Only lift genuinely tiny renderer text. Normal 11–12 px table/body text and
// larger headings retain their original sizing and page density.
const COMPONENT_MIN_FONT_SIZE = 11

export interface CombinedPrintInput {
  project: EestimateProject
  section: ProjectNode
  recipes: Record<string, RateAnalysisRecipe>
  rateOf: (node: ProjectNode) => number | undefined
  total: number
  fontScale?: number
  /**
   * Abandon a build whose result nobody is waiting for any more.
   *
   * Assembling a component runs one print request per document and merges the
   * results here, in the renderer. Dropping the *result* when a preview closes
   * or its input changes does not stop any of that: the merge keeps parsing and
   * re-serialising PDFs on the only thread that also has to answer the
   * keyboard, so the window stops taking typing while a preview nobody is
   * looking at finishes. This lets the loop stop where it stands.
   */
  signal?: AbortSignal
}

class PrintAbortError extends Error {
  readonly name = 'AbortError'
  constructor() {
    super('Print assembly was cancelled.')
  }
}

/** True when a rejection is just a build that was told to stop. */
export function isPrintAbort(reason: unknown): boolean {
  return reason instanceof Error && reason.name === 'AbortError'
}

/**
 * Quiet period a preview waits out before rebuilding. Long enough to sit
 * through typing and slider drags, short enough that a deliberate edit shows
 * up without the preview feeling stuck.
 */
export const PRINT_REBUILD_DELAY_MS = 450

/**
 * Hand the thread back so the window can paint and take input between
 * documents. Each request is a burst of synchronous parsing and merging; a
 * macrotask boundary between them is what keeps a caret moving.
 */
function yieldToUi(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

interface ItemRender {
  item: ProjectNode
  config: Required<Pick<PrintConfig, 'pageSize' | 'orientation' | 'margins'>> & PrintConfig
  body: string
  scale: number
  description: string
}

interface ComponentPrintRequest {
  html: string
  options: PdfOptions
  signatureScope: string
  /**
   * This document's own page plan already reserved the closing band, so the
   * signature block can be dropped straight in (see `pageFlowPlanner.ts`).
   * Documents that leave pagination to Chromium — every template's detailed
   * estimate, and every template added later — leave this unset and have their
   * closing block placed by `closingBlock.ts` instead.
   */
  closingReserved?: boolean
  /**
   * False while a subject continues into a later document. A bund prints its
   * narrative and its schedules as separate requests because they differ in
   * orientation, but they are one detailed estimate and are signed once.
   */
  carriesClosing?: boolean
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Keep every component-rendered page readable without touching signature
 * fields. This runs before `applySignatureFooterToPdf`, so signature typography
 * is appended afterward with its own intentionally compact sizes.
 *
 * Drawings are left alone as well, and for a different reason. A figure's
 * `font-size` is in *user units* of its own `viewBox`, and every figure here is
 * scaled to the page — a bund cross-section draws in a 470-unit box printed
 * 176 mm wide, so its "8" is 11 px of ink and its "7.5" legend is 10.6 px.
 * Reading those numbers as pixels and lifting them to 11 made the axis ticks
 * 38% larger than drawn and the hearting/casing key twice its size, on labels
 * whose coordinates were worked out for the smaller type — so they printed off
 * their ticks and into each other. Figures size their own text; this rule is
 * for body copy.
 */
export function enforceComponentMinimumFontSize(html: string): string {
  const preserved: string[] = []
  const protect = (block: string): string => {
    const token = `<!--component-preserved-${preserved.length}-->`
    preserved.push(block)
    return token
  }
  const protectedHtml = html
    .replace(
      /<section\b[^>]*\bestimate-signature-footer\b[^>]*>[\s\S]*?<\/section>/gi,
      protect
    )
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, protect)

  const clampAbsolute = (_match: string, value: string, unit: string): string =>
    `font-size:${Math.max(COMPONENT_MIN_FONT_SIZE, Number(value))}${unit}`
  const clampRelative = (_match: string, value: string, unit: string): string => {
    const minimum = unit === '%' ? 100 : 1
    return `font-size:${Math.max(minimum, Number(value))}${unit}`
  }
  const clampShorthand = (_match: string, value: string, unit: string): string =>
    `font:${Math.max(COMPONENT_MIN_FONT_SIZE, Number(value))}${unit}`

  const clamped = protectedHtml
    .replace(/font-size\s*:\s*(\d*\.?\d+)\s*(px|pt)/gi, clampAbsolute)
    .replace(/font-size\s*:\s*(\d*\.?\d+)\s*(%|rem|em)/gi, clampRelative)
    .replace(/font\s*:\s*(\d*\.?\d+)\s*(px|pt)(?=\s|\/)/gi, clampShorthand)
  return clamped.replace(
    /<!--component-preserved-(\d+)-->/g,
    (_token, index: string) => preserved[Number(index)] ?? ''
  )
}

function formatNumber(value: number | null, maximumFractionDigits = 2): string {
  return value === null
    ? ''
    : value.toLocaleString('en-IN', { maximumFractionDigits })
}

function runHtml(run: RateAnalysisTextRun): string {
  let value = escapeHtml(run.text).replace(/\n/g, '<br>')
  if (run.bold) value = `<strong>${value}</strong>`
  if (run.italic) value = `<em>${value}</em>`
  if (run.underline) value = `<u>${value}</u>`
  return value
}

function itemDescription(item: ProjectNode, recipe?: RateAnalysisRecipe): string {
  const runs = recipe?.layout?.descriptionRuns?.length
    ? descriptionRunsForDisplay(recipe.description, recipe.layout.descriptionRuns)
    : [plainTextRun(item.itemDescription || nodeDisplayName(item))]
  return runs.map(runHtml).join('')
}

/**
 * SOR items use their published description as their display name. Showing that
 * name and then the recipe description produced two identical paragraphs in both
 * the Component Abstract and the detailed item header. SSR headings are normally
 * their codes, so their clause remains visible beneath the heading.
 */
function itemHeadingRepeatsDescription(item: ProjectNode, recipe?: RateAnalysisRecipe): boolean {
  const heading = normalizedDescriptionText(nodeDisplayName(item))
  const description = normalizedDescriptionText(
    recipe?.description || item.itemDescription || nodeDisplayName(item)
  )
  return Boolean(heading && description && heading === description)
}

function normalizedDescriptionText(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase()
}

/** Add the same DATA identity block used by an item's own Print Preview. */
function withItemDescription(
  html: string,
  item: ProjectNode,
  recipe: RateAnalysisRecipe | undefined,
  fontScale: number
): string {
  const css = `
    .component-doc-description{font-family:"Times New Roman",serif;color:#111;margin:0 0 14px;line-height:1.45;break-after:avoid;page-break-after:avoid}
    .component-doc-description header{display:flex;justify-content:space-between;gap:16px;margin:0 0 8px;padding-bottom:6px;border-bottom:1px solid #888}
    .component-doc-description header strong{font-size:${18 * fontScale}px}
    .component-doc-description header span{font:12px Arial;color:#555;white-space:nowrap}
    .component-doc-description div{font-size:${14 * fontScale}px;white-space:normal}
  `
  const heading =
    '<section class="component-doc-description">' +
    '<header>' +
    `<strong>${escapeHtml(nodeDisplayName(item))}</strong>` +
    `${item.unit ? `<span>Unit: ${escapeHtml(item.unit)}</span>` : ''}` +
    '</header>' +
    `${itemHeadingRepeatsDescription(item, recipe) ? '' : `<div>${itemDescription(item, recipe)}</div>`}` +
    '</section>'
  const withCss = html.includes('</style>')
    ? html.replace('</style>', `${css}</style>`)
    : html.replace('</head>', `<style>${css}</style></head>`)
  return withCss.replace(/<body[^>]*>/i, (bodyTag) => `${bodyTag}${heading}`)
}

function extractBody(html: string): string {
  const match = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html)
  return match?.[1] ?? html
}

function itemPrintConfig(project: EestimateProject, item: ProjectNode): ItemRender['config'] {
  const inherited = resolveNodeSettings(project.root, item.id)
  return {
    ...item.print,
    range: item.print?.range ?? null,
    pageSize: item.print?.pageSize ?? inherited.pageSize ?? 'A4',
    orientation: item.print?.orientation ?? inherited.orientation ?? 'portrait',
    margins: item.print?.margins ?? inherited.margins ?? DEFAULT_MARGINS,
    scaleMode: item.print?.scaleMode ?? 'fit-width',
    scalePercent: item.print?.scalePercent ?? 100,
    fitToWidthPages: item.print?.fitToWidthPages ?? 1,
    showHeader: false,
    showFooter: false,
    showGridlines: item.print?.showGridlines ?? true,
    repeatHeaderRows: item.print?.repeatHeaderRows ?? 0,
    showRowColHeaders: item.print?.showRowColHeaders ?? false
  }
}

function basePdfOptions(pageSize: PaperSize, orientation: Orientation): PdfOptions {
  return {
    pageSize,
    landscape: orientation === 'landscape',
    margins: { top: 0, right: 0, bottom: 0, left: 0 },
    printBackground: true,
    scale: 1,
    displayHeaderFooter: false,
    headerTemplate: '<span></span>',
    footerTemplate: '<span></span>',
    preferCSSPageSize: false
  }
}

interface ComponentAbstractRow {
  html: string
  textLength: number
}

/**
 * Fallback row height, used only when the document cannot be laid out — the
 * node test scripts, or a frame that failed to mount. Real heights come from
 * `measureAbstractGeometry` and are what the page plan normally runs on.
 */
function componentAbstractRowHeight(
  row: ComponentAbstractRow,
  density: AbstractDensity
): number {
  const textLines = Math.max(2, Math.ceil(row.textLength / 62) + 1)
  const factor = density === 'normal' ? 1 : density === 'compact' ? 0.9 : 0.82
  return Math.max(34, (textLines * 14 + 12) * factor)
}

/* ------------------------------------------------------------------ */
/* Component abstract page frame                                       */
/* ------------------------------------------------------------------ */

/**
 * The abstract's page frame, in millimetres, applied as real print margins.
 *
 * It used to be body padding. Body padding is laid out once for the whole
 * document, so it reaches the top of the first sheet and the foot of the last
 * and nothing in between: every continuation page began hard against the paper
 * edge. Page margins are charged to every sheet, which is what a margin means.
 */
const ABSTRACT_MARGINS: Margins = { top: 16, right: 14, bottom: 16, left: 14 }
/** Absorbs sub-pixel differences between the measuring frame and the printer. */
const ABSTRACT_LAYOUT_SLACK = 6
const ABSTRACT_DENSITIES: AbstractDensity[] = ['normal', 'compact', 'tight']

function abstractPdfOptions(): PdfOptions {
  return {
    ...basePdfOptions('A4', 'portrait'),
    margins: {
      top: ABSTRACT_MARGINS.top / 25.4,
      right: ABSTRACT_MARGINS.right / 25.4,
      bottom: ABSTRACT_MARGINS.bottom / 25.4,
      left: ABSTRACT_MARGINS.left / 25.4
    }
  }
}

function abstractContentWidthPx(): number {
  return (PAPER_MM.A4.w - ABSTRACT_MARGINS.left - ABSTRACT_MARGINS.right) * PX_PER_MM
}

/**
 * Height available on one sheet for the table itself. Every-page signatures
 * live in Chromium's own footer margin, which is deeper than ours, so they take
 * their space here rather than out of the row budget.
 */
function abstractContentHeightPx(placement: SignaturePlacement): number {
  const bottom =
    placement === 'every_page' ? Math.max(ABSTRACT_MARGINS.bottom, 24) : ABSTRACT_MARGINS.bottom
  return (PAPER_MM.A4.h - ABSTRACT_MARGINS.top - bottom) * PX_PER_MM - ABSTRACT_LAYOUT_SLACK
}

type SignaturePlacement = 'every_page' | 'subject_end' | null

/** What one sheet of this abstract spends on things that are not detail rows. */
interface AbstractGeometry {
  header: number
  thead: number
  totalRow: number
  rows: number[]
}

function abstractCss(fontScale: number): string {
  return `
    *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    body{margin:0;padding:0;font:${11 * fontScale}px Arial;color:#111}
    header{display:flex;justify-content:space-between;gap:20px;border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:12px}
    h1{font-size:${18 * fontScale}px;margin:3px 0}.total{font-size:${16 * fontScale}px;font-weight:700}
    table{width:100%;border-collapse:collapse;table-layout:fixed}thead{display:table-header-group}th,td{border:1px solid #777;padding:5px 6px;vertical-align:top;white-space:normal}
    th{background:#eee;text-align:center;line-height:1.2;overflow-wrap:break-word}
    tr{break-inside:avoid;page-break-inside:avoid}.abstract-page-break{break-before:page;page-break-before:always}
    .abstract-sl{text-align:center}.abstract-description{line-height:1.35;overflow-wrap:anywhere;word-break:normal}.abstract-description strong{display:inline-block;margin-bottom:2px}.abstract-unit{text-align:center;overflow-wrap:anywhere}.abstract-number{text-align:right;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
    .abstract-subcomponent td{background:#edf5fa;border-top:2px solid #447a9c}.abstract-subcomponent .abstract-description strong{color:#174d6c}
    .abstract-total td{border-top:2px solid #111;background:#f3f6f8;font-size:${14 * fontScale}px;font-weight:700}.abstract-total td:first-child{text-align:right}
    .abstract-total{break-before:avoid;page-break-before:avoid}
    td span{font-size:${9 * fontScale}px;color:#444}
    .abstract-density-compact header{padding-bottom:7px;margin-bottom:10px}.abstract-density-compact th,.abstract-density-compact td{padding-top:4px;padding-bottom:4px}
    .abstract-density-tight header{padding-bottom:6px;margin-bottom:9px}.abstract-density-tight th,.abstract-density-tight td{padding-top:3px;padding-bottom:3px}
  `
}

const ABSTRACT_COLGROUP =
  '<colgroup><col style="width:5%"><col style="width:54%"><col style="width:7%"><col style="width:10%"><col style="width:10%"><col style="width:14%"></colgroup>'
const ABSTRACT_THEAD =
  '<thead><tr><th>Sl.</th><th>Description</th><th>Unit</th><th>Quantity</th><th>Rate</th><th>Amount</th></tr></thead>'

/**
 * Lay the whole abstract out once per density and read the real heights back.
 *
 * The markup measured here is the markup that prints, font clamping included —
 * `enforceComponentMinimumFontSize` lifts the 9 px description note to 11 px,
 * and a plan made against 9 px rows would break in the wrong places.
 */
async function measureAbstractGeometry(
  css: string,
  headerHtml: string,
  rows: ComponentAbstractRow[],
  totalRowHtml: string
): Promise<Map<AbstractDensity, AbstractGeometry> | null> {
  if (rows.length === 0) return null
  const blocks = ABSTRACT_DENSITIES.map((density) => {
    const body = rows
      .map((row, index) => row.html.replace('<tr', `<tr data-abstract-row="${index}"`))
      .join('')
    const total = totalRowHtml.replace('<tr', '<tr data-abstract-total="1"')
    return (
      `<div class="abstract-density-${density}" data-abstract-measure="${density}">${headerHtml}` +
      `<table>${ABSTRACT_COLGROUP}${ABSTRACT_THEAD}<tbody>${body}${total}</tbody></table></div>`
    )
  }).join('')
  const html = enforceComponentMinimumFontSize(
    `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${blocks}</body></html>`
  )

  return readMeasuredDocument(html, abstractContentWidthPx(), (doc) => {
    const measured = new Map<AbstractDensity, AbstractGeometry>()
    for (const density of ABSTRACT_DENSITIES) {
      const block = doc.querySelector(`[data-abstract-measure="${density}"]`)
      if (!block) return null
      const heights = new Array<number>(rows.length).fill(0)
      block.querySelectorAll('[data-abstract-row]').forEach((row) => {
        const index = Number(row.getAttribute('data-abstract-row'))
        if (Number.isInteger(index) && index >= 0 && index < heights.length) {
          heights[index] = outerHeight(row)
        }
      })
      // A single unmeasured row would be planned as weightless, so one bad
      // reading discards the whole profile rather than half-trusting it.
      if (heights.some((height) => !(height > 0))) return null
      measured.set(density, {
        header: outerHeight(block.querySelector('header')),
        thead: outerHeight(block.querySelector('thead')),
        totalRow: outerHeight(block.querySelector('[data-abstract-total]')),
        rows: heights
      })
    }
    return measured
  })
}

/**
 * Height the subject-end signature block takes out of the closing page. It is
 * the same block `closingBlock.ts` will inject, measured rather than assumed.
 */
async function measureAbstractClosing(
  css: string,
  signature: SignatureFooterSettings,
  placement: SignaturePlacement
): Promise<number | null> {
  if (placement !== 'subject_end') return 0
  const html = injectSubjectEndSignature(
    enforceComponentMinimumFontSize(
      `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head>` +
        `<body>${SIGNATURE_FOOTER_SLOT}</body></html>`
    ),
    signature
  )
  return readMeasuredDocument(html, abstractContentWidthPx(), (doc) => {
    const block = doc.querySelector('.estimate-signature-footer')
    const height = outerHeight(block)
    return height > 0 ? height : null
  })
}

/** Estimated frame, used on the same fallback path as the estimated rows. */
function estimatedAbstractGeometry(
  rows: ComponentAbstractRow[],
  density: AbstractDensity,
  fontScale: number
): AbstractGeometry {
  return {
    header: 47 * fontScale + 22,
    thead: 13.2 * fontScale + 12,
    totalRow: 16 * fontScale + 13,
    rows: rows.map((row) => componentAbstractRowHeight(row, density) * fontScale)
  }
}

async function abstractHtml(
  input: CombinedPrintInput,
  section: ProjectNode,
  items: ProjectNode[],
  total: number,
  subcomponentSummaries: Array<{ section: ProjectNode; total: number }> = []
): Promise<string> {
  const fontScale = input.fontScale ?? 1
  const itemRows: ComponentAbstractRow[] = items.map((item, index) => {
    const final = getItemFinal(input.project, item, input.rateOf(item), true)
    const heading = nodeDisplayName(item)
    const description = itemDescription(item, input.recipes[item.id])
    const repeatsHeading = itemHeadingRepeatsDescription(item, input.recipes[item.id])
    const descriptionCell = repeatsHeading
      ? `<strong>${escapeHtml(heading)}</strong>`
      : `<strong>${escapeHtml(heading)}</strong><br><span>${description}</span>`
    return {
      html: `<tr><td class="abstract-sl">${index + 1}</td><td class="abstract-description">${descriptionCell}</td><td class="abstract-unit">${escapeHtml(item.unit ?? final.unit ?? '')}</td><td class="abstract-number">${formatNumber(final.qty, 3)}</td><td class="abstract-number">${formatNumber(final.rate)}</td><td class="abstract-number abstract-amount">${formatNumber(final.amount)}</td></tr>`,
      textLength: heading.length + (repeatsHeading ? 0 : description.replace(/<[^>]*>/g, '').length)
    }
  })
  const summaryRows: ComponentAbstractRow[] = subcomponentSummaries.map(
    ({ section: subcomponent, total: subcomponentTotal }, index) => ({
      html: `<tr class="abstract-subcomponent"><td class="abstract-sl">S${index + 1}</td><td class="abstract-description"><strong>${escapeHtml(subcomponent.name)}</strong><br><span>Sub-component · separate General Abstract follows</span></td><td class="abstract-unit">LS</td><td class="abstract-number"></td><td class="abstract-number"></td><td class="abstract-number abstract-amount">${formatNumber(subcomponentTotal)}</td></tr>`,
      textLength: subcomponent.name.length + 53
    })
  )
  const abstractLabel =
    section.kind === 'subcomponent' ? 'Sub-component General Abstract' : 'Component Abstract'
  const totalLabel =
    section.kind === 'subcomponent' ? 'Sub-component Total' : 'Component Total'
  const detailRows = [...itemRows, ...summaryRows]
  const signatureSettings = resolveSignatureFooter(input.project, section.id)
  const hasSignatures =
    signatureSettings.enabled && printableSignatureRows(signatureSettings).length > 0
  const placement: SignaturePlacement = hasSignatures ? signatureSettings.placement : null

  const css = abstractCss(fontScale)
  const headerHtml =
    `<header><div><small>${escapeHtml(input.project.meta.name)}</small>` +
    `<h1>${escapeHtml(section.name)}</h1><b>${abstractLabel}</b></div>` +
    `<div class="total">Rs. ${total.toLocaleString('en-IN')}</div></header>`
  const totalRowHtml =
    `<tr class="abstract-total"><td colspan="5">${totalLabel}</td>` +
    `<td class="abstract-number">Rs. ${total.toLocaleString('en-IN')}</td></tr>`

  const [measured, measuredClosing] = await Promise.all([
    measureAbstractGeometry(css, headerHtml, detailRows, totalRowHtml),
    measureAbstractClosing(css, signatureSettings, placement)
  ])
  // A closing block that could not be measured still has to be paid for.
  const closing = measuredClosing ?? (placement === 'subject_end' ? 145 : 0)
  const available = abstractContentHeightPx(placement)

  const profiles: SmartAbstractProfile<ComponentAbstractRow>[] = ABSTRACT_DENSITIES.map(
    (density) => {
      const geometry =
        measured?.get(density) ?? estimatedAbstractGeometry(detailRows, density, fontScale)
      const flow = available - geometry.thead
      const closingPage = flow - geometry.totalRow - closing
      return {
        density,
        rows: detailRows.map((row, index) => ({
          value: row,
          height: geometry.rows[index],
          detail: true
        })),
        // The heading prints once, at the top of the first sheet; every later
        // sheet repeats only the table head, so it has that much more room.
        capacities: {
          first: flow - geometry.header,
          continuation: flow,
          finalFirst: closingPage - geometry.header,
          finalContinuation: closingPage
        }
      }
    }
  )
  // Each sheet is filled as far as it goes. An SSR clause row is five or six
  // times the height of a General Abstract provision, so holding rows back to
  // stock the closing page costs a quarter of the sheet before it.
  const pagePlan = chooseSmartAbstractPlan(profiles, FILL_EACH_PAGE)
  const bodies = pagePlan.pages.map((page, pageIndex) => {
    const pageBreak = pageIndex > 0 ? ' abstract-page-break' : ''
    const detailHtml = page.rows.map((row) => row.value.html).join('')
    const totalRow = page.isFinal ? totalRowHtml : ''
    return `<tbody class="${page.isFinal ? 'abstract-final-block' : 'abstract-page-block'}${pageBreak}">${detailHtml}${totalRow}</tbody>`
  }).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head>` +
    `<body class="abstract-density-${pagePlan.density}">${headerHtml}` +
    `<table>${ABSTRACT_COLGROUP}${ABSTRACT_THEAD}${bodies}</table>` +
    `${SIGNATURE_FOOTER_SLOT}</body></html>`
}

/* ------------------------------------------------------------------ */
/* Measurement-sheet page planning                                     */
/* ------------------------------------------------------------------ */

/** Vertical padding of the grouped item document (10mm top + 10mm bottom). */
const GROUP_BODY_PADDING_MM = 20
/** Chromium's reserved footer margin when signatures print on every page. */
const EVERY_PAGE_SIGNATURE_MM = 24
/** The subject-end signature block sits in flow, so only the last page pays. */
const SUBJECT_END_SIGNATURE_MM = 36
/**
 * Row heights come from the sheet itself and are exact; headings are estimated
 * and Chromium does the real layout. Plan against slightly less than the true
 * page so an estimate that runs long stays on its page — a page planned a touch
 * short only reads as slightly loose, one planned a touch tall re-creates the
 * stranded row this whole path exists to remove.
 */
const LAYOUT_SAFETY = 0.95
/** Fallback when a row carries no explicit height. */
const DEFAULT_SHEET_ROW_PX = 24

interface SheetOwner {
  scale: number
  margins: Margins
  heading: string
  contd: string
  open: string
  prefix: string
  close: string
}

type SheetBlockValue =
  | { kind: 'heading'; owner: SheetOwner }
  | { kind: 'row'; owner: SheetOwner; html: string }
  | { kind: 'raw'; owner: SheetOwner; html: string }

function parseSheetRows(
  body: string
): { open: string; prefix: string; close: string; rows: { html: string; height: number }[] } | null {
  const table = /(<table\b[^>]*>)([\s\S]*?)(<\/table>)/i.exec(body)
  if (!table) return null
  const before = body.slice(0, table.index).trim()
  const after = body.slice((table.index ?? 0) + table[0].length).trim()
  // Charts and floating images are positioned against the whole sheet, so a
  // body that is not exactly one table is kept intact rather than split.
  if (before || after) return null
  const inner = table[2]
  const tbody = /<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i.exec(inner)
  if (!tbody) return null
  const raw = tbody[1].match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) ?? []
  if (raw.length === 0) return null
  return {
    open: table[1],
    prefix: inner.slice(0, tbody.index),
    close: table[3],
    rows: raw.map((html) => {
      const declared = /\bheight:\s*([\d.]+)px/i.exec(html)
      return { html, height: declared ? Number(declared[1]) : DEFAULT_SHEET_ROW_PX }
    })
  }
}

/**
 * The item heading is the one block whose height is not declared anywhere: it
 * depends on how the description wraps. Over-estimate deliberately — spare
 * height costs a little slack, missing height costs a page break.
 */
function headingHeightPx(description: string, fontScale: number, widthPx: number): number {
  const bodyFont = 12 * fontScale
  const titleFont = 15 * fontScale
  const text = description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  const charsPerLine = Math.max(24, Math.floor(widthPx / (bodyFont * 0.48)))
  const lines = Math.max(1, Math.ceil(text.length / charsPerLine))
  const chrome = 6 + 5 + titleFont * 1.3 + 5 + 8
  return Math.ceil((chrome + lines * bodyFont * 1.4) * 1.12)
}

function sheetPageGeometry(
  pageSize: PaperSize,
  orientation: Orientation,
  signaturePlacement: 'every_page' | 'subject_end' | null,
  bannerPx: number,
  contdPx: number,
  fontScale: number
): FlowGeometry {
  const paper = PAPER_MM[pageSize]
  const pageHeightMm = orientation === 'landscape' ? paper.w : paper.h
  const footerMm = signaturePlacement === 'every_page' ? EVERY_PAGE_SIGNATURE_MM : 0
  const body = (pageHeightMm - GROUP_BODY_PADDING_MM - footerMm) * PX_PER_MM * LAYOUT_SAFETY
  return {
    body,
    // The section banner prints once, at the top of the very first page.
    opening: bannerPx,
    // Every continuation gets a "contd." lead; pages that happen to open on a
    // fresh item simply run a little loose.
    continuationLead: contdPx,
    closing:
      signaturePlacement === 'subject_end'
        ? SUBJECT_END_SIGNATURE_MM * PX_PER_MM
        : 12 * fontScale
  }
}

function renderSheetPage(blocks: FlowBlock<SheetBlockValue>[], repeatsLead: boolean): string {
  const parts: string[] = []
  let index = 0
  while (index < blocks.length) {
    const owner = blocks[index].value.owner
    const run: SheetBlockValue[] = []
    while (index < blocks.length && blocks[index].value.owner === owner) {
      run.push(blocks[index].value)
      index += 1
    }
    const pieces: string[] = []
    // A page that opens mid-item still has to say which item it belongs to.
    if (parts.length === 0 && repeatsLead && run[0].kind !== 'heading') {
      pieces.push(owner.contd)
    }
    let cursor = 0
    while (cursor < run.length) {
      const block = run[cursor]
      if (block.kind === 'heading') {
        pieces.push(`<div class="item-start">${owner.heading}</div>`)
        cursor += 1
        continue
      }
      if (block.kind === 'raw') {
        pieces.push(`<div class="sheet" style="zoom:${owner.scale}">${block.html}</div>`)
        cursor += 1
        continue
      }
      const rows: string[] = []
      while (cursor < run.length && run[cursor].kind === 'row') {
        rows.push((run[cursor] as { html: string }).html)
        cursor += 1
      }
      pieces.push(
        `<div class="sheet" style="zoom:${owner.scale}">` +
          `${owner.open}${owner.prefix}<tbody>${rows.join('')}</tbody>${owner.close}` +
          '</div>'
      )
    }
    parts.push(
      `<section class="item-flow" style="padding-left:${owner.margins.left}mm;padding-right:${owner.margins.right}mm">${pieces.join('')}</section>`
    )
  }
  return parts.join('')
}

function groupHtml(
  group: ItemRender[],
  projectName: string,
  fontScale: number,
  section: Pick<ProjectNode, 'name'>,
  signaturePlacement: 'every_page' | 'subject_end' | null = null
): string {
  const paper = PAPER_MM[group[0].config.pageSize]
  const pageWidthMm =
    group[0].config.orientation === 'landscape' ? paper.h : paper.w

  const blocks: FlowBlock<SheetBlockValue>[] = []
  for (const { item, config, body, scale, description } of group) {
    const margins = config.margins
    const contentWidthPx = (pageWidthMm - margins.left - margins.right) * PX_PER_MM
    const heading =
      '<div class="item-heading"><div>' +
      `<strong>${escapeHtml(nodeDisplayName(item))}</strong>` +
      `${item.unit ? `<span>Unit: ${escapeHtml(item.unit)}</span>` : ''}` +
      `</div><p>${description}</p></div>`
    const parsed = parseSheetRows(body)
    const owner: SheetOwner = {
      scale,
      margins,
      heading,
      contd:
        '<div class="item-contd">' +
        `<strong>${escapeHtml(nodeDisplayName(item))}</strong><span>contd.</span>` +
        '</div>',
      open: parsed?.open ?? '',
      prefix: parsed?.prefix ?? '',
      close: parsed?.close ?? ''
    }
    blocks.push({
      value: { kind: 'heading', owner },
      height: headingHeightPx(description, fontScale, contentWidthPx),
      detail: false,
      // The heading is meaningless without the rows it introduces.
      keepWithNext: true
    })
    if (!parsed) {
      blocks.push({
        value: { kind: 'raw', owner, html: body },
        height: 0,
        detail: true
      })
      continue
    }
    for (const row of parsed.rows) {
      blocks.push({
        value: { kind: 'row', owner, html: row.html },
        height: Math.max(1, row.height * (scale || 1)),
        detail: true
      })
    }
  }

  const bannerPx = Math.ceil(7 * PX_PER_MM + 14 + (9 + 14) * 1.3 * fontScale)
  const contdPx = Math.ceil(11 * 1.4 * fontScale + 12)
  const plan = planPageFlow([
    {
      density: 'normal',
      blocks,
      geometry: sheetPageGeometry(
        group[0].config.pageSize,
        group[0].config.orientation,
        signaturePlacement,
        bannerPx,
        contdPx,
        fontScale
      )
    }
  ])

  const sections = plan.pages
    .map(
      (page, pageIndex) =>
        `<div class="flow-page${pageIndex > 0 ? ' flow-page-break' : ''}">` +
        renderSheetPage(page.blocks, page.repeatsLead) +
        '</div>'
    )
    .join('')
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    html,body{margin:0;color:#111;background:#fff;font-family:"Times New Roman",serif}
    body{padding:10mm 0}.section-banner{margin:0 15mm 7mm;padding:7px 9px;border-left:4px solid #447a9c;background:#edf5fa;font-family:Arial}.section-banner small{display:block;color:#4e6675;font-size:${9 * fontScale}px;text-transform:uppercase;letter-spacing:.6px}.section-banner strong{display:block;margin-top:2px;color:#163f57;font-size:${14 * fontScale}px}.item-flow{width:100%;break-inside:auto;margin:0 0 3mm}.item-start{break-inside:avoid;page-break-inside:avoid}.item-heading{border-top:1px solid #888;padding-top:5px;margin-bottom:8px;break-after:avoid;page-break-after:avoid}.item-heading>div{display:flex;justify-content:space-between;gap:12px}.item-heading strong{font-size:${15 * fontScale}px}.item-heading span{font:${11 * fontScale}px Arial}.item-heading p{font-size:${12 * fontScale}px;line-height:1.4;margin:5px 0 0}
    .sheet{transform-origin:top left}.sheet table{border-collapse:collapse;table-layout:fixed}.sheet td,.sheet th{word-break:break-word}
    .flow-page{break-inside:avoid;page-break-inside:avoid}.flow-page-break{break-before:page;page-break-before:always}
    .item-contd{display:flex;justify-content:space-between;align-items:baseline;gap:12px;border-top:1px solid #888;padding-top:4px;margin-bottom:6px;font-family:Arial}.item-contd strong{font-size:${11 * fontScale}px}.item-contd span{font-size:${9 * fontScale}px;color:#666;font-style:italic}
    @media print{.item-flow{break-inside:auto}.item-start{break-inside:avoid;page-break-inside:avoid}}
  </style></head><body data-project="${escapeHtml(projectName)}"><div class="section-banner"><small>Detailed Estimate</small><strong>${escapeHtml(section.name)}</strong></div>${sections}</body></html>`
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

export async function buildCombinedComponentPdf(input: CombinedPrintInput): Promise<Uint8Array> {
  const stopIfCancelled = (): void => {
    if (input.signal?.aborted) throw new PrintAbortError()
  }
  stopIfCancelled()

  const renderItems = (items: ProjectNode[]): ItemRender[] => items.map((item) => {
      const config = itemPrintConfig(input.project, item)
      if (item.itemEditorType === 'document') {
        return {
          item,
          config,
          body: `<div class="document-content" style="font-size:${12 * (input.fontScale ?? 1)}px">${escapeHtml(item.document?.trim() || 'No document content saved.').replace(/\n/g, '<br>')}</div>`,
          scale: 1,
          description: itemDescription(item, input.recipes[item.id])
        }
      }
      const built = buildPrintHtml(
        createUniverWorkbookData(item) as never,
        config,
        { pageSize: config.pageSize, orientation: config.orientation, margins: config.margins },
        { projectName: input.project.meta.name, title: nodeDisplayName(item) },
        item.charts ?? []
      )
      return {
        item,
        config,
        // Spreadsheet cell formatting is deliberately preserved. The master
        // report font controls descriptions/abstract/document text; users keep
        // precise Excel fonts, row heights and column widths in the sheet editor.
        body: extractBody(built.html),
        scale: built.pdfOptions.scale,
        description: itemDescription(item, input.recipes[item.id])
      }
    })

  const itemPageRequests = (
    section: ProjectNode,
    items: ProjectNode[]
  ): ComponentPrintRequest[] => {
    if (items.length === 1 && items[0].itemEditorType === 'document') {
      const item = items[0]
      const config = itemPrintConfig(input.project, item)
      const built = buildDocumentPrintHtml(
        item,
        config,
        {
          pageSize: config.pageSize,
          orientation: config.orientation,
          margins: config.margins
        },
        { projectName: input.project.meta.name, title: nodeDisplayName(item) }
      )
      return built.empty
        ? []
        : [{
            html: withItemDescription(
              built.html,
              item,
              input.recipes[item.id],
              input.fontScale ?? 1
            ),
            options: built.pdfOptions,
            signatureScope: section.id
          }]
    }
    const groups = new Map<string, ItemRender[]>()
    for (const entry of renderItems(items)) {
      const key = `${entry.config.pageSize}:${entry.config.orientation}`
      groups.set(key, [...(groups.get(key) ?? []), entry])
    }
    // The page planner has to know what the signature block will take before
    // it decides where the rows break, so resolve it here rather than after.
    const signature = resolveSignatureFooter(input.project, section.id)
    const placement =
      signature.enabled && printableSignatureRows(signature).length > 0
        ? signature.placement
        : null
    return Array.from(groups.values()).map((group) => {
      const first = group[0]
      return {
        html: groupHtml(
          group,
          input.project.meta.name,
          input.fontScale ?? 1,
          section,
          placement
        ),
        options: basePdfOptions(first.config.pageSize, first.config.orientation),
        signatureScope: section.id,
        closingReserved: true
      }
    })
  }

  const documentPageRequests = (page: ProjectNode): ComponentPrintRequest[] => {
    const config = itemPrintConfig(input.project, page)
    const built = buildDocumentPrintHtml(
      page,
      config,
      {
        pageSize: config.pageSize,
        orientation: config.orientation,
        margins: config.margins
      },
      { projectName: input.project.meta.name, title: page.name }
    )
    return built.empty
      ? []
      : [{ html: built.html, options: built.pdfOptions, signatureScope: page.id }]
  }

  const directItems = sectionOwnedItems(input.section)
  const subcomponents = input.section.kind === 'component'
    ? input.section.children.filter((child) => child.kind === 'subcomponent')
    : []
  const subcomponentSummaries = subcomponents.map((section) => ({
    section,
    total: componentItemsTotal(input.project, section, input.rateOf, true)
  }))
  const requests: ComponentPrintRequest[] = [{
    html: await abstractHtml(
      input,
      input.section,
      directItems,
      input.total,
      subcomponentSummaries
    ),
    options: abstractPdfOptions(),
    signatureScope: input.section.id,
    closingReserved: true
  }]

  // Component-template detailed estimate (drawings + measurement tables) replaces
  // its generated DATA rows, but ordinary supporting pages still follow it.
  const bundData = input.section.templateId === 'bund' ? input.section.bund : undefined
  const sluiceData =
    input.section.templateId === 'mi-sluice-new' ? input.section.miSluiceNew : undefined
  const hasComponentDetail =
    (input.section.templateId === 'guide-wall' && Boolean(input.section.guideWall)) ||
    Boolean(bundData) ||
    Boolean(sluiceData)
  if (hasComponentDetail) {
    const settings = resolveNodeSettings(input.project.root, input.section.id)
    const pageSize = settings.pageSize ?? 'A4'
    const orientation = settings.orientation ?? 'portrait'
    const margins = settings.margins ?? DEFAULT_MARGINS
    if (bundData) {
      // A bund mixes portrait narrative with landscape schedules, and one print
      // request carries a single orientation — so each page set is rendered as
      // its own PDF and merged. Margins default narrow: these sheets are wide.
      const bundMargins = settings.margins ?? BUND_PRINT_MARGINS
      const bundPages = bundDetailPages(
        input.project,
        input.section,
        migrateBundData(bundData),
        input.fontScale ?? 1,
        input.recipes
      )
      bundPages.forEach((page, index) => {
        requests.push({
          html: page.html,
          options: {
            ...basePdfOptions(pageSize, page.orientation),
            margins: {
              top: bundMargins.top / 25.4,
              bottom: bundMargins.bottom / 25.4,
              left: bundMargins.left / 25.4,
              right: bundMargins.right / 25.4
            }
          },
          signatureScope: input.section.id,
          // One detailed estimate, printed as several documents only because a
          // print request carries a single orientation. It is signed at its end,
          // not four times over.
          carriesClosing: index === bundPages.length - 1
        })
      })
    } else {
    requests.push({
      html: sluiceData
        ? miSluiceDetailHtml(
            input.project,
            input.section,
            migrateMiSluiceNewData(sluiceData),
            input.fontScale ?? 1,
            input.recipes
          )
        : guideWallDetailHtml(
            input.project,
            input.section,
            migrateGuideWallData(input.section.guideWall!),
            input.fontScale ?? 1,
            input.recipes
          ),
      // Real page margins (inches) so every page of the multi-page detailed
      // estimate honours the component's margin settings, not just the first.
      options: {
        ...basePdfOptions(pageSize, orientation),
        margins: {
          top: margins.top / 25.4,
          bottom: margins.bottom / 25.4,
          left: margins.left / 25.4,
          right: margins.right / 25.4
        }
      },
      signatureScope: input.section.id
    })
    }
  }

  const appendChildrenInTreeOrder = async (section: ProjectNode): Promise<void> => {
    let pendingSpreadsheetItems: ProjectNode[] = []
    let pendingGeometry = ''
    const flushSpreadsheetItems = (): void => {
      if (pendingSpreadsheetItems.length === 0) return
      requests.push(...itemPageRequests(section, pendingSpreadsheetItems))
      pendingSpreadsheetItems = []
      pendingGeometry = ''
    }

    for (const child of section.children) {
      stopIfCancelled()
      if (child.kind === 'page') {
        flushSpreadsheetItems()
        requests.push(...documentPageRequests(child))
      } else if (child.kind === 'item') {
        // Only the template's own generated rows are already covered by the
        // detail pages. Items the user added to a template component by hand
        // are ordinary DATA sheets and must still print after it.
        if (child.templateGenerated) continue
        // Rich DOC items use their exact document print pipeline and therefore
        // form an intentional document boundary. Consecutive spreadsheet DATA
        // items share one HTML/PDF request so Chromium can paginate them as a
        // continuous detailed estimate instead of starting every code on a page.
        if (child.itemEditorType === 'document') {
          flushSpreadsheetItems()
          requests.push(...itemPageRequests(section, [child]))
          continue
        }
        const config = itemPrintConfig(input.project, child)
        const geometry = `${config.pageSize}:${config.orientation}`
        if (pendingGeometry && pendingGeometry !== geometry) flushSpreadsheetItems()
        pendingGeometry = geometry
        pendingSpreadsheetItems.push(child)
      } else if (child.kind === 'subcomponent' || child.kind === 'component') {
        flushSpreadsheetItems()
        const childItems = sectionOwnedItems(child)
        requests.push({
          html: await abstractHtml(
            input,
            child,
            childItems,
            componentItemsTotal(input.project, child, input.rateOf, true)
          ),
          options: abstractPdfOptions(),
          signatureScope: child.id,
          closingReserved: true
        })
        await appendChildrenInTreeOrder(child)
      }
    }
    flushSpreadsheetItems()
  }

  await appendChildrenInTreeOrder(input.section)

  const merged = await PDFDocument.create()
  for (const request of requests) {
    stopIfCancelled()
    await yieldToUi()
    stopIfCancelled()
    const bytes = await renderSignedPdf(
      {
        html: enforceComponentMinimumFontSize(request.html),
        options: request.options,
        signature: resolveSignatureFooter(input.project, request.signatureScope),
        closingReserved: request.closingReserved,
        carriesClosing: request.carriesClosing
      },
      componentPdfRenderer
    )
    const source = await PDFDocument.load(bytes)
    const pages = await merged.copyPages(source, source.getPageIndices())
    pages.forEach((page) => merged.addPage(page))
  }
  return merged.save()
}

const componentPdfRenderer: PdfRenderer = async (html, options) => {
  const result = await window.api.print.toPdf(html, options)
  if (!result.ok || !result.data) {
    throw new Error(result.error ?? 'Could not render component print pages.')
  }
  return decodeBase64(result.data)
}

/** Render one DATA item exactly through the item's own Print Preview pipeline. */
export async function buildItemPrintPdf({
  project,
  item,
  recipe,
  fontScale = 1
}: {
  project: EestimateProject
  item: ProjectNode
  recipe?: RateAnalysisRecipe
  fontScale?: number
}): Promise<Uint8Array> {
  const config = itemPrintConfig(project, item)
  const geometry = {
    pageSize: config.pageSize,
    orientation: config.orientation,
    margins: config.margins
  }
  const context = { projectName: project.meta.name, title: nodeDisplayName(item) }
  const built = item.itemEditorType === 'document'
    ? buildDocumentPrintHtml(item, config, geometry, context)
    : buildPrintHtml(
        createUniverWorkbookData(item) as never,
        config,
        geometry,
        context,
        item.charts ?? []
      )
  if (built.empty) throw new Error(`${nodeDisplayName(item)} has no printable content.`)
  const html = enforceComponentMinimumFontSize(
    withItemDescription(built.html, item, recipe, fontScale)
  )
  return renderSignedPdf(
    {
      html,
      options: built.pdfOptions,
      signature: resolveSignatureFooter(project, item.id)
    },
    async (pageHtml, options) => {
      const result = await window.api.print.toPdf(pageHtml, options)
      if (!result.ok || !result.data) {
        throw new Error(result.error ?? `Could not render ${nodeDisplayName(item)}.`)
      }
      return decodeBase64(result.data)
    }
  )
}

function sectionOwnedItems(section: ProjectNode): ProjectNode[] {
  const items: ProjectNode[] = []
  const visit = (node: ProjectNode): void => {
    for (const child of node.children) {
      if (child.kind === 'item') items.push(child)
      else if (child.kind !== 'component' && child.kind !== 'subcomponent') visit(child)
    }
  }
  visit(section)
  return items
}
