import '@univerjs/preset-sheets-core/lib/index.css'
import '@univerjs/preset-sheets-drawing/lib/index.css'

import { FUniver } from '@univerjs/core/facade'
import { LocaleType, LogLevel, mergeLocales, Univer, type IWorkbookData } from '@univerjs/core'
import {
  UniverSheetsCorePreset,
  type FWorkbook,
  type IFUniverSheetsMixin
} from '@univerjs/preset-sheets-core'
import { UniverSheetsDrawingPreset } from '@univerjs/preset-sheets-drawing'
import enUS from '@univerjs/preset-sheets-core/locales/en-US'
import drawingEnUS from '@univerjs/preset-sheets-drawing/locales/en-US'
import { BarChart3, Hash, Printer, Table2, Crop, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  createUniverWorkbookData,
  isUniverWorkbookData
} from '../../lib/univerSpreadsheet'
import { useStore } from '../../store/useStore'
import { findNode } from '../../lib/tree'
import {
  buildChartConfig,
  chartValuesContainData,
  readChartValuesFromSnapshot,
  type CellValue
} from '../../lib/chartData'
import { cellToA1, readFinalValueFromSnapshot } from '../../lib/finalNumber'
import type { CellRange, ChartDef, ProjectNode } from '../../types/project'
import { nodeDisplayName } from '../nodeVisual'
import PrintLayoutModal from '../print/PrintLayoutModal'
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

export default function UniverSpreadsheet({ node }: { node: ProjectNode }): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const apiRef = useRef<UniverSheetsApi | null>(null)
  const workbookRef = useRef<FWorkbook | null>(null)
  const setNodeSpreadsheet = useStore((state) => state.setNodeSpreadsheet)
  const setNodePrint = useStore((state) => state.setNodePrint)
  const addNodeChart = useStore((state) => state.addNodeChart)
  const updateNodeChart = useStore((state) => state.updateNodeChart)
  const removeNodeChart = useStore((state) => state.removeNodeChart)
  const setNodeFinalCell = useStore((state) => state.setNodeFinalCell)
  const chartFloatsRef = useRef<Map<string, { dispose?: () => void }>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const [printOpen, setPrintOpen] = useState(false)
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
    setNodePrint(node.id, { ...node.print, range })
    setNotice('Print area set.')
    window.setTimeout(() => setNotice(null), 1800)
  }

  const clearPrintArea = (): void => {
    setNodePrint(node.id, { ...node.print, range: null })
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
    setNodeFinalCell(node.id, cell)
    const a1 = cellToA1(cell.row, cell.column)
    let value: unknown
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      value = (apiRef.current?.getActiveWorkbook()?.getActiveSheet()?.getRange(a1) as any)?.getValue()
    } catch {
      value = undefined
    }
    const shown = typeof value === 'number' || typeof value === 'string' ? ` = ${value}` : ''
    setNotice(`Final number fixed at ${a1}${shown}`)
    window.setTimeout(() => setNotice(null), 2500)
  }

  const clearFinalNumber = (): void => setNodeFinalCell(node.id, null)

  const finalCellValue = readFinalValueFromSnapshot(node)

  /* ---------------- Charts ---------------- */

  /** Read the chart's data range and push a fresh Chart.js config to its view. */
  const publishChart = (def: ChartDef): boolean => {
    const ws = apiRef.current?.getActiveWorkbook()?.getActiveSheet()
    let values: CellValue[][] = []
    if (ws) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((ws as any).getFloatDomById?.(def.id)) (ws as any).removeFloatDom?.(def.id)
    } catch {
      /* stale float dom could not be removed; add attempt below will fail safely */
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  const openPrintLayout = (): void => {
    syncChartPositions()
    setPrintOpen(true)
  }

  const editingChart =
    chartModal?.mode === 'edit'
      ? node.charts?.find((c) => c.id === chartModal.chartId)
      : undefined

  const printRange = node.print?.range ?? null
  const color = node.itemSource === 'SOR' ? 'var(--item-sor)' : 'var(--item-ssr)'
  const subtitle = useMemo(
    () =>
      `${node.itemSource ?? ''}${node.unit ? ` - unit ${node.unit}` : ''}`.trim() ||
      'Spreadsheet',
    [node.itemSource, node.unit]
  )

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

        const alreadyUniver = isUniverWorkbookData(node.spreadsheet)
        const workbookData = createUniverWorkbookData(node)

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

        // Register the Chart.js float component and mount any saved charts.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        componentDisposable = (univerAPI as any).registerComponent(CHART_COMPONENT_KEY, ChartFloat)
        const activeSheet = univerAPI.getActiveWorkbook()?.getActiveSheet()
        const removedStaleCharts = activeSheet ? removeExistingChartFloatDoms(activeSheet) : 0

        const initialSnapshot = workbook.save()
        lastSerialized = serializeSnapshot(initialSnapshot)
        if (!alreadyUniver || removedStaleCharts > 0) setNodeSpreadsheet(node.id, initialSnapshot)

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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

    return () => {
      disposed = true
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
      for (const id of Array.from(chartFloatsRef.current.keys())) removeChartFloat(id)
      chartFloatsRef.current.clear()
      persist()
      ribbonDisposable?.dispose()
      componentDisposable?.dispose()
      univer?.dispose()
      apiRef.current = null
      workbookRef.current = null
      container.innerHTML = ''
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostReady, node.id, setNodeSpreadsheet])

  return (
    <div className="editor-page">
      <div className="editor-toolbar">
        <Table2 size={14} color={color} />
        <span className="et-title" title={node.itemDescription}>
          {nodeDisplayName(node)}
        </span>
        <span style={{ color: 'var(--text-faint)' }}>{subtitle}</span>

        <div className="et-print-actions">
          {node.finalCell ? (
            <span className="et-final" title={`Final number cell ${cellToA1(node.finalCell.row, node.finalCell.column)}`}>
              Final: {finalCellValue ?? '—'}
              {node.unit ? ` ${node.unit}` : ''}
              <button className="et-final-x" title="Clear final number" onClick={clearFinalNumber}>
                <X size={11} />
              </button>
            </span>
          ) : null}
          <button
            className="btn-mini"
            title="Mark the selected cell as this item's final total number"
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
            title="Set the selected cell range as the print area"
            onClick={setPrintArea}
          >
            <Crop size={13} />
            Set Print Area
          </button>
          {printRange ? (
            <button className="btn-mini ghost" title="Clear print area" onClick={clearPrintArea}>
              <X size={13} />
              Clear
            </button>
          ) : null}
          <button
            className="btn-mini primary"
            title="Open Print Layout & Preview"
            onClick={openPrintLayout}
          >
            <Printer size={13} />
            Print Layout
          </button>
        </div>
        <span className="editor-badge">Univer Spreadsheet</span>
      </div>

      <div className="univer-editor-shell">
        <div ref={containerRef} className="univer-editor-host" />
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

      {printOpen ? (
        <PrintLayoutModal
          node={node}
          getSnapshot={getSnapshot}
          readActiveRange={readActiveRange}
          onClose={() => setPrintOpen(false)}
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
