import { useMemo } from 'react'
import { create } from 'zustand'
import type {
  ChartDef,
  ComponentTemplateId,
  ConveyanceClass,
  DataVariantSelection,
  DashboardDataSnapshot,
  EestimateProject,
  BundData,
  BundItemRole,
  GuideWallData,
  GuideWallMaterialRef,
  MiSluiceMaterialRole,
  MiSluiceNewData,
  TemplateMaterialRef,
  LeadApplication,
  ItemEditorType,
  LeadAssignment,
  LeadChart,
  LeadMapDirection,
  LeadPoint,
  LeadPrintSettings,
  LeadVariant,
  PipeLeadSource,
  ProjectLocation,
  ProjectMiscellaneousItem,
  NodeSettings,
  PrintConfig,
  ProjectMeta,
  ProjectNode,
  ProjectDataDefinition,
  ProjectDataDefinitionInput,
  SeignioragePrintSettings,
  ProjectChargeSettings,
  DocumentFinalNumber,
  DocumentPrintArea,
  SpreadsheetDocument
} from '../types/project'
import type { MasterItem } from '../lib/masterData'
import {
  collectProjectItemGroups,
  projectItemKey
} from '../lib/projectItems'
import { PROJECT_DATA_CATEGORY } from '../lib/projectData'
import { canonicalLeadConveyanceClass } from '../lib/leadApplicability'
import {
  normalizeLeadApplications,
  upsertUniqueLeadApplication
} from '../lib/leadApplications'
import { normalizeLeadPrintSettings as normalizeLeadPrintLayoutSettings } from '../lib/leadPrintLayout'
import type { IDocumentData } from '@univerjs/core'
import type { RateAnalysisRecipe } from '../types/rateAnalysis'
import type { RecentEntry } from '../../../preload/index.d'
import {
  addChild,
  addChildren,
  canReorderBetween,
  createDraftProject,
  createNode,
  findNode,
  findParent,
  newId,
  patchNode,
  removeNode,
  reorderSibling,
  resolveItemParent,
  uniqueChildName,
  type ReorderEdge
} from '../lib/tree'
import { defaultGuideWallData, syncGuideWallItems } from '../lib/guideWall'
import {
  applyBundMasterMetadata,
  defaultBundData,
  syncBundItems,
  unresolvedBundMaterialCodes,
  type BundMasterMetadata
} from '../lib/bund'
import {
  applyMiSluiceNewMasterMetadata,
  defaultMiSluiceNewData,
  syncMiSluiceNewItems,
  unresolvedMiSluiceNewMaterialCodes,
  type MiSluiceMasterMetadata
} from '../lib/miSluiceNew'
import { foldsIntoPreviousEntry, MAX_HISTORY, type HistoryRun } from './history'
import { compactProjectForSave, expandLoadedProject } from '../lib/projectFile'

const SSR_ITEM_TABLE = 'ssr_item'

function materialWithVariant<T extends TemplateMaterialRef | null | undefined>(
  ref: T,
  code: string,
  selection: DataVariantSelection
): T {
  if (!ref || ref.code !== code) return ref
  return {
    ...ref,
    unit: selection.unit ?? ref.unit,
    dataVariant: selection
  } as T
}

function guideWallWithVariant(
  data: GuideWallData,
  code: string,
  selection: DataVariantSelection
): GuideWallData {
  return {
    ...data,
    wallMaterial: materialWithVariant(data.wallMaterial, code, selection),
    baseMaterial: materialWithVariant(data.baseMaterial, code, selection),
    excavationMaterial: materialWithVariant(data.excavationMaterial, code, selection),
    sections: data.sections.map((section) => ({
      ...section,
      wallMaterial: materialWithVariant(section.wallMaterial, code, selection),
      baseMaterial: materialWithVariant(section.baseMaterial, code, selection)
    }))
  }
}

function bundWithVariant(
  data: BundData,
  code: string,
  selection: DataVariantSelection
): BundData {
  const pitchingUsesCode = data.pitchingMaterial?.code === code
  return {
    ...data,
    clearanceMaterial: materialWithVariant(data.clearanceMaterial, code, selection),
    strippingMaterial: materialWithVariant(data.strippingMaterial, code, selection),
    formationMaterial: materialWithVariant(data.formationMaterial, code, selection),
    rollingMaterial: materialWithVariant(data.rollingMaterial, code, selection),
    heartingMaterial: materialWithVariant(data.heartingMaterial, code, selection),
    heartingRollingMaterial: materialWithVariant(
      data.heartingRollingMaterial,
      code,
      selection
    ),
    turfingMaterial: materialWithVariant(data.turfingMaterial, code, selection),
    pitchingMaterial: materialWithVariant(data.pitchingMaterial, code, selection),
    pitchingBeddingMaterial:
      pitchingUsesCode && selection.addonId === 'murum_bed_15cm'
        ? null
        : materialWithVariant(data.pitchingBeddingMaterial, code, selection),
    pitchingMetalMaterial: materialWithVariant(data.pitchingMetalMaterial, code, selection),
    horizontalFilterMaterial: materialWithVariant(
      data.horizontalFilterMaterial,
      code,
      selection
    ),
    verticalFilterMaterial: materialWithVariant(data.verticalFilterMaterial, code, selection),
    rockToeMaterial: materialWithVariant(data.rockToeMaterial, code, selection),
    rockToeFilterMaterial: materialWithVariant(data.rockToeFilterMaterial, code, selection),
    rockToeExcavationMaterial: materialWithVariant(
      data.rockToeExcavationMaterial,
      code,
      selection
    ),
    chuteDrainExcavationMaterial: materialWithVariant(
      data.chuteDrainExcavationMaterial,
      code,
      selection
    ),
    chuteDrainLiningMaterial: materialWithVariant(
      data.chuteDrainLiningMaterial,
      code,
      selection
    ),
    soilBands: data.soilBands.map((band) => ({
      ...band,
      material: materialWithVariant(band.material, code, selection)
    })),
    excavationBands: Object.fromEntries(
      Object.entries(data.excavationBands).map(([role, bands]) => [
        role,
        bands.map((band) => ({
          ...band,
          material: materialWithVariant(band.material, code, selection)
        }))
      ])
    ) as BundData['excavationBands'],
    upstreamToe: {
      ...data.upstreamToe,
      excavationMaterial: materialWithVariant(
        data.upstreamToe.excavationMaterial,
        code,
        selection
      ),
      buildMaterial: materialWithVariant(data.upstreamToe.buildMaterial, code, selection)
    },
    downstreamToe: {
      ...data.downstreamToe,
      excavationMaterial: materialWithVariant(
        data.downstreamToe.excavationMaterial,
        code,
        selection
      ),
      buildMaterial: materialWithVariant(data.downstreamToe.buildMaterial, code, selection)
    }
  }
}

function normalizeNode(node: ProjectNode): ProjectNode {
  const children = node.children.map(normalizeNode)
  if (node.kind !== 'item') return { ...node, children }

  const itemCode = node.itemCode?.trim()
  const isSplit = Boolean(node.splitFromItemKey)
  const masterDescription =
    itemCode && !isSplit && node.name !== itemCode
      ? node.itemDescription ?? node.name
      : node.itemDescription

  return {
    ...node,
    children,
    name: isSplit ? node.name : itemCode || node.name,
    itemDescription: masterDescription,
    itemEditorType: node.itemEditorType ?? 'spreadsheet',
    categoryKey: node.itemSource === 'SSR' ? SSR_ITEM_TABLE : node.categoryKey,
    createdDataId: isSplit ? node.createdDataId ?? node.id : node.createdDataId
  }
}

function normalizeRateAnalysisOverrides(
  overrides: Record<string, RateAnalysisRecipe> | undefined
): Record<string, RateAnalysisRecipe> {
  const normalized: Record<string, RateAnalysisRecipe> = {}
  for (const recipe of Object.values(overrides ?? {})) {
    const next =
      recipe.itemSource === 'SSR' && !recipe.itemKey.startsWith('SPLIT:')
        ? {
            ...recipe,
            categoryKey: SSR_ITEM_TABLE,
            itemKey: recipe.dataVariant
              ? `SSR:${SSR_ITEM_TABLE}:${recipe.itemCode}:${recipe.dataVariant.kind}:${recipe.dataVariant.key}`
              : `SSR:${SSR_ITEM_TABLE}:${recipe.itemCode}`
          }
        : recipe
    normalized[next.itemKey] = next
  }
  return normalized
}

