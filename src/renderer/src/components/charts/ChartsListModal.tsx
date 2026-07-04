import { BarChart3, Pencil, Trash2, X } from 'lucide-react'
import type { CellRange, ChartDef } from '../../types/project'

interface Props {
  charts: ChartDef[]
  onEdit: (chartId: string) => void
  onDelete: (chartId: string) => void
  onClose: () => void
}

function colLabel(index: number): string {
  let n = index
  let s = ''
  do {
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return s
}
function rangeToA1(r: CellRange): string {
  return `${colLabel(r.startColumn)}${r.startRow + 1}:${colLabel(r.endColumn)}${r.endRow + 1}`
}

export default function ChartsListModal({ charts, onEdit, onDelete, onClose }: Props): JSX.Element {
  return (
    <div className="pl-overlay" onMouseDown={onClose}>
      <div className="ic-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="pl-head">
          <BarChart3 size={16} />
          <span className="pl-title">Charts on this sheet</span>
          <button className="pl-close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="ic-body">
          {charts.length === 0 ? (
            <div className="ic-hint">No charts yet. Use Insert → Chart to add one.</div>
          ) : (
            <div className="cl-list">
              {charts.map((c, i) => (
                <div key={c.id} className="cl-item">
                  <div className="cl-info">
                    <span className="cl-title">{c.title || `Chart ${i + 1}`}</span>
                    <span className="cl-meta">
                      {c.type} · {rangeToA1(c.range)}
                    </span>
                  </div>
                  <button className="btn-mini" title="Edit" onClick={() => onEdit(c.id)}>
                    <Pencil size={13} />
                  </button>
                  <button
                    className="btn-mini ghost"
                    title="Delete"
                    onClick={() => onDelete(c.id)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="pl-foot">
          <span className="pl-foot-note">
            {charts.length} chart{charts.length === 1 ? '' : 's'} — overlapping ones are listed here
            too.
          </span>
          <button className="btn" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
