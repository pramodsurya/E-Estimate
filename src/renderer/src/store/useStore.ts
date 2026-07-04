import { useMemo } from 'react'
import { create } from 'zustand'
import type {
  ChartDef,
  EestimateProject,
  LeadApplication,
  LeadDetailReconstruction,
  ItemEditorType,
  LeadAssignment,
  LeadChart,
  LeadPoint,
  LeadVariant,
  ProjectLocation,
  NodeSettings,
  PrintConfig,
  ProjectMeta,
  ProjectNode,
  SpreadsheetDocument
} from '../types/project'
import type { MasterItem } from '../lib/masterData'
import { projectItemKey } from '../lib/projectItems'
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
    categoryKey: node.itemSource === 'SSR' ? SSR_ITEM_TABLE : node.categoryKey
  }
}

function normalizeRateAnalysisOverrides(
  overrides: Record<string, RateAnalysisRecipe> | undefined
): Record<string, RateAnalysisRecipe> {
  const normalized: Record<string, RateAnalysisRecipe> = {}
  for (const recipe of Object.values(overrides ?? {})) {
    const next =
      recipe.itemSource === 'SSR'
        ? {
            ...recipe,
            categoryKey: SSR_ITEM_TABLE,
            itemKey: `SSR:${SSR_ITEM_TABLE}:${recipe.itemCode}`
          }
        : recipe
    normalized[next.itemKey] = next
  }
  return normalized
}

function normalizeLeadChart(chart: LeadChart | undefined): LeadChart {
  return {
    points: Array.isArray(chart?.points) ? chart.points : [],
    assignments: Array.isArray(chart?.assignments)
      ? chart.assignments.map((assignment) => ({ ...assignment, active: assignment.active !== false }))
      : [],
    itemChoices: Array.isArray(chart?.itemChoices) ? chart.itemChoices : [],
    variants: Array.isArray(chart?.variants)
      ? chart.variants.map((variant) => ({ ...variant, active: variant.active !== false }))
      : [],
    applications: Array.isArray(chart?.applications) ? chart.applications : []
  }
}

