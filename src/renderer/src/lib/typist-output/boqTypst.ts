/**
 * Bill of Quantities (BOQ) Typst generator.
 *
 * A BOQ is a single flat schedule — project name, component name, then
 * S.No | Code | Description | Quantity | Unit | Rate | Cost with a Total
 * Cost row. Unlike the Component Report it prints no detail sheets: one
 * schedule the estimator can sign, export to PDF, or download as Excel.
 */

import defaultBoqTemplate from './boq.typ?raw'
import { componentCompilePrelude } from './componentTypst'
import { findNode } from '../tree'
import { buildBoqData, buildProjectBoqData, type BoqData } from '../boq'
import { resolveNodeSettingsOverrides } from '../nodeSettings'
import {
  normalizeDocumentSettings,
  parseDocumentSettingsFromTypst,
  resolveProjectDocumentSettings,
  type DocumentSettings
} from './documentSettings'
import type { EestimateProject, ProjectNode } from '../../types/project'

const money = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

const qtyFmt = new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: 3
})

export interface BoqTypstRow {
  sl: string
  code: string
  heading: string
  description: string
  qty: string
  unit: string
  rate: string
  amount: string
}

export interface BoqRenderData {
  project: string
  component: {
    id: string
    name: string
    isSubcomponent: boolean
  }
  rows: BoqTypstRow[]
  totalCost: number
  totalFormatted: string
}

export interface BoqPrintPart {
  scopeKey: string
  label: string
  defaultTypstSource: string
  savedTypstSource?: string
  compileInputs: Record<string, string>
  compilePrelude: string
  runtimeData: BoqRenderData
  projectDocumentSettings: DocumentSettings
  savedDocumentSettings: DocumentSettings | null
}

/** Scope key used to persist the estimator-edited BOQ template. */
export function boqScopeKey(node: ProjectNode): string {
  return `boq-${node.id}`
}

/** Default Typst code for the BOQ schedule. */
export function defaultBoqTypstSource(): string {
  return defaultBoqTemplate
}

export function buildBoqRenderData(
  project: EestimateProject,
  node: ProjectNode,
  rateOf: (item: ProjectNode) => number | undefined = () => undefined
): BoqRenderData {
  const freshNode = project?.root ? findNode(project.root, node.id) ?? node : node
  const boq = buildBoqData(project, freshNode, rateOf)
  return renderDataFromBoq(boq, freshNode.id)
}

function renderDataFromBoq(boq: BoqData, id: string): BoqRenderData {
  return {
    project: boq.projectName,
    component: {
      id,
      name: boq.componentName,
      isSubcomponent: boq.isSubcomponent
    },
    rows: boq.rows.map((row) => ({
      sl: row.sl,
      code: row.code,
      heading: row.heading,
      description: row.description,
      qty: row.quantity != null ? qtyFmt.format(row.quantity) : '—',
      unit: row.unit,
      rate: row.rate != null ? money.format(row.rate) : '—',
      amount: row.amount != null ? money.format(row.amount) : '—'
    })),
    totalCost: boq.totalCost,
    totalFormatted: money.format(boq.totalCost)
  }
}

function resolveBoqDocumentSettings(
  project: EestimateProject,
  node: ProjectNode
): DocumentSettings {
  const savedSource = project.printStudioDocuments?.[boqScopeKey(node)]
  if (savedSource) {
    const parsed = parseDocumentSettingsFromTypst(savedSource)
    if (parsed) return parsed
  }
  const projectSettings = resolveProjectDocumentSettings(project.projectPrintSettings)
  const overrides = resolveNodeSettingsOverrides(project.root, node.id)
  return normalizeDocumentSettings(
    {
      pageSize: overrides.pageSize ?? projectSettings.pageSize,
      orientation: overrides.orientation ?? projectSettings.orientation,
      margins: overrides.margins ?? projectSettings.margins,
      fontFamily: projectSettings.fontFamily,
      fontSizePt: projectSettings.fontSizePt * (overrides.reportFontPercent ?? 100) / 100
    },
    projectSettings
  )
}

/** Scope key for the whole-project BOQ template. */
export function projectBoqScopeKey(): string {
  return 'boq-project'
}

/** The exact Typst payload the project BOQ Print Studio compiles. */
export function resolveProjectBoqPrintPart(
  project: EestimateProject,
  items: ProjectNode[],
  rateOf: (item: ProjectNode) => number | undefined = () => undefined
): BoqPrintPart {
  const scopeKey = projectBoqScopeKey()
  const savedTypstSource = project.printStudioDocuments?.[scopeKey]
  const renderData = renderDataFromBoq(buildProjectBoqData(project, items, rateOf), project.root.id)
  const projectDocumentSettings = resolveProjectDocumentSettings(project.projectPrintSettings)
  return {
    scopeKey,
    label: project.meta.name || project.root.name,
    defaultTypstSource: defaultBoqTypstSource(),
    savedTypstSource,
    compileInputs: { 'ee-data': JSON.stringify(renderData) },
    compilePrelude: componentCompilePrelude(),
    runtimeData: renderData,
    projectDocumentSettings,
    savedDocumentSettings: savedTypstSource
      ? parseDocumentSettingsFromTypst(savedTypstSource)
      : null
  }
}

/** The exact Typst payload the BOQ Print Studio compiles. */
export function resolveBoqPrintPart(
  project: EestimateProject,
  node: ProjectNode,
  rateOf: (item: ProjectNode) => number | undefined = () => undefined
): BoqPrintPart {
  const scopeKey = boqScopeKey(node)
  const savedTypstSource = project.printStudioDocuments?.[scopeKey]
  const renderData = buildBoqRenderData(project, node, rateOf)
  const projectDocumentSettings = resolveBoqDocumentSettings(project, node)
  return {
    scopeKey,
    label: node.name,
    defaultTypstSource: defaultBoqTypstSource(),
    savedTypstSource,
    compileInputs: { 'ee-data': JSON.stringify(renderData) },
    compilePrelude: componentCompilePrelude(),
    runtimeData: renderData,
    projectDocumentSettings,
    savedDocumentSettings: savedTypstSource
      ? parseDocumentSettingsFromTypst(savedTypstSource)
      : null
  }
}
