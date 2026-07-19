import {
  ChevronRight,
  Eye,
  FilePlus2,
  IndianRupee,
  Layers,
  LayoutDashboard,
  ListPlus,
  Minus,
  Plus,
  Printer,
  Settings,
  Type,
  X
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type SyntheticEvent } from 'react'
import { useStore } from '../../store/useStore'
import type {
  EestimateProject,
  Margins,
  Orientation,
  PaperSize,
  ProjectNode
} from '../../types/project'
import { NodeIcon, nodeDisplayName } from '../nodeVisual'
import { componentItemsTotal, getItemFinal } from '../../lib/finalNumber'
import { fetchItemRate, fetchRateAnalysis } from '../../lib/rateAnalysis'
import { descriptionRunsForDisplay, plainTextRun } from '../../lib/rateAnalysisVisibility'
import { buildPrintHtml } from '../../lib/printRender'
import { resolveNodeSettings } from '../../lib/nodeSettings'
import { createUniverWorkbookData } from '../../lib/univerSpreadsheet'
import { rateAnalysisOverrideForNode } from '../../lib/projectItems'
import type { RateAnalysisRecipe, RateAnalysisTextRun } from '../../types/rateAnalysis'
import { buildCombinedComponentPdf } from '../../lib/componentPrint'
import PdfPageStack from '../print/PdfPageStack'

const money = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 })
const qtyFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 })
const PREVIEW_MARGINS: Margins = { top: 20, right: 15, bottom: 20, left: 25 }
const PAPER_MM: Record<PaperSize, { width: number; height: number }> = {
  A4: { width: 210, height: 297 },
  A3: { width: 297, height: 420 },
  A2: { width: 420, height: 594 },
  Letter: { width: 215.9, height: 279.4 },
  Legal: { width: 215.9, height: 355.6 }
}

