import { useRef, useState } from 'react'
import { IndianRupee, Plus } from 'lucide-react'
import { NodeIcon, kindLabel } from '../nodeVisual'
import type { ProjectNode } from '../../types/project'
import UniverDocument, { type UniverDocumentHandle } from './UniverDocument'
import { useStore } from '../../store/useStore'
import {
  addFrontCoverEstimatedCost,
  frontCoverEstimatedCostDrawingId,
  frontCoverHasEstimatedCost,
  updateFrontCoverEstimatedCost
} from '../../lib/univerDocument'
import { resolveProjectEstimatedCost } from '../../lib/projectPrintInputs'

export default function PageEditor({ node }: { node: ProjectNode }): JSX.Element {
  const project = useStore((state) => state.project)
  const documentRef = useRef<UniverDocumentHandle | null>(null)
  const [costUpdating, setCostUpdating] = useState(false)
  const [coverStatus, setCoverStatus] = useState<string | null>(null)
  const isFrontPage = node.pageTemplate === 'front'
  const hasCostPlaceholder = frontCoverHasEstimatedCost(node)

  const currentDashboardCost = (): number | null => {
    const currentProject = useStore.getState().project
    return currentProject ? resolveProjectEstimatedCost(currentProject) : null
  }

  const applyCostDrawing = async (
    documentData: ReturnType<typeof addFrontCoverEstimatedCost>
  ): Promise<void> => {
    const drawingId = frontCoverEstimatedCostDrawingId(node, documentData)
    const editor = documentRef.current
    if (!editor) {
      console.error('[FrontCoverCost] Univer editor handle is unavailable', {
        nodeId: node.id,
        drawingId
      })
      throw new Error('Univer editor is not ready.')
    }
    const applied = await editor.applyDrawingSnapshot(documentData, drawingId)
    if (!applied) {
      console.error('[FrontCoverCost] Univer rejected the drawing insertion', {
        nodeId: node.id,
        drawingId
      })
      throw new Error('Univer did not insert the cost drawing.')
    }
  }

  const addCoverCost = async (): Promise<void> => {
    if (!isFrontPage || costUpdating) return
    if (hasCostPlaceholder) {
      setCoverStatus('Cost box is already on this cover')
      return
    }

    setCostUpdating(true)
    setCoverStatus(null)
    try {
      const dashboardCost = currentDashboardCost()
      if (dashboardCost === null) {
        setCoverStatus('Open Project Dashboard and click Sync before adding cost')
        return
      }
      const documentData = addFrontCoverEstimatedCost(node, dashboardCost)
      await applyCostDrawing(documentData)
      useStore.getState().updateMeta({ estimatedCost: dashboardCost })
      setCoverStatus('Current Dashboard cost added - drag it anywhere on the page')
    } catch (reason) {
      console.error('[PageEditor] failed to add Front Cover cost placeholder', reason)
      setCoverStatus('Could not insert the cost image - check the console')
    } finally {
      setCostUpdating(false)
    }
  }

  const updateCoverCost = async (): Promise<void> => {
    if (!isFrontPage || !project || costUpdating) return
    if (!hasCostPlaceholder) {
      setCoverStatus('Add the cost box first')
      return
    }
    const estimatedCost = currentDashboardCost()
    if (estimatedCost === null) {
      setCoverStatus('Open Project Dashboard and click Sync before updating cost')
      return
    }

    setCostUpdating(true)
    setCoverStatus(null)
    try {
      const documentData = updateFrontCoverEstimatedCost(node, estimatedCost)
      await applyCostDrawing(documentData)
      useStore.getState().updateMeta({ estimatedCost })
      setCoverStatus('Estimated cost updated to the current Dashboard total')
    } catch (reason) {
      console.error('[PageEditor] failed to update Front Cover cost', reason)
      setCoverStatus('Cost update failed')
    } finally {
      setCostUpdating(false)
    }
  }

  return (
    <div className="editor-page">
      <div className="editor-toolbar">
        <NodeIcon node={node} size={14} />
        <span className="et-title">{node.name}</span>
        {coverStatus && (
          <span className="front-cover-status" role="status">
            {coverStatus}
          </span>
        )}
        <span className="editor-badge">{kindLabel(node)}</span>
        {isFrontPage && (
          <>
            <button
              className="btn ghost front-cover-cost-update"
              disabled={costUpdating || hasCostPlaceholder}
              onClick={addCoverCost}
              title={
                hasCostPlaceholder
                  ? 'A movable cost box is already on this cover'
                  : 'Add a movable Estimated Cost placeholder'
              }
            >
              <Plus size={13} />
              Add Cost
            </button>
            <button
              className="btn ghost front-cover-cost-update"
              disabled={costUpdating || !hasCostPlaceholder}
              onClick={updateCoverCost}
              title={
                hasCostPlaceholder
                  ? 'Update only the movable Estimated Cost box from the current Project Dashboard total'
                  : 'Add the cost box before updating it'
              }
            >
              <IndianRupee size={13} />
              {costUpdating ? 'Updating...' : 'Update Cost'}
            </button>
          </>
        )}
      </div>
      {/* Images are enabled on the cover canvas only. */}
      <UniverDocument
        ref={documentRef}
        node={node}
        allowImages={isFrontPage}
      />
    </div>
  )
}
