import { useEffect, useRef, useState } from 'react'
import { Check, CheckCircle2, FileDown, FolderOpen, Loader2, Minus, TriangleAlert, X } from 'lucide-react'
import { useStore } from '../../store/useStore'
import {
  buildProjectExportPdf,
  encodeBase64,
  ExportCanceled,
  type ExportSection
} from '../../lib/projectExport'

function seconds(ms?: number): string {
  return ms && ms >= 1000 ? `${(ms / 1000).toFixed(ms >= 10000 ? 0 : 1)}s` : ''
}

type Phase = 'rendering' | 'merging' | 'saving' | 'done' | 'canceled' | 'error'

/**
 * The Export PDF progress screen. Sections render several at a time and report
 * independently, so the list shows the whole plan at once with each section's
 * own state. Nothing is written until every one of them has finished.
 */
export default function ExportPdfModal(): JSX.Element | null {
  const closeExportPdf = useStore((state) => state.closeExportPdf)
  // Taken once, when the dialog opens. Subscribing to the store instead would
  // hand this effect a new project object every time anything saves or the
  // dashboard writes back a total — which would tear the export down midway.
  // A single snapshot also means the whole PDF describes one state of the work.
  const [project] = useState(() => useStore.getState().project)
  const [phase, setPhase] = useState<Phase>('rendering')
  const [sections, setSections] = useState<ExportSection[]>([])
  const [activity, setActivity] = useState<string | null>(null)
  const [savedPath, setSavedPath] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** Something worth saying that is not a failure. */
  const [notice, setNotice] = useState<string | null>(null)
  /** False when the file went through the browser download, which has no path. */
  const [revealable, setRevealable] = useState(true)
  const abort = useRef<AbortController | null>(null)
  // The rendered document is kept once it exists: a failed save must never cost
  // the user the whole render.
  const rendered = useRef<Uint8Array | null>(null)
  const [hasRendered, setHasRendered] = useState(false)

  const fileName = project
    ? `${(project.meta.name || project.root.name || 'Estimate').replace(/[\\/:*?"<>|]+/g, '_')}`
    : 'Estimate'

  /** Save through Chromium's own download, for when the dialog is unavailable. */
  const downloadRendered = (): void => {
    const bytes = rendered.current
    if (!bytes) return
    const copy = new ArrayBuffer(bytes.byteLength)
    new Uint8Array(copy).set(bytes)
    const url = URL.createObjectURL(new Blob([copy], { type: 'application/pdf' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${fileName}.pdf`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 20000)
    setSavedPath(`${fileName}.pdf`)
    setRevealable(false)
    setPhase('done')
  }

  const saveRendered = async (): Promise<void> => {
    const bytes = rendered.current
    if (!bytes) return
    setError(null)
    setNotice(null)
    setPhase('saving')
    try {
      if (!window.api?.export?.pdf) throw new Error('No handler registered for export:pdf')
      const saved = await window.api.export.pdf(encodeBase64(bytes), fileName)
      if (saved.canceled || !saved.path) {
        setPhase('canceled')
        return
      }
      setSavedPath(saved.path)
      setPhase('done')
    } catch (reason: unknown) {
      const message = reason instanceof Error ? reason.message : String(reason)
      // The window and its preload reload on every change, but the background
      // process only updates when the app itself is relaunched — so a session
      // older than this feature answers that it has never heard of it. The
      // document is already rendered; put it somewhere useful and say why.
      if (/No handler registered/i.test(message)) {
        downloadRendered()
        setNotice(
          'Saved to your downloads folder. Choosing where to save needs a restart of ' +
            'E-Estimate first — this copy is still running a background process from ' +
            'before Export existed.'
        )
        return
      }
      setError(message)
      setPhase('error')
    }
  }

  useEffect(() => {
    if (!project) return
    const controller = new AbortController()
    abort.current = controller
    let unmounted = false
    const stopped = (): boolean => unmounted || controller.signal.aborted

    const run = async (): Promise<void> => {
      try {
        const result = await buildProjectExportPdf(
          project,
          (next) => {
            if (!unmounted) setSections(next)
          },
          controller.signal,
          (text) => {
            if (unmounted) return
            setActivity(text)
            setPhase((current) => (current === 'rendering' ? 'merging' : current))
          }
        )
        if (stopped()) return
        rendered.current = result.bytes
        setHasRendered(true)
        setActivity(null)
        await saveRendered()
      } catch (reason: unknown) {
        if (unmounted) return
        if (reason instanceof ExportCanceled || controller.signal.aborted) {
          setPhase('canceled')
          return
        }
        setError(reason instanceof Error ? reason.message : String(reason))
        setPhase('error')
      }
    }

    void run()
    return () => {
      unmounted = true
      controller.abort()
    }
  }, [project])

  const cancel = (): void => {
    abort.current?.abort()
    setPhase('canceled')
  }

  if (!project) return null

  const settled = sections.filter(
    (section) => section.state === 'done' || section.state === 'skipped'
  ).length
  const active = sections.filter((section) => section.state === 'rendering')
  const percent = sections.length ? Math.round((settled / sections.length) * 100) : 0
  const busy = phase === 'rendering' || phase === 'merging' || phase === 'saving'

  const status = (): string => {
    if (phase === 'saving') return 'All sections rendered. Choose where to save…'
    if (sections.length === 0) return 'Preparing the print view…'
    if (active.length === 0) return activity ? `${activity}…` : 'Collating pages…'
    if (active.length === 1) {
      const only = active[0]
      return only.detail
        ? `${only.label} — ${only.detail}…`
        : `Rendering ${only.label}…`
    }
    return `Rendering ${active.length} sections at once…`
  }

  return (
    <div className="export-overlay" role="dialog" aria-modal="true" aria-label="Export PDF">
      <div className="export-shell">
        <header className="export-head">
          <span className="export-icon">
            {phase === 'error' ? (
              <TriangleAlert size={18} />
            ) : phase === 'done' ? (
              <CheckCircle2 size={18} />
            ) : (
              <FileDown size={18} />
            )}
          </span>
          <div>
            <strong>Export PDF</strong>
            <small>{project.meta.name || project.root.name}</small>
          </div>
          {!busy && (
            <button className="btn ghost" onClick={closeExportPdf} aria-label="Close">
              <X size={14} />
            </button>
          )}
        </header>

        {busy && (
          <>
            <div className="export-status">
              <Loader2 size={15} className="export-spin" />
              <span>{status()}</span>
              {sections.length > 0 && phase !== 'saving' && (
                <b>
                  {settled} / {sections.length}
                </b>
              )}
            </div>
            <div className="export-bar">
              <span style={{ width: `${phase === 'saving' ? 100 : percent}%` }} />
            </div>
            <p className="export-note">
              Sections render in parallel, and all of them finish before the file is written — so
              the PDF matches the Project Print View page for page. The Lead route map waits for
              its tiles, so it usually finishes last.
            </p>
            <div className="export-cancel">
              <button className="btn ghost" onClick={cancel}>
                Cancel export
              </button>
            </div>
          </>
        )}

        {sections.length > 0 && (
          <ul className="export-steps">
            {sections.map((section, index) => (
              <li
                key={`${index}:${section.label}`}
                className={`export-step-${section.state}`}
              >
                <span className="export-step-mark">
                  {section.state === 'rendering' ? (
                    <Loader2 size={12} className="export-spin" />
                  ) : section.state === 'done' ? (
                    <Check size={12} />
                  ) : section.state === 'skipped' ? (
                    <Minus size={12} />
                  ) : section.state === 'failed' ? (
                    <TriangleAlert size={12} />
                  ) : null}
                </span>
                <span className="export-step-label">{section.label}</span>
                {section.detail && <small className="export-step-detail">{section.detail}</small>}
                {section.state === 'skipped' && <small>nothing to print</small>}
                {section.state === 'failed' && <small>{section.error ?? 'failed'}</small>}
                <small className="export-step-time">{seconds(section.elapsedMs)}</small>
              </li>
            ))}
          </ul>
        )}

        {phase === 'done' && savedPath && (
          <div className="export-result">
            <p>
              Saved to <code>{savedPath}</code>
            </p>
            {notice && <p className="export-note">{notice}</p>}
            <div>
              {revealable && (
                <button
                  className="btn ghost"
                  onClick={() => void window.api.export.reveal(savedPath)}
                >
                  <FolderOpen size={14} /> Show in folder
                </button>
              )}
              <button className="btn" onClick={closeExportPdf}>
                Done
              </button>
            </div>
          </div>
        )}

        {phase === 'canceled' && (
          <div className="export-result">
            <p>
              {hasRendered
                ? 'Not saved. The rendered document is still here — save it without rendering again.'
                : 'Export canceled. Nothing was written.'}
            </p>
            <div>
              {hasRendered && (
                <button className="btn ghost" onClick={() => void saveRendered()}>
                  Save…
                </button>
              )}
              <button className="btn" onClick={closeExportPdf}>
                Close
              </button>
            </div>
          </div>
        )}

        {phase === 'error' && (
          <div className="export-result error">
            <p>{error}</p>
            {hasRendered && (
              <p className="export-note">
                Every page rendered — only saving failed, and the document is still in memory.
                Try again, or put it straight in your downloads folder. If the save dialog keeps
                failing, restart E-Estimate and export once more.
              </p>
            )}
            <div>
              {hasRendered && (
                <>
                  <button className="btn ghost" onClick={downloadRendered}>
                    Save to downloads
                  </button>
                  <button className="btn ghost" onClick={() => void saveRendered()}>
                    Try again
                  </button>
                </>
              )}
              <button className="btn" onClick={closeExportPdf}>
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
