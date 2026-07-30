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

export default function PageEditor({ node }: { node: ProjectNode }): JSX.Element {
  const project = useStore((state) => state.project)
  const documentRef = useRef<UniverDocumentHandle | null>(null)
  const [costUpdating, setCostUpdating] = useState(false)
  const [coverStatus, setCoverStatus] = useState<string | null>(null)
  const isFrontPage = node.pageTemplate === 'front'
  const hasCostPlaceholder = frontCoverHasEstimatedCost(node)

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
      const dashboardCost =
        typeof project?.meta.estimatedCost === 'number' &&
        Number.isFinite(project.meta.estimatedCost)
          ? project.meta.estimatedCost
          : null
      const documentData = addFrontCoverEstimatedCost(node, dashboardCost)
      await applyCostDrawing(documentData)
      setCoverStatus(
        dashboardCost === null
          ? 'Cost placeholder added - drag it anywhere on the page'
          : 'Cost image added from Dashboard - drag it anywhere on the page'
      )
    } catch (reason) {
      console.error('[PageEditor] failed to add Front Cover cost placeholder', reason)
      setCoverStatus('Could not insert the cost image - check the console')
    } finally {
      setCostUpdating(false)
    }
  }

  const updateCoverCost = async (): Promise<void> => {
    if (!isFrontPage || !project || costUpdating) return
    const estimatedCost = project.meta.estimatedCost
    if (typeof estimatedCost !== 'number' || !Number.isFinite(estimatedCost)) {
      setCoverStatus('Sync the Project Dashboard before updating cost')
      return
    }

    setCostUpdating(true)
    setCoverStatus(null)
    try {
      const documentData = updateFrontCoverEstimatedCost(node, estimatedCost)
      await applyCostDrawing(documentData)
      setCoverStatus('Estimated cost updated from Dashboard')
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
              disabled={costUpdating}
              onClick={updateCoverCost}
              title="Update only the movable Estimated Cost box from the Project Dashboard total"
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
