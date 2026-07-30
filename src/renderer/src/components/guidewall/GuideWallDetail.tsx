import { useMemo, useState } from 'react'
import { useStore } from '../../store/useStore'
import type { ProjectNode } from '../../types/project'
import { migrateGuideWallData } from '../../lib/guideWall'
import GuideWallSetup from './GuideWallSetup'
import GuideWallDashboard from './GuideWallDashboard'

/**
 * The "Detailed" view for a Guide Wall component (opened from its tree row):
 * the setup wizard until configured, then the design dashboard. The component's
 * own node shows the normal Overview & print (ComponentDashboard) instead.
 */
export default function GuideWallDetail({ node }: { node: ProjectNode }): JSX.Element | null {
  const setGuideWall = useStore((s) => s.setGuideWall)
  const raw = node.guideWall
  const data = useMemo(() => (raw ? migrateGuideWallData(raw) : null), [raw])
  const [editingSetup, setEditingSetup] = useState<{ open: boolean; step: 1 | 2 }>({
    open: false,
    step: 1
  })

  if (!data) return null

  const showSetup = !data.configured || editingSetup.open

  return (
    <div className="gw-workspace">
      {showSetup ? (
        <GuideWallSetup
          node={node}
          data={data}
          initialStep={editingSetup.open ? editingSetup.step : 1}
          onCancel={data.configured ? () => setEditingSetup({ open: false, step: 1 }) : undefined}
          onDone={(next) => {
            setGuideWall(node.id, next)
            setEditingSetup({ open: false, step: 1 })
          }}
        />
      ) : (
        <GuideWallDashboard
          node={node}
          data={data}
          onEditSetup={(step) => setEditingSetup({ open: true, step })}
        />
      )}
    </div>
  )
}