function normalizeScopedRateAnalysisOverrides(
  overrides: Record<string, Record<string, RateAnalysisRecipe>> | undefined
): Record<string, Record<string, RateAnalysisRecipe>> {
  return Object.fromEntries(
    Object.entries(overrides ?? {}).map(([scopeNodeId, recipes]) => [
      scopeNodeId,
      normalizeRateAnalysisOverrides(recipes)
    ])
  )
}

function collectSubtreeState(node: ProjectNode): { nodeIds: Set<string>; itemKeys: Set<string> } {
  const nodeIds = new Set<string>()
  const itemKeys = new Set<string>()
  const visit = (current: ProjectNode): void => {
    nodeIds.add(current.id)
    if (current.kind === 'item') itemKeys.add(projectItemKey(current))
    current.children.forEach(visit)
  }
  visit(node)
  return { nodeIds, itemKeys }
}

function withoutKeys<T>(source: Record<string, T> | undefined, keys: Set<string>): Record<string, T> {
  return Object.fromEntries(
    Object.entries(source ?? {}).filter(([key]) => !keys.has(key))
  )
}

function normalizeLeadChart(chart: LeadChart | undefined): LeadChart {
  const variants = Array.isArray(chart?.variants)
    ? chart.variants.map(normalizeLeadVariant)
    : []
  return {
    points: Array.isArray(chart?.points) ? chart.points : [],
    assignments: Array.isArray(chart?.assignments)
      ? chart.assignments.map((assignment) => ({ ...assignment, active: assignment.active !== false }))
      : [],
    itemChoices: Array.isArray(chart?.itemChoices) ? chart.itemChoices : [],
    variants,
    applications: normalizeLeadApplications(
      Array.isArray(chart?.applications) ? chart.applications : [],
      variants
    ),
    mapDirections: Array.isArray(chart?.mapDirections)
      ? chart.mapDirections.map(normalizeLeadMapDirection)
      : [],
    printSettings: normalizeLeadPrintSettings(chart?.printSettings)
  }
}

function normalizeLeadMapDirection(direction: LeadMapDirection): LeadMapDirection {
  return {
    ...direction,
    label: direction.label?.trim() || 'Lead direction',
    color: direction.color || '#0e639c',
    points: Array.isArray(direction.points)
      ? direction.points.filter(
          (point) => Number.isFinite(point.lat) && Number.isFinite(point.lon)
        )
      : [],
    active: direction.active !== false,
    createdAt: direction.createdAt || new Date().toISOString()
  }
}

function normalizeLeadPrintSettings(settings: LeadPrintSettings | undefined): LeadPrintSettings {
  return normalizeLeadPrintLayoutSettings(settings)
}

function nextProjectDataCode(definitions: ProjectDataDefinition[]): string {
  const highest = definitions.reduce((max, definition) => {
    const match = /^DATA-SOR-(\d+)$/i.exec(definition.code.trim())
    return match ? Math.max(max, Number(match[1])) : max
  }, 0)
  return `DATA-SOR-${String(highest + 1).padStart(3, '0')}`
}

function miSluiceNewWithVariant(
  data: MiSluiceNewData,
  code: string,
  selection: DataVariantSelection
): MiSluiceNewData {
  const materials = { ...data.materials }
  for (const role of Object.keys(materials) as MiSluiceMaterialRole[]) {
    materials[role] = materialWithVariant(materials[role], code, selection)
  }
  return { ...data, materials }
}

function normalizeLeadVariant(variant: LeadVariant): LeadVariant {
  const materialName = /\b(?:mur+um|mor+um)\b/i.test(variant.materialName)
    ? 'Earth'
    : variant.materialName
  return {
    ...variant,
    materialName,
    viaPointIds: Array.isArray(variant.viaPointIds)
      ? variant.viaPointIds.filter((pointId) => typeof pointId === 'string' && pointId.length > 0)
      : [],
    routeGeometry: Array.isArray(variant.routeGeometry)
      ? variant.routeGeometry.filter(
          (point) => Number.isFinite(point.lat) && Number.isFinite(point.lon)
        )
      : undefined,
    firstMileGeometry: Array.isArray(variant.firstMileGeometry)
      ? variant.firstMileGeometry.filter(
          (point) => Number.isFinite(point.lat) && Number.isFinite(point.lon)
        )
      : undefined,
    lastMileGeometry: Array.isArray(variant.lastMileGeometry)
      ? variant.lastMileGeometry.filter(
          (point) => Number.isFinite(point.lat) && Number.isFinite(point.lon)
        )
      : undefined,
    firstMileMode: variant.firstMileMode === 'manual' ? 'manual' : 'auto',
    firstMileKm: Number.isFinite(variant.firstMileKm) ? Math.max(variant.firstMileKm!, 0) : 0,
    lastMileMode: variant.lastMileMode === 'manual' ? 'manual' : 'auto',
    lastMileKm: Number.isFinite(variant.lastMileKm) ? Math.max(variant.lastMileKm!, 0) : 0,
    roadRouteKm: Number.isFinite(variant.roadRouteKm)
      ? Math.max(variant.roadRouteKm!, 0)
      : undefined,
    pipeLead: variant.pipeLead
      ? {
          ...variant.pipeLead,
          handlingIncluded: [...variant.pipeLead.handlingIncluded]
        }
      : undefined,
    conveyanceClass: canonicalLeadConveyanceClass(variant.materialName, variant.conveyanceClass),
    active: variant.active !== false
  }
}

function normalizeLeadSelection(selection: LeadSelection): LeadSelection {
  if (!selection.conveyanceClass) return selection
  const materialName = /\b(?:mur+um|mor+um)\b/i.test(selection.materialName)
    ? 'Earth'
    : selection.materialName
  return {
    ...selection,
    materialName,
    pipeLead: selection.pipeLead
      ? {
          ...selection.pipeLead,
          handlingIncluded: [...selection.pipeLead.handlingIncluded]
        }
      : undefined,
    conveyanceClass: canonicalLeadConveyanceClass(
      materialName,
      selection.conveyanceClass as ConveyanceClass
    )
  }
}

/** Backfill fields that older `.eestimate` files may lack. */
/**
 * Every project carries a Front Page and an Introduction, in that order, as the
 * first children of the Title. Applied on load as well as on creation, so
 * projects made before these pages existed pick them up when next opened.
 */
function ensurePinnedPages(root: ProjectNode): ProjectNode {
  const pinned: Array<{ template: 'front' | 'introduction'; name: string }> = [
    { template: 'front', name: 'Front Page' },
    { template: 'introduction', name: 'Introduction' }
  ]
  let children = root.children
  // Inserted back to front so the declared order above is what ends up on top.
  for (const { template, name } of [...pinned].reverse()) {
    if (children.some((child) => child.pageTemplate === template)) continue
    children = [createNode('page', name, { pageTemplate: template }), ...children]
  }
  return children === root.children ? root : { ...root, children }
}

function normalizeLoaded(rawData: EestimateProject): EestimateProject {
  // Files written compacted carry their recipe indexes as id lists; put the
  // maps back before anything reads the snapshot.
  const data = expandLoadedProject(rawData)
  const normalizedRoot = normalizeNode(data.root)
  return {
    ...data,
    meta: {
      ...data.meta,
      sorZone: data.meta.sorZone ?? 'zone_3',
      areaAllowancePercent: data.meta.areaAllowancePercent ?? 0,
      flags: data.meta.flags ?? [],
      taxSettings: data.meta.taxSettings ?? {
        mode: 'automatic',
        recipientType: 'CENTRAL_STATE_UT_LOCAL'
      }
    },
    id: data.id || newId(),
    root: ensurePinnedPages(normalizedRoot),
    leadChart: normalizeLeadChart(data.leadChart),
    rateAnalysisOverrides: normalizeRateAnalysisOverrides(data.rateAnalysisOverrides),
    rateAnalysisScopedOverrides: normalizeScopedRateAnalysisOverrides(
      data.rateAnalysisScopedOverrides
    ),
    miscellaneousItems: (data.miscellaneousItems ?? []).filter(
      (item) => item.name.trim() && Number.isFinite(item.cost) && item.cost >= 0
    ),
    earthworkOverrides: data.earthworkOverrides ?? {}
  }
}

export type AppView = 'home' | 'newproject' | 'project'
export type ActivityView =
  | 'explorer'
  | 'search'
  | 'lead'
  | 'data'
  | 'sourcecontrol'

export type DataDashboardSection = 'dashboard' | 'created' | 'catalogue' | 'rates'

interface AddItemState {
  open: boolean
  parentId: string | null
}

interface AddPageState {
  open: boolean
  parentId: string | null
}

interface AddStructureState {
  open: boolean
  kind: 'component' | 'subcomponent'
  parentId: string | null
}

interface SettingsState {
  open: boolean
  nodeId: string | null
}

