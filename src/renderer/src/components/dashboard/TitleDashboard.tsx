import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import {
  ChevronRight,
  FilePlus2,
  Gem,
  Landmark,
  Layers3,
  ListPlus,
  MapPin,
  Pencil,
  Eye,
  LayoutDashboard,
  Plus,
  RefreshCw,
  ReceiptIndianRupee,
  ScrollText,
  Settings,
  ShieldCheck,
  Trash2
} from 'lucide-react'
import { useStore } from '../../store/useStore'
import type { ProjectNode } from '../../types/project'
import type { RateAnalysisRecipe } from '../../types/rateAnalysis'
import { ProjectDetailsForm } from '../newproject/NewProjectForm'
import Modal from '../modals/Modal'
import { NodeIcon } from '../nodeVisual'
import { computeProjectPrintInputs } from '../../lib/projectPrintInputs'
import type { AbstractLine } from '../../lib/projectAbstract'
import {
  dashboardComponentCompileSignature,
  dashboardContextMatches,
  dashboardDataCompileSignature,
  dashboardItemIsSynced,
  dashboardItemsSignature,
  dashboardLeadCompileSignature,
  syncProjectDashboardSnapshot
} from '../../lib/dashboardSync'
import { resolveTemplateDashboardMaterials } from '../../lib/templateDashboardSync'
import SignatureFooterCard from '../signature/SignatureFooterCard'
import { PROJECT_SIGNATURE_SCOPE } from '../../lib/signatureFooter'

const ProjectPrintView = lazy(() => import('../print/ProjectPrintView'))

const money = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const estimateMoney = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })
const percent = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Keep the last successful Dashboard grand total available to the Front Cover. */
function EstimateCostSync({ value }: { value: number | null }): null {
  const current = useStore((state) => state.project?.meta.estimatedCost)
  const updateMeta = useStore((state) => state.updateMeta)

  useEffect(() => {
    if (value === null || !Number.isFinite(value)) return
    if (typeof current === 'number' && Math.abs(current - value) < 0.005) return
    updateMeta({ estimatedCost: value })
  }, [current, updateMeta, value])

  return null
}

function collectItems(node: ProjectNode): ProjectNode[] {
  const items: ProjectNode[] = []
  const visit = (current: ProjectNode): void => {
    if (current.kind === 'item') items.push(current)
    else current.children.forEach(visit)
  }
  node.children.forEach(visit)
  return items
}

function collectComponentDashboards(node: ProjectNode): ProjectNode[] {
  const dashboards: ProjectNode[] = []
  const visit = (current: ProjectNode): void => {
    if (current.kind === 'component' || current.kind === 'subcomponent') {
      dashboards.push(current)
    }
    current.children.forEach(visit)
  }
  node.children.forEach(visit)
  return dashboards
}

