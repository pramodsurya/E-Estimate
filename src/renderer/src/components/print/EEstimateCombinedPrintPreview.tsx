import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check, Download, LoaderCircle, Printer, X } from 'lucide-react'
import { PDFDocument } from 'pdf-lib'
import PdfPageStack from './PdfPageStack'

export interface CombinedPdfPart {
  id: string
  label: string
  build: () => Promise<Uint8Array>
}

interface Props {
  title: string
  description?: string
  fileName: string
  parts: CombinedPdfPart[]
  captureContent?: ReactNode
  onClose: () => void
}

export default function EEstimateCombinedPrintPreview({
  title,
  description,
  fileName,
  parts,
  captureContent,
  onClose
}: Props): JSX.Element {
  const initialParts = useRef(parts)
  const printFrameRef = useRef<HTMLIFrameElement>(null)
  const [activePart, setActivePart] = useState('Preparing PDF parts…')
  const [completedParts, setCompletedParts] = useState<string[]>([])
  const [error, setError] = useState('')
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [pdfBase64, setPdfBase64] = useState('')
  const [pageCount, setPageCount] = useState(0)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    let createdUrl: string | null = null
    const assemble = async (): Promise<void> => {
      try {
        const completed: string[] = []
        const outputs: Uint8Array[] = []
        for (const part of initialParts.current) {
          if (!active) return
          setActivePart(part.label)
          outputs.push(await part.build())
          completed.push(part.id)
          setCompletedParts([...completed])
        }
        if (!active) return
        setActivePart('Combining PDF pages…')
        const merged = await PDFDocument.create()
        for (const bytes of outputs) {
          const source = await PDFDocument.load(bytes)
          const pages = await merged.copyPages(source, source.getPageIndices())
          pages.forEach((page) => merged.addPage(page))
        }
        if (merged.getPageCount() === 0) throw new Error('No PDF pages were produced.')
        const bytes = await merged.save()
        if (!active) return
        const buffer = Uint8Array.from(bytes).buffer
        createdUrl = URL.createObjectURL(new Blob([buffer], { type: 'application/pdf' }))
        setPdfUrl(createdUrl)
        setPdfBase64(encodeBase64(bytes))
        setPageCount(merged.getPageCount())
        setActivePart('')
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : String(reason))
      }
    }
    void assemble()
    return () => {
      active = false
      if (createdUrl) URL.revokeObjectURL(createdUrl)
    }
  }, [])

  const download = async (): Promise<void> => {
    if (!pdfBase64 || saving) return
    setSaving(true)
    try {
      await window.api.export.pdf(pdfBase64, fileName)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="aggregate-print-overlay eestimate-combined-preview" role="dialog" aria-modal="true">
      <div className="aggregate-print-shell">
        <div className="aggregate-print-toolbar">
          <div>
            <strong>{title}</strong>
            <span>{pdfUrl ? `${pageCount} combined PDF page(s)` : description}</span>
          </div>
          <div>
            {pdfUrl && <>
              <button className="btn primary" type="button" disabled={saving} onClick={() => void download()}>
                {saving ? <LoaderCircle className="spin" size={14} /> : <Download size={14} />}
                Download PDF
              </button>
              <button className="btn ghost" type="button" onClick={() => printFrameRef.current?.contentWindow?.print()}>
                <Printer size={14} /> Print
              </button>
            </>}
            <button className="btn ghost" type="button" onClick={onClose}>
              <X size={14} /> Close
            </button>
          </div>
        </div>
        {!pdfUrl && (
          <div className="eestimate-combined-progress">
            <div className={`lead-map-pdf-status${error ? ' error' : ''}`} role="status">
              {error || <><LoaderCircle className="spin" size={14} /> {activePart}</>}
            </div>
            <div className="eestimate-combined-part-list">
              {initialParts.current.map((part, index) => {
                const done = completedParts.includes(part.id)
                const currentIndex = initialParts.current.findIndex((item) => !completedParts.includes(item.id))
                const current = !done && currentIndex === index
                return (
                  <span key={part.id} className={done ? 'done' : current ? 'active' : ''}>
                    {done ? <Check size={14} /> : current ? <LoaderCircle className="spin" size={14} /> : <i />}
                    {part.label}
                  </span>
                )
              })}
            </div>
          </div>
        )}
        {pdfUrl && (
          <div className="aggregate-print-view">
            <PdfPageStack src={pdfUrl} zoom={100} />
            <iframe ref={printFrameRef} className="data-dashboard-print-source" title={`${title} PDF`} src={pdfUrl} />
          </div>
        )}
      </div>
      {!pdfUrl && !error && captureContent && createPortal(
        <div className="eestimate-print-capture-host" aria-hidden="true">{captureContent}</div>,
        document.body
      )}
    </div>
  )
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return btoa(binary)
}
