import type { ProjectNode } from '../../types/project'
import { NodeIcon, nodeDisplayName } from '../nodeVisual'
import UniverDocument from './UniverDocument'
import UniverSpreadsheet from './UniverSpreadsheet'

export default function ItemSpreadsheet({ node }: { node: ProjectNode }): JSX.Element {
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

  return <UniverSpreadsheet node={node} />
}
