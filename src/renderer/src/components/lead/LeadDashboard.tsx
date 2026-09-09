import { useMemo, useState, useEffect } from 'react'
import {
  Eye,
  MapPinned,
  Printer,
  RefreshCw,
  Route,
  Edit2,
  Check,
  RotateCcw,
  X,
  Layers,
  FileText,
  ExternalLink
} from 'lucide-react'
import {
  dashboardContextMatches,
  dashboardLeadCompileSignature,
  syncLeadDashboardSnapshot
} from '../../lib/dashboardSync'
import { useStore } from '../../store/useStore'
import SignatureFooterCard from '../signature/SignatureFooterCard'
import { LEAD_SIGNATURE_SCOPE, resolveSignatureFooter } from '../../lib/signatureFooter'
import {
  LEAD_TABLE_PRELUDE,
  resolvedLeadTypstSource,
  resolveLeadMaterialPrintName
} from '../../lib/typist-output/leadTypst'
import { routeLabelForVariant } from '../../lib/typist-output/leadTypst'
import LeadPrintStudioSession from './LeadPrintStudioSession'
import LeadMapPrintStudio from './LeadMapPrintStudio'
import LeadCombinedPrintPreview from './LeadCombinedPrintPreview'
import type { CompiledLeadDashboardEntry } from '../../types/project'

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
  const updateLeadPrintOverrides = useStore((state) => state.updateLeadPrintOverrides)

  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')
  const [printPreview, setPrintPreview] = useState(false)
  const [printStudioOpen, setPrintStudioOpen] = useState(false)
  const [mapPrintLayout, setMapPrintLayout] = useState(false)

  const snapshotValid = project
    ? dashboardContextMatches(project.dashboardSnapshot, project)
    : false
  const entries: CompiledLeadDashboardEntry[] = snapshotValid
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
  const maxLeadKm = useMemo(
    () => (entries.length ? Math.max(...entries.map((e) => e.leadKm)) : 0),
    [entries]
  )

  const currentSignature = project ? dashboardLeadCompileSignature(project) : ''
  const compiled =
    snapshotValid &&
    Boolean(project?.dashboardSnapshot?.leadSyncedAt) &&
    project?.dashboardSnapshot?.leadCompileSignature === currentSignature

  // --- Title & Subtitle Editing State ---
  const statementTitle = project?.leadPrintOverrides?.title || 'LEAD STATEMENT'
  const statementSubtitle = project?.leadPrintOverrides?.subtitle || 'Lead Statement & Conveyance Charges'
  const statementNotes = project?.leadPrintOverrides?.notes || ''

  const [editingHeader, setEditingHeader] = useState(false)
  const [draftTitle, setDraftTitle] = useState(statementTitle)
  const [draftSubtitle, setDraftSubtitle] = useState(statementSubtitle)

  useEffect(() => {
    setDraftTitle(statementTitle)
    setDraftSubtitle(statementSubtitle)
  }, [statementTitle, statementSubtitle])

  const handleSaveHeader = async (): Promise<void> => {
    updateLeadPrintOverrides({
      title: draftTitle.trim() || undefined,
      subtitle: draftSubtitle.trim() || undefined
    })
    setEditingHeader(false)
    await useStore.getState().saveProject()
  }

  const handleResetHeader = async (): Promise<void> => {
    setDraftTitle('LEAD STATEMENT')
    setDraftSubtitle('Lead Statement & Conveyance Charges')
    updateLeadPrintOverrides({
      title: undefined,
      subtitle: undefined
    })
    setEditingHeader(false)
    await useStore.getState().saveProject()
  }

  // --- Notes / Remarks Editing State ---
  const [editingNotes, setEditingNotes] = useState(false)
  const [draftNotes, setDraftNotes] = useState(statementNotes)

  useEffect(() => {
    setDraftNotes(statementNotes)
  }, [statementNotes])

  const handleSaveNotes = async (): Promise<void> => {
    updateLeadPrintOverrides({
      notes: draftNotes.trim() || undefined
    })
    setEditingNotes(false)
    await useStore.getState().saveProject()
  }

  const handleResetNotes = async (): Promise<void> => {
    setDraftNotes('')
    updateLeadPrintOverrides({
      notes: undefined
    })
    setEditingNotes(false)
    await useStore.getState().saveProject()
  }

  // --- Per-Variant Display Name Editing State ---
  const [editingVariantId, setEditingVariantId] = useState<string | null>(null)
  const [draftVariantName, setDraftVariantName] = useState('')

  const handleStartEditVariant = (entry: CompiledLeadDashboardEntry): void => {
    setEditingVariantId(entry.variantId)
    setDraftVariantName(resolveLeadMaterialPrintName(project, entry))
  }

  const handleSaveVariantName = async (variantId: string, defaultName: string): Promise<void> => {
    const nextVariantNames = { ...(project?.leadPrintOverrides?.variantNames ?? {}) }
    if (draftVariantName.trim() && draftVariantName.trim() !== defaultName) {
      nextVariantNames[variantId] = draftVariantName.trim()
    } else {
      delete nextVariantNames[variantId]
    }
    updateLeadPrintOverrides({
      variantNames: nextVariantNames
    })
    setEditingVariantId(null)
    await useStore.getState().saveProject()
  }

  const handleResetVariantName = async (variantId: string): Promise<void> => {
    const nextVariantNames = { ...(project?.leadPrintOverrides?.variantNames ?? {}) }
    delete nextVariantNames[variantId]
    updateLeadPrintOverrides({
      variantNames: nextVariantNames
    })
    setEditingVariantId(null)
    await useStore.getState().saveProject()
  }

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
  const variantsById = new Map((chart.variants ?? []).map((v) => [v.id, v]))

  const renderMapLayoutEditor = (): JSX.Element => (
    <LeadMapPrintStudio
      year={project.meta.sorYear}
      variants={chart.variants ?? []}
      applications={chart.applications ?? []}
      assignments={chart.assignments ?? []}
      points={chart.points ?? []}
      site={project.meta.location ?? null}
      mapDirections={chart.mapDirections ?? []}
      printSettings={chart.printSettings}
      signatureFooter={resolveSignatureFooter(project, LEAD_SIGNATURE_SCOPE)}
      onUpdatePrintSettings={updateLeadPrintSettings}
      onClose={() => setMapPrintLayout(false)}
    />
  )

  return (
    <div className="dashboard aggregate-dashboard lead-total-dashboard">
      {/* Top action bar */}
      <div className="dash-header">
        <div>
          <div className="dash-eyebrow">Printable Statement & Layout</div>
          <h1 className="dash-title">
            <Route size={22} /> Lead Statement & Conveyance Charges
          </h1>
          <div className="aggregate-meta">
            <span>{materialCount} Material(s)</span>
            <span>{entries.length} Material Lead(s)</span>
            <span>{applicationCount} Application(s)</span>
            {project.dashboardSnapshot?.leadSyncedAt && (
              <span>
                Synced {new Date(project.dashboardSnapshot.leadSyncedAt).toLocaleString()}
              </span>
            )}
          </div>
        </div>
        <div className="dash-actions">
          <button
            className={`btn ${compiled ? 'ghost' : 'secondary'}`}
            disabled={syncing}
            onClick={() => void syncDashboard()}
          >
            <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Syncing…' : 'Sync Lead'}
          </button>
          <button
            className="btn ghost"
            onClick={() => setPrintPreview(true)}
          >
            <Printer size={15} /> Print Preview
          </button>
          <button
            className="btn ghost"
            onClick={() => setPrintStudioOpen(true)}
          >
            <Eye size={15} /> Open Print Studio
          </button>
          <button
            className="btn ghost"
            onClick={() => setMapPrintLayout(true)}
          >
            <MapPinned size={15} /> Map Print Studio
          </button>
        </div>
      </div>

      {error && <div className="rate-warning">Lead sync failed: {error}</div>}
      {!compiled && !error && (
        <div className="rate-notice">
          {entries.length
            ? 'Lead materials or their rates have changed. Click Sync Lead to recompile.'
            : 'Click Sync Lead to compile all Lead materials, routes, and conveyance rates.'}
        </div>
      )}

      {/* KPI Cards */}
      <div className="seig-summary-row lead-summary-row">
        <div className="seig-summary-card">
          <div className="ssc-label">Materials</div>
          <div className="ssc-value">{materialCount}</div>
        </div>
        <div className="seig-summary-card">
          <div className="ssc-label">Quarries / Sources</div>
          <div className="ssc-value">{entries.length}</div>
        </div>
        <div className="seig-summary-card">
          <div className="ssc-label">Max Lead Distance</div>
          <div className="ssc-value">{measure.format(maxLeadKm)} km</div>
        </div>
        <div className="seig-summary-card">
          <div className="ssc-label">Total Applications</div>
          <div className="ssc-value">{applicationCount}</div>
        </div>
      </div>

      {/* Main WYSIWYG Document Container */}
      <div className="lead-statement-wysiwyg">
        {/* Document Header Banner */}
        <div className="lead-document-banner">
          <div className="lead-banner-left">
            <div className="lead-banner-title-row">
              <h2 className="lead-banner-title">{statementTitle}</h2>
              <span className="lead-banner-project">{project.meta.name || project.root.name}</span>
            </div>
            <div className="lead-banner-subtitle-row">
              <span className="lead-banner-subtitle">{statementSubtitle}</span>
              <span className="lead-banner-sor">
                Standard Schedule of Rates: {project.meta.sorYear || '2025-26'} · {project.meta.sorZone === 'zone_1' ? 'Zone I' : project.meta.sorZone === 'zone_2' ? 'Zone II' : 'Zone III'}
              </span>
            </div>
          </div>
          <div className="lead-banner-right">
            <button
              type="button"
              className="btn-mini ghost seig-edit-group-btn"
              onClick={() => setEditingHeader((v) => !v)}
              title="Edit document title and subtitle for printing"
            >
              <Edit2 size={11} /> {editingHeader ? 'Close Edit' : 'Edit Title & Subtitle'}
            </button>
          </div>
        </div>

        {/* Inline Header Editor */}
        {editingHeader && (
          <div className="seig-meta-edit-panel">
            <div className="seig-meta-field">
              <label>Statement Title:</label>
              <input
                type="text"
                className="seig-inline-input"
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                placeholder="LEAD STATEMENT"
              />
            </div>
            <div className="seig-meta-field">
              <label>Statement Subtitle:</label>
              <input
                type="text"
                className="seig-inline-input"
                value={draftSubtitle}
                onChange={(e) => setDraftSubtitle(e.target.value)}
                placeholder="Lead Statement & Conveyance Charges"
              />
            </div>
            <div className="seig-meta-actions">
              <button type="button" className="btn-mini secondary" onClick={() => void handleSaveHeader()}>
                <Check size={12} /> Save
              </button>
              <button
                type="button"
                className="btn-mini ghost"
                onClick={() => void handleResetHeader()}
                title="Reset to default title"
              >
                <RotateCcw size={12} /> Reset to Default
              </button>
              <button type="button" className="btn-mini ghost" onClick={() => setEditingHeader(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* SECTION A: Summary of Material Leads & Adopted Rates */}
        <div className="lead-statement-section-card">
          <div className="seig-group-header-row">
            <div className="seig-group-header-left">
              <span className="seig-group-badge">Section A</span>
              <h3 className="seig-group-title">Summary of Material Leads & Adopted Rates</h3>
              <span className="lead-count-tag">{entries.length} Material(s)</span>
            </div>
          </div>

          <div className="lead-summary-table-wrapper">
            <div className="lead-summary-table-head">
              <span className="lcol-sl">Sl No</span>
              <span className="lcol-name">Material / Description</span>
              <span className="lcol-route">Quarry / Source</span>
              <span className="lcol-cls">Class</span>
              <span className="lcol-km">Lead (Km)</span>
              <span className="lcol-lift">Lift (m)</span>
              <span className="lcol-rate">Rate (Rs / Unit)</span>
              <span className="lcol-uses">Uses</span>
              <span className="lcol-act"></span>
            </div>

            {entries.length === 0 ? (
              <div className="seig-calc-empty">No compiled lead materials found. Click Sync Lead.</div>
            ) : (
              entries.map((entry, index) => {
                const isEditing = editingVariantId === entry.variantId
                const printName = resolveLeadMaterialPrintName(project, entry)
                const isCustomName = Boolean(
                  project.leadPrintOverrides?.variantNames?.[entry.variantId]?.trim()
                )
                const defaultName = entry.variantName || entry.materialName
                const variant = variantsById.get(entry.variantId)
                const route = variant
                  ? routeLabelForVariant(
                      variant,
                      chart.assignments ?? [],
                      chart.points ?? [],
                      project.meta.location ?? null
                    )
                  : 'Quarry / Source'

                return (
                  <div className="lead-summary-table-row" key={entry.variantId}>
                    <span className="lcol-sl">{index + 1}</span>
                    <span className="lcol-name">
                      {isEditing ? (
                        <div className="seig-desc-edit-row">
                          <input
                            type="text"
                            className="seig-desc-input"
                            value={draftVariantName}
                            autoFocus
                            onChange={(e) => setDraftVariantName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') void handleSaveVariantName(entry.variantId, defaultName)
                              if (e.key === 'Escape') setEditingVariantId(null)
                            }}
                          />
                          <button
                            type="button"
                            className="btn-mini secondary"
                            title="Save display name"
                            onClick={() => void handleSaveVariantName(entry.variantId, defaultName)}
                          >
                            <Check size={12} /> Save
                          </button>
                          <button
                            type="button"
                            className="btn-mini ghost"
                            title="Cancel"
                            onClick={() => setEditingVariantId(null)}
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ) : (
                        <div className="seig-desc-display-row">
                          <span className="seig-desc-text">{printName}</span>
                          <div className="seig-desc-actions">
                            <button
                              type="button"
                              className="btn-mini ghost seig-desc-edit-btn"
                              onClick={() => handleStartEditVariant(entry)}
                              title="Edit material print description"
                            >
                              <Edit2 size={11} />
                            </button>
                            {isCustomName && (
                              <button
                                type="button"
                                className="btn-mini ghost seig-desc-reset-btn"
                                onClick={() => void handleResetVariantName(entry.variantId)}
                                title="Reset to default material name"
                              >
                                <RotateCcw size={11} />
                              </button>
                            )}
                          </div>
                          {isCustomName && <span className="seig-custom-pill">Custom</span>}
                        </div>
                      )}
                    </span>
                    <span className="lcol-route">{route}</span>
                    <span className="lcol-cls">{entry.conveyanceClass}</span>
                    <span className="lcol-km">{measure.format(entry.leadKm)} km</span>
                    <span className="lcol-lift">
                      {entry.liftM > 0 ? `${measure.format(entry.liftM)} m` : '0.00'}
                    </span>
                    <span className="lcol-rate">
                      {entry.variantRate != null
                        ? `Rs. ${money.format(entry.variantRate)} / ${entry.rateUnit || 'unit'}`
                        : '—'}
                    </span>
                    <span className="lcol-uses">
                      <span className="lead-uses-badge">{entry.applications.length}</span>
                    </span>
                    <span className="lcol-act">
                      <button
                        className="btn-mini ghost"
                        title="Open details in editor"
                        onClick={() =>
                          openLeadMaterial({
                            materialName: entry.materialName,
                            conveyanceClass: entry.conveyanceClass,
                            variantId: entry.variantId,
                            pipeLead: entry.pipeLead
                          })
                        }
                      >
                        <ExternalLink size={12} />
                      </button>
                    </span>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* SECTION B: Detailed Lead Rate Calculations */}
        {entries.length > 0 && (
          <div className="lead-statement-section-card">
            <div className="seig-group-header-row">
              <div className="seig-group-header-left">
                <span className="seig-group-badge">Section B</span>
                <h3 className="seig-group-title">Detailed Lead Rate Calculations</h3>
              </div>
            </div>

            <div className="lead-breakdown-cards-list">
              {entries.map((entry, index) => {
                const variant = variantsById.get(entry.variantId)
                const routeLabel = variant
                  ? routeLabelForVariant(
                      variant,
                      chart.assignments ?? [],
                      chart.points ?? [],
                      project.meta.location ?? null
                    )
                  : 'Quarry / Source → Project Site'
                const displayName = resolveLeadMaterialPrintName(project, entry)
                const breakdown = entry.breakdown ?? []

                return (
                  <div className="lead-breakdown-card" key={entry.variantId}>
                    <div className="lead-breakdown-card-head">
                      <div className="lead-breakdown-title-row">
                        <h4>
                          {index + 1}. {displayName} — {measure.format(entry.leadKm)} km
                        </h4>
                        <span className="lead-route-subtitle">
                          <em>Route:</em> {routeLabel} ({entry.conveyanceClass})
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn-mini ghost"
                        onClick={() =>
                          openLeadMaterial({
                            materialName: entry.materialName,
                            conveyanceClass: entry.conveyanceClass,
                            variantId: entry.variantId,
                            pipeLead: entry.pipeLead
                          })
                        }
                      >
                        <ExternalLink size={12} /> Full Route
                      </button>
                    </div>

                    <div className="lead-breakdown-table">
                      <div className="lead-breakdown-thead">
                        <span>Calculation Step / Slab</span>
                        <span className="text-right">Distance / Mode</span>
                        <span className="text-right">Amount (Rs)</span>
                      </div>
                      {breakdown.length === 0 ? (
                        <div className="lead-breakdown-row">
                          <span>Conveyance charges for {measure.format(entry.leadKm)} km</span>
                          <span className="text-right">{measure.format(entry.leadKm)} km</span>
                          <span className="text-right">
                            {entry.variantRate != null ? `Rs. ${money.format(entry.variantRate)}` : '—'}
                          </span>
                        </div>
                      ) : (
                        breakdown.map((step, sIdx) => (
                          <div className="lead-breakdown-row" key={sIdx}>
                            <span>{step.label}</span>
                            <span className="text-right">{step.expression}</span>
                            <span className="text-right">Rs. {money.format(step.amount)}</span>
                          </div>
                        ))
                      )}
                      <div className="lead-breakdown-total-row">
                        <span></span>
                        <span className="text-right font-bold">
                          Adopted Rate per {entry.rateUnit || 'unit'}:
                        </span>
                        <span className="text-right font-bold text-accent">
                          {entry.variantRate != null ? `Rs. ${money.format(entry.variantRate)}` : '—'}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Notes / Remarks Section */}
        <div className="lead-statement-section-card lead-notes-card">
          <div className="seig-group-header-row">
            <div className="seig-group-header-left">
              <span className="seig-group-badge">Remarks</span>
              <h3 className="seig-group-title">Notes & Statutory Remarks</h3>
            </div>
            <button
              type="button"
              className="btn-mini ghost seig-edit-group-btn"
              onClick={() => setEditingNotes((v) => !v)}
              title="Edit notes / remarks for statement print"
            >
              <Edit2 size={11} /> {editingNotes ? 'Close Edit' : 'Edit Remarks'}
            </button>
          </div>

          {!editingNotes ? (
            <div className="lead-notes-content">
              {statementNotes.trim() ? (
                <p className="lead-notes-text">{statementNotes}</p>
              ) : (
                <p className="lead-notes-empty">
                  <em>No custom notes entered. Click &ldquo;Edit Remarks&rdquo; to add G.O. references, quarry inspection dates, or conveyance conditions.</em>
                </p>
              )}
            </div>
          ) : (
            <div className="seig-meta-edit-panel">
              <div className="seig-meta-field">
                <label>Notes / Remarks for Printout:</label>
                <textarea
                  className="seig-inline-input lead-notes-textarea"
                  rows={4}
                  value={draftNotes}
                  onChange={(e) => setDraftNotes(e.target.value)}
                  placeholder="e.g. Conveyance charges calculated as per Common Standard Schedule of Rates (SOR: 2025-26). Quarry distance measured via shortest motorable road."
                />
              </div>
              <div className="seig-meta-actions">
                <button type="button" className="btn-mini secondary" onClick={() => void handleSaveNotes()}>
                  <Check size={12} /> Save Remarks
                </button>
                {project.leadPrintOverrides?.notes && (
                  <button
                    type="button"
                    className="btn-mini ghost"
                    onClick={() => void handleResetNotes()}
                    title="Clear remarks"
                  >
                    <RotateCcw size={12} /> Clear
                  </button>
                )}
                <button type="button" className="btn-mini ghost" onClick={() => setEditingNotes(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Signatures Block */}
        <SignatureFooterCard scopeKey={LEAD_SIGNATURE_SCOPE} />
      </div>

      {printPreview && (
        <LeadCombinedPrintPreview
          year={project.meta.sorYear}
          project={project}
          entries={entries}
          typstSource={resolvedLeadTypstSource(project, entries)}
          compilePrelude={LEAD_TABLE_PRELUDE}
          variants={chart.variants ?? []}
          applications={chart.applications ?? []}
          assignments={chart.assignments ?? []}
          points={chart.points ?? []}
          site={project.meta.location ?? null}
          mapDirections={chart.mapDirections ?? []}
          printSettings={chart.printSettings}
          signatureFooter={resolveSignatureFooter(project, LEAD_SIGNATURE_SCOPE)}
          onClose={() => setPrintPreview(false)}
        />
      )}

      {printStudioOpen && (
        <LeadPrintStudioSession
          project={project}
          entries={entries}
          variants={chart.variants ?? []}
          applications={chart.applications ?? []}
          assignments={chart.assignments ?? []}
          points={chart.points ?? []}
          site={project.meta.location ?? null}
          mapDirections={chart.mapDirections ?? []}
          printSettings={chart.printSettings}
          onClose={() => setPrintStudioOpen(false)}
        />
      )}

      {mapPrintLayout && renderMapLayoutEditor()}
    </div>
  )
}
