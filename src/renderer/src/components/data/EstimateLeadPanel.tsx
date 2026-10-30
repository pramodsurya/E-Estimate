import { useState } from 'react'
import { CircleDot, RefreshCw, Route } from 'lucide-react'
import { conveyanceClassLabel } from '../../lib/lead'
import { dashboardContextMatches, syncLeadDashboardSnapshot } from '../../lib/dashboardSync'
import { projectLeadMaterials } from '../../lib/leadMaterialSummary'
import { useStore } from '../../store/useStore'
import type { ConveyanceClass } from '../../types/project'

const money = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

export default function EstimateLeadPanel(): JSX.Element {
  const project = useStore((state) => state.project)
  const openLeadMaterial = useStore((state) => state.openLeadMaterial)
  const setDashboardSnapshot = useStore((state) => state.setDashboardSnapshot)
  const selection = useStore((state) => state.leadSelection)
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState('')

  const snapshotValid = project
    ? dashboardContextMatches(project.dashboardSnapshot, project)
    : false
  const items = project ? projectLeadMaterials(project) : []

  if (!project) return <div className="panel-reserved">Open a project before creating Lead.</div>

  const syncDashboard = async (): Promise<void> => {
    if (syncing) return
    setSyncing(true)
    setSyncError('')
    try {
      const next = await syncLeadDashboardSnapshot(project)
      const current = useStore.getState().project
      if (current?.id === project.id && dashboardContextMatches(next, current)) setDashboardSnapshot(next)
    } catch (reason: unknown) {
      setSyncError(reason instanceof Error ? reason.message : 'Unable to sync Lead materials.')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="lead-abstract-panel">
      <div className="lead-abstract-title">
        <strong>Materials</strong>
        <div className="lead-abstract-title-actions">
          <span>{items.length}</span>
          <button
            type="button"
            className="panel-iconbtn panel-sync-btn"
            disabled={syncing}
            onClick={() => void syncDashboard()}
            title={syncError || 'Sync Lead materials'}
            aria-label="Sync Lead materials"
            aria-busy={syncing}
          >
            <RefreshCw className={syncing ? 'spin' : undefined} size={14} />
          </button>
        </div>
      </div>
      {syncError && <div className="rate-warning panel-sync-warning">{syncError}</div>}
      {!snapshotValid && !syncError && (
        <div className="rate-notice panel-sync-notice">
          <span>Lead data is not synced for this project.</span>
          <button
            type="button"
            className="btn-mini secondary"
            disabled={syncing}
            onClick={() => void syncDashboard()}
          >
            {syncing ? 'Syncing…' : 'Sync'}
          </button>
        </div>
      )}
      {items.length === 0 ? (
        <div className="lead-panel-empty">
          Add DATA items with lead-applicable materials to show Cement, Steel, Earth, and other Lead groups.
        </div>
      ) : (
        <div className="lead-abstract-list">
          {items.map((item) => {
            const selected =
              item.pipeLead
                ? selection?.pipeLead?.pipeLeadItemCode === item.pipeLead.pipeLeadItemCode
                : selection?.materialName === item.name &&
                  selection.conveyanceClass === item.conveyanceClass
            return (
              <button
                className={`lead-abstract-row ${selected ? 'selected' : ''}`}
                // Lower-cased so a tutorial can ask for "sand" without knowing
                // how the compiled list happened to capitalise it.
                data-tour-material={item.name.trim().toLowerCase()}
                key={item.key}
                onClick={() =>
                  openLeadMaterial({
                    materialName: item.name,
                    conveyanceClass: item.conveyanceClass,
                    pipeLead: item.pipeLead
                  })
                }
                title={`${item.dataCount} DATA item(s), ${item.variantCount} Material${item.variantCount === 1 ? '' : 's'}`}
              >
                <CircleDot size={12} />
                <span>
                  <strong>{item.name}</strong>
                  <small>{leadAbstractClassLabel(item.name, item.conveyanceClass)}</small>
                  <small>
                    {item.variantCount} variant{item.variantCount === 1 ? '' : 's'} |{' '}
                    {item.linkedCount} linked component usage{item.linkedCount === 1 ? '' : 's'}
                  </small>
                </span>
                <b>{item.name === 'Concrete delivery' ? 'In DATA' : `Rs. ${money.format(item.amount)}`}</b>
              </button>
            )
          })}
        </div>
      )}
      <div className="lead-abstract-foot">
        <Route size={12} />
          <span>Select a material to edit locations, Materials, and DATA links on the right.</span>
      </div>
    </div>
  )
}

function leadAbstractClassLabel(name: string, conveyanceClass: ConveyanceClass): string {
  if (name === 'Concrete delivery') return 'MoRTH transport · distance in km'
  if (['Concrete delivery', 'Hot mix delivery', 'Precast delivery', 'Disposal material', 'Material delivery'].includes(name))
    return 'Material conveyance · per tonne'
  if (conveyanceClass === 'RCC_PIPE') {
    return 'Public Health RCC pipe conveyance · loading, unloading & stacking included'
  }
  const material = name.trim().toLowerCase()
  if (material === 'sand') return 'Sand / fine aggregate'
  if (material === 'stone') return 'Stone / coarse aggregate'
  return conveyanceClassLabel(conveyanceClass)
}