export default function ComponentDashboard({ node }: { node: ProjectNode }): JSX.Element {
  const addSubcomponent = useStore((s) => s.addSubcomponent)
  const openAddPage = useStore((s) => s.openAddPage)
  const openAddItem = useStore((s) => s.openAddItem)
  const openSettings = useStore((s) => s.openSettings)
  const select = useStore((s) => s.select)
  const project = useStore((s) => s.project)
  const [printPreviewOpen, setPrintPreviewOpen] = useState(false)
  const [printView, setPrintView] = useState(false)
  const [combinedPdfUrl, setCombinedPdfUrl] = useState<string | null>(null)
  const [combinedPrintStatus, setCombinedPrintStatus] = useState<'idle' | 'rendering' | 'error'>('idle')
  const [combinedPrintError, setCombinedPrintError] = useState<string | null>(null)
  const [previewZoom, setPreviewZoom] = useState(100)
  const [masterFontPercent, setMasterFontPercent] = useState(100)
  const combinedFrameRef = useRef<HTMLIFrameElement>(null)

  const subcomponents = node.children.filter((c) => c.kind === 'subcomponent')
  const items = node.children.filter((c) => c.kind === 'item')
  const pages = node.children.filter((c) => c.kind === 'page')
  const isSub = node.kind === 'subcomponent'

  const sorYear = project?.meta.sorYear ?? ''
  const sorZone = project?.meta.sorZone ?? 'zone_3'
  const areaAllowancePercent = project?.meta.areaAllowancePercent ?? 0
  const areaAllowanceLabel = project?.meta.areaAllowanceLabel

  // All descendant item nodes (for rate loading + the component total).
  const allItems = useMemo(() => {
    const out: ProjectNode[] = []
    const visit = (n: ProjectNode): void => {
      if (n.kind === 'item') out.push(n)
      else n.children.forEach(visit)
    }
    node.children.forEach(visit)
    return out
  }, [node])

  // Rates come from the SSR/SOR data (Supabase), fetched per item.
  const [rates, setRates] = useState<Record<string, number>>({})
  const [recipes, setRecipes] = useState<Record<string, RateAnalysisRecipe>>({})
  useEffect(() => {
    let cancelled = false
    const load = async (): Promise<void> => {
      const entries = await Promise.all(
        allItems.map(async (it) => [
          it.id,
          await fetchItemRate(it, sorYear, {
            zone: sorZone,
            areaAllowancePercent,
            areaAllowanceLabel
          })
        ] as const)
      )
      if (cancelled) return
      const map: Record<string, number> = {}
      for (const [id, r] of entries) if (typeof r === 'number') map[id] = r
      setRates(map)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [allItems, sorYear, sorZone, areaAllowancePercent, areaAllowanceLabel])

  useEffect(() => {
    let cancelled = false
    const load = async (): Promise<void> => {
      const entries = await Promise.all(
        allItems.map(async (it) => {
          try {
            const recipe = await fetchRateAnalysis(it, sorYear, {
              zone: sorZone,
              areaAllowancePercent,
              areaAllowanceLabel
            })
            const saved = project ? rateAnalysisOverrideForNode(project, it) : null
            return [
              it.id,
              saved
                ? {
                    ...recipe,
                    ...saved,
                    year: recipe.year,
                    zone: recipe.zone,
                    layout: recipe.layout,
                    sourceFigures: recipe.sourceFigures,
                    publishedRateBlocks: recipe.publishedRateBlocks
                  }
                : recipe
            ] as const
          } catch {
            return [it.id, null] as const
          }
        })
      )
      if (cancelled) return
      const map: Record<string, RateAnalysisRecipe> = {}
      for (const [id, recipe] of entries) if (recipe) map[id] = recipe
      setRecipes(map)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [
    allItems,
    sorYear,
    sorZone,
    areaAllowancePercent,
    areaAllowanceLabel,
    project?.rateAnalysisOverrides,
    project?.rateAnalysisScopedOverrides
  ])

  const rateOf = (n: ProjectNode): number | undefined => rates[n.id]
  const componentTotal = componentItemsTotal(project, node, rateOf)
  const directComponentTotal = items.reduce(
    (total, item) => total + (getItemFinal(project, item, rateOf(item)).amount ?? 0),
    0
  )
  const subcomponentSummaries = subcomponents.map((subcomponent) => ({
    node: subcomponent,
    itemCount: countDescendantItems(subcomponent),
    total: componentItemsTotal(project, subcomponent, rateOf)
  }))
  const subcomponentsTotal = subcomponentSummaries.reduce((total, summary) => total + summary.total, 0)
  const directItemCount = items.length
  const subcomponentItemCount = subcomponentSummaries.reduce(
    (total, summary) => total + summary.itemCount,
    0
  )
  const costedDirectItemCount = items.filter(
    (item) => getItemFinal(project, item, rateOf(item)).amount !== null
  ).length
  const directCostPercent = componentTotal > 0 ? (directComponentTotal / componentTotal) * 100 : 0

  useEffect(() => {
    if ((!printPreviewOpen && !printView) || !project) return
    let cancelled = false
    let objectUrl: string | null = null
    setCombinedPrintStatus('rendering')
    setCombinedPrintError(null)
    void buildCombinedComponentPdf({
      project,
      section: node,
      recipes,
      rateOf,
      total: componentTotal,
      fontScale: masterFontPercent / 100
    })
      .then((bytes) => {
        if (cancelled) return
        const copy = new ArrayBuffer(bytes.byteLength)
        new Uint8Array(copy).set(bytes)
        objectUrl = URL.createObjectURL(new Blob([copy], { type: 'application/pdf' }))
        setCombinedPdfUrl(objectUrl)
        setCombinedPrintStatus('idle')
      })
      .catch((error) => {
        if (cancelled) return
        setCombinedPdfUrl(null)
        setCombinedPrintStatus('error')
        setCombinedPrintError(error instanceof Error ? error.message : String(error))
      })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [printPreviewOpen, printView, project, node, allItems, recipes, rates, componentTotal, masterFontPercent])

  return (
    <div className={`dashboard component-dashboard ${printView ? 'component-print-view' : ''}`}>
      <div className="dash-header">
        <div>
          <div className="dash-eyebrow">{isSub ? 'Sub-component' : 'Component'}</div>
          <h1 className="dash-title">
            <NodeIcon node={node} size={22} />
            {node.name}
          </h1>
        </div>
        <div className="dash-actions">
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
          <button className="btn ghost" onClick={() => setPrintPreviewOpen(true)}>
            <Printer size={15} /> Print Preview
          </button>
          <button className="btn ghost" onClick={() => setPrintView((value) => !value)}>
            {printView ? <LayoutDashboard size={15} /> : <Eye size={15} />}
            {printView ? 'Dashboard View' : 'View Print View'}
          </button>
        </div>
      </div>

      {printView ? (
        <div className="component-print-workspace">
          <div className="component-print-toolbar">
            <span>This is the actual paginated print output.</span>
            <div className="component-print-controls">
              <button className="btn-mini" onClick={() => setPreviewZoom((z) => Math.max(25, z - 10))}><Minus size={13} /></button>
              <label>Zoom
                <input type="range" min="25" max="200" step="5" value={previewZoom} onChange={(e) => setPreviewZoom(Number(e.target.value))} />
                <b>{previewZoom}%</b>
              </label>
              <button className="btn-mini" onClick={() => setPreviewZoom((z) => Math.min(200, z + 10))}><Plus size={13} /></button>
              <label><Type size={14} /> Master font
                <input type="range" min="75" max="175" step="5" value={masterFontPercent} onChange={(e) => setMasterFontPercent(Number(e.target.value))} />
                <b>{masterFontPercent}%</b>
              </label>
            </div>
            <button className="btn" disabled={!combinedPdfUrl} onClick={() => combinedFrameRef.current?.contentWindow?.print()}>
              <Printer size={14} /> Print
            </button>
          </div>
          <div className="component-print-edit-strip">
            {allItems.map((item) => (
              <button className="btn ghost" key={item.id} onClick={() => select(item.id)}>
                Edit {item.itemEditorType === 'document' ? 'Word' : 'Excel'}: {nodeDisplayName(item)}
              </button>
            ))}
          </div>
          <div className="component-print-live-pages">
            {combinedPrintStatus === 'rendering' ? (
              <div className="component-print-preview-message">Updating printed pages...</div>
            ) : combinedPrintStatus === 'error' ? (
              <div className="component-print-preview-message error">{combinedPrintError}</div>
            ) : combinedPdfUrl ? (
              <>
                <PdfPageStack src={combinedPdfUrl} zoom={previewZoom} />
                <iframe
                  ref={combinedFrameRef}
                  className="component-print-pdf-source"
                  title="Print document"
                  src={combinedPdfUrl}
                />
              </>
            ) : null}
          </div>
        </div>
      ) : (
      <div className="component-dashboard-body">
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
                const final = getItemFinal(project, item, rates[item.id])
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
      )}
      {printPreviewOpen && (
        <div className="component-print-overlay">
          <div className="component-print-shell">
            <div className="component-print-preview-bar">
              <div>
                <strong>Component Print Preview</strong>
                <span>{node.name}</span>
              </div>
              <div>
                <div className="component-print-controls">
                  <button className="btn-mini" onClick={() => setPreviewZoom((z) => Math.max(25, z - 10))}><Minus size={13} /></button>
                  <label>Zoom <input type="range" min="25" max="200" step="5" value={previewZoom} onChange={(e) => setPreviewZoom(Number(e.target.value))} /><b>{previewZoom}%</b></label>
                  <button className="btn-mini" onClick={() => setPreviewZoom((z) => Math.min(200, z + 10))}><Plus size={13} /></button>
                  <label><Type size={13} /> Master font <input type="range" min="75" max="175" step="5" value={masterFontPercent} onChange={(e) => setMasterFontPercent(Number(e.target.value))} /><b>{masterFontPercent}%</b></label>
                </div>
                <button
                  className="btn ghost"
                  disabled={!combinedPdfUrl}
                  onClick={() => combinedFrameRef.current?.contentWindow?.print()}
                >
                  <Printer size={14} /> Print
                </button>
                <button className="btn ghost" onClick={() => setPrintPreviewOpen(false)}>
                  <X size={14} /> Close
                </button>
              </div>
            </div>
            <div className="component-print-combined">
              <div className="component-print-combined-preview">
                {combinedPrintStatus === 'rendering' ? (
                  <div className="component-print-preview-message">Assembling print pages...</div>
                ) : combinedPrintStatus === 'error' ? (
                  <div className="component-print-preview-message error">{combinedPrintError}</div>
                ) : combinedPdfUrl ? (
                  <>
                    <PdfPageStack src={combinedPdfUrl} zoom={previewZoom} />
                    <iframe
                      ref={combinedFrameRef}
                      className="component-print-pdf-source"
                      title="Combined print document"
                      src={combinedPdfUrl}
                    />
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ComponentPrintPage({
  projectName,
  node,
  project,
  rateOf,
  total,
  recipes
  ,onEdit
  ,fontScale
}: {
  projectName: string
  node: ProjectNode
  project: EestimateProject | null
  rateOf: (node: ProjectNode) => number | undefined
  total: number
  recipes: Record<string, RateAnalysisRecipe>
  onEdit: (id: string) => void
  fontScale: number
}): JSX.Element {
  const directItems = node.children.filter((child) => child.kind === 'item')
  const subSections = node.children.filter(
    (child) => child.kind === 'component' || child.kind === 'subcomponent'
  )

  return (
    <section className="component-print-page" style={{ fontSize: `${fontScale}em` }}>
      <header className="component-print-header">
        <div>
          <span>{projectName || 'E-Estimate'}</span>
          <h2>{node.name}</h2>
          <p>{node.kind === 'subcomponent' ? 'Sub-component estimate section' : 'Component estimate section'}</p>
        </div>
        <strong>{formatMoney(total)}</strong>
      </header>

      <ComponentPrintItems
        title="Items"
        items={directItems}
        project={project}
        rateOf={rateOf}
        recipes={recipes}
        onEdit={onEdit}
      />

      {subSections.map((section, index) => (
        <ComponentPrintSection
          key={section.id}
          node={section}
          project={project}
          rateOf={rateOf}
          recipes={recipes}
          onEdit={onEdit}
          index={index + 1}
        />
      ))}

      {directItems.length === 0 && subSections.length === 0 && (
        <div className="component-print-empty">No printable items in this section.</div>
      )}

      <footer className="component-print-total">
        <span>Section Total</span>
        <strong>{formatMoney(total)}</strong>
      </footer>
    </section>
  )
}

function ComponentPrintSection({
  node,
  project,
  rateOf,
  index,
  recipes
  ,onEdit
}: {
  node: ProjectNode
  project: EestimateProject | null
  rateOf: (node: ProjectNode) => number | undefined
  index: number
  recipes: Record<string, RateAnalysisRecipe>
  onEdit: (id: string) => void
}): JSX.Element {
  const items = node.children.filter((child) => child.kind === 'item')
  const children = node.children.filter(
    (child) => child.kind === 'component' || child.kind === 'subcomponent'
  )
  const total = componentItemsTotal(project, node, rateOf)

  return (
    <section className="component-print-subsection">
      <div className="component-print-subhead">
        <span>{index}</span>
        <strong>{node.name}</strong>
        <b>{formatMoney(total)}</b>
      </div>
      <ComponentPrintItems
        title="Items"
        items={items}
        project={project}
        rateOf={rateOf}
        recipes={recipes}
        onEdit={onEdit}
      />
      {children.map((child, childIndex) => (
        <ComponentPrintSection
          key={child.id}
          node={child}
          project={project}
          rateOf={rateOf}
          recipes={recipes}
          onEdit={onEdit}
          index={childIndex + 1}
        />
      ))}
    </section>
  )
}

function ComponentPrintItems({
  title,
  items,
  project,
  rateOf,
  recipes
  ,onEdit
}: {
  title: string
  items: ProjectNode[]
  project: EestimateProject | null
  rateOf: (node: ProjectNode) => number | undefined
  recipes: Record<string, RateAnalysisRecipe>
  onEdit: (id: string) => void
}): JSX.Element | null {
  if (items.length === 0) return null

  return (
    <>
      <table className="component-print-table">
        <thead>
          <tr>
            <th className="cpt-sl">Sl.</th>
            <th>{title}</th>
            <th className="cpt-unit">Unit</th>
            <th className="cpt-num">Quantity</th>
            <th className="cpt-num">Rate</th>
            <th className="cpt-num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => {
            const final = getItemFinal(project, item, rateOf(item))
            return (
              <tr key={item.id}>
                <td className="cpt-sl">{index + 1}</td>
                <td>
                  <strong>{nodeDisplayName(item)}</strong>
                  {item.itemDescription && item.itemDescription !== item.name && (
                    <span>{item.itemDescription}</span>
                  )}
                </td>
                <td className="cpt-unit">{item.unit ?? final.unit ?? ''}</td>
                <td className="cpt-num">{final.qty != null ? qtyFmt.format(final.qty) : '-'}</td>
                <td className="cpt-num">{final.rate != null ? formatMoney(final.rate) : '-'}</td>
                <td className="cpt-num">{final.amount != null ? formatMoney(final.amount) : '-'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {items.map((item) => (
        <ComponentPrintItemDetail
          key={`${item.id}-detail`}
          item={item}
          project={project}
          recipe={recipes[item.id]}
          onEdit={onEdit}
        />
      ))}
    </>
  )
}

function ComponentPrintItemDetail({
  item,
  project,
  recipe
  ,onEdit
}: {
  item: ProjectNode
  project: EestimateProject | null
  recipe?: RateAnalysisRecipe
  onEdit: (id: string) => void
}): JSX.Element {
  return (
    <section className="component-print-item-detail">
      <div className="component-print-item-title">
        <strong>{nodeDisplayName(item)}</strong>
        <div className="component-print-item-actions">
          <span>{item.unit ? `Unit: ${item.unit}` : item.itemSource ?? ''}</span>
          <button className="btn-mini" type="button" onClick={() => onEdit(item.id)}>
            Edit {item.itemEditorType === 'document' ? 'Word' : 'Excel'}
          </button>
        </div>
      </div>
      <div className="component-print-item-description">
        <PrintDescription item={item} recipe={recipe} />
      </div>
      <ItemPrintArea item={item} project={project} />
    </section>
  )
}

function PrintDescription({
  item,
  recipe
}: {
  item: ProjectNode
  recipe?: RateAnalysisRecipe
}): JSX.Element {
  const runs =
    recipe?.layout?.descriptionRuns && recipe.layout.descriptionRuns.length > 0
      ? descriptionRunsForDisplay(recipe.description, recipe.layout.descriptionRuns)
      : [plainTextRun(item.itemDescription || nodeDisplayName(item))]
  return <RichText runs={runs} />
}

function RichText({ runs }: { runs: RateAnalysisTextRun[] }): JSX.Element {
  return (
    <>
      {runs.map((run, index) => {
        let content: JSX.Element = <>{run.text}</>
        if (run.bold) content = <strong>{content}</strong>
        if (run.italic) content = <em>{content}</em>
        if (run.underline) content = <u>{content}</u>
        return <span key={`${index}-${run.text.slice(0, 12)}`}>{content}</span>
      })}
    </>
  )
}

function ItemPrintArea({
  item,
  project
}: {
  item: ProjectNode
  project: EestimateProject | null
}): JSX.Element {
  if (item.itemEditorType === 'document') {
    return (
      <div className="component-print-doc-area">
        {item.document?.trim() || 'No document content saved for this item.'}
      </div>
    )
  }

  try {
    const settings = project ? resolveNodeSettings(project.root, item.id) : null
    const snapshot = createUniverWorkbookData(item)
    const config = {
      range: item.print?.range ?? null,
      pageSize: item.print?.pageSize ?? settings?.pageSize ?? 'A4',
      orientation: item.print?.orientation ?? settings?.orientation ?? 'portrait',
      margins: item.print?.margins ?? settings?.margins ?? PREVIEW_MARGINS,
      scaleMode: item.print?.scaleMode ?? 'fit-width',
      scalePercent: item.print?.scalePercent ?? 100,
      fitToWidthPages: item.print?.fitToWidthPages ?? 1,
      showHeader: false,
      header: item.print?.header,
      showFooter: false,
      footer: item.print?.footer,
      showGridlines: item.print?.showGridlines ?? true,
      repeatHeaderRows: item.print?.repeatHeaderRows ?? 0,
      showRowColHeaders: item.print?.showRowColHeaders ?? false
    }
    const built = buildPrintHtml(
      snapshot as never,
      config,
      {
        pageSize: config.pageSize,
        orientation: config.orientation,
        margins: config.margins
      },
      {
        projectName: project?.meta.name || 'E-Estimate',
        title: nodeDisplayName(item)
      },
      item.charts ?? []
    )
    return (
      <SheetPrintFrame
        title={`${nodeDisplayName(item)} print area`}
        html={built.html}
        pageSize={config.pageSize}
        orientation={config.orientation}
        margins={config.margins}
        scale={built.pdfOptions.scale}
      />
    )
  } catch {
    return <div className="component-print-doc-area">Could not render this item print area.</div>
  }
}

function SheetPrintFrame({
  title,
  html,
  pageSize,
  orientation,
  margins,
  scale
}: {
  title: string
  html: string
  pageSize: PaperSize
  orientation: Orientation
  margins: Margins
  scale: number
}): JSX.Element {
  const [height, setHeight] = useState(220)
  const srcDoc = noScrollPrintHtml(html, scale)
  const paper = PAPER_MM[pageSize]
  const landscape = orientation === 'landscape'
  const pageWidth = landscape ? paper.height : paper.width
  const pageHeight = landscape ? paper.width : paper.height

  const resize = (event: SyntheticEvent<HTMLIFrameElement>): void => {
    const doc = event.currentTarget.contentDocument
    if (!doc) return
    const body = doc.body
    const root = doc.documentElement
    const next = Math.max(
      120,
      body.scrollHeight,
      body.offsetHeight,
      root.scrollHeight,
      root.offsetHeight
    )
    setHeight(next + 2)
  }

  return (
    <div
      className={`component-print-sheet-page ${landscape ? 'landscape' : 'portrait'}`}
      style={{
        aspectRatio: `${pageWidth} / ${pageHeight}`,
        padding: `${(margins.top / pageHeight) * 100}% ${(margins.right / pageWidth) * 100}% ${(margins.bottom / pageHeight) * 100}% ${(margins.left / pageWidth) * 100}%`
      }}
    >
      <div className="component-print-sheet-format">
        {pageSize} {landscape ? 'Landscape' : 'Portrait'} · {Math.round(scale * 100)}%
      </div>
      <iframe
        className="component-print-sheet-area"
        title={title}
        srcDoc={srcDoc}
        scrolling="no"
        style={{ height }}
        onLoad={resize}
      />
    </div>
  )
}

function noScrollPrintHtml(html: string, scale: number): string {
  const extra =
    `html,body{overflow:hidden!important;width:max-content;}` +
    `body{zoom:${Math.max(0.1, Math.min(4, scale))};}`
  return html.includes('</style>')
    ? html.replace('</style>', `${extra}</style>`)
    : html.replace('</head>', `<style>${extra}</style></head>`)
}

function formatMoney(value: number): string {
  return Number.isFinite(value) ? `Rs. ${money.format(value)}` : '-'
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
