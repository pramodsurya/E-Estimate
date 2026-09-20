import {
  ChevronRight,
  ClipboardList,
  FileCode,
  FilePlus2,
  IndianRupee,
  Layers,
  ListPlus,

  Plus,
  RefreshCw,

  Settings
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useStore } from '../../store/useStore'
import { resolveComponentPrintPart } from '../../lib/typist-output/componentTypst'
import { resolveBoqPrintPart } from '../../lib/typist-output/boqTypst'
import { boqFileName, buildBoqData } from '../../lib/boq'
import EEstimatePrintStudio from '../typst/EEstimatePrintStudio'
import type { EestimateProject, ProjectNode } from '../../types/project'
import { NodeIcon, nodeDisplayName } from '../nodeVisual'
import { componentItemsTotal, getItemFinal } from '../../lib/finalNumber'
import type { RateAnalysisRecipe } from '../../types/rateAnalysis'
import {
  compileComponentDashboardSnapshots,
  dashboardComponentCompileSignature,
  dashboardContextMatches,
  dashboardItemIsSynced,
  syncDataDashboardSnapshot
} from '../../lib/dashboardSync'
import { findNode } from '../../lib/tree'
import { resolveTemplateDashboardMaterials } from '../../lib/templateDashboardSync'
import SignatureFooterCard from '../signature/SignatureFooterCard'
import { effectiveAllowanceForNode, workingLineCentroid } from '../../lib/componentAllowance'
import { resolveManualAreaAllowance } from '../../lib/manualAreaAllowance'
import { resolveAreaAllowance } from '../../lib/masterData'
import { ALLOWANCE_TYPES } from '../newproject/NewProjectForm'


const money = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 })
const qtyFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 })
const EMPTY_RATES: Record<string, number> = {}
const EMPTY_RECIPES: Record<string, RateAnalysisRecipe> = {}

