/**
 * DATA Dashboard print flow.
 *
 * The individual SSR/SOR code dashboard is the source of truth: this module
 * renders that same `RateAnalysisTable` component, with the same application
 * stylesheet, and hands the markup to Chromium so it paginates one code after
 * another continuously across real pages. Nothing is recalculated here — the
 * sheets arrive fully resolved from `collectDataSheets`.
 */

import { renderToStaticMarkup } from 'react-dom/server'
import appCss from '../styles/styles.css?inline'
import RateAnalysisTable from '../components/rateanalysis/RateAnalysisTable'
import type { DataSheet } from './dataSheets'
import { supabase } from './supabase'
import { applySignatureFooterToPdf, DATA_SIGNATURE_SCOPE, resolveSignatureFooter } from './signatureFooter'
import type { PdfOptions } from './printRender'
import type { EestimateProject, Margins, Orientation, PaperSize } from '../types/project'

/** Paper sizes in mm (portrait). */
const PAPER_MM: Record<PaperSize, { w: number; h: number }> = {
  A4: { w: 210, h: 297 },
  A3: { w: 297, h: 420 },
  A2: { w: 420, h: 594 },
  Letter: { w: 215.9, h: 279.4 },
  Legal: { w: 215.9, h: 355.6 }
}

const PX_PER_MM = 96 / 25.4

/**
 * Width the code sheet is designed around on screen. The sheet is laid out at
 * this width and then zoomed to the printable width of the chosen paper, so a
 * larger page shows the same sheet larger instead of reflowing it differently.
 */
const SHEET_DESIGN_WIDTH = 1000

export interface DataSheetPrintGeometry {
  pageSize: PaperSize
  orientation: Orientation
  margins: Margins
  /** Report font scale, 1 = 100%. */
  fontScale: number
}

function noop(): void {
  /* Printed sheets are read-only. */
}

function formatMoney(value: number): string {
  return value.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
}

/**
 * Printed SOR items belong to one schedule, not one document per generated
 * catalogue cell. Keeping them in a single table removes the repeated item
 * heading and lets Chromium continue with the next row in the available space.
 */
function SorPrintTable({ sheets }: { sheets: DataSheet[] }): JSX.Element {
  return (
    <article className="rate-sheet sor-data-sheet sor-print-flow-table">
      <div className="sor-data-title">
        <span>DATA</span>
        <strong>Schedule of Rates</strong>
      </div>
      <table className="sor-data-table">
        <thead>
          <tr>
            <th>Description</th>
            <th>Rate</th>
          </tr>
        </thead>
        <tbody>
          {sheets.map((sheet) => {
            const rate = sheet.sorPrintRate

            return (
              <tr key={sheet.id}>
                <td>{sheet.recipe.description}</td>
                <td>
                  {rate && !rate.hasNumericRate && rate.rateText ? (
                    <div className="sor-published-reference">
                      <small>Printed reference</small>
                      <strong>{rate.rateText}</strong>
                    </div>
                  ) : rate?.hasNumericRate ? (
                    <div className="sor-print-rate">
                      <strong>
                        Rs. {formatMoney(rate.finalRate)} / {sheet.recipe.unit || 'unit'}
                      </strong>
                      {rate.hasLead ? (
                        <small>
                          Base Rs. {formatMoney(rate.baseRate)} + Lead Rs.{' '}
                          {formatMoney(rate.leadRate)} / {sheet.recipe.unit || 'unit'}
                        </small>
                      ) : null}
                    </div>
                  ) : (
                    <strong>Rate not published</strong>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </article>
  )
}

/**
 * Download every published SSR figure once and inline it as a data URL. Blob
 * URLs belong to this window and would not resolve in the print renderer.
 */
async function resolveFigureUrls(sheets: DataSheet[]): Promise<Record<string, string>> {
  const wanted = new Map<string, string>()
  for (const sheet of sheets) {
    for (const figure of sheet.recipe.sourceFigures ?? []) {
      if (!wanted.has(figure.key)) wanted.set(figure.key, figure.objectPath)
    }
  }
  if (wanted.size === 0) return {}

  // Storage downloads have no timeout of their own, and a print must not wait
  // on one for ever: a figure that does not arrive in time is simply left out.
  const withDeadline = <T,>(work: Promise<T>, fallback: T): Promise<T> =>
    Promise.race([work, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), 15000))])

  const entries = await Promise.all(
    Array.from(wanted, async ([key, objectPath]) => {
      const { data, error } = await withDeadline(
        supabase.storage.from('ssr-figures').download(objectPath),
        { data: null, error: new Error('Figure download timed out.') } as never
      )
      if (error || !data) return null
      const dataUrl = await new Promise<string | null>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null)
        reader.onerror = () => resolve(null)
        reader.readAsDataURL(data)
      })
      return dataUrl ? ([key, dataUrl] as const) : null
    })
  )
  return Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => Boolean(entry)))
}

