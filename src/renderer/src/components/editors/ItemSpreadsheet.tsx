import type { ProjectNode } from '../../types/project'
import { nodeDisplayName } from '../nodeVisual'
import NativeDocumentEditor from './NativeDocumentEditor'
import UniverSpreadsheet from './UniverSpreadsheet'

export default function ItemSpreadsheet({ node }: { node: ProjectNode }): JSX.Element {
  const isDocument = node.itemEditorType === 'document'
  const color = node.itemSource === 'SOR' ? 'var(--item-sor)' : 'var(--item-ssr)'

  if (isDocument) {
    return (
      <NativeDocumentEditor
        node={node}
        title={nodeDisplayName(node)}
        subtitle={`${node.itemSource ?? ''}${node.unit ? ` - unit ${node.unit}` : ''}`}
        color={color}
      />
    )
  }

  return <UniverSpreadsheet node={node} />
}