export default function ComponentDashboard({ node }: { node: ProjectNode }): JSX.Element {
  const addSubcomponent = useStore((s) => s.addSubcomponent)
  const openAddPage = useStore((s) => s.openAddPage)
  const openAddItem = useStore((s) => s.openAddItem)
  const openSettings = useStore((s) => s.openSettings)
  const select = useStore((s) => s.select)
  const project = useStore((s) => s.project)
  const setDashboardSnapshot = useStore((s) => s.setDashboardSnapshot)
  const setGuideWallMaterial = useStore((s) => s.setGuideWallMaterial)
  const resolveBundMaterials = useStore((s) => s.resolveBundMaterials)
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [printStudioOpen, setPrintStudioOpen] = useState(false)
  const [boqOpen, setBoqOpen] = useState(false)
  const updatePrintStudioDocument = useStore((s) => s.updatePrintStudioDocument)

  const subcomponents = node.children.filter((c) => c.kind === 'subcomponent')
  const items = node.children.filter((c) => c.kind === 'item')
  const pages = node.children.filter((c) => c.kind === 'page')
  const isSub = node.kind === 'subcomponent'

  // All descendant item nodes (for synchronization + the component total).
  const allItems = useMemo(() => {
    const out: ProjectNode[] = []
    const visit = (n: ProjectNode): void => {
      if (n.kind === 'item') out.push(n)
      else n.children.forEach(visit)
    }
    node.children.forEach(visit)
    return out
  }, [node])

  const snapshotValid = project
    ? dashboardContextMatches(project.dashboardSnapshot, project)
    : false
  const snapshot = snapshotValid ? project?.dashboardSnapshot : undefined
  const rates = snapshot?.componentRates?.[node.id] ?? EMPTY_RATES
  const recipes = snapshot?.componentRecipes?.[node.id] ?? EMPTY_RECIPES
  const componentSynced =
    Boolean(project) &&
    snapshotValid &&
    Boolean(snapshot?.componentSyncedAt?.[node.id]) &&
    snapshot?.componentCompileSignatures?.[node.id] ===
      dashboardComponentCompileSignature(project as EestimateProject, allItems) &&
    allItems.every((item) => dashboardItemIsSynced(snapshot, item))

  const syncDashboard = async (): Promise<void> => {
    if (!project || syncing) return
    setSyncing(true)
    setSyncError(null)
    try {
      await resolveTemplateDashboardMaterials(node, {
        setGuideWallMaterial,
        resolveBundMaterials,
      })
      const current = useStore.getState().project
      if (!current || current.id !== project.id) return
      const currentNode = findNode(current.root, node.id)
      if (!currentNode) return
      // Quantity-bearing template/items are already persisted locally. Reading
      // the latest tree here is the quantity phase; DATA recompile follows it.
      const next = await syncDataDashboardSnapshot(current)
      if (useStore.getState().project?.id !== current.id) return
      setDashboardSnapshot(
        compileComponentDashboardSnapshots(current, next, [currentNode])
      )
    } catch (error: unknown) {
      setSyncError(error instanceof Error ? error.message : String(error))
    } finally {
      setSyncing(false)
    }
  }

  const rateOf = (n: ProjectNode): number | undefined => {
    const rate = rates[n.id]
    return dashboardItemIsSynced(snapshot, n) && typeof rate === 'number'
      ? rate
      : undefined
  }
  const calculatedComponentTotal = componentItemsTotal(project, node, rateOf, true)
  const componentTotal =
    componentSynced && typeof snapshot?.componentTotals?.[node.id] === 'number'
      ? snapshot.componentTotals[node.id]
      : calculatedComponentTotal
  const directComponentTotal = items.reduce(
    (total, item) => total + (getItemFinal(project, item, rateOf(item), true).amount ?? 0),
    0
  )
  const subcomponentSummaries = subcomponents.map((subcomponent) => ({
    node: subcomponent,
    itemCount: countDescendantItems(subcomponent),
    total: componentItemsTotal(project, subcomponent, rateOf, true)
  }))
  const subcomponentsTotal = subcomponentSummaries.reduce((total, summary) => total + summary.total, 0)
  const directItemCount = items.length
  const subcomponentItemCount = subcomponentSummaries.reduce(
    (total, summary) => total + summary.itemCount,
    0
  )
  const costedDirectItemCount = items.filter(
    (item) => getItemFinal(project, item, rateOf(item), true).amount !== null
  ).length
  const directCostPercent = componentTotal > 0 ? (directComponentTotal / componentTotal) * 100 : 0

  const componentPrintStudio = useMemo(() => {
    if (!project || !printStudioOpen) return null
    return resolveComponentPrintPart(project, node, recipes, rateOf)
  }, [project, node, recipes, rates, printStudioOpen, rateOf])

  const boqPrintStudio = useMemo(() => {
    if (!project || !boqOpen) return null
    return resolveBoqPrintPart(project, node, rateOf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, node, snapshot, boqOpen])

  const exportBoqExcel = async (): Promise<void> => {
    const current = useStore.getState().project
    if (!current) throw new Error('No active project.')
    const section = findNode(current.root, node.id) ?? node
    const boq = buildBoqData(current, section, rateOf)
    const payload = {
      kind: 'boq',
      preferPath: true,
      boq: {
        projectName: boq.projectName,
        componentName: boq.componentName,
        isSubcomponent: boq.isSubcomponent,
        rows: boq.rows.map((row) => ({
          sl: row.sl,
          code: row.code,
          heading: row.heading,
          description: row.description,
          quantity: row.quantity,
          unit: row.unit,
          rate: row.rate,
          amount: row.amount
        })),
        totalCost: boq.totalCost
      }
    }
    const result = await window.api.excel.compile(payload)
    // No base64 fallback: a missing path or save channel fails loudly.
    if (!result || !result.ok || !result.filePath) {
      throw new Error(result?.error || 'Excel engine did not return a workbook path.')
    }
    if (typeof window.api.export.workbook !== 'function') {
      throw new Error('Excel export channel is unavailable.')
    }
    const fileName = boqFileName(boq.projectName, boq.componentName)
    await window.api.export.workbook('', fileName, undefined, { sourcePath: result.filePath })
  }
  return (
    <div className="dashboard component-dashboard">
      <div className="dash-header">
        <div>
          <div className="dash-eyebrow">{isSub ? 'Sub-component' : 'Component'}</div>
          <h1 className="dash-title">
            <NodeIcon node={node} size={22} />
            {node.name}
          </h1>
        </div>
        <div className="dash-actions">
          <button
            className="btn ghost"
            disabled={syncing}
            title={
              componentSynced && snapshot?.syncedAt
                ? `Last synced ${new Date(snapshot.syncedAt).toLocaleString()}`
                : 'Populate and store this dashboard'
            }
            onClick={() => void syncDashboard()}
          >
            <RefreshCw size={15} /> {syncing ? 'Syncing…' : 'Sync'}
          </button>
          {!isSub && (
            <button className="btn ghost" onClick={() => addSubcomponent(node.id)}>
              <Layers size={15} /> Add Sub-component
            </button>
          )}
          <button className="btn ghost" onClick={() => openAddPage(node.id)}>
            <FilePlus2 size={15} /> Add Page
          </button>
          <button className="btn" onClick={() => openAddItem(node.id)}>
            <ListPlus size={15} /> Add Item
          </button>
          <button className="btn ghost" title="Settings" onClick={() => openSettings(node.id)}>
            <Settings size={15} />
          </button>
          <button
            className="btn ghost"
            onClick={() => setBoqOpen(true)}
            title="Bill of Quantities"
          >
            <ClipboardList size={15} /> BOQ
          </button>
          <button
            className="btn ghost"
            title="Open Component Print Studio"
            onClick={() => setPrintStudioOpen(true)}
          >
            <FileCode size={15} /> Print Studio
          </button>
        </div>
      </div>

      <div className="component-dashboard-body">
        {syncError && (
          <div className="project-load-warning">Dashboard sync failed: {syncError}</div>
        )}
        {!componentSynced && !syncError && (
          <div className="project-load-warning">
            This dashboard has not been synced for the current SOR settings. Click Sync to populate it.
          </div>
        )}
        {project && <ComponentAllowanceCard project={project} node={node} />}
        <SignatureFooterCard scopeKey={node.id} />
        <section className="component-cost-overview">
          <div className="component-cost-primary">
            <div className="component-section-label">
              <IndianRupee size={15} /> Total estimated cost
            </div>
            <div className="component-grand-total">
              {componentTotal > 0 ? `₹ ${money.format(componentTotal)}` : '₹ 0'}
            </div>
            <p>
              Fixed quantities × adopted rates across this {isSub ? 'sub-component' : 'component'}.
            </p>
            {!isSub && componentTotal > 0 && (
              <div className="component-cost-bar" aria-label="Cost composition">
                <span style={{ width: `${directCostPercent}%` }} />
                <i style={{ width: `${100 - directCostPercent}%` }} />
              </div>
            )}
          </div>
          <div className="component-cost-breakdown">
            <div>
              <span>{isSub ? 'Own items' : 'Component items'}</span>
              <strong>₹ {money.format(directComponentTotal)}</strong>
              <small>{directItemCount} direct item{directItemCount === 1 ? '' : 's'}</small>
            </div>
            {!isSub && (
              <div>
                <span>Sub-components</span>
                <strong>₹ {money.format(subcomponentsTotal)}</strong>
                <small>{subcomponents.length} sub-component{subcomponents.length === 1 ? '' : 's'}</small>
              </div>
            )}
            <div>
              <span>Ready for costing</span>
              <strong>{costedDirectItemCount} / {directItemCount}</strong>
              <small>Direct items with quantity and rate</small>
            </div>
            <div>
              <span>Supporting pages</span>
              <strong>{pages.length}</strong>
              <small>Attached to this section</small>
            </div>
          </div>
        </section>

        {!isSub && (
          <section className="component-panel">
            <div className="component-panel-heading">
              <div>
                <span className="component-section-label"><Layers size={15} /> Sub-components</span>
                <h2>Cost by sub-component</h2>
                <p>{subcomponentItemCount} item{subcomponentItemCount === 1 ? '' : 's'} grouped separately from this component’s own abstract.</p>
              </div>
              <button className="btn ghost" onClick={() => addSubcomponent(node.id)}>
                <Plus size={14} /> Add Sub-component
              </button>
            </div>
            {subcomponentSummaries.length ? (
              <div className="component-subcomponent-list">
                {subcomponentSummaries.map((summary, index) => (
                  <button
                    type="button"
                    key={summary.node.id}
                    className="component-subcomponent-row"
                    onClick={() => select(summary.node.id)}
                  >
                    <span className="component-subcomponent-index">{String(index + 1).padStart(2, '0')}</span>
                    <span className="component-subcomponent-name">
                      <NodeIcon node={summary.node} size={17} />
                      <span>
                        <strong>{summary.node.name}</strong>
                        <small>{summary.itemCount} item{summary.itemCount === 1 ? '' : 's'}</small>
                      </span>
                    </span>
                    <span className="component-subcomponent-share">
                      {componentTotal > 0 ? `${money.format((summary.total / componentTotal) * 100)}% of total` : 'No cost yet'}
                    </span>
                    <strong className="component-subcomponent-cost">₹ {money.format(summary.total)}</strong>
                    <ChevronRight size={18} />
                  </button>
                ))}
                <div className="component-subcomponent-total">
                  <span>Sub-component total</span>
                  <strong>₹ {money.format(subcomponentsTotal)}</strong>
                </div>
              </div>
            ) : (
              <div className="component-empty-state">
                <Layers size={22} />
                <div><strong>No sub-components</strong><span>Create one when a part of the work needs its own abstract and cost.</span></div>
              </div>
            )}
          </section>
        )}

        <section className="component-panel">
          <div className="component-panel-heading">
            <div>
              <span className="component-section-label"><ListPlus size={15} /> {isSub ? 'Sub-component items' : 'Component items'}</span>
              <h2>Direct items</h2>
              <p>{isSub ? 'These items form this sub-component’s General Abstract.' : 'Only these items appear in the main Component Abstract.'}</p>
            </div>
            <button className="btn" onClick={() => openAddItem(node.id)}>
              <Plus size={14} /> Add Item
            </button>
          </div>
          {items.length ? (
            <div className="component-items-table">
              <div className="component-items-head">
                <span>Item</span><span>Quantity</span><span>Rate</span><span>Amount</span><span />
              </div>
              {items.map((item) => {
                const final = getItemFinal(project, item, rateOf(item), true)
                return (
                  <button type="button" key={item.id} className="component-item-row" onClick={() => select(item.id)}>
                    <span className="component-item-name" title={item.itemDescription}>
                      <NodeIcon node={item} size={16} />
                      <span><strong>{nodeDisplayName(item)}</strong><small>{item.itemDescription || item.itemSource || 'Estimate item'}</small></span>
                    </span>
                    <span>{final.qty != null ? `${qtyFmt.format(final.qty)} ${item.unit ?? final.unit ?? ''}` : '—'}</span>
                    <span>{final.rate != null ? `₹ ${money.format(final.rate)}` : '—'}</span>
                    <strong>{final.amount != null ? `₹ ${money.format(final.amount)}` : 'Not costed'}</strong>
                    <ChevronRight size={17} />
                  </button>
                )
              })}
              <div className="component-items-total">
                <span>Direct items total</span><strong>₹ {money.format(directComponentTotal)}</strong>
              </div>
            </div>
          ) : (
            <div className="component-empty-state">
              <ListPlus size={22} />
              <div><strong>No direct items</strong><span>Add an item to begin costing this section.</span></div>
            </div>
          )}
        </section>

        {pages.length > 0 && (
          <section className="component-panel component-pages-panel">
            <div className="component-panel-heading">
              <div><span className="component-section-label"><FilePlus2 size={15} /> Supporting pages</span><h2>Pages</h2></div>
            </div>
            <div className="component-page-list">
              {pages.map((page) => (
                <button type="button" key={page.id} onClick={() => select(page.id)}>
                  <NodeIcon node={page} size={16} /><span>{page.name}</span><ChevronRight size={16} />
                </button>
              ))}
            </div>
          </section>
        )}
      </div>

      {printStudioOpen && project && componentPrintStudio ? (
        <EEstimatePrintStudio
          scopeKey={componentPrintStudio.scopeKey}
          key={componentPrintStudio.scopeKey}
          title="Component — Typst Print Studio"
          subtitle={node.name}
          defaultTypstSource={componentPrintStudio.defaultTypstSource}
          savedTypstSource={componentPrintStudio.savedTypstSource}
          compileInputs={componentPrintStudio.compileInputs}
          shadowFiles={componentPrintStudio.shadowFiles}
          compilePrelude={componentPrintStudio.compilePrelude}
          runtimeData={componentPrintStudio.runtimeData}
          projectDocumentSettings={componentPrintStudio.projectDocumentSettings}
          savedDocumentSettings={componentPrintStudio.savedDocumentSettings ?? undefined}
          onSave={async (source, settings) => {
            updatePrintStudioDocument(componentPrintStudio.scopeKey, source, settings)
            await useStore.getState().saveProject({ requireSaved: true })
          }}
          onClose={() => setPrintStudioOpen(false)}
        />
      ) : null}
      {boqOpen && project && boqPrintStudio ? (
        <EEstimatePrintStudio
          scopeKey={boqPrintStudio.scopeKey}
          key={boqPrintStudio.scopeKey}
          title="BOQ — Bill of Quantities"
          subtitle={node.name}
          defaultTypstSource={boqPrintStudio.defaultTypstSource}
          savedTypstSource={boqPrintStudio.savedTypstSource}
          compileInputs={boqPrintStudio.compileInputs}
          compilePrelude={boqPrintStudio.compilePrelude}
          runtimeData={boqPrintStudio.runtimeData}
          projectDocumentSettings={boqPrintStudio.projectDocumentSettings}
          savedDocumentSettings={boqPrintStudio.savedDocumentSettings ?? undefined}
          excelExportLabel="Download the BOQ as an Excel workbook"
          onExportExcel={() => exportBoqExcel()}
          onSave={async (source, settings) => {
            updatePrintStudioDocument(boqPrintStudio.scopeKey, source, settings)
            await useStore.getState().saveProject({ requireSaved: true })
          }}
          onClose={() => setBoqOpen(false)}
        />
      ) : null}
    </div>
  )
}

function decodeBase64(b64: string): Uint8Array {
  const binary = atob(b64)
  const len = binary.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

function formatMoney(value: number): string {
  return Number.isFinite(value) ? `Rs. ${money.format(value)}` : '-'
}

/**
 * Working location and labour allowance for one component/sub-component.
 * Items under the nearest ancestor carrying an explicit allowance are priced
 * with it; otherwise the project allowance applies. Changing the allowance
 * marks this dashboard stale until the next Sync.
 */
function ComponentAllowanceCard({
  project,
  node
}: {
  project: EestimateProject
  node: ProjectNode
}): JSX.Element {
  const setNodeAreaAllowance = useStore((s) => s.setNodeAreaAllowance)
  const openEditGeometry = useStore((s) => s.openEditGeometry)
  const [editing, setEditing] = useState(false)
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const effective = effectiveAllowanceForNode(project, node.id)
  const explicit = node.areaAllowance ?? null
  const isCustom = !node.templateId
  const templateLengthM = node.bund?.lengthM ?? node.canal?.lengthM ?? node.guideWall?.lengthM ?? null
  const workLookup =
    node.location ?? (node.workingLine?.length ? workingLineCentroid(node.workingLine) : null)

  const applyAutomatic = (): void => {
    if (pending || !workLookup) return
    setPending('__automatic')
    setError(null)
    void resolveAreaAllowance({ lat: workLookup.lat, lng: workLookup.lng }, project.meta.sorYear)
      .then((resolved) => setNodeAreaAllowance(node.id, resolved))
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : 'Could not determine area allowance.')
      )
      .finally(() => setPending(null))
  }
  const isSub = node.kind === 'subcomponent'

  const applyType = (type: string): void => {
    if (pending) return
    setPending(type)
    setError(null)
    void resolveManualAreaAllowance(type || null, project.meta.sorYear)
      .then((resolved) => setNodeAreaAllowance(node.id, resolved))
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : 'Could not update the allowance.')
      )
      .finally(() => setPending(null))
  }

  const locationText = node.location
    ? `${node.location.lat.toFixed(6)}, ${node.location.lng.toFixed(6)}${
        node.location.label ? ` · ${node.location.label}` : ''
      }`
    : 'Not set'
  const lineText = node.workingLine?.length
    ? ` · line of ${node.workingLine.length} vertices`
    : ''
  const storedLengthText =
    templateLengthM != null && templateLengthM > 0 ? ` · ${Math.round(templateLengthM)} m` : ''

  return (
    <section className="component-panel">
      <div className="component-panel-heading">
        <div>
          <span className="component-section-label">Working location &amp; allowance</span>
          <h2>
            {effective.label} · {effective.percent.toFixed(2)}%
          </h2>
          <p>
            {effective.source === 'component'
              ? `${explicit?.source === 'manual' ? 'Manual classification' : 'Automatic from the map'} on ${effective.ownerName ?? 'this section'}. Every item under it is priced with this allowance.`
              : `Using the project allowance. Every item under this ${isSub ? 'sub-component' : 'component'} is priced with it until an explicit one is set.`}
          </p>
        </div>
        <button className="btn ghost" style={{ marginRight: 8 }} onClick={() => openEditGeometry(node.id)}>
          {isCustom ? 'Edit location' : 'Edit length'}
        </button>
        <button className="btn ghost" onClick={() => setEditing((value) => !value)}>
          {editing ? 'Done' : 'Change'}
        </button>
      </div>
      <div className="component-cost-breakdown">
        <div>
          <span>Work point</span>
          <strong>{locationText}</strong>
          <small>{`${lineText ? lineText.trim() : explicit ? 'Explicit allowance' : 'Inherited allowance'}${storedLengthText}`}</small>
        </div>
        <div>
          <span>Rule source</span>
          <strong>{effective.allowance?.ruleYear ?? project.meta.sorYear}</strong>
          <small>{effective.allowance?.goReference ?? 'Project year'}</small>
        </div>
      </div>
      {editing && (
        <div className="field" style={{ marginTop: 12 }}>
          <p className="settings-note" style={{ marginTop: 0 }}>
            Automatic reads the allowance rule at the stored work
            {node.workingLine?.length ? ' line middle' : ' point'}
            {workLookup ? ` (${workLookup.lat.toFixed(6)}, ${workLookup.lng.toFixed(6)})` : ''};
            manual fixes a classification instead.
          </p>
          <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
            <button
              type="button"
              className="btn ghost compact"
              disabled={pending !== null || !workLookup}
              onClick={applyAutomatic}
              title={workLookup ? 'Resolve the allowance from the stored work location' : 'No work point or line is stored on this section'}
            >
              {pending === '__automatic' ? 'Resolving…' : explicit?.source === 'automatic' ? 'Refresh automatic' : 'Apply automatic'}
            </button>
          </div>
          <div className="allowance-flags" aria-label="Component area classification">
            {ALLOWANCE_TYPES.map((option) => (
              <button
                type="button"
                key={option.value || 'none'}
                className={(explicit?.type ?? '') === option.value ? 'selected' : ''}
                disabled={pending !== null}
                onClick={() => applyType(option.value)}
              >
                {pending === option.value ? 'Saving…' : option.label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
            <button
              type="button"
              className="btn ghost compact"
              disabled={pending !== null || !explicit}
              onClick={() => setNodeAreaAllowance(node.id, null)}
            >
              Use project allowance
            </button>
          </div>
          {error && <div className="rate-warning" style={{ marginTop: 8 }}>{error}</div>}
          <p className="settings-note" style={{ marginTop: 8 }}>
            Sync this dashboard afterwards so the new allowance flows into every rate.
          </p>
        </div>
      )}
    </section>
  )
}

function countDescendantItems(node: ProjectNode): number {
  let count = 0
  const visit = (current: ProjectNode): void => {
    if (current.kind === 'item') {
      count += 1
      return
    }
    current.children.forEach(visit)
  }
  node.children.forEach(visit)
  return count
}
