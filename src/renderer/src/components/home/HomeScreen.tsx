import { FilePlus2, FolderOpen, Network } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { useClusterStore } from '../../store/useClusterStore'
import { isClusterPath } from '../../lib/cluster'
import EstimateMark from '../tutorial/EstimateMark'
import ClusterMark from '../tutorial/ClusterMark'
import FirstRunCard from '../tutorial/FirstRunCard'

export default function HomeScreen(): JSX.Element {
  const startNewProject = useStore((s) => s.startNewProject)
  const openProjectFromDisk = useStore((s) => s.openProjectFromDisk)
  const openRecent = useStore((s) => s.openRecent)
  const recent = useStore((s) => s.recent)

  const openRecentEntry = (path: string): void => {
    if (isClusterPath(path)) {
      void useClusterStore.getState().openClusterPath(path)
    } else {
      void openRecent(path)
    }
  }

  const projectRecents = recent.filter((r) => !isClusterPath(r.path))
  const clusterRecents = recent.filter((r) => isClusterPath(r.path))

  return (
    <div className="home">
      <div className="home-hero">
        <span className="home-logo">
          <EstimateMark size={56} />
        </span>
        <span className="home-title">E-Estimate</span>
      </div>
      <div className="home-subtitle">Construction cost estimation · Telangana SOR / SSR</div>

      {/* The invitation. Disappears for good once it has been answered. */}
      <FirstRunCard />

      <div className="home-columns">
        <div className="home-col">
          <h3>Start</h3>
          <button className="home-action" onClick={startNewProject}>
            <FilePlus2 className="ha-icon" size={18} /> New Project…
          </button>
          <button className="home-action" onClick={() => void openProjectFromDisk()}>
            <FolderOpen className="ha-icon" size={18} /> Open Project…
          </button>
          <button className="home-action" onClick={() => useClusterStore.getState().startNewCluster()}>
            <Network className="ha-icon" size={18} /> New Cluster Project…
          </button>
          <button className="home-action" onClick={() => void useClusterStore.getState().openClusterFromDialog()}>
            <FolderOpen className="ha-icon" size={18} /> Open Cluster Project…
          </button>
        </div>

        <div className="home-col">
          <h3>Recent</h3>
          {projectRecents.length === 0 ? (
            <div className="recent-empty">No recent projects yet.</div>
          ) : (
            <div className="recent-list">
              {projectRecents.map((r) => (
                <button
                  key={r.path}
                  className="recent-item"
                  title={r.path}
                  onClick={() => openRecentEntry(r.path)}
                >
                  <span className="recent-name">{r.name}</span>
                  <span className="recent-path">{r.path}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="home-col">
          <h3>
            <span className="home-cluster-title">
              <ClusterMark size={15} /> Recent Cluster Projects
            </span>
          </h3>
          {clusterRecents.length === 0 ? (
            <div className="recent-empty">
              No cluster projects yet. A cluster wraps projects in one folder — members act as components.
            </div>
          ) : (
            <div className="recent-list">
              {clusterRecents.map((r) => (
                <button
                  key={r.path}
                  className="recent-item"
                  title={r.path}
                  onClick={() => openRecentEntry(r.path)}
                >
                  <span className="recent-name">{r.name}</span>
                  <span className="recent-path">{r.path}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
