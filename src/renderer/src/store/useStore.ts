import { useMemo } from 'react'
import { create } from 'zustand'
import type {
  ChartDef,
  ConveyanceClass,
  EestimateProject,
  LeadApplication,
  LeadDetailReconstruction,
  ItemEditorType,
  LeadAssignment,
  LeadChart,
  LeadMapDirection,
  LeadPoint,
  LeadPrintSettings,
  LeadVariant,
  ProjectLocation,
  ProjectMiscellaneousItem,
  NodeSettings,
  PrintConfig,
  ProjectMeta,
  ProjectNode,
  SeignioragePrintSettings,
  SpreadsheetDocument
} from '../types/project'
import type { MasterItem } from '../lib/masterData'
import {
  collectProjectItemGroups,
  projectItemKey,
  rateAnalysisOverrideForNode
} from '../lib/projectItems'
import { canonicalLeadConveyanceClass } from '../lib/leadApplicability'
import {
  normalizeLeadApplications,
  upsertUniqueLeadApplication
} from '../lib/leadApplications'
import type { RateAnalysisRecipe } from '../types/rateAnalysis'
import type { RecentEntry } from '../../../preload/index.d'
import {
  addChild,
  addChildren,
  createDraftProject,
  createNode,
  findNode,
  findParent,
  newId,
  patchNode,
  removeNode,
  resolveItemParent
} from '../lib/tree'

const SSR_ITEM_TABLE = 'ssr_item'

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

function createdDataName(source: ProjectNode, requestedName: string): string {
  const name = requestedName.trim()
  const code = source.itemCode?.trim() || source.name.trim()
  const match = code.match(/^([^-]+-[^-]+)/)
  const prefix = match?.[1] ?? code
  if (name.toLocaleUpperCase().startsWith(`${prefix}_`.toLocaleUpperCase())) return name
  return `${prefix}_${name}`
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
  return {
    pageSize: settings?.pageSize ?? 'A4',
    margins: settings?.margins ?? { top: 15, right: 12, bottom: 15, left: 12 },
    pages: {
      chart: { orientation: settings?.pages?.chart?.orientation ?? 'portrait' },
      calculation: { orientation: settings?.pages?.calculation?.orientation ?? 'portrait' },
      map: { orientation: settings?.pages?.map?.orientation ?? 'landscape' }
    },
    showMapLabels: settings?.showMapLabels ?? true,
    showRouteArrows: settings?.showRouteArrows ?? true,
    showBaseMap: settings?.showBaseMap ?? true
  }
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
    conveyanceClass: canonicalLeadConveyanceClass(
      materialName,
      selection.conveyanceClass as ConveyanceClass
    )
  }
}

/** Backfill fields that older `.eestimate` files may lack. */
function normalizeLoaded(data: EestimateProject): EestimateProject {
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
    root: normalizeNode(data.root),
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
export type ActivityView = 'explorer' | 'search' | 'lead' | 'sourcecontrol'

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
}

export interface SeigniorageSelection {
  seigCode: string | null
  materialKey?: string | null
}

interface StoreState {
  view: AppView
  activity: ActivityView
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
  analysisSelection: AnalysisSelection | null
  leadSelection: LeadSelection | null
  seigniorageSelection: SeigniorageSelection | null

  // lifecycle
  loadRecent: () => Promise<void>
  restoreLastSession: () => Promise<void>
  setActivity: (a: ActivityView) => void
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
  createStructureNode: (name: string, location: ProjectLocation | null) => void
  addCustomItem: (parentId: string, name: string) => void
  addItemsFromMaster: (parentId: string, items: MasterItem[]) => void
  addCreatedDataItems: (parentId: string, createdDataIds: string[]) => void
  splitDataItem: (sourceNodeId: string, name: string) => string | null
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
  openLeadMaterial: (selection: LeadSelection) => void
  closeLeadMaterial: () => void
  openSeigniorage: (selection?: SeigniorageSelection) => void
  closeSeigniorage: () => void
  saveLeadDetailReconstruction: (detail: LeadDetailReconstruction) => void
  restoreLeadDetailReconstruction: (detailCode: string, year: string) => void
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

  // undo / redo
  undo: () => void
  redo: () => void
}

