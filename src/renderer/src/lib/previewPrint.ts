/**
 * Turn the markup of an on-screen print preview into printable pages.
 *
 * The preview components already lay their content out as fixed paper-sized
 * pages carrying their own margins. This module wraps that markup in a document
 * the print renderer understands, and reads the paper size and orientation back
 * off the pages themselves, so the export follows whatever each preview's own
 * print settings say without restating them.
 */

import appCss from '../styles/styles.css?inline'
import leafletCss from 'leaflet/dist/leaflet.css?inline'
import type { Orientation, PaperSize } from '../types/project'
import type { PdfOptions } from './printRender'

const PAPER_MM: Record<PaperSize, { w: number; h: number }> = {
  A4: { w: 210, h: 297 },
  A3: { w: 297, h: 420 },
  A2: { w: 420, h: 594 },
  Letter: { w: 216, h: 279 },
  Legal: { w: 216, h: 356 }
}

/** Match a rendered page box back to the paper it was laid out for. */
export function paperFromMm(
  widthMm: number,
  heightMm: number,
  fallback: { pageSize: PaperSize; orientation: Orientation } = {
    pageSize: 'A4',
    orientation: 'portrait'
  }
): { pageSize: PaperSize; orientation: Orientation } {
  if (!(widthMm > 0) || !(heightMm > 0)) return fallback
  const orientation: Orientation = widthMm > heightMm ? 'landscape' : 'portrait'
  const shortSide = Math.min(widthMm, heightMm)
  const longSide = Math.max(widthMm, heightMm)
  let best: PaperSize = fallback.pageSize
  let bestDistance = Number.POSITIVE_INFINITY
  for (const [size, mm] of Object.entries(PAPER_MM) as Array<[PaperSize, { w: number; h: number }]>) {
    const distance = Math.abs(mm.w - shortSide) + Math.abs(mm.h - longSide)
    if (distance < bestDistance) {
      bestDistance = distance
      best = size
    }
  }
  return { pageSize: best, orientation }
}

/**
 * Read a `NNNmm` inline dimension off a rendered page element. Previews size
 * their pages with either `height` or `minHeight`, so both are accepted.
 */
function inlineMm(element: Element, ...properties: Array<'width' | 'height' | 'minHeight'>): number {
  for (const property of properties) {
    const value = (element as HTMLElement).style?.[property] ?? ''
    const match = /^([\d.]+)mm$/.exec(value.trim())
    if (match) return Number(match[1])
  }
  return 0
}

/** A page that names its own orientation in its class list is taken at its word. */
function classOrientation(element: Element): Orientation | null {
  if (element.classList.contains('landscape')) return 'landscape'
  if (element.classList.contains('portrait')) return 'portrait'
  return null
}

export interface PreviewPageRun {
  html: string
  pageSize: PaperSize
  orientation: Orientation
}

/**
 * Split settled preview markup into runs of consecutive pages that share one
 * paper geometry. A print request carries a single page size and orientation,
 * so a preview that mixes portrait and landscape pages becomes several runs.
 */
export function splitPreviewPages(
  html: string,
  pageSelector: string,
  fallback?: { pageSize: PaperSize; orientation: Orientation }
): PreviewPageRun[] {
  const document_ = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  const pages = Array.from(document_.querySelectorAll(pageSelector))
  if (pages.length === 0) return []

  const runs: PreviewPageRun[] = []
  for (const page of pages) {
    const measured = paperFromMm(
      inlineMm(page, 'width'),
      inlineMm(page, 'height', 'minHeight'),
      fallback
    )
    const geometry = { ...measured, orientation: classOrientation(page) ?? measured.orientation }
    const last = runs[runs.length - 1]
    if (last && last.pageSize === geometry.pageSize && last.orientation === geometry.orientation) {
      last.html += page.outerHTML
    } else {
      runs.push({ ...geometry, html: page.outerHTML })
    }
  }
  return runs
}

/**
 * Print overrides for preview markup. The page boxes keep their own padding —
 * that is where each preview's margins live — but stop being fixed-height
 * on-screen cards so a page that overflows continues onto the next sheet.
 */
function previewPrintCss(pageSelector: string, preservePageBox: boolean): string {
  const pageBoxCss = preservePageBox
    ? `${pageSelector}{margin:0!important;border:none!important;border-radius:0!important;
      box-shadow:none!important;overflow:hidden!important;break-after:page;page-break-after:always}`
    : `${pageSelector}{width:auto!important;height:auto!important;min-height:0!important;margin:0!important;
      border:none!important;border-radius:0!important;box-shadow:none!important;overflow:visible!important;
      break-after:page;page-break-after:always}`
  return `
    *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    html,body{margin:0;padding:0;height:auto;min-height:0;overflow:visible;background:#fff;color:#111}
    /* The app hides everything but the active overlay while printing itself. */
    @media print{body,body *{visibility:visible!important}}
    ${pageBoxCss}
    ${pageSelector}:last-child{break-after:auto;page-break-after:auto}
    table{break-inside:auto}
    thead{display:table-header-group}
    tr{break-inside:avoid;page-break-inside:avoid}
    /* On-screen affordances: a page label, edit buttons, map controls. None of
       them belong on paper, and the label alone costs enough height to push a
       sheet that would otherwise fit onto a second page. */
    button,.btn,.btn-mini,.pp-page-tag,.pp-section-heading,.leaflet-control-container{display:none!important}
    /* A total must never be orphaned from the rows it totals. */
    .signature-print-footer,.ga-sheet-total{break-inside:avoid;page-break-inside:avoid}
    tr.ga-row-total,tr.ga-row-grand,.ga-sheet-total{break-before:avoid;page-break-before:avoid}
  `
}

/** Wrap settled preview markup in a standalone printable document. */
export function previewPrintHtml(
  bodyHtml: string,
  pageSelector: string,
  extraCss = '',
  options: { preservePageBox?: boolean } = {}
): string {
  return (
    '<!doctype html><html><head><meta charset="utf-8">' +
    `<style>${appCss}</style><style>${leafletCss}</style>` +
    `<style>${previewPrintCss(pageSelector, options.preservePageBox === true)}${extraCss}</style>` +
    `</head><body>${bodyHtml}</body></html>`
  )
}

/** Page margins live inside the rendered page boxes, so the sheet itself has none. */
export function previewPdfOptions(pageSize: PaperSize, orientation: Orientation): PdfOptions {
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
