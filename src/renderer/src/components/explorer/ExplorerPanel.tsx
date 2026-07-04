import { FilePlus, Plus } from 'lucide-react'
import { useStore } from '../../store/useStore'
import TreeNode from './TreeNode'

export default function ExplorerPanel(): JSX.Element | null {
  const project = useStore((s) => s.project)
  const openAddPage = useStore((s) => s.openAddPage)
  const addComponent = useStore((s) => s.addComponent)
  if (!project) return null

  return (
    <>
      <div className="panel-header">
        <span className="panel-title">Explorer</span>
        <div className="panel-actions">
          <button
            className="panel-iconbtn"
            title="Add Page"
            onClick={() => openAddPage(project.root.id)}
          >
            <FilePlus size={15} />
          </button>
          <button className="panel-iconbtn" title="Add Component" onClick={() => addComponent()}>
            <Plus size={16} />
          </button>
        </div>
      </div>
      <div className="panel-body">
        <div className="tree">
          <TreeNode node={project.root} depth={0} />
        </div>
      </div>
    </>
  )
}
