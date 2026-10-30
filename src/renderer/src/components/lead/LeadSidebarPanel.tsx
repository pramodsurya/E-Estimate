import { useState } from 'react'
import { ChevronRight, Layers3, Link2, RefreshCw, Route } from 'lucide-react'
import { dashboardContextMatches, syncLeadDashboardSnapshot } from '../../lib/dashboardSync'
import { conveyanceClassLabel } from '../../lib/lead'
import { projectLeadMaterials } from '../../lib/leadMaterialSummary'
import { useStore } from '../../store/useStore'

export default function LeadSidebarPanel(): JSX.Element {
  const project = useStore((state) => state.project)
  const setActivity = useStore((state) => state.setActivity)
  const openLeadMaterial = useStore((state) => state.openLeadMaterial)
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState('')
  const materials = project ? projectLeadMaterials(project) : []
  const variantCount = materials.reduce((total, item) => total + item.variantCount, 0)
  const applicationCount = materials.reduce((total, item) => total + item.linkedCount, 0)
  const syncMaterials = async (): Promise<void> => {
    if (!project || syncing) return
    setSyncing(true)
    setSyncError('')
    try {
      const next = await syncLeadDashboardSnapshot(project)
      const current = useStore.getState().project
      if (current?.id === project.id && dashboardContextMatches(next, current)) {
        useStore.getState().setDashboardSnapshot(next)
      }
    } catch (reason) {
      setSyncError(reason instanceof Error ? reason.message : 'Unable to sync Lead materials.')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="lead-sidebar-panel">
      <div className="lead-sidebar-hero">
        <div className="lead-sidebar-hero-icon">
          <Route size={18} />
        </div>
        <div>
          <span>Lead workspace</span>
          <strong>Materials & routes</strong>
        </div>
        <button type="button" onClick={() => setActivity('lead')}>
          Dashboard
        </button>
      </div>

      <div className="lead-sidebar-summary" aria-label="Lead summary">
        <div>
          <Layers3 size={13} />
          <strong>{materials.length}</strong>
          <span>Materials</span>
        </div>
        <div>
          <Route size={13} />
          <strong>{variantCount}</strong>
          <span>Routes</span>
        </div>
        <div>
          <Link2 size={13} />
          <strong>{applicationCount}</strong>
          <span>Linked</span>
        </div>
      </div>

      <div className="lead-sidebar-section-title">
        <span>Project materials</span>
        <small>{materials.length}</small>
        <button type="button" className="panel-iconbtn panel-sync-btn" aria-label="Sync Lead materials"
          title="Sync Lead materials" disabled={!project || syncing} aria-busy={syncing}
          onClick={() => void syncMaterials()}>
          <RefreshCw size={14} className={syncing ? 'spin' : undefined} />
        </button>
      </div>

      {syncError && <div className="rate-warning">{syncError}</div>}
      <div className="lead-sidebar-list">
        {materials.length === 0 ? (
          <div className="lead-sidebar-empty">
            <Route size={20} />
            <strong>No Lead materials</strong>
            <span>Add DATA items or sync Lead to build this list.</span>
          </div>
        ) : (
          materials.map((material) => (
            <button
              type="button"
              className="lead-sidebar-row"
              data-tour-material={material.name.trim().toLowerCase()}
              key={material.key}
              onClick={() =>
                openLeadMaterial({
                    materialName: material.name,
                    conveyanceClass: material.conveyanceClass,
                    pipeLead: material.pipeLead
                })
              }
            >
              <span className="lead-sidebar-material-mark">
                {material.name.slice(0, 2).toUpperCase()}
              </span>
              <span className="lead-sidebar-material-copy">
                <strong>{material.name}</strong>
                <small>{material.name === 'Concrete delivery' ? 'MoRTH transport · distance in km' : conveyanceClassLabel(material.conveyanceClass)}</small>
                <small>
                  {material.variantCount} variant{material.variantCount === 1 ? '' : 's'} ·{' '}
                  {material.linkedCount} linked
                </small>
              </span>
              <ChevronRight size={15} />
            </button>
          ))
        )}
      </div>
    </div>
  )
}
