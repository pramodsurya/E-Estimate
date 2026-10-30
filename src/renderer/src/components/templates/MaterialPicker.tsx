import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Check, X } from 'lucide-react'
import { SSR_CATEGORIES, fetchSsrItems, type MasterItem } from '../../lib/masterData'
import { fetchDataVariantSpecs, type DataVariantSpec } from '../../lib/dataVariants'
import {
  parseMasterSearch,
  rankMasterItems,
  type MasterSearchMatch
} from '../../lib/masterSearch'
import type { DataVariantSelection } from '../../types/project'
import { useStore } from '../../store/useStore'
import SsrCode from './SsrCode'
import CatalogueItemDetails from './CatalogueItemDetails'
import CatalogueChoiceText from './CatalogueChoiceText'
import CatalogueComparison, { CatalogueCompareToggle, useCatalogueComparison } from './CatalogueComparison'
import { compareCatalogueCodes } from '../../lib/catalogueGuidance'
import DataVariantReview, {
  defaultSelectionForVariantSpec,
  selectionForVariantOption
} from './DataVariantReview'

const MAX_PICKER_RESULTS = 60


/**
 * SSR item chooser used by the component templates to attach a code to a
 * computed quantity. Shared so Guide Wall and Bund stay in step.
 */
export default function MaterialPicker({
  onPick,
  onClose,
  initialCategory = 'IRR-CCDW',
  initialSearch = '',
  selectionHint,
  categoryLocked = false,
  allowedCodes,
  initialItem
}: {
  onPick: (item: MasterItem) => void
  onClose: () => void
  /** Category to open on — pick the one the role's default code lives in. */
  initialCategory?: string
  initialSearch?: string
  selectionHint?: string
  /** Keep role-specific pickers inside one SSR chapter. */
  categoryLocked?: boolean
  /** Restrict a role to an explicit set of compatible SSR items. */
  initialItem?: MasterItem
  allowedCodes?: string[]
}): JSX.Element {
  const comparison = useCatalogueComparison()
  const project = useStore((state) => state.project)
  const [category, setCategory] = useState(initialCategory)
  const [search, setSearch] = useState(initialSearch)
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch)
  const [items, setItems] = useState<MasterItem[]>([])
  const [loading, setLoading] = useState(false)
  const [checkingVariant, setCheckingVariant] = useState(Boolean(initialItem))
  const [variantError, setVariantError] = useState<string | null>(null)
  const [pendingItem, setPendingItem] = useState<MasterItem | null>(initialItem ?? null)
  const [variantSpec, setVariantSpec] = useState<DataVariantSpec | null>(null)
  const [variantSelection, setVariantSelection] = useState<DataVariantSelection | undefined>()
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(()=>{
    if(!initialItem)return
    let active=true
    const load=async():Promise<void>=>{
      const year=project?.meta.sorYear
      if(!year)throw new Error('Select the project SSR year before choosing variants.')
      const [specs,sourceItems]=await Promise.all([
        fetchDataVariantSpecs([initialItem.code],year),fetchSsrItems(initialCategory)
      ])
      if(!active)return
      const resolved=sourceItems.find(item=>item.code===initialItem.code)
      if(!resolved)throw new Error('This SSR item is unavailable. Go back to choose another code.')
      setPendingItem({...initialItem,...resolved})
      const spec=specs[initialItem.code];setVariantSpec(spec ?? null)
      setVariantSelection(initialItem.dataVariant ?? (spec?defaultSelectionForVariantSpec(spec):undefined))
    }
    void load().catch(reason=>{if(active)setVariantError(reason instanceof Error?reason.message:String(reason))}).finally(()=>{if(active)setCheckingVariant(false)})
    return ()=>{active=false}
  },[initialItem,initialCategory,project?.meta.sorYear])

  const [prevCategory, setPrevCategory] = useState(category)
  if (prevCategory !== category) {
    setPrevCategory(category)
    setLoading(true)
    setLoadError(null)
  }

  useEffect(() => {
    let cancelled = false
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

  // Keep exact/specification search, then show matches in published code order.
  const q = debouncedSearch.trim()
  const parsedSearch = useMemo(() => parseMasterSearch(q), [q])
  const selectableItems = useMemo(() => allowedCodes?.length
        ? items.filter((item) => allowedCodes.includes(item.code))
        : items, [allowedCodes, items])
  const lexicalMatches = useMemo(() => q ? rankMasterItems(selectableItems, parsedSearch) : [], [q, selectableItems, parsedSearch])
  const rows: Array<{ item: MasterItem; match?: MasterSearchMatch }> = q
    ? [...lexicalMatches].sort((a, b) => compareCatalogueCodes(a.item.code, b.item.code)).slice(0, MAX_PICKER_RESULTS).map((match) => ({ item: match.item, match }))
    : [...selectableItems].sort((a, b) => compareCatalogueCodes(a.code, b.code)).slice(0, MAX_PICKER_RESULTS).map((item) => ({ item }))

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
      setPendingItem(item)
      setVariantSpec(spec ?? null)
      setVariantSelection(spec ? defaultSelectionForVariantSpec(spec) : undefined)
    } catch (error) {
      setVariantError(error instanceof Error ? error.message : String(error))
    } finally {
      setCheckingVariant(false)
    }
  }

  if (pendingItem) {
    return (
      <div className="gw-picker template-variant-picker">
        <SsrCode code={pendingItem.code} description={pendingItem.description} guidance={pendingItem.guidance} className="catalogue-choice-code" strong={false} />
        <CatalogueChoiceText item={pendingItem} />
        <CatalogueItemDetails item={pendingItem} />
        {checkingVariant ? <p>Loading variants…</p> : variantError ? <p role="alert">{variantError}</p> : !variantSpec ? <p>Standard configuration · no alternative variant required.</p> : <DataVariantReview
          heading="Choose DATA variant / add-on"
          specs={{ [variantSpec.code]: variantSpec }}
          selections={variantSelection ? { [variantSpec.code]: variantSelection } : {}}
          onSelect={(_code, spec, option) =>
            setVariantSelection(selectionForVariantOption(spec, option))
          }
        />}
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
            disabled={checkingVariant || Boolean(variantError) || Boolean(variantSpec && !variantSelection)}
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
          aria-label="Work catalogue"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          disabled={categoryLocked}
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
        <div className="master-search-summary lexical">
          <span>
            {parsedSearch.exactConstraints.length > 0
              ? `Exact ${parsedSearch.exactConstraints
                  .map((value) => value.replace(/^mix(\d+)x(\d+)$/, '$1:$2').toUpperCase())
                  .join(', ')}`
              : 'Matching items'}
            {' · '}
            {lexicalMatches.length} match{lexicalMatches.length === 1 ? '' : 'es'}
          </span>
          <small>Item code · ascending</small>
        </div>
      ) : null}
      <CatalogueComparison comparison={comparison} />
      <div className="gw-picker-list">
        {loading ? (
          <div className="latlng-display">Loading items…</div>
        ) : loadError ? (
          <div className="data-variant-error">Could not load SSR codes: {loadError}</div>
        ) : rows.length ? (
          rows.map(({ item }) => (
            <div className="catalogue-picker-row" key={item.code}>
            <SsrCode code={item.code} description={item.description} guidance={item.guidance} className="catalogue-choice-code" strong={false} />
            <button
              type="button"
              className="gw-picker-item"
              disabled={checkingVariant}
              onClick={() => void inspectAndPick(item)}
            >
              <CatalogueChoiceText item={item} />
            </button>
            <div className="catalogue-choice-tools">
              {item.unit && <span className="item-unit">{item.unit}</span>}
              <CatalogueCompareToggle item={item} comparison={comparison} />
              <CatalogueItemDetails item={item} />
            </div>
            </div>
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
