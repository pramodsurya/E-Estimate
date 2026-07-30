/**
 * Print rendering for document items, producing the same `PrintRenderResult`
 * shape as `buildPrintHtml` does for spreadsheets. That lets one Print Layout
 * dialog serve both editors — same page controls, same description header, and
 * a real PDF preview either way.
 */

import type { Margins, PaperSize, PrintConfig, ProjectNode } from '../types/project'
import type { PdfOptions, PrintableRender, PrintRenderContext } from './printRender'
import { documentToHtml } from './documentHtml'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function buildDocumentPrintHtml(
  node: ProjectNode,
  config: PrintConfig,
  geom: { pageSize: PaperSize; orientation: 'portrait' | 'landscape'; margins: Margins },
  ctx: PrintRenderContext
): PrintableRender {
  const landscape = geom.orientation === 'landscape'
  const pdfOptions: PdfOptions = {
    pageSize: geom.pageSize,
    landscape,
    margins: {
      top: geom.margins.top / 25.4,
      bottom: geom.margins.bottom / 25.4,
      left: geom.margins.left / 25.4,
      right: geom.margins.right / 25.4
    },
    printBackground: true,
    // Only percentage scaling is meaningful for flowing text; the sheet-fitting
    // modes have no equivalent in a document.
    scale:
      config.scaleMode === 'percent'
        ? Math.min(4, Math.max(0.1, (config.scalePercent ?? 100) / 100))
        : 1,
    displayHeaderFooter: false,
    headerTemplate: '<span></span>',
    footerTemplate: '<span></span>',
    preferCSSPageSize: false
  }

  const body = documentToHtml(node.documentData, node.documentPrintArea)
  if (!body) {
    return { html: '', pdfOptions, empty: true }
  }

  const html =
    '<!doctype html><html><head><meta charset="utf-8"><style>' +
    '*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
    'html,body{margin:0;padding:0;background:#fff;color:#111}' +
    'body{font-family:"Times New Roman",serif;font-size:14px;line-height:1.6}' +
    '.doc-body{position:relative}' +
    '.doc-body p{margin:0 0 8px}' +
    '.doc-body img{max-width:100%;height:auto}' +
    '.document-floating-image{position:absolute;z-index:4;overflow:hidden}' +
    '.document-floating-image img{display:block;width:100%;height:100%;max-width:none;object-fit:fill}' +
    '</style></head><body data-project="' +
    escapeHtml(ctx.projectName) +
    '"><div class="doc-body">' +
    body +
    '</div></body></html>'

  return { html, pdfOptions, empty: false }
}
