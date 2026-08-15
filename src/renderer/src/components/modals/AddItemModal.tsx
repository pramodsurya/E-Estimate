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
import { projectDataRate } from '../../lib/projectData'
import {
  SOR_CATEGORIES,
  SSR_CATEGORIES,
  fetchSorItems,
  fetchSsrItems,
  type MasterItem
} from '../../lib/masterData'
import type { DataVariantSelection, ProjectDataDefinition } from '../../types/project'
import SsrCode from '../templates/SsrCode'
import SorCatalogueColumn from './SorCatalogueColumn'
import {
  fetchDataVariantSpecs,
  type DataVariantOption,
  type DataVariantSpec
} from '../../lib/dataVariants'
import {
  applySemanticScores,
  parseMasterSearch,
  rankMasterItems,
  shouldUseSemanticSearch,
  type MasterSearchMatch
} from '../../lib/masterSearch'
import {
  rerankMasterSearch,
  semanticCandidateMatches,
  type SemanticSearchProgress
} from '../../lib/semanticMasterSearch'

function itemKey(m: MasterItem): string {
  return `${m.side}:${m.category}:${m.code}`
}

type SortDir = 'asc' | 'desc'
type CacheEntry = { status: 'loading' | 'loaded' | 'error'; items: MasterItem[]; error?: string }
interface SemanticRankingState extends SemanticSearchProgress {
  signature: string
  scores: Record<string, number>
}
const MAX_RENDERED_ITEMS = 250

