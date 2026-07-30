import { memo, useEffect, useRef, useState, type DragEvent } from 'react'
import { ChevronDown, ChevronRight, GripVertical, Pencil, Plus, Ruler, Trash2 } from 'lucide-react'
import { useStore } from '../../store/useStore'
import type { ProjectNode } from '../../types/project'
import { canReorderBetween, findNode, isComponentLike } from '../../lib/tree'
import { guideWallDetailId } from '../../lib/guideWall'
import { bundDetailId } from '../../lib/bund'
import { NodeIcon, isRenamable, nodeDisplayName } from '../nodeVisual'

const TreeNode = memo(function TreeNode({
  node,
  depth
}: {
  node: ProjectNode
  depth: number
}): JSX.Element {
  const selected = useStore((s) => s.selectedId === node.id)
  const renaming = useStore((s) => s.renamingId === node.id)
  const expandedFlag = useStore((s) => s.expanded[node.id])
  const actions = useStore.getState()
  // 'above' / 'below' shows which side of this row the dragged node will land on.
  const [dropEdge, setDropEdge] = useState<'above' | 'below' | null>(null)

  // Template-generated items (e.g. the Guide Wall CCDW items) are driven by the
  // component's Detailed dashboard, so they are not shown as tree nodes.
  const visibleChildren = node.children.filter((child) => !child.templateGenerated)
  // Template components always carry a synthetic "Detailed" row.
  const isTemplate = node.templateId === 'guide-wall' || node.templateId === 'bund'
  const hasChildren = visibleChildren.length > 0 || isTemplate
  const isOpen = expandedFlag ?? (node.kind === 'title' || isTemplate)
  const renamable = isRenamable(node)
  const displayName = nodeDisplayName(node)
  // The pinned Front Page / Introduction and template-generated items are fixed.
  const pinnedPage = Boolean(node.pageTemplate)
  const draggable = node.kind !== 'title' && !pinnedPage && !node.templateGenerated

  /** True when the node currently being dragged may swap places with this row. */
  const acceptsDrag = (dragId: string): boolean => {
    if (!dragId || dragId === node.id) return false
    const root = useStore.getState().project?.root
    const dragged = root ? findNode(root, dragId) : null
    return Boolean(dragged && canReorderBetween(dragged, node))
  }

  const handleDragOver = (event: DragEvent<HTMLDivElement>): void => {
    // dataTransfer payloads are unreadable during dragover, so the type marker
    // gates the highlight and the drop handler re-checks the node itself.
    if (!event.dataTransfer.types.includes('application/x-eestimate-node')) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    const bounds = event.currentTarget.getBoundingClientRect()
    setDropEdge(event.clientY < bounds.top + bounds.height / 2 ? 'above' : 'below')
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>): void => {
    const dragId = event.dataTransfer.getData('application/x-eestimate-node')
    const edge = dropEdge ?? 'above'
    setDropEdge(null)
    if (!acceptsDrag(dragId)) return
    event.preventDefault()
    event.stopPropagation()
    actions.reorderNode(dragId, node.id, edge)
  }

  return (
    <>
      <div
        className={`tree-row ${selected ? 'selected' : ''} ${dropEdge ? `drop-${dropEdge}` : ''}`}
        style={{ paddingLeft: 6 + depth * 12 }}
        draggable={draggable}
        onDragStart={(event) => {
          event.dataTransfer.setData('application/x-eestimate-node', node.id)
          event.dataTransfer.effectAllowed = 'move'
        }}
        onDragOver={handleDragOver}
        onDragLeave={() => setDropEdge(null)}
        onDrop={handleDrop}
        onDragEnd={() => setDropEdge(null)}
        onClick={() => actions.select(node.id)}
        onDoubleClick={() => renamable && actions.beginRename(node.id)}
      >
        {draggable && (
          <span className="tree-grip" title="Drag to reorder">
            <GripVertical size={11} />
          </span>
        )}
        <span
          className="twisty"
          onClick={(e) => {
            e.stopPropagation()
            if (hasChildren) actions.toggleExpand(node.id)
          }}
        >
          {hasChildren ? isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} /> : null}
        </span>
        <span className="node-icon">
          <NodeIcon node={node} />
        </span>
        {renaming ? (
          <RenameInput
            initial={displayName}
            onCommit={(v) => actions.renameNode(node.id, v)}
            onCancel={actions.cancelRename}
          />
        ) : (
          <span
            className={`node-label ${!renamable ? 'locked' : ''}`}
            title={node.itemDescription || displayName}
          >
            {displayName}
          </span>
        )}
        {!renaming && (
          <span className="node-actions">
            {node.kind === 'title' && (
              <button
                className="node-iconbtn"
                title="Add Component"
                onClick={(e) => {
                  e.stopPropagation()
                  actions.addComponent(node.id)
                }}
              >
                <Plus size={14} />
              </button>
            )}
            {isComponentLike(node) && (
              <button
                className="node-iconbtn"
                title="Add Item"
                onClick={(e) => {
                  e.stopPropagation()
                  actions.openAddItem(node.id)
                }}
              >
                <Plus size={14} />
              </button>
            )}
            <button
              className="node-iconbtn"
              title="Settings"
              onClick={(e) => {
                e.stopPropagation()
                actions.openSettings(node.id)
              }}
            >
              <Pencil size={13} />
            </button>
            {node.kind === 'item' && (
              <button
                className="node-iconbtn"
                title="Delete this Item usage and remove its DATA when no usages remain"
                onClick={(event) => {
                  event.stopPropagation()
                  if (
                    window.confirm(
                      `Delete ${displayName}? The DATA count will decrease by one.`
                    )
                  ) {
                    actions.deleteNode(node.id)
                  }
                }}
              >
                <Trash2 size={13} />
              </button>
            )}
            {node.kind === 'page' && !pinnedPage && (
              <button
                className="node-iconbtn"
                title="Delete this page"
                onClick={(event) => {
                  event.stopPropagation()
                  if (window.confirm(`Delete the page "${displayName}"?`)) {
                    actions.deleteNode(node.id)
                  }
                }}
              >
                <Trash2 size={13} />
              </button>
            )}
            {isComponentLike(node) && (
              <button
                className="node-iconbtn"
                title={`Delete this ${node.kind === 'component' ? 'component' : 'sub-component'} with everything inside it`}
                onClick={(event) => {
                  event.stopPropagation()
                  if (
                    window.confirm(
                      `Delete ${displayName} and everything inside it (items, pages, sub-components)?`
                    )
                  ) {
                    actions.deleteNode(node.id)
                  }
                }}
              >
                <Trash2 size={13} />
              </button>
            )}
          </span>
        )}
      </div>
      {isOpen && isTemplate && (
        <TemplateDetailRow
          detailId={
            node.templateId === 'bund' ? bundDetailId(node.id) : guideWallDetailId(node.id)
          }
          depth={depth + 1}
        />
      )}
      {isOpen && visibleChildren.map((c) => <TreeNode key={c.id} node={c} depth={depth + 1} />)}
    </>
  )
})

