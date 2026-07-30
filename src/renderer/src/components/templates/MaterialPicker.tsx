import { useEffect, useState } from 'react'
import { ArrowLeft, Check, X } from 'lucide-react'
import { SSR_CATEGORIES, fetchSsrItems, type MasterItem } from '../../lib/masterData'
import { fetchDataVariantSpecs, type DataVariantSpec } from '../../lib/dataVariants'
import type { DataVariantSelection } from '../../types/project'
import { useStore } from '../../store/useStore'
import SsrCode from './SsrCode'
import DataVariantReview, {
  defaultSelectionForVariantSpec,
  selectionForVariantOption
} from './DataVariantReview'

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

  const q = search.trim().toLowerCase()
  const filtered = (q
    ? items.filter(
        (i) => i.code.toLowerCase().includes(q) || i.description.toLowerCase().includes(q)
      )
    : items
  ).slice(0, 60)

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
      <div className="gw-picker-list">
        {loading ? (
          <div className="latlng-display">Loading items…</div>
        ) : loadError ? (
          <div className="data-variant-error">Could not load SSR codes: {loadError}</div>
        ) : filtered.length ? (
          filtered.map((item) => (
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
