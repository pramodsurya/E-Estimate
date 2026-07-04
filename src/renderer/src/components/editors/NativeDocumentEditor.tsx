import { FileText } from 'lucide-react'
import { useStore } from '../../store/useStore'
import type { ProjectNode } from '../../types/project'

export default function NativeDocumentEditor({
  node,
  title,
  subtitle,
  color = 'var(--page)'
}: {
  node: ProjectNode
  title: string
  subtitle?: string
  color?: string
}): JSX.Element {
  const setNodeDocument = useStore((state) => state.setNodeDocument)

  return (
    <div className="editor-page">
      <div className="editor-toolbar">
        <FileText size={14} color={color} />
        <span className="et-title">{title}</span>
        {subtitle && <span style={{ color: 'var(--text-faint)' }}>{subtitle}</span>}
        <span className="editor-badge">Native Document</span>
      </div>
      <div className="doc-editor">
        <div className="doc-page">
          <textarea
            value={node.document ?? ''}
            placeholder="Write page notes, item notes, or report text..."
            onChange={(event) => setNodeDocument(node.id, event.target.value)}
          />
        </div>
      </div>
    </div>
  )
}
