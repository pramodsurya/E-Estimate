import '@univerjs/preset-sheets-core/lib/index.css'
import '@univerjs/preset-sheets-drawing/lib/index.css'

import { FUniver } from '@univerjs/core/facade'
import { IUniverInstanceService, LocaleType, LogLevel, mergeLocales, Univer, type IWorkbookData } from '@univerjs/core'
import {
  UniverSheetsCorePreset,
  type FWorkbook,
  type IFUniverSheetsMixin
} from '@univerjs/preset-sheets-core'
import { UniverSheetsDrawingPreset } from '@univerjs/preset-sheets-drawing'
import enUS from '@univerjs/preset-sheets-core/locales/en-US'
import drawingEnUS from '@univerjs/preset-sheets-drawing/locales/en-US'
import { BarChart3, Hash, Table2, Crop, FileCode, Plus, X } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  SPECIMEN_SHEET_RANGE,
  SPECIMEN_SHEET_ROWS,
  TUTORIAL_SEED_SHEET,
  TUTORIAL_SELECT_RANGE,
  type TutorialRangeRequest
} from '../../tutorial/events'
import {
  createUniverWorkbookData,
  isUniverWorkbookData
} from '../../lib/univerSpreadsheet'
import { ArrayValueObject, ErrorType } from '@univerjs/engine-formula'
import { IRegisterFunctionService } from '@univerjs/sheets-formula'
import { EditorBridgeService } from '@univerjs/sheets-ui'
import { useStore } from '../../store/useStore'
import { findNode, findParent, newId } from '../../lib/tree'
import {
  advancePendingFormulaFromKey,
  itemCellFormula,
  replacePickedFormulaRef,
  resolveItemCell,
  resolveItemRange
} from '../../lib/itemCellRef'
import {
  collectSharedMembers,
  findSharedContentSource,
  findSharedPrintSource,
  isSharedSheetMember,
  resolveSharedSheetName,
  workbookHasContent
} from '../../lib/sharedSheet'
import {
  buildChartConfig,
  chartValuesContainData,
  readChartValuesFromSnapshot,
  type CellValue
} from '../../lib/chartData'
import {
  cellToA1,
  expandRangeToIncludeFinalCell,
  isFinalCellInPrintRange,
  readFinalValueFromSnapshot
} from '../../lib/finalNumber'
import type { CellRange, ChartDef, ProjectNode } from '../../types/project'
import { nodeDisplayName } from '../nodeVisual'
import EEstimatePrintStudio from '../typst/EEstimatePrintStudio'
import { exportItemNodeExcel } from '../../lib/excel-output/pageExcel'
import {
  buildItemSheetRenderData,
  itemSheetCompileInputs,
  itemSheetScopeKey,
  itemSheetTypstTemplate,
  itemSheetShadowFiles,
  EE_ITEM_TABLE_PRELUDE,
  resolveItemSheetDocumentSettings,
  resolvedItemSheetTypstSource
} from '../../lib/typist-output/itemTypst'
import ChartFloat from '../charts/ChartFloat'
import ChartConfigModal from '../charts/ChartConfigModal'
import ChartsListModal from '../charts/ChartsListModal'
import {
  clearConfig,
  publishConfig,
  subscribeDelete,
  subscribeEdit,
  subscribeInsert,
  subscribePng,
  subscribeRefresh
} from '../charts/chartBus'
import { registerChartRibbonMenu } from '../charts/chartRibbonMenu'

type UniverSheetsApi = FUniver & IFUniverSheetsMixin

const CHART_COMPONENT_KEY = 'eestimate-chart'

type FloatDomLike = {
  id?: string
  componentKey?: unknown
  data?: { chartId?: unknown }
}

