import type {
  EestimateProject,
  ProjectNode,
  SignatureFooterRow,
  SignatureFooterSettings
} from '../types/project'
import { projectNodePath } from './projectItems'
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

export interface SignatureFooterResolution {
  settings: SignatureFooterSettings
  /** Scope the settings actually came from: `project` or an ancestor node id. */
  sourceScope: string
  /** Human label of that source, for the dashboard cards. */
  sourceName: string
  /** True when this exact scope carries its own settings. */
  isLocal: boolean
}

/**
 * Walk the inheritance ladder for one scope: the scope's own override, then the
 * nearest ancestor component/sub-component that was customized, then the
 * project default. This is what lets a signature entered once on the Project
 * Dashboard reach every component, sub-component, Page and dashboard below it,
 * while any level in between can still take over for its own branch.
 */
export function resolveSignatureFooterSource(
  project: EestimateProject,
  scopeKey = PROJECT_SIGNATURE_SCOPE
): SignatureFooterResolution {
  const overrides = project.signatureFooterOverrides ?? {}
  if (scopeKey !== PROJECT_SIGNATURE_SCOPE) {
    const local = overrides[scopeKey]
    if (local) {
      return {
        settings: normalizeSignatureFooter(local),
        sourceScope: scopeKey,
        sourceName: 'this subject',
        isLocal: true
      }
    }
    // Ancestors come back Title-first, so search from the closest one outwards.
    const ancestors = projectNodePath(project.root, scopeKey)
    for (let index = ancestors.length - 1; index >= 0; index -= 1) {
      const ancestor = ancestors[index]
      const inherited = overrides[ancestor.id]
      if (inherited) {
        return {
          settings: normalizeSignatureFooter(inherited),
          sourceScope: ancestor.id,
          sourceName: ancestor.name,
          isLocal: false
        }
      }
    }
  }
  return {
    settings: normalizeSignatureFooter(project.signatureFooter),
    sourceScope: PROJECT_SIGNATURE_SCOPE,
    sourceName: 'Project Dashboard',
    isLocal: scopeKey === PROJECT_SIGNATURE_SCOPE
  }
}

export function resolveSignatureFooter(
  project: EestimateProject,
  scopeKey = PROJECT_SIGNATURE_SCOPE
): SignatureFooterSettings {
  return resolveSignatureFooterSource(project, scopeKey).settings
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
  .estimate-signature-footer.compact{margin:4mm 0 2mm;padding:3mm 2mm 0}
  .estimate-signature-footer.compact .estimate-signature-line{margin-bottom:2mm}
`

/**
 * How much air the block carries above the signature lines. `compact` is not a
 * style choice — it is the second rung of the placement ladder in
 * `closingBlock.ts`, tried only when the roomy block will not fit the sheet the
 * content actually ends on.
 */
export type ClosingDensity = 'normal' | 'compact'

/**
 * Put the block in normal document flow at the end of the subject. Exported so
 * the closing-block placer can render the same markup at either density and
 * compare what the print engine does with each.
 */
export function injectSubjectEndSignature(
  html: string,
  settings: SignatureFooterSettings,
  density: ClosingDensity = 'normal'
): string {
  const block = signatureFooterBlockHtml(
    settings,
    density === 'compact' ? 'subject-end compact' : 'subject-end'
  )
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
  settings: SignatureFooterSettings,
  density: ClosingDensity = 'normal'
): { html: string; options: PdfOptions } {
  const rows = printableSignatureRows(settings)
  if (!settings.enabled || rows.length === 0) return { html, options }
  if (settings.placement === 'subject_end') {
    return { html: injectSubjectEndSignature(html, settings, density), options }
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
