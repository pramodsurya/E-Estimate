import type {
  EestimateProject,
  ProjectNode,
  SignatureFooterRow,
  SignatureFooterSettings
} from '../types/project'
import { projectNodePath } from './projectItems'

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
