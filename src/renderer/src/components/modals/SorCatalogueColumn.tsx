import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  Check,
  ChevronRight,
  CircleAlert,
  Factory,
  FileText,
  Layers3,
  LoaderCircle,
  Plus,
  ReceiptText,
  RotateCcw,
  Search,
  Truck,
  X
} from 'lucide-react'
import type { MasterItem } from '../../lib/masterData'
import {
  SOR_CATALOGUE_CATEGORY,
  fetchSorCatalogueOptions,
  fetchSorCataloguePrice,
  fetchSorCatalogues,
  groupSorCatalogueOptions,
  nextSorDimension,
  searchSorCatalogueItems,
  singletonSorDimensions,
  sorCommercialTerms,
  sourceContextTitle,
  visibleSorDimensions,
  type SorCatalogue,
  type SorCatalogueItemSearchMatch,
  type SorCatalogueOption,
  type SorCatalogueOptionsByDimension,
  type SorCataloguePriceMatch
} from '../../lib/sorCatalogue'
import type {
  SorCatalogueDimensionValue,
  SorCatalogueItemSelection
} from '../../types/project'
import { pipeLeadCatalogueLabel, pipeLeadSourceFromContext } from '../../lib/pipeLead'

interface SelectionStep {
  key: string
  option: SorCatalogueOption
  automatic: boolean
}

interface LookupState {
  loading: boolean
  options: SorCatalogueOptionsByDimension
  matches: SorCataloguePriceMatch[]
  remainingCount: number
  error: string | null
}

interface CatalogueItemSearchState {
  loading: boolean
  matches: SorCatalogueItemSearchMatch[]
  error: string | null
}

const EMPTY_LOOKUP: LookupState = {
  loading: false,
  options: {},
  matches: [],
  remainingCount: 0,
  error: null
}

const EMPTY_ITEM_SEARCH: CatalogueItemSearchState = {
  loading: false,
  matches: [],
  error: null
}

function filtersFromSteps(
  steps: SelectionStep[]
): Record<string, SorCatalogueDimensionValue> {
  return Object.fromEntries(steps.map((step) => [step.key, step.option.value]))
}

