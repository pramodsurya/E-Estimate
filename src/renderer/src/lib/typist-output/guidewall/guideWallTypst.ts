/**
 * Guide Wall Typst generator and data adapter.
 *
 * Faithfully mirrors the Guide Wall Detailed Estimate layout algorithm:
 * 1. Engineering Title Banner with component identity & length/interval metrics.
 * 2. Typical cross-sections with to-scale vector SVG drawings, dimension lines, and metre scale bar.
 * 3. Wall concrete measurement tables with chainage ranges, side, length, formula, and quantities.
 * 4. Base slab concrete measurement tables.
 * 5. Excavation measurement tables.
 * 6. Signatures.
 */

import defaultGuideWallTemplate from './guidewall.typ?raw'
import {
  baseMaterialGroups,
  chainageRangeLabel,
  excavationGrandTotal,
  excavationRowLength,
  excavationRowTotal,
  formatChainage,
  migrateGuideWallData,
  quantityRowsTotal,
  sideModeLabel,
  wallMaterialGroups,
  type GuideWallMaterialGroup
} from '../../guideWall'
import { groupSections, sectionSvg } from '../../guideWallPrint'
import { resolveItemDescriptionRuns, EE_ITEM_TABLE_PRELUDE } from '../itemTypst'
import { resolveNodeSettingsOverrides } from '../../nodeSettings'
import { printableSignatureRows, resolveSignatureFooter } from '../../signatureFooter'
import { findNode } from '../../tree'
import {
  applyDocumentSettingsToTypst,
  normalizeDocumentSettings,
  parseDocumentSettingsFromTypst,
  resolveProjectDocumentSettings,
  type DocumentSettings
} from '../documentSettings'
import type { EestimateProject, ProjectNode } from '../../../types/project'
import type { RateAnalysisRecipe, RateAnalysisTextRun } from '../../../types/rateAnalysis'

const fmt3 = (value: number | null | undefined): string =>
  value == null ? '—' : value.toLocaleString('en-IN', { maximumFractionDigits: 3 })

function groupChainageSummary(group: GuideWallMaterialGroup): string {
  const from = Math.min(...group.rows.map((r) => r.fromCh))
  const to = Math.max(...group.rows.map((r) => r.toCh))
  return `${formatChainage(from)}–${formatChainage(to)}`
}

export interface GuideWallFigureData {
  typeCode: string
  caption: string
  svg: string
}

export interface GuideWallQuantityRowData {
  sl: string
  chainage: string
  side: string
  length: string
  formula: string
  qty: string
}

export interface GuideWallMaterialBlockData {
  heading: string
  code: string
  unit: string
  description: string
  descriptionRuns: RateAnalysisTextRun[]
  rows: GuideWallQuantityRowData[]
  total: string
}

export interface GuideWallExcavationRowData {
  sl: string
  fromCh: string
  toCh: string
  length: string
  breadth: string
  height: string
  qty: string
}

export interface GuideWallExcavationBlockData {
  heading: string
  code: string
  unit: string
  description: string
  descriptionRuns: RateAnalysisTextRun[]
  rows: GuideWallExcavationRowData[]
  total: string
}

export interface GuideWallRenderData {
  project: string
  name: string
  code: string
  meta: string
  figures: GuideWallFigureData[]
  wall_groups: GuideWallMaterialBlockData[]
  base_groups: GuideWallMaterialBlockData[]
  excavation: GuideWallExcavationBlockData | null
  signature: Array<{ designation: string; office: string }>
}

export function guideWallScopeKey(node: ProjectNode): string {
  return `guidewall:${node.id}`
}

export function defaultGuideWallTypstSource(): string {
  return defaultGuideWallTemplate
}

export function guideWallCompilePrelude(): string {
  return EE_ITEM_TABLE_PRELUDE
}

