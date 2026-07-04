import { FilePlus2, Plus, Settings } from 'lucide-react'
import { useStore } from '../../store/useStore'
import LocationMap from '../newproject/LocationMap'
import { NodeIcon } from '../nodeVisual'

export default function TitleDashboard(): JSX.Element | null {
  const project = useStore((s) => s.project)
  const addComponent = useStore((s) => s.addComponent)
  const openAddPage = useStore((s) => s.openAddPage)
  const select = useStore((s) => s.select)
  const openSettings = useStore((s) => s.openSettings)
  if (!project) return null

  const { meta, root } = project
  const components = root.children.filter((c) => c.kind === 'component')
  const pages = root.children.filter((c) => c.kind === 'page')

  return (
    <div className="dashboard">
      <div className="dash-header">
        <div>
          <div className="dash-eyebrow">Project</div>
          <h1 className="dash-title">
            <NodeIcon node={root} size={22} />
            {meta.name || root.name}
          </h1>
        </div>
        <div className="dash-actions">
          <button className="btn ghost" onClick={() => openAddPage(root.id)}>
            <FilePlus2 size={15} /> Add Page
          </button>
          <button className="btn" onClick={() => addComponent()}>
            <Plus size={15} /> Add Component
          </button>
          <button className="btn ghost" title="Project settings" onClick={() => openSettings(root.id)}>
            <Settings size={15} />
          </button>
        </div>
      </div>

      <div className="dash-grid">
        <div className="dash-card">
          <div className="card-title">Details</div>
          <div className="meta-row">
            <span className="meta-key">SOR / SSR Year</span>
            <span className="meta-val">{meta.sorYear || '—'}</span>
          </div>
          <div className="meta-row">
            <span className="meta-key">Location</span>
            <span className="meta-val">
              {meta.location
                ? `${meta.location.lat.toFixed(4)}, ${meta.location.lng.toFixed(4)}`
                : '—'}
            </span>
          </div>
          <div className="meta-row">
            <span className="meta-key">Components</span>
            <span className="meta-val">{components.length}</span>
          </div>
          <div className="meta-row">
            <span className="meta-key">Pages</span>
            <span className="meta-val">{pages.length}</span>
          </div>
        </div>

        <div className="dash-card">
          <div className="card-title">Flags</div>
          {meta.flags.length ? (
            <div className="chips">
              {meta.flags.map((f) => (
                <span key={f} className="chip">
                  {f}
                </span>
              ))}
            </div>
          ) : (
            <div className="list-empty">No flags selected.</div>
          )}
        </div>

        <div className="dash-card">
          <div className="card-title">Estimated Cost</div>
          <div className="total-figure">—</div>
          <div className="list-empty">Calculated in a later part.</div>
        </div>

        <div className="dash-card span-2">
          <div className="card-title">Location</div>
          {meta.location ? (
            <LocationMap value={meta.location} onPick={() => undefined} recenterToken={0} />
          ) : (
            <div className="placeholder-box">No location set.</div>
          )}
        </div>

        <div className="dash-card">
          <div className="card-title">Project Structure</div>
          <div className="placeholder-box">Structure view — later part.</div>
        </div>

        <div className="dash-card span-2">
          <div className="card-title">
            Components
            <button className="btn ghost" onClick={() => addComponent()}>
              <Plus size={14} /> Add
            </button>
          </div>
          {components.length ? (
            <div className="list-rows">
              {components.map((c) => (
                <div key={c.id} className="list-row" onClick={() => select(c.id)}>
                  <NodeIcon node={c} size={15} />
                  <span className="lr-name">{c.name}</span>
                  <span className="lr-tag">{c.children.length} item(s)</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="list-empty">No components yet. Use “Add Component”.</div>
          )}
        </div>

        {pages.length > 0 && (
          <div className="dash-card span-2">
            <div className="card-title">Pages</div>
            <div className="list-rows">
              {pages.map((p) => (
                <div key={p.id} className="list-row" onClick={() => select(p.id)}>
                  <NodeIcon node={p} size={15} />
                  <span className="lr-name">{p.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
