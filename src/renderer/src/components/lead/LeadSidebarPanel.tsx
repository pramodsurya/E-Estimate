import { useEffect, useState } from 'react'
import { TableProperties } from 'lucide-react'
import { fetchLeadDetailReconstructions } from '../../lib/leadDetail'
import { useStore } from '../../store/useStore'
import type { LeadDetailReconstruction } from '../../types/project'

export default function LeadSidebarPanel(): JSX.Element {
  const project = useStore((state) => state.project)
  const [details, setDetails] = useState<LeadDetailReconstruction[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (!project?.meta.sorYear) return
    let cancelled = false
    void fetchLeadDetailReconstructions(project.meta.sorYear)
      .then((rows) => {
        if (!cancelled) setDetails(rows)
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'DTL unavailable')
      })
    return () => {
      cancelled = true
    }
  }, [project?.meta.sorYear])

  return (
    <div className="lead-sidebar-panel">
      <div className="panel-title">DTL Lead</div>
      <div className="lead-sidebar-stat">
        <TableProperties size={14} />
        <span>{details.length} reconstruction item(s)</span>
      </div>
      <div className="lead-sidebar-list">
        {error ? (
          <div className="list-empty">{error}</div>
        ) : details.length === 0 ? (
          <div className="list-empty">Open DTL Lead to load Supabase reconstruction.</div>
        ) : (
          details.slice(0, 12).map((detail) => (
            <div className="lead-sidebar-row" key={detail.detailCode}>
              <strong>{detail.detailCode.replace('COM-DTL-', '')}</strong>
              <span>{detail.chargeCode}</span>
              <small>{detail.derivations.length} blocks</small>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