/**
 * Print overrides layered on top of the application stylesheet. Besides
 * removing the on-screen chrome, this gives printed DATA sheets a deliberately
 * low-coverage palette. Colour remains as a small accent, while dark text,
 * rules and weight carry every distinction on a monochrome printer.
 */
function printOverrides(zoom: number): string {
  return `
    *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    /* Margins are real page margins, so every page keeps them — not padding,
       which would only indent the first page. The signature footer lives in
       Chromium's reserved footer band and is deliberately outside them. */
    html,body{margin:0;padding:0;height:auto;min-height:0;overflow:visible;background:#fff;color:#111}
    /* The app hides everything but the active overlay while printing itself. */
    @media print{body,body *{visibility:visible!important}}
    .data-print-flow{zoom:${zoom};color:#181a19}
    .data-print-code{break-inside:auto;page-break-inside:auto}
    .data-print-code+.data-print-code{margin-top:26px;padding-top:24px;border-top:2px solid #66736e}
    .rate-sheet{
      --reconstruction-ink:#181a19;
      --reconstruction-navy:#263a35;
      --reconstruction-teal:#355f57;
      --reconstruction-sky:#f3f5f4;
      --reconstruction-mint:#f7f8f7;
      --reconstruction-amber:#faf8f1;
      --reconstruction-lilac:#f7f6f8;
      --reconstruction-line:#8b9590;
      width:100%;min-width:0;max-width:none;margin:0;padding:0;border-radius:0;
      background:#fff;color:#181a19;box-shadow:none
    }
    /* Large solid bands cost toner and can swallow reversed white type. Pale
       headers keep the hierarchy through borders and weight in colour or mono. */
    .sor-data-title,.rate-sheet-heading{
      background:#eef1ef!important;color:#151716!important;
      border:1px solid #66736e;border-bottom:2px solid #355f57
    }
    .sor-data-table th,.rate-table thead th{
      background:#f0f2f1!important;color:#151716!important;
      border-color:#737d78!important;border-top-width:1.5px!important;
      border-bottom-width:1.5px!important
    }
    .rate-section-title,.rate-section-materials .rate-section-title,
    .rate-section-labour .rate-section-title,.rate-abstract>.rate-section-title{
      color:#263a35!important
    }
    .rate-table tbody tr:nth-child(even):not(.rate-total-row) td{background:#fbfbfb}
    .rate-section-materials .rate-total-row td,
    .rate-section-machinery .rate-total-row td,
    .rate-section-labour .rate-total-row td{background:#f5f6f5}
    .rate-total-row td{border-top:1.5px solid #66736e}
    .stored-abstract-row:nth-child(even){background:#fafafa}
    .stored-abstract-row.total-row,.stored-abstract-row.rate-row{background:#f1f3f2}
    .stored-abstract-row.rate-row{border-top:1.5px solid #66736e;border-bottom:1.5px solid #66736e}
    .labour-component{background:#faf8f1;border-left-color:#7a6b43}
    .published-rate-blocks,.published-rate-blocks-head,
    .percent-variant-data,.percent-variant-head,
    .optional-addition-data,.optional-addition-head,
    .optional-addition-lead-title,.optional-addition-lead-total,
    .dual-measurement-result-title,.dual-measurement-row.is-rate,
    .lead-rate-extension,.lead-rate-extension>.rate-section-title,
    .lead-rate-head,.lead-rate-deduction,.lead-rate-calc,
    .lead-rate-summary.final{background:#f4f6f5!important;color:#202321!important}
    .optional-addition-table th,.optional-addition-total td,
    .optional-addition-rate-summary .is-adopted,
    .optional-addition-rate-summary .is-addition{background:#f7f8f7!important;color:#202321!important}
    .published-rate-block.is-adopted,.dual-measurement-row.is-rate.is-adopted{
      border-color:#52665f;box-shadow:inset 3px 0 0 #52665f
    }
    .lead-rate-warning{background:#faf8f1;color:#574821}
    .sor-published-reference{background:#faf8f1;border-color:#a89a73}
    .sor-published-reference small,.sor-published-reference strong,
    .sor-published-reference span{color:#4d432b}
    .sor-print-flow-table{padding-bottom:0}
    .sor-print-flow-table .sor-data-title{margin-top:0}
    .sor-print-flow-table .sor-data-table thead{display:table-header-group}
    .sor-print-flow-table .sor-data-table tr{break-inside:avoid;page-break-inside:avoid}
    .sor-print-rate{display:flex;flex-direction:column;align-items:flex-end;gap:4px}
    .sor-print-rate small{color:#555;font-size:10px;font-weight:500;line-height:1.35}
    .rate-sheet .rate-section,.rate-sheet .rate-abstract{break-inside:auto;page-break-inside:auto}
    .rate-sheet .rate-section-title,.rate-sheet .rate-document-header,.rate-sheet .rate-sheet-heading{break-after:avoid;page-break-after:avoid}
    .sor-sheet-audit{display:none!important}
    .rate-table thead{display:table-header-group}
    .rate-table tr{break-inside:avoid;page-break-inside:avoid}
    .rate-sheet figure{break-inside:avoid;page-break-inside:avoid}
    .rate-sheet img{max-width:100%;height:auto}
    .rate-row-tools,.rate-sheet button,.rate-sheet .btn,.rate-sheet .btn-mini{display:none!important}
  `
}