export function buildGuideWallRenderData(
  project: EestimateProject,
  section: ProjectNode,
  recipes: Record<string, RateAnalysisRecipe> = {}
): GuideWallRenderData {
  const raw = section.guideWall
  if (!raw) throw new Error('Section does not contain Guide Wall data')
  const data = migrateGuideWallData(raw)
  const items = data.materialItems ?? []

  // 1. Figures: Group identical cross-sections and generate dimensioned SVGs
  const sectionGroups = groupSections(data.sections)
  const figures: GuideWallFigureData[] = sectionGroups.map((group, index) => {
    const ranges = group.ranges.map((r) => `Ch ${chainageRangeLabel(r)}`).join(', ')
    const typeCode = `Type ${String.fromCharCode(65 + index)}`
    const caption = `${typeCode} — ${sideModeLabel(group.sample.sideMode)}. Applies at: ${ranges}`
    const svg = sectionSvg(group.sample)
    return { typeCode, caption, svg }
  })

  // Helper to construct concrete quantity blocks
  const mapQtyGroup = (
    g: GuideWallMaterialGroup,
    role: 'wall' | 'base',
    baseTitle: string,
    isMultiple: boolean
  ): GuideWallMaterialBlockData => {
    const item = items.find((m) => m.role === role && m.code === g.ref.code)
    const itemNode = item ? findNode(project.root, item.itemNodeId) : null
    const descRuns = itemNode ? resolveItemDescriptionRuns(project, itemNode) : []
    const rawDesc = itemNode?.itemDescription || itemNode?.name || ''
    const heading = isMultiple ? `${baseTitle} (Ch ${groupChainageSummary(g)})` : baseTitle
    const headingFull = `${heading} — ${g.ref.code}`
    const unit = g.ref.unit ?? itemNode?.unit ?? 'cum'

    const rows: GuideWallQuantityRowData[] = g.rows.map((row, idx) => ({
      sl: String(idx + 1),
      chainage: chainageRangeLabel(row),
      side: row.side,
      length: fmt3(row.lengthM),
      formula: row.formula,
      qty: fmt3(row.qty)
    }))

    return {
      heading: headingFull,
      code: g.ref.code,
      unit,
      description: rawDesc,
      descriptionRuns: descRuns,
      rows,
      total: fmt3(quantityRowsTotal(g.rows))
    }
  }

  // 2. Wall concrete blocks
  const wallGroups = wallMaterialGroups(data)
  const wall_groups = wallGroups.map((g) =>
    mapQtyGroup(g, 'wall', 'Wall concrete', wallGroups.length > 1)
  )

  // 3. Base slab concrete blocks
  const baseGroups = baseMaterialGroups(data)
  const base_groups = baseGroups.map((g) =>
    mapQtyGroup(g, 'base', 'Base slab concrete', baseGroups.length > 1)
  )

  // 4. Excavation block
  let excavation: GuideWallExcavationBlockData | null = null
  if (data.excavationRows.length > 0 && data.excavationMaterial) {
    const excItem = items.find(
      (m) => m.role === 'excavation' && m.code === data.excavationMaterial!.code
    )
    const excNode = excItem ? findNode(project.root, excItem.itemNodeId) : null
    const excDescRuns = excNode ? resolveItemDescriptionRuns(project, excNode) : []
    const excDesc = excNode?.itemDescription || excNode?.name || ''
    const excUnit = data.excavationMaterial.unit ?? excNode?.unit ?? 'cum'

    const excRows: GuideWallExcavationRowData[] = data.excavationRows.map((row, idx) => ({
      sl: String(idx + 1),
      fromCh: row.fromCh != null ? formatChainage(row.fromCh) : '—',
      toCh: row.toCh != null ? formatChainage(row.toCh) : '—',
      length: fmt3(excavationRowLength(row)),
      breadth: fmt3(row.breadth),
      height: fmt3(row.height),
      qty: fmt3(excavationRowTotal(row))
    }))

    excavation = {
      heading: `Excavation — ${data.excavationMaterial.code}`,
      code: data.excavationMaterial.code,
      unit: excUnit,
      description: excDesc,
      descriptionRuns: excDescRuns,
      rows: excRows,
      total: fmt3(excavationGrandTotal(data.excavationRows))
    }
  }

  // 5. Section metadata string
  const meta = [
    `Total length ${formatChainage(data.lengthM)} m`,
    data.sectionMode === 'continuous'
      ? `sections every ${formatChainage(data.intervalM)} m`
      : `${data.sections.length} marked sections`
  ].join(' · ')

  // 6. Signatures
  const signatureSettings = resolveSignatureFooter(project, section.id)
  const signatureRows = signatureSettings.enabled
    ? printableSignatureRows(signatureSettings)
    : []

  return {
    project: project.meta.name,
    name: section.name,
    code: section.itemCode ?? '',
    meta,
    figures,
    wall_groups,
    base_groups,
    excavation,
    signature: signatureRows
  }
}

