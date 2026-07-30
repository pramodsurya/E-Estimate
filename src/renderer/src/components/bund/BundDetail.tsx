import { useMemo, useState } from 'react'
import { useStore } from '../../store/useStore'
import type { ProjectNode } from '../../types/project'
import { migrateBundData } from '../../lib/bund'
import BundSetup from './BundSetup'
import BundDashboard from './BundDashboard'
import ZonedBundRepairDashboard from './ZonedBundRepairDashboard'

/**
 * The "Detailed" view for a Bund component (opened from its tree row): the
 * setup wizard until configured, then the design dashboard. The component's own
 * node shows the normal Overview & print (ComponentDashboard) instead.
 */
export default function BundDetail({ node }: { node: ProjectNode }): JSX.Element | null {
  const setBund = useStore((s) => s.setBund)
  const raw = node.bund
  const data = useMemo(() => (raw ? migrateBundData(raw) : null), [raw])
  const [editingSetup, setEditingSetup] = useState<{ open: boolean; step: 1 | 2 }>({
    open: false,
    step: 1
  })

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
          }}
        />
      ) : data.embankmentType === 'zoned' ? (
        <ZonedBundRepairDashboard
          node={node}
          data={data}
          onEditSetup={(step) => setEditingSetup({ open: true, step })}
        />
      ) : (
        <BundDashboard
          node={node}
          data={data}
          onEditSetup={(step) => setEditingSetup({ open: true, step })}
        />
      )}
    </div>
  )
}
