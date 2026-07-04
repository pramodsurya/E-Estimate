import type { ProjectNode } from '../../types/project'
import NativeDocumentEditor from './NativeDocumentEditor'

export default function PageEditor({ node }: { node: ProjectNode }): JSX.Element {
  return <NativeDocumentEditor node={node} title={node.name} />
}
