import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDownAZ,
  ArrowLeft,
  ArrowUpAZ,
  Check,
  ChevronDown,
  ChevronRight,
  Gauge,
  Plus,
  Tags,
  X
} from 'lucide-react'
import Modal from './Modal'
import { useStore } from '../../store/useStore'
import { findNode } from '../../lib/tree'
import {
  SOR_CATEGORIES,
  SSR_CATEGORIES,
  fetchSorItems,
  fetchSsrItems,
  type MasterItem
} from '../../lib/masterData'
import type { DataVariantSelection, ProjectNode } from '../../types/project'
import {
  fetchDataVariantSpecs,
  type DataVariantOption,
  type DataVariantSpec
} from '../../lib/dataVariants'

function itemKey(m: MasterItem): string {
  return `${m.side}:${m.category}:${m.code}`
}

interface CreatedDataItem {
  /** Stable project-local DATA id shared by all Item usages. */
  id: string
  name: string
  originalCode: string
  description: string
  source: string
  unit?: string | null
}

type SortDir = 'asc' | 'desc'
type CacheEntry = { status: 'loading' | 'loaded' | 'error'; items: MasterItem[]; error?: string }
const MAX_RENDERED_ITEMS = 250

export default function AddItemModal(): JSX.Element {
  const parentId = useStore((s) => s.addItem.parentId)
  const project = useStore((s) => s.project)
  const close = useStore((s) => s.closeAddItem)
  const addItems = useStore((s) => s.addItemsFromMaster)
  const addCreatedDataItems = useStore((s) => s.addCreatedDataItems)

  const [selected, setSelected] = useState<Map<string, MasterItem>>(new Map())
  const [selectedCreated, setSelectedCreated] = useState<Set<string>>(new Set())
  const [variantSpecs, setVariantSpecs] = useState<Record<string, DataVariantSpec> | null>(null)
  const [variantSelections, setVariantSelections] = useState<Record<string, DataVariantSelection>>({})
  const [preparingVariants, setPreparingVariants] = useState(false)
  const [variantError, setVariantError] = useState<string | null>(null)

  const parentName = useMemo(() => {
    if (!project) return ''
    if (!parentId) return project.root.name
    return findNode(project.root, parentId)?.name ?? project.root.name
  }, [project, parentId])
  const createdItems = useMemo(
    () => (project ? collectCreatedDataItems(project.root) : []),
    [project]
  )

  const add = (m: MasterItem): void =>
    setSelected((prev) => new Map(prev).set(itemKey(m), m))
  const removeKey = (k: string): void =>
    setSelected((prev) => {
      const n = new Map(prev)
      n.delete(k)
      return n
    })

  const addPreparedItems = (): void => {
    if (selected.size + selectedCreated.size === 0 || !project) return
    const targetId = parentId ?? project.root.id
    if (selected.size) {
      addItems(
        targetId,
        Array.from(selected.values()).map((item) => ({
          ...item,
          dataVariant: variantSelections[item.code],
          unit: variantSelections[item.code]?.unit ?? item.unit
        }))
      )
    }
    if (selectedCreated.size) addCreatedDataItems(targetId, Array.from(selectedCreated))
    close()
  }

  const confirm = async (): Promise<void> => {
    if (selected.size + selectedCreated.size === 0 || !project) return
    if (selected.size === 0) {
      addPreparedItems()
      return
    }
    const ssrCodes = Array.from(selected.values())
      .filter((item) => item.side === 'SSR')
      .map((item) => item.code)
    if (!ssrCodes.length) {
      addPreparedItems()
      return
    }
    setPreparingVariants(true)
    setVariantError(null)
    try {
      const specs = await fetchDataVariantSpecs(ssrCodes, project.meta.sorYear)
      if (!Object.keys(specs).length) {
        addPreparedItems()
        return
      }
      setVariantSpecs(specs)
      setVariantSelections(
        Object.fromEntries(
          Object.values(specs).flatMap((spec) => {
            const option = spec.options.find((candidate) => candidate.key === spec.defaultOptionKey)
            if (!option || spec.kind !== 'optional_addition') return []
            return [[spec.code, {
              kind: spec.kind,
              key: option.key,
              label: option.label,
              sourceYear: spec.year,
              unit: option.basisUnit,
              addonId: option.addonId
            } satisfies DataVariantSelection]]
          })
        )
      )
    } catch (error) {
      setVariantError(error instanceof Error ? error.message : String(error))
    } finally {
      setPreparingVariants(false)
    }
  }

  const variantCodes = variantSpecs ? Object.keys(variantSpecs) : []
  const allVariantsChosen = variantCodes.every((code) => Boolean(variantSelections[code]))
  const selectedCount = selected.size + selectedCreated.size

  const footer = (
    <>
      <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>
        Adding to <b style={{ color: 'var(--text)' }}>{parentName}</b>
      </span>
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn ghost" onClick={close}>
          Cancel
        </button>
        {variantSpecs ? (
          <>
            <button
              className="btn ghost"
              onClick={() => {
                setVariantSpecs(null)
                setVariantSelections({})
              }}
            >
              <ArrowLeft size={15} /> Back
            </button>
            <button className="btn" disabled={!allVariantsChosen} onClick={addPreparedItems}>
              <Check size={15} /> Add Prepared DATA{selectedCount === 1 ? '' : 's'}
            </button>
          </>
        ) : (
          <button
            className="btn"
            disabled={selectedCount === 0 || preparingVariants}
            onClick={() => void confirm()}
          >
            <Plus size={15} />
            {preparingVariants
              ? 'Checking variants…'
              : `Add Item${selectedCount === 1 ? '' : 's'}${
                  selectedCount > 0 ? ` (${selectedCount})` : ''
                }`}
          </button>
        )}
      </div>
    </>
  )

  return (
    <Modal title="Add Item" size="lg" onClose={close} bodyFlush footer={footer}>
      {variantSpecs ? (
        <VariantReview
          specs={variantSpecs}
          selections={variantSelections}
          onSelect={(code, spec, option) =>
            setVariantSelections((current) => ({
              ...current,
              [code]: {
                kind: spec.kind as DataVariantSelection['kind'],
                key: option.key,
                label: option.label,
                sourceYear: spec.year,
                unit: option.basisUnit,
                addonId: option.addonId
              }
            }))
          }
        />
      ) : (
        <>
          <div className="additem-cols">
            <Column
              side="SSR"
              tag="Unified SSR / TAW DAW CAW GAW CCDW PMW"
              categories={SSR_CATEGORIES}
              fetcher={fetchSsrItems}
              selected={selected}
              onAdd={add}
              onRemove={removeKey}
            />
            <Column
              side="SOR"
              tag="Basic rates · Material Labour Machinery Plumbing Electrical Civil"
              categories={SOR_CATEGORIES}
              fetcher={fetchSorItems}
              selected={selected}
              onAdd={add}
              onRemove={removeKey}
            />
            <CreatedDataColumn
              items={createdItems}
              selected={selectedCreated}
              onToggle={(createdDataId) =>
                setSelectedCreated((current) => {
                  const next = new Set(current)
                  if (next.has(createdDataId)) next.delete(createdDataId)
                  else next.add(createdDataId)
                  return next
                })
              }
            />
          </div>
          {variantError && (
            <div className="data-variant-error">Could not read DATA variants: {variantError}</div>
          )}
          <SelectedBar selected={selected} onRemove={removeKey} />
        </>
      )}
    </Modal>
  )
}