/** Backfill fields that older `.eestimate` files may lack. */
function normalizeLoaded(data: EestimateProject): EestimateProject {
  return {
    ...data,
    id: data.id || newId(),
    root: normalizeNode(data.root),
    leadChart: normalizeLeadChart(data.leadChart),
    rateAnalysisOverrides: normalizeRateAnalysisOverrides(data.rateAnalysisOverrides)
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
}

export interface LeadSelection {
  materialName: string
  conveyanceClass?: string
  variantId?: string
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

  // lifecycle
  loadRecent: () => Promise<void>
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
  upsertLeadPoint: (point: LeadPoint) => void
  removeLeadPoint: (pointId: string) => void
  upsertLeadAssignment: (assignment: LeadAssignment) => void
  removeLeadAssignment: (assignmentId: string) => void
  upsertLeadVariant: (variant: LeadVariant) => void
  removeLeadVariant: (variantId: string) => void
  upsertLeadApplication: (application: LeadApplication) => void
  removeLeadApplication: (applicationId: string) => void
  openLeadMaterial: (selection: LeadSelection) => void
  closeLeadMaterial: () => void
  saveLeadDetailReconstruction: (detail: LeadDetailReconstruction) => void
  restoreLeadDetailReconstruction: (detailCode: string, year: string) => void
  openRateAnalysis: (key: string, nodeId: string, recipeOnly?: boolean) => void
  closeRateAnalysis: () => void
  saveRateAnalysis: (recipe: RateAnalysisRecipe) => void
  restoreRateAnalysisDefaults: (recipe: RateAnalysisRecipe) => void

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

    loadRecent: async () => {
      try {
        const recent = await window.api.recent.list()
        set({ recent })
      } catch {
        set({ recent: [] })
      }
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
        leadSelection: null
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
        leadSelection: null
      })
    },

    openProjectFromDisk: async () => {
      const res = await window.api.project.open()
      if (res.canceled) return
      if (res.error || !res.data) return
      const data = normalizeLoaded(res.data)
      set({
        project: data,
        filePath: res.path ?? null,
        view: 'project',
        selectedId: data.root.id,
        expanded: { [data.root.id]: true },
        dirty: false,
        past: [],
        future: [],
        addStructure: { open: false, kind: 'component', parentId: null },
        activity: 'explorer',
        analysisSelection: null,
        leadSelection: null
      })
      void get().loadRecent()
    },

    openRecent: async (path) => {
      const res = await window.api.project.openPath(path)
      if (res.error || !res.data) {
        void get().loadRecent()
        return
      }
      const data = normalizeLoaded(res.data)
      set({
        project: data,
        filePath: res.path ?? null,
        view: 'project',
        selectedId: data.root.id,
        expanded: { [data.root.id]: true },
        dirty: false,
        past: [],
        future: [],
        addStructure: { open: false, kind: 'component', parentId: null },
        activity: 'explorer',
        analysisSelection: null,
        leadSelection: null
      })
      void get().loadRecent()
    },

    saveProject: async () => {
      const { project, filePath } = get()
      if (!project) return
      const res = await window.api.project.save(project, filePath, project.meta.name || 'Project')
      if (res.canceled) return
      set({ filePath: res.path ?? filePath, dirty: false })
      void get().loadRecent()
    },

    saveProjectAs: async () => {
      const { project } = get()
      if (!project) return
      const res = await window.api.project.saveAs(project, project.meta.name || 'Project')
      if (res.canceled) return
      set({ filePath: res.path ?? null, dirty: false })
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
        leadSelection: null
      })
    },

    select: (id) => set({ selectedId: id, analysisSelection: null, leadSelection: null }),

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
          categoryKey: m.category
        })
      )
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
      const split = createNode('item', trimmed, {
        itemSource: source.itemSource,
        itemCode: source.itemCode,
        itemDescription: source.itemDescription,
        itemEditorType: source.itemEditorType ?? 'spreadsheet',
        unit: source.unit,
        categoryKey: source.categoryKey,
        splitFromNodeId: source.id,
        splitFromItemKey: source.splitFromItemKey ?? projectItemKey(source)
      })
      mutate((root) => addChild(root, parent.id, split))
      set((s) => ({
        selectedId: split.id,
        expanded: { ...s.expanded, [parent.id]: true }
      }))
      return split.id
    },

    deleteNode: (id) => {
      const p = get().project
      if (!p || p.root.id === id) return // never delete the Title root
      mutate((root) => removeNode(root, id))
      if (get().selectedId === id) set({ selectedId: p.root.id })
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
        const exists = chart.variants?.some((candidate) => candidate.id === variant.id)
        return {
          ...project,
          leadChart: {
            ...chart,
            variants: exists
              ? chart.variants?.map((candidate) =>
                  candidate.id === variant.id ? variant : candidate
                )
              : [...(chart.variants ?? []), variant]
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
            )
          }
        }
      })
    },

    upsertLeadApplication: (application) => {
      mutateProject((project) => {
        const chart = normalizeLeadChart(project.leadChart)
        const exists = chart.applications?.some((candidate) => candidate.id === application.id)
        return {
          ...project,
          leadChart: {
            ...chart,
            applications: exists
              ? chart.applications?.map((candidate) =>
                  candidate.id === application.id ? application : candidate
                )
              : [...(chart.applications ?? []), application]
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

    openLeadMaterial: (selection) =>
      set({
        leadSelection: selection,
        analysisSelection: null,
        activity: 'explorer'
      }),

    closeLeadMaterial: () => set({ leadSelection: null }),

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

    openRateAnalysis: (key, nodeId, recipeOnly = false) =>
      set({ analysisSelection: { key, nodeId, recipeOnly }, selectedId: nodeId, leadSelection: null }),

    closeRateAnalysis: () => set({ analysisSelection: null }),

    saveRateAnalysis: (recipe) => {
      set((s) => {
        if (!s.project) return s
        const syncNodes = (node: ProjectNode): ProjectNode => {
          const children = node.children.map(syncNodes)
          const childrenChanged = children.some((child, index) => child !== node.children[index])
          if (node.kind !== 'item' || projectItemKey(node) !== recipe.itemKey) {
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
          rateAnalysisOverrides: {
            ...(s.project.rateAnalysisOverrides ?? {}),
            [recipe.itemKey]: recipe
          },
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

    restoreRateAnalysisDefaults: (recipe) => {
      set((s) => {
        if (!s.project) return s
        const overrides = { ...(s.project.rateAnalysisOverrides ?? {}) }
        delete overrides[recipe.itemKey]
        const syncNodes = (node: ProjectNode): ProjectNode => {
          const children = node.children.map(syncNodes)
          const childrenChanged = children.some((child, index) => child !== node.children[index])
          if (node.kind !== 'item' || projectItemKey(node) !== recipe.itemKey) {
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
