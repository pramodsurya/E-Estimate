/**
 * Project Print Studio adapter — General Abstract + book chrome only.
 *
 * Cover, pages, and each component compile from that node's own Print Studio
 * Typst in the project book (`projectPrintBook.ts`). This file does not render
 * components with a generic loop.
 */

import defaultTemplate from './project.typ?raw'
import type { EestimateProject, ProjectNode } from '../../types/project'
import {
  computeProjectPrintInputs,
  projectDashboardIsReady
} from '../projectPrintInputs'
import { normalizePlaceName } from '../placeNormalization'
import {
  printableSignatureRows,
  PROJECT_SIGNATURE_SCOPE,
  resolveSignatureFooter
} from '../signatureFooter'
import {
  applyDocumentSettingsToTypst,
  type DocumentSettings,
  resolveProjectDocumentSettings
} from './documentSettings'
import { EE_ITEM_TABLE_PRELUDE } from './itemTypst'

export const PROJECT_ABSTRACT_SCOPE = 'general-abstract'

const money = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

const percent = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

function zoneLabel(zone: string | undefined): string {
  if (zone === 'zone_1') return 'Zone I'
  if (zone === 'zone_2') return 'Zone II'
  if (zone === 'zone_3') return 'Zone III'
  return ''
}

export interface ProjectAbstractLineData {
  sl: string
  label: string
  amount: string
  kind: string
  basis: string
}

export interface ProjectRenderData {
  layout_kind: 'general-abstract'
  project: string
  year: string
  zone: string
  village: string
  mandal: string
  district: string
  synced: boolean
  title: string
  lines: ProjectAbstractLineData[]
  pages: Array<{ id: string; name: string }>
  signature: Array<{ designation: string; office: string }>
  summary: {
    components: string
    charges: string
    miscellaneous: string
    gst: string
    gst_rate: string
    grand_total: string
  }
  tax: {
    gst_rate: string
    earthwork_percent: string
    earthwork_predominant: boolean
    gst_note: string
  }
}

export function collectProjectComponents(project: EestimateProject): ProjectNode[] {
  return project.root.children.filter((child) => child.kind === 'component')
}

export function buildProjectRenderData(project: EestimateProject): ProjectRenderData {
  const inputs = computeProjectPrintInputs(project)
  const { abstract, gstRate, gstRule, earthworkPercent, earthworkPredominant } =
    inputs
  const location = project.meta.areaAllowance
  const signature = resolveSignatureFooter(project, PROJECT_SIGNATURE_SCOPE)
  const pages = project.root.children
    .filter((child) => child.kind === 'page')
    .map((page) => ({ id: page.id, name: page.name }))

  return {
    layout_kind: 'general-abstract',
    project: project.meta.name || project.root.name,
    year: project.meta.sorYear || '',
    zone: zoneLabel(project.meta.sorZone),
    village: normalizePlaceName(location?.village),
    mandal: normalizePlaceName(location?.mandal),
    district: normalizePlaceName(location?.district || project.meta.location?.label),
    synced: projectDashboardIsReady(project),
    title: 'GENERAL ABSTRACT OF ESTIMATE',
    lines: abstract.lines.map((line) => ({
      sl: line.slNo == null ? '' : String(line.slNo),
      label: line.label,
      amount: money.format(line.amount),
      kind: line.kind,
      basis: line.basisNote ?? ''
    })),
    pages,
    signature: signature.enabled ? printableSignatureRows(signature) : [],
    summary: {
      components: money.format(abstract.componentsTotal),
      charges: money.format(abstract.chargesTotal),
      miscellaneous: money.format(abstract.miscellaneousTotal),
      gst: money.format(abstract.gstAmount),
      gst_rate: String(gstRate),
      grand_total: money.format(abstract.grandTotal)
    },
    tax: {
      gst_rate: String(gstRate),
      earthwork_percent: percent.format(earthworkPercent),
      earthwork_predominant: earthworkPredominant,
      gst_note: gstRule?.description ?? 'Using the default general construction service rate.'
    }
  }
}

export function projectCompileInputs(project: EestimateProject): Record<string, string> {
  return { 'ee-data': JSON.stringify(buildProjectRenderData(project)) }
}

export function projectShadowFiles(_project?: EestimateProject): Record<string, string> {
  return {}
}

export function projectCompilePrelude(): string {
  return EE_ITEM_TABLE_PRELUDE
}

export function projectTypstTemplate(): string {
  return defaultTemplate
}

export function resolveProjectAbstractDocumentSettings(project: EestimateProject): DocumentSettings {
  return {
    ...resolveProjectDocumentSettings(project.projectPrintSettings),
    orientation: 'portrait'
  }
}

export function resolvedProjectTypstSource(project: EestimateProject): string {
  const saved = project.printStudioDocuments?.[PROJECT_ABSTRACT_SCOPE]
  if (saved !== undefined) return saved
  return applyDocumentSettingsToTypst(
    projectTypstTemplate(),
    resolveProjectAbstractDocumentSettings(project)
  )
}
