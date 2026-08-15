import '@univerjs/preset-docs-core/lib/index.css'
import '@univerjs/preset-docs-drawing/lib/index.css'

import {
  ICommandService,
  JSONX,
  LocaleType,
  LogLevel,
  mergeLocales,
  Univer,
  UniverInstanceType,
  type DocumentDataModel,
  type IDocumentData
} from '@univerjs/core'
import { UniverDocsCorePreset } from '@univerjs/preset-docs-core'
import { UniverDocsDrawingPreset } from '@univerjs/preset-docs-drawing'
import { InsertDocDrawingCommand } from '@univerjs/docs-drawing-ui'
import enUS from '@univerjs/preset-docs-core/locales/en-US'
import drawingEnUS from '@univerjs/preset-docs-drawing/locales/en-US'
import { DocSelectionManagerService, RichTextEditingMutation } from '@univerjs/docs'
import { AlertTriangle, Crop, Hash, Printer } from 'lucide-react'
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState
} from 'react'
import { useStore } from '../../store/useStore'
import { createUniverDocumentData, documentPlainText } from '../../lib/univerDocument'
import { resolveVillageLocation } from '../../lib/masterData'
import { createDocumentFinal, resolveDocumentFinal } from '../../lib/documentFinal'
import { findNode } from '../../lib/tree'
import DocumentPrintAreaModal from './DocumentPrintAreaModal'
import PrintLayoutModal from '../print/PrintLayoutModal'
import type { ProjectNode } from '../../types/project'

const PERSIST_DEBOUNCE_MS = 600

export interface UniverDocumentHandle {
  /** Insert or replace one drawing through Univer's registered drawing commands. */
  applyDrawingSnapshot(documentData: IDocumentData, drawingId: string): Promise<boolean>
}

interface UniverDocumentProps {
  node: ProjectNode
  allowImages?: boolean
  /** Item documents also carry Fix Final No. / Print Area / Print Preview. */
  showItemTools?: boolean
  /** Render the stored snapshot without editor controls or persistence (VPV). */
  preview?: boolean
}

/**
 * Rich page editor. Mirrors the Univer spreadsheet wrapper: one Univer instance
 * per mounted node, snapshot persisted into the project file on a debounce.
 *
 * `allowImages` registers the drawing preset, which adds the Insert Image menu
 * and stores pictures as base64 inside the document snapshot. It is enabled for
 * the Front Page only, so ordinary pages cannot bloat the project file.
 */
