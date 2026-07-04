import { useState } from 'react'
import { Check, Cloud, GitBranch, GitCommit, History } from 'lucide-react'
import { useStore } from '../../store/useStore'

/**
 * Part 1: UI-only placeholder. The design goal is local-first, app-managed
 * version control per `.eestimate` project (real git later). Push is only
 * meaningful once a remote is configured.
 */
export default function SourceControlPanel(): JSX.Element {
  const project = useStore((s) => s.project)
  const [message, setMessage] = useState('')
  const [remote, setRemote] = useState('')

  const hasProject = !!project
  const hasRemote = remote.trim().length > 0

  return (
    <>
      <div className="panel-header">
        <span className="panel-title">Source Control</span>
        <span className="badge-soon">preview</span>
      </div>
      <div className="panel-body">
        <div className="scm">
          {!hasProject && <div className="scm-empty">Open a project to track revisions.</div>}

          {hasProject && (
            <>
              <div className="scm-section">
                <h4>
                  <GitCommit size={12} style={{ verticalAlign: -1, marginRight: 5 }} />
                  Commit
                </h4>
                <textarea
                  className="scm-input"
                  placeholder="Message (e.g. revised barrel quantities)"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
                <button className="btn" disabled title="Local versioning engine arrives in a later part">
                  <Check size={14} /> Commit
                </button>
                <div className="scm-disabled-hint">Local versioning engine arrives later.</div>
              </div>

              <div className="scm-section">
                <h4>
                  <History size={12} style={{ verticalAlign: -1, marginRight: 5 }} />
                  History
                </h4>
                <div className="scm-empty">No commits yet.</div>
              </div>

              <div className="scm-section">
                <h4>
                  <GitBranch size={12} style={{ verticalAlign: -1, marginRight: 5 }} />
                  Branch
                </h4>
                <div className="scm-commit">
                  <span className="c-msg">main</span>
                  <span className="c-meta">current branch</span>
                </div>
                <div className="btn-row" style={{ marginTop: 8 }}>
                  <button className="btn ghost" disabled>
                    Switch
                  </button>
                  <button className="btn ghost" disabled>
                    New Branch
                  </button>
                </div>
              </div>

              <div className="scm-section">
                <h4>
                  <Cloud size={12} style={{ verticalAlign: -1, marginRight: 5 }} />
                  Remote
                </h4>
                <input
                  className="text-input"
                  placeholder="Remote URL (optional)"
                  value={remote}
                  onChange={(e) => setRemote(e.target.value)}
                />
                <div className="btn-row" style={{ marginTop: 8 }}>
                  <button className="btn ghost" disabled={!hasRemote} title={hasRemote ? '' : 'Configure a remote first'}>
                    Push
                  </button>
                  <button className="btn ghost" disabled={!hasRemote}>
                    Pull
                  </button>
                </div>
                {!hasRemote && (
                  <div className="scm-disabled-hint">Push/Pull enable once a remote is set.</div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
