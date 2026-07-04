import { useStore } from '../../store/useStore'
import type { ProjectNode } from '../../types/project'
import { NodeIcon, kindLabel, nodeDisplayName } from '../nodeVisual'

interface Hit {
  node: ProjectNode
  path: string
}

function collect(node: ProjectNode, ancestors: string[], out: Hit[]): void {
  out.push({ node, path: ancestors.join(' / ') })
  node.children.forEach((c) => collect(c, [...ancestors, nodeDisplayName(node)], out))
}

export default function SearchPanel(): JSX.Element | null {
  const project = useStore((s) => s.project)
  const query = useStore((s) => s.globalSearch)
  const setQuery = useStore((s) => s.setGlobalSearch)
  const select = useStore((s) => s.select)
  if (!project) return null

  const all: Hit[] = []
  collect(project.root, [], all)
  const q = query.trim().toLowerCase()
  const results = q
    ? all.filter(
        (h) =>
          h.node.name.toLowerCase().includes(q) ||
          (h.node.itemCode ?? '').toLowerCase().includes(q) ||
          (h.node.itemDescription ?? '').toLowerCase().includes(q)
      )
    : []

  return (
    <>
      <div className="panel-header">
        <span className="panel-title">Search</span>
      </div>
      <div className="panel-body">
        <div className="search-panel">
          <input
            className="text-input"
            placeholder="Search project tree…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <div style={{ marginTop: 10 }}>
            {!q && <div className="recent-empty">Type to search pages, components and items.</div>}
            {q && results.length === 0 && (
              <div className="recent-empty">No matches for “{query}”.</div>
            )}
            {results.map((h) => (
              <div key={h.node.id} className="search-result" onClick={() => select(h.node.id)}>
                <NodeIcon node={h.node} size={14} />
                <div style={{ overflow: 'hidden' }}>
                  <div
                    style={{
                      fontSize: 12.5,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {nodeDisplayName(h.node)}
                  </div>
                  <div className="sr-path">{h.path ? `${h.path} · ` : ''}{kindLabel(h.node)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