const UniverDocument = forwardRef<UniverDocumentHandle, UniverDocumentProps>(
  function UniverDocument(
    { node, allowImages = false, showItemTools = false, preview = false },
    ref
  ): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const univerRef = useRef<Univer | null>(null)
  const applyDrawingRef = useRef<UniverDocumentHandle['applyDrawingSnapshot']>(
    async () => false
  )
  const setNodeDocumentData = useStore((state) => state.setNodeDocumentData)
  const setNodeDocumentFinal = useStore((state) => state.setNodeDocumentFinal)
  const setNodeDocumentPrintArea = useStore((state) => state.setNodeDocumentPrintArea)
  const [notice, setNotice] = useState<string | null>(null)
  const [printAreaOpen, setPrintAreaOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [hostReady, setHostReady] = useState<{ nodeId: string; ready: boolean }>({
    nodeId: '',
    ready: false
  })

  useImperativeHandle(
    ref,
    () => ({
      applyDrawingSnapshot: (documentData, drawingId) =>
        applyDrawingRef.current(documentData, drawingId)
    }),
    []
  )

  /**
   * Univer sizes its canvas from the container at construction time. Mounting it
   * into a container that is still 0x0 produces a zero-size, uneditable page, so
   * creation waits until the host has real dimensions.
   */
  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    let frame: number | null = null

    const update = (): void => {
      const rect = container.getBoundingClientRect()
      const next = { nodeId: node.id, ready: rect.width > 0 && rect.height > 0 }
      setHostReady((current) =>
        current.nodeId === next.nodeId && current.ready === next.ready ? current : next
      )
      if (next.ready) {
        if (frame) window.cancelAnimationFrame(frame)
        frame = window.requestAnimationFrame(() => window.dispatchEvent(new Event('resize')))
      }
    }

    setHostReady((current) =>
      current.nodeId === node.id && !current.ready ? current : { nodeId: node.id, ready: false }
    )
    update()
    frame = window.requestAnimationFrame(update)
    const observer = new ResizeObserver(update)
    observer.observe(container)

    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [node.id])

  useEffect(() => {
    const container = containerRef.current
    if (!container || hostReady.nodeId !== node.id || !hostReady.ready) return

    let univer: Univer | null = null
    let disposed = false
    let persistTimer: number | null = null
    let initializeFrame: number | null = null
    let lastSerialized = ''
    let commandDisposable: { dispose: () => void } | null = null
    let documentApi: DocumentDataModel | null = null

    const flush = (protectExternalUpdate = false): void => {
      if (preview) return
      const snapshot = documentApi?.getSnapshot()
      if (!snapshot) return
      const serialized = JSON.stringify(snapshot)
      if (serialized === lastSerialized) return
      if (protectExternalUpdate) {
        const currentProject = useStore.getState().project
        const currentDocumentData = currentProject
          ? findNode(currentProject.root, node.id)?.documentData
          : undefined
        // PageEditor can replace the stored snapshot (for example, by adding
        // the Cost object) and then remount Univer. Never let the retiring
        // editor overwrite that newer snapshot with its old canvas state.
        if (
          currentDocumentData &&
          JSON.stringify(currentDocumentData) !== lastSerialized
        ) {
          return
        }
      }
      lastSerialized = serialized
      setNodeDocumentData(node.id, snapshot, documentPlainText(snapshot))
    }

    const disposeUniver = (instance: Univer | null): void => {
      if (!instance) return
      // Univer owns a nested React root. Disposing during this effect cleanup
      // synchronously unmounts it while the app root is still committing.
      window.setTimeout(() => {
        try {
          instance.dispose()
        } catch (reason) {
          console.error('[UniverDocument] failed to dispose', reason)
        }
      }, 0)
    }

    const initialize = async (): Promise<void> => {
      if (disposed) return

      try {
        setError(null)
        setLoading(true)
        container.innerHTML = ''

        const projectMeta = useStore.getState().project?.meta
        let tableLocation
        if (
          node.pageTemplate === 'front' &&
          !node.frontCoverInitialized &&
          projectMeta?.location
        ) {
          try {
            tableLocation = await resolveVillageLocation(projectMeta.location)
          } catch (reason) {
            // The saved location metadata remains a safe offline fallback.
            console.warn('[UniverDocument] village lookup failed', reason)
          }
          if (disposed) return
        }

        univer = new Univer({
          locale: LocaleType.EN_US,
          locales: {
            [LocaleType.EN_US]: allowImages ? mergeLocales(enUS, drawingEnUS) : enUS
          },
          logLevel: LogLevel.WARN
        })

        const presets = [
          UniverDocsCorePreset({
            container,
            // The formatting toolbar (font, size, bold/italic/underline, colour,
            // alignment, lists) lives inside the header bar, as it does for sheets.
            header: !preview,
            toolbar: !preview,
            ribbonType: 'classic',
            contextMenu: !preview,
            ...(preview ? { disableAutoFocus: true as const } : {})
          }),
          // Registered after core, exactly as the sheets drawing preset is.
          ...(allowImages ? [UniverDocsDrawingPreset()] : [])
        ]

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const register = univer.registerPlugin.bind(univer) as (plugin: any, config?: any) => void
        for (const preset of presets) {
          for (const plugin of preset.plugins) {
            if (Array.isArray(plugin)) register(plugin[0], plugin[1])
            else register(plugin)
          }
        }

        const initial = createUniverDocumentData(node, projectMeta, tableLocation)
        const shouldPersistInitialCover =
          node.pageTemplate === 'front' && !node.frontCoverInitialized
        lastSerialized = JSON.stringify(initial)
        documentApi = univer.createUnit<IDocumentData, DocumentDataModel>(
          UniverInstanceType.UNIVER_DOC,
          initial
        )
        if (!documentApi) throw new Error('Univer Docs returned no document instance.')
        const commandService = univer.__getInjector().get(ICommandService)
        univerRef.current = univer
        applyDrawingRef.current = async (documentData, drawingId) => {
          const activeUniver = univerRef.current
          if (disposed || !activeUniver || !documentApi) return false
          const before = documentApi.getSnapshot()
          const currentDrawing = before.drawings?.[drawingId]
          const currentAnchor = before.body?.customBlocks?.find(
            (block) => block.blockId === drawingId
          )
          const nextDrawing = documentData.drawings?.[drawingId]
          const nextSource = (nextDrawing as { source?: string } | undefined)?.source

          console.info('[FrontCoverCost] drawing command start', {
            nodeId: node.id,
            unitId: before.id,
            drawingId,
            hadDrawing: Boolean(currentDrawing),
            hadAnchor: Boolean(currentAnchor),
            sourceType: nextSource?.slice(0, nextSource.indexOf(';')) ?? 'missing',
            sourceLength: nextSource?.length ?? 0
          })

          if (!nextDrawing) {
            console.error('[FrontCoverCost] replacement drawing is missing', {
              drawingId,
              drawingIds: Object.keys(documentData.drawings ?? {})
            })
            return false
          }

          try {
            if (currentDrawing) {
              if (!currentAnchor) {
                console.error('[FrontCoverCost] stored drawing has no custom-block anchor', {
                  drawingId,
                  customBlocks: before.body?.customBlocks ?? []
                })
                return false
              }
              // Replace the image data in place. Removing and reinserting the
              // drawing loses its live anchor and can race the editor debounce,
              // which is why Update Cost previously appeared to do nothing.
              const updatedDrawing = {
                ...currentDrawing,
                drawingType: nextDrawing.drawingType,
                imageSourceType: (nextDrawing as { imageSourceType?: unknown }).imageSourceType,
                source: nextSource,
                title: nextDrawing.title,
                description: nextDrawing.description,
                layoutType: nextDrawing.layoutType,
                behindDoc: nextDrawing.behindDoc,
                wrapText: nextDrawing.wrapText,
                allowTransform: (nextDrawing as { allowTransform?: unknown }).allowTransform
              }
              const actions = JSONX.getInstance().replaceOp(
                ['drawings', drawingId],
                currentDrawing,
                updatedDrawing
              )
              const updated = commandService.syncExecuteCommand(RichTextEditingMutation.id, {
                unitId: before.id,
                actions,
                textRanges: null,
                noNeedSetTextRange: true
              })
              await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
              const afterUpdate = documentApi.getSnapshot()
              const savedDrawing = afterUpdate.drawings?.[drawingId] as
                | { source?: string; layoutType?: unknown }
                | undefined
              const sourceUpdated = savedDrawing?.source === nextSource
              console.info('[FrontCoverCost] update command result', {
                drawingId,
                updated: Boolean(updated),
                sourceUpdated,
                anchorPresent: Boolean(
                  afterUpdate.body?.customBlocks?.some((block) => block.blockId === drawingId)
                )
              })
              if (!sourceUpdated) return false
              flush()
              return true
            }

            const drawingToInsert = {
              ...nextDrawing,
              unitId: before.id,
              subUnitId: before.id
            }
            let inserted: unknown = false

            // A false result from Univer can still leave the custom-block
            // anchor behind. Do not insert a second anchor when repairing that
            // partial state; only add the missing drawing and order records.
            if (!currentAnchor) {
              const insertionOffset = Math.max(
                0,
                (before.body?.dataStream.length ?? 2) - 2
              )
              activeUniver
                .__getInjector()
                .get(DocSelectionManagerService)
                .replaceDocRanges(
                  [
                    {
                      startOffset: insertionOffset,
                      endOffset: insertionOffset,
                      segmentId: ''
                    }
                  ],
                  { unitId: before.id, subUnitId: before.id },
                  true
                )

              inserted = await commandService.executeCommand(InsertDocDrawingCommand.id, {
                unitId: before.id,
                drawings: [drawingToInsert]
              })
            }
            await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
            let afterInsert = documentApi.getSnapshot()
            let drawingPresent = Boolean(afterInsert.drawings?.[drawingId])
            let anchorPresent = Boolean(
              afterInsert.body?.customBlocks?.some((block) => block.blockId === drawingId)
            )

            if (anchorPresent && !drawingPresent) {
              const json = JSONX.getInstance()
              const addDrawing = json.insertOp(
                ['drawings', drawingId],
                drawingToInsert
              )
              const drawingOrder = afterInsert.drawingsOrder ?? []
              const actions = drawingOrder.includes(drawingId)
                ? addDrawing
                : JSONX.compose(
                    addDrawing,
                    json.insertOp(['drawingsOrder', drawingOrder.length], drawingId)
                  )
              const recovered = commandService.syncExecuteCommand(
                RichTextEditingMutation.id,
                {
                  unitId: before.id,
                  actions,
                  textRanges: null,
                  noNeedSetTextRange: true
                }
              )
              await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
              afterInsert = documentApi.getSnapshot()
              drawingPresent = Boolean(afterInsert.drawings?.[drawingId])
              anchorPresent = Boolean(
                afterInsert.body?.customBlocks?.some((block) => block.blockId === drawingId)
              )
              console.info('[FrontCoverCost] recovered partial insertion', {
                drawingId,
                recovered: Boolean(recovered),
                drawingPresent,
                anchorPresent
              })
            }
            const insertResult = {
              drawingId,
              inserted,
              drawingPresent,
              anchorPresent,
              drawingsOrder: afterInsert.drawingsOrder ?? []
            }
            console.info(
              '[FrontCoverCost] insert command result',
              JSON.stringify(insertResult)
            )
            // Some Univer command wrappers return a falsey value even after
            // RichTextEditingMutation has committed. The saved model is the
            // authoritative success check.
            if (!drawingPresent || !anchorPresent) return false
            flush()
            return true
          } catch (reason) {
            console.error('[FrontCoverCost] drawing command failed', reason)
            return false
          }
        }
        if (!preview && shouldPersistInitialCover) {
          setNodeDocumentData(node.id, initial, documentPlainText(initial))
        }

        // Persist after edits settle, so typing does not thrash the project file.
        if (!preview) {
          commandDisposable = commandService.onCommandExecuted(() => {
            if (disposed) return
            if (persistTimer !== null) window.clearTimeout(persistTimer)
            persistTimer = window.setTimeout(flush, PERSIST_DEBOUNCE_MS)
          })
        }

        setLoading(false)
      } catch (reason) {
        // Surfaced in the UI and logged, so a failure to start is never a blank page.
        console.error('[UniverDocument] failed to start', reason)
        setError(reason instanceof Error ? reason.message : String(reason))
        setLoading(false)
        const failedInstance = univer
        univer = null
        disposeUniver(failedInstance)
      }
    }

    // React Strict Mode replays passive effects once in development. Deferring
    // creation lets its cleanup cancel the first pass before a nested root exists.
    initializeFrame = window.requestAnimationFrame(() => {
      initializeFrame = window.requestAnimationFrame(() => void initialize())
    })

    return () => {
      disposed = true
      if (initializeFrame !== null) window.cancelAnimationFrame(initializeFrame)
      if (persistTimer !== null) window.clearTimeout(persistTimer)
      // Capture whatever was typed since the last debounce before tearing down.
      flush(true)
      commandDisposable?.dispose()
      const instance = univer
      univer = null
      documentApi = null
      applyDrawingRef.current = async () => false
      univerRef.current = null
      disposeUniver(instance)
    }
  }, [node.id, allowImages, preview, hostReady, setNodeDocumentData])

  /** The estimator's current text selection, read straight from Univer. */
  const readSelection = (): { startOffset: number; endOffset: number } | null => {
    const univer = univerRef.current
    if (!univer) return null
    try {
      const range = univer
        .__getInjector()
        .get(DocSelectionManagerService)
        .getActiveTextRange()
      const startOffset = range?.startOffset
      const endOffset = range?.endOffset
      if (typeof startOffset !== 'number' || typeof endOffset !== 'number') return null
      return {
        startOffset: Math.min(startOffset, endOffset),
        endOffset: Math.max(startOffset, endOffset)
      }
    } catch (reason) {
      console.error('[UniverDocument] could not read the selection', reason)
      return null
    }
  }

  const fixFinalNumber = (): void => {
    const selection = readSelection()
    if (!selection || selection.endOffset <= selection.startOffset) {
      setNotice('Select the number in the document first, then click Fix Final No.')
      return
    }
    // Read from the store rather than the live model: the debounce may not have
    // written yet, but offsets refer to the same text either way.
    const stream = node.documentData?.body?.dataStream ?? ''
    const text = stream.slice(selection.startOffset, selection.endOffset)
    const fixed = createDocumentFinal(selection.startOffset, selection.endOffset, text)
    if (!fixed) {
      setNotice(`"${text.trim() || '(empty)'}" is not a number.`)
      return
    }
    setNodeDocumentFinal(node.id, fixed)
    setNotice(`Final quantity fixed at ${fixed.capturedValue}.`)
  }

  const final = showItemTools ? resolveDocumentFinal(node) : null

  return (
    <>
      {showItemTools && (
        <div className="doc-item-toolbar">
          <button className="btn ghost" onClick={fixFinalNumber}>
            <Hash size={14} /> Fix Final No.
          </button>
          {node.documentFinal && (
            <button
              className="btn ghost"
              onClick={() => {
                setNodeDocumentFinal(node.id, null)
                setNotice('Final quantity cleared.')
              }}
            >
              Clear
            </button>
          )}
          <button className="btn ghost" onClick={() => setPrintAreaOpen(true)}>
            <Crop size={14} /> Set Print Area
          </button>
          <button className="btn ghost" onClick={() => setPreviewOpen(true)}>
            <Printer size={14} /> Print Preview
          </button>

          <span className="doc-item-final">
            {final?.value != null ? (
              <>
                Final No: <strong>{final.value}</strong>
                {final.needsRefix && (
                  <span className="doc-item-warn" title="The document changed under the fixed selection.">
                    <AlertTriangle size={12} /> re-fix needed
                  </span>
                )}
              </>
            ) : (
              'No final number fixed'
            )}
          </span>
          {notice && <span className="doc-item-notice">{notice}</span>}
        </div>
      )}

      <div className={`univer-document-host${preview ? ' univer-document-preview' : ''}`}>
        {error && <div className="univer-document-error">The editor could not start: {error}</div>}
        {loading && !error && <div className="univer-document-loading">Loading editor...</div>}
        <div ref={containerRef} className="univer-document-container" />
      </div>

      {printAreaOpen && (
        <DocumentPrintAreaModal
          node={node}
          onApply={(area) => {
            setNodeDocumentPrintArea(node.id, area)
            setNotice(area ? 'Print area set.' : 'Print area cleared.')
          }}
          onClose={() => setPrintAreaOpen(false)}
        />
      )}
      {previewOpen && (
        // The same Print Layout dialog the spreadsheet items use, so a document
        // gets identical page controls and the same DATA description header.
        <PrintLayoutModal node={node} onClose={() => setPreviewOpen(false)} />
      )}
    </>
  )
})

export default UniverDocument
