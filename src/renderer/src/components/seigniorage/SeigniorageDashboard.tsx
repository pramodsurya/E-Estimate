import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Edit2,
  Eye,
  Gem,
  Printer,
  RefreshCw,
  RotateCcw,
  Search,
  X
} from 'lucide-react'
import {
  computeSeigniorageTable,
  PERMIT_GO_REFERENCE,
  permitPercentFor,
  seigniorageItemDisplayName,
  type SeigniorageCalculation,
  type SeigniorageCharge,
  type SeigniorageItemRow
} from '../../lib/seigniorage'
import type { SeigniorageApplicabilityPolicy } from '../../types/rateAnalysis'
import { useStore } from '../../store/useStore'
import EEstimatePrintStudio from '../typst/EEstimatePrintStudio'
import SeignioragePrintPreview from './SeignioragePrintPreview'
import {
  buildSeigniorageRenderData,
  defaultSeigniorageRowDescription,
  EE_GROUP_TABLE_PRELUDE,
  resolveSeigniorageDocumentSettings,
  resolveSeigniorageGroupHeading,
  resolveSeigniorageGroupSubtotal,
  resolveSeigniorageRowDescription,
  resolvedSeigniorageTypstSource,
  seigniorageCompileInputs,
  seigniorageTypstTemplate
} from '../../lib/typist-output/seigniorageTypst'
import {
  dashboardContextMatches,
  syncSeigniorageDashboardSnapshot
} from '../../lib/dashboardSync'
import SignatureFooterCard from '../signature/SignatureFooterCard'
import {
  SEIGNIORAGE_SIGNATURE_SCOPE
} from '../../lib/signatureFooter'

const money = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})
const qtyFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 })
const rateFmt = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})
const factorFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 6 })
const intFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })


interface MaterialGroup {
  key: string
  label: string
  rows: SeigniorageItemRow[]
  totalSeigniorage: number
  totalDmft: number
  totalSmft: number
  totalPermit: number
}