export function resolveGuideWallDocumentSettings(
  project: EestimateProject,
  node: ProjectNode
): DocumentSettings {
  const savedSource = project.printStudioDocuments?.[guideWallScopeKey(node)]
  if (savedSource) {
    const parsed = parseDocumentSettingsFromTypst(savedSource)
    if (parsed) return parsed
  }

  // Project print settings are the baseline; node-tree overrides sit on top.
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

export function resolvedGuideWallTypstSource(
  project: EestimateProject,
  node: ProjectNode
): string {
  const key = guideWallScopeKey(node)
  const saved = project.printStudioDocuments?.[key]
  if (saved) return saved

  const settings = resolveGuideWallDocumentSettings(project, node)
  return applyDocumentSettingsToTypst(defaultGuideWallTemplate, settings)
}

export function guideWallCompileInputs(
  project: EestimateProject,
  node: ProjectNode,
  recipes: Record<string, RateAnalysisRecipe> = {}
): Record<string, string> {
  // Guide-wall layout is appended to the Component Typ document, so it reads its
  // own dedicated input (`ee-guidewall`) rather than clashing with `ee-data`.
  return { 'ee-guidewall': JSON.stringify(buildGuideWallRenderData(project, node, recipes)) }
}

/**
 * Guide-wall variables exposed to any Custom layout — the guide-wall data bound to
 * the same self-explanatory names the injected default uses. Prepending this lets a
 * saved (custom) component layout for a guide-wall component reference `figures`,
 * `wall-groups`, `base-groups`, `excavation`, `component-name`, etc. without any
 * injection of the default guide-wall layout.
 */
export function guideWallVariablesPrelude(): string {
  return `#let GW = json(bytes(sys.inputs.at("ee-guidewall")))
#let project-name = GW.project
#let component-name = GW.name
#let component-code = GW.code
#let guidewall-meta = GW.meta
#let figures = GW.figures
#let wall-groups = GW.wall_groups
#let base-groups = GW.base_groups
#let excavation = GW.excavation
#let signature = GW.signature
#let GW_SIGNATURE = GW.at("signature", default: ())`
}

/**
 * Inject the guide-wall detailed-estimate layout onto a Component Typ document.
 * The component typ renders only its banner + Abstract of Estimate; the per-item
 * "every item on its own page" section is removed, the guide-wall layout is
 * inserted after the abstract, and any externally-added (non-template) items are
 * then allowed to flow after it. One signature block is kept at the very end
 * (the component typ's), so the guide-wall layout's own signature is stripped.
 */
export function injectGuideWallLayout(
  componentSource: string,
  project: EestimateProject,
  node: ProjectNode,
  renderData?: { items?: Array<{ templateGenerated?: boolean }> }
): string {
  const section2Mark = '// Section 2: Detailed Estimates (Child Items)'
  const section3Mark = '// Section 3: Signatures'
  const section2Idx = componentSource.indexOf(section2Mark)
  let section1 = componentSource
  let section3 = ''
  if (section2Idx !== -1) {
    const section3Idx = componentSource.indexOf(section3Mark)
    section1 = componentSource.slice(0, section2Idx)
    section3 = section3Idx !== -1 ? componentSource.slice(section3Idx) : ''
  }

  const layout = resolvedGuideWallTypstSource(project, node).replace(
    /\n#if \(GW_SIGNATURE\.len\(\) > 0\) \[[\s\S]*?\n\]\s*$/s,
    ''
  )

  const hasExternal = (renderData?.items ?? []).some((item) => !item.templateGenerated)
  const itemsLoop = hasExternal
    ? '\n\n#for item in EE.items [\n  #if not item.at("templateGenerated", default: false) [\n    #render-component-item(item)\n    #v(12pt)\n  ]\n]\n'
    : ''

  return `${section1.trimEnd()}\n\n#pagebreak(weak: true)\n${layout.trimEnd()}${itemsLoop}\n\n${section3.trimStart()}`
}