export interface AnalysisSelection {
  key: string
  nodeId: string
  recipeOnly: boolean
  /** Structural branch selected from DATA. Missing means the shared DATA recipe. */
  scopeNodeId?: string
}

export interface LeadSelection {
  materialName: string
  conveyanceClass?: string
  variantId?: string
  pipeLead?: PipeLeadSource
}

export interface SeigniorageSelection {
  seigCode: string | null
  materialKey?: string | null
}

interface StoreState {
  view: AppView
  activity: ActivityView
  dataDashboardSection: DataDashboardSection
  project: EestimateProject | null
  filePath: string | null
  dirty: boolean
  selectedId: string | null
  renamingId: string | null
  expanded: Record<string, boolean>
  recent: RecentEntry[]
  globalSearch: string
  explorerFilter: string
  past: EestimateProject[]
  future: EestimateProject[]
  addItem: AddItemState
  addPage: AddPageState
  addStructure: AddStructureState
  settings: SettingsState
  exportPdfOpen: boolean
  analysisSelection: AnalysisSelection | null
  leadSelection: LeadSelection | null
  seigniorageSelection: SeigniorageSelection | null

  // lifecycle
  loadRecent: () => Promise<void>
  restoreLastSession: () => Promise<void>
  setActivity: (a: ActivityView) => void
  setDataDashboardSection: (section: DataDashboardSection) => void
  setGlobalSearch: (q: string) => void
  setExplorerFilter: (q: string) => void

  // project lifecycle
  goHome: () => void
  startNewProject: () => void
  createProject: (meta: ProjectMeta) => void
  openProjectFromDisk: () => Promise<void>
  openRecent: (path: string) => Promise<void>
  saveProject: () => Promise<void>
  saveProjectAs: () => Promise<void>
  closeProject: () => void

  // tree
  select: (id: string | null) => void
  toggleExpand: (id: string) => void
  setExpanded: (id: string, value: boolean) => void
  beginRename: (id: string) => void
  cancelRename: () => void
  renameNode: (id: string, name: string) => void
  createPage: (parentId: string, name: string) => void
  addComponent: (parentId?: string) => void
  addSubcomponent: (parentId: string) => void
  createStructureNode: (
    name: string,
    location: ProjectLocation | null,
    templateId?: ComponentTemplateId
  ) => void
  setGuideWall: (nodeId: string, data: GuideWallData) => void
  setGuideWallMaterial: (
    nodeId: string,
    role: 'wall' | 'base' | 'excavation',
    item: MasterItem,
    sectionId?: string
  ) => void
  resetGuideWallSectionMaterial: (
    nodeId: string,
    role: 'wall' | 'base',
    sectionId: string
  ) => void
  setBund: (nodeId: string, data: BundData) => void
  setBundMaterial: (nodeId: string, role: BundItemRole, item: MasterItem) => void
  setMiSluiceNew: (nodeId: string, data: MiSluiceNewData) => void
  setMiSluiceNewMaterial: (
    nodeId: string,
    role: MiSluiceMaterialRole,
    item: MasterItem
  ) => void
  resolveMiSluiceNewMaterials: (nodeId: string, masters: MasterItem[]) => string[]
  /**
   * Fill in master metadata for every bund material still held as a bare code.
   * Returns the codes that remain unresolved so the caller can retry rather
   * than latching a one-shot guard on a lookup that may have failed.
   */
  resolveBundMaterials: (nodeId: string, masters: MasterItem[]) => string[]
  setTemplateCodeVariant: (
    nodeId: string,
    code: string,
    selection: DataVariantSelection
  ) => void
  addCustomItem: (parentId: string, name: string) => void
  addItemsFromMaster: (parentId: string, items: MasterItem[]) => void
  createProjectData: (input: ProjectDataDefinitionInput) => ProjectDataDefinition | null
  updateProjectData: (id: string, input: ProjectDataDefinitionInput) => ProjectDataDefinition | null
  addProjectDataItems: (parentId: string, projectDataIds: string[]) => void
  deleteNode: (id: string) => void
  updateNodeSettings: (id: string, settings: NodeSettings) => void
  setItemEditorType: (id: string, editorType: ItemEditorType) => void
  setNodeDocument: (id: string, text: string) => void
  setNodeSpreadsheet: (id: string, spreadsheet: SpreadsheetDocument) => void
  setNodePrint: (id: string, print: PrintConfig) => void
  addNodeChart: (id: string, chart: ChartDef) => void
  updateNodeChart: (id: string, chartId: string, patch: Partial<ChartDef>) => void
  removeNodeChart: (id: string, chartId: string) => void
  setNodeFinalCell: (id: string, cell: { row: number; column: number } | null) => void
  setNodeRate: (id: string, rate: number | null) => void
  updateMeta: (patch: Partial<ProjectMeta>) => void
  setDashboardSnapshot: (snapshot: DashboardDataSnapshot) => void
  addMiscellaneousItem: (item: Omit<ProjectMiscellaneousItem, 'id' | 'createdAt'>) => void
  removeMiscellaneousItem: (id: string) => void
  setEarthworkOverride: (itemKey: string, value: boolean | null) => void
  upsertLeadPoint: (point: LeadPoint) => void
  removeLeadPoint: (pointId: string) => void
  upsertLeadAssignment: (assignment: LeadAssignment) => void
  removeLeadAssignment: (assignmentId: string) => void
  upsertLeadVariant: (variant: LeadVariant) => void
  removeLeadVariant: (variantId: string) => void
  upsertLeadApplication: (application: LeadApplication) => void
  removeLeadApplication: (applicationId: string) => void
  upsertLeadMapDirection: (direction: LeadMapDirection) => void
  removeLeadMapDirection: (directionId: string) => void
  updateLeadPrintSettings: (settings: LeadPrintSettings) => void
  updateSeignioragePrintSettings: (settings: SeignioragePrintSettings) => void
  updateChargeSettings: (settings: Partial<ProjectChargeSettings>) => void
  updateProjectPrintSettings: (settings: EestimateProject['projectPrintSettings']) => void
  updateSignatureFooter: (
    scopeKey: string,
    settings: EestimateProject['signatureFooter'] | null
  ) => void
  setNodeDocumentData: (id: string, documentData: IDocumentData, plainText: string) => void
  setNodeDocumentFinal: (id: string, documentFinal: DocumentFinalNumber | null) => void
  setNodeDocumentPrintArea: (id: string, documentPrintArea: DocumentPrintArea | null) => void
  /** Drop `dragId` just above or below its sibling `targetId`. */
  reorderNode: (dragId: string, targetId: string, edge: ReorderEdge) => void
  openLeadMaterial: (selection: LeadSelection) => void
  closeLeadMaterial: () => void
  openSeigniorage: (selection?: SeigniorageSelection) => void
  closeSeigniorage: () => void
  openRateAnalysis: (key: string, nodeId: string, recipeOnly?: boolean, scopeNodeId?: string) => void
  closeRateAnalysis: () => void
  saveRateAnalysis: (recipe: RateAnalysisRecipe, scopeNodeId?: string) => void
  restoreRateAnalysisDefaults: (recipe: RateAnalysisRecipe, scopeNodeId?: string) => void

  // modals
  openAddItem: (parentId: string) => void
  closeAddItem: () => void
  openAddPage: (parentId: string) => void
  closeAddPage: () => void
  closeAddStructure: () => void
  openSettings: (nodeId: string) => void
  closeSettings: () => void
  openExportPdf: () => void
  closeExportPdf: () => void

  // undo / redo
  undo: () => void
  redo: () => void
}

const LAST_PROJECT_KEY = 'eestimate:last-project'
const PROJECT_SESSION_PREFIX = 'eestimate:session:'

export interface ProjectSession {
  selectedId: string | null
  expanded: Record<string, boolean>
  activity: ActivityView
  analysisSelection?: AnalysisSelection | null
  leadSelection?: LeadSelection | null
  seigniorageSelection?: SeigniorageSelection | null
}

function sessionKey(path: string): string {
  return `${PROJECT_SESSION_PREFIX}${path}`
}

function readProjectSession(path: string, project: EestimateProject): ProjectSession {
  const fallback: ProjectSession = {
    selectedId: project.root.id,
    expanded: { [project.root.id]: true },
    activity: 'explorer'
  }
  try {
    const parsed = JSON.parse(localStorage.getItem(sessionKey(path)) ?? '') as Partial<ProjectSession>
    return {
      selectedId:
        parsed.selectedId && findNode(project.root, parsed.selectedId)
          ? parsed.selectedId
          : project.root.id,
      expanded:
        parsed.expanded && typeof parsed.expanded === 'object'
          ? parsed.expanded
          : fallback.expanded,
      activity: ['explorer', 'search', 'lead', 'sourcecontrol'].includes(parsed.activity ?? '')
        ? (parsed.activity as ActivityView)
        : 'explorer',
      analysisSelection: parsed.analysisSelection ?? null,
      leadSelection: parsed.leadSelection ? normalizeLeadSelection(parsed.leadSelection) : null,
      seigniorageSelection: parsed.seigniorageSelection ?? null
    }
  } catch {
    return fallback
  }
}

