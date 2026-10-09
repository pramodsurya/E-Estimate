import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, BookOpen, ChevronRight, FolderOpen, LoaderCircle, Search } from 'lucide-react'
import type { MasterItem } from '../../lib/masterData'
import { getReviewedSorProjectObservation, listReviewedSorCatalogues, parseReviewedSorSearch,
  reviewedCostStatus, reviewedReference, reviewedTariff, sorRecord, tableLabel, type ReviewedSorCatalogue } from '../../lib/sorReviewed'
import { browseReviewedSor, reviewedSorLocations, reviewedSorTable, searchReviewedSorWithLocations,
  type SorNavigationLocation, type SorNavigationNode, type SorNavigationPage } from '../../lib/sorNavigation'
import type { ReviewedSorObservation, ReviewedSorProjectZone } from '../../types/sorReviewed'
import ReviewedSorDetailPanel from './ReviewedSorDetailPanel'
import './reviewedSor.css'

const errorText = (error: unknown): string => error instanceof Error ? error.message : String(error)
type SearchPage = Awaited<ReturnType<typeof searchReviewedSorWithLocations>>
const nodeTitle = (node: SorNavigationNode): string => node.node_type === 'table' ? tableLabel(node.display_title) : node.display_title
const nodeKind = (node: SorNavigationNode): string => ({ table: 'Schedule', section: 'Section', subsection: 'Subsection', family: 'Item family', specification_group: 'Specification group' })[node.node_type]

