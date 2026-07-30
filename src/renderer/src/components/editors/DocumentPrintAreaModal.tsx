import { useMemo, useRef, useState } from 'react'
import { Crop } from 'lucide-react'
import Modal from '../modals/Modal'
import { documentParagraphs, resolvePrintArea } from '../../lib/documentFinal'
import type { DocumentPrintArea, ProjectNode } from '../../types/project'

/**
 * Y-only print area selector. The estimator drags a vertical band down the
 * document; the band snaps to whole paragraphs, and it is the paragraph span
 * that gets stored, so the area survives the document reflowing later.
 */
export default function DocumentPrintAreaModal({
  node,
  onApply,
  onClose
}: {
  node: ProjectNode
  onApply: (area: DocumentPrintArea | null) => void
  onClose: () => void
}): JSX.Element {
  const paragraphs = useMemo(() => documentParagraphs(node.documentData), [node.documentData])
  const stored = resolvePrintArea(node.documentData, node.documentPrintArea)

  const [start, setStart] = useState(stored?.startParagraph ?? 0)
  const [end, setEnd] = useState(stored?.endParagraph ?? Math.max(0, paragraphs.length - 1))
  const dragging = useRef(false)

  const low = Math.min(start, end)
  const high = Math.max(start, end)

  const beginDrag = (index: number): void => {
    dragging.current = true
    setStart(index)
    setEnd(index)
  }
  const extendDrag = (index: number): void => {
    if (dragging.current) setEnd(index)
  }

  return (
    <Modal
      title="Set Print Area"
      size="lg"
      onClose={onClose}
      footer={
        <>
          <button
            className="btn ghost"
            onClick={() => {
              onApply(null)
              onClose()
            }}
          >
            Print whole document
          </button>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn"
            onClick={() => {
              onApply({ startParagraph: low, endParagraph: high })
              onClose()
            }}
          >
            <Crop size={14} /> Set Print Area
          </button>
        </>
      }
    >
      <p className="doc-area-hint">
        Drag down the document to select the vertical range to print. Only the Y axis is
        selectable — every line inside the band prints in full.
      </p>

      {paragraphs.length === 0 ? (
        <div className="empty-project-card">This document has no content yet.</div>
      ) : (
        <div
          className="doc-area-list"
          onMouseUp={() => {
            dragging.current = false
          }}
          onMouseLeave={() => {
            dragging.current = false
          }}
        >
          {paragraphs.map((paragraph) => {
            const inside = paragraph.index >= low && paragraph.index <= high
            return (
              <div
                key={paragraph.index}
                className={`doc-area-row ${inside ? 'inside' : ''}`}
                onMouseDown={() => beginDrag(paragraph.index)}
                onMouseEnter={() => extendDrag(paragraph.index)}
              >
                <span className="doc-area-marker" />
                <span className="doc-area-text">
                  {paragraph.text.trim() || <em>(blank line)</em>}
                </span>
              </div>
            )
          })}
        </div>
      )}

      <div className="doc-area-summary">
        Printing lines <strong>{low + 1}</strong> to <strong>{high + 1}</strong> of{' '}
        {paragraphs.length}
      </div>
    </Modal>
  )
}
