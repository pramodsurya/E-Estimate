import { useMemo, useRef, useState } from 'react'
import { AlertTriangle, Crop } from 'lucide-react'
import Modal from '../modals/Modal'
import {
  documentParagraphs,
  finalNumberParagraphIndex,
  resolvePrintArea
} from '../../lib/documentFinal'
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

  const finalPIndex = useMemo(
    () => finalNumberParagraphIndex(node.documentData, node.documentFinal),
    [node.documentData, node.documentFinal]
  )
  const finalExcluded = finalPIndex !== null && (finalPIndex < low || finalPIndex > high)

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
            disabled={finalExcluded}
            title={
              finalExcluded
                ? `Selected range must include the fixed final number on line ${finalPIndex + 1}`
                : undefined
            }
            onClick={() => {
              if (finalExcluded) return
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

      {finalExcluded && finalPIndex !== null && (
        <div
          style={{
            color: 'var(--danger, #e53e3e)',
            fontWeight: 600,
            fontSize: '13px',
            marginBottom: '10px',
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}
        >
          <AlertTriangle size={15} />
          The print area must include the fixed final number on line {finalPIndex + 1}.
        </div>
      )}

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
            const isFinal = paragraph.index === finalPIndex
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
                {isFinal && (
                  <span
                    style={{
                      marginLeft: 'auto',
                      fontSize: '11px',
                      background: 'var(--accent, #3182ce)',
                      color: '#fff',
                      borderRadius: '4px',
                      padding: '1px 6px',
                      flexShrink: 0
                    }}
                  >
                    Fixed Final № ({node.documentFinal?.capturedValue})
                  </span>
                )}
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

