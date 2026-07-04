import { memo, useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Pencil, Plus } from 'lucide-react'
import { useStore } from '../../store/useStore'
import type { ProjectNode } from '../../types/project'
import { isComponentLike } from '../../lib/tree'
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

  const hasChildren = node.children.length > 0
  const isOpen = expandedFlag ?? node.kind === 'title'
  const renamable = isRenamable(node)
  const displayName = nodeDisplayName(node)

  return (
    <>
      <div
        className={`tree-row ${selected ? 'selected' : ''}`}
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
          </span>
        )}
      </div>
      {isOpen && node.children.map((c) => <TreeNode key={c.id} node={c} depth={depth + 1} />)}
    </>
  )
})

export default TreeNode

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