function colLabel(index: number): string {
  let n = index
  let s = ''
  do {
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return s
}
function rangeToA1(r: CellRange): string {
  return `${colLabel(r.startColumn)}${r.startRow + 1}:${colLabel(r.endColumn)}${r.endRow + 1}`
}

function registerSheetsPreset(univer: Univer, container: HTMLElement): void {
  const corePreset = UniverSheetsCorePreset({
    container,
    // The formatting toolbar (Bold/Italic/Underline/Font/Color/Borders/Number
    // formats/Alignment/Merge, etc.) lives INSIDE the header bar. It must be
    // visible for any of those text-formatting controls to appear.
    header: true,
    toolbar: true,
    // 'classic' renders the full Excel-style tabbed ribbon (Home / Insert /
    // Formulas / Data / View) exposing the most controls. Use 'simple' for a
    // single compact row, or 'collapsed' for a minimal toolbar.
    ribbonType: 'classic',
    formulaBar: true,
    contextMenu: true,
    footer: {}
  })

  // Drawing preset adds image support (floating + in-cell images) with an
  // "Insert image" toolbar/menu entry. The default image service stores images
  // as base64 data URLs locally, so they persist inside the workbook snapshot
  // (and therefore the .eestimate project file). Must be registered AFTER core.
  const drawingPreset = UniverSheetsDrawingPreset({ allowImageSize: 10 * 1024 * 1024 })

  const register = univer.registerPlugin.bind(univer) as (plugin: any, config?: any) => void

  for (const preset of [corePreset, drawingPreset]) {
    for (const plugin of preset.plugins) {
      if (Array.isArray(plugin)) {
        register(plugin[0], plugin[1])
      } else {
        register(plugin)
      }
    }
  }
}

function serializeSnapshot(snapshot: IWorkbookData): string {
  return JSON.stringify(snapshot)
}

function isAppChartFloatDom(floatDom: FloatDomLike | null | undefined): boolean {
  return (
    floatDom?.componentKey === CHART_COMPONENT_KEY ||
    typeof floatDom?.data?.chartId === 'string'
  )
}

function removeExistingChartFloatDoms(ws: unknown): number {
  const sheet = ws as {
    getAllFloatDoms?: () => FloatDomLike[]
    removeFloatDom?: (id: string) => unknown
  }
  const floatDoms = sheet.getAllFloatDoms?.() ?? []
  let removed = 0
  for (const floatDom of floatDoms) {
    if (!floatDom.id || !isAppChartFloatDom(floatDom)) continue
    try {
      sheet.removeFloatDom?.(floatDom.id)
      removed += 1
    } catch {
      /* stale float already removed */
    }
  }
  return removed
}

function isMountedWorkbookItem(root: ProjectNode | null, hostId: string, sharedSheetId: string | undefined, itemId: string): boolean {
  if (itemId === hostId) return true
  if (!root || !sharedSheetId) return false
  const item = findNode(root, itemId)
  return item?.kind === 'item' && item.sharedSheetId === sharedSheetId
}

export default function UniverSpreadsheet({ node, focusedItemId }: { node: ProjectNode; focusedItemId?: string }): JSX.Element {
  // This editor wires Univer imperatively once per node. Its setup effect
  // intentionally omits the chart callbacks from the dependency array (they are
  // recreated per render and re-running setup would rebuild the sheet), so the
  // exhaustive-deps suppression below is required. Opt this component out of the
  // React Compiler instead of letting a non-compilable suppression bail it out.
  'use no memo'
  const containerRef = useRef<HTMLDivElement | null>(null)
  const apiRef = useRef<UniverSheetsApi | null>(null)
  /** True once the tutorial's specimen has been written into this sheet. */
  const seededRef = useRef(false)
  const workbookRef = useRef<FWorkbook | null>(null)
  const setNodeSpreadsheet = useStore((state) => state.setNodeSpreadsheet)
  const select = useStore((state) => state.select)
  const setNodePrint = useStore((state) => state.setNodePrint)
  const addNodeChart = useStore((state) => state.addNodeChart)
  const updateNodeChart = useStore((state) => state.updateNodeChart)
  const removeNodeChart = useStore((state) => state.removeNodeChart)
  const setNodeFinalCell = useStore((state) => state.setNodeFinalCell)
  const openAddItem = useStore((state) => state.openAddItem)
  const detachItemFromSharedSheet = useStore((state) => state.detachItemFromSharedSheet)
  const project = useStore((state) => state.project)
  const updatePrintStudioDocument = useStore((state) => state.updatePrintStudioDocument)
  const chartFloatsRef = useRef<Map<string, { dispose?: () => void }>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const [printStudioOpen, setPrintStudioOpen] = useState(false)
  const [chartModal, setChartModal] = useState<{ mode: 'insert' | 'edit'; chartId?: string } | null>(
    null
  )
  const [chartSelection, setChartSelection] = useState<CellRange | null>(null)
  const [chartsListOpen, setChartsListOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [hostReady, setHostReady] = useState<{ nodeId: string; ready: boolean }>({
    nodeId: '',
    ready: false
  })
  /* ---------------- Shared sheet (one workbook, many items) ---------------- */
  // Members keep synced grid copies; Fix Final № and print area stay per
  // item and act on the focused member below.
  const sharedMembers = project && isSharedSheetMember(node)
    ? collectSharedMembers(project.root, node.sharedSheetId as string)
    : []
  const isShared = sharedMembers.length > 0
  const focusNode = isShared
    ? (sharedMembers.find((member) => member.id === focusedItemId) ?? node)
    : node
  const printSource = isShared && project && node.sharedSheetId
    ? findSharedPrintSource(project.root, node.sharedSheetId) ?? node
    : node
  const sharedName = isShared && project ? resolveSharedSheetName(node, project.root) : ''
  const addItemToSheet = (): void => {
    if (!project) return
    const parent = findParent(project.root, node.id)
    openAddItem(parent?.id ?? project.root.id)
  }

  // Rule 3: a single sheet grows into a shared sheet. Nothing converts
  // until items are actually picked: the picker carries this sheet as its
  // target, and cancelling leaves the single sheet untouched.
  const convertToSharedAndAddItems = (): void => {
    if (!project || isShared) return
    const parent = findParent(project.root, node.id)
    const sheetName = `${parent?.name ?? nodeDisplayName(node)} — Sheet`
    openAddItem(parent?.id ?? project.root.id, {
      id: newId(),
      name: sheetName,
      growFromItemId: node.id
    })
  }

  const schedulePersistRef = useRef<(() => void) | null>(null)
  const scheduleChartSyncRef = useRef<(() => void) | null>(null)

  /** Read the user's current selection as a zero-based cell range. */
  const readActiveRange = (): CellRange | null => {
    try {
      const range = apiRef.current?.getActiveWorkbook()?.getActiveRange()?.getRange()
      if (!range) return null
      return {
        startRow: range.startRow,
        startColumn: range.startColumn,
        endRow: range.endRow,
        endColumn: range.endColumn
      }
    } catch {
      return null
    }
  }

  const getSnapshot = (): IWorkbookData | null => {
    try {
      return workbookRef.current?.save() ?? null
    } catch {
      return null
    }
  }

  const setPrintArea = (): void => {
    const range = readActiveRange()
    if (!range) {
      setNotice('Select a range in the sheet first, then click Set Print Area.')
      window.setTimeout(() => setNotice(null), 3000)
      return
    }
    if (!isShared && focusNode.finalCell && !isFinalCellInPrintRange(range, focusNode.finalCell)) {
      const a1 = cellToA1(focusNode.finalCell.row, focusNode.finalCell.column)
      setNotice(`Selected print area must include the fixed final № (${a1}).`)
      window.setTimeout(() => setNotice(null), 3500)
      return
    }
    setNodePrint(node.id, { ...printSource.print, range })
    setNotice(isShared ? 'Print area set for the shared sheet.' : 'Print area set.')
    window.setTimeout(() => setNotice(null), 1800)
  }

  const clearPrintArea = (): void => {
    setNodePrint(node.id, { ...printSource.print, range: null })
  }


  /* ---------------- Fix Final Number ---------------- */

  const fixFinalNumber = (): void => {
    const r = readActiveRange()
    if (!r) {
      setNotice('Select the cell with the final total, then click Fix Final №.')
      window.setTimeout(() => setNotice(null), 3000)
      return
    }
    const cell = { row: r.startRow, column: r.startColumn }
    setNodeFinalCell(focusNode.id, cell)
    let printNotice = ''
    if (!isShared && focusNode.print?.range && !isFinalCellInPrintRange(focusNode.print.range, cell)) {
      const expanded = expandRangeToIncludeFinalCell(focusNode.print.range, cell)
      if (expanded) {
        setNodePrint(focusNode.id, { ...focusNode.print, range: expanded })
        printNotice = ' (print area expanded to include it)'
      }
    }
    const a1 = cellToA1(cell.row, cell.column)
    let value: unknown
    try {
       
      value = (apiRef.current?.getActiveWorkbook()?.getActiveSheet()?.getRange(a1) as any)?.getValue()
    } catch {
      value = undefined
    }
    const shown = typeof value === 'number' || typeof value === 'string' ? ` = ${value}` : ''
    setNotice(`Final number fixed at ${a1}${shown}${printNotice}`)
    window.setTimeout(() => setNotice(null), 3000)
  }

  const clearFinalNumber = (): void => setNodeFinalCell(focusNode.id, null)

  /* ---------------- Cross-sheet cell reference (ITEMCELL) ---------------- */

  /* ---------------- Excel-style point mode (formula link) ---------------- */
  const formulaLink = useStore((state) => state.formulaLink)
  const startFormulaLink = useStore((state) => state.startFormulaLink)

  /**
   * Best-effort capture of an unfinished `=...` edit at unmount. The editor
   * document holds the live keystrokes; when readable and formula-shaped,
   * the text travels in the store link instead of dying with this mount.
   */
  const captureUnfinishedFormula = (instance: unknown): void => {
    try {
      const store = useStore.getState()
      const pending = store.formulaLink
      if (pending && !isMountedWorkbookItem(store.project?.root ?? null, node.id, node.sharedSheetId, pending.originItemId)) return
      const injector = (instance as { __getInjector?: () => { get?: (id: unknown) => unknown } })
        .__getInjector?.()
      const bridge = injector?.get?.(EditorBridgeService) as
        | {
            isVisible?: () => unknown
            getEditCellState?: () => {
              row?: number
              column?: number
              editorUnitId?: string
              documentLayoutObject?: {
                documentModel?: { getBody?: () => { dataStream?: string } | undefined } | null
              }
            } | null
          }
        | undefined
      const visible = bridge?.isVisible?.() as { visible?: boolean } | boolean | undefined
      const open = visible === true || (typeof visible === 'object' && visible?.visible === true)
      if (!open) return
      const state = bridge?.getEditCellState?.()
      const instances = injector?.get?.(IUniverInstanceService) as
        | { getUnit?: (id: string) => { getBody?: () => { dataStream?: string } | undefined } | null }
        | undefined
      const liveDocument = state?.editorUnitId ? instances?.getUnit?.(state.editorUnitId) : null
      const stream = liveDocument?.getBody?.()?.dataStream ??
        state?.documentLayoutObject?.documentModel?.getBody?.()?.dataStream ?? ''
      // Univer's live editor stream can include the typed leading '=' twice
      // while an edit is in progress. A formula must have exactly one.
      const text = stream.replace(/\r?\n$/, '').replace(/^=+/, '=')
      if (!text.startsWith('=') || typeof state?.row !== 'number' || typeof state?.column !== 'number') return
      if (pending && (pending.target.row !== state.row || pending.target.column !== state.column)) return
      if (pending && text.length < pending.text.length && pending.text.startsWith(text)) return
      if (!pending || pending.text !== text) {
        startFormulaLink({ originItemId: pending?.originItemId ?? store.selectedId ?? node.id, target: { row: state.row, column: state.column }, text })
      }
    } catch {
      /* capture unavailable; navigation behaves as before */
    }
  }

  /** Writes a committed link into the origin cell (runs on the origin mount). */
  const tryConsumeFormulaLink = useCallback((): boolean => {
    const link = useStore.getState().formulaLink
    if (!link?.commitRequested || !isMountedWorkbookItem(useStore.getState().project?.root ?? null, node.id, node.sharedSheetId, link.originItemId)) return false
    try {
      const ws = apiRef.current?.getActiveWorkbook()?.getActiveSheet() as unknown as
        | { getRange?: (a1: string) => { setFormula?: (f: string) => void } | null }
        | null
        | undefined
      const range = ws?.getRange?.(cellToA1(link.target.row, link.target.column))
      if (!range?.setFormula) return false
      range.setFormula(link.text.replace(/^=+/, '='))
      schedulePersistRef.current?.()
    } catch {
      setNotice('Could not insert the reference. Reopen this sheet and try Finish again.')
      return false
    }
    useStore.getState().clearFormulaLink()
    return true
  }, [node.id, node.sharedSheetId])

  useEffect(() => {
    const timer = window.setTimeout(tryConsumeFormulaLink, 0)
    return () => window.clearTimeout(timer)
  }, [formulaLink?.commitRequested, formulaLink?.originItemId, node.id, tryConsumeFormulaLink])

  const finalCellValue = readFinalValueFromSnapshot(focusNode)

  /* ---------------- Charts ---------------- */

  /** Read the chart's data range and push a fresh Chart.js config to its view. */
  const publishChart = (def: ChartDef): boolean => {
    const ws = apiRef.current?.getActiveWorkbook()?.getActiveSheet()
    let values: CellValue[][] = []
    if (ws) {
      try {
         
        values = ((ws.getRange(rangeToA1(def.range)) as any)?.getValues() ?? []) as CellValue[][]
      } catch {
        values = []
      }
    }

    // During workbook restoration Univer can render the floating chart before
    // its active-sheet facade is readable. The saved workbook already contains
    // the same cells, so use it as a deterministic startup fallback.
    if (!chartValuesContainData(values)) {
      const snapshotValues = readChartValuesFromSnapshot(getSnapshot() ?? node.spreadsheet, def.range)
      if (chartValuesContainData(snapshotValues)) values = snapshotValues
    }

    publishConfig(def.id, buildChartConfig(values, def))
    return chartValuesContainData(values)
  }

  /** Mount a chart's floating-DOM view over the sheet. */
  const addChartFloat = (def: ChartDef): void => {
    const ws = apiRef.current?.getActiveWorkbook()?.getActiveSheet()
    if (!ws) return
    if (chartFloatsRef.current.has(def.id)) return
    const p = def.position
    try {
       
      if ((ws as any).getFloatDomById?.(def.id)) (ws as any).removeFloatDom?.(def.id)
    } catch {
      /* stale float dom could not be removed; add attempt below will fail safely */
    }
     
    const disposable = (ws as any).addFloatDomToPosition(
      {
        componentKey: CHART_COMPONENT_KEY,
        allowTransform: true,
        initPosition: {
          startX: p.startX,
          endX: p.startX + p.width,
          startY: p.startY,
          endY: p.startY + p.height
        },
        data: { chartId: def.id }
      },
      def.id
    )
    if (disposable) chartFloatsRef.current.set(def.id, disposable)
  }

  const removeChartFloat = (chartId: string): void => {
    const d = chartFloatsRef.current.get(chartId)
    try {
      d?.dispose?.()
    } catch {
      /* already gone */
    }
    chartFloatsRef.current.delete(chartId)
    clearConfig(chartId)
  }

  /** Recompute every chart on this node from its (possibly changed) data. */
  const republishAllCharts = (): void => {
    const project = useStore.getState().project
    if (!project) return
    const fresh = findNode(project.root, node.id)
    for (const def of fresh?.charts ?? []) publishChart(def)
  }

  const openInsertChart = (): void => {
    setChartSelection(readActiveRange())
    setChartModal({ mode: 'insert' })
  }

  const openEditChart = (chartId: string): void => {
    setChartSelection(readActiveRange())
    setChartModal({ mode: 'edit', chartId })
  }

  /** Insert a new chart or apply edits to an existing one. */
  const submitChart = (def: ChartDef): void => {
    if (chartModal?.mode === 'edit') {
      updateNodeChart(node.id, def.id, def)
      publishChart(def)
      schedulePersistRef.current?.()
      scheduleChartSyncRef.current?.()
    } else {
      addNodeChart(node.id, def)
      addChartFloat(def)
      publishChart(def)
      schedulePersistRef.current?.()
    }
  }

  /** Capture each chart's current on-sheet position/size (only when changed). */
  const syncChartPositions = (): void => {
    const ws = apiRef.current?.getActiveWorkbook()?.getActiveSheet()
    const project = useStore.getState().project
    if (!ws || !project) return
    const fresh = findNode(project.root, node.id)
    for (const def of fresh?.charts ?? []) {
      try {
         
        const pos = (ws as any).getFloatDomById(def.id)?.position
        if (!pos || typeof pos.left !== 'number') continue
        const next = {
          startX: pos.left,
          startY: pos.top,
          width: pos.width ?? def.position.width,
          height: pos.height ?? def.position.height
        }
        const c = def.position
        const changed =
          Math.abs(next.startX - c.startX) > 0.5 ||
          Math.abs(next.startY - c.startY) > 0.5 ||
          Math.abs(next.width - c.width) > 0.5 ||
          Math.abs(next.height - c.height) > 0.5
        if (changed) updateNodeChart(node.id, def.id, { position: next })
      } catch {
        /* float dom not found — keep stored position */
      }
    }
  }

  const deleteChart = (chartId: string): void => {
    removeChartFloat(chartId)
    removeNodeChart(node.id, chartId)
    schedulePersistRef.current?.()
  }

  const openPrintStudio = (): void => setPrintStudioOpen(true)

  const exportSheetExcel = (): Promise<void> => {
    const current = useStore.getState().project
    if (!current) throw new Error('No active project.')
    return exportItemNodeExcel(current, node)
  }

  const itemPrintStudio = (() => {
    if (!project) return null
    return {
      defaultTypstSource: itemSheetTypstTemplate(project, node),
      savedTypstSource: project.printStudioDocuments?.[itemSheetScopeKey(node)],
      compileInputs: itemSheetCompileInputs(project, node),
      shadowFiles: itemSheetShadowFiles(node, printSource.print?.range ?? null),
      runtimeData: buildItemSheetRenderData(project, node),
      projectDocumentSettings: resolveItemSheetDocumentSettings(project, node),
      savedDocumentSettings: project.printStudioDocumentSettings?.[itemSheetScopeKey(node)]
    }
  })()

  const editingChart =
    chartModal?.mode === 'edit'
      ? node.charts?.find((c) => c.id === chartModal.chartId)
      : undefined

  const printRange = printSource.print?.range ?? null
  const color = focusNode.itemSource === 'SOR' ? 'var(--item-sor)' : 'var(--item-ssr)'
  const subtitle = (`${focusNode.itemSource ?? ''}${focusNode.unit ? ` - unit ${focusNode.unit}` : ''}`.trim() ||
      'Spreadsheet')

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    let resizeFrame: number | null = null

    const updateHostReady = (): void => {
      const rect = container.getBoundingClientRect()
      const next = { nodeId: node.id, ready: rect.width > 0 && rect.height > 0 }
      setHostReady((current) =>
        current.nodeId === next.nodeId && current.ready === next.ready ? current : next
      )
      if (next.ready && apiRef.current) {
        if (resizeFrame) window.cancelAnimationFrame(resizeFrame)
        resizeFrame = window.requestAnimationFrame(() => window.dispatchEvent(new Event('resize')))
      }
    }

    setError(null)
    setLoading(true)
    setHostReady((current) =>
      current.nodeId === node.id && !current.ready ? current : { nodeId: node.id, ready: false }
    )
    updateHostReady()
    resizeFrame = window.requestAnimationFrame(updateHostReady)
    const observer = new ResizeObserver(updateHostReady)
    observer.observe(container)

    return () => {
      if (resizeFrame) window.cancelAnimationFrame(resizeFrame)
      observer.disconnect()
    }
  }, [node.id])

  useEffect(() => {
    const container = containerRef.current
    if (!container || hostReady.nodeId !== node.id || !hostReady.ready) return

    let disposed = false
    let univer: Univer | null = null
    let workbook: FWorkbook | null = null
    let commandDisposable: { dispose: () => void } | null = null
    let renderedDisposable: { dispose: () => void } | null = null
    let componentDisposable: { dispose: () => void } | null = null
    let itemCellDisposable: { dispose: () => void } | null = null
    let selectionDisposable: { dispose: () => void } | null = null
    let ribbonDisposable: { dispose: () => void } | null = null
    let unsubPng: (() => void) | null = null
    let unsubDelete: (() => void) | null = null
    let unsubEdit: (() => void) | null = null
    let unsubInsert: (() => void) | null = null
    let unsubRefresh: (() => void) | null = null
    let saveTimer: number | null = null
    let chartTimer: number | null = null
    let loadingTimer: number | null = null
    let resizeFrame: number | null = null
    let initializeFrame: number | null = null
    const chartRestoreTimers: number[] = []
    let renderedRestoreScheduled = false
    let lastSerialized = ''
    let pickArmed = false
    let capturePick: ((range: { startRow: number; startColumn: number; endRow: number; endColumn: number }) => void) | null = null

    // Read the editor before a click on another item closes Univer's edit box.
    // React removes this component only after the tree click has selected it.
    const captureBeforeSheetSwitch = (event: PointerEvent): void => {
      const target = event.target
      if (target instanceof Node && container.contains(target)) {
        const store = useStore.getState()
        const link = store.formulaLink
        pickArmed = Boolean(link && !isMountedWorkbookItem(store.project?.root ?? null, node.id, node.sharedSheetId, link.originItemId))
      }
      if (!(target instanceof Element) || !target.closest('[data-tour="tree-item"], [data-tour="tree-shared-sheet"]')) return
      if (univer) captureUnfinishedFormula(univer)
    }
    const handleReferenceKeys = (event: KeyboardEvent): void => {
      const store = useStore.getState()
      const pending = store.formulaLink
      const originIsHere = pending && isMountedWorkbookItem(store.project?.root ?? null, node.id, node.sharedSheetId, pending.originItemId)
      if (
        pending && !originIsHere &&
        (event.key === 'Enter' || event.key === 'Return' || event.code === 'NumpadEnter') &&
        pending.text.includes('ITEMCELL(')
      ) {
        event.preventDefault()
        event.stopImmediatePropagation()
        store.requestFormulaLinkCommit()
        store.select(pending.originItemId)
        return
      }
      const target = event.target
      if (!(target instanceof Node) || !container.contains(target)) return
      if (event.ctrlKey || event.altKey || event.metaKey) return
      if (pending) {
        if (!originIsHere || pending.commitRequested) return
        const nextText = advancePendingFormulaFromKey(pending.text, event.key)
        if (nextText !== null && nextText !== pending.text) {
          startFormulaLink({ originItemId: pending.originItemId, target: pending.target, text: nextText })
        }
        return
      }
      if (event.key !== '=') return
      const range = readActiveRange()
      if (!range) return
      startFormulaLink({
        originItemId: store.selectedId && isMountedWorkbookItem(store.project?.root ?? null, node.id, node.sharedSheetId, store.selectedId)
          ? store.selectedId : node.id,
        target: { row: range.startRow, column: range.startColumn },
        text: '='
      })
    }
    document.addEventListener('pointerdown', captureBeforeSheetSwitch, true)
    const disarmPick = (): void => {
      window.setTimeout(() => {
        if (pickArmed) {
          const range = readActiveRange()
          if (range) capturePick?.(range)
        }
        pickArmed = false
      }, 0)
    }
    document.addEventListener('pointerup', disarmPick, true)
    document.addEventListener('keydown', handleReferenceKeys, true)

    const persist = (): void => {
      if (!workbook) return
      const snapshot = workbook.save()
      const serialized = serializeSnapshot(snapshot)
      if (serialized === lastSerialized) return

      lastSerialized = serialized
      setNodeSpreadsheet(node.id, snapshot)
    }

    const schedulePersist = (): void => {
      if (disposed) return
      if (saveTimer) window.clearTimeout(saveTimer)
      saveTimer = window.setTimeout(persist, 600)
    }

    const scheduleChartSync = (): void => {
      if (disposed) return
      if (chartTimer) window.clearTimeout(chartTimer)
      chartTimer = window.setTimeout(() => {
        republishAllCharts()
        syncChartPositions()
      }, 400)
    }

    const markLoaded = (): void => {
      if (!disposed) setLoading(false)
    }

    const markLoadedIfHostRendered = (): void => {
      if (container.childElementCount > 0) markLoaded()
    }

    const scheduleWindowResize = (): void => {
      if (resizeFrame) window.cancelAnimationFrame(resizeFrame)
      resizeFrame = window.requestAnimationFrame(() => {
        resizeFrame = window.requestAnimationFrame(() => {
          if (!disposed) window.dispatchEvent(new Event('resize'))
        })
      })
    }

    const restoreSavedCharts = (): void => {
      if (disposed) return
      const project = useStore.getState().project
      if (!project) return
      const fresh = findNode(project.root, node.id)
      for (const def of fresh?.charts ?? []) {
        addChartFloat(def)
        publishChart(def)
      }
    }

    const scheduleChartRestore = (delay: number): void => {
      const timer = window.setTimeout(restoreSavedCharts, delay)
      chartRestoreTimers.push(timer)
    }

    schedulePersistRef.current = schedulePersist
    scheduleChartSyncRef.current = scheduleChartSync

    const initialize = (): void => {
      if (disposed) return

      try {
        setError(null)
        setLoading(true)
        container.innerHTML = ''

        // Shared members open one canonical grid: a member whose own copy
        // is blank/stale adopts the group's content instead of showing (and
        // then saving back) a blank sheet over it.
        const sourceNode = (() => {
          if (!isSharedSheetMember(node) || workbookHasContent(node.spreadsheet)) return node
          const project = useStore.getState().project
          if (!project || !node.sharedSheetId) return node
          const source = findSharedContentSource(project.root, node.sharedSheetId)
          return source ?? node
        })()
        const alreadyUniver = isUniverWorkbookData(sourceNode.spreadsheet)
        const workbookData = createUniverWorkbookData(
          sourceNode === node ? node : { ...node, spreadsheet: sourceNode.spreadsheet }
        )

        univer = new Univer({
          locale: LocaleType.EN_US,
          locales: { [LocaleType.EN_US]: mergeLocales(enUS, drawingEnUS) },
          logLevel: LogLevel.WARN
        })
        registerSheetsPreset(univer, container)

        const univerAPI = FUniver.newAPI(univer) as UniverSheetsApi
        renderedDisposable = univerAPI.getHooks().onRendered(() => {
          markLoaded()
          if (renderedRestoreScheduled) return
          renderedRestoreScheduled = true
          scheduleChartRestore(0)
          scheduleChartRestore(120)
        })
        workbook = univerAPI.createWorkbook(workbookData)
        apiRef.current = univerAPI
        workbookRef.current = workbook
        scheduleWindowResize()

        // Point mode: while a formula link is active, clicks in OTHER items'
        // sheets replace the last picked reference. A pointer-up fallback also
        // handles clicking a cell that was already selected on sheet open.
        capturePick = (first) => {
          try {
            const st = useStore.getState()
            const link = st.formulaLink
            if (!link || link.commitRequested) return
            if (isMountedWorkbookItem(st.project?.root ?? null, node.id, node.sharedSheetId, link.originItemId) || !pickArmed) return
            const sourceId = st.selectedId && isMountedWorkbookItem(st.project?.root ?? null, node.id, node.sharedSheetId, st.selectedId)
              ? st.selectedId : node.id
            const target = st.project ? findNode(st.project.root, sourceId) : null
            const code = target?.itemCode?.trim()
            if (!code) {
              setNotice('That sheet has no item code — code it before referencing.')
              window.setTimeout(() => setNotice(null), 2500)
              return
            }
            const address = first.startRow === first.endRow && first.startColumn === first.endColumn
              ? cellToA1(first.startRow, first.startColumn)
              : `${cellToA1(first.startRow, first.startColumn)}:${cellToA1(first.endRow, first.endColumn)}`
            const ref = itemCellFormula(code, address, sourceId).slice(1)
            const next = replacePickedFormulaRef(link.text, link.lastPickStart, ref)
            st.startFormulaLink({
              originItemId: link.originItemId,
              target: link.target,
              ...next
            })
          } catch {
            /* picking is best-effort; the link text is untouched */
          }
        }
        selectionDisposable = univerAPI.getActiveWorkbook()?.onSelectionChange((selections) => {
          const first = selections?.[0]
          if (first) capturePick?.(first)
        }) ?? null

        // Register the Chart.js float component and mount any saved charts.
         
        componentDisposable = (univerAPI as any).registerComponent(CHART_COMPONENT_KEY, ChartFloat)

        // Cross-sheet references: =ITEMCELL("CODE","C18") reads a cell from
        // another item's saved sheet. Resolves live from the project store at
        // calc time; recalculates on open and on local edits.
        try {
          const injector = (univer as any).__getInjector?.() as
            | { get?: (id: unknown) => unknown }
            | undefined
          const registerService = injector?.get?.(IRegisterFunctionService) as
            | {
                registerFunction?: (params: {
                  name: string
                  func: (...args: unknown[]) => unknown
                  description: string
                }) => { dispose: () => void }
              }
            | undefined
          if (registerService?.registerFunction) {
            itemCellDisposable = registerService.registerFunction({
              name: 'ITEMCELL',
              func: (codeArg: unknown, refArg: unknown, idArg?: unknown) => {
                const text = (value: unknown): string => {
                  if (typeof value === 'string') return value
                  if (
                    value !== null &&
                    typeof value === 'object' &&
                    typeof (value as { getValue?: unknown }).getValue === 'function'
                  ) {
                    const live = (value as { getValue: () => unknown }).getValue()
                    return typeof live === 'string' ? live : String(live ?? '')
                  }
                  return String(value ?? '')
                }
                const project = useStore.getState().project
                if (!project) return ErrorType.VALUE
                const code = text(codeArg)
                const address = text(refArg)
                const id = idArg === undefined ? undefined : text(idArg)
                if (address.includes(':')) {
                  const range = resolveItemRange(project.root, code, address, id)
                  if (!range.ok) return range.error === 'REF' ? ErrorType.REF : ErrorType.VALUE
                  return ArrayValueObject.createByArray(range.values)
                }
                const resolved = resolveItemCell(project.root, code, address, id)
                if (!resolved.ok) return resolved.error === 'REF' ? ErrorType.REF : ErrorType.VALUE
                const value = resolved.value ?? 0
                if (typeof value === 'number') {
                  return Number.isFinite(value) ? value : ErrorType.VALUE
                }
                return value
              },
              description: 'Reads a cell or range from another item sheet: =ITEMCELL("CODE","C18", "ITEM_ID")'
            })
          }
        } catch {
          /* custom function unavailable; sheets keep working without ITEMCELL */
        }
        const activeSheet = univerAPI.getActiveWorkbook()?.getActiveSheet()
        const removedStaleCharts = activeSheet ? removeExistingChartFloatDoms(activeSheet) : 0

        const initialSnapshot = workbook.save()
        lastSerialized = serializeSnapshot(initialSnapshot)
        if (!alreadyUniver || removedStaleCharts > 0) setNodeSpreadsheet(node.id, initialSnapshot)
        // A committed cross-sheet reference lands here when its origin mounts.
        tryConsumeFormulaLink()

        // Chart views report their rendered PNG (for print), and request edit /
        // delete; the ribbon command requests insert. Register these listeners
        // before mounting restored floats so their first refresh request cannot
        // be lost during startup.
        unsubPng = subscribePng((chartId, png) => updateNodeChart(node.id, chartId, { png }))
        unsubDelete = subscribeDelete((chartId) => {
          removeChartFloat(chartId)
          removeNodeChart(node.id, chartId)
          schedulePersist()
        })
        unsubEdit = subscribeEdit((chartId) => openEditChart(chartId))
        unsubInsert = subscribeInsert(() => openInsertChart())
        unsubRefresh = subscribeRefresh((chartId) => {
          const project = useStore.getState().project
          if (!project) return
          const fresh = findNode(project.root, node.id)
          const def = fresh?.charts?.find((c) => c.id === chartId)
          if (!def) return
          const ws = apiRef.current?.getActiveWorkbook()?.getActiveSheet()
          try {
             
            if (ws && !(ws as any).getFloatDomById?.(def.id)) addChartFloat(def)
          } catch {
            /* float lookup failed; publish still lets an existing view recover */
          }
          publishChart(def)
        })

        restoreSavedCharts()
        scheduleChartRestore(100)
        scheduleChartRestore(500)

        // Add the "Insert Chart" item to Univer's native Insert ribbon.
        ribbonDisposable = registerChartRibbonMenu(univerAPI)

        commandDisposable = univerAPI.onCommandExecuted(() => {
          schedulePersist()
          scheduleChartSync()
        })

        loadingTimer = window.setTimeout(markLoadedIfHostRendered, 5000)
      } catch (initError) {
        const message = initError instanceof Error ? initError.message : String(initError)
        setError(message)
        setLoading(false)
      }
    }
    // Let Suspense, the work-area flex layout and React StrictMode finish their
    // mount cycle before Univer measures its canvas. Initializing immediately
    // can leave the first opened workbook with a zero-sized blank renderer.
    initializeFrame = window.requestAnimationFrame(() => {
      initializeFrame = window.requestAnimationFrame(initialize)
    })

    const chartFloats = chartFloatsRef.current
    return () => {
      disposed = true
      document.removeEventListener('pointerdown', captureBeforeSheetSwitch, true)
      document.removeEventListener('pointerup', disarmPick, true)
      document.removeEventListener('keydown', handleReferenceKeys, true)
      // Carry an unfinished `=...` edit across the sheet switch before the
      // instance (and its editor) is torn down. Never overwrites an active link.
      captureUnfinishedFormula(univer)
      schedulePersistRef.current = null
      scheduleChartSyncRef.current = null
      if (saveTimer) window.clearTimeout(saveTimer)
      if (chartTimer) window.clearTimeout(chartTimer)
      if (loadingTimer) window.clearTimeout(loadingTimer)
      if (resizeFrame) window.cancelAnimationFrame(resizeFrame)
      if (initializeFrame) window.cancelAnimationFrame(initializeFrame)
      chartRestoreTimers.forEach((timer) => window.clearTimeout(timer))
      commandDisposable?.dispose()
      renderedDisposable?.dispose()
      syncChartPositions()
      unsubPng?.()
      unsubDelete?.()
      unsubEdit?.()
      unsubInsert?.()
      unsubRefresh?.()
      for (const id of Array.from(chartFloats.keys())) removeChartFloat(id)
      chartFloats.clear()
      persist()
      ribbonDisposable?.dispose()
      componentDisposable?.dispose()
      itemCellDisposable?.dispose()
      selectionDisposable?.dispose()
      const instance = univer
      univer = null
      apiRef.current = null
      workbookRef.current = null
      // Univer renders through a nested React root. Let the outer React commit
      // finish before that root is synchronously unmounted.
      if (instance) {
        window.setTimeout(() => {
          try {
            instance.dispose()
          } catch (disposeError) {
            console.error('[UniverSpreadsheet] failed to dispose', disposeError)
          }
        }, 0)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostReady, node.id, setNodeSpreadsheet])

  /* ---------------- Tutorial specimen ---------------- */
  /**
   * The tutorial asks for a worked example when it reaches the measurement-sheet
   * step. Only an empty sheet is ever written to — anything already in here is
   * the user's, and quietly replacing real measurements would be far worse than
   * a slightly emptier lesson.
   *
   * The request can arrive before Univer has finished booting, so it retries for
   * a few seconds and then gives up quietly; a missing specimen is a small loss,
   * an exception thrown at a first-time user is not.
   */
  useEffect(() => {
    let cancelled = false

    const sheetIsEmpty = (): boolean => {
      const snapshot = workbookRef.current?.save()
      const sheets = (snapshot?.sheets ?? {}) as Record<
        string,
        { cellData?: Record<string, unknown> }
      >
      return Object.values(sheets).every(
        (sheet) => Object.keys(sheet?.cellData ?? {}).length === 0
      )
    }

    const write = (): boolean => {
      const api = apiRef.current
      if (!api || !workbookRef.current) return false
      if (!sheetIsEmpty()) return true // nothing to do, but the request is answered

      const sheet = api.getActiveWorkbook()?.getActiveSheet() as unknown as
        | { getRange?: (a1: string) => { setValues?: (values: unknown[][]) => void } | null }
        | null
        | undefined
      const range = sheet?.getRange?.(SPECIMEN_SHEET_RANGE)
      if (!range?.setValues) return false
      range.setValues(SPECIMEN_SHEET_ROWS as unknown[][])
      seededRef.current = true
      return true
    }

    const onSeed = (): void => {
      let attempts = 0
      const attempt = (): void => {
        if (cancelled) return
        let done = false
        try {
          done = write()
        } catch (seedError) {
          console.error('[UniverSpreadsheet] tutorial specimen failed', seedError)
          return
        }
        if (done) return
        attempts += 1
        if (attempts < 20) window.setTimeout(attempt, 250)
      }
      attempt()
    }

    /**
     * Move the sheet's own selection onto a cell the tutorial is describing.
     *
     * Univer renders cells to canvas, so an overlay ring cannot sit on one. Its
     * selection box can, and it follows scrolling and zoom for free — and it has
     * the side benefit that Fix Final № and Set Print Area both read exactly this
     * selection, so what the reader sees highlighted is what those buttons act on.
     *
     * The facade method for setting a selection differs between Univer versions,
     * so rather than trust one name this tries the plausible ones and *verifies*
     * against getActiveRange() afterwards. If none of them worked, nothing is
     * highlighted and the card's text still names the cell.
     */
    const selectRange = (request: TutorialRangeRequest): boolean => {
      // Only ever inside the specimen. If the reader typed their own figures,
      // moving their selection would be interference, not teaching.
      if (!seededRef.current) return true
      const api = apiRef.current
      const workbook = api?.getActiveWorkbook()
      if (!workbook) return false
      const sheet = workbook.getActiveSheet() as unknown as
        | { getRange?: (a1: string) => unknown; setActiveRange?: (range: unknown) => void }
        | null
        | undefined
      const range = sheet?.getRange?.(request.a1)
      if (!range) return false

      const attempts: Array<() => void> = [
        () => (range as { activate?: () => void }).activate?.(),
        () => sheet?.setActiveRange?.(range),
        () => (workbook as unknown as { setActiveRange?: (r: unknown) => void }).setActiveRange?.(range)
      ]

      for (const attempt of attempts) {
        try {
          attempt()
        } catch {
          continue
        }
        const now = readActiveRange()
        if (
          now &&
          now.startRow === request.startRow &&
          now.startColumn === request.startColumn &&
          now.endRow === request.endRow &&
          now.endColumn === request.endColumn
        ) {
          return true
        }
      }
      return false
    }

    const onSelect = (event: Event): void => {
      const request = (event as CustomEvent<TutorialRangeRequest>).detail
      if (!request) return
      let attempts = 0
      const attempt = (): void => {
        if (cancelled) return
        let done = false
        try {
          done = selectRange(request)
        } catch (selectError) {
          console.error('[UniverSpreadsheet] tutorial selection failed', selectError)
          return
        }
        if (done) return
        attempts += 1
        if (attempts < 20) window.setTimeout(attempt, 250)
      }
      attempt()
    }

    window.addEventListener(TUTORIAL_SEED_SHEET, onSeed)
    window.addEventListener(TUTORIAL_SELECT_RANGE, onSelect)
    return () => {
      cancelled = true
      window.removeEventListener(TUTORIAL_SEED_SHEET, onSeed)
      window.removeEventListener(TUTORIAL_SELECT_RANGE, onSelect)
    }
  }, [])

  return (
    <div className="editor-page">
      <div className="editor-toolbar">
        <Table2 size={14} color={color} />
        <span className="et-title" title={focusNode.itemDescription}>
          {nodeDisplayName(focusNode)}
        </span>
        <span style={{ color: 'var(--text-faint)' }}>{subtitle}</span>

        <div className="et-print-actions">
          {focusNode.finalCell ? (
            <span
              className="et-final"
              data-tour="sheet-final-set"
              title={`Final number cell ${cellToA1(focusNode.finalCell.row, focusNode.finalCell.column)}${isShared ? ` (${nodeDisplayName(focusNode)})` : ''}`}
            >
              Final: {finalCellValue ?? '—'}
              {focusNode.unit ? ` ${focusNode.unit}` : ''}
              <button className="et-final-x" title="Clear final number" onClick={clearFinalNumber}>
                <X size={11} />
              </button>
            </span>
          ) : null}
          <button
            className="btn-mini"
            data-tour="sheet-fix-final"
            title={
              isShared
                ? `Mark the selected cell as the final total for ${nodeDisplayName(focusNode)}`
                : "Mark the selected cell as this item's final total number"
            }
            onClick={fixFinalNumber}
          >
            <Hash size={13} />
            Fix Final №
          </button>
          {node.charts && node.charts.length > 0 ? (
            <button
              className="btn-mini"
              title="List, edit, or delete charts on this sheet"
              onClick={() => setChartsListOpen(true)}
            >
              <BarChart3 size={13} />
              Charts ({node.charts.length})
            </button>
          ) : null}
          <button
            className="btn-mini"
            data-tour="sheet-set-print-area"
            title={
              isShared
                ? 'Set the selected range as the print area for the whole shared sheet'
                : 'Set the selected cell range as the print area'
            }
            onClick={setPrintArea}
          >
            <Crop size={13} />
            Set Print Area
          </button>
          {printRange ? (
            <button
              className="btn-mini ghost"
              data-tour="sheet-print-area-set"
              title="Clear print area"
              onClick={clearPrintArea}
            >
              <X size={13} />
              Clear
            </button>
          ) : null}
          {!isShared ? (
            <button
              className="btn-mini"
              title="Add more items into this sheet — it becomes a shared sheet (one grid, Final № per item)"
              onClick={convertToSharedAndAddItems}
            >
              <Plus size={13} />
              Add items to sheet
            </button>
          ) : null}
          <button
            className="btn-mini"
            title="Open Print Studio (Typst) — edit the layout as code. Sheet content is variable data."
            onClick={openPrintStudio}
          >
            <FileCode size={13} />
            Print Studio
          </button>
        </div>
        <span className="editor-badge">Univer Spreadsheet</span>
      </div>
      {isShared ? (
        <div
          className="et-shared-rail"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            flexWrap: 'wrap',
            padding: '6px 10px',
            borderBottom: '1px solid var(--border, #e2e2e2)',
            fontSize: 12
          }}
        >
          <span style={{ fontWeight: 600 }} title={`${sharedMembers.length} items share one spreadsheet`}>
            {sharedName} ({sharedMembers.length})
          </span>
          <span style={{ color: 'var(--text-faint)' }}>Fix Final № applies to:</span>
          <span style={{ color: 'var(--text-faint)' }} title="One print area is shared by every item in this workbook">
            Print area: {printRange ? rangeToA1(printRange) : 'whole used sheet'}
          </span>
          {sharedMembers.map((member) => {
            const active = member.id === focusNode.id
            const finalLabel = member.finalCell
              ? cellToA1(member.finalCell.row, member.finalCell.column)
              : 'no final'
            return (
              <button
                key={member.id}
                type="button"
                className="btn-mini"
                title={`${nodeDisplayName(member)} — final ${finalLabel}`}
                style={active ? { borderColor: 'var(--accent, #2f6fed)', fontWeight: 700 } : undefined}
                onClick={() => select(member.id)}
              >
                {nodeDisplayName(member)} · {finalLabel}
              </button>
            )
          })}
          <button type="button" className="btn-mini" title="Add more items to this shared sheet" onClick={addItemToSheet}>
            <Plus size={12} /> Add item to sheet
          </button>
          {sharedMembers.length > 1 ? (
            <button
              type="button"
              className="btn-mini ghost"
              title={`Move ${nodeDisplayName(focusNode)} back to its own separate sheet (keeps a copy of the grid)`}
              onClick={() => detachItemFromSharedSheet(focusNode.id)}
            >
              Detach
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="univer-editor-shell">
        <div ref={containerRef} className="univer-editor-host" data-tour="sheet-grid" />
        {loading && !error ? (
          <div className="univer-editor-loading">
            <strong>Loading spreadsheet...</strong>
            <span>Preparing the Univer sheet, images, and charts.</span>
          </div>
        ) : null}
        {error ? (
          <div className="univer-editor-error">
            <strong>Univer could not initialize.</strong>
            <span>{error}</span>
          </div>
        ) : null}
        {notice ? <div className="univer-editor-notice">{notice}</div> : null}
      </div>

      {printStudioOpen && project && itemPrintStudio ? (
        <EEstimatePrintStudio
          scopeKey={itemSheetScopeKey(node)}
          key={itemSheetScopeKey(node)}
          title={isShared ? 'Shared Sheet — Typst Layout Studio' : 'Item Sheet — Typst Layout Studio'}
          subtitle={isShared ? sharedName : nodeDisplayName(node)}
          defaultTypstSource={itemPrintStudio.defaultTypstSource}
          savedTypstSource={itemPrintStudio.savedTypstSource}
          compileInputs={itemPrintStudio.compileInputs}
          shadowFiles={itemPrintStudio.shadowFiles}
          compilePrelude={EE_ITEM_TABLE_PRELUDE}
          runtimeData={itemPrintStudio.runtimeData}
          projectDocumentSettings={itemPrintStudio.projectDocumentSettings}
          savedDocumentSettings={itemPrintStudio.savedDocumentSettings}
          excelExportLabel="Download this sheet as an Excel workbook"
          onExportExcel={() => exportSheetExcel()}
          onSave={async (source, settings) => {
            updatePrintStudioDocument(itemSheetScopeKey(node), source, settings)
            await useStore.getState().saveProject({ requireSaved: true })
          }}
          onClose={() => setPrintStudioOpen(false)}
        />
      ) : null}

      {chartModal ? (
        <ChartConfigModal
          mode={chartModal.mode}
          initial={editingChart}
          selection={chartSelection}
          readActiveRange={readActiveRange}
          onSubmit={submitChart}
          onClose={() => setChartModal(null)}
        />
      ) : null}

      {chartsListOpen ? (
        <ChartsListModal
          charts={node.charts ?? []}
          onEdit={(id) => {
            setChartsListOpen(false)
            openEditChart(id)
          }}
          onDelete={deleteChart}
          onClose={() => setChartsListOpen(false)}
        />
      ) : null}

    </div>
  )
}