/** Build the printable document for a run of resolved code sheets. */
export function buildDataSheetsPrintHtml(
  sheets: DataSheet[],
  geometry: DataSheetPrintGeometry,
  figureUrls: Record<string, string>
): string {
  const paper = PAPER_MM[geometry.pageSize] ?? PAPER_MM.A4
  const width = geometry.orientation === 'landscape' ? paper.h : paper.w
  const printableMm = Math.max(60, width - geometry.margins.left - geometry.margins.right)
  const designWidth = SHEET_DESIGN_WIDTH / (geometry.fontScale || 1)
  const zoom = Number(((printableMm * PX_PER_MM) / designWidth).toFixed(4))

  const bodyParts: string[] = []
  const sorSheets = sheets.filter((sheet) => sheet.recipe.itemSource === 'SOR')
  let sorTableRendered = false

  for (const sheet of sheets) {
    if (sheet.recipe.itemSource === 'SOR') {
      if (!sorTableRendered) {
        bodyParts.push(
          `<section class="data-print-code data-print-sor-flow">${renderToStaticMarkup(
            <SorPrintTable sheets={sorSheets} />
          )}</section>`
        )
        sorTableRendered = true
      }
      continue
    }
    bodyParts.push(
      `<section class="data-print-code">${renderToStaticMarkup(
        <RateAnalysisTable
          recipe={sheet.recipe}
          editing={false}
          onChange={noop}
          leadApplications={sheet.leadApplications}
          leadVariants={sheet.leadVariants}
          figureUrls={figureUrls}
        />
      )}</section>`
    )
  }
  const body = bodyParts.join('')

  return `<!doctype html><html><head><meta charset="utf-8"><style>${appCss}</style><style>${printOverrides(
    zoom
  )}</style></head><body><div class="data-print-flow">${body}</div></body></html>`
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

/**
 * Render every compiled code sheet into one continuous PDF. Chromium performs
 * the pagination, so a code starts in the space left by the previous one and
 * long sheets flow onto the following page.
 */
export async function buildDataSheetsPrintPdf({
  project,
  sheets,
  geometry,
  onPhase = () => undefined
}: {
  project: EestimateProject
  sheets: DataSheet[]
  geometry: DataSheetPrintGeometry
  /** Reports the current step so a caller's progress screen can show it. */
  onPhase?: (detail: string) => void
}): Promise<Uint8Array> {
  if (sheets.length === 0) {
    throw new Error('No compiled SSR/SOR code sheet is available to print.')
  }
  onPhase('downloading published figures')
  const figureUrls = await resolveFigureUrls(sheets)
  onPhase(`laying out ${sheets.length} code sheet${sheets.length === 1 ? '' : 's'}`)
  const html = buildDataSheetsPrintHtml(sheets, geometry, figureUrls)
  onPhase('printing')
  const { margins } = geometry
  const options: PdfOptions = {
    pageSize: geometry.pageSize,
    landscape: geometry.orientation === 'landscape',
    // Real page margins (inches), so the DATA sheets keep them on every page of
    // the flow. The signature footer sits below them in its own band.
    margins: {
      top: margins.top / 25.4,
      right: margins.right / 25.4,
      bottom: margins.bottom / 25.4,
      left: margins.left / 25.4
    },
    printBackground: true,
    scale: 1,
    displayHeaderFooter: false,
    headerTemplate: '<span></span>',
    footerTemplate: '<span></span>',
    preferCSSPageSize: false
  }
  const signed = applySignatureFooterToPdf(
    html,
    options,
    resolveSignatureFooter(project, DATA_SIGNATURE_SCOPE)
  )
  const result = await window.api.print.toPdf(signed.html, signed.options)
  if (!result.ok || !result.data) {
    throw new Error(result.error ?? 'Could not render the DATA Dashboard print pages.')
  }
  return decodeBase64(result.data)
}
