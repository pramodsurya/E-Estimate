import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useClusterStore } from '../../store/useClusterStore'
import ClusterMark from '../tutorial/ClusterMark'

/**
 * Cluster breadcrumb: `Cluster Name > Member Project Name` with a way back.
 * Visible whenever a cluster is open — both in the cluster view and drilled
 * into a member project. Member edits happen in the project; Back returns to
 * the cluster (with an unsaved-changes check) and refreshes its totals.
 */
export default function ClusterBreadcrumb(): JSX.Element | null {
  const crumbs = useClusterStore((s) => s.crumbs)
  const cluster = useClusterStore((s) => s.cluster)
  const backFromMember = useClusterStore((s) => s.backFromMember)
  if (!cluster || crumbs.length === 0) return null
  return (
    <div className="cluster-crumbbar" data-tour="cluster-breadcrumb">
      <span className="cluster-crumb-logo">
        <ClusterMark size={14} />
      </span>
      {crumbs.map((crumb, index) => (
        <span key={`${crumb.kind}-${crumb.path}-${index}`} className="cluster-crumb">
          {index > 0 && <ChevronRight size={13} className="cluster-crumb-sep" />}
          <span className={`cluster-crumb-label ${index === crumbs.length - 1 ? 'current' : ''}`}>
            {crumb.kind === 'cluster' ? 'Cluster' : 'Project'}: {crumb.label}
          </span>
        </span>
      ))}
      {crumbs.length > 1 && (
        <button type="button" className="btn btn-sm cluster-crumb-back" onClick={() => void backFromMember()}>
          <ChevronLeft size={14} /> Back to Cluster
        </button>
      )}
    </div>
  )
}
