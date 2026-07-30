import { useMemo, useState } from 'react'
import {
  Eye,
  LayoutDashboard,
  Printer,
  RefreshCw,
  Route
} from 'lucide-react'
import {
  dashboardContextMatches,
  dashboardLeadCompileSignature,
  syncLeadDashboardSnapshot
} from '../../lib/dashboardSync'
import { useStore } from '../../store/useStore'
import SignatureFooterCard from '../signature/SignatureFooterCard'
import { LEAD_SIGNATURE_SCOPE, resolveSignatureFooter } from '../../lib/signatureFooter'
import LeadPrintPreviewModal from './LeadPrintPreviewModal'

const money = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})
const measure = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 })

export default function LeadDashboard(): JSX.Element | null {
  const project = useStore((state) => state.project)
  const setDashboardSnapshot = useStore((state) => state.setDashboardSnapshot)
  const openLeadMaterial = useStore((state) => state.openLeadMaterial)
  const updateLeadPrintSettings = useStore((state) => state.updateLeadPrintSettings)
  const upsertLeadPoint = useStore((state) => state.upsertLeadPoint)
  const upsertLeadMapDirection = useStore((state) => state.upsertLeadMapDirection)
  const removeLeadMapDirection = useStore((state) => state.removeLeadMapDirection)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')
  const [printView, setPrintView] = useState(false)
  const [printPreview, setPrintPreview] = useState(false)

  const snapshotValid = project
    ? dashboardContextMatches(project.dashboardSnapshot, project)
    : false
  const entries = snapshotValid
    ? project?.dashboardSnapshot?.leadDashboardEntries ?? []
    : []
  const materialCount = useMemo(
    () => new Set(entries.map((entry) => entry.materialName.trim().toLowerCase())).size,
    [entries]
  )
  const applicationCount = entries.reduce(
    (sum, entry) => sum + entry.applications.length,
    0
  )
  const currentSignature = project ? dashboardLeadCompileSignature(project) : ''
  const compiled =
    snapshotValid &&
    Boolean(project?.dashboardSnapshot?.leadSyncedAt) &&
    project?.dashboardSnapshot?.leadCompileSignature === currentSignature

  if (!project) return null

  const syncDashboard = async (): Promise<void> => {
    if (syncing) return
    setSyncing(true)
    setError('')
    try {
      const next = await syncLeadDashboardSnapshot(project)
      if (useStore.getState().project?.id === project.id) setDashboardSnapshot(next)
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Unable to sync the Lead Dashboard.')
    } finally {
      setSyncing(false)
    }
  }

  const chart = project.leadChart ?? {
    points: [],
    assignments: [],
    variants: [],
    applications: [],
    mapDirections: [],
    printSettings: undefined
  }
  const renderPrintPreview = (embedded: boolean, onClose: () => void): JSX.Element => (
    <LeadPrintPreviewModal
      year={project.meta.sorYear}
      zone={project.meta.sorZone ?? 'zone_3'}
      variants={chart.variants ?? []}
      applications={chart.applications ?? []}
      assignments={chart.assignments ?? []}
      points={chart.points ?? []}
      site={project.meta.location ?? null}
      mapDirections={chart.mapDirections ?? []}
      printSettings={chart.printSettings}
      signatureFooter={resolveSignatureFooter(project, LEAD_SIGNATURE_SCOPE)}
      onUpdatePrintSettings={updateLeadPrintSettings}
      onUpsertPoint={upsertLeadPoint}
      onUpsertMapDirection={upsertLeadMapDirection}
      onRemoveMapDirection={removeLeadMapDirection}
      onClose={onClose}
      rates={snapshotValid ? project.dashboardSnapshot?.leadRates ?? [] : []}
      embedded={embedded}
    />
  )

  return (
    <div
      className={`dashboard aggregate-dashboard lead-total-dashboard ${
        printView ? 'dashboard-print-view' : ''
      }`}
    >
      <div className="dash-header">
        <div>
          <div className="dash-eyebrow">Total dashboard</div>
          <h1 className="dash-title">
            <Route size={22} /> Lead Dashboard
          </h1>
          <div className="aggregate-meta">
            <span>{materialCount} material(s)</span>
            <span>{entries.length} variant(s)</span>
            <span>{applicationCount} application(s)</span>
            {project.dashboardSnapshot?.leadSyncedAt && (
              <span>
                Synced {new Date(project.dashboardSnapshot.leadSyncedAt).toLocaleString()}
              </span>
            )}
          </div>
        </div>
        <div className="dash-actions">
          <button className="btn ghost" disabled={syncing} onClick={() => void syncDashboard()}>
            <RefreshCw size={15} /> {syncing ? 'Syncing…' : 'Sync'}
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

      {error && <div className="rate-warning">Lead sync failed: {error}</div>}
      {!compiled && !error && (
        <div className="rate-notice">
          {entries.length
            ? 'Lead materials or variants have changed. Click Sync to recompile the total Lead Dashboard.'
            : 'Click Sync to compile all Lead materials, variants, costs, and application locations.'}
        </div>
      )}

      {printView ? (
        renderPrintPreview(true, () => setPrintView(false))
      ) : (
        <>
        <SignatureFooterCard scopeKey={LEAD_SIGNATURE_SCOPE} />
        <section className="aggregate-panel">
          <div className="aggregate-table lead-aggregate-table">
            <div className="aggregate-table-head">
              <span>Material / Variant</span>
              <span>Lead & Lift</span>
              <span>Applied at</span>
              <span>Variant cost</span>
              <span></span>
            </div>
            {entries.length === 0 ? (
              <div className="aggregate-empty">No compiled Lead variants yet.</div>
            ) : (
              entries.map((entry) => (
                <div className="aggregate-table-row" key={entry.variantId}>
                  <span className="aggregate-primary">
                    <strong>{entry.materialName}</strong>
                    <small>
                      {entry.variantName} · {entry.conveyanceClass}
                    </small>
                  </span>
                  <span>
                    {measure.format(entry.leadKm)} km
                    {entry.liftM > 0 ? ` · ${measure.format(entry.liftM)} m lift` : ''}
                  </span>
                  <span className="aggregate-usage-list">
                    {entry.applications.length ? (
                      entry.applications.map((application) => (
                        <small key={application.applicationId}>
                          {application.appliedPath} · {application.itemCode}
                        </small>
                      ))
                    ) : (
                      <small>Not applied</small>
                    )}
                  </span>
                  <span className="aggregate-rate">
                    {entry.variantRate === null
                      ? 'Not compiled'
                      : `₹ ${money.format(entry.variantRate)}${entry.rateUnit ? ` / ${entry.rateUnit}` : ''}`}
                  </span>
                  <span>
                    <button
                      className="btn-mini"
                      onClick={() =>
                        openLeadMaterial({
                          materialName: entry.materialName,
                          conveyanceClass: entry.conveyanceClass,
                          variantId: entry.variantId
                        })
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

      {printPreview && renderPrintPreview(false, () => setPrintPreview(false))}
    </div>
  )
}