function humanize(value: string): string {
  return value
    .replace(/^PART_/i, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function partLabel(part: string): string {
  const matched = /^PART_(\d+)_(.*)$/i.exec(part)
  return matched
    ? `Part ${matched[1]} · ${humanize(matched[2])}`
    : humanize(part)
}

function dimensionLabel(key: string): string {
  const labels: Record<string, string> = {
    rate_component: 'Rate component',
    pipe_class: 'Pipe class',
    diameter_mm: 'Diameter',
    row_label: 'Item / table row',
    column_label: 'Rate column / member',
    floor: 'Floor',
    pressure: 'Pressure'
  }
  return labels[key] ?? humanize(key)
}

function optionLabel(key: string, value: SorCatalogueDimensionValue): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (value === null) return 'Not specified'
  if (key === 'floor') return `Floor ${value}`
  if (key.endsWith('_mm')) return `${Number(value).toLocaleString('en-IN')} mm`
  if (key.endsWith('_m')) return `${Number(value).toLocaleString('en-IN')} m`
  const text = String(value)
  return text.includes('_') && !text.includes(' ') ? humanize(text) : text
}

function rateDescription(catalogue: SorCatalogue, match: SorCataloguePriceMatch): string {
  const itemName = match.item_name.trim()
  if (!itemName) return catalogue.name
  if (itemName.toLocaleLowerCase().includes(catalogue.name.toLocaleLowerCase())) return itemName
  return `${catalogue.name} — ${itemName}`
}

export default function SorCatalogueColumn({
  sorYear,
  selected,
  onAdd,
  onRemove,
  onShowBasicRates
}: {
  sorYear: string
  selected: Map<string, MasterItem>
  onAdd: (item: MasterItem) => void
  onRemove: (key: string) => void
  onShowBasicRates: () => void
}): JSX.Element {
  const [catalogues, setCatalogues] = useState<SorCatalogue[]>([])
  const [catalogueError, setCatalogueError] = useState<string | null>(null)
  const [cataloguesLoading, setCataloguesLoading] = useState(true)
  const [catalogueReload, setCatalogueReload] = useState(0)
  const [search, setSearch] = useState('')
  const [catalogueCode, setCatalogueCode] = useState<string | null>(null)
  const [steps, setSteps] = useState<SelectionStep[]>([])
  const [lookup, setLookup] = useState<LookupState>(EMPTY_LOOKUP)
  const [chosenMatch, setChosenMatch] = useState<SorCataloguePriceMatch | null>(null)
  const [directMatch, setDirectMatch] = useState<SorCatalogueItemSearchMatch | null>(null)
  const [itemSearch, setItemSearch] =
    useState<CatalogueItemSearchState>(EMPTY_ITEM_SEARCH)
  const requestSequence = useRef(0)
  const searchSequence = useRef(0)
  const catalogue = useMemo(
    () => catalogues.find((candidate) => candidate.catalogue_code === catalogueCode) ?? null,
    [catalogueCode, catalogues]
  )

  useEffect(() => {
    let active = true
    setCataloguesLoading(true)
    setCatalogueError(null)
    void fetchSorCatalogues()
      .then((rows) => {
        if (active) setCatalogues(rows)
      })
      .catch((error) => {
        if (active) {
          setCatalogueError(error instanceof Error ? error.message : String(error))
        }
      })
      .finally(() => {
        if (active) setCataloguesLoading(false)
      })
    return () => {
      active = false
    }
  }, [catalogueReload])

  useEffect(() => {
    const query = search.trim()
    if (catalogue || query.length < 2) {
      setItemSearch(EMPTY_ITEM_SEARCH)
      return
    }

    const sequence = ++searchSequence.current
    let active = true
    setItemSearch((current) => ({ ...current, loading: true, error: null }))
    const timer = window.setTimeout(() => {
      void searchSorCatalogueItems(query, sorYear)
        .then((matches) => {
          if (!active || searchSequence.current !== sequence) return
          setItemSearch({ loading: false, matches, error: null })
        })
        .catch((error) => {
          if (!active || searchSequence.current !== sequence) return
          setItemSearch({
            loading: false,
            matches: [],
            error: error instanceof Error ? error.message : String(error)
          })
        })
    }, 250)

    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [catalogue, search, sorYear])

  const filters = useMemo(() => filtersFromSteps(steps), [steps])
  const filterSignature = useMemo(() => JSON.stringify(filters), [filters])

  useEffect(() => {
    if (!catalogue) {
      setLookup(EMPTY_LOOKUP)
      return
    }

    if (directMatch?.catalogue_code === catalogue.catalogue_code) {
      requestSequence.current += 1
      setLookup({
        loading: false,
        options: {},
        matches: [directMatch],
        remainingCount: 1,
        error: null
      })
      return
    }

    const sequence = ++requestSequence.current
    let active = true
    setChosenMatch(null)
    setLookup((current) => ({ ...current, loading: true, error: null, matches: [] }))

    void fetchSorCatalogueOptions(catalogue.catalogue_code, sorYear, filters)
      .then(async (rows) => {
        if (!active || requestSequence.current !== sequence) return
        const options = groupSorCatalogueOptions(rows, catalogue.dimension_schema)
        const remainingCount = rows.reduce(
          (maximum, row) => Math.max(maximum, row.matching_items),
          0
        )
        const singletonSteps = singletonSorDimensions(options, filters)
        if (singletonSteps.length) {
          setLookup({
            loading: true,
            options,
            matches: [],
            remainingCount,
            error: null
          })
          setSteps((current) => {
            if (JSON.stringify(filtersFromSteps(current)) !== filterSignature) return current
            return [
              ...current,
              ...singletonSteps.map(({ key, option }) => ({
                key,
                option,
                automatic: true
              }))
            ]
          })
          return
        }

        const nextDimension = nextSorDimension(options, filters)
        if (nextDimension) {
          setLookup({
            loading: false,
            options,
            matches: [],
            remainingCount,
            error: null
          })
          return
        }

        const matches = await fetchSorCataloguePrice(
          catalogue.catalogue_code,
          sorYear,
          filters
        )
        if (!active || requestSequence.current !== sequence) return
        setLookup({
          loading: false,
          options,
          matches,
          remainingCount: matches.length,
          error: null
        })
      })
      .catch((error) => {
        if (!active || requestSequence.current !== sequence) return
        setLookup({
          loading: false,
          options: {},
          matches: [],
          remainingCount: 0,
          error: error instanceof Error ? error.message : String(error)
        })
      })

    return () => {
      active = false
    }
  }, [catalogue, directMatch, filterSignature, filters, sorYear])

  const filteredCatalogues = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    if (!query) return catalogues
    return catalogues.filter((candidate) =>
      [
        candidate.catalogue_code,
        candidate.name,
        candidate.part,
        candidate.section
      ].some((value) => value.toLocaleLowerCase().includes(query))
    )
  }, [catalogues, search])

  const catalogueGroups = useMemo(() => {
    const groups = new Map<string, SorCatalogue[]>()
    for (const candidate of filteredCatalogues) {
      const group = groups.get(candidate.part) ?? []
      group.push(candidate)
      groups.set(candidate.part, group)
    }
    return Array.from(groups.entries())
  }, [filteredCatalogues])
  const itemSearchActive = search.trim().length >= 2

  const nextDimension = nextSorDimension(lookup.options, filters)
  const exactMatch =
    directMatch ?? chosenMatch ?? (lookup.matches.length === 1 ? lookup.matches[0] : null)

  const chooseCatalogue = (nextCatalogue: SorCatalogue): void => {
    setCatalogueCode(nextCatalogue.catalogue_code)
    setSteps([])
    setChosenMatch(null)
    setDirectMatch(null)
    setLookup(EMPTY_LOOKUP)
  }

  const chooseSearchMatch = (match: SorCatalogueItemSearchMatch): void => {
    setCatalogueCode(match.catalogue_code)
    setSteps([])
    setChosenMatch(null)
    setDirectMatch(match)
    setLookup(EMPTY_LOOKUP)
  }

  const leaveCatalogue = (): void => {
    setCatalogueCode(null)
    setSteps([])
    setChosenMatch(null)
    setDirectMatch(null)
    setLookup(EMPTY_LOOKUP)
  }

  const chooseOption = (key: string, rawValue: string): void => {
    const option = lookup.options[key]?.find((candidate) => candidate.rawValue === rawValue)
    if (!option) return
    setSteps((current) => [...current, { key, option, automatic: false }])
  }

  const truncateAt = (index: number): void => {
    setSteps((current) => current.slice(0, index))
    setChosenMatch(null)
    setDirectMatch(null)
  }

  const addMatch = (match: SorCataloguePriceMatch): void => {
    if (!catalogue) return
    const commercialTerms = sorCommercialTerms(match.source_context)
    const pipeLead = pipeLeadSourceFromContext(match.source_context, match.item_code)
    const selection: SorCatalogueItemSelection = {
      catalogueCode: catalogue.catalogue_code,
      catalogueName: catalogue.name,
      part: catalogue.part,
      section: catalogue.section,
      dimensions: visibleSorDimensions(match.dimensions),
      selectedYear: sorYear,
      publishedRate: match.rate,
      rateText: match.rate_text.trim() || null,
      effectiveFrom: match.effective_from,
      source: match.source,
      sourcePage: match.source_page,
      sourceTitle: sourceContextTitle(match.source_context),
      commercialTerms,
      ...(pipeLead ? { pipeLead } : {})
    }
    onAdd({
      side: 'SOR',
      category: SOR_CATALOGUE_CATEGORY,
      code: match.item_code,
      description: rateDescription(catalogue, match),
      unit: match.unit,
      sorCatalogue: selection
    })
  }

  return (
    <div className="additem-col sor-catalogue-col">
      <div className="col-header sor-catalogue-header">
        <div className="sor-header-copy">
          <h3>SOR Catalogue</h3>
          <span className="col-tag">Logical price lookup · {sorYear}</span>
        </div>
        <div className="sor-header-actions">
          <button type="button" className="sor-mode-switch" onClick={onShowBasicRates}>
            <ArrowLeft size={12} /> Basic SOR items
          </button>
          {catalogue ? (
            <button type="button" className="sor-back-btn" onClick={leaveCatalogue}>
              <ArrowLeft size={13} /> Catalogues
            </button>
          ) : null}
        </div>
      </div>

      {!catalogue ? (
        <>
          <div className="col-toolbar sor-catalogue-search">
            <Search size={14} />
            <input
              className="text-input"
              placeholder="Search SOR item descriptions or catalogues…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="sor-catalogue-list">
            {cataloguesLoading ? (
              <div className="sor-lookup-state">
                <LoaderCircle className="spin" size={17} /> Loading catalogues…
              </div>
            ) : catalogueError ? (
              <div className="sor-lookup-error">
                <CircleAlert size={17} />
                <span>{catalogueError}</span>
                <button type="button" onClick={() => setCatalogueReload((value) => value + 1)}>
                  Retry
                </button>
              </div>
            ) : (
              <>
                {itemSearchActive ? (
                  <section className="sor-item-search-results">
                    <div className="sor-catalogue-part">
                      <Search size={13} />
                      <span>Catalogue item matches</span>
                      {!itemSearch.loading ? <b>{itemSearch.matches.length}</b> : null}
                    </div>
                    {itemSearch.loading ? (
                      <div className="sor-lookup-state sor-item-search-state">
                        <LoaderCircle className="spin" size={15} />
                        Searching descriptions in SOR {sorYear}…
                      </div>
                    ) : itemSearch.error ? (
                      <div className="sor-lookup-error">
                        <CircleAlert size={15} />
                        <span>Could not search catalogue items: {itemSearch.error}</span>
                      </div>
                    ) : (
                      itemSearch.matches.map((match) => (
                        <button
                          type="button"
                          className="sor-item-search-row"
                          key={match.item_code}
                          onClick={() => chooseSearchMatch(match)}
                        >
                          <span>
                            <small>{match.catalogue_name}</small>
                            <strong>{match.item_name || match.catalogue_name}</strong>
                            <em>
                              {Object.entries(visibleSorDimensions(match.dimensions))
                                .slice(0, 3)
                                .map(([key, value]) => optionLabel(key, value))
                                .join(' · ') || match.section}
                            </em>
                          </span>
                          <b>
                            {match.rate === null
                              ? match.rate_text || 'Reference'
                              : `₹ ${match.rate.toLocaleString('en-IN')}`}
                            <small>/ {match.unit || 'unit'}</small>
                          </b>
                          <ChevronRight size={14} />
                        </button>
                      ))
                    )}
                    {!itemSearch.loading &&
                    !itemSearch.error &&
                    itemSearch.matches.length === 0 ? (
                      <div className="sor-lookup-state sor-item-search-state">
                        No SOR {sorYear} item description matches “{search}”.
                      </div>
                    ) : null}
                  </section>
                ) : null}

                {catalogueGroups.map(([part, rows]) => (
                  <section className="sor-catalogue-group" key={part}>
                    <div className="sor-catalogue-part">
                      <Layers3 size={13} />
                      <span>{partLabel(part)}</span>
                      <b>{rows.length}</b>
                    </div>
                    {rows.map((candidate) => {
                      const dimensionCount = Object.keys(candidate.dimension_schema).filter(
                        (key) => key !== 'matrix_row' && key !== 'matrix_column'
                      ).length
                      return (
                        <button
                          type="button"
                          className="sor-catalogue-row"
                          key={candidate.catalogue_code}
                          onClick={() => chooseCatalogue(candidate)}
                        >
                          <span>
                            <strong>{candidate.name}</strong>
                            <small>{candidate.section}</small>
                          </span>
                          <span className="sor-catalogue-row-meta">
                            {dimensionCount} dimension{dimensionCount === 1 ? '' : 's'}
                            <ChevronRight size={14} />
                          </span>
                        </button>
                      )
                    })}
                  </section>
                ))}
                {catalogueGroups.length === 0 && !itemSearchActive ? (
                  <div className="sor-lookup-state">No catalogue matches “{search}”.</div>
                ) : null}
              </>
            )}
          </div>
        </>
      ) : (
        <div className="sor-configurator">
          <div className="sor-selected-catalogue">
            <span>{partLabel(catalogue.part)} · {catalogue.section}</span>
            <strong>{catalogue.name}</strong>
          </div>

          {steps.length > 0 ? (
            <div className="sor-filter-path" aria-label="Selected catalogue dimensions">
              {steps.map((step, index) => (
                <button
                  type="button"
                  className={step.automatic ? 'inferred' : ''}
                  key={`${step.key}:${step.option.rawValue}`}
                  title={`Change ${dimensionLabel(step.key)}`}
                  onClick={() => truncateAt(index)}
                >
                  <span>{dimensionLabel(step.key)}</span>
                  <strong>{optionLabel(step.key, step.option.value)}</strong>
                  {step.automatic ? <small>Auto</small> : null}
                  <X size={11} />
                </button>
              ))}
              <button type="button" className="sor-reset-path" onClick={() => truncateAt(0)}>
                <RotateCcw size={11} /> Reset
              </button>
            </div>
          ) : null}

          {lookup.error ? (
            <div className="sor-lookup-error">
              <CircleAlert size={17} />
              <span>Could not read catalogue rates: {lookup.error}</span>
            </div>
          ) : lookup.loading ? (
            <div className="sor-lookup-state sor-config-loading">
              <LoaderCircle className="spin" size={17} />
              Checking valid {sorYear} combinations…
            </div>
          ) : exactMatch ? (
            <CatalogueResult
              catalogue={catalogue}
              match={exactMatch}
              selected={selected}
              onAdd={addMatch}
              onRemove={onRemove}
              onAnother={() => truncateAt(0)}
            />
          ) : nextDimension ? (
            <div className="sor-dimension-step">
              <div className="sor-step-kicker">
                <span>Next selection</span>
                {lookup.remainingCount > 0 ? (
                  <small>{lookup.remainingCount.toLocaleString('en-IN')} valid cells remain</small>
                ) : null}
              </div>
              <label htmlFor={`sor-dimension-${nextDimension}`}>
                {dimensionLabel(nextDimension)}
              </label>
              <select
                id={`sor-dimension-${nextDimension}`}
                className="text-input sor-dimension-select"
                value=""
                onChange={(event) => chooseOption(nextDimension, event.target.value)}
              >
                <option value="" disabled>
                  Choose {dimensionLabel(nextDimension).toLocaleLowerCase()}…
                </option>
                {(lookup.options[nextDimension] ?? []).map((option) => (
                  <option value={option.rawValue} key={option.rawValue}>
                    {optionLabel(nextDimension, option.value)}
                    {option.matchingItems > 1
                      ? ` · ${option.matchingItems.toLocaleString('en-IN')} matches`
                      : ''}
                  </option>
                ))}
              </select>
              <p>
                Only values with a published rate for SOR {sorYear} are shown. One-value
                dimensions are resolved automatically.
              </p>
            </div>
          ) : lookup.matches.length > 1 ? (
            <div className="sor-match-fallback">
              <div className="sor-step-kicker">
                <span>Select the exact catalogue cell</span>
                <small>{lookup.matches.length} rows remain</small>
              </div>
              {lookup.matches.map((match) => (
                <button
                  type="button"
                  key={match.item_code}
                  onClick={() => setChosenMatch(match)}
                >
                  <span>
                    <strong>{match.item_name}</strong>
                    <small>{match.unit || 'Unit not printed'}</small>
                  </span>
                  <b>{match.rate === null ? match.rate_text || 'Reference rate' : `₹ ${match.rate.toLocaleString('en-IN')}`}</b>
                  <ChevronRight size={14} />
                </button>
              ))}
            </div>
          ) : (
            <div className="sor-empty-year">
              <CircleAlert size={20} />
              <strong>No published rate for this combination</strong>
              <span>
                Change a dimension or choose another catalogue for SOR {sorYear}.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function CatalogueResult({
  catalogue,
  match,
  selected,
  onAdd,
  onRemove,
  onAnother
}: {
  catalogue: SorCatalogue
  match: SorCataloguePriceMatch
  selected: Map<string, MasterItem>
  onAdd: (match: SorCataloguePriceMatch) => void
  onRemove: (key: string) => void
  onAnother: () => void
}): JSX.Element {
  const selectedKey = `SOR:${SOR_CATALOGUE_CATEGORY}:${match.item_code}`
  const added = selected.has(selectedKey)
  const commercialTerms = sorCommercialTerms(match.source_context)
  const pipeLead = pipeLeadSourceFromContext(match.source_context, match.item_code)
  const dimensions = visibleSorDimensions(match.dimensions)
  const sourceTitle = sourceContextTitle(match.source_context)
  const hasPublishedValue = match.rate !== null || Boolean(match.rate_text.trim())

  return (
    <div className="sor-price-result">
      <div className="sor-result-status">
        <span><Check size={13} /></span>
        Exact catalogue cell
      </div>
      <div className="sor-result-heading">
        <div>
          <small>{catalogue.name}</small>
          <strong>{match.item_name}</strong>
        </div>
        <div className={match.rate === null ? 'reference' : ''}>
          {match.rate === null ? (
            <>
              <small>Printed reference</small>
              <strong>{match.rate_text || 'Rate not published'}</strong>
            </>
          ) : (
            <>
              <small>Published SOR rate</small>
              <strong>
                ₹ {match.rate.toLocaleString('en-IN', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2
                })}
              </strong>
              <span>/ {match.unit || 'unit'}</span>
            </>
          )}
        </div>
      </div>

      {match.rate === null && match.rate_text ? (
        <div className="sor-reference-note">
          <CircleAlert size={15} />
          This is printed text, not a zero-valued rate. The item will remain uncosted until a
          numeric rate is published or adopted.
        </div>
      ) : null}
      {pipeLead ? (
        <div className="sor-reference-note">
          <Truck size={15} />
          Linked to {pipeLeadCatalogueLabel(pipeLead)}. After adding this RCC pipe, it will
          appear in Lead for source-to-site distance and automatic conveyance pricing.
        </div>
      ) : null}

      <div className="sor-result-dimensions">
        {Object.entries(dimensions).map(([key, value]) => (
          <span key={key}>
            <small>{dimensionLabel(key)}</small>
            <strong>{optionLabel(key, value)}</strong>
          </span>
        ))}
      </div>

      {commercialTerms ? (
        <div className="sor-commercial-terms">
          {commercialTerms.basis ? (
            <span>
              <Factory size={13} />
              {humanize(commercialTerms.basis)}
            </span>
          ) : null}
          {commercialTerms.transportation ? (
            <span className={commercialTerms.transportation}>
              <Truck size={13} />
              Transport {commercialTerms.transportation}
            </span>
          ) : null}
          {commercialTerms.taxes ? (
            <span className={commercialTerms.taxes}>
              <ReceiptText size={13} />
              Taxes {commercialTerms.taxes}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="sor-source-line">
        <FileText size={13} />
        <span>
          {sourceTitle || match.source || 'Schedule of Rates'}
          {match.source_page ? ` · page ${match.source_page}` : ''}
          {match.effective_from ? ` · effective ${match.effective_from}` : ''}
        </span>
      </div>

      <div className="sor-result-actions">
        <button type="button" className="btn ghost" onClick={onAnother}>
          <RotateCcw size={13} /> Choose another
        </button>
        <button
          type="button"
          className="btn"
          disabled={!hasPublishedValue}
          onClick={() => (added ? onRemove(selectedKey) : onAdd(match))}
        >
          {added ? <Check size={14} /> : <Plus size={14} />}
          {added ? 'Added to selection' : 'Add this SOR item'}
        </button>
      </div>
    </div>
  )
}