export default function AddItemModal(): JSX.Element {
  const parentId = useStore((s) => s.addItem.parentId)
  const project = useStore((s) => s.project)
  const close = useStore((s) => s.closeAddItem)
  const addItems = useStore((s) => s.addItemsFromMaster)
  const addProjectDataItems = useStore((s) => s.addProjectDataItems)

  const [selected, setSelected] = useState<Map<string, MasterItem>>(new Map())
  const [selectedProjectData, setSelectedProjectData] = useState<Set<string>>(new Set())
  const [variantSpecs, setVariantSpecs] = useState<Record<string, DataVariantSpec> | null>(null)
  const [variantSelections, setVariantSelections] = useState<Record<string, DataVariantSelection>>({})
  const [preparingVariants, setPreparingVariants] = useState(false)
  const [variantError, setVariantError] = useState<string | null>(null)

  const parentName = useMemo(() => {
    if (!project) return ''
    if (!parentId) return project.root.name
    return findNode(project.root, parentId)?.name ?? project.root.name
  }, [project, parentId])
  const projectData = project?.projectData ?? []
  const add = (m: MasterItem): void =>
    setSelected((prev) => new Map(prev).set(itemKey(m), m))
  const removeKey = (k: string): void =>
    setSelected((prev) => {
      const n = new Map(prev)
      n.delete(k)
      return n
    })

  const addPreparedItems = (): void => {
    if (selected.size + selectedProjectData.size === 0 || !project) return
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
    if (selectedProjectData.size) {
      addProjectDataItems(targetId, Array.from(selectedProjectData))
    }
    close()
  }

  const confirm = async (): Promise<void> => {
    if (selected.size + selectedProjectData.size === 0 || !project) return
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
  const selectedCount = selected.size + selectedProjectData.size

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
            <SorSelectionColumn
              sorYear={project?.meta.sorYear ?? ''}
              selected={selected}
              onAdd={add}
              onRemove={removeKey}
            />
            <ProjectDataColumn
              definitions={projectData}
              selected={selectedProjectData}
              onToggle={(id) =>
                setSelectedProjectData((current) => {
                  const next = new Set(current)
                  if (next.has(id)) next.delete(id)
                  else next.add(id)
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

function ProjectDataColumn({
  definitions,
  selected,
  onToggle
}: {
  definitions: ProjectDataDefinition[]
  selected: Set<string>
  onToggle: (id: string) => void
}): JSX.Element {
  return (
    <div className="additem-col project-data-col">
      <div className="col-header">
        <h3>Project DATA</h3>
        <span className="col-tag">Created in DATA Dashboard</span>
      </div>
      <div className="project-data-list">
        {definitions.length === 0 ? (
          <div className="project-data-empty">
            Create a DATA in the DATA Dashboard, then add it to this Component here.
          </div>
        ) : (
          definitions.map((definition) => {
            const selectedHere = selected.has(definition.id)
            const rate = projectDataRate(definition)
            return (
              <button
                type="button"
                className={`project-data-row ${selectedHere ? 'selected' : ''}`}
                key={definition.id}
                title={definition.description}
                onClick={() => onToggle(definition.id)}
              >
                <span className="project-data-check">{selectedHere ? <Check size={12} /> : null}</span>
                <span className="project-data-copy">
                  <strong>{definition.code}</strong>
                  <span>{definition.description}</span>
                  <small>
                    {definition.kind === 'ssr' ? 'SSR type' : 'SOR type'} · ₹ {rate.toLocaleString('en-IN')} / {definition.unit}
                  </small>
                </span>
              </button>
            )
          })
        )}
      </div>
    </div>
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

interface ColumnProps {
  side: 'SSR' | 'SOR'
  tag: string
  categories: { key: string; label: string }[]
  fetcher: (key: string) => Promise<MasterItem[]>
  selected: Map<string, MasterItem>
  onAdd: (m: MasterItem) => void
  onRemove: (key: string) => void
  trailingCategory?: JSX.Element
}

/**
 * The same SSR search, category, and AI-ranking selector used by Add Item.
 * Other workflows can pick one SSR code without duplicating a second search UI.
 */
export function SsrCodeSelectionColumn({
  onPick
}: {
  onPick: (item: MasterItem) => void
}): JSX.Element {
  return (
    <Column
      side="SSR"
      tag="Unified SSR / TAW DAW CAW GAW CCDW PMW"
      categories={SSR_CATEGORIES}
      fetcher={fetchSsrItems}
      selected={new Map()}
      onAdd={onPick}
      onRemove={() => undefined}
    />
  )
}

/**
 * Read-only DATA browser input. It deliberately reuses the exact Add Item
 * selectors so code search (including AI ranking), categories, and the SOR
 * catalogue behave identically everywhere.
 */
export function BackendDataSelectionColumns({
  sorYear,
  onPick
}: {
  sorYear: string
  onPick: (item: MasterItem) => void
}): JSX.Element {
  const [source, setSource] = useState<'SOR' | 'SSR'>('SSR')
  const selected = new Map<string, MasterItem>()
  return (
    <div className="backend-data-selection-cols">
      <div className="backend-data-source-tabs" role="tablist" aria-label="Backend DATA source">
        <button
          type="button"
          role="tab"
          aria-selected={source === 'SSR'}
          className={source === 'SSR' ? 'active' : ''}
          onClick={() => setSource('SSR')}
        >
          SSR DATA
          <small>AI code search</small>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={source === 'SOR'}
          className={source === 'SOR' ? 'active' : ''}
          onClick={() => setSource('SOR')}
        >
          SOR DATA
          <small>Rates &amp; catalogue</small>
        </button>
      </div>
      <div className="backend-data-code-list">
        {source === 'SSR' ? (
          <Column
            side="SSR"
            tag="Unified SSR / TAW DAW CAW GAW CCDW PMW"
            categories={SSR_CATEGORIES}
            fetcher={fetchSsrItems}
            selected={selected}
            onAdd={onPick}
            onRemove={() => undefined}
          />
        ) : (
          <SorSelectionColumn
            sorYear={sorYear}
            selected={selected}
            onAdd={onPick}
            onRemove={() => undefined}
          />
        )}
      </div>
    </div>
  )
}

function SorSelectionColumn({
  sorYear,
  selected,
  onAdd,
  onRemove
}: {
  sorYear: string
  selected: Map<string, MasterItem>
  onAdd: (item: MasterItem) => void
  onRemove: (key: string) => void
}): JSX.Element {
  const [mode, setMode] = useState<'catalogue' | 'basic'>('basic')

  if (mode === 'basic') {
    return (
      <Column
        side="SOR"
        tag="Basic item tables"
        categories={SOR_CATEGORIES}
        fetcher={fetchSorItems}
        selected={selected}
        onAdd={onAdd}
        onRemove={onRemove}
        trailingCategory={
          <div className="cat-group sor-others-group">
            <button
              type="button"
              className="cat-head sor-others-head"
              onClick={() => setMode('catalogue')}
            >
              <ChevronRight size={14} />
              Others
              <span className="cat-count sor-others-count">Catalogue</span>
            </button>
          </div>
        }
      />
    )
  }

  return (
    <SorCatalogueColumn
      sorYear={sorYear}
      selected={selected}
      onAdd={onAdd}
      onRemove={onRemove}
      onShowBasicRates={() => setMode('basic')}
    />
  )
}

function Column({
  side,
  tag,
  categories,
  fetcher,
  selected,
  onAdd,
  onRemove,
  trailingCategory
}: ColumnProps): JSX.Element {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [cache, setCache] = useState<Record<string, CacheEntry>>({})
  const [semanticRanking, setSemanticRanking] = useState<SemanticRankingState | null>(null)

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

  const q = debouncedSearch.trim()
  const parsedSearch = useMemo(() => parseMasterSearch(q), [q])
  const loadedItems = useMemo(
    () =>
      categories.flatMap((category) => {
        const entry = cache[category.key]
        return entry?.status === 'loaded' ? entry.items : []
      }),
    [cache, categories]
  )
  const lexicalMatches = useMemo(
    () => (q ? rankMasterItems(loadedItems, parsedSearch) : []),
    [loadedItems, parsedSearch, q]
  )
  const searchSettled =
    !q ||
    categories.every((category) => {
      const status = cache[category.key]?.status
      return status === 'loaded' || status === 'error'
    })
  const semanticCandidates = useMemo(
    () => semanticCandidateMatches(lexicalMatches),
    [lexicalMatches]
  )
  const semanticSignature = useMemo(
    () => `${parsedSearch.normalized}|${semanticCandidates.map((match) => match.key).join('|')}`,
    [parsedSearch.normalized, semanticCandidates]
  )

  useEffect(() => {
    if (
      !q ||
      !searchSettled ||
      !shouldUseSemanticSearch(parsedSearch) ||
      semanticCandidates.length < 2
    ) {
      setSemanticRanking(null)
      return
    }

    let active = true
    const updateProgress = (progress: SemanticSearchProgress): void => {
      if (!active) return
      setSemanticRanking({
        ...progress,
        signature: semanticSignature,
        scores: {}
      })
    }
    updateProgress({ status: 'loading', message: 'Preparing AI relevance ranking' })
    void rerankMasterSearch(q, semanticCandidates, updateProgress)
      .then((scores) => {
        if (!active) return
        setSemanticRanking({
          status: 'ready',
          message: 'AI-ranked from item descriptions',
          signature: semanticSignature,
          scores
        })
      })
      .catch((error) => {
        if (!active) return
        setSemanticRanking({
          status: 'fallback',
          message: `Description ranking active · ${
            error instanceof Error ? error.message : 'AI unavailable'
          }`,
          signature: semanticSignature,
          scores: {}
        })
      })

    return () => {
      active = false
    }
  }, [parsedSearch, q, searchSettled, semanticCandidates, semanticSignature])

  const rankedMatches = useMemo(() => {
    if (
      semanticRanking?.status !== 'ready' ||
      semanticRanking.signature !== semanticSignature
    ) {
      return lexicalMatches
    }
    return applySemanticScores(lexicalMatches, semanticRanking.scores)
  }, [lexicalMatches, semanticRanking, semanticSignature])
  const searchMatches = useMemo(
    () => new Map(rankedMatches.map((match) => [match.key, match])),
    [rankedMatches]
  )

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
      {q ? (
        <div className={`master-search-summary ${semanticRanking?.status ?? 'lexical'}`}>
          <span>
            {parsedSearch.exactConstraints.length > 0
              ? `Exact ${parsedSearch.exactConstraints
                  .map((value) => value.toUpperCase())
                  .join(', ')}`
              : 'Description relevance'}
            {' · '}
            {rankedMatches.length} match{rankedMatches.length === 1 ? '' : 'es'}
          </span>
          <small>
            {!searchSettled
              ? 'Loading item descriptions…'
              : semanticRanking?.message ?? 'Exact and description ranking'}
          </small>
        </div>
      ) : null}
      <div className="col-list">
        {categories.map((cat) => {
          const entry = cache[cat.key]
          const isOpen = !!expanded[cat.key]
          let rows: Array<{ item: MasterItem; match?: MasterSearchMatch }> = (
            entry?.items ?? []
          ).map((item) => ({
            item,
            match: q ? searchMatches.get(itemKey(item)) : undefined
          }))
          if (q) {
            rows = rows
              .filter(
                (row): row is { item: MasterItem; match: MasterSearchMatch } =>
                  row.match !== undefined
              )
              .sort(
                (left, right) =>
                  right.match.finalScore - left.match.finalScore ||
                  left.item.description.localeCompare(right.item.description)
              )
          } else if (sortDir === 'desc') {
            rows = [...rows].reverse()
          }
          const resultCount = rows.length
          const visibleRows = rows.slice(0, MAX_RENDERED_ITEMS)
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
                  {entry?.status === 'loaded' && rows.length === 0 && (
                    <div className="cat-loading">No items{q ? ' match your search' : ''}.</div>
                  )}
                  {entry?.status === 'loaded' &&
                    visibleRows.map(({ item: it, match }) => {
                      const key = itemKey(it)
                      const added = selected.has(key)
                      return (
                        <div key={key} className={`item-row ${added ? 'added' : ''}`}>
                          {side !== 'SOR' ? (
                            <SsrCode
                              code={it.code}
                              description={it.description}
                              className="item-code"
                              strong={false}
                            />
                          ) : null}
                          <span className="item-desc-stack" title={it.description}>
                            <span className="item-desc">{it.description}</span>
                            {q && match && match.reasons.length > 0 ? (
                              <span className="item-search-reason">
                                {match.reasons.join(' · ')}
                              </span>
                            ) : null}
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
        {trailingCategory}
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
              {m.side === 'SOR' ? (
                <span className="sc-label">{m.description}</span>
              ) : (
                <SsrCode
                  code={m.code}
                  description={m.description}
                  className="sc-label"
                  strong={false}
                />
              )}
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
