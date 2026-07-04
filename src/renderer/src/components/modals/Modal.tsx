import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'

interface Props {
  title: string
  size?: 'sm' | 'lg'
  onClose: () => void
  footer?: ReactNode
  bodyFlush?: boolean
  children: ReactNode
}

export default function Modal({
  title,
  size = 'sm',
  onClose,
  footer,
  bodyFlush,
  children
}: Props): JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className={`modal ${size}`} role="dialog" aria-modal="true">
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button className="modal-close" onClick={onClose} title="Close">
            <X size={16} />
          </button>
        </div>
        <div className={`modal-body ${bodyFlush ? 'flush' : ''}`}>{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  )
}
