import { lazy } from 'react'
import type { ProjectNode } from '../../types/project'
import { NodeIcon, nodeDisplayName } from '../nodeVisual'

// WorkArea supplies Suspense. Load only the editor this item actually uses.
const UniverDocument = lazy(() => import('./UniverDocument'))
const UniverSpreadsheet = lazy(() => import('./UniverSpreadsheet'))

export default function ItemSpreadsheet({ node, focusedItemId }: { node: ProjectNode; focusedItemId?: string }): JSX.Element {
  if (node.itemEditorType === 'document') {
    return (
      <div className="editor-page">
        <div className="editor-toolbar">
          <NodeIcon node={node} size={14} />
          <span className="et-title">{nodeDisplayName(node)}</span>
          <span style={{ color: 'var(--text-faint)' }}>
            {node.itemSource ?? ''}
            {node.unit ? ` - unit ${node.unit}` : ''}
          </span>
          <span className="editor-badge">Document</span>
        </div>
        <UniverDocument key={node.id} node={node} showItemTools />
      </div>
    )
  }

  return <UniverSpreadsheet node={node} focusedItemId={focusedItemId} />
}
