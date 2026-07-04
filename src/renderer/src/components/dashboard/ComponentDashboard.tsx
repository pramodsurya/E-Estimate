import { FilePlus2, Layers, ListPlus, Plus, Settings } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../../store/useStore'
import type { ProjectNode } from '../../types/project'
import { NodeIcon, nodeDisplayName } from '../nodeVisual'
import { componentItemsTotal, getItemFinal } from '../../lib/finalNumber'
import { fetchItemRate } from '../../lib/rateAnalysis'

const money = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 })
const qtyFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 })

export default function ComponentDashboard({ node }: { node: ProjectNode }): JSX.Element {
  const addSubcomponent = useStore((s) => s.addSubcomponent)
  const openAddPage = useStore((s) => s.openAddPage)
  const openAddItem = useStore((s) => s.openAddItem)
  const openSettings = useStore((s) => s.openSettings)
  const select = useStore((s) => s.select)
  const project = useStore((s) => s.project)

  const subcomponents = node.children.filter((c) => c.kind === 'subcomponent')
  const items = node.children.filter((c) => c.kind === 'item')
  const pages = node.children.filter((c) => c.kind === 'page')
  const isSub = node.kind === 'subcomponent'

  const sorYear = project?.meta.sorYear ?? ''

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
  useEffect(() => {
    let cancelled = false
    const load = async (): Promise<void> => {
      const entries = await Promise.all(
        allItems.map(async (it) => [it.id, await fetchItemRate(it, sorYear)] as const)
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
  }, [allItems, sorYear])

  const rateOf = (n: ProjectNode): number | undefined => rates[n.id]
  const componentTotal = componentItemsTotal(project, node, rateOf)

  return (
    <div className="dashboard">
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
        </div>
      </div>

      <div className="dash-grid">
        <div className="dash-card">
          <div className="card-title">Summary</div>
          <div className="meta-row">
            <span className="meta-key">Sub-components</span>
            <span className="meta-val">{subcomponents.length}</span>
          </div>
          <div className="meta-row">
            <span className="meta-key">Items</span>
            <span className="meta-val">{items.length}</span>
          </div>
          <div className="meta-row">
            <span className="meta-key">Pages</span>
            <span className="meta-val">{pages.length}</span>
          </div>
        </div>

        <div className="dash-card">
          <div className="card-title">Component Cost</div>
          <div className="total-figure">{componentTotal > 0 ? `₹ ${money.format(componentTotal)}` : '—'}</div>
          <div className="list-empty">
            {componentTotal > 0
              ? 'Sum of item amounts (fixed final number × rate).'
              : 'Fix a final number on items (with a rate) to total here.'}
          </div>
        </div>

        <div className="dash-card">
          <div className="card-title">Structure</div>
          <div className="placeholder-box">Structure view — later part.</div>
        </div>

        {!isSub && (
          <div className="dash-card span-2">
            <div className="card-title">
              Sub-components
              <button className="btn ghost" onClick={() => addSubcomponent(node.id)}>
                <Plus size={14} /> Add
              </button>
            </div>
            {subcomponents.length ? (
              <div className="list-rows">
                {subcomponents.map((c) => (
                  <div key={c.id} className="list-row" onClick={() => select(c.id)}>
                    <NodeIcon node={c} size={15} />
                    <span className="lr-name">{c.name}</span>
                    <span className="lr-tag">{c.children.length} item(s)</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="list-empty">No sub-components yet.</div>
            )}
          </div>
        )}

        <div className="dash-card span-2">
          <div className="card-title">
            Items
            <button className="btn ghost" onClick={() => openAddItem(node.id)}>
              <Plus size={14} /> Add Item
            </button>
          </div>
          {items.length ? (
            <div className="list-rows">
              {items.map((it) => {
                const final = getItemFinal(project, it, rates[it.id])
                return (
                  <div key={it.id} className="list-row" onClick={() => select(it.id)}>
                    <NodeIcon node={it} size={15} />
                    <span className="lr-name" title={it.itemDescription}>
                      {nodeDisplayName(it)}
                    </span>
                    {it.splitFromItemKey && <span className="lr-tag">{it.itemCode}</span>}
                    <span className="lr-qty">
                      {final.qty != null
                        ? `${qtyFmt.format(final.qty)}${it.unit ? ` ${it.unit}` : ''}`
                        : it.unit
                          ? it.unit
                          : '—'}
                    </span>
                    <span className="lr-rate">
                      {final.rate != null ? `× ₹${money.format(final.rate)}` : ''}
                    </span>
                    <span className="lr-amount">
                      {final.amount != null ? `= ₹${money.format(final.amount)}` : ''}
                    </span>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="list-empty">No items yet. Use “Add Item”.</div>
          )}
        </div>

        {pages.length > 0 && (
          <div className="dash-card span-2">
            <div className="card-title">Pages</div>
            <div className="list-rows">
              {pages.map((p) => (
                <div key={p.id} className="list-row" onClick={() => select(p.id)}>
                  <NodeIcon node={p} size={15} />
                  <span className="lr-name">{p.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
