import { FilePlus2, FolderOpen } from 'lucide-react'
import { useStore } from '../../store/useStore'

export default function HomeScreen(): JSX.Element {
  const startNewProject = useStore((s) => s.startNewProject)
  const openProjectFromDisk = useStore((s) => s.openProjectFromDisk)
  const openRecent = useStore((s) => s.openRecent)
  const recent = useStore((s) => s.recent)

  return (
    <div className="home">
      <div className="home-hero">
        <span className="home-logo" />
        <span className="home-title">E-Estimate</span>
      </div>
      <div className="home-subtitle">Construction cost estimation · Telangana SOR / SSR</div>

      <div className="home-columns">
        <div className="home-col">
          <h3>Start</h3>
          <button className="home-action" onClick={startNewProject}>
            <FilePlus2 className="ha-icon" size={18} /> New Project…
          </button>
          <button className="home-action" onClick={() => void openProjectFromDisk()}>
            <FolderOpen className="ha-icon" size={18} /> Open Project…
          </button>
        </div>

        <div className="home-col">
          <h3>Recent</h3>
          {recent.length === 0 ? (
            <div className="recent-empty">No recent projects yet.</div>
          ) : (
            <div className="recent-list">
              {recent.map((r) => (
                <button
                  key={r.path}
                  className="recent-item"
                  title={r.path}
                  onClick={() => void openRecent(r.path)}
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