const MAX_HISTORY = 100
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
  /** Apply a pure mutation to the current project, recording undo history. */
  function mutate(fn: (root: ProjectNode, project: EestimateProject) => ProjectNode): void {
    set((s) => {
      if (!s.project) return s
      const nextRoot = fn(s.project.root, s.project)
      const next: EestimateProject = {
        ...s.project,
        root: nextRoot,
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

  function mutateProject(fn: (project: EestimateProject) => EestimateProject): void {
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

    setActivity: (a) => set({ activity: a }),
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
      const root: ProjectNode = { ...p.root, name: meta.name || 'Untitled Project' }
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
        dirty: true,
        analysisSelection: null,
        leadSelection: null,
        seigniorageSelection: null
      })
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
      const res = await window.api.project.save(project, filePath, project.meta.name || 'Project')
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
      const res = await window.api.project.saveAs(project, project.meta.name || 'Project')
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

    createStructureNode: (name, location) => {
      const p = get().project
      if (!p) return
      const { kind, parentId } = get().addStructure
      const parent = parentId ?? p.root.id
      const trimmed = name.trim() || (kind === 'component' ? 'New Component' : 'New Sub-component')
      const fallbackLocation = location ?? p.meta.location ?? null
      const node = createNode(kind, trimmed, { location: fallbackLocation })
      mutate((root) => addChild(root, parent, node))
      set((s) => ({
        selectedId: node.id,
        expanded: { ...s.expanded, [parent]: true },
        addStructure: { open: false, kind: 'component', parentId: null }
      }))
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
        createNode('item', m.code, {
          itemSource: m.side,
          itemCode: m.code,
          itemDescription: m.description,
          itemEditorType: 'spreadsheet',
          unit: m.unit,
          categoryKey: m.category,
          dataVariant: m.dataVariant
        })
      )
      mutate((root) => addChildren(root, parent.id, nodes))
      set((s) => ({ expanded: { ...s.expanded, [parent.id]: true } }))
    },

    addCreatedDataItems: (parentId, createdDataIds) => {
      const p = get().project
      if (!p) return
      const parent = resolveItemParent(p.root, parentId)
      const wanted = new Set(createdDataIds)
      const exemplars = new Map<string, ProjectNode>()
      const visit = (node: ProjectNode): void => {
        if (
          node.kind === 'item' &&
          node.splitFromItemKey &&
          node.createdDataId &&
          wanted.has(node.createdDataId) &&
          !exemplars.has(node.createdDataId)
        ) {
          exemplars.set(node.createdDataId, node)
        }
        node.children.forEach(visit)
      }
      visit(p.root)
      const nodes = createdDataIds.flatMap((createdDataId) => {
        const source = exemplars.get(createdDataId)
        if (!source) return []
        return [
          createNode('item', source.name, {
            itemSource: source.itemSource,
            itemCode: source.itemCode,
            itemDescription: source.itemDescription,
            itemEditorType: source.itemEditorType ?? 'spreadsheet',
            unit: source.unit,
            categoryKey: source.categoryKey,
            dataVariant: source.dataVariant,
            splitFromNodeId: source.splitFromNodeId,
            splitFromItemKey: source.splitFromItemKey,
            createdDataId
          })
        ]
      })
      if (!nodes.length) return
      mutate((root) => addChildren(root, parent.id, nodes))
      set((s) => ({ expanded: { ...s.expanded, [parent.id]: true } }))
    },

    splitDataItem: (sourceNodeId, name) => {
      const p = get().project
      const trimmed = name.trim()
      if (!p || !trimmed) return null
      const source = findNode(p.root, sourceNodeId)
      if (!source || source.kind !== 'item') return null
      const parent = findParent(p.root, source.id)
      if (!parent) return null
      const split = createNode('item', createdDataName(source, trimmed), {
        itemSource: source.itemSource,
        itemCode: source.itemCode,
        itemDescription: source.itemDescription,
        itemEditorType: source.itemEditorType ?? 'spreadsheet',
        unit: source.unit,
        categoryKey: source.categoryKey,
        dataVariant: source.dataVariant,
        splitFromNodeId: source.id,
        splitFromItemKey: source.splitFromItemKey ?? projectItemKey(source)
      })
      split.createdDataId = split.id
      const splitKey = projectItemKey(split)
      const sourceRecipe = rateAnalysisOverrideForNode(p, source)
      mutateProject((project) => ({
        ...project,
        root: addChild(project.root, parent.id, split),
        rateAnalysisOverrides: sourceRecipe
          ? {
              ...(project.rateAnalysisOverrides ?? {}),
              [splitKey]: JSON.parse(
                JSON.stringify({ ...sourceRecipe, itemKey: splitKey })
              ) as RateAnalysisRecipe
            }
          : project.rateAnalysisOverrides
      }))
      set((s) => ({
        selectedId: split.id,
        expanded: { ...s.expanded, [parent.id]: true }
      }))
      return split.id
    },

    deleteNode: (id) => {
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

    openLeadMaterial: (selection) =>
      set({
        leadSelection: normalizeLeadSelection(selection),
        analysisSelection: null,
        seigniorageSelection: null,
        activity: 'explorer'
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

    saveLeadDetailReconstruction: (detail) => {
      mutateProject((project) => ({
        ...project,
        leadDetailOverrides: {
          ...(project.leadDetailOverrides ?? {}),
          [`${detail.detailCode}:${detail.year}`]: detail
        }
      }))
    },

    restoreLeadDetailReconstruction: (detailCode, year) => {
      mutateProject((project) => {
        const overrides = { ...(project.leadDetailOverrides ?? {}) }
        delete overrides[`${detailCode}:${year}`]
        return { ...project, leadDetailOverrides: overrides }
      })
    },

    openRateAnalysis: (key, nodeId, recipeOnly = false, scopeNodeId) =>
      set({
        analysisSelection: { key, nodeId, recipeOnly, scopeNodeId },
        selectedId: nodeId,
        leadSelection: null,
        seigniorageSelection: null
      }),

    closeRateAnalysis: () => set({ analysisSelection: null }),

    saveRateAnalysis: (recipe, scopeNodeId) => {
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

    undo: () =>
      set((s) => {
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
