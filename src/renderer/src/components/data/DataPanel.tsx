import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Database, Timer, Truck } from 'lucide-react'
import { collectProjectItemGroups, type ItemUsageBranch } from '../../lib/projectItems'
import { useStore } from '../../store/useStore'
import EstimateLeadPanel from './EstimateLeadPanel'
import SeignioragePanel from './SeignioragePanel'

type BottomTab = 'seigniorage' | 'lead' | 'data'

export default function DataPanel(): JSX.Element | null {
  const project = useStore((state) => state.project)
  const selection = useStore((state) => state.analysisSelection)
  const openRateAnalysis = useStore((state) => state.openRateAnalysis)
  const openSeigniorage = useStore((state) => state.openSeigniorage)
  const [tab, setTab] = useState<BottomTab>('data')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const groups = useMemo(
    () => (project ? collectProjectItemGroups(project.root) : []),
    [project]
  )

  if (!project) return null

  return (
    <>
      <div className="data-tabs" role="tablist" aria-label="Project data">
        <button
          className={tab === 'seigniorage' ? 'active' : ''}
          onClick={() => {
            setTab('seigniorage')
            openSeigniorage()
          }}
          title="Seigniorage"
        >
          <Truck size={13} />
          Seigniorage
        </button>
        <button
          className={tab === 'lead' ? 'active' : ''}
          onClick={() => setTab('lead')}
          title="Lead"
        >
          <Timer size={13} />
          Lead
        </button>
        <button className={tab === 'data' ? 'active' : ''} onClick={() => setTab('data')}>
          <Database size={13} />
          Data
        </button>
      </div>

      {tab === 'lead' ? (
        <EstimateLeadPanel />
      ) : tab === 'seigniorage' ? (
        <SeignioragePanel />
      ) : (
        <div className="data-tree">
          {groups.length === 0 ? (
            <div className="tree-empty">Items added in Explorer will appear here.</div>
          ) : (
            groups.map((group) => {
              const isOpen = expanded[group.key] ?? selection?.key === group.key
              const selected = selection?.key === group.key && !selection.recipeOnly
              return (
                <div key={group.key} className="data-group">
                  <div
                    className={`data-item-row ${selected ? 'selected' : ''}`}
                    onClick={() => openRateAnalysis(group.key, group.usages[0].node.id)}
                    title={group.description}
                  >
                    <button
                      className="data-twisty"
                      onClick={(event) => {
                        event.stopPropagation()
                        setExpanded((current) => ({ ...current, [group.key]: !isOpen }))
                      }}
                      aria-label={isOpen ? 'Collapse usages' : 'Expand usages'}
                    >
                      {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    </button>
                    <Database
                      size={13}
                      color={
                        group.source === 'SOR'
                          ? 'var(--item-sor)'
                          : group.source === 'SSR'
                            ? 'var(--item-ssr)'
                            : 'var(--text-dim)'
                      }
                    />
                    <span className="data-item-code">{group.displayName}</span>
                    {group.displayName !== group.code && (
                      <span className="data-item-origin">{group.code}</span>
                    )}
                    <span className="data-count">{group.usages.length}</span>
                  </div>
                  {isOpen && (
                    <div className="data-branches">
                      {group.branches.map((branch) => (
                        <BranchRow
                          key={branch.id}
                          branch={branch}
                          depth={0}
                          selectedScopeNodeId={selection?.scopeNodeId ?? null}
                          onOpen={(nodeId, scopeNodeId) =>
                            openRateAnalysis(group.key, nodeId, true, scopeNodeId)
                          }
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}
    </>
  )
}

function BranchRow({
  branch,
  depth,
  selectedScopeNodeId,
  onOpen
}: {
  branch: ItemUsageBranch
  depth: number
  selectedScopeNodeId: string | null
  onOpen: (nodeId: string, scopeNodeId: string) => void
}): JSX.Element {
  const nodeId = branch.itemNodeIds[0]
  return (
    <>
      <button
        className={`data-branch-row ${selectedScopeNodeId === branch.id ? 'selected' : ''}`}
        style={{ paddingLeft: 27 + depth * 14 }}
        onClick={() => onOpen(nodeId, branch.id)}
        title={`Edit this DATA only inside ${branch.name}`}
      >
        <span className="data-branch-line">|-</span>
        <span>{branch.name}</span>
      </button>
      {branch.children.map((child) => (
        <BranchRow
          key={child.id}
          branch={child}
          depth={depth + 1}
          selectedScopeNodeId={selectedScopeNodeId}
          onOpen={onOpen}
        />
      ))}
    </>
  )
}