function VariantReview({
  specs,
  selections,
  onSelect
}: {
  specs: Record<string, DataVariantSpec>
  selections: Record<string, DataVariantSelection>
  onSelect: (code: string, spec: DataVariantSpec, option: DataVariantOption) => void
}): JSX.Element {
  const money = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
  return (
    <div className="data-variant-review">
      <div className="data-variant-review-heading">
        <span className="data-variant-heading-icon">
          <Tags size={20} />
        </span>
        <div>
          <h3>Prepare multi-rate DATA</h3>
          <p>
            Published rates are classified by purpose. Choose the applicable class, depth band,
            or optional addition.
          </p>
        </div>
      </div>
      <div className="data-variant-cards">
        {Object.values(specs).map((spec) => (
          <section className="data-variant-card" key={spec.code}>
            <div className="data-variant-card-title">
              <span>
                {spec.kind === 'quantity_band' || spec.kind === 'upto'
                  ? <Gauge size={17} />
                  : <Tags size={17} />}
              </span>
              <div>
                <strong>{spec.code}</strong>
                <small>
                  {spec.kind === 'optional_addition'
                    ? 'Optional addition · base DATA remains valid without it'
                    : spec.kind === 'quantity_band' || spec.kind === 'upto'
                      ? 'Quantity / depth band · split quantity by interval'
                      : 'Published type choice · one applicable basis'}
                </small>
              </div>
            </div>
            {spec.description ? (
              <p className="data-variant-description" title={spec.description}>
                {spec.description}
              </p>
            ) : null}
            <p>{spec.prompt}</p>
            <div className="data-variant-options">
              {spec.options.map((option) => {
                const checked = selections[spec.code]?.key === option.key
                return (
                  <button
                    type="button"
                    key={option.key}
                    className={checked ? 'selected' : ''}
                    onClick={() => onSelect(spec.code, spec, option)}
                  >
                    <span className="data-variant-radio">{checked ? <Check size={13} /> : null}</span>
                    <span>
                      <strong>{option.label}</strong>
                      {option.basisQuantity ? (
                        <small>
                          Basis: {option.basisQuantity} {option.basisUnit ?? ''}
                        </small>
                      ) : null}
                    </span>
                    <b>₹ {money.format(option.rate)}</b>
                  </button>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

function collectCreatedDataItems(root: ProjectNode): CreatedDataItem[] {
  const items = new Map<string, CreatedDataItem>()

  function visit(node: ProjectNode): void {
    if (node.kind === 'item' && node.splitFromItemKey) {
      const id = node.createdDataId ?? node.id
      if (!items.has(id)) items.set(id, {
        id,
        name: node.name,
        originalCode: node.itemCode?.trim() || node.splitFromItemKey,
        description: node.itemDescription ?? node.name,
        source: node.itemSource ?? 'DATA',
        unit: node.unit
      })
    }
    node.children.forEach(visit)
  }

  visit(root)
  return Array.from(items.values()).sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true })
  )
}

function CreatedDataColumn({
  items,
  selected,
  onToggle
}: {
  items: CreatedDataItem[]
  selected: Set<string>
  onToggle: (createdDataId: string) => void
}): JSX.Element {
  return (
    <div className="additem-col created-data-col">
      <div className="col-header">
        <h3>Created DATAs</h3>
        <span className="col-tag">Project-local reusable DATA</span>
      </div>
      <div className="created-data-list">
        {items.length === 0 ? (
          <div className="created-data-empty">Created DATA will appear here.</div>
        ) : (
          items.map((item) => (
            <button
              type="button"
              className={`created-data-row ${selected.has(item.id) ? 'selected' : ''}`}
              key={item.id}
              title={item.description}
              onClick={() => onToggle(item.id)}
            >
              <div className="created-data-main">
                <span className="created-data-check">
                  {selected.has(item.id) ? <Check size={12} /> : null}
                </span>
                <span className="created-data-name">{item.name}</span>
                <span className="created-data-origin">{item.originalCode}</span>
              </div>
              <span className="created-data-desc">{item.description}</span>
              <span className="created-data-meta">
                {item.source}
                {item.unit ? ` | ${item.unit}` : ''}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

interface ColumnProps {
  side: 'SSR' | 'SOR'
  tag: string
  categories: { key: string; label: string }[]
  fetcher: (key: string) => Promise<MasterItem[]>
  selected: Map<string, MasterItem>
  onAdd: (m: MasterItem) => void
  onRemove: (key: string) => void
}

function Column({
  side,
  tag,
  categories,
  fetcher,
  selected,
  onAdd,
  onRemove
}: ColumnProps): JSX.Element {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [cache, setCache] = useState<Record<string, CacheEntry>>({})

  const cacheRef = useRef(cache)
  cacheRef.current = cache
  const loadingRef = useRef<Set<string>>(new Set())

  const load = async (key: string): Promise<void> => {
    const existing = cacheRef.current[key]
    if (loadingRef.current.has(key)) return
    if (existing && existing.status !== 'error') return
    loadingRef.current.add(key)
    setCache((p) => ({ ...p, [key]: { status: 'loading', items: [] } }))
    try {
      const items = await fetcher(key)
      setCache((p) => ({ ...p, [key]: { status: 'loaded', items } }))
    } catch (e) {
      setCache((p) => ({ ...p, [key]: { status: 'error', items: [], error: String(e) } }))
    } finally {
      loadingRef.current.delete(key)
    }
  }

  const toggle = (key: string): void => {
    setExpanded((p) => ({ ...p, [key]: !p[key] }))
    if (!expanded[key]) void load(key)
  }

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 250)
    return () => window.clearTimeout(timer)
  }, [search])

  // A settled search auto-expands every category on this side and loads them lazily.
  useEffect(() => {
    if (!debouncedSearch.trim()) return
    setExpanded((prev) => {
      const next = { ...prev }
      categories.forEach((c) => (next[c.key] = true))
      return next
    })
    categories.forEach((c) => void load(c.key))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch])

  const q = debouncedSearch.trim().toLowerCase()

  return (
    <div className="additem-col">
      <div className="col-header">
        <h3>{side} Data</h3>
        <span className="col-tag">{tag}</span>
      </div>
      <div className="col-toolbar">
        <input
          className="text-input"
          placeholder={`Search ${side}…`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          className={`icon-toggle ${sortDir === 'asc' ? 'active' : ''}`}
          title="Sort A→Z"
          onClick={() => setSortDir('asc')}
        >
          <ArrowDownAZ size={15} />
        </button>
        <button
          className={`icon-toggle ${sortDir === 'desc' ? 'active' : ''}`}
          title="Sort Z→A"
          onClick={() => setSortDir('desc')}
        >
          <ArrowUpAZ size={15} />
        </button>
      </div>
      <div className="col-list">
        {categories.map((cat) => {
          const entry = cache[cat.key]
          const isOpen = !!expanded[cat.key]
          let items = entry?.items ?? []
          if (q) {
            items = items.filter(
              (it) =>
                it.description.toLowerCase().includes(q) || it.code.toLowerCase().includes(q)
            )
          }
          if (sortDir === 'desc') items = [...items].reverse()
          const resultCount = items.length
          const visibleItems = items.slice(0, MAX_RENDERED_ITEMS)
          return (
            <div className="cat-group" key={cat.key}>
              <button className="cat-head" onClick={() => toggle(cat.key)}>
                {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                {cat.label}
                <span className="cat-count">
                  {entry?.status === 'loaded' ? resultCount : ''}
                </span>
              </button>
              {isOpen && (
                <div className="cat-items">
                  {(!entry || entry.status === 'loading') && (
                    <div className="cat-loading">Loading…</div>
                  )}
                  {entry?.status === 'error' && (
                    <div className="cat-error">Failed to load — check the connection.</div>
                  )}
                  {entry?.status === 'loaded' && items.length === 0 && (
                    <div className="cat-loading">No items{q ? ' match your search' : ''}.</div>
                  )}
                  {entry?.status === 'loaded' &&
                    visibleItems.map((it) => {
                      const key = itemKey(it)
                      const added = selected.has(key)
                      return (
                        <div key={key} className={`item-row ${added ? 'added' : ''}`}>
                          <span className="item-code">{it.code}</span>
                          <span className="item-desc" title={it.description}>
                            {it.description}
                          </span>
                          {it.unit && <span className="item-unit">{it.unit}</span>}
                          <button
                            className="item-add-btn"
                            title={added ? 'Remove' : 'Add'}
                            onClick={() => (added ? onRemove(key) : onAdd(it))}
                          >
                            {added ? <Check size={13} /> : <Plus size={13} />}
                          </button>
                        </div>
                      )
                    })}
                  {entry?.status === 'loaded' && resultCount > MAX_RENDERED_ITEMS && (
                    <div className="cat-loading">
                      Showing the first {MAX_RENDERED_ITEMS} of {resultCount}. Refine the search to
                      narrow the list.
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SelectedBar({
  selected,
  onRemove
}: {
  selected: Map<string, MasterItem>
  onRemove: (key: string) => void
}): JSX.Element {
  const entries = Array.from(selected.entries())
  return (
    <div className="selected-bar">
      <div className="sb-title">Selected ({entries.length})</div>
      {entries.length === 0 ? (
        <div className="selected-empty">No items selected yet — add from either side.</div>
      ) : (
        <div className="selected-chips">
          {entries.map(([k, m]) => (
            <span className="selected-chip" key={k} title={m.description}>
              <span className="sc-side">{m.side}</span>
              <span className="sc-label">{m.code}</span>
              <button onClick={() => onRemove(k)} title="Remove">
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
