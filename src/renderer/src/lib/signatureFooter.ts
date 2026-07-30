import type {
  EestimateProject,
  ProjectNode,
  SignatureFooterRow,
  SignatureFooterSettings
} from '../types/project'
import type { PdfOptions } from './printRender'

export const PROJECT_SIGNATURE_SCOPE = 'project'
export const DATA_SIGNATURE_SCOPE = 'dashboard:data'
export const LEAD_SIGNATURE_SCOPE = 'dashboard:lead'
export const SEIGNIORAGE_SIGNATURE_SCOPE = 'dashboard:seigniorage'
export const SIGNATURE_FOOTER_SLOT = '<!--estimate-signature-footer-slot-->'

export const DEFAULT_SIGNATURE_FOOTER: SignatureFooterSettings = {
  enabled: false,
  placement: 'subject_end',
  rows: []
}

export function normalizeSignatureFooter(
  value: SignatureFooterSettings | undefined
): SignatureFooterSettings {
  if (!value) return DEFAULT_SIGNATURE_FOOTER
  return {
    enabled: value.enabled === true,
    placement: value.placement === 'every_page' ? 'every_page' : 'subject_end',
    rows: Array.isArray(value.rows)
      ? value.rows.map((row, index) => ({
          id: row.id || `signature-${index + 1}`,
          designation: row.designation ?? '',
          office: row.office ?? ''
        }))
      : []
  }
}

export function resolveSignatureFooter(
  project: EestimateProject,
  scopeKey = PROJECT_SIGNATURE_SCOPE
): SignatureFooterSettings {
  if (scopeKey !== PROJECT_SIGNATURE_SCOPE) {
    const local = project.signatureFooterOverrides?.[scopeKey]
    if (local) return normalizeSignatureFooter(local)
  }
  return normalizeSignatureFooter(project.signatureFooter)
}

/**
 * The Front Page is a clean cover, not a sign-off sheet. All other document
 * pages keep the normal project-default / local-override inheritance.
 */
export function resolveDocumentSignatureFooter(
  project: EestimateProject,
  node: Pick<ProjectNode, 'id' | 'pageTemplate'>
): SignatureFooterSettings {
  return node.pageTemplate === 'front'
    ? DEFAULT_SIGNATURE_FOOTER
    : resolveSignatureFooter(project, node.id)
}

export function hasSignatureFooterOverride(
  project: EestimateProject,
  scopeKey: string
): boolean {
  return scopeKey !== PROJECT_SIGNATURE_SCOPE &&
    Object.prototype.hasOwnProperty.call(project.signatureFooterOverrides ?? {}, scopeKey)
}

export function printableSignatureRows(
  settings: SignatureFooterSettings
): SignatureFooterRow[] {
  return settings.rows.filter(
    (row) => row.designation.trim() !== '' || row.office.trim() !== ''
  )
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function signatureItemsHtml(rows: SignatureFooterRow[]): string {
  return rows
    .map(
      (row) =>
        '<div class="estimate-signature-item">' +
        '<span class="estimate-signature-line"></span>' +
        `<strong>${escapeHtml(row.designation)}</strong>` +
        `<small>${escapeHtml(row.office)}</small>` +
        '</div>'
    )
    .join('')
}

export function signatureFooterBlockHtml(
  settings: SignatureFooterSettings,
  className = ''
): string {
  const rows = printableSignatureRows(settings)
  if (!settings.enabled || rows.length === 0) return ''
  return `<section class="estimate-signature-footer ${className}">${signatureItemsHtml(rows)}</section>`
}

const SUBJECT_END_CSS = `
  .estimate-signature-footer{display:flex;align-items:flex-end;justify-content:space-between;gap:8mm;width:100%;margin:12mm 0 4mm;padding:8mm 2mm 0;break-inside:avoid;page-break-inside:avoid;color:#111;font-family:Arial,sans-serif}
  .estimate-signature-item{flex:1 1 0;min-width:0;text-align:center}
  .estimate-signature-line{display:block;width:78%;margin:0 auto 3mm;border-top:1px solid #333}
  .estimate-signature-item strong,.estimate-signature-item small{display:block;overflow-wrap:anywhere}
  .estimate-signature-item strong{font-size:10pt}
  .estimate-signature-item small{margin-top:1mm;font-size:8.5pt;color:#444}
`

function injectSubjectEndSignature(
  html: string,
  settings: SignatureFooterSettings
): string {
  const block = signatureFooterBlockHtml(settings, 'subject-end')
  if (!block) return html
  const withCss = html.includes('</style>')
    ? html.replace('</style>', `${SUBJECT_END_CSS}</style>`)
    : html.replace('</head>', `<style>${SUBJECT_END_CSS}</style></head>`)
  if (withCss.includes(SIGNATURE_FOOTER_SLOT)) {
    return withCss.replace(SIGNATURE_FOOTER_SLOT, block)
  }
  return withCss.replace(/<\/body>/i, `${block}</body>`)
}

function footerTemplate(settings: SignatureFooterSettings): string {
  const rows = printableSignatureRows(settings)
  const items = rows
    .map(
      (row) =>
        '<div style="flex:1;min-width:0;text-align:center;padding:0 5px">' +
        '<span style="display:block;width:78%;margin:0 auto 5px;border-top:1px solid #333"></span>' +
        `<strong style="display:block;font-size:9px;overflow-wrap:anywhere">${escapeHtml(row.designation)}</strong>` +
        `<span style="display:block;margin-top:2px;font-size:8px;color:#555;overflow-wrap:anywhere">${escapeHtml(row.office)}</span>` +
        '</div>'
    )
    .join('')
  return `<div style="box-sizing:border-box;width:100%;padding:0 10mm 4mm;display:flex;align-items:flex-end;gap:10px;font-family:Arial,sans-serif;color:#111">${items}</div>`
}

/**
 * Apply the resolved signature/footer without querying any backend.
 * Every-page mode uses Chromium's reserved footer margin; subject-end mode is
 * inserted into normal document flow and kept together as one clean block.
 */
export function applySignatureFooterToPdf(
  html: string,
  options: PdfOptions,
  settings: SignatureFooterSettings
): { html: string; options: PdfOptions } {
  const rows = printableSignatureRows(settings)
  if (!settings.enabled || rows.length === 0) return { html, options }
  if (settings.placement === 'subject_end') {
    return { html: injectSubjectEndSignature(html, settings), options }
  }
  return {
    html,
    options: {
      ...options,
      margins: {
        ...options.margins,
        // 24 mm minimum keeps the signatures above the physical page edge.
        bottom: Math.max(options.margins.bottom, 24 / 25.4)
      },
      displayHeaderFooter: true,
      footerTemplate: footerTemplate(settings)
    }
  }
}
