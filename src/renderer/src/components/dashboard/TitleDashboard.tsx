import { useEffect, useMemo, useState } from 'react'
import {
  BadgeIndianRupee,
  CheckCircle2,
  ChevronRight,
  FilePlus2,
  IndianRupee,
  Landmark,
  Layers3,
  ListPlus,
  MapPin,
  Pencil,
  Plus,
  ReceiptIndianRupee,
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
import { componentItemsTotal, getItemFinal } from '../../lib/finalNumber'
import { fetchItemRate, fetchRateAnalysis } from '../../lib/rateAnalysis'
import { projectItemKey, rateAnalysisOverrideForNode } from '../../lib/projectItems'
import {
  computeSeigniorageTable,
  fetchSeigniorageCharges,
  fetchSeignioragePolicies,
  projectSeigniorageItemCodes
} from '../../lib/seigniorage'
import {
  classifyEarthwork,
  fetchGstRateRules,
  resolveGstRateRule,
  type GstRateRule
} from '../../lib/projectTax'

const money = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const percent = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function collectItems(node: ProjectNode): ProjectNode[] {
  const items: ProjectNode[] = []
  const visit = (current: ProjectNode): void => {
    if (current.kind === 'item') items.push(current)
    else current.children.forEach(visit)
  }
  node.children.forEach(visit)
  return items
}

function itemCount(node: ProjectNode): number {
  return collectItems(node).length
}

export default function TitleDashboard(): JSX.Element | null {
  const [editingProject, setEditingProject] = useState(false)
  const [miscOpen, setMiscOpen] = useState(false)
  const [earthworkOpen, setEarthworkOpen] = useState(false)
  const [miscName, setMiscName] = useState('')
  const [miscCost, setMiscCost] = useState('')
  const [rates, setRates] = useState<Record<string, number>>({})
  const [recipes, setRecipes] = useState<Record<string, RateAnalysisRecipe>>({})
  const [gstRules, setGstRules] = useState<GstRateRule[]>([])
  const [seigniorage, setSeigniorage] = useState({
    totalSeigniorage: 0,
    totalDmft: 0,
    totalSmft: 0,
    grandTotal: 0
  })
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const project = useStore((state) => state.project)
  const addComponent = useStore((state) => state.addComponent)
  const openAddPage = useStore((state) => state.openAddPage)
  const select = useStore((state) => state.select)
  const openSettings = useStore((state) => state.openSettings)
  const openSeigniorage = useStore((state) => state.openSeigniorage)
  const updateMeta = useStore((state) => state.updateMeta)
  const addMiscellaneousItem = useStore((state) => state.addMiscellaneousItem)
  const removeMiscellaneousItem = useStore((state) => state.removeMiscellaneousItem)
  const setEarthworkOverride = useStore((state) => state.setEarthworkOverride)

  const allItems = useMemo(() => (project ? collectItems(project.root) : []), [project?.root])
  const year = project?.meta.sorYear ?? ''
  const zone = project?.meta.sorZone ?? 'zone_3'
  const allowance = project?.meta.areaAllowancePercent ?? 0
  const allowanceLabel = project?.meta.areaAllowanceLabel

  useEffect(() => {
    if (!project) return
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    void Promise.all([
      Promise.all(
        allItems.map(async (item) => {
          const [rate, recipe] = await Promise.all([
            fetchItemRate(item, year, {
              zone,
              areaAllowancePercent: allowance,
              areaAllowanceLabel: allowanceLabel
            }),
            fetchRateAnalysis(item, year, {
              zone,
              areaAllowancePercent: allowance,
              areaAllowanceLabel: allowanceLabel
            }).catch(() => null)
          ])
          const saved = rateAnalysisOverrideForNode(project, item)
          return {
            id: item.id,
            rate,
            recipe:
              recipe && saved
                ? {
                    ...recipe,
                    ...saved,
                    year: recipe.year,
                    zone: recipe.zone,
                    layout: recipe.layout,
                    sourceFigures: recipe.sourceFigures,
                    publishedRateBlocks: recipe.publishedRateBlocks
                  }
                : saved ?? recipe
          }
        })
      ),
      fetchGstRateRules(),
      Promise.all([
        fetchSeigniorageCharges(),
        fetchSeignioragePolicies(projectSeigniorageItemCodes(project))
      ])
    ])
      .then(([itemRows, rules, [charges, policies]]) => {
        if (cancelled) return
        const nextRates: Record<string, number> = {}
        const nextRecipes: Record<string, RateAnalysisRecipe> = {}
        for (const row of itemRows) {
          if (typeof row.rate === 'number') nextRates[row.id] = row.rate
          if (row.recipe) nextRecipes[row.id] = row.recipe
        }
        setRates(nextRates)
        setRecipes(nextRecipes)
        setGstRules(rules)
        setSeigniorage(computeSeigniorageTable(project, charges, [], policies))
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : String(error))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [project?.id, project?.updatedAt, allItems, year, zone, allowance, allowanceLabel])

  if (!project) return null

  const { meta, root } = project
  const components = root.children.filter((child) => child.kind === 'component')
  const pages = root.children.filter((child) => child.kind === 'page')
  const rateOf = (node: ProjectNode): number | undefined => rates[node.id]
  const itemRows = allItems.map((node) => {
    const final = getItemFinal(project, node, rateOf(node))
    const key = projectItemKey(node)
    const manual = Object.prototype.hasOwnProperty.call(project.earthworkOverrides ?? {}, key)
      ? project.earthworkOverrides?.[key]
      : undefined
    return {
      node,
      key,
      final,
      classification: classifyEarthwork(node, recipes[node.id], manual)
    }
  })
  const workCost = itemRows.reduce((total, row) => total + (row.final.amount ?? 0), 0)
  const earthworkCost = itemRows.reduce(
    (total, row) => total + (row.classification.isEarthwork ? row.final.amount ?? 0 : 0),
    0
  )
  const earthworkPercent = workCost > 0 ? (earthworkCost / workCost) * 100 : 0
  const earthworkPredominant = earthworkPercent > 75
  const miscTotal = (project.miscellaneousItems ?? []).reduce((sum, item) => sum + item.cost, 0)
  const taxSettings = meta.taxSettings ?? {
    mode: 'automatic' as const,
    recipientType: 'CENTRAL_STATE_UT_LOCAL' as const
  }
  const gstRule = resolveGstRateRule(
    gstRules,
    taxSettings.recipientType,
    earthworkPredominant
  )
  const gstRate = taxSettings.mode === 'manual' ? taxSettings.manualRate ?? 18 : gstRule?.ratePct ?? 18
  const taxableSubtotal = workCost + seigniorage.grandTotal + miscTotal
  const gstAmount = (taxableSubtotal * gstRate) / 100
  const grandTotal = taxableSubtotal + gstAmount
  const componentRows = components.map((component) => ({
    node: component,
    items: itemCount(component),
    total: componentItemsTotal(project, component, rateOf)
  }))
  const costedItems = itemRows.filter((row) => row.final.amount !== null).length
  const zoneLabel = meta.sorZone === 'zone_1' ? 'Zone I' : meta.sorZone === 'zone_2' ? 'Zone II' : 'Zone III'

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
            <span>{allItems.length} DATA</span>
          </div>
        </div>
        <div className="dash-actions">
          <button className="btn ghost" onClick={() => setEditingProject(true)}>
            <Pencil size={15} /> Edit Project
          </button>
          <button className="btn ghost" onClick={() => openAddPage(root.id)}>
            <FilePlus2 size={15} /> Add Page
          </button>
          <button className="btn" onClick={() => addComponent()}>
            <Plus size={15} /> Add Component
          </button>
          <button className="btn ghost icon-only" title="Project settings" onClick={() => openSettings(root.id)}>
            <Settings size={15} />
          </button>
        </div>
      </div>

      {loadError && <div className="project-load-warning">Some live costs could not be loaded: {loadError}</div>}

      <section className="project-total-panel">
        <div>
          <span className="project-total-label">Estimated project cost including GST</span>
          <strong>₹ {money.format(grandTotal)}</strong>
          <small>{loading ? 'Refreshing live DATA rates…' : `${costedItems} of ${allItems.length} DATA item(s) costed`}</small>
        </div>
        <div className="project-total-breakdown">
          <CostMetric label="DATA work cost" value={workCost} icon={<Layers3 size={17} />} />
          <CostMetric label="Seigniorage + funds" value={seigniorage.grandTotal} icon={<Landmark size={17} />} />
          <CostMetric label="Miscellaneous" value={miscTotal} icon={<ListPlus size={17} />} />
          <CostMetric label={`GST @ ${gstRate}%`} value={gstAmount} icon={<ReceiptIndianRupee size={17} />} accent />
        </div>
      </section>

      <div className="project-main-grid">
        <section className="project-panel tax-panel">
          <div className="project-panel-heading">
            <div>
              <span className="project-kicker">GST decision</span>
              <h2><ShieldCheck size={18} /> Tax slab</h2>
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
          <div className="threshold-caption"><span>0%</span><span>More than 75% required</span><span>100%</span></div>
          <div className="tax-controls">
            <button className={taxSettings.mode === 'automatic' ? 'active' : ''} onClick={() => setTaxMode('automatic')}>
              Automatic <small>{gstRule?.ratePct ?? 18}% from Supabase</small>
            </button>
            <button className={taxSettings.mode === 'manual' && gstRate === 12 ? 'active' : ''} onClick={() => setTaxMode('manual', 12)}>
              Manual 12%
            </button>
            <button className={taxSettings.mode === 'manual' && gstRate === 18 ? 'active' : ''} onClick={() => setTaxMode('manual', 18)}>
              Manual 18%
            </button>
          </div>
          <label className="recipient-field">
            <span>Service recipient classification</span>
            <select
              className="select-input"
              value={taxSettings.recipientType}
              onChange={(event) => updateMeta({ taxSettings: { ...taxSettings, recipientType: event.target.value as typeof taxSettings.recipientType } })}
            >
              <option value="CENTRAL_STATE_UT_LOCAL">Central / State / UT / Local Authority</option>
              <option value="GOVT_ENTITY_OR_AUTHORITY">Government Entity / Authority</option>
            </select>
          </label>
          <div className="tax-rule-note">
            <CheckCircle2 size={15} />
            <span>{gstRule?.description ?? 'Using the default general construction service rate.'}{gstRule?.notificationRef ? ` · ${gstRule.notificationRef}` : ''}</span>
          </div>
          <button className="btn ghost review-data-btn" onClick={() => setEarthworkOpen(true)}>
            Review earthwork DATA classification <ChevronRight size={15} />
          </button>
        </section>

        <section className="project-panel seigniorage-panel-card">
          <div className="project-panel-heading">
            <div>
              <span className="project-kicker">Statutory charges</span>
              <h2><Landmark size={18} /> Seigniorage</h2>
            </div>
            <strong>₹ {money.format(seigniorage.grandTotal)}</strong>
          </div>
          <ChargeRow label="Seigniorage charge" value={seigniorage.totalSeigniorage} />
          <ChargeRow label="DMFT (30%)" value={seigniorage.totalDmft} />
          <ChargeRow label="SMET / SMFT (2%)" value={seigniorage.totalSmft} />
          <ChargeRow label="Total statutory charge" value={seigniorage.grandTotal} total />
          <button className="btn ghost full-width" onClick={() => openSeigniorage()}>
            Open calculation details <ChevronRight size={15} />
          </button>
        </section>

        <section className="project-panel miscellaneous-panel">
          <div className="project-panel-heading">
            <div>
              <span className="project-kicker">Project additions</span>
              <h2><ListPlus size={18} /> Miscellaneous</h2>
            </div>
            <button className="btn ghost" onClick={() => setMiscOpen(true)}><Plus size={14} /> Add Item</button>
          </div>
          {(project.miscellaneousItems ?? []).length ? (
            <div className="misc-list">
              {(project.miscellaneousItems ?? []).map((item) => (
                <div key={item.id}>
                  <span>{item.name}</span>
                  <strong>₹ {money.format(item.cost)}</strong>
                  <button title="Remove" onClick={() => removeMiscellaneousItem(item.id)}><Trash2 size={14} /></button>
                </div>
              ))}
              <ChargeRow label="Miscellaneous total" value={miscTotal} total />
            </div>
          ) : (
            <div className="empty-project-card">Add named project costs that are not part of DATA.</div>
          )}
        </section>

        <section className="project-panel allowance-location-panel">
          <div className="project-panel-heading">
            <div>
              <span className="project-kicker">Project basis</span>
              <h2><MapPin size={18} /> Location & allowance</h2>
            </div>
            <strong>{meta.areaAllowancePercent ?? 0}%</strong>
          </div>
          <div className="location-copy">{meta.location?.label || (meta.location ? `${meta.location.lat.toFixed(6)}, ${meta.location.lng.toFixed(6)}` : 'Location not set')}</div>
          <ChargeRow label="Area classification" text={meta.areaAllowanceLabel ?? 'None'} />
          <ChargeRow label="Mapped village" text={meta.areaAllowance?.village ?? '—'} />
          <ChargeRow label="Rule year" text={meta.areaAllowance?.ruleYear ?? meta.sorYear} />
          <button className="btn ghost full-width" onClick={() => setEditingProject(true)}><Pencil size={14} /> Edit project basis</button>
        </section>
      </div>

      <section className="project-panel project-structure-panel">
        <div className="project-panel-heading">
          <div>
            <span className="project-kicker">Estimate structure</span>
            <h2><Layers3 size={18} /> Components</h2>
          </div>
          <button className="btn" onClick={() => addComponent()}><Plus size={14} /> Add Component</button>
        </div>
        {componentRows.length ? (
          <div className="component-cost-list">
            {componentRows.map((row, index) => (
              <button key={row.node.id} onClick={() => select(row.node.id)}>
                <span className="component-index">{String(index + 1).padStart(2, '0')}</span>
                <NodeIcon node={row.node} size={16} />
                <span className="component-name">{row.node.name}</span>
                <span className="component-count">{row.items} DATA</span>
                <strong>₹ {money.format(row.total)}</strong>
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
        ) : <div className="empty-project-card">No components yet.</div>}
        {pages.length > 0 && <div className="project-pages-note">{pages.length} project page(s) are also attached.</div>}
      </section>

      {editingProject && (
        <Modal title="Edit Project" size="lg" onClose={() => setEditingProject(false)}>
          <ProjectDetailsForm mode="edit" initialMeta={meta} onSaved={() => setEditingProject(false)} />
        </Modal>
      )}
      {miscOpen && (
        <Modal
          title="Add Miscellaneous Item"
          onClose={() => setMiscOpen(false)}
          footer={<><button className="btn ghost" onClick={() => setMiscOpen(false)}>Cancel</button><button className="btn" disabled={!miscName.trim() || !Number.isFinite(Number(miscCost)) || Number(miscCost) < 0} onClick={addMisc}><Plus size={14} /> Add Item</button></>}
        >
          <div className="field"><label className="field-label">Item name</label><input className="text-input" autoFocus value={miscName} onChange={(event) => setMiscName(event.target.value)} placeholder="e.g. Testing charges" /></div>
          <div className="field"><label className="field-label">Cost (₹)</label><input className="text-input" type="number" min="0" step="0.01" value={miscCost} onChange={(event) => setMiscCost(event.target.value)} placeholder="0.00" onKeyDown={(event) => { if (event.key === 'Enter') addMisc() }} /></div>
        </Modal>
      )}
      {earthworkOpen && (
        <Modal title="Review Earthwork DATA" size="lg" onClose={() => setEarthworkOpen(false)}>
          <p className="earthwork-modal-intro">Automatic classification comes from Supabase DATA metadata and description. Override only where the engineering classification requires it.</p>
          <div className="earthwork-review-list">
            {itemRows.map((row) => {
              const override = project.earthworkOverrides?.[row.key]
              return (
                <div key={row.node.id}>
                  <div><strong>{row.node.itemCode ?? row.node.name}</strong><span>{row.node.itemDescription ?? row.node.name}</span><small>{row.classification.reason}</small></div>
                  <span>₹ {money.format(row.final.amount ?? 0)}</span>
                  <select className="select-input" value={override === undefined ? 'auto' : override ? 'yes' : 'no'} onChange={(event) => setEarthworkOverride(row.key, event.target.value === 'auto' ? null : event.target.value === 'yes')}>
                    <option value="auto">Auto · {row.classification.isEarthwork ? 'Earthwork' : 'Other'}</option>
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

function CostMetric({ label, value, icon, accent = false }: { label: string; value: number; icon: JSX.Element; accent?: boolean }): JSX.Element {
  return <div className={accent ? 'accent' : ''}><span>{icon}{label}</span><strong>₹ {money.format(value)}</strong></div>
}

function ChargeRow({ label, value, text, total = false }: { label: string; value?: number; text?: string; total?: boolean }): JSX.Element {
  return <div className={`charge-row ${total ? 'total' : ''}`}><span>{label}</span><strong>{text ?? `₹ ${money.format(value ?? 0)}`}</strong></div>
}