export default function ReviewedSorColumn({ sorYear, sorZone, selected, onAdd, onShowBasicRates, initialCatalogue = null }: {
  sorYear: string; sorZone: ReviewedSorProjectZone; selected: Map<string, MasterItem>; onAdd: (item: MasterItem) => void; onShowBasicRates: () => void; initialCatalogue?: string | null
}): JSX.Element {
  const year = sorYear
  const [projectContext, setProjectContext] = useState(`${sorYear}:${sorZone}`)
  const [query, setQuery] = useState('')
  const [catalogue, setCatalogue] = useState<string | null>(initialCatalogue)
  const [path, setPath] = useState<SorNavigationNode[]>([])
  const [offset, setOffset] = useState(0)
  const [anchor, setAnchor] = useState<string | null>(null)
  const [choice, setChoice] = useState<ReviewedSorObservation | null>(null)
  const [choicePath, setChoicePath] = useState<SorNavigationNode[]>([])
  const [showDetail, setShowDetail] = useState(false)
  const [notice, setNotice] = useState('')
  const [pendingRecipe, setPendingRecipe] = useState<string | null>(null)
  const [catalogues, setCatalogues] = useState<{ key: string; rows: ReviewedSorCatalogue[]; error?: string } | null>(null)
  const [browse, setBrowse] = useState<{ key: string; page?: SorNavigationPage; error?: string } | null>(null)
  const [search, setSearch] = useState<{ key: string; offset: number; page?: SearchPage; error?: string } | null>(null)
  const [searchOffset, setSearchOffset] = useState(0)
  const [reload, setReload] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const parent = path.at(-1)
  const browseKey = JSON.stringify([year, sorZone, parent?.node_id, offset, anchor, reload])
  const searchKey = JSON.stringify([year, sorZone, query.trim(), catalogue, reload])
  const catalogueKey = `${year}:${sorZone}:${reload}`
  const searching = query.trim().length > 0

  if (projectContext !== `${sorYear}:${sorZone}`) {
    setProjectContext(`${sorYear}:${sorZone}`); setPendingRecipe(choice?.item_id ?? pendingRecipe)
    setChoice(null); setChoicePath([]); setPath([]); setOffset(0); setAnchor(null); setCatalogue(null); setSearchOffset(0)
    setNotice('Project SOR settings changed. Checking the selected item.')
  }

  useEffect(() => {
    let active = true
    void listReviewedSorCatalogues(year, sorZone).then(rows => { if (active) setCatalogues({ key: catalogueKey, rows }) })
      .catch(error => { if (active) setCatalogues({ key: catalogueKey, rows: [], error: errorText(error) }) })
    return () => { active = false }
  }, [year, sorZone, catalogueKey])

  // Resolve an explicit schedule entry (including legacy Electrical/Civil/Plumbing links).
  useEffect(() => {
    if (!catalogue || path[0]?.catalogue_code === catalogue) return
    const controller = new AbortController()
    void reviewedSorTable(year, catalogue, controller.signal).then(node => {
      if (!controller.signal.aborted) { setPath([node]); setOffset(0); setAnchor(null) }
    }).catch(error => { if (!controller.signal.aborted) setNotice(errorText(error)) })
    return () => controller.abort()
  }, [year, catalogue, path])

  useEffect(() => {
    if (searching) return
    const controller = new AbortController()
    void browseReviewedSor(year, parent?.node_id ?? null, offset, anchor, controller.signal, sorZone)
      .then(page => { if (!controller.signal.aborted) setBrowse({ key: browseKey, page }) })
      .catch(error => { if (!controller.signal.aborted) setBrowse({ key: browseKey, error: errorText(error) }) })
    return () => controller.abort()
  }, [year, sorZone, parent?.node_id, offset, anchor, browseKey, searching])

  useEffect(() => {
    if (!searching) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      void searchReviewedSorWithLocations(year, query, catalogue, searchOffset, controller.signal, sorZone).then(page => {
        if (!controller.signal.aborted) setSearch(previous => ({ key: searchKey, offset: searchOffset,
          page: { ...page, rows: searchOffset > 0 && previous?.key === searchKey ? [...(previous.page?.rows ?? []), ...page.rows] : page.rows } }))
      }).catch(error => { if (!controller.signal.aborted) setSearch({ key: searchKey, offset: searchOffset, error: errorText(error) }) })
    }, 250)
    return () => { controller.abort(); clearTimeout(timer) }
  }, [year, sorZone, query, catalogue, searchOffset, searchKey, searching])

  useEffect(() => {
    if (!pendingRecipe) return
    let active = true
    void getReviewedSorProjectObservation(pendingRecipe, year, sorZone).then(async row => {
      const locations = row ? await reviewedSorLocations([row.occurrence_id]) : []
      if (!active) return
      setChoice(row); setChoicePath(locations[0]?.path ?? []); setShowDetail(Boolean(row))
      setNotice(row ? 'Loaded the rate for the project year and zone. Review its applicable extras again.'
        : `This variant has no unique compatible observation in ${year} for the project zone. Choose an available variant from this edition.`)
      setPendingRecipe(null)
    }).catch(error => { if (active) { setNotice(errorText(error)); setPendingRecipe(null) } })
    return () => { active = false }
  }, [pendingRecipe, year, sorZone])

  const navigate = (next: SorNavigationNode[]): void => {
    setPath(next); setCatalogue(next[0]?.catalogue_code ?? null); setOffset(0); setAnchor(null); setQuery(''); setShowDetail(false); setNotice('')
  }
  const choose = (row: ReviewedSorObservation, locationPath: SorNavigationNode[]): void => {
    setPendingRecipe(null); setChoice(row); setChoicePath(locationPath); setShowDetail(true); setNotice('')
  }
  const showInSection = (location: SorNavigationLocation): void => {
    navigate(location.path); setAnchor(location.occurrence_id)
  }
  const currentBrowse = browse?.key === browseKey ? browse : null
  const currentSearch = search?.key === searchKey ? search : null
  const currentCatalogues = catalogues?.key === catalogueKey ? catalogues : null
  const parsed = parseReviewedSorSearch(query)
  const schedules = parsed.roadsAndBridges ? currentCatalogues?.rows.filter(row => row.catalogue_code.startsWith('RB_')) : currentCatalogues?.rows
  const activePage = currentBrowse?.page
  const heading = showDetail ? choicePath.at(-1) : parent
  const breadcrumbs = showDetail ? choicePath : path

  useEffect(() => {
    if (anchor && currentBrowse?.page) scrollRef.current?.querySelector(`[data-sor-observation="${CSS.escape(anchor)}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [anchor, currentBrowse])

  return <div className="additem-col reviewed-sor-col">
    <div className="col-header reviewed-sor-header">
      <div><h3><BookOpen size={16} /> SOR book</h3><span className="col-tag">Browse sections → specifications → priced variants</span></div>
      <button type="button" className="btn-mini" onClick={onShowBasicRates}>Basic resource rates</button>
    </div>
    <div className="reviewed-sor-filters">
      <label>Schedule<select aria-label="SOR schedule" value={catalogue ?? ''} onChange={event => {
        setCatalogue(event.target.value || null); setPath([]); setOffset(0); setAnchor(null); setSearchOffset(0); setShowDetail(false)
      }}><option value="">All available schedules</option>
        {schedules?.map(row => <option key={row.catalogue_code} value={row.catalogue_code}>{tableLabel(row.table_name)}</option>)}
      </select></label>
      <label className="reviewed-sor-search"><Search size={14} /><input className="text-input" aria-label="Search reviewed SOR" placeholder="Find a description, printed code or Sl. No."
        value={query} onChange={event => { setQuery(event.target.value); setSearchOffset(0); setShowDetail(false) }} /></label>
    </div>
    {notice && <p className="reviewed-sor-notice" role="status">{notice}</p>}
    {parsed.serial && !catalogue && <p className="reviewed-sor-notice">Sl. No. {parsed.serial} belongs to a schedule and year. Choose its schedule above or check the references below.</p>}
    {currentCatalogues?.error && <ErrorMessage error={currentCatalogues.error} retry={() => setReload(value => value + 1)} />}
    <nav className="sor-book-breadcrumbs" aria-label="SOR book location">
      <button onClick={() => navigate([])}><BookOpen size={13} /> Book index</button>
      {breadcrumbs.map((node, index) => <span key={node.node_id}><ChevronRight size={12} /><button title={node.display_title}
        onClick={() => navigate(breadcrumbs.slice(0, index + 1))}>{nodeTitle(node)}</button></span>)}
    </nav>
    {choice && !showDetail && <button className="sor-book-selection" onClick={() => setShowDetail(true)}>
      <span>Selected variant <strong>{choice.variant_label || choice.effective_description}</strong></span><span>Review <ChevronRight size={13} /></span>
    </button>}
    <div className="reviewed-sor-scroll" ref={scrollRef}>
      {pendingRecipe ? <Loading text={`Checking this variant in ${year}…`} /> : <>
        {choice && <div hidden={!showDetail}>
          <button className="btn-mini" onClick={() => setShowDetail(false)}><ArrowLeft size={13} /> Return to book navigation</button>
          {choicePath.filter(node => node.node_type === 'family' || node.node_type === 'specification_group').map(node => <p className="sor-book-shared" key={node.node_id}><small>{nodeKind(node)}</small>{node.display_title}</p>)}
          <ReviewedSorDetailPanel key={choice.occurrence_id} row={choice} projectYear={sorYear} projectZone={sorZone} onAdd={onAdd} selected={selected} />
        </div>}
        {!showDetail && (searching ? <>
          <div className="sor-book-heading"><h4>Search results</h4><button className="btn-mini" onClick={() => setQuery('')}>Return to section</button></div>
          {!currentSearch ? <Loading text="Searching this edition…" /> : currentSearch.error ? <ErrorMessage error={currentSearch.error} retry={() => setReload(value => value + 1)} /> : <>
            {!currentSearch.page?.rows.length && <p className="reviewed-sor-empty">No matching items in {year}. Try another schedule or reference.</p>}
            {currentSearch.page?.rows.map(({ observation: row, location }) => <VariantRow key={row.occurrence_id} row={row} path={location?.path ?? []}
              onSelect={() => choose(row, location?.path ?? [])} onLocate={location ? () => showInSection(location) : undefined} />)}
            {currentSearch.page?.hasMore && <button className="reviewed-sor-more" disabled={currentSearch.offset !== searchOffset}
              onClick={() => setSearchOffset(value => value + 100)}>{currentSearch.offset !== searchOffset ? 'Loading…' : 'Load more results'}</button>}
          </>}
        </> : <>
          <div className="sor-book-heading"><div><small>{heading ? nodeKind(heading) : `${year} edition`}</small><h4>{heading ? nodeTitle(heading) : 'Choose a department or schedule'}</h4></div>
            {path.length > 0 && <button className="btn-mini" onClick={() => navigate(path.slice(0, -1))}><ArrowLeft size={13} /> Back</button>}
          </div>
          {parent?.node_type === 'specification_group' && path.filter(node => node.node_type === 'family').map(node => <p className="sor-book-shared" key={node.node_id}><small>Common specification</small>{node.display_title}</p>)}
          {parent?.node_type === 'family' && <p className="sor-book-hint">Common specification above applies to each separately priced variant below.</p>}
          {!currentBrowse ? <Loading text="Loading book section…" /> : currentBrowse.error ? <ErrorMessage error={currentBrowse.error} retry={() => setReload(value => value + 1)} /> : <>
            {!activePage?.entries.length && <p className="reviewed-sor-empty">No available choices in this section for {year}.</p>}
            {activePage?.entries.map(entry => entry.node_type === 'variant' ? <VariantRow key={entry.observation.occurrence_id} row={entry.observation}
              highlighted={entry.observation.occurrence_id === anchor} onSelect={() => choose(entry.observation, path)} />
              : <button key={entry.node_id} className="sor-book-node" data-kind={entry.node_type} onClick={() => navigate([...path, entry])}>
                <FolderOpen size={17} /><span><small>{nodeKind(entry)}{entry.printed_reference ? ` · ${entry.printed_reference}` : ''}</small><strong title={entry.display_title}>{nodeTitle(entry)}</strong>
                  <small>{entry.available_variant_count.toLocaleString('en-IN')} {entry.node_type === 'family' || entry.node_type === 'specification_group' ? 'variant' : 'item'}{entry.available_variant_count === 1 ? '' : 's'}</small></span><ChevronRight size={17} />
              </button>)}
            {activePage && activePage.total_count > 50 && <div className="sor-book-paging">
              <button className="btn-mini" disabled={activePage.offset === 0} onClick={() => { setAnchor(null); setOffset(Math.max(0, activePage.offset - 50)) }}>Previous</button>
              <span>{activePage.offset + 1}–{Math.min(activePage.offset + 50, activePage.total_count)} of {activePage.total_count} · Book order</span>
              <button className="btn-mini" disabled={!activePage.has_more} onClick={() => { setAnchor(null); setOffset(activePage.offset + 50) }}>Next</button>
            </div>}
          </>}
        </>)}
      </>}
    </div>
  </div>
}

function VariantRow({ row, path = [], onSelect, onLocate, highlighted = false }: {
  row: ReviewedSorObservation; path?: SorNavigationNode[]; onSelect: () => void; onLocate?: () => void; highlighted?: boolean
}): JSX.Element {
  return <article className={`sor-book-variant${highlighted ? ' is-highlighted' : ''}`} aria-label={reviewedReference(row)} data-sor-observation={row.occurrence_id}>
    {path.length > 0 && <p className="sor-book-result-path">{path.map(node => nodeTitle(node)).join(' › ')}</p>}
    <div><strong>{row.variant_label || row.effective_description}</strong>
      {sorRecord(row.features.specifications).zone == null && Boolean(row.features.column_role) && String(row.features.column_role) !== 'rate' && <span>{tableLabel(String(row.features.column_role))}</span>}
      <span>{reviewedReference(row)}</span></div>
    <div className="sor-book-variant-footer"><span><b>{reviewedTariff(row)}</b><small className={row.cost_ready ? '' : 'sor-book-blocked'}>{reviewedCostStatus(row)}</small></span>
      <div>{onLocate && <button className="btn-mini" onClick={onLocate}>Show in section</button>}<button className="btn-mini sor-book-select" onClick={onSelect}>{row.cost_ready ? 'Select' : 'View requirements'}<ChevronRight size={13} /></button></div>
    </div>
  </article>
}
function Loading({ text }: { text: string }): JSX.Element { return <p className="reviewed-sor-loading" role="status"><LoaderCircle className="spin" size={16} />{text}</p> }
function ErrorMessage({ error, retry }: { error: string; retry: () => void }): JSX.Element { return <div className="reviewed-sor-error" role="alert">{error} <button onClick={retry}>Retry</button></div> }
