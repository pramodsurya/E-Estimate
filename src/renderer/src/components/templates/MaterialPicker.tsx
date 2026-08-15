import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Check, X } from 'lucide-react'
import { SSR_CATEGORIES, fetchSsrItems, type MasterItem } from '../../lib/masterData'
import { fetchDataVariantSpecs, type DataVariantSpec } from '../../lib/dataVariants'
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
import type { DataVariantSelection } from '../../types/project'
import { useStore } from '../../store/useStore'
import SsrCode from './SsrCode'
import DataVariantReview, {
  defaultSelectionForVariantSpec,
  selectionForVariantOption
} from './DataVariantReview'

const MAX_PICKER_RESULTS = 60

interface SemanticRanking extends SemanticSearchProgress {
  signature: string
  scores: Record<string, number>
}

/**
 * SSR item chooser used by the component templates to attach a code to a
 * computed quantity. Shared so Guide Wall and Bund stay in step.
 */
export default function MaterialPicker({
  onPick,
  onClose,
  initialCategory = 'IRR-CCDW',
  initialSearch = '',
  selectionHint
}: {
  onPick: (item: MasterItem) => void
  onClose: () => void
  /** Category to open on — pick the one the role's default code lives in. */
  initialCategory?: string
  initialSearch?: string
  selectionHint?: string
}): JSX.Element {
  const project = useStore((state) => state.project)
  const [category, setCategory] = useState(initialCategory)
  const [search, setSearch] = useState(initialSearch)
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch)
  const [semanticRanking, setSemanticRanking] = useState<SemanticRanking | null>(null)
  const [items, setItems] = useState<MasterItem[]>([])
  const [loading, setLoading] = useState(false)
  const [checkingVariant, setCheckingVariant] = useState(false)
  const [variantError, setVariantError] = useState<string | null>(null)
  const [pendingItem, setPendingItem] = useState<MasterItem | null>(null)
  const [variantSpec, setVariantSpec] = useState<DataVariantSpec | null>(null)
  const [variantSelection, setVariantSelection] = useState<DataVariantSelection | undefined>()
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    void fetchSsrItems(category)
      .then((list) => {
        if (cancelled) return
        setItems(list)
      })
      .catch((error) => {
        if (cancelled) return
        setItems([])
        setLoadError(error instanceof Error ? error.message : String(error))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [category])

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 250)
    return () => window.clearTimeout(timer)
  }, [search])

  // Same ranking pipeline as the Add DATA modal: exact constraints and
  // description relevance first, then the AI worker re-orders the shortlist.
  // A plain substring filter used to require the whole typed phrase to appear
  // verbatim, so natural queries like "excavation drain seating" found nothing.
  const q = debouncedSearch.trim()
  const parsedSearch = useMemo(() => parseMasterSearch(q), [q])
  const lexicalMatches = useMemo(
    () => (q ? rankMasterItems(items, parsedSearch) : []),
    [items, parsedSearch, q]
  )
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
      loading ||
      !shouldUseSemanticSearch(parsedSearch) ||
      semanticCandidates.length < 2
    ) {
      setSemanticRanking(null)
      return
    }

    let active = true
    const updateProgress = (progress: SemanticSearchProgress): void => {
      if (!active) return
      setSemanticRanking({ ...progress, signature: semanticSignature, scores: {} })
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
  }, [loading, parsedSearch, q, semanticCandidates, semanticSignature])

  const rankedMatches = useMemo(() => {
    if (semanticRanking?.status !== 'ready' || semanticRanking.signature !== semanticSignature) {
      return lexicalMatches
    }
    return applySemanticScores(lexicalMatches, semanticRanking.scores)
  }, [lexicalMatches, semanticRanking, semanticSignature])

  const rows: Array<{ item: MasterItem; match?: MasterSearchMatch }> = q
    ? rankedMatches.slice(0, MAX_PICKER_RESULTS).map((match) => ({ item: match.item, match }))
    : items.slice(0, MAX_PICKER_RESULTS).map((item) => ({ item }))

  const inspectAndPick = async (item: MasterItem): Promise<void> => {
    const year = project?.meta.sorYear
    if (!year) {
      onPick(item)
      return
    }
    setCheckingVariant(true)
    setVariantError(null)
    try {
      const specs = await fetchDataVariantSpecs([item.code], year)
      const spec = specs[item.code]
      if (!spec) {
        onPick(item)
        return
      }
      setPendingItem(item)
      setVariantSpec(spec)
      setVariantSelection(defaultSelectionForVariantSpec(spec))
    } catch (error) {
      setVariantError(error instanceof Error ? error.message : String(error))
    } finally {
      setCheckingVariant(false)
    }
  }

  if (pendingItem && variantSpec) {
    return (
      <div className="gw-picker template-variant-picker">
        <DataVariantReview
          heading="Choose DATA variant / add-on"
          specs={{ [variantSpec.code]: variantSpec }}
          selections={variantSelection ? { [variantSpec.code]: variantSelection } : {}}
          onSelect={(_code, spec, option) =>
            setVariantSelection(selectionForVariantOption(spec, option))
          }
        />
        <div className="template-variant-actions">
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              setPendingItem(null)
              setVariantSpec(null)
              setVariantSelection(undefined)
            }}
          >
            <ArrowLeft size={14} /> Back to codes
          </button>
          <button
            type="button"
            className="btn"
            disabled={!variantSelection}
            onClick={() =>
              onPick({
                ...pendingItem,
                dataVariant: variantSelection,
                unit: variantSelection?.unit ?? pendingItem.unit
              })
            }
          >
            <Check size={14} /> Apply code
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="gw-picker">
      <div className="gw-picker-head">
        <select
          className="text-input"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          {SSR_CATEGORIES.map((cat) => (
            <option key={cat.key} value={cat.key}>
              {cat.label}
            </option>
          ))}
        </select>
        <input
          className="text-input"
          placeholder="Search code or description…"
          value={search}
          autoFocus
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          type="button"
          className="panel-iconbtn"
          title="Close"
          aria-label="Close code picker"
          onClick={onClose}
        >
          <X size={14} />
        </button>
      </div>
      {selectionHint && <div className="gw-picker-help">{selectionHint}</div>}
      {q && !loading && !loadError ? (
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
          <small>{semanticRanking?.message ?? 'Exact and description ranking'}</small>
        </div>
      ) : null}
      <div className="gw-picker-list">
        {loading ? (
          <div className="latlng-display">Loading items…</div>
        ) : loadError ? (
          <div className="data-variant-error">Could not load SSR codes: {loadError}</div>
        ) : rows.length ? (
          rows.map(({ item, match }) => (
            <button
              type="button"
              key={item.code}
              className="gw-picker-item"
              title={`${item.code}\n${item.description}`}
              disabled={checkingVariant}
              onClick={() => void inspectAndPick(item)}
            >
              <SsrCode code={item.code} description={item.description} />
              <small>{item.description.slice(0, 110)}</small>
              {match && match.reasons.length > 0 ? (
                <span className="item-search-reason">{match.reasons.join(' · ')}</span>
              ) : null}
            </button>
          ))
        ) : (
          <div className="latlng-display">No matching items.</div>
        )}
      </div>
      {checkingVariant && <div className="latlng-display">Checking DATA variants…</div>}
      {variantError && (
        <div className="data-variant-error">Could not read DATA variants: {variantError}</div>
      )}
    </div>
  )
}