export function persistProjectSession(path: string, session: ProjectSession): void {
  try {
    localStorage.setItem(LAST_PROJECT_KEY, path)
    localStorage.setItem(sessionKey(path), JSON.stringify(session))
  } catch {
    // Session restoration is best-effort and must never block project editing.
  }
}

export const useStore = create<StoreState>((set, get) => {
  /** What produced the newest history entry, and when. */
  let historyRun: HistoryRun | null = null

  /** Any edit that is not part of a run ends it, and so do undo and redo. */
  function endHistoryRun(): void {
    historyRun = null
  }

  /**
   * Apply a pure mutation to the current project, recording undo history.
   *
   * `coalesceKey` names a run of edits that belong together — pass the same key
   * for consecutive saves of one document. Successive edits under one key share
   * a single history entry, so undo returns to before the run rather than into
   * the middle of it.
   */
  function mutate(
    fn: (root: ProjectNode, project: EestimateProject) => ProjectNode,
    coalesceKey?: string
  ): void {
    set((s) => {
      if (!s.project) return s
      const nextRoot = fn(s.project.root, s.project)
      const next: EestimateProject = {
        ...s.project,
        root: nextRoot,
        updatedAt: new Date().toISOString()
      }
      const now = Date.now()
      const folds = foldsIntoPreviousEntry(historyRun, coalesceKey, now, s.past.length)
      historyRun = coalesceKey ? { key: coalesceKey, at: now } : null
      return {
        project: next,
        past: folds ? s.past : [...s.past, s.project].slice(-MAX_HISTORY),
        future: [],
        dirty: true
      }
    })
  }

  function mutateProject(fn: (project: EestimateProject) => EestimateProject): void {
    endHistoryRun()
    set((s) => {
      if (!s.project) return s
      const next = {
        ...fn(s.project),
        updatedAt: new Date().toISOString()
      }
      return {
        project: next,
        past: [...s.past, s.project].slice(-MAX_HISTORY),
        future: [],
        dirty: true
      }
    })
  }

  return {
    view: 'home',
    activity: 'explorer',
    dataDashboardSection: 'dashboard',
    project: null,
    filePath: null,
    dirty: false,
    selectedId: null,
    renamingId: null,
    expanded: {},
    recent: [],
    globalSearch: '',
    explorerFilter: '',
    past: [],
    future: [],
    addItem: { open: false, parentId: null },
    addPage: { open: false, parentId: null },
    addStructure: { open: false, kind: 'component', parentId: null },
    settings: { open: false, nodeId: null },
    exportPdfOpen: false,
    analysisSelection: null,
    leadSelection: null,
    seigniorageSelection: null,

    loadRecent: async () => {
      try {
        const recent = await window.api.recent.list()
        set({ recent })
      } catch {
        set({ recent: [] })
      }
    },

    restoreLastSession: async () => {
      const path = localStorage.getItem(LAST_PROJECT_KEY)
      if (!path || get().project) return
      await get().openRecent(path)
    },

    setActivity: (a) =>
      set({
        activity: a,
        analysisSelection: null,
        leadSelection: null,
        seigniorageSelection: null
      }),
    setDataDashboardSection: (section) => set({ dataDashboardSection: section }),
    setGlobalSearch: (q) => set({ globalSearch: q }),
    setExplorerFilter: (q) => set({ explorerFilter: q }),

    goHome: () => set({ view: 'home' }),

    startNewProject: () => {
      const draft = createDraftProject()
      set({
        view: 'newproject',
        project: draft,
        filePath: null,
        dirty: false,
        selectedId: draft.root.id,
        expanded: { [draft.root.id]: true },
        past: [],
        future: [],
        addStructure: { open: false, kind: 'component', parentId: null },
        activity: 'explorer',
        analysisSelection: null,
        leadSelection: null,
        seigniorageSelection: null
      })
    },

    createProject: (meta) => {
      const p = get().project
      if (!p) return
      // Every project opens with a Front Page and an Introduction.
      const root = ensurePinnedPages({ ...p.root, name: meta.name || 'Untitled Project' })
      const next: EestimateProject = {
        ...p,
        meta,
        root,
        updatedAt: new Date().toISOString()
      }
      set({
        project: next,
        view: 'project',
        selectedId: root.id,
        expanded: { [root.id]: true },
        dirty: true,
        analysisSelection: null,
        leadSelection: null,
        seigniorageSelection: null
      })
      // Ask for a home immediately. The autosave is gated on the project having
      // a file, so until one is chosen nothing is being kept — and the moment
      // to find that out is now, with an empty project, not after an afternoon
      // of quantities. Cancelling is allowed; `UnsavedProjectNotice` then says
      // plainly that the work is not being saved.
      void get().saveProjectAs()
    },

    openProjectFromDisk: async () => {
      const res = await window.api.project.open()
      if (res.canceled) return
      if (res.error || !res.data) return
      const data = normalizeLoaded(res.data)
      const path = res.path ?? null
      const session = path ? readProjectSession(path, data) : null
      set({
        project: data,
        filePath: path,
        view: 'project',
        selectedId: session?.selectedId ?? data.root.id,
        expanded: session?.expanded ?? { [data.root.id]: true },
        dirty: false,
        past: [],
        future: [],
        addStructure: { open: false, kind: 'component', parentId: null },
        activity: session?.activity ?? 'explorer',
        analysisSelection: session?.analysisSelection ?? null,
        leadSelection: session?.leadSelection ?? null,
        seigniorageSelection: session?.seigniorageSelection ?? null
      })
      if (path) localStorage.setItem(LAST_PROJECT_KEY, path)
      void get().loadRecent()
    },

    openRecent: async (path) => {
      const res = await window.api.project.openPath(path)
      if (res.error || !res.data) {
        if (localStorage.getItem(LAST_PROJECT_KEY) === path) {
          localStorage.removeItem(LAST_PROJECT_KEY)
        }
        void get().loadRecent()
        return
      }
      const data = normalizeLoaded(res.data)
      const session = readProjectSession(path, data)
      set({
        project: data,
        filePath: res.path ?? null,
        view: 'project',
        selectedId: session.selectedId,
        expanded: session.expanded,
        dirty: false,
        past: [],
        future: [],
        addStructure: { open: false, kind: 'component', parentId: null },
        activity: session.activity,
        analysisSelection: session.analysisSelection ?? null,
        leadSelection: session.leadSelection ?? null,
        seigniorageSelection: session.seigniorageSelection ?? null
      })
      localStorage.setItem(LAST_PROJECT_KEY, path)
      void get().loadRecent()
    },

    saveProject: async () => {
      const { project, filePath } = get()
      if (!project) return
      const res = await window.api.project.save(
        compactProjectForSave(project),
        filePath,
        project.meta.name || 'Project'
      )
      if (res.canceled) return
      const savedPath = res.path ?? filePath
      set((state) => ({
        filePath: savedPath,
        dirty: state.project?.updatedAt === project.updatedAt ? false : state.dirty
      }))
      if (savedPath) localStorage.setItem(LAST_PROJECT_KEY, savedPath)
      void get().loadRecent()
    },

    saveProjectAs: async () => {
      const { project } = get()
      if (!project) return
      const res = await window.api.project.saveAs(
        compactProjectForSave(project),
        project.meta.name || 'Project'
      )
      if (res.canceled) return
      const savedPath = res.path ?? null
      set((state) => ({
        filePath: savedPath,
        dirty: state.project?.updatedAt === project.updatedAt ? false : state.dirty
      }))
      if (savedPath) localStorage.setItem(LAST_PROJECT_KEY, savedPath)
      void get().loadRecent()
    },

    closeProject: () => {
      set({
        view: 'home',
        project: null,
        filePath: null,
        dirty: false,
        selectedId: null,
        expanded: {},
        past: [],
        future: [],
        addItem: { open: false, parentId: null },
        addPage: { open: false, parentId: null },
        addStructure: { open: false, kind: 'component', parentId: null },
        settings: { open: false, nodeId: null },
        analysisSelection: null,
        leadSelection: null,
        seigniorageSelection: null
      })
    },

    select: (id) =>
      set({
        selectedId: id,
        analysisSelection: null,
        leadSelection: null,
        seigniorageSelection: null
      }),

    toggleExpand: (id) =>
      set((s) => ({ expanded: { ...s.expanded, [id]: !s.expanded[id] } })),

    setExpanded: (id, value) => set((s) => ({ expanded: { ...s.expanded, [id]: value } })),

    beginRename: (id) => set({ renamingId: id, selectedId: id }),
    cancelRename: () => set({ renamingId: null }),

    renameNode: (id, name) => {
      set({ renamingId: null })
      const trimmed = name.trim()
      if (!trimmed) return
      mutate((root) => patchNode(root, id, { name: trimmed }))
      // Keep project meta name in sync when the Title node is renamed.
      const p = get().project
      if (p && p.root.id === id) {
        set({ project: { ...p, meta: { ...p.meta, name: trimmed } } })
      }
    },

    createPage: (parentId, name) => {
      const trimmed = name.trim()
      if (!trimmed) return
      const page = createNode('page', trimmed, { document: '' })
      mutate((root) => addChild(root, parentId, page))
      set((s) => ({ selectedId: page.id, expanded: { ...s.expanded, [parentId]: true } }))
    },

    addComponent: (parentId) => {
      const p = get().project
      const target = parentId ?? p?.root.id
      if (!target) return
      set({ addStructure: { open: true, kind: 'component', parentId: target } })
    },

    addSubcomponent: (parentId) => {
      set({ addStructure: { open: true, kind: 'subcomponent', parentId } })
    },

    createStructureNode: (name, location, templateId) => {
      const p = get().project
      if (!p) return
      const { kind, parentId } = get().addStructure
      const parent = parentId ?? p.root.id
      const trimmed = name.trim() || (kind === 'component' ? 'New Component' : 'New Sub-component')
      const resolvedName = uniqueChildName(findNode(p.root, parent), trimmed)
      const fallbackLocation = location ?? p.meta.location ?? null
      const node = createNode(kind, resolvedName, {
        location: fallbackLocation,
        ...(templateId === 'guide-wall'
          ? { templateId, guideWall: defaultGuideWallData() }
          : templateId === 'bund'
            ? { templateId, bund: defaultBundData() }
            : templateId === 'mi-sluice-new'
              ? { templateId, miSluiceNew: defaultMiSluiceNewData() }
            : {})
      })
      mutate((root) => addChild(root, parent, node))
      set((s) => ({
        selectedId: node.id,
        expanded: { ...s.expanded, [parent]: true },
        addStructure: { open: false, kind: 'component', parentId: null }
      }))
    },

    setGuideWall: (nodeId, data) => {
      mutate((root) => syncGuideWallItems(patchNode(root, nodeId, { guideWall: data }), nodeId))
    },

    setBund: (nodeId, data) => {
      mutate((root) => syncBundItems(patchNode(root, nodeId, { bund: data }), nodeId))
    },

    setMiSluiceNew: (nodeId, data) => {
      mutate((root) =>
        syncMiSluiceNewItems(patchNode(root, nodeId, { miSluiceNew: data }), nodeId)
      )
    },

    setTemplateCodeVariant: (nodeId, code, selection) => {
      const project = get().project
      const component = project ? findNode(project.root, nodeId) : null
      if (!component) return
      if (component.guideWall) {
        const guideWall = guideWallWithVariant(component.guideWall, code, selection)
        mutate((root) =>
          syncGuideWallItems(patchNode(root, nodeId, { guideWall }), nodeId)
        )
        return
      }
      if (component.bund) {
        const bund = bundWithVariant(component.bund, code, selection)
        mutate((root) => syncBundItems(patchNode(root, nodeId, { bund }), nodeId))
        return
      }
      if (component.miSluiceNew) {
        const miSluiceNew = miSluiceNewWithVariant(component.miSluiceNew, code, selection)
        mutate((root) =>
          syncMiSluiceNewItems(patchNode(root, nodeId, { miSluiceNew }), nodeId)
        )
      }
    },

    setMiSluiceNewMaterial: (nodeId, role, master) => {
      const p = get().project
      const component = p ? findNode(p.root, nodeId) : null
      const data = component?.miSluiceNew
      if (!data) return
      const ref: TemplateMaterialRef = {
        code: master.code,
        description: master.description,
        unit: master.dataVariant?.unit ?? master.unit,
        categoryKey: master.category,
        side: master.side,
        dataVariant: master.dataVariant
      }
      const miSluiceNew = { ...data, materials: { ...data.materials, [role]: ref } }
      mutate((root) =>
        syncMiSluiceNewItems(patchNode(root, nodeId, { miSluiceNew }), nodeId)
      )
    },

    resolveMiSluiceNewMaterials: (nodeId, masters) => {
      const p = get().project
      const component = p ? findNode(p.root, nodeId) : null
      const data = component?.miSluiceNew
      if (!data) return []
      const miSluiceNew = applyMiSluiceNewMasterMetadata(
        data,
        masters as MiSluiceMasterMetadata[]
      )
      const remaining = unresolvedMiSluiceNewMaterialCodes(miSluiceNew)
      mutate((root) =>
        syncMiSluiceNewItems(patchNode(root, nodeId, { miSluiceNew }), nodeId)
      )
      return remaining
    },

    setBundMaterial: (nodeId, role, master) => {
      const p = get().project
      const component = p ? findNode(p.root, nodeId) : null
      const data = component?.bund
      if (!data) return
      // Toe materials live nested in upstreamToe/downstreamToe and are set from
      // the dashboard directly, so they are not in this top-level map.
      const keyByRole: Partial<Record<BundItemRole, keyof BundData>> = {
        clearance: 'clearanceMaterial',
        stripping: 'strippingMaterial',
        formation: 'formationMaterial',
        rolling: 'rollingMaterial',
        casing: 'formationMaterial',
        'casing-rolling': 'rollingMaterial',
        hearting: 'heartingMaterial',
        'hearting-rolling': 'heartingRollingMaterial',
        turfing: 'turfingMaterial',
        pitching: 'pitchingMaterial',
        'pitching-bedding': 'pitchingBeddingMaterial',
        'pitching-metal': 'pitchingMetalMaterial',
        rocktoe: 'rockToeMaterial',
        'rocktoe-filter': 'rockToeFilterMaterial',
        'rocktoe-exc': 'rockToeExcavationMaterial',
        hfilter: 'horizontalFilterMaterial',
        vfilter: 'verticalFilterMaterial',
        'chute-exc': 'chuteDrainExcavationMaterial',
        'chute-lining': 'chuteDrainLiningMaterial'
      }
      const key = keyByRole[role]
      if (!key) return
      const existing = data[key] as TemplateMaterialRef | null | undefined
      const ref: TemplateMaterialRef = {
        code: master.code,
        description: master.description,
        unit: master.dataVariant?.unit ?? master.unit,
        categoryKey: master.category,
        side: master.side,
        dataVariant:
          master.dataVariant ??
          (existing?.code === master.code ? existing.dataVariant : undefined)
      }
      const selectedBund: BundData = { ...data, [key]: ref }
      const bund =
        ref.dataVariant
          ? bundWithVariant(selectedBund, ref.code, ref.dataVariant)
          : selectedBund
      mutate((root) => syncBundItems(patchNode(root, nodeId, { bund }), nodeId))
    },

    resolveBundMaterials: (nodeId, masters) => {
      const p = get().project
      const component = p ? findNode(p.root, nodeId) : null
      const data = component?.bund
      if (!data) return []

      const byCode = new Map<string, BundMasterMetadata>()
      for (const m of masters) {
        if (!byCode.has(m.code)) {
          byCode.set(m.code, {
            description: m.description,
            unit: m.dataVariant?.unit ?? m.unit,
            category: m.category,
            side: m.side
          })
        }
      }

      const bund = applyBundMasterMetadata(data, byCode)
      const remaining = unresolvedBundMaterialCodes(bund)
      // Only touch the project when something actually improved.
      if (remaining.length !== unresolvedBundMaterialCodes(data).length) {
        mutate((root) => syncBundItems(patchNode(root, nodeId, { bund }), nodeId))
      }
      return remaining
    },

    setGuideWallMaterial: (nodeId, role, master, sectionId) => {
      const p = get().project
      const component = p ? findNode(p.root, nodeId) : null
      const data = component?.guideWall
      if (!data) return
      const selectedSection = sectionId
        ? data.sections.find((section) => section.id === sectionId)
        : undefined
      const existing =
        role === 'wall'
          ? selectedSection?.wallMaterial ?? data.wallMaterial
          : role === 'base'
            ? selectedSection?.baseMaterial ?? data.baseMaterial
            : data.excavationMaterial
      const ref: GuideWallMaterialRef = {
        code: master.code,
        description: master.description,
        unit: master.dataVariant?.unit ?? master.unit,
        categoryKey: master.category,
        side: master.side,
        dataVariant:
          master.dataVariant ??
          (existing?.code === master.code ? existing.dataVariant : undefined)
      }
      let guideWall: GuideWallData
      if (sectionId) {
        // Per-section override (wall/base only). Editing a section's code never
        // touches the default; changing the default leaves overrides intact.
        guideWall = {
          ...data,
          sections: data.sections.map((s) =>
            s.id === sectionId
              ? { ...s, ...(role === 'wall' ? { wallMaterial: ref } : { baseMaterial: ref }) }
              : s
          )
        }
      } else {
        guideWall =
          role === 'wall'
            ? { ...data, wallMaterial: ref }
            : role === 'base'
              ? { ...data, baseMaterial: ref }
              : { ...data, excavationMaterial: ref }
      }
      if (ref.dataVariant) {
        guideWall = guideWallWithVariant(guideWall, ref.code, ref.dataVariant)
      }
      mutate((root) => syncGuideWallItems(patchNode(root, nodeId, { guideWall }), nodeId))
    },

    resetGuideWallSectionMaterial: (nodeId, role, sectionId) => {
      const p = get().project
      const component = p ? findNode(p.root, nodeId) : null
      const data = component?.guideWall
      if (!data) return
      const guideWall: GuideWallData = {
        ...data,
        sections: data.sections.map((s) =>
          s.id === sectionId
            ? { ...s, ...(role === 'wall' ? { wallMaterial: undefined } : { baseMaterial: undefined }) }
            : s
        )
      }
      mutate((root) => syncGuideWallItems(patchNode(root, nodeId, { guideWall }), nodeId))
    },

    addCustomItem: (parentId, name) => {
      const item = createNode('item', name || 'New Item', {
        itemSource: 'OTHERS',
        itemEditorType: 'spreadsheet'
      })
      mutate((root) => addChild(root, parentId, item))
      set((s) => ({ selectedId: item.id, expanded: { ...s.expanded, [parentId]: true } }))
    },

    addItemsFromMaster: (parentId, items) => {
      const p = get().project
      if (!p) return
      const parent = resolveItemParent(p.root, parentId)
      const nodes = items.map((m) =>
        createNode('item', m.side === 'SOR' ? m.description : m.code, {
          itemSource: m.side,
          itemCode: m.code,
          itemDescription: m.description,
          itemEditorType: 'spreadsheet',
          unit: m.unit,
          categoryKey: m.category,
          dataVariant: m.dataVariant,
          sorCatalogue: m.sorCatalogue
        })
      )
      mutate((root) => addChildren(root, parent.id, nodes))
      set((s) => ({ expanded: { ...s.expanded, [parent.id]: true } }))
    },

    createProjectData: (input) => {
      const project = get().project
      if (!project) return null
      const now = new Date().toISOString()
      const definitions = project.projectData ?? []
      const definition: ProjectDataDefinition = {
        ...input,
        id: newId(),
        code: nextProjectDataCode(definitions),
        createdAt: now,
        updatedAt: now
      }
      set((state) => ({
        project: state.project
          ? {
              ...state.project,
              projectData: [...(state.project.projectData ?? []), definition],
              updatedAt: now
            }
          : null,
        past: state.project ? [...state.past, state.project].slice(-MAX_HISTORY) : state.past,
        future: [],
        dirty: true
      }))
      return definition
    },

    updateProjectData: (id, input) => {
      const project = get().project
      const existing = project?.projectData?.find((definition) => definition.id === id)
      if (!project || !existing) return null
      const now = new Date().toISOString()
      const definition = {
        ...existing,
        ...input,
        id: existing.id,
        code: existing.code,
        createdAt: existing.createdAt,
        updatedAt: now
      } as ProjectDataDefinition
      set((state) => ({
        project: state.project
          ? {
              ...state.project,
              projectData: (state.project.projectData ?? []).map((candidate) =>
                candidate.id === id ? definition : candidate
              ),
              updatedAt: now
            }
          : null,
        past: state.project ? [...state.past, state.project].slice(-MAX_HISTORY) : state.past,
        future: [],
        dirty: true
      }))
      return definition
    },

    addProjectDataItems: (parentId, projectDataIds) => {
      const project = get().project
      if (!project) return
      const parent = resolveItemParent(project.root, parentId)
      const wanted = new Set(projectDataIds)
      const nodes = (project.projectData ?? []).flatMap((definition) =>
        wanted.has(definition.id)
          ? [
              createNode('item', definition.description, {
                itemSource: 'PROJECT_DATA',
                itemCode: definition.code,
                itemDescription: definition.description,
                itemEditorType: 'spreadsheet',
                unit: definition.unit,
                categoryKey: PROJECT_DATA_CATEGORY,
                projectDataId: definition.id
              })
            ]
          : []
      )
      if (!nodes.length) return
      mutate((root) => addChildren(root, parent.id, nodes))
      set((state) => ({ expanded: { ...state.expanded, [parent.id]: true } }))
    },

    deleteNode: (id) => {
      endHistoryRun()
      set((state) => {
        const project = state.project
        if (!project || project.root.id === id) return state
        const target = findNode(project.root, id)
        if (!target) return state
        const removed = collectSubtreeState(target)
        const root = removeNode(project.root, id)
        const remainingKeys = new Set(collectProjectItemGroups(root).map((group) => group.key))
        const orphanedKeys = new Set(
          Array.from(removed.itemKeys).filter((key) => !remainingKeys.has(key))
        )
        const scopedOverrides = Object.fromEntries(
          Object.entries(project.rateAnalysisScopedOverrides ?? {}).flatMap(
            ([scopeNodeId, recipes]) => {
              if (removed.nodeIds.has(scopeNodeId)) return []
              const scopeNode = findNode(root, scopeNodeId)
              if (!scopeNode) return []
              const scopeItemKeys = collectSubtreeState(scopeNode).itemKeys
              const remaining = Object.fromEntries(
                Object.entries(recipes).filter(([itemKey]) => scopeItemKeys.has(itemKey))
              )
              return Object.keys(remaining).length ? [[scopeNodeId, remaining]] : []
            }
          )
        )
        const chart = normalizeLeadChart(project.leadChart)
        const next: EestimateProject = {
          ...project,
          root,
          rateAnalysisOverrides: withoutKeys(project.rateAnalysisOverrides, orphanedKeys),
          rateAnalysisScopedOverrides: scopedOverrides,
          seigniorageOverrides: withoutKeys(project.seigniorageOverrides, orphanedKeys),
          earthworkOverrides: withoutKeys(project.earthworkOverrides, orphanedKeys),
          signatureFooterOverrides: Object.fromEntries(
            Object.entries(project.signatureFooterOverrides ?? {}).filter(
              ([scopeKey]) => !removed.nodeIds.has(scopeKey)
            )
          ),
          leadChart: {
            ...chart,
            applications: (chart.applications ?? []).filter(
              (application) =>
                !orphanedKeys.has(application.itemKey) &&
                !(application.itemNodeId && removed.nodeIds.has(application.itemNodeId))
            )
          },
          updatedAt: new Date().toISOString()
        }
        const selectionRemoved = state.analysisSelection
          ? orphanedKeys.has(state.analysisSelection.key) ||
            removed.nodeIds.has(state.analysisSelection.nodeId) ||
            Boolean(
              state.analysisSelection.scopeNodeId &&
                removed.nodeIds.has(state.analysisSelection.scopeNodeId)
            )
          : false
        return {
          project: next,
          past: [...state.past, project].slice(-MAX_HISTORY),
          future: [],
          dirty: true,
          selectedId:
            state.selectedId && removed.nodeIds.has(state.selectedId)
              ? project.root.id
              : state.selectedId,
          analysisSelection: selectionRemoved ? null : state.analysisSelection,
          settings:
            state.settings.nodeId && removed.nodeIds.has(state.settings.nodeId)
              ? { open: false, nodeId: null }
              : state.settings
        }
      })
    },

    updateNodeSettings: (id, settings) => {
      mutate((root) => patchNode(root, id, { settings }))
    },

    setItemEditorType: (id, editorType) => {
      mutate((root) => patchNode(root, id, { itemEditorType: editorType }))
    },

    // Page text edits don't record per-keystroke undo history; they just mark dirty.
    setNodeDocument: (id, text) => {
      const p = get().project
      if (!p) return
      set({
        project: { ...p, root: patchNode(p.root, id, { document: text }), updatedAt: new Date().toISOString() },
        dirty: true
      })
    },

    setNodeSpreadsheet: (id, spreadsheet) => {
      const p = get().project
      if (!p) return
      set({
        project: {
          ...p,
          root: patchNode(p.root, id, { spreadsheet }),
          updatedAt: new Date().toISOString()
        },
        dirty: true
      })
    },

    // Print Layout config edits mark dirty without flooding undo history.
    setNodePrint: (id, print) => {
      const p = get().project
      if (!p) return
      set({
        project: {
          ...p,
          root: patchNode(p.root, id, { print }),
          updatedAt: new Date().toISOString()
        },
        dirty: true
      })
    },

    // Chart edits mark dirty without flooding undo history.
    addNodeChart: (id, chart) => {
      const p = get().project
      if (!p) return
      const node = findNode(p.root, id)
      const charts = [...(node?.charts ?? []), chart]
      set({
        project: { ...p, root: patchNode(p.root, id, { charts }), updatedAt: new Date().toISOString() },
        dirty: true
      })
    },

    updateNodeChart: (id, chartId, patch) => {
      const p = get().project
      if (!p) return
      const node = findNode(p.root, id)
      if (!node?.charts) return
      const charts = node.charts.map((c) => (c.id === chartId ? { ...c, ...patch } : c))
      set({
        project: { ...p, root: patchNode(p.root, id, { charts }), updatedAt: new Date().toISOString() },
        dirty: true
      })
    },

    removeNodeChart: (id, chartId) => {
      const p = get().project
      if (!p) return
      const node = findNode(p.root, id)
      if (!node?.charts) return
      const charts = node.charts.filter((c) => c.id !== chartId)
      set({
        project: { ...p, root: patchNode(p.root, id, { charts }), updatedAt: new Date().toISOString() },
        dirty: true
      })
    },

    setNodeFinalCell: (id, cell) => {
      const p = get().project
      if (!p) return
      set({
        project: {
          ...p,
          root: patchNode(p.root, id, { finalCell: cell ?? undefined }),
          updatedAt: new Date().toISOString()
        },
        dirty: true
      })
    },

    setNodeRate: (id, rate) => {
      const p = get().project
      if (!p) return
      set({
        project: {
          ...p,
          root: patchNode(p.root, id, { rate: rate ?? undefined }),
          updatedAt: new Date().toISOString()
        },
        dirty: true
      })
    },

    updateMeta: (patch) => {
      const p = get().project
      if (!p) return
      const meta = { ...p.meta, ...patch }
      const root = patch.name ? { ...p.root, name: patch.name } : p.root
      set({
        project: { ...p, meta, root, updatedAt: new Date().toISOString() },
        dirty: true
      })
    },

    setDashboardSnapshot: (snapshot) => {
      set((state) => {
        if (!state.project) return state
        const chart = normalizeLeadChart(state.project.leadChart)
        const applicationUpdates = new Map(
          (snapshot.leadApplicationUpdates ?? []).map((application) => [
            application.id,
            application
          ])
        )
        return {
          project: {
            ...state.project,
            leadChart: applicationUpdates.size
              ? {
                  ...chart,
                  applications: (chart.applications ?? []).map(
                    (application) => applicationUpdates.get(application.id) ?? application
                  )
                }
              : state.project.leadChart,
            dashboardSnapshot: snapshot,
            updatedAt: new Date().toISOString()
          },
          dirty: true
        }
      })
    },

    addMiscellaneousItem: (item) => {
      const name = item.name.trim()
      const cost = Number(item.cost)
      if (!name || !Number.isFinite(cost) || cost < 0) return
      mutateProject((project) => ({
        ...project,
        miscellaneousItems: [
          ...(project.miscellaneousItems ?? []),
          { id: newId(), name, cost, createdAt: new Date().toISOString() }
        ]
      }))
    },

    removeMiscellaneousItem: (id) => {
      mutateProject((project) => ({
        ...project,
        miscellaneousItems: (project.miscellaneousItems ?? []).filter((item) => item.id !== id)
      }))
    },

    setEarthworkOverride: (itemKey, value) => {
      mutateProject((project) => {
        const overrides = { ...(project.earthworkOverrides ?? {}) }
        if (value === null) delete overrides[itemKey]
        else overrides[itemKey] = value
        return { ...project, earthworkOverrides: overrides }
      })
    },

    upsertLeadPoint: (point) => {
      mutateProject((project) => {
        const chart = normalizeLeadChart(project.leadChart)
        const exists = chart.points.some((candidate) => candidate.id === point.id)
        return {
          ...project,
          leadChart: {
            ...chart,
            points: exists
              ? chart.points.map((candidate) => (candidate.id === point.id ? point : candidate))
              : [...chart.points, point]
          }
        }
      })
    },

    removeLeadPoint: (pointId) => {
      mutateProject((project) => {
        const chart = normalizeLeadChart(project.leadChart)
        const removedAssignmentIds = new Set(
          chart.assignments
            .filter((assignment) => assignment.pointId === pointId)
            .map((assignment) => assignment.id)
        )
        return {
          ...project,
          leadChart: {
            ...chart,
            points: chart.points.filter((point) => point.id !== pointId),
            assignments: chart.assignments.filter((assignment) => assignment.pointId !== pointId),
            itemChoices: chart.itemChoices.filter(
              (choice) => !removedAssignmentIds.has(choice.assignmentId)
            )
          }
        }
      })
    },

    upsertLeadAssignment: (assignment) => {
      mutateProject((project) => {
        const chart = normalizeLeadChart(project.leadChart)
        const exists = chart.assignments.some((candidate) => candidate.id === assignment.id)
        return {
          ...project,
          leadChart: {
            ...chart,
            assignments: exists
              ? chart.assignments.map((candidate) =>
                  candidate.id === assignment.id ? assignment : candidate
                )
              : [...chart.assignments, assignment]
          }
        }
      })
    },

    removeLeadAssignment: (assignmentId) => {
      mutateProject((project) => {
        const chart = normalizeLeadChart(project.leadChart)
        return {
          ...project,
          leadChart: {
            ...chart,
            assignments: chart.assignments.filter((assignment) => assignment.id !== assignmentId),
            itemChoices: chart.itemChoices.filter((choice) => choice.assignmentId !== assignmentId)
          }
        }
      })
    },

    upsertLeadVariant: (variant) => {
      mutateProject((project) => {
        const chart = normalizeLeadChart(project.leadChart)
        const nextVariant = normalizeLeadVariant(variant)
        const exists = chart.variants?.some((candidate) => candidate.id === variant.id)
        return {
          ...project,
          leadChart: {
            ...chart,
            variants: exists
              ? chart.variants?.map((candidate) =>
                  candidate.id === variant.id ? nextVariant : candidate
                )
              : [...(chart.variants ?? []), nextVariant]
          }
        }
      })
    },

    removeLeadVariant: (variantId) => {
      mutateProject((project) => {
        const chart = normalizeLeadChart(project.leadChart)
        return {
          ...project,
          leadChart: {
            ...chart,
            variants: (chart.variants ?? []).filter((variant) => variant.id !== variantId),
            applications: (chart.applications ?? []).filter(
              (application) => application.variantId !== variantId
            ),
            mapDirections: (chart.mapDirections ?? []).filter(
              (direction) => direction.variantId !== variantId
            )
          }
        }
      })
    },

    upsertLeadApplication: (application) => {
      mutateProject((project) => {
        const chart = normalizeLeadChart(project.leadChart)
        return {
          ...project,
          leadChart: {
            ...chart,
            applications: upsertUniqueLeadApplication(
              chart.applications ?? [],
              chart.variants ?? [],
              application
            )
          }
        }
      })
    },

    removeLeadApplication: (applicationId) => {
      mutateProject((project) => {
        const chart = normalizeLeadChart(project.leadChart)
        return {
          ...project,
          leadChart: {
            ...chart,
            applications: (chart.applications ?? []).filter(
              (application) => application.id !== applicationId
            )
          }
        }
      })
    },

    upsertLeadMapDirection: (direction) => {
      mutateProject((project) => {
        const chart = normalizeLeadChart(project.leadChart)
        const nextDirection = normalizeLeadMapDirection({
          ...direction,
          updatedAt: new Date().toISOString()
        })
        const exists = chart.mapDirections?.some((candidate) => candidate.id === direction.id)
        return {
          ...project,
          leadChart: {
            ...chart,
            mapDirections: exists
              ? chart.mapDirections?.map((candidate) =>
                  candidate.id === direction.id ? nextDirection : candidate
                )
              : [...(chart.mapDirections ?? []), nextDirection]
          }
        }
      })
    },

    removeLeadMapDirection: (directionId) => {
      mutateProject((project) => {
        const chart = normalizeLeadChart(project.leadChart)
        return {
          ...project,
          leadChart: {
            ...chart,
            mapDirections: (chart.mapDirections ?? []).filter(
              (direction) => direction.id !== directionId
            )
          }
        }
      })
    },

    updateLeadPrintSettings: (settings) => {
      mutateProject((project) => {
        const chart = normalizeLeadChart(project.leadChart)
        return {
          ...project,
          leadChart: {
            ...chart,
            printSettings: normalizeLeadPrintSettings(settings)
          }
        }
      })
    },

    updateSeignioragePrintSettings: (settings) => {
      mutateProject((project) => ({
        ...project,
        seignioragePrintSettings: settings
      }))
    },

    reorderNode: (dragId, targetId, edge) => {
      const p = get().project
      if (!p) return
      const dragged = findNode(p.root, dragId)
      const target = findNode(p.root, targetId)
      if (!dragged || !target || !canReorderBetween(dragged, target)) return
      mutate((root) => reorderSibling(root, dragId, targetId, edge))
    },

    setNodeDocumentFinal: (id, documentFinal) => {
      mutate((root) => patchNode(root, id, { documentFinal: documentFinal ?? undefined }))
    },

    setNodeDocumentPrintArea: (id, documentPrintArea) => {
      mutate((root) => patchNode(root, id, { documentPrintArea: documentPrintArea ?? undefined }))
    },

    setNodeDocumentData: (id, documentData, plainText) => {
      // `document` is kept in step so search and older builds still see the text.
      const project = get().project
      const current = project ? findNode(project.root, id) : null
      mutate(
        (root) =>
          patchNode(root, id, {
            documentData,
            document: plainText,
            ...(current?.pageTemplate === 'front' ? { frontCoverInitialized: true } : {})
          }),
        // One typing run in one document is one undo step.
        `document:${id}`
      )
    },


    updateProjectPrintSettings: (settings) => {
      mutateProject((project) => ({ ...project, projectPrintSettings: settings }))
    },

    updateSignatureFooter: (scopeKey, settings) => {
      mutateProject((project) => {
        if (scopeKey === 'project') {
          return { ...project, signatureFooter: settings ?? undefined }
        }
        const overrides = { ...(project.signatureFooterOverrides ?? {}) }
        if (settings) overrides[scopeKey] = settings
        else delete overrides[scopeKey]
        return {
          ...project,
          signatureFooterOverrides: Object.keys(overrides).length ? overrides : undefined
        }
      })
    },

    updateChargeSettings: (settings) => {
      mutateProject((project) => ({
        ...project,
        chargeSettings: { ...(project.chargeSettings ?? {}), ...settings }
      }))
    },


    openLeadMaterial: (selection) =>
      set({
        leadSelection: normalizeLeadSelection(selection),
        analysisSelection: null,
        seigniorageSelection: null,
        activity: 'lead'
      }),

    closeLeadMaterial: () => set({ leadSelection: null }),

    openSeigniorage: (selection = { seigCode: null }) =>
      set({
        seigniorageSelection: selection,
        analysisSelection: null,
        leadSelection: null,
        activity: 'explorer'
      }),

    closeSeigniorage: () => set({ seigniorageSelection: null }),

    openRateAnalysis: (key, nodeId, recipeOnly = false, scopeNodeId) =>
      set({
        analysisSelection: { key, nodeId, recipeOnly, scopeNodeId },
        selectedId: nodeId,
        leadSelection: null,
        seigniorageSelection: null
      }),

    closeRateAnalysis: () => set({ analysisSelection: null }),

    saveRateAnalysis: (recipe, scopeNodeId) => {
      endHistoryRun()
      set((s) => {
        if (!s.project) return s
        const syncNodes = (node: ProjectNode, parentInScope = !scopeNodeId): ProjectNode => {
          const inScope = parentInScope || node.id === scopeNodeId
          const children = node.children.map((child) => syncNodes(child, inScope))
          const childrenChanged = children.some((child, index) => child !== node.children[index])
          if (!inScope || node.kind !== 'item' || projectItemKey(node) !== recipe.itemKey) {
            return childrenChanged ? { ...node, children } : node
          }
          return {
            ...node,
            children,
            itemDescription: recipe.description,
            unit: recipe.unit
          }
        }
        const scopedOverrides = scopeNodeId
          ? {
              ...(s.project.rateAnalysisScopedOverrides ?? {}),
              [scopeNodeId]: {
                ...(s.project.rateAnalysisScopedOverrides?.[scopeNodeId] ?? {}),
                [recipe.itemKey]: recipe
              }
            }
          : s.project.rateAnalysisScopedOverrides
        const next: EestimateProject = {
          ...s.project,
          root: syncNodes(s.project.root),
          rateAnalysisOverrides: scopeNodeId
            ? s.project.rateAnalysisOverrides
            : {
                ...(s.project.rateAnalysisOverrides ?? {}),
                [recipe.itemKey]: recipe
              },
          rateAnalysisScopedOverrides: scopedOverrides,
          updatedAt: new Date().toISOString()
        }
        return {
          project: next,
          past: [...s.past, s.project].slice(-MAX_HISTORY),
          future: [],
          dirty: true
        }
      })
    },

    restoreRateAnalysisDefaults: (recipe, scopeNodeId) => {
      endHistoryRun()
      set((s) => {
        if (!s.project) return s
        const overrides = { ...(s.project.rateAnalysisOverrides ?? {}) }
        const scopedOverrides = { ...(s.project.rateAnalysisScopedOverrides ?? {}) }
        if (scopeNodeId) {
          const scoped = { ...(scopedOverrides[scopeNodeId] ?? {}) }
          delete scoped[recipe.itemKey]
          if (Object.keys(scoped).length) scopedOverrides[scopeNodeId] = scoped
          else delete scopedOverrides[scopeNodeId]
        } else {
          delete overrides[recipe.itemKey]
        }
        const syncNodes = (node: ProjectNode, parentInScope = !scopeNodeId): ProjectNode => {
          const inScope = parentInScope || node.id === scopeNodeId
          const children = node.children.map((child) => syncNodes(child, inScope))
          const childrenChanged = children.some((child, index) => child !== node.children[index])
          if (!inScope || node.kind !== 'item' || projectItemKey(node) !== recipe.itemKey) {
            return childrenChanged ? { ...node, children } : node
          }
          return {
            ...node,
            children,
            itemDescription: recipe.description,
            unit: recipe.unit
          }
        }
        const next: EestimateProject = {
          ...s.project,
          root: syncNodes(s.project.root),
          rateAnalysisOverrides: overrides,
          rateAnalysisScopedOverrides: scopedOverrides,
          updatedAt: new Date().toISOString()
        }
        return {
          project: next,
          past: [...s.past, s.project].slice(-MAX_HISTORY),
          future: [],
          dirty: true
        }
      })
    },

    openAddItem: (parentId) => set({ addItem: { open: true, parentId } }),
    closeAddItem: () => set({ addItem: { open: false, parentId: null } }),
    openAddPage: (parentId) => set({ addPage: { open: true, parentId } }),
    closeAddPage: () => set({ addPage: { open: false, parentId: null } }),
    closeAddStructure: () => set({ addStructure: { open: false, kind: 'component', parentId: null } }),
    openSettings: (nodeId) => set({ settings: { open: true, nodeId } }),
    closeSettings: () => set({ settings: { open: false, nodeId: null } }),

    openExportPdf: () => set({ exportPdfOpen: true }),
    closeExportPdf: () => set({ exportPdfOpen: false }),

    undo: () =>
      set((s) => {
        endHistoryRun()
        if (s.past.length === 0 || !s.project) return s
        const prev = s.past[s.past.length - 1]
        return {
          project: prev,
          past: s.past.slice(0, -1),
          future: [s.project, ...s.future].slice(0, MAX_HISTORY),
          dirty: true
        }
      }),

    redo: () =>
      set((s) => {
        endHistoryRun()
        if (s.future.length === 0 || !s.project) return s
        const next = s.future[0]
        return {
          project: next,
          past: [...s.past, s.project].slice(-MAX_HISTORY),
          future: s.future.slice(1),
          dirty: true
        }
      })
  }
})

/** Convenience selector: the currently selected node, if any. */
export function useSelectedNode(): ProjectNode | null {
  const root = useStore((state) => state.project?.root ?? null)
  const selectedId = useStore((state) => state.selectedId)
  return useMemo(
    () => (root && selectedId ? findNode(root, selectedId) : null),
    [root, selectedId]
  )
}
