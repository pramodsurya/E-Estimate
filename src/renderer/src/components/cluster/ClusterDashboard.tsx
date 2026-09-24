import { useState } from 'react'
import {
  Boxes,
  FolderInput,
  FolderPlus,
  Gem,
  PackagePlus,
  RefreshCw,
  Route,
  Save,
  Trash2,
  X
} from 'lucide-react'
import {
  computeClusterSeigniorage,
  memberLeadStatus,
  useClusterStore
} from '../../store/useClusterStore'
import ClusterMark from '../tutorial/ClusterMark'

const money = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })
const money2 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const measure = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 })

/**
 * Cluster-wise tools. A cluster never edits member DATA, items or normal
 * Leads — those open in their own project (drill-in). The cluster owns only:
 * membership, weighted-average Leads, and cluster-wise combined totals.
 * Member files keep their own rates unchanged.
 */
export default function ClusterDashboard(): JSX.Element | null {
  const cluster = useClusterStore((s) => s.cluster)
  const clusterPath = useClusterStore((s) => s.clusterPath)
  const clusterDirty = useClusterStore((s) => s.clusterDirty)
  const members = useClusterStore((s) => s.members)
  const loading = useClusterStore((s) => s.loading)
  const status = useClusterStore((s) => s.status)
  const [newName, setNewName] = useState('')
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const seigniorage = (computeClusterSeigniorage(members))

  if (!cluster) return null

  const combinedEstimate = members.reduce(
    (sum, member) =>
      sum + (typeof member.project?.meta.estimatedCost === 'number' ? member.project.meta.estimatedCost : 0),
    0
  )
  const hasEstimate = members.some(
    (member) => typeof member.project?.meta.estimatedCost === 'number'
  )
  const leads = cluster.weightedLeads ?? []
  const appliedIds = new Set(cluster.appliedWeightedLeadIds ?? [])

  return (
    <div className="cluster-dashboard">
      <div className="cluster-head">
        <span className="cluster-head-logo">
          <ClusterMark size={40} />
        </span>
        <div className="cluster-head-text">
          {editingName ? (
            <span className="cluster-name-edit">
              <input
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    useClusterStore.getState().renameCluster(nameDraft)
                    setEditingName(false)
                  }
                  if (e.key === 'Escape') setEditingName(false)
                }}
              />
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  useClusterStore.getState().renameCluster(nameDraft)
                  setEditingName(false)
                }}
              >
                Save
              </button>
            </span>
          ) : (
            <h2
              title="Click to rename"
              onClick={() => {
                setNameDraft(cluster.meta.name)
                setEditingName(true)
              }}
            >
              {cluster.meta.name}
              {clusterDirty ? ' •' : ''}
            </h2>
          )}
          <div className="cluster-head-sub">
            Cluster Project · {members.length} member{members.length === 1 ? '' : 's'}
            {clusterPath ? '' : ' · not saved yet'}
          </div>
        </div>
        <div className="cluster-head-actions">
          <button
            type="button"
            className="btn btn-sm"
            title="Save cluster"
            onClick={() => void useClusterStore.getState().saveCluster()}
          >
            <Save size={14} /> Save
          </button>
          <button
            type="button"
            className="btn btn-sm"
            title="Save cluster as…"
            onClick={() => void useClusterStore.getState().saveClusterAs()}
          >
            Save As…
          </button>
          <button
            type="button"
            className="btn btn-sm"
            title="Close cluster"
            onClick={() => useClusterStore.getState().closeCluster()}
          >
            Close
          </button>
        </div>
      </div>

      {!clusterPath && (
        <div className="unsaved-cluster-notice">
          <span>
            <strong>This cluster has not been saved yet.</strong> Save it into a
            folder first — member projects must live in the same folder.
          </span>
          <button className="btn btn-sm" onClick={() => void useClusterStore.getState().saveClusterAs()}>
            Save cluster
          </button>
        </div>
      )}

      {status && (
        <div className="cluster-status" role="status">
          <span style={{ whiteSpace: 'pre-line' }}>{status}</span>
          <button
            type="button"
            className="panel-iconbtn"
            title="Dismiss"
            onClick={() => useClusterStore.getState().clearStatus()}
          >
            <X size={14} />
          </button>
        </div>
      )}

      <div className="cluster-columns">
        <section className="cluster-col">
          <h3>
            <Boxes size={15} /> Member Projects (act as Components)
          </h3>
          <p className="cluster-hint">
            Each member stays an independent project file. To edit DATA, items
            or Leads, open the member — come back when done.
          </p>
          {loading && <div className="recent-empty">Loading members…</div>}
          {!loading && members.length === 0 && (
            <div className="recent-empty">No members yet. Import or create one below.</div>
          )}
          <div className="cluster-member-list">
            {members.map((member) => {
              const readiness = memberLeadStatus(member)
              return (
                <div key={member.ref.id} className="cluster-member">
                  <span className="cluster-member-icon">
                    {member.ref.kind === 'cluster' ? <ClusterMark size={16} /> : <Boxes size={16} />}
                  </span>
                  <span className="cluster-member-text">
                    <span className="cluster-member-name">{member.ref.name}</span>
                    <span className="cluster-member-path" title={member.path}>
                      {member.ref.relativePath}
                      {member.ref.kind === 'cluster' ? ' (nested cluster)' : ''}
                    </span>
                    {member.error && <span className="cluster-badge error">{member.error}</span>}
                    {!member.error &&
                      (readiness.leadReady ? (
                        <span className="cluster-badge ready">Leads applied</span>
                      ) : (
                        <span className="cluster-badge missing" title={readiness.missingItemKeys.join(', ')}>
                          Leads missing{readiness.missingItemKeys.length > 0 ? ` (${readiness.missingItemKeys.length})` : ''}
                        </span>
                      ))}
                  </span>
                  <span className="cluster-member-actions">
                    {!member.error && member.project && (
                      <button
                        type="button"
                        className="btn btn-sm"
                        title="Open this project to edit, then come back"
                        onClick={() => void useClusterStore.getState().drillIntoMember(member.ref.id)}
                      >
                        Open
                      </button>
                    )}
                    {!member.error && member.nested && (
                      <button
                        type="button"
                        className="btn btn-sm"
                        title="Open the nested cluster"
                        onClick={() => void useClusterStore.getState().drillIntoNestedCluster(member.ref.id)}
                      >
                        Open
                      </button>
                    )}
                    <button
                      type="button"
                      className="panel-iconbtn"
                      title="Remove from cluster (file kept on disk)"
                      onClick={() => useClusterStore.getState().removeMember(member.ref.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </span>
                </div>
              )
            })}
          </div>
          <div className="cluster-add-row">
            <button
              type="button"
              className="btn btn-sm"
              title="Import a project from the cluster folder"
              onClick={() => void useClusterStore.getState().importMember('project')}
            >
              <FolderInput size={14} /> Import Project…
            </button>
            <button
              type="button"
              className="btn btn-sm"
              title="Import a nested cluster from the cluster folder"
              onClick={() => void useClusterStore.getState().importMember('cluster')}
            >
              <FolderPlus size={14} /> Import Cluster…
            </button>
            <button
              type="button"
              className="btn btn-sm"
              title="Refresh member files from disk"
              onClick={() => void useClusterStore.getState().refreshMembers()}
            >
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
          <div className="cluster-add-row">
            <input
              placeholder="New project name…"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newName.trim()) {
                  void useClusterStore.getState().createMemberProject(newName)
                  setNewName('')
                }
              }}
            />
            <button
              type="button"
              className="btn btn-sm"
              disabled={!newName.trim()}
              title="Create a real project file in the cluster folder and link it"
              onClick={() => {
                void useClusterStore.getState().createMemberProject(newName)
                setNewName('')
              }}
            >
              <PackagePlus size={14} /> Create Project
            </button>
          </div>
        </section>

        <section className="cluster-col">
          <h3>
            <Route size={15} /> Weighted-Average Lead (cluster-only)
          </h3>
          <p className="cluster-hint">
            A cluster cannot create normal Leads. One weighted-average Lead per
            material, from already-applied member Leads — applied to all DATA
            items for cluster-wise rates. Member rates never change.
          </p>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => useClusterStore.getState().createWeightedLeads()}
          >
            <Route size={14} /> Create Weighted-Average Lead
          </button>
          {leads.length === 0 && (
            <div className="recent-empty">No cluster Leads yet.</div>
          )}
          <div className="cluster-lead-list">
            {leads.map((lead) => (
              <div key={lead.id} className="cluster-lead">
                <label className="cluster-lead-check" title="Apply this lead to all DATA items (cluster-wise)">
                  <input
                    type="checkbox"
                    checked={appliedIds.has(lead.id)}
                    onChange={(e) => useClusterStore.getState().setLeadApplied(lead.id, e.target.checked)}
                  />
                  <span className="cluster-lead-name">{lead.materialName}</span>
                </label>
                <span className="cluster-lead-avg">{measure.format(lead.avgKm)} km avg</span>
                <span className="cluster-lead-detail">
                  {lead.entries.map((entry) => `${entry.memberName}: ${measure.format(entry.leadKm)} km`).join(' · ')}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="cluster-col">
          <h3>
            <Gem size={15} /> Seigniorage (all members, cluster-wise)
          </h3>
          <p className="cluster-hint">
            Each member's seigniorage is taken from its own synced statement and
            added together by mineral. Member files are unchanged.
          </p>
          {seigniorage.unsynced.length > 0 && (
            <p className="cluster-hint">
              Not counted — open and Sync seigniorage in: {seigniorage.unsynced.join(', ')}.
            </p>
          )}
          {seigniorage.groups.length === 0 && seigniorage.unsynced.length === 0 && (
            <div className="recent-empty">No seigniorage rows in any member.</div>
          )}
          <div className="cluster-lead-list">
            {seigniorage.groups.map((group) => (
              <div key={group.mineralKey} className="cluster-lead">
                <span className="cluster-lead-name">{group.mineralLabel}</span>
                <span className="cluster-lead-avg">₹{money2.format(group.totalSeigniorage)}</span>
                <span className="cluster-lead-detail">
                  {group.members
                    .map(
                      (line) =>
                        `${line.memberName}: ₹${money2.format(line.seigniorage ?? 0)}` +
                        (line.quantity != null ? ` (${measure.format(line.quantity)})` : '')
                    )
                    .join(' · ')}
                </span>
              </div>
            ))}
          </div>
          {seigniorage.groups.length > 0 && (
            <>
              <div className="cluster-total-row">
                <span>Seigniorage</span>
                <strong>₹{money2.format(seigniorage.totals.totalSeigniorage)}</strong>
              </div>
              <div className="cluster-total-row">
                <span>DMFT (30%) + SMFT (2%)</span>
                <strong>₹{money2.format(seigniorage.totals.totalDmft + seigniorage.totals.totalSmft)}</strong>
              </div>
              <div className="cluster-total-row">
                <span>Permit fee</span>
                <strong>₹{money2.format(seigniorage.totals.totalPermit)}</strong>
              </div>
              <div className="cluster-total-row">
                <span>Seigniorage grand total</span>
                <strong>₹{money2.format(seigniorage.totals.grandTotal)}</strong>
              </div>
            </>
          )}
        </section>

        <section className="cluster-col">
          <h3>Cluster totals</h3>
          <div className="cluster-total-row">
            <span>Members</span>
            <strong>{members.length}</strong>
          </div>
          <div className="cluster-total-row">
            <span>Sum of member estimates{hasEstimate ? '' : ' (no member synced yet)'}</span>
            <strong>₹{money.format(combinedEstimate)}</strong>
          </div>
          <div className="cluster-total-row">
            <span>Applied cluster Leads</span>
            <strong>{appliedIds.size}</strong>
          </div>
          <p className="cluster-hint">
            Detailed Abstract, BOQ and prints stay per-member today; this panel
            reports the combined position. Open a member to work its own tools.
          </p>
        </section>
      </div>
    </div>
  )
}
