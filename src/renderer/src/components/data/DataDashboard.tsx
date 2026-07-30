import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Database,
  Eye,
  LayoutDashboard,
  Printer,
  RefreshCw,
  Search
} from 'lucide-react'
import {
  dashboardContextMatches,
  dashboardDataCompileSignature,
  syncDataDashboardSnapshot
} from '../../lib/dashboardSync'
import { collectDataSheets } from '../../lib/dataSheets'
import { buildDataSheetsPrintPdf } from '../../lib/dataSheetPrint'
import { resolveProjectPrintSettings } from '../../lib/projectPrintSettings'
import { useStore } from '../../store/useStore'
import type {
  CompiledDataDashboardEntry,
  CompiledDataScope,
  EestimateProject
} from '../../types/project'
import SignatureFooterCard from '../signature/SignatureFooterCard'
import { DATA_SIGNATURE_SCOPE } from '../../lib/signatureFooter'
import PdfPageStack from '../print/PdfPageStack'

const money = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

export default function DataDashboard(): JSX.Element | null {
  const project = useStore((state) => state.project)
  const setDashboardSnapshot = useStore((state) => state.setDashboardSnapshot)
  const openRateAnalysis = useStore((state) => state.openRateAnalysis)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')
  const [printView, setPrintView] = useState(false)
  const [printPreview, setPrintPreview] = useState(false)
  const [printPdfUrl, setPrintPdfUrl] = useState<string | null>(null)
  const printFrameRef = useRef<HTMLIFrameElement>(null)

  const snapshotValid = project
    ? dashboardContextMatches(project.dashboardSnapshot, project)
    : false
  const entries = snapshotValid
    ? project?.dashboardSnapshot?.dataDashboardEntries ?? []
    : []
  const currentSignature = project ? dashboardDataCompileSignature(project) : ''
  const compiled =
    snapshotValid &&
    Boolean(project?.dashboardSnapshot?.dataSyncedAt) &&
    project?.dashboardSnapshot?.dataCompileSignature === currentSignature
  const visibleEntries = useMemo(() => {
    const query = filter.trim().toLowerCase()
    if (!query) return entries
    return entries.filter((entry) =>
      [
        entry.code,
        entry.displayName,
        entry.description,
        entry.scopeName,
        ...entry.usages.map((usage) => usage.path)
      ]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(query))
    )
  }, [entries, filter])

  if (!project) return null

  const syncDashboard = async (): Promise<void> => {
    if (syncing) return
    setSyncing(true)
    setError('')
    try {
      const next = await syncDataDashboardSnapshot(project)
      if (useStore.getState().project?.id === project.id) setDashboardSnapshot(next)
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Unable to sync the DATA Dashboard.')
    } finally {
      setSyncing(false)
    }
  }

  const report = (
    <DataDashboardReport
      project={project}
      entries={entries}
      fontScale={resolveProjectPrintSettings(project.projectPrintSettings).fontPercent / 100}
      onPdfReady={setPrintPdfUrl}
    />
  )

  return (
    <div
      className={`dashboard aggregate-dashboard data-total-dashboard ${
        printView ? 'dashboard-print-view' : ''
      }`}
    >
      <div className="dash-header">
        <div>
          <div className="dash-eyebrow">Total dashboard</div>
          <h1 className="dash-title">
            <Database size={22} /> DATA Dashboard
          </h1>
          <div className="aggregate-meta">
            <span>{entries.length} compiled DATA row(s)</span>
            <span>{entries.filter((entry) => entry.scope !== 'shared').length} edited row(s)</span>
            {project.dashboardSnapshot?.dataSyncedAt && (
              <span>
                Synced {new Date(project.dashboardSnapshot.dataSyncedAt).toLocaleString()}
              </span>
            )}
          </div>
        </div>
        <div className="dash-actions">
          <button className="btn ghost" disabled={syncing} onClick={() => void syncDashboard()}>
            <RefreshCw size={15} /> {syncing ? 'Recompiling…' : 'Sync'}
          </button>
          <button
            className="btn ghost"
            onClick={() => {
              setPrintView(false)
              setPrintPreview(true)
            }}
          >
            <Printer size={15} /> Print Preview
          </button>
          <button
            className="btn ghost"
            onClick={() => {
              setPrintPreview(false)
              setPrintView((value) => !value)
            }}
          >
            {printView ? <LayoutDashboard size={15} /> : <Eye size={15} />}
            {printView ? 'Dashboard View' : 'View Print View'}
          </button>
        </div>
      </div>

      {error && <div className="rate-warning">DATA sync failed: {error}</div>}
      {!compiled && !error && (
        <div className="rate-notice">
          {entries.length
            ? 'Items, edits, or Lead additions have changed. Click Sync to recompile all DATA rates.'
            : 'Click Sync to compile all item codes, descriptions, scoped edits, and rates.'}
        </div>
      )}

      {printView ? (
        report
      ) : (
        <>
        <SignatureFooterCard scopeKey={DATA_SIGNATURE_SCOPE} />
        <section className="aggregate-panel">
          <label className="aggregate-search">
            <Search size={14} />
            <input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Filter code, description, edit scope, or component…"
            />
          </label>
          <div className="aggregate-table data-aggregate-table">
            <div className="aggregate-table-head">
              <span>Code / identity</span>
              <span>Description</span>
              <span>Applied at</span>
              <span>Rate</span>
              <span></span>
            </div>
            {visibleEntries.length === 0 ? (
              <div className="aggregate-empty">No compiled DATA rows found.</div>
            ) : (
              visibleEntries.map((entry) => (
                <div className="aggregate-table-row" key={entry.key}>
                  <span className="aggregate-primary">
                    <strong>{entry.displayName}</strong>
                    <small className={`data-scope-badge ${entry.scope}`}>
                      {scopeLabel(entry.scope, entry.scopeName)}
                    </small>
                  </span>
                  <span>{entry.description}</span>
                  <span className="aggregate-usage-list">
                    {entry.usages.map((usage) => (
                      <small key={usage.nodeId}>{usage.path}</small>
                    ))}
                  </span>
                  <span className="aggregate-rate">
                    {entry.rate === null
                      ? 'Rate unavailable'
                      : `₹ ${money.format(entry.rate)}${entry.unit ? ` / ${entry.unit}` : ''}`}
                    {entry.leadRate > 0 && (
                      <small>
                        Base ₹ {money.format(entry.baseRate ?? 0)} + Lead ₹{' '}
                        {money.format(entry.leadRate)}
                      </small>
                    )}
                  </span>
                  <span>
                    <button
                      className="btn-mini"
                      onClick={() =>
                        openRateAnalysis(
                          entry.baseKey,
                          entry.representativeNodeId,
                          false,
                          entry.scopeNodeId
                        )
                      }
                    >
                      Open
                    </button>
                  </span>
                </div>
              ))
            )}
          </div>
        </section>
        </>
      )}

      {printPreview && (
        <div className="aggregate-print-overlay" role="dialog" aria-modal="true">
          <div className="aggregate-print-shell">
            <div className="aggregate-print-toolbar">
              <strong>DATA Dashboard Print Preview</strong>
              <div>
                <button
                  className="btn ghost"
                  disabled={!printPdfUrl}
                  onClick={() => printFrameRef.current?.contentWindow?.print()}
                >
                  <Printer size={14} /> Print
                </button>
                <button className="btn ghost" onClick={() => setPrintPreview(false)}>
                  Close
                </button>
              </div>
            </div>
            {report}
            {printPdfUrl && (
              <iframe
                ref={printFrameRef}
                className="data-dashboard-print-source"
                title="DATA Dashboard PDF"
                src={printPdfUrl}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function scopeLabel(scope: CompiledDataScope, scopeName?: string): string {
  if (scope === 'component_edit') return `Component edit${scopeName ? ` · ${scopeName}` : ''}`
  if (scope === 'item_edit') return 'Individual rate edit'
  if (scope === 'lead_edit') return 'DATA + Lead'
  if (scope === 'shared_edit') return 'Shared DATA edit'
  return 'Shared DATA'
}

/**
 * The DATA print view is the individual SSR/SOR code sheets themselves — the
 * same sheet each code opens — laid out one after another so they flow
 * continuously across pages of the project's chosen paper size.
 */
export function DataDashboardReport({
  project,
  entries,
  fontScale = 1,
  onPdfReady
}: {
  project: EestimateProject
  entries: CompiledDataDashboardEntry[]
  fontScale?: number
  onPdfReady?: (url: string | null) => void
}): JSX.Element {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Stable identity: the geometry feeds a build effect, so a fresh object on
  // every render would rebuild the PDF forever.
  const printSettings = useMemo(
    () => resolveProjectPrintSettings(project.projectPrintSettings),
    [project.projectPrintSettings]
  )
  const { pageSize, orientation, margins } = printSettings

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null
    setPdfUrl(null)
    setError(null)
    onPdfReady?.(null)

    const sheets = collectDataSheets(project, entries)
    if (sheets.length === 0) {
      setError('No compiled SSR/SOR codes are available. Click Sync and try again.')
      return () => onPdfReady?.(null)
    }

    void buildDataSheetsPrintPdf({
      project,
      sheets,
      geometry: { pageSize, orientation, margins, fontScale }
    })
      .then((bytes) => {
        if (cancelled) return
        const copy = new ArrayBuffer(bytes.byteLength)
        new Uint8Array(copy).set(bytes)
        objectUrl = URL.createObjectURL(new Blob([copy], { type: 'application/pdf' }))
        setPdfUrl(objectUrl)
        onPdfReady?.(objectUrl)
      })
      .catch((reason: unknown) => {
        if (cancelled) return
        setError(reason instanceof Error ? reason.message : String(reason))
        onPdfReady?.(null)
      })

    return () => {
      cancelled = true
      onPdfReady?.(null)
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [entries, fontScale, margins, onPdfReady, orientation, pageSize, project])

  if (error) {
    return <div className="data-dashboard-print-message error">{error}</div>
  }
  if (!pdfUrl) {
    return (
      <div className="data-dashboard-print-message">
        Assembling {entries.length} SSR/SOR code{entries.length === 1 ? '' : 's'} into a continuous
        print flow…
      </div>
    )
  }

  return (
    <div className="data-dashboard-print-flow">
      <PdfPageStack src={pdfUrl} zoom={100} />
    </div>
  )
}
