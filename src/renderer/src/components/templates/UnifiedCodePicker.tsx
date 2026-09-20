import { X } from 'lucide-react'
import type { MasterItem } from '../../lib/masterData'
import { useStore } from '../../store/useStore'
import { BackendDataSelectionColumns } from '../modals/AddItemModal'

export default function UnifiedCodePicker({
  title = 'Change code',
  hint,
  onPick,
  onClose
}: {
  title?: string
  hint?: string
  onPick: (item: MasterItem) => void
  onClose: () => void
}): JSX.Element {
  const sorYear = useStore((state) => state.project?.meta.sorYear ?? '2026-27')

  return (
    <div className="gw-picker canal-unified-code-picker">
      <div className="gw-picker-head">
        <div>
          <strong>{title}</strong>
          {hint && <small>{hint}</small>}
        </div>
        <button type="button" className="icon-btn" aria-label="Close code selector" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <BackendDataSelectionColumns
        sorYear={sorYear}
        onPick={(item) => {
          onPick(item)
          onClose()
        }}
      />
    </div>
  )
}