export default function SeigniorageDashboard(): JSX.Element {
  const closeSeigniorage = useStore((state) => state.closeSeigniorage)
  const openSeigniorage = useStore((state) => state.openSeigniorage)
  const selection = useStore((state) => state.seigniorageSelection)
  const project = useStore((state) => state.project)
  const updatePrintStudioDocument = useStore((state) => state.updatePrintStudioDocument)
  const updateSeignioragePrintOverrides = useStore((state) => state.updateSeignioragePrintOverrides)
  const setDashboardSnapshot = useStore((state) => state.setDashboardSnapshot)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')
  const [printPreviewOpen, setPrintPreviewOpen] = useState(false)
  const [printStudioOpen, setPrintStudioOpen] = useState(false)

  const printOverrides = project?.seignioragePrintOverrides
  const statementTitle = printOverrides?.title || 'SEIGNIORAGE STATEMENT'
  const statementYear = printOverrides?.year || project?.meta.sorYear || '2025-26'
  const permitBasis = printOverrides?.permitBasis || PERMIT_GO_REFERENCE

  const [editingHeader, setEditingHeader] = useState(false)
  const [draftTitle, setDraftTitle] = useState(statementTitle)
  const [draftYear, setDraftYear] = useState(statementYear)

  const [editingPermitBasis, setEditingPermitBasis] = useState(false)
  const [draftPermitBasis, setDraftPermitBasis] = useState(permitBasis)

  const [editingGroupKey, setEditingGroupKey] = useState<string | null>(null)
  const [draftGroupHeading, setDraftGroupHeading] = useState('')
  const [draftGroupSubtotal, setDraftGroupSubtotal] = useState('')

  useEffect(() => {
    setDraftTitle(statementTitle)
    setDraftYear(statementYear)
  }, [statementTitle, statementYear])

  useEffect(() => {
    setDraftPermitBasis(permitBasis)
  }, [permitBasis])

  const snapshotValid = project
    ? dashboardContextMatches(project.dashboardSnapshot, project)
    : false
  const charges: SeigniorageCharge[] = snapshotValid
    ? project?.dashboardSnapshot?.seigniorageCharges ?? []
    : []
  const policyByCode: Record<string, SeigniorageApplicabilityPolicy> = snapshotValid
    ? project?.dashboardSnapshot?.seignioragePolicies ?? {}
    : {}
  const calc: SeigniorageCalculation = useMemo(
    () => computeSeigniorageTable(project, charges, [], policyByCode),
    [project, charges, policyByCode]
  )
  const projectDocumentSettings = project
    ? resolveSeigniorageDocumentSettings(project)
    : { pageSize: 'A4' as const, orientation: 'landscape' as const, margins: { top: 20, right: 15, bottom: 20, left: 25 }, fontFamily: 'sans' as const, fontSizePt: 9.5 }
  const defaultTypstSource = project
    ? seigniorageTypstTemplate(calc, project)
    : ''
  const printTypstSource = project
    ? resolvedSeigniorageTypstSource(project, calc)
    : ''
  const compileInputs = project
    ? seigniorageCompileInputs(project, calc)
    : {}

  const handleUpdateRowDescription = async (rowId: string, customText: string | null): Promise<void> => {
    const nextRowDescriptions = { ...(project?.seignioragePrintOverrides?.rowDescriptions ?? {}) }
    if (customText && customText.trim()) {
      nextRowDescriptions[rowId] = customText.trim()
    } else {
      delete nextRowDescriptions[rowId]
    }
    updateSeignioragePrintOverrides({ rowDescriptions: nextRowDescriptions })
    await useStore.getState().saveProject({ requireSaved: true })
  }

  const handleSaveHeader = async (): Promise<void> => {
    updateSeignioragePrintOverrides({
      title: draftTitle.trim() || undefined,
      year: draftYear.trim() || undefined
    })
    setEditingHeader(false)
    await useStore.getState().saveProject({ requireSaved: true })
  }

  const handleResetHeader = async (): Promise<void> => {
    setDraftTitle('SEIGNIORAGE STATEMENT')
    setDraftYear(project?.meta.sorYear || '2025-26')
    updateSeignioragePrintOverrides({
      title: undefined,
      year: undefined
    })
    setEditingHeader(false)
    await useStore.getState().saveProject({ requireSaved: true })
  }

  const handleSavePermitBasis = async (): Promise<void> => {
    updateSeignioragePrintOverrides({
      permitBasis: draftPermitBasis.trim() || undefined
    })
    setEditingPermitBasis(false)
    await useStore.getState().saveProject({ requireSaved: true })
  }

  const handleResetPermitBasis = async (): Promise<void> => {
    setDraftPermitBasis(PERMIT_GO_REFERENCE)
    updateSeignioragePrintOverrides({
      permitBasis: undefined
    })
    setEditingPermitBasis(false)
    await useStore.getState().saveProject({ requireSaved: true })
  }

  const syncDashboard = async (): Promise<void> => {
    if (!project || loading) return
    setLoading(true)
    setError('')
    try {
      const next = await syncSeigniorageDashboardSnapshot(project)
      const current = useStore.getState().project
      if (!current || current.id !== project.id) return
      if (!dashboardContextMatches(next, current)) return
      setDashboardSnapshot(next)
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Unable to sync seigniorage.')
    } finally {
      setLoading(false)
    }
  }

  const materialGroups = useMemo(() => groupRowsByMaterial(calc.rows), [calc.rows])
  const selectedMaterialKey = selection?.materialKey ?? null
  const selectedGroup = useMemo(
    () =>
      selectedMaterialKey
        ? materialGroups.find((group) => group.key === selectedMaterialKey) ?? null
        : null,
    [materialGroups, selectedMaterialKey]
  )

    const currentGroupHeading = selectedGroup ? resolveSeigniorageGroupHeading(project, selectedGroup) : ''
  const currentGroupSubtotal = selectedGroup ? resolveSeigniorageGroupSubtotal(project, selectedGroup) : ''

  const handleStartEditGroup = (group: { key: string; label: string }): void => {
    setEditingGroupKey(group.key)
    setDraftGroupHeading(resolveSeigniorageGroupHeading(project, group))
    setDraftGroupSubtotal(resolveSeigniorageGroupSubtotal(project, group))
  }

  const handleSaveGroupMeta = async (groupKey: string, defaultLabel: string): Promise<void> => {
    const nextHeadings = { ...(project?.seignioragePrintOverrides?.groupHeadings ?? {}) }
    const nextSubtotals = { ...(project?.seignioragePrintOverrides?.groupSubtotals ?? {}) }

    if (draftGroupHeading.trim() && draftGroupHeading.trim() !== defaultLabel) {
      nextHeadings[groupKey] = draftGroupHeading.trim()
    } else {
      delete nextHeadings[groupKey]
    }

    const defaultSubtotal = `Subtotal — ${draftGroupHeading.trim() || defaultLabel}`
    if (draftGroupSubtotal.trim() && draftGroupSubtotal.trim() !== defaultSubtotal) {
      nextSubtotals[groupKey] = draftGroupSubtotal.trim()
    } else {
      delete nextSubtotals[groupKey]
    }

    updateSeignioragePrintOverrides({
      groupHeadings: nextHeadings,
      groupSubtotals: nextSubtotals
    })
    setEditingGroupKey(null)
    await useStore.getState().saveProject({ requireSaved: true })
  }

  const handleResetGroupMeta = async (groupKey: string): Promise<void> => {
    const nextHeadings = { ...(project?.seignioragePrintOverrides?.groupHeadings ?? {}) }
    const nextSubtotals = { ...(project?.seignioragePrintOverrides?.groupSubtotals ?? {}) }
    delete nextHeadings[groupKey]
    delete nextSubtotals[groupKey]

    updateSeignioragePrintOverrides({
      groupHeadings: nextHeadings,
      groupSubtotals: nextSubtotals
    })
    setEditingGroupKey(null)
    await useStore.getState().saveProject({ requireSaved: true })
  }
  const visibleRows = selectedGroup?.rows ?? calc.rows

  const filteredRows = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return visibleRows
    return visibleRows.filter((row) =>
      row.description.toLowerCase().includes(q) ||
      row.itemCode.toLowerCase().includes(q) ||
      row.materialLabel?.toLowerCase().includes(q) ||
      row.materialKey?.toLowerCase().includes(q) ||
      row.recipeMaterialDesc?.toLowerCase().includes(q) ||
      row.charge?.mineral_name.toLowerCase().includes(q) ||
      row.charge?.seig_code.toLowerCase().includes(q)
    )
  }, [filter, visibleRows])

  const needsReview = calc.rows.filter((row) => row.charge === null || row.seigRate === null)

  return (
    <div className="dashboard seig-dashboard">
      <div className="dash-header">
        <div>
          <div className="dash-eyebrow">Project Seigniorage</div>
          <h1 className="dash-title">
            <Gem size={22} />
            Seigniorage
          </h1>
        </div>
        <div className="dash-actions">
          {selectedMaterialKey && (
            <button
              type="button"
              className="btn secondary seig-back-all-btn"
              onClick={() => openSeigniorage({ seigCode: null, materialKey: undefined })}
              title="Return to the complete printable statement"
            >
              <ArrowLeft size={15} /> Back to All Materials (Statement Dashboard)
            </button>
          )}
          {!selectedMaterialKey && (
            <button className="btn ghost" disabled={loading} onClick={() => void syncDashboard()}>
              <RefreshCw size={15} /> {loading ? 'Syncing…' : 'Sync'}
            </button>
          )}
          <button className="btn ghost" onClick={() => setPrintPreviewOpen(true)}>
            <Printer size={15} /> Print Preview
          </button>
          <button className="btn ghost" onClick={() => setPrintStudioOpen(true)}>
            <Eye size={15} /> Open Print Studio
          </button>
          <button className="btn ghost" onClick={closeSeigniorage}>
            <X size={14} /> Close
          </button>
        </div>
      </div>

      {error && <div className="rate-warning">Seigniorage sync failed: {error}</div>}
      {!snapshotValid && !error && (
        <div className="rate-notice">
          {selectedMaterialKey
            ? 'Sync the total Seigniorage Dashboard to populate this material.'
            : 'Click Sync to populate seigniorage from the backend.'}
        </div>
      )}

      <div className="seig-summary-row">
        <div className="seig-summary-card">
          <div className="ssc-label">Seigniorage</div>
          <div className="ssc-value">Rs. {money.format(calc.totalSeigniorage)}</div>
        </div>
        <div className="seig-summary-card">
          <div className="ssc-label">DMFT 30%</div>
          <div className="ssc-value">Rs. {money.format(calc.totalDmft)}</div>
        </div>
        <div className="seig-summary-card">
          <div className="ssc-label">SMFT 2%</div>
          <div className="ssc-value">Rs. {money.format(calc.totalSmft)}</div>
        </div>
        <div className="seig-summary-card">
          <div className="ssc-label">Permit fee</div>
          <div className="ssc-value">Rs. {money.format(calc.totalPermit)}</div>
        </div>
        <div className="seig-summary-card accent">
          <div className="ssc-label">Grand Total</div>
          <div className="ssc-value">Rs. {money.format(calc.grandTotal)}</div>
        </div>
      </div>

      {needsReview.length > 0 && (
        <div className="seig-review-section">
          <div className="seig-review-title">
            <AlertTriangle size={14} color="var(--warn)" />
            <span>{needsReview.length} seigniorage material row(s) need charge/rate review.</span>
          </div>
        </div>
      )}

      <div className="seig-workspace">
        <section className="seig-detail-pane">
          <div className="seig-detail-header">
            <div>
              <div className="dash-eyebrow">
                {selectedMaterialKey ? 'Filtered Material View' : 'Printable Statement View'}
              </div>
              <div className="seig-detail-title-row">
                <h2>{selectedGroup ? currentGroupHeading : statementTitle}</h2>
                {selectedMaterialKey ? (
                  <div className="seig-header-edit-controls">
                    <button
                      type="button"
                      className="btn-mini ghost seig-edit-meta-btn"
                      onClick={() =>
                        selectedGroup && (editingGroupKey === selectedGroup.key
                          ? setEditingGroupKey(null)
                          : handleStartEditGroup(selectedGroup))
                      }
                      title="Edit material heading and subtotal label for statement print"
                    >
                      <Edit2 size={11} /> {editingGroupKey === selectedGroup?.key ? 'Close Edit' : 'Edit Heading & Subtotal'}
                    </button>
                    <button
                      type="button"
                      className="btn-mini secondary seig-nav-return-btn"
                      onClick={() => openSeigniorage({ seigCode: null, materialKey: undefined })}
                      title="Switch to the full statement that will be printed"
                    >
                      <ArrowLeft size={12} /> Back to Statement Dashboard
                    </button>
                  </div>
                ) : (
                  <div className="seig-header-edit-controls">
                    <span className="seig-header-subtitle">Schedule of Rates: {statementYear}</span>
                    <button
                      type="button"
                      className="btn-mini ghost seig-edit-meta-btn"
                      onClick={() => setEditingHeader((v) => !v)}
                      title="Edit statement title and SSR year for printing"
                    >
                      <Edit2 size={11} /> {editingHeader ? 'Close Edit' : 'Edit Title & Year'}
                    </button>
                  </div>
                )}
              </div>
            </div>
            <label className="seig-search">
              <Search size={12} />
              <input
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="Filter DATA, material, or mineral..."
              />
            </label>
          </div>


          {selectedMaterialKey && selectedGroup && editingGroupKey === selectedGroup.key && (
            <div className="seig-meta-edit-panel">
              <div className="seig-meta-field">
                <label>Group Print Heading:</label>
                <input
                  type="text"
                  className="seig-inline-input"
                  value={draftGroupHeading}
                  onChange={(e) => setDraftGroupHeading(e.target.value)}
                  placeholder={selectedGroup?.label}
                />
              </div>
              <div className="seig-meta-field">
                <label>Group Subtotal Label:</label>
                <input
                  type="text"
                  className="seig-inline-input"
                  value={draftGroupSubtotal}
                  onChange={(e) => setDraftGroupSubtotal(e.target.value)}
                  placeholder={`Subtotal — ${draftGroupHeading || selectedGroup?.label}`}
                />
              </div>
              <div className="seig-meta-actions">
                <button
                  type="button"
                  className="btn-mini secondary"
                  onClick={() => void handleSaveGroupMeta(selectedGroup.key, selectedGroup.label)}
                >
                  <Check size={12} /> Save
                </button>
                <button
                  type="button"
                  className="btn-mini ghost"
                  onClick={() => void handleResetGroupMeta(selectedGroup.key)}
                  title="Reset to default SOR heading"
                >
                  <RotateCcw size={12} /> Reset to Default
                </button>
                <button type="button" className="btn-mini ghost" onClick={() => setEditingGroupKey(null)}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {!selectedMaterialKey && editingHeader && (
            <div className="seig-meta-edit-panel">
              <div className="seig-meta-field">
                <label>Statement Title:</label>
                <input
                  type="text"
                  className="seig-inline-input"
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  placeholder="SEIGNIORAGE STATEMENT"
                />
              </div>
              <div className="seig-meta-field">
                <label>Schedule Year:</label>
                <input
                  type="text"
                  className="seig-inline-input"
                  value={draftYear}
                  onChange={(e) => setDraftYear(e.target.value)}
                  placeholder="2025-26"
                />
              </div>
              <div className="seig-meta-actions">
                <button type="button" className="btn-mini secondary" onClick={() => void handleSaveHeader()}>
                  <Check size={12} /> Save
                </button>
                <button type="button" className="btn-mini ghost" onClick={() => void handleResetHeader()} title="Reset to defaults">
                  <RotateCcw size={12} /> Reset to Default
                </button>
                <button type="button" className="btn-mini ghost" onClick={() => setEditingHeader(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {selectedMaterialKey ? (
            /* Single Filtered Material View */
            <div className="seig-calc-table seig-calc-table-material">
              <div className="seig-calc-thead">
                <span className="scol-sl">Sl No.</span>
                <span className="scol-desc">Description</span>
                <span className="scol-total-qty">Total Quantity</span>
                <span className="scol-seig-qty">Seigniorage Quantity</span>
                <span className="scol-rate">Seigniorage Rate</span>
                <span className="scol-seig">Seigniorage</span>
                <span className="scol-dmft">DMFT 30%</span>
                <span className="scol-smft">SMFT 2%</span>
                <span className="scol-permit">Permit fee (% of seigniorage)</span>
              </div>

              {filteredRows.length === 0 ? (
                <div className="seig-calc-empty">No seigniorage DATA rows found.</div>
              ) : (
                <>
                  {filteredRows.map((row, index) => (
                    <SeigniorageTableRow
                      key={row.id}
                      row={row}
                      slNo={index + 1}
                      project={project}
                      onUpdateDescription={handleUpdateRowDescription}
                    />
                  ))}
                  <TotalRow
                    label={currentGroupSubtotal || 'TOTAL'}
                    calc={calcForRows(filteredRows)}
                  />
                  <RoundingRow
                    calc={calcForRows(filteredRows)}
                  />
                </>
              )}
            </div>
          ) : (
            /* Full Statement WYSIWYG View (Group by Group, Exactly As Printed) */
            <div className="seig-statement-wysiwyg">
              {materialGroups.length === 0 ? (
                <div className="seig-calc-empty">No seigniorage DATA rows found.</div>
              ) : (
                materialGroups.map((group) => {
                  const groupRows = filter.trim()
                    ? group.rows.filter((r) => {
                        const q = filter.toLowerCase()
                        return (
                          r.itemCode?.toLowerCase().includes(q) ||
                          r.materialLabel?.toLowerCase().includes(q) ||
                          r.recipeMaterialDesc?.toLowerCase().includes(q)
                        )
                      })
                    : group.rows
                  if (groupRows.length === 0) return null

                  const isEditing = editingGroupKey === group.key
                  const heading = resolveSeigniorageGroupHeading(project, group)
                  const subtotal = resolveSeigniorageGroupSubtotal(project, group)
                  const isCustomHeading = Boolean(project?.seignioragePrintOverrides?.groupHeadings?.[group.key])

                  return (
                    <div key={group.key} className="seig-statement-group-block">
                      <div className="seig-group-header-row">
                        <div className="seig-group-header-left">
                          <span className="seig-group-badge">Material Group</span>
                          <h3 className="seig-group-title">{heading}</h3>
                          {isCustomHeading && <span className="spdb-custom-tag">Customized</span>}
                        </div>
                        <button
                          type="button"
                          className="btn-mini ghost seig-edit-group-btn"
                          onClick={() => (isEditing ? setEditingGroupKey(null) : handleStartEditGroup(group))}
                          title="Edit this material's print heading and subtotal label"
                        >
                          <Edit2 size={11} /> {isEditing ? 'Close Edit' : 'Edit Heading & Subtotal'}
                        </button>
                      </div>

                      {isEditing && (
                        <div className="seig-meta-edit-panel">
                          <div className="seig-meta-field">
                            <label>Group Print Heading:</label>
                            <input
                              type="text"
                              className="seig-inline-input"
                              value={draftGroupHeading}
                              onChange={(e) => setDraftGroupHeading(e.target.value)}
                              placeholder={group.label}
                            />
                          </div>
                          <div className="seig-meta-field">
                            <label>Group Subtotal Label:</label>
                            <input
                              type="text"
                              className="seig-inline-input"
                              value={draftGroupSubtotal}
                              onChange={(e) => setDraftGroupSubtotal(e.target.value)}
                              placeholder={`Subtotal — ${draftGroupHeading || group.label}`}
                            />
                          </div>
                          <div className="seig-meta-actions">
                            <button
                              type="button"
                              className="btn-mini secondary"
                              onClick={() => void handleSaveGroupMeta(group.key, group.label)}
                            >
                              <Check size={12} /> Save
                            </button>
                            <button
                              type="button"
                              className="btn-mini ghost"
                              onClick={() => void handleResetGroupMeta(group.key)}
                              title="Reset to default SOR heading"
                            >
                              <RotateCcw size={12} /> Reset to Default
                            </button>
                            <button type="button" className="btn-mini ghost" onClick={() => setEditingGroupKey(null)}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="seig-calc-table seig-calc-table-material">
                        <div className="seig-calc-thead">
                          <span className="scol-sl">Sl No.</span>
                          <span className="scol-desc">Description</span>
                          <span className="scol-total-qty">Total Quantity</span>
                          <span className="scol-seig-qty">Seigniorage Quantity</span>
                          <span className="scol-rate">Seigniorage Rate</span>
                          <span className="scol-seig">Seigniorage</span>
                          <span className="scol-dmft">DMFT 30%</span>
                          <span className="scol-smft">SMFT 2%</span>
                          <span className="scol-permit">Permit fee (% of seigniorage)</span>
                        </div>

                        {groupRows.map((row, index) => (
                          <SeigniorageTableRow
                            key={row.id}
                            row={row}
                            slNo={index + 1}
                            project={project}
                            onUpdateDescription={handleUpdateRowDescription}
                          />
                        ))}

                        <TotalRow
                          label={subtotal}
                          calc={calcForRows(groupRows)}
                        />
                      </div>
                    </div>
                  )
                })
              )}

              {/* Statement Total Block */}
              <div className="seig-statement-totals-section">
                <div className="seig-statement-total-heading">
                  <h3>Statement Grand Total</h3>
                </div>
                <div className="seig-calc-table seig-calc-table-material">
                  <TotalRow
                    label="Grand Total (All Materials)"
                    calc={calc}
                  />
                  <RoundingRow
                    calc={calc}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Legal Permit fee basis note */}
          <div className="seig-permit-basis-bar">
            <div className="seig-permit-basis-content">
              <span className="seig-permit-basis-text">
                <em>Permit fee basis:</em> {permitBasis}
              </span>
              {!editingPermitBasis ? (
                <button
                  type="button"
                  className="btn-mini ghost seig-permit-edit-btn"
                  onClick={() => setEditingPermitBasis(true)}
                  title="Edit permit fee basis note for printing"
                >
                  <Edit2 size={11} /> Edit note
                </button>
              ) : (
                <div className="seig-permit-basis-edit">
                  <input
                    type="text"
                    className="seig-inline-input"
                    value={draftPermitBasis}
                    onChange={(e) => setDraftPermitBasis(e.target.value)}
                    placeholder={PERMIT_GO_REFERENCE}
                  />
                  <button type="button" className="btn-mini secondary" onClick={() => void handleSavePermitBasis()}>
                    <Check size={12} /> Save
                  </button>
                  {project?.seignioragePrintOverrides?.permitBasis && (
                    <button type="button" className="btn-mini ghost" onClick={() => void handleResetPermitBasis()} title="Reset to default GO note">
                      <RotateCcw size={12} /> Reset
                    </button>
                  )}
                  <button type="button" className="btn-mini ghost" onClick={() => setEditingPermitBasis(false)}>
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
          <SignatureFooterCard scopeKey={SEIGNIORAGE_SIGNATURE_SCOPE} />
        </section>
      </div>
      {printPreviewOpen && project && (
        <SeignioragePrintPreview
          typstSource={printTypstSource}
          compileInputs={compileInputs}
          year={project.meta.sorYear ?? ''}
          onClose={() => setPrintPreviewOpen(false)}
        />
      )}
      {printStudioOpen && project && (
        <EEstimatePrintStudio
          scopeKey={'seigniorage-statement'}
          title="Seigniorage Statement"
          subtitle="Seigniorage Code & Layout Studio"
          defaultTypstSource={defaultTypstSource}
          savedTypstSource={project.printStudioDocuments?.['seigniorage-statement']}
          compileInputs={compileInputs}
          compilePrelude={project.printStudioDocuments?.['seigniorage-statement'] !== undefined ? EE_GROUP_TABLE_PRELUDE : ''}
          runtimeData={buildSeigniorageRenderData(project, calc)}
          projectDocumentSettings={projectDocumentSettings}
          savedDocumentSettings={project.printStudioDocumentSettings?.['seigniorage-statement']}
          onSave={async (source, settings) => {
            updatePrintStudioDocument('seigniorage-statement', source, settings)
            await useStore.getState().saveProject({ requireSaved: true })
          }}
          onClose={() => setPrintStudioOpen(false)}
        />
      )}
    </div>
  )
}

function SeigniorageTableRow({
  row,
  slNo,
  project,
  onUpdateDescription
}: {
  row: SeigniorageItemRow
  slNo: number
  project: import('../../types/project').EestimateProject | null
  onUpdateDescription: (rowId: string, customText: string | null) => Promise<void>
}): JSX.Element {
  const needsRate = row.charge === null || row.seigRate === null
  const needsConversion = row.conversionRequired === true
  const needsReview = row.status === 'REVIEW_REQUIRED' || needsConversion
  const currentPrintDesc = resolveSeigniorageRowDescription(project, row)
  const hasCustomDesc = Boolean(project?.seignioragePrintOverrides?.rowDescriptions?.[row.id]?.trim())
  const [isEditingDesc, setIsEditingDesc] = useState(false)
  const [draftDesc, setDraftDesc] = useState(currentPrintDesc)

  useEffect(() => {
    setDraftDesc(currentPrintDesc)
  }, [currentPrintDesc])

  return (
    <div className={`seig-calc-tbody-row ${needsRate || needsReview ? 'needs-rate' : ''}`}>
      <span className="scol-sl">{slNo}</span>
      <span className="scol-desc">
        {isEditingDesc ? (
          <div className="seig-desc-edit-row">
            <input
              type="text"
              className="seig-desc-input"
              value={draftDesc}
              autoFocus
              onChange={(e) => setDraftDesc(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  void onUpdateDescription(row.id, draftDesc.trim() || null)
                  setIsEditingDesc(false)
                } else if (e.key === 'Escape') {
                  setIsEditingDesc(false)
                }
              }}
            />
            <button
              type="button"
              className="btn-mini secondary"
              title="Save description"
              onClick={() => {
                void onUpdateDescription(row.id, draftDesc.trim() || null)
                setIsEditingDesc(false)
              }}
            >
              <Check size={12} /> Save
            </button>
            <button
              type="button"
              className="btn-mini ghost"
              title="Cancel"
              onClick={() => setIsEditingDesc(false)}
            >
              <X size={12} />
            </button>
          </div>
        ) : (
          <div className="seig-desc-display-row">
            <span className="seig-desc-text">{currentPrintDesc}</span>
            <div className="seig-desc-actions">
              <button
                type="button"
                className="btn-mini ghost seig-desc-edit-btn"
                onClick={() => {
                  setDraftDesc(currentPrintDesc)
                  setIsEditingDesc(true)
                }}
                title="Edit description for statement print"
              >
                <Edit2 size={11} />
              </button>
              {hasCustomDesc && (
                <button
                  type="button"
                  className="btn-mini ghost seig-desc-reset-btn"
                  onClick={() => void onUpdateDescription(row.id, null)}
                  title="Reset description to default SOR format"
                >
                  <RotateCcw size={11} />
                </button>
              )}
            </div>
            {hasCustomDesc && <span className="seig-custom-pill">Edited</span>}
          </div>
        )}
        {row.itemCode === 'IRR-CAW-7-27' && (
          <SlabThicknessControl row={row} />
        )}
        {needsReview && (
          <small className="seig-review-badge">
            <AlertTriangle size={10} /> {needsConversion ? 'Conversion Required' : 'Review Required'}
          </small>
        )}
      </span>
      <span className="scol-total-qty">
        {row.itemQuantity != null ? `${qtyFmt.format(row.itemQuantity)} ${row.itemUnit || row.unit}` : '-'}
      </span>
      <span className="scol-seig-qty">{seigniorageQtyText(row)}</span>
      <span className="scol-rate">
        {row.seigRate != null ? `Rs. ${rateFmt.format(row.seigRate)}` : '-'}
      </span>
      <span className="scol-seig">
        {row.seigniorage != null
          ? `Rs. ${money.format(row.seigniorage)}`
          : needsConversion
            ? 'Conversion required'
            : 'Set rate'}
      </span>
      <span className="scol-dmft">
        {row.dmft != null ? `Rs. ${money.format(row.dmft)}` : '-'}
      </span>
      <span className="scol-smft">
        {row.smft != null ? `Rs. ${money.format(row.smft)}` : '-'}
      </span>
      <span className="scol-permit">
        {row.permit != null ? (
          <>
            Rs. {money.format(row.permit)}
            <small className="scol-permit-pct">
              {row.permitPercent === 0 ? 'Exempt' : `@ ${row.permitPercent}%`}
            </small>
          </>
        ) : (
          '-'
        )}
      </span>
    </div>
  )
}

function SlabThicknessControl({ row }: { row: SeigniorageItemRow }): JSX.Element {
  const setThickness = useStore((state) => state.setSeigniorageSlabThickness)
  const [draft, setDraft] = useState(row.slabThicknessMm?.toString() ?? '')
  useEffect(() => {
    setDraft(row.slabThicknessMm?.toString() ?? '')
  }, [row.slabThicknessMm])

  const commit = (): void => {
    const parsed = Number(draft)
    setThickness(row.itemNodeId, Number.isFinite(parsed) && parsed >= 25 && parsed <= 40 ? parsed : null)
  }

  return (
    <label className="seig-thickness-control">
      <span>Adopted slab thickness</span>
      <input
        type="number"
        min={25}
        max={40}
        step={1}
        value={draft}
        placeholder="25–40"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
        }}
      />
      <span>mm</span>
      {row.slabThicknessMm != null && row.quantityRatio != null && (
        <small>
          {factorFmt.format(row.quantityRatio * row.slabThicknessMm / 1000)} CUM/SQM
        </small>
      )}
    </label>
  )
}

function modeLabel(mode: string): string {
  if (mode === 'FULL_ITEM_QUANTITY') return 'Full Qty'
  if (mode === 'DIRECT_RECIPE_QTY') return 'Recipe Qty'
  if (mode === 'ADDON_MATERIAL_RATIO') return 'Selected Add-on'
  return ''
}

function TotalRow({ label, calc }: { label: string; calc: SeigniorageCalculation }): JSX.Element {
  return (
    <div className="seig-calc-total">
      <span className="scol-sl"></span>
      <span className="scol-desc">
        <strong>{label}</strong>
      </span>
      <span className="scol-total-qty"></span>
      <span className="scol-seig-qty"></span>
      <span className="scol-rate"></span>
      <span className="scol-seig">Rs. {money.format(calc.totalSeigniorage)}</span>
      <span className="scol-dmft">Rs. {money.format(calc.totalDmft)}</span>
      <span className="scol-smft">Rs. {money.format(calc.totalSmft)}</span>
      <span className="scol-permit">Rs. {money.format(calc.totalPermit)}</span>
    </div>
  )
}

function RoundingRow({ calc }: { calc: SeigniorageCalculation }): JSX.Element | null {
  if (
    calc.roundedSeigniorage === calc.totalSeigniorage &&
    calc.roundedDmft === calc.totalDmft &&
    calc.roundedSmft === calc.totalSmft &&
    calc.roundedPermit === calc.totalPermit
  ) {
    return null
  }
  return (
    <div className="seig-calc-rounding">
      <span className="scol-sl"></span>
      <span className="scol-desc">
        <strong>Rounding off</strong>
      </span>
      <span className="scol-total-qty"></span>
      <span className="scol-seig-qty"></span>
      <span className="scol-rate"></span>
      <span className="scol-seig">Rs. {intFmt.format(calc.roundedSeigniorage)}</span>
      <span className="scol-dmft">Rs. {intFmt.format(calc.roundedDmft)}</span>
      <span className="scol-smft">Rs. {intFmt.format(calc.roundedSmft)}</span>
      <span className="scol-permit">Rs. {intFmt.format(calc.roundedPermit)}</span>
    </div>
  )
}

function seigniorageQtyText(row: SeigniorageItemRow): string {
  if (row.conversionRequired) return 'Conversion required'
  const mode = row.mode
  if (mode === 'FULL_ITEM_QUANTITY') {
    return row.itemQuantity != null ? `${qtyFmt.format(row.itemQuantity)} ${row.itemUnit || row.unit}` : '-'
  }
  if (mode === 'DIRECT_RECIPE_QTY') {
    return row.recipeMaterialQty != null
      ? `${qtyFmt.format(row.recipeMaterialQty)} ${row.recipeMaterialUnit || row.unit}`
      : 'Review'
  }
  // RECIPE_MATERIAL_RATIO (default)
  if (row.itemQuantity == null || row.quantityRatio == null) return '-'
  const parts = [
    qtyFmt.format(row.itemQuantity),
    factorFmt.format(row.quantityRatio)
  ]
  if (row.conversionFactor != null && row.conversionFactor !== 1) {
    parts.push(factorFmt.format(row.conversionFactor))
  }
  const seigQty = row.quantity
  const result = seigQty != null ? `${qtyFmt.format(seigQty)} ${row.unit}` : '—'
  return `${parts.join(' × ')} = ${result}`
}

function groupRowsByMaterial(rows: SeigniorageItemRow[]): MaterialGroup[] {
  const groups = new Map<string, MaterialGroup>()
  for (const row of rows) {
    if (!row.materialKey && !row.charge && row.seigRate === null) continue
    const key = row.materialKey || row.materialLabel || row.charge?.seig_code || 'UNASSIGNED'
    const label = row.materialLabel || row.charge?.mineral_name || 'Unassigned'
    const group =
      groups.get(key) ??
      {
        key,
        label,
        rows: [],
        totalSeigniorage: 0,
        totalDmft: 0,
        totalSmft: 0,
        totalPermit: 0
      }
    group.rows.push(row)
    group.totalSeigniorage += row.seigniorage ?? 0
    group.totalDmft += row.dmft ?? 0
    group.totalSmft += row.smft ?? 0
    group.totalPermit += row.permit ?? 0
    groups.set(key, group)
  }
  return Array.from(groups.values()).sort((a, b) => a.label.localeCompare(b.label))
}

function calcForRows(rows: SeigniorageItemRow[]): SeigniorageCalculation {
  const totalSeigniorage = rows.reduce((sum, row) => sum + (row.seigniorage ?? 0), 0)
  const totalDmft = rows.reduce((sum, row) => sum + (row.dmft ?? 0), 0)
  const totalSmft = rows.reduce((sum, row) => sum + (row.smft ?? 0), 0)
  const totalPermit = rows.reduce((sum, row) => sum + (row.permit ?? 0), 0)
  const grandTotal = totalSeigniorage + totalDmft + totalSmft + totalPermit
  return {
    rows,
    totalSeigniorage,
    totalDmft,
    totalSmft,
    totalPermit,
    grandTotal,
    roundedSeigniorage: Math.round(totalSeigniorage),
    roundedDmft: Math.round(totalDmft),
    roundedSmft: Math.round(totalSmft),
    roundedPermit: Math.round(totalPermit),
    roundedGrandTotal: Math.round(grandTotal)
  }
}

function emptyCalc(): SeigniorageCalculation {
  return calcForRows([])
}
