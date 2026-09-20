import { Boxes, FilePlus, FolderInput, PackagePlus, Plus } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { memberLeadStatus, useClusterStore } from '../../store/useClusterStore'
import type { LoadedMember } from '../../store/useClusterStore'
import ClusterMark from '../tutorial/ClusterMark'
import TreeNode from './TreeNode'

function ClusterMemberRow({ member, depth }: { member: LoadedMember; depth: number }): JSX.Element {
  const readiness = memberLeadStatus(member)
  return (
    <div className="tree-row cluster-member-row" style={{ paddingLeft: 6 + depth * 12 }}>
      <span className="node-icon">
        {member.ref.kind === 'cluster' ? <ClusterMark size={15} /> : <Boxes size={15} color="var(--component)" />}
      </span>
      <span
        className="node-label"
        title={`${member.ref.relativePath}${member.error ? ` — ${member.error}` : ''}`}
      >
        {member.ref.name}
      </span>
      {!member.error &&
        (readiness.leadReady ? (
          <span className="cluster-badge ready" title="All of this member's own Leads are applied">
            Leads ✓
          </span>
        ) : (
          <span
            className="cluster-badge missing"
            title={readiness.missingItemKeys.length > 0 ? `Missing: ${readiness.missingItemKeys.join(', ')}` : 'Not ready'}
          >
            Leads !
          </span>
        ))}
      {member.error && (
        <span className="cluster-badge error" title={member.error}>
          Unreadable
        </span>
      )}
      {!member.error && member.project && (
        <span className="node-actions">
          <button
            className="node-iconbtn"
            title="Open this project to edit, then come back"
            onClick={() => void useClusterStore.getState().drillIntoMember(member.ref.id)}
          >
            Open
          </button>
        </span>
      )}
      {!member.error && member.nested && (
        <span className="node-actions">
          <button
            className="node-iconbtn"
            title="Open the nested cluster"
            onClick={() => void useClusterStore.getState().drillIntoNestedCluster(member.ref.id)}
          >
            Open
          </button>
        </span>
      )}
    </div>
  )
}

function ClusterMemberRows({ members, depth }: { members: LoadedMember[]; depth: number }): JSX.Element {
  return (
    <>
      {members.map((member) => (
        <div key={member.ref.id}>
          <ClusterMemberRow member={member} depth={depth} />
          {member.nestedMembers.length > 0 && (
            <ClusterMemberRows members={member.nestedMembers} depth={depth + 1} />
          )}
        </div>
      ))}
    </>
  )
}

function ClusterExplorer(): JSX.Element {
  const cluster = useClusterStore((s) => s.cluster)
  const members = useClusterStore((s) => s.members)
  const loading = useClusterStore((s) => s.loading)
  if (!cluster) return <></>
  return (
    <>
      <div className="panel-header">
        <span className="panel-title" title="Cluster Project — members act as components">
          <ClusterMark size={14} /> Cluster Explorer
        </span>
        <div className="panel-actions">
          <button
            className="panel-iconbtn"
            title="Import project from the cluster folder"
            onClick={() => void useClusterStore.getState().importMember('project')}
          >
            <FolderInput size={15} />
          </button>
          <button
            className="panel-iconbtn"
            title="Create project in the cluster folder"
            onClick={() => {
              const name = window.prompt('New project name:')
              if (name && name.trim()) void useClusterStore.getState().createMemberProject(name)
            }}
          >
            <PackagePlus size={15} />
          </button>
        </div>
      </div>
      <div className="panel-body">
        <div className="tree explorer-tree">
          <div className="tree-row cluster-title-row" style={{ paddingLeft: 6 }}>
            <span className="node-icon">
              <ClusterMark size={15} />
            </span>
            <span className="node-label" title={cluster.meta.name}>
              {cluster.meta.name}
            </span>
          </div>
          {loading ? (
            <div className="recent-empty">Loading members…</div>
          ) : members.length === 0 ? (
            <div className="recent-empty">No members yet.</div>
          ) : (
            <ClusterMemberRows members={members} depth={1} />
          )}
        </div>
      </div>
    </>
  )
}

export default function ExplorerPanel(): JSX.Element | null {
  const project = useStore((s) => s.project)
  const view = useStore((s) => s.view)
  const cluster = useClusterStore((s) => s.cluster)
  const openAddPage = useStore((s) => s.openAddPage)
  const addComponent = useStore((s) => s.addComponent)

  if (view === 'cluster' && cluster) return <ClusterExplorer />
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
        <div className="tree explorer-tree">
          <TreeNode node={project.root} depth={0} />
        </div>
      </div>
    </>
  )
}
