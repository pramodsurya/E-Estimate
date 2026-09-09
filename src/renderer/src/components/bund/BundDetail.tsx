import { useMemo, useState } from 'react'
import { useStore } from '../../store/useStore'
import type { ProjectNode } from '../../types/project'
import { migrateBundData } from '../../lib/bund'
import BundSetup from './BundSetup'
import BundSimulationTab from './BundSimulationTab'
import BundDashboardV2 from './v2/BundDashboardV2'

/**
 * The "Detailed" view for a Bund component (opened from its tree row): the
 * setup wizard until configured, then the design dashboard or the stability
 * simulation tab. The component's own node shows the normal Overview & print
 * (ComponentDashboard) instead.
 */
export default function BundDetail({ node }: { node: ProjectNode }): JSX.Element | null {
  const setBund = useStore((s) => s.setBund)
  const raw = node.bund
  const data = useMemo(() => (raw ? migrateBundData(raw) : null), [raw])
  const [editingSetup, setEditingSetup] = useState<{ open: boolean; step: 1 | 2 }>({
    open: false,
    step: 1
  })
  const [tab, setTab] = useState<'design' | 'simulation'>('design')

  if (!data) return null

  const showSetup = !data.configured || editingSetup.open

  return (
    <div className="gw-workspace">
      {showSetup ? (
        <BundSetup
          node={node}
          data={data}
          initialStep={editingSetup.open ? editingSetup.step : 1}
          onCancel={data.configured ? () => setEditingSetup({ open: false, step: 1 }) : undefined}
          onDone={(next) => {
            setBund(node.id, next)
            setEditingSetup({ open: false, step: 1 })
            setTab('design')
          }}
        />
      ) : (
        <>
          <div className="bund-detail-tabs">
            <button
              className={`btn ghost${tab === 'design' ? ' active' : ''}`}
              onClick={() => setTab('design')}
            >
              Design & estimate
            </button>
            <button
              className={`btn ghost${tab === 'simulation' ? ' active' : ''}`}
              onClick={() => setTab('simulation')}
            >
              Simulation
            </button>
          </div>
          {tab === 'simulation' ? (
            <BundSimulationTab node={node} data={data} />
          ) : (
            <BundDashboardV2
              node={node}
              data={data}
              onEditSetup={(step) => setEditingSetup({ open: true, step })}
            />
          )}
        </>
      )}
    </div>
  )
}
