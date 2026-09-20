import { useMemo, useState } from 'react'
import { useStore } from '../../store/useStore'
import type { ProjectNode } from '../../types/project'
import { migrateCanalData } from '../../lib/canal'
import CanalSetup from './CanalSetup'
import CanalDashboardV2 from './v2/CanalDashboardV2'

/**
 * The "Detailed" view for a Canal component (opened from its tree row): the
 * setup wizard until configured, then the chapter dashboard. The component's
 * own node shows the normal Overview & print (ComponentDashboard) instead.
 */
export default function CanalDetail({ node }: { node: ProjectNode }): JSX.Element | null {
  const setCanal = useStore((s) => s.setCanal)
  const raw = node.canal
  const data = useMemo(() => (raw ? migrateCanalData(raw) : null), [raw])
  const [editingSetup, setEditingSetup] = useState<{ open: boolean; step: 1 | 2 }>({
    open: false,
    step: 1
  })

  if (!data) return null

  const showSetup = !data.configured || editingSetup.open

  return (
    <div className="gw-workspace">
      {showSetup ? (
        <CanalSetup
          node={node}
          data={data}
          initialStep={editingSetup.open ? editingSetup.step : 1}
          onCancel={data.configured ? () => setEditingSetup({ open: false, step: 1 }) : undefined}
          onDone={(next) => {
            setCanal(node.id, next)
            setEditingSetup({ open: false, step: 1 })
          }}
        />
      ) : (
        <CanalDashboardV2
          node={node}
          data={data}
          onEditSetup={(step) => setEditingSetup({ open: true, step })}
        />
      )}
    </div>
  )
}
