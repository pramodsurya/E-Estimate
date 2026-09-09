import { memo, useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, ChevronUp, Pencil, Plus, Ruler, Trash2 } from 'lucide-react'
import { useStore } from '../../store/useStore'
import type { ProjectNode } from '../../types/project'
import { canMoveNode, isComponentLike } from '../../lib/tree'
import { guideWallDetailId } from '../../lib/guideWall'
import { bundDetailId } from '../../lib/bund'
import { miSluiceNewDetailId } from '../../lib/miSluiceNew'
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
  const root = useStore((s) => s.project?.root)
  const actions = useStore.getState()

  // Template-generated items (e.g. the Guide Wall CCDW items) are driven by the
  // component's Detailed dashboard, so they are not shown as tree nodes.
  const visibleChildren = node.children.filter((child) => !child.templateGenerated)
  // Template components always carry a synthetic "Detailed" row.
  const isTemplate =
    node.templateId === 'guide-wall' ||
    node.templateId === 'bund' ||
    node.templateId === 'mi-sluice-new'
  const hasChildren = visibleChildren.length > 0 || isTemplate
  const isOpen = expandedFlag ?? (node.kind === 'title' || isTemplate)
  const renamable = isRenamable(node)
  const displayName = nodeDisplayName(node)
  // The pinned Front Page / Introduction and template-generated items are fixed.
  const pinnedPage = Boolean(node.pageTemplate)
  // Only ordinary rows can be reordered; the arrows show on hover like the rest
  // of the row actions and are greyed out when there is no neighbour to swap.
  const reorderable = node.kind !== 'title' && !pinnedPage && !node.templateGenerated
  const canUp = reorderable && Boolean(root && canMoveNode(root, node.id, 'up'))
  const canDown = reorderable && Boolean(root && canMoveNode(root, node.id, 'down'))

  return (
    <>
      <div
        className={`tree-row ${selected ? 'selected' : ''}`}
        // Lets the tutorial point at "the component" or "the item" without
        // knowing what the user called it — names here are entirely theirs.
        data-tour={`tree-${node.kind}`}
        // A rate code is stable where a name is not, so a tutorial can point at
        // one specific item it asked the reader to add.
        data-tour-code={node.itemCode || undefined}
        // Front Page and Introduction are the two pinned pages every project
        // carries, and the tutorial names them by template rather than by title
        // — the reader is free to rename either.
        data-tour-page={node.pageTemplate || undefined}
        style={{ paddingLeft: 6 + depth * 12 }}
        onClick={() => actions.select(node.id)}
        onDoubleClick={() => renamable && actions.beginRename(node.id)}
      >
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
            {reorderable && (
              <>
                <button
                  className="node-iconbtn tree-move"
                  title="Move up"
                  disabled={!canUp}
                  onClick={(e) => {
                    e.stopPropagation()
                    actions.moveNodeUp(node.id)
                  }}
                >
                  <ChevronUp size={14} />
                </button>
                <button
                  className="node-iconbtn tree-move"
                  title="Move down"
                  disabled={!canDown}
                  onClick={(e) => {
                    e.stopPropagation()
                    actions.moveNodeDown(node.id)
                  }}
                >
                  <ChevronDown size={14} />
                </button>
              </>
            )}
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
              data-tour="tree-settings"
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
            node.templateId === 'bund'
              ? bundDetailId(node.id)
              : node.templateId === 'mi-sluice-new'
                ? miSluiceNewDetailId(node.id)
                : guideWallDetailId(node.id)
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
