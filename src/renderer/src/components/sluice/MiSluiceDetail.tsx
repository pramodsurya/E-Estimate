import { useMemo, useState } from 'react'
import { useStore } from '../../store/useStore'
import type { ProjectNode } from '../../types/project'
import { migrateMiSluiceNewData } from '../../lib/miSluiceNew'
import MiSluiceSetup from './MiSluiceSetup'
import MiSluiceDashboard from './MiSluiceDashboard'

/**
 * The "Detailed" view for a new MI tank sluice (opened from its tree row): the
 * setup wizard until configured, then the design dashboard. The component's own
 * node keeps showing the normal Overview & print (ComponentDashboard).
 */
export default function MiSluiceDetail({ node }: { node: ProjectNode }): JSX.Element | null {
  const setMiSluiceNew = useStore((s) => s.setMiSluiceNew)
  const raw = node.miSluiceNew
  const data = useMemo(() => (raw ? migrateMiSluiceNewData(raw) : null), [raw])
  const [editingSetup, setEditingSetup] = useState<{ open: boolean; step: 1 | 2 }>({
    open: false,
    step: 1
  })

  if (!data) return null

  const showSetup = !data.configured || editingSetup.open

  return (
    <div className="gw-workspace">
      {showSetup ? (
        <MiSluiceSetup
          node={node}
          data={data}
          initialStep={editingSetup.open ? editingSetup.step : 1}
          onCancel={data.configured ? () => setEditingSetup({ open: false, step: 1 }) : undefined}
          onDone={(next) => {
            setMiSluiceNew(node.id, next)
            setEditingSetup({ open: false, step: 1 })
          }}
        />
      ) : (
        <MiSluiceDashboard
          node={node}
          data={data}
          onEditSetup={(step) => setEditingSetup({ open: true, step })}
        />
      )}
    </div>
  )
}