export default TreeNode

/** Synthetic "Detailed" tree row that opens a template component's dashboard. */
function TemplateDetailRow({
  detailId,
  depth
}: {
  detailId: string
  depth: number
}): JSX.Element {
  const selected = useStore((s) => s.selectedId === detailId)
  const select = useStore((s) => s.select)
  return (
    <div
      className={`tree-row ${selected ? 'selected' : ''}`}
      style={{ paddingLeft: 6 + depth * 12 }}
      onClick={() => select(detailId)}
    >
      <span className="twisty" />
      <span className="node-icon">
        <Ruler size={15} color="var(--component)" />
      </span>
      <span className="node-label">Detailed</span>
    </div>
  )
}

function RenameInput({
  initial,
  onCommit,
  onCancel
}: {
  initial: string
  onCommit: (v: string) => void
  onCancel: () => void
}): JSX.Element {
  const ref = useRef<HTMLInputElement>(null)
  const done = useRef(false)
  const [value, setValue] = useState(initial)

  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])

  const commit = (): void => {
    if (done.current) return
    done.current = true
    onCommit(value)
  }

  return (
    <input
      ref={ref}
      className="rename-input"
      value={value}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
        else if (e.key === 'Escape') {
          done.current = true
          onCancel()
        }
      }}
      onBlur={commit}
    />
  )
}
