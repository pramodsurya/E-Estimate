import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  Eye,
  Gem,
  LayoutDashboard,
  Printer,
  RefreshCw,
  Search,
  X
} from 'lucide-react'
import {
  computeSeigniorageTable,
  permitPercentFor,
  type SeigniorageCalculation,
  type SeigniorageCharge,
  type SeigniorageItemRow
} from '../../lib/seigniorage'
import type { SeigniorageApplicabilityPolicy } from '../../types/rateAnalysis'
import { useStore } from '../../store/useStore'
import SeignioragePrintPreviewModal, {
  SeignioragePrintPages
} from './SeignioragePrintPreviewModal'
import {
  dashboardContextMatches,
  syncSeigniorageDashboardSnapshot
} from '../../lib/dashboardSync'
import SignatureFooterCard from '../signature/SignatureFooterCard'
import {
  SEIGNIORAGE_SIGNATURE_SCOPE,
  resolveSignatureFooter
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
  const selection = useStore((state) => state.seigniorageSelection)
  const project = useStore((state) => state.project)
  const seignioragePrintSettings = useStore((state) => state.project?.seignioragePrintSettings)
  const updateSeignioragePrintSettings = useStore((state) => state.updateSeignioragePrintSettings)
  const setDashboardSnapshot = useStore((state) => state.setDashboardSnapshot)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')
  const [printPreviewOpen, setPrintPreviewOpen] = useState(false)
  const [printView, setPrintView] = useState(false)
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
  const signatureFooter = project
    ? resolveSignatureFooter(project, SEIGNIORAGE_SIGNATURE_SCOPE)
    : undefined

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
          {!selectedMaterialKey && (
            <button className="btn ghost" disabled={loading} onClick={() => void syncDashboard()}>
              <RefreshCw size={15} /> {loading ? 'Syncing…' : 'Sync'}
            </button>
          )}
          <button className="btn ghost" onClick={() => setPrintPreviewOpen(true)}>
            <Printer size={15} /> Print Preview
          </button>
          <button className="btn ghost" onClick={() => setPrintView((value) => !value)}>
            {printView ? <LayoutDashboard size={15} /> : <Eye size={15} />}
            {printView ? 'Dashboard View' : 'View Print View'}
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

      {printView ? (
        <div className="aggregate-inline-print">
          <SeignioragePrintPages
            calc={calc}
            projectName={project?.meta?.name ?? 'Untitled'}
            printSettings={seignioragePrintSettings}
            signatureFooter={signatureFooter}
          />
        </div>
      ) : (
        <>
      <SignatureFooterCard scopeKey={SEIGNIORAGE_SIGNATURE_SCOPE} />
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
              <div className="dash-eyebrow">Seigniorage Calculation</div>
              <h2>{selectedGroup?.label ?? 'All materials'}</h2>
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
                  <SeigniorageTableRow key={row.id} row={row} slNo={index + 1} />
                ))}
                <TotalRow
                  label="TOTAL"
                  calc={calcForRows(filteredRows)}
                />
                <RoundingRow
                  calc={calcForRows(filteredRows)}
                />
              </>
            )}
          </div>
        </section>
      </div>
        </>
      )}

      {printPreviewOpen && (
        <SeignioragePrintPreviewModal
          calc={calc}
          projectName={project?.meta?.name ?? 'Untitled'}
          printSettings={seignioragePrintSettings}
          signatureFooter={signatureFooter}
          onUpdatePrintSettings={updateSeignioragePrintSettings}
          onClose={() => setPrintPreviewOpen(false)}
        />
      )}
    </div>
  )
}

function SeigniorageTableRow({ row, slNo }: { row: SeigniorageItemRow; slNo: number }): JSX.Element {
  const needsRate = row.charge === null || row.seigRate === null
  const needsConversion = row.conversionRequired === true
  const needsReview = row.status === 'REVIEW_REQUIRED' || needsConversion
  const materialLine = [row.materialLabel, row.recipeMaterialDesc].filter(Boolean).join(' - ')
  return (
    <div className={`seig-calc-tbody-row ${needsRate || needsReview ? 'needs-rate' : ''}`}>
      <span className="scol-sl">{slNo}</span>
      <span className="scol-desc">
        <strong>{row.itemCode}</strong>
        <span>{row.description}</span>
        {materialLine && <small>{materialLine}</small>}
        {row.mode && row.mode !== 'RECIPE_MATERIAL_RATIO' && (
          <small className="seig-mode-tag">{modeLabel(row.mode)}</small>
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
            <small className="scol-permit-pct">@ {row.permitPercent}%</small>
          </>
        ) : (
          '-'
        )}
      </span>
    </div>
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
    rateFmt.format(row.quantityRatio)
  ]
  if (row.conversionFactor != null && row.conversionFactor !== 1) {
    parts.push(rateFmt.format(row.conversionFactor))
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