export default function TitleDashboard(): JSX.Element | null {
  const [editingProject, setEditingProject] = useState(false)
  const [printView, setPrintView] = useState(false)
  const [miscOpen, setMiscOpen] = useState(false)
  const [earthworkOpen, setEarthworkOpen] = useState(false)
  const [miscName, setMiscName] = useState('')
  const [miscCost, setMiscCost] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const project = useStore((state) => state.project)
  const addComponent = useStore((state) => state.addComponent)
  const openAddPage = useStore((state) => state.openAddPage)
  const select = useStore((state) => state.select)
  const openSettings = useStore((state) => state.openSettings)
  const openSeigniorage = useStore((state) => state.openSeigniorage)
  const updateMeta = useStore((state) => state.updateMeta)
  const updateChargeSettings = useStore((state) => state.updateChargeSettings)
  const updateProjectPrintSettings = useStore((state) => state.updateProjectPrintSettings)
  const addMiscellaneousItem = useStore((state) => state.addMiscellaneousItem)
  const removeMiscellaneousItem = useStore((state) => state.removeMiscellaneousItem)
  const setEarthworkOverride = useStore((state) => state.setEarthworkOverride)
  const setDashboardSnapshot = useStore((state) => state.setDashboardSnapshot)
  const setGuideWallMaterial = useStore((state) => state.setGuideWallMaterial)
  const resolveBundMaterials = useStore((state) => state.resolveBundMaterials)

  const allItems = useMemo(() => (project ? collectItems(project.root) : []), [project?.root])
  const componentDashboards = useMemo(
    () => (project ? collectComponentDashboards(project.root) : []),
    [project?.root]
  )

  if (!project) return null

  const { meta, root } = project
  const pages = root.children.filter((child) => child.kind === 'page')
  const snapshotValid = dashboardContextMatches(project.dashboardSnapshot, project)
  const snapshot = snapshotValid ? project.dashboardSnapshot : undefined
  const dashboardReady =
    snapshotValid &&
    Boolean(snapshot?.projectSyncedAt) &&
    snapshot?.projectItemsSignature === dashboardItemsSignature(allItems) &&
    snapshot?.dataCompileSignature === dashboardDataCompileSignature(project, allItems) &&
    snapshot?.leadCompileSignature === dashboardLeadCompileSignature(project) &&
    Boolean(snapshot?.seigniorageSyncedAt) &&
    allItems.every((item) => dashboardItemIsSynced(snapshot, item)) &&
    componentDashboards.every((component) => {
      const componentItems = collectItems(component)
      return (
        Boolean(snapshot?.componentSyncedAt?.[component.id]) &&
        typeof snapshot?.componentTotals?.[component.id] === 'number' &&
        snapshot?.componentCompileSignatures?.[component.id] ===
          dashboardComponentCompileSignature(project, componentItems)
      )
    })
  // Shared with the View Print View and the PDF export, so all three agree.
  const printInputs = computeProjectPrintInputs(project, allItems)
  const {
    recipes,
    rateOf,
    seigniorage,
    abstract,
    itemRows,
    earthworkCost,
    earthworkPercent,
    earthworkPredominant,
    gstRate,
    gstRule,
    labourCessPercent,
    nacPercent
  } = printInputs

  const syncDashboard = async (): Promise<void> => {
    if (loading) return
    setLoading(true)
    setLoadError(null)
    try {
      await resolveTemplateDashboardMaterials(project.root, {
        setGuideWallMaterial,
        resolveBundMaterials
      })
      const current = useStore.getState().project
      if (!current || current.id !== project.id) return
      const currentItems = collectItems(current.root)
      const next = await syncProjectDashboardSnapshot(current, currentItems)
      if (useStore.getState().project?.id === current.id) {
        setDashboardSnapshot(next)
      }
    } catch (error: unknown) {
      setLoadError(error instanceof Error ? error.message : String(error))
    } finally {
      setLoading(false)
    }
  }

  const taxSettings = meta.taxSettings ?? {
    mode: 'automatic' as const,
    recipientType: 'CENTRAL_STATE_UT_LOCAL' as const
  }
  const printSettings = printInputs.settings

  const chargeAmount = (key: string): number =>
    abstract.chargeLines.find((line) => line.key === key)?.amount ?? 0

  const costedItems = itemRows.filter((row) => row.final.amount !== null).length
  const zoneLabel =
    meta.sorZone === 'zone_1' ? 'Zone I' : meta.sorZone === 'zone_2' ? 'Zone II' : 'Zone III'

  const setTaxMode = (mode: 'automatic' | 'manual', manualRate?: 12 | 18): void => {
    updateMeta({ taxSettings: { ...taxSettings, mode, manualRate } })
  }

  const addMisc = (): void => {
    const cost = Number(miscCost)
    if (!miscName.trim() || !Number.isFinite(cost) || cost < 0) return
    addMiscellaneousItem({ name: miscName, cost })
    setMiscName('')
    setMiscCost('')
    setMiscOpen(false)
  }

  return (
    <div className="dashboard project-dashboard">
      <EstimateCostSync
        value={dashboardReady && !loading && !loadError ? abstract.grandTotal : null}
      />
      <div className="project-hero">
        <div className="project-identity">
          <div className="dash-eyebrow">Project dashboard</div>
          <h1 className="dash-title">
            <NodeIcon node={root} size={23} /> {meta.name || root.name}
          </h1>
          <div className="project-meta-chips">
            <span>{meta.sorYear || 'Year not set'}</span>
            {meta.sorYear === '2026-27' && <span>{zoneLabel}</span>}
            <span>{meta.areaAllowancePercent ?? 0}% area allowance</span>
            <span>{abstract.componentLines.length} component(s)</span>
            <span>{allItems.length} DATA</span>
            {dashboardReady && snapshot?.projectSyncedAt && (
              <span>Synced {new Date(snapshot.projectSyncedAt).toLocaleString()}</span>
            )}
          </div>
        </div>
        <div className="dash-actions">
          <button
            className="btn ghost"
            disabled={loading}
            title="Refresh and store all dashboard data"
            onClick={() => void syncDashboard()}
          >
            <RefreshCw size={15} /> {loading ? 'Syncing…' : 'Sync'}
          </button>
          <button className="btn ghost" onClick={() => setEditingProject(true)}>
            <Pencil size={15} /> Edit Project
          </button>
          <button className="btn ghost" onClick={() => openAddPage(root.id)}>
            <FilePlus2 size={15} /> Add Page
          </button>
          <button className="btn ghost" onClick={() => setPrintView((value) => !value)}>
            {printView ? <LayoutDashboard size={15} /> : <Eye size={15} />}
            {printView ? 'Dashboard View' : 'View Print View'}
          </button>
          <button className="btn" onClick={() => addComponent()}>
            <Plus size={15} /> Add Component
          </button>
          <button
            className="btn ghost icon-only"
            title="Project settings"
            onClick={() => openSettings(root.id)}
          >
            <Settings size={15} />
          </button>
        </div>
      </div>

      {printView ? (
        <Suspense fallback={<div className="workarea-loading">Loading print view…</div>}>
          <ProjectPrintView
            project={project}
            abstract={abstract}
            seigniorage={seigniorage}
            settings={printSettings}
            rateOf={rateOf}
            recipes={recipes}
          />
        </Suspense>
      ) : (
        <>
      {loadError && (
        <div className="project-load-warning">Dashboard sync failed: {loadError}</div>
      )}
      {!dashboardReady && !loadError && (
        <div className="project-load-warning">
          Dashboard data has not been synced for the current SOR settings. Click Sync to populate it.
        </div>
      )}
      <SignatureFooterCard scopeKey={PROJECT_SIGNATURE_SCOPE} />

      <section className="project-total-panel">
        <div>
          <span className="project-total-label">Estimated project cost including GST</span>
          <strong>₹ {estimateMoney.format(abstract.grandTotal)}</strong>
          <small>
            {loading
              ? 'Syncing dashboard data…'
              : !dashboardReady
                ? 'Not synced'
              : `${costedItems} of ${allItems.length} DATA item(s) costed`}
          </small>
        </div>
        <div className="project-total-breakdown">
          <CostMetric
            label="Components total"
            value={abstract.componentsTotal}
            icon={<Layers3 size={17} />}
          />
          <CostMetric
            label="Statutory charges"
            value={abstract.chargesTotal}
            icon={<Landmark size={17} />}
          />
          <CostMetric
            label="Miscellaneous"
            value={abstract.miscellaneousTotal}
            icon={<ListPlus size={17} />}
          />
          <CostMetric
            label={`GST @ ${gstRate}%`}
            value={abstract.gstAmount}
            icon={<ReceiptIndianRupee size={17} />}
            accent
          />
        </div>
      </section>

      {/* One card per charge, as they appear in the General Abstract. */}
      <section className="charge-card-grid">
        <ChargeCard
          label="Seigniorage"
          value={chargeAmount('seigniorage')}
          note="From the Seigniorage dashboard"
          icon={<Gem size={15} />}
          onOpen={() => openSeigniorage()}
        />
        <ChargeCard
          label="DMF 30%"
          value={chargeAmount('dmf')}
          note="30% of seigniorage"
          icon={<Gem size={15} />}
          onOpen={() => openSeigniorage()}
        />
        <ChargeCard
          label="SMET 2%"
          value={chargeAmount('smet')}
          note="2% of seigniorage"
          icon={<Gem size={15} />}
          onOpen={() => openSeigniorage()}
        />
        <ChargeCard
          label="Permit fee"
          value={chargeAmount('permit')}
          note="Multiple of seigniorage (G.O.)"
          icon={<Gem size={15} />}
          onOpen={() => openSeigniorage()}
        />
        <ChargeCard
          label="NAC"
          value={chargeAmount('nac')}
          note="of components total"
          icon={<Landmark size={15} />}
          percentValue={nacPercent}
          onPercentChange={(value) => updateChargeSettings({ nacPercent: value })}
        />
        <ChargeCard
          label="Labour Cess"
          value={chargeAmount('labour-cess')}
          note="of components total"
          icon={<Landmark size={15} />}
          percentValue={labourCessPercent}
          onPercentChange={(value) => updateChargeSettings({ labourCessPercent: value })}
        />
        <ChargeCard
          label="Miscellaneous"
          value={abstract.miscellaneousTotal}
          note={`${abstract.miscellaneousLines.length} row(s) added`}
          icon={<ListPlus size={15} />}
          onOpen={() => setMiscOpen(true)}
        />
        <ChargeCard
          label={`GST @ ${gstRate}%`}
          value={abstract.gstAmount}
          note={earthworkPredominant ? 'Predominant earthwork' : 'General works'}
          icon={<ReceiptIndianRupee size={15} />}
          accent
        />
      </section>

      {/* The printed General Abstract, live. */}
      <section className="project-panel general-abstract-panel">
        <div className="project-panel-heading">
          <div>
            <span className="project-kicker">Full project</span>
            <h2>
              <ScrollText size={18} /> General Abstract
            </h2>
          </div>
          <button className="btn ghost" onClick={() => addComponent()}>
            <Plus size={14} /> Add Component
          </button>
        </div>
        <div className="general-abstract">
          <div className="ga-head">
            <span className="ga-sl">Sl. No.</span>
            <span className="ga-desc">Item of Work</span>
            <span className="ga-amount">Amount</span>
          </div>
          {abstract.componentLines.length === 0 && (
            <div className="ga-empty">
              No components yet. Add a component to start the abstract.
            </div>
          )}
          {abstract.lines.map((line) => (
            <AbstractRow
              key={line.key}
              line={line}
              onOpen={line.nodeId ? () => select(line.nodeId as string) : undefined}
            />
          ))}
        </div>
        {pages.length > 0 && (
          <div className="project-pages-note">{pages.length} project page(s) are also attached.</div>
        )}
      </section>

      <div className="project-main-grid">
        <section className="project-panel tax-panel">
          <div className="project-panel-heading">
            <div>
              <span className="project-kicker">GST decision</span>
              <h2>
                <ShieldCheck size={18} /> Tax slab
              </h2>
            </div>
            <span className={`decision-badge ${earthworkPredominant ? 'qualifies' : ''}`}>
              {earthworkPredominant ? 'Predominant earthwork' : 'General works'}
            </span>
          </div>
          <div className="earthwork-summary">
            <div>
              <span>Earthwork DATA cost</span>
              <strong>₹ {money.format(earthworkCost)}</strong>
            </div>
            <div>
              <span>Share of DATA work cost</span>
              <strong>{percent.format(earthworkPercent)}%</strong>
            </div>
          </div>
          <div className="threshold-track">
            <div style={{ width: `${Math.min(100, earthworkPercent)}%` }} />
            <i style={{ left: '75%' }} />
          </div>
          <div className="threshold-caption">
            <span>0%</span>
            <span>More than 75% required</span>
            <span>100%</span>
          </div>
          <div className="tax-controls">
            <button
              className={taxSettings.mode === 'automatic' ? 'active' : ''}
              onClick={() => setTaxMode('automatic')}
            >
              Automatic <small>{gstRule?.ratePct ?? 18}% from Supabase</small>
            </button>
            <button
              className={taxSettings.mode === 'manual' && gstRate === 12 ? 'active' : ''}
              onClick={() => setTaxMode('manual', 12)}
            >
              Manual 12%
            </button>
            <button
              className={taxSettings.mode === 'manual' && gstRate === 18 ? 'active' : ''}
              onClick={() => setTaxMode('manual', 18)}
            >
              Manual 18%
            </button>
          </div>
          <label className="recipient-field">
            <span>Service recipient classification</span>
            <select
              className="select-input"
              value={taxSettings.recipientType}
              onChange={(event) =>
                updateMeta({
                  taxSettings: {
                    ...taxSettings,
                    recipientType: event.target.value as typeof taxSettings.recipientType
                  }
                })
              }
            >
              <option value="CENTRAL_STATE_UT_LOCAL">
                Central / State / UT / Local Authority
              </option>
              <option value="GOVT_ENTITY_OR_AUTHORITY">Government Entity / Authority</option>
            </select>
          </label>
          <div className="tax-rule-note">
            <ShieldCheck size={15} />
            <span>
              {gstRule?.description ?? 'Using the default general construction service rate.'}
              {gstRule?.notificationRef ? ` · ${gstRule.notificationRef}` : ''}
            </span>
          </div>
          <button className="btn ghost review-data-btn" onClick={() => setEarthworkOpen(true)}>
            Review earthwork DATA classification <ChevronRight size={15} />
          </button>
        </section>

        <section className="project-panel miscellaneous-panel">
          <div className="project-panel-heading">
            <div>
              <span className="project-kicker">Project additions</span>
              <h2>
                <ListPlus size={18} /> Miscellaneous
              </h2>
            </div>
            <button className="btn ghost" onClick={() => setMiscOpen(true)}>
              <Plus size={14} /> Add Item
            </button>
          </div>
          {(project.miscellaneousItems ?? []).length ? (
            <div className="misc-list">
              {(project.miscellaneousItems ?? []).map((item) => (
                <div key={item.id}>
                  <span>{item.name}</span>
                  <strong>₹ {money.format(item.cost)}</strong>
                  <button title="Remove" onClick={() => removeMiscellaneousItem(item.id)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <ChargeRow
                label="Miscellaneous total"
                value={abstract.miscellaneousTotal}
                total
              />
            </div>
          ) : (
            <div className="empty-project-card">
              Add named project costs that are not part of DATA.
            </div>
          )}
        </section>

        <section className="project-panel seigniorage-panel-card">
          <div className="project-panel-heading">
            <div>
              <span className="project-kicker">Statutory charges</span>
              <h2>
                <Landmark size={18} /> Seigniorage
              </h2>
            </div>
            <strong>₹ {money.format(seigniorage.grandTotal)}</strong>
          </div>
          <ChargeRow label="Seigniorage charge" value={seigniorage.totalSeigniorage} />
          <ChargeRow label="DMF (30%)" value={seigniorage.totalDmft} />
          <ChargeRow label="SMET (2%)" value={seigniorage.totalSmft} />
          <ChargeRow label="Permit fee" value={seigniorage.totalPermit} />
          <ChargeRow label="Total statutory charge" value={seigniorage.grandTotal} total />
          <button className="btn ghost full-width" onClick={() => openSeigniorage()}>
            Open calculation details <ChevronRight size={15} />
          </button>
        </section>

        <section className="project-panel allowance-location-panel">
          <div className="project-panel-heading">
            <div>
              <span className="project-kicker">Project basis</span>
              <h2>
                <MapPin size={18} /> Location &amp; allowance
              </h2>
            </div>
            <strong>{meta.areaAllowancePercent ?? 0}%</strong>
          </div>
          <div className="location-copy">
            {meta.location?.label ||
              (meta.location
                ? `${meta.location.lat.toFixed(6)}, ${meta.location.lng.toFixed(6)}`
                : 'Location not set')}
          </div>
          <ChargeRow label="Area classification" text={meta.areaAllowanceLabel ?? 'None'} />
          <ChargeRow label="Mapped village" text={meta.areaAllowance?.village ?? '—'} />
          <ChargeRow label="Rule year" text={meta.areaAllowance?.ruleYear ?? meta.sorYear} />
          <button className="btn ghost full-width" onClick={() => setEditingProject(true)}>
            <Pencil size={14} /> Edit project basis
          </button>
        </section>
      </div>
        </>
      )}

      {editingProject && (
        <Modal title="Edit Project" size="lg" onClose={() => setEditingProject(false)}>
          <ProjectDetailsForm
            mode="edit"
            initialMeta={meta}
            onSaved={() => setEditingProject(false)}
          />
        </Modal>
      )}
      {miscOpen && (
        <Modal
          title="Add Miscellaneous Item"
          onClose={() => setMiscOpen(false)}
          footer={
            <>
              <button className="btn ghost" onClick={() => setMiscOpen(false)}>
                Cancel
              </button>
              <button
                className="btn"
                disabled={
                  !miscName.trim() || !Number.isFinite(Number(miscCost)) || Number(miscCost) < 0
                }
                onClick={addMisc}
              >
                <Plus size={14} /> Add Item
              </button>
            </>
          }
        >
          <div className="field">
            <label className="field-label">Item name</label>
            <input
              className="text-input"
              autoFocus
              value={miscName}
              onChange={(event) => setMiscName(event.target.value)}
              placeholder="e.g. Testing charges"
            />
          </div>
          <div className="field">
            <label className="field-label">Cost (₹)</label>
            <input
              className="text-input"
              type="number"
              min="0"
              step="0.01"
              value={miscCost}
              onChange={(event) => setMiscCost(event.target.value)}
              placeholder="0.00"
              onKeyDown={(event) => {
                if (event.key === 'Enter') addMisc()
              }}
            />
          </div>
        </Modal>
      )}
      {earthworkOpen && (
        <Modal title="Review Earthwork DATA" size="lg" onClose={() => setEarthworkOpen(false)}>
          <p className="earthwork-modal-intro">
            Automatic classification comes from Supabase DATA metadata and description. Override
            only where the engineering classification requires it.
          </p>
          <div className="earthwork-review-list">
            {itemRows.map((row) => {
              const override = project.earthworkOverrides?.[row.key]
              return (
                <div key={row.node.id}>
                  <div>
                    <strong>{row.node.itemCode ?? row.node.name}</strong>
                    <span>{row.node.itemDescription ?? row.node.name}</span>
                    <small>{row.classification.reason}</small>
                  </div>
                  <span>₹ {money.format(row.final.amount ?? 0)}</span>
                  <select
                    className="select-input"
                    value={override === undefined ? 'auto' : override ? 'yes' : 'no'}
                    onChange={(event) =>
                      setEarthworkOverride(
                        row.key,
                        event.target.value === 'auto' ? null : event.target.value === 'yes'
                      )
                    }
                  >
                    <option value="auto">
                      Auto · {row.classification.isEarthwork ? 'Earthwork' : 'Other'}
                    </option>
                    <option value="yes">Earthwork</option>
                    <option value="no">Not earthwork</option>
                  </select>
                </div>
              )
            })}
          </div>
        </Modal>
      )}
    </div>
  )
}

/** One row of the General Abstract. Component rows open the component. */
function AbstractRow({
  line,
  onOpen
}: {
  line: AbstractLine
  onOpen?: () => void
}): JSX.Element {
  const body = (
    <>
      <span className="ga-sl">{line.slNo ?? ''}</span>
      <span className="ga-desc">
        {line.label}
        {line.basisNote && <small>{line.basisNote}</small>}
      </span>
      <span className="ga-amount">₹ {money.format(line.amount)}</span>
    </>
  )
  if (onOpen) {
    return (
      <button className={`ga-row ga-${line.kind} ga-clickable`} onClick={onOpen}>
        {body}
      </button>
    )
  }
  return <div className={`ga-row ga-${line.kind}`}>{body}</div>
}

function ChargeCard({
  label,
  value,
  note,
  icon,
  accent = false,
  percentValue,
  onPercentChange,
  onOpen
}: {
  label: string
  value: number
  note: string
  icon: JSX.Element
  accent?: boolean
  percentValue?: number
  onPercentChange?: (value: number) => void
  onOpen?: () => void
}): JSX.Element {
  return (
    <div className={`charge-card ${accent ? 'accent' : ''}`}>
      <div className="charge-card-head">
        <span>
          {icon} {label}
        </span>
        {onPercentChange && (
          <label className="charge-card-percent">
            <input
              type="number"
              min="0"
              step="0.01"
              value={percentValue ?? 0}
              onChange={(event) => onPercentChange(Number(event.target.value) || 0)}
            />
            %
          </label>
        )}
      </div>
      <strong>₹ {money.format(value)}</strong>
      {onOpen ? (
        <button className="charge-card-note-link" onClick={onOpen}>
          {note} <ChevronRight size={12} />
        </button>
      ) : (
        <small>{note}</small>
      )}
    </div>
  )
}

function CostMetric({
  label,
  value,
  icon,
  accent = false
}: {
  label: string
  value: number
  icon: JSX.Element
  accent?: boolean
}): JSX.Element {
  return (
    <div className={accent ? 'accent' : ''}>
      <span>
        {icon}
        {label}
      </span>
      <strong>₹ {money.format(value)}</strong>
    </div>
  )
}

function ChargeRow({
  label,
  value,
  text,
  total = false
}: {
  label: string
  value?: number
  text?: string
  total?: boolean
}): JSX.Element {
  return (
    <div className={`charge-row ${total ? 'total' : ''}`}>
      <span>{label}</span>
      <strong>{text ?? `₹ ${money.format(value ?? 0)}`}</strong>
    </div>
  )
}
