import { useEffect, useState } from 'react'
import { ArrowLeft, Check, ChevronRight, LoaderCircle, Plus, Search } from 'lucide-react'
import type { MasterItem } from '../../lib/masterData'
import {
  calculateReviewedSorSelection, getReviewedSorHistory, getReviewedSorItem,
  listReviewedSorCatalogues, makeReviewedMasterItem, normallySelectable,
  parseReviewedSorSearch, readyReviewedRules, reviewedCostStatus, reviewedFamilyKey,
  reviewedReference, reviewedTariff, searchReviewedSorItems, sorMoney, sorRecord, tableLabel,
  type ReviewedSorCatalogue
} from '../../lib/sorReviewed'
import type { ReviewedSorCalculation, ReviewedSorDetail, ReviewedSorObservation } from '../../types/sorReviewed'
import './reviewedSor.css'

const EDITIONS = ['2026-27', '2025-26', '2024-25', '2023-24']
const errorText = (error: unknown): string => error instanceof Error ? error.message : String(error)

export default function ReviewedSorColumn({ sorYear, selected, onAdd, onShowBasicRates }: {
  sorYear: string
  selected: Map<string, MasterItem>
  onAdd: (item: MasterItem) => void
  onShowBasicRates: () => void
}): JSX.Element {
  const [year, setYear] = useState(sorYear)
  const [projectYear, setProjectYear] = useState(sorYear)
  const [query, setQuery] = useState('')
  const [catalogue, setCatalogue] = useState<string | null>(null)
  const [choice, setChoice] = useState<ReviewedSorObservation | null>(null)
  const [notice, setNotice] = useState('')
  const [pendingRecipe, setPendingRecipe] = useState<string | null>(null)
  const [catalogues, setCatalogues] = useState<{ key: string; rows: ReviewedSorCatalogue[]; error?: string } | null>(null)
  const [results, setResults] = useState<{ key: string; rows: ReviewedSorObservation[]; offset: number; hasMore: boolean; error?: string } | null>(null)
  const [reload, setReload] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const key = JSON.stringify([year, catalogue, query, reload])
  const catalogueKey = `${year}:${reload}`

  if (projectYear !== sorYear) {
    setProjectYear(sorYear)
    setYear(sorYear)
    setPendingRecipe(choice?.item_id ?? null)
    setChoice(null)
    setCatalogue(null)
    setNotice('Project SOR year changed. Choose a variant from the selected edition.')
  }

  useEffect(() => {
    let active = true
    void listReviewedSorCatalogues(year).then(rows => {
      if (active) setCatalogues({ key: catalogueKey, rows })
    }).catch(error => {
      if (active) setCatalogues({ key: catalogueKey, rows: [], error: errorText(error) })
    })
    return () => { active = false }
  }, [year, catalogueKey])

  useEffect(() => {
    let active = true
    const timer = setTimeout(() => {
      void searchReviewedSorItems(year, query, catalogue).then(page => {
        if (active) setResults({ key, ...page, offset: 100 })
      }).catch(error => {
        if (active) setResults({ key, rows: [], offset: 0, hasMore: false, error: errorText(error) })
      })
    }, 250)
    return () => { active = false; clearTimeout(timer) }
  }, [year, query, catalogue, key])

  useEffect(() => {
    if (!pendingRecipe) return
    let active = true
    void getReviewedSorHistory(pendingRecipe).then(history => {
      if (!active) return
      const candidates = history.filter(row => row.sor_year === year && normallySelectable(row))
      if (candidates.length === 1) {
        setChoice(candidates[0])
        setNotice('Loaded this variant in the selected edition. Extras were cleared; review the applicable rules again.')
      } else {
        setNotice(`This variant has no unique compatible observation in ${year}. Choose an available variant below.`)
      }
      setPendingRecipe(null)
    }).catch(error => {
      if (active) { setNotice(errorText(error)); setPendingRecipe(null) }
    })
    return () => { active = false }
  }, [pendingRecipe, year, sorYear])

  const changeYear = (nextYear: string): void => {
    setPendingRecipe(choice?.item_id ?? null)
    setYear(nextYear)
    setChoice(null)
    setCatalogue(null)
    setLoadingMore(false)
    setNotice('')
  }

  const choose = (row: ReviewedSorObservation): void => {
    setPendingRecipe(null)
    setChoice(row)
    setNotice('')
  }

  const loadMore = (): void => {
    if (!results || results.key !== key || loadingMore) return
    const current = results
    setLoadingMore(true)
    void searchReviewedSorItems(year, query, catalogue, current.offset).then(page => {
      setResults(previous => previous?.key === key ? { key, rows: [...previous.rows, ...page.rows], offset: current.offset + 100, hasMore: page.hasMore } : previous)
      setLoadingMore(false)
    }).catch(error => { setNotice(errorText(error)); setLoadingMore(false) })
  }

  const currentResults = results?.key === key ? results : null
  const currentCatalogues = catalogues?.key === catalogueKey ? catalogues : null
  const groups = new Map<string, ReviewedSorObservation[]>()
  for (const row of currentResults?.rows ?? []) {
    const family = reviewedFamilyKey(row)
    groups.set(family, [...(groups.get(family) ?? []), row])
  }
  const parsedSearch = parseReviewedSorSearch(query)
  const schedules = parsedSearch.roadsAndBridges
    ? currentCatalogues?.rows.filter(row => row.catalogue_code.startsWith('RB_')) : currentCatalogues?.rows
  const selectedInDifferentYear = year !== sorYear

  return <div className="additem-col reviewed-sor-col">
    <div className="col-header reviewed-sor-header">
      <div><h3>Reviewed SOR</h3><span className="col-tag">Annual rates &amp; priced variants</span></div>
      <button type="button" className="btn-mini" onClick={onShowBasicRates}>Basic rates / legacy catalogue</button>
    </div>
    <div className="reviewed-sor-filters">
      <label>SOR year<select value={year} onChange={event => changeYear(event.target.value)}>
        {Array.from(new Set([sorYear, ...EDITIONS])).filter(Boolean).map(edition => <option key={edition} value={edition}>{edition}{edition === sorYear ? ' · Project' : ''}</option>)}
      </select></label>
      <label>Table / schedule<select value={catalogue ?? ''} onChange={event => { setCatalogue(event.target.value || null); setChoice(null); setPendingRecipe(null) }}>
        <option value="">All available schedules</option>
        {schedules?.map(row => <option key={row.catalogue_code} value={row.catalogue_code}>{tableLabel(row.table_name)} ({row.published_variants.toLocaleString('en-IN')})</option>)}
      </select></label>
      <label className="reviewed-sor-search"><Search size={14} /><input className="text-input" aria-label="Search reviewed SOR" placeholder="Description, code, table or R&B Sl. No. 230" value={query} onChange={event => setQuery(event.target.value)} /></label>
    </div>
    {notice && <p className="reviewed-sor-notice" role="status">{notice}</p>}
    {selectedInDifferentYear && <p className="reviewed-sor-notice">Comparing {year}. Return to the project year {sorYear} to add an item.</p>}
    {parsedSearch.serial && !catalogue && <p className="reviewed-sor-notice">Serial {parsedSearch.serial} is scoped to each schedule. Choose the relevant table above or use its reference below.</p>}
    {currentCatalogues?.error && <div className="reviewed-sor-error" role="alert">{currentCatalogues.error} <button onClick={() => setReload(value => value + 1)}>Retry</button></div>}
    <div className="reviewed-sor-scroll">
      {pendingRecipe ? <p className="reviewed-sor-loading"><LoaderCircle className="spin" size={16} /> Checking this variant in {year}…</p> : choice && choice.sor_year === year ? <>
        <button className="btn-mini" onClick={() => { setPendingRecipe(null); setChoice(null) }}><ArrowLeft size={13} /> Families and variants</button>
        <ReviewedSorDetailPanel key={choice.occurrence_id} row={choice} projectYear={sorYear} onAdd={onAdd}
          selected={selected} />
      </> : !currentResults ? <p className="reviewed-sor-loading"><LoaderCircle className="spin" size={16} /> Loading this edition…</p>
        : currentResults.error ? <div className="reviewed-sor-error" role="alert">{currentResults.error} <button onClick={() => setReload(value => value + 1)}>Retry</button></div>
          : <>
            {!groups.size && <p className="reviewed-sor-empty">No selectable items found in {year}. Try another table or search.</p>}
            {Array.from(groups.entries()).map(([family, rows]) => <ReviewedSorFamily key={family} rows={rows} onChoose={choose} />)}
            {currentResults.hasMore && <button className="reviewed-sor-more" disabled={loadingMore} onClick={loadMore}>{loadingMore ? 'Loading…' : 'Load more families and variants'}</button>}
          </>}
    </div>
  </div>
}

function ReviewedSorFamily({ rows, onChoose }: { rows: ReviewedSorObservation[]; onChoose: (row: ReviewedSorObservation) => void }): JSX.Element {
  const first = rows[0]
  const [complete, setComplete] = useState<ReviewedSorObservation[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const loadVariants = (): void => {
    if (complete || loading) return
    setLoading(true)
    setError('')
    // Search the exact published parent phrase, then retain its exact family key.
    // Paging ensures a result boundary never silently hides a priced child.
    const load = async (): Promise<ReviewedSorObservation[]> => {
      const found: ReviewedSorObservation[] = []
      let offset = 0
      let more = true
      while (more) {
        const page = await searchReviewedSorItems(first.sor_year, `"${first.family_label.replace(/"/g, '')}"`, first.catalogue_code, offset, false)
        found.push(...page.rows.filter(row => reviewedFamilyKey(row) === reviewedFamilyKey(first)))
        more = page.hasMore
        offset += 100
      }
      return found
    }
    void load().then(found => { setComplete(found); setLoading(false) }).catch(reason => { setError(errorText(reason)); setLoading(false) })
  }
  const variants = Array.from(new Map([...rows, ...(complete ?? [])].map(row => [row.occurrence_id, row])).values())
  const subgroups = new Map<string, ReviewedSorObservation[]>()
  for (const row of variants) subgroups.set(row.group_label, [...(subgroups.get(row.group_label) ?? []), row])
  return <details className="reviewed-sor-family" onToggle={event => { if (event.currentTarget.open) loadVariants() }}>
    <summary><ChevronRight size={14} /><span><small>{tableLabel(first.table_name)}</small><strong>{first.family_label}</strong><small>{variants.length} priced variant{variants.length === 1 ? '' : 's'}{!complete ? ' shown' : ''}</small></span></summary>
    <div className="reviewed-sor-variants">
      {loading && <p role="status">Loading all matching variants…</p>}
      {error && <p className="reviewed-sor-error" role="alert">{error} <button onClick={loadVariants}>Retry</button></p>}
      {Array.from(subgroups.entries()).map(([group, children]) => <div key={group}>
        {group && <h4>{group}</h4>}
        {children.map(row => <button key={row.occurrence_id} className="reviewed-sor-variant" onClick={() => onChoose(row)}>
          <span><strong>{row.variant_label || row.effective_description}</strong><small>{reviewedReference(row)}</small></span>
          <span><b>{row.cost_ready ? reviewedTariff(row) : reviewedCostStatus(row)}</b>{row.has_reviewed_correction && <small>Reviewed specification / basis</small>}</span>
        </button>)}
      </div>)}
    </div>
  </details>
}

function ReviewedSorDetailPanel({ row, projectYear, onAdd, selected }: {
  row: ReviewedSorObservation; projectYear: string; onAdd: (item: MasterItem) => void; selected: Map<string, MasterItem>
}): JSX.Element {
  const [detailResult, setDetailResult] = useState<{ reload: number; value: ReviewedSorDetail } | null>(null)
  const [history, setHistory] = useState<ReviewedSorObservation[] | null>(null)
  const [error, setError] = useState('')
  const [historyError, setHistoryError] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [ruleIds, setRuleIds] = useState<string[]>([])
  const [calculation, setCalculation] = useState<{ key: string; value?: ReviewedSorCalculation; error?: string } | null>(null)
  const [reload, setReload] = useState(0)
  const detail = detailResult?.reload === reload ? detailResult.value : null
  const calculationKey = JSON.stringify([detail?.observation.occurrence_id, quantity, ruleIds, reload])
  const currentCalculation = calculation?.key === calculationKey ? calculation : null

  useEffect(() => {
    let active = true
    void getReviewedSorItem(row.occurrence_id).then(value => { if (active) { setDetailResult({ reload, value }); setError('') } })
      .catch(reason => { if (active) setError(errorText(reason)) })
    void getReviewedSorHistory(row.item_id).then(value => { if (active) { setHistory(value); setHistoryError('') } })
      .catch(reason => { if (active) setHistoryError(errorText(reason)) })
    return () => { active = false }
  }, [row.occurrence_id, row.item_id, reload])

  useEffect(() => {
    if (!detail?.observation.cost_ready || detail.observation.assessment_status !== 'numeric' || !(Number(quantity) > 0)) return
    let active = true
    const timer = setTimeout(() => {
      void calculateReviewedSorSelection(detail.observation.occurrence_id, Number(quantity), ruleIds)
        .then(value => { if (active) setCalculation({ key: calculationKey, value }) })
        .catch(reason => { if (active) setCalculation({ key: calculationKey, error: errorText(reason) }) })
    }, 200)
    return () => { active = false; clearTimeout(timer) }
  }, [detail, quantity, ruleIds, calculationKey])

  if (error) return <div className="reviewed-sor-error" role="alert">{error} <button onClick={() => setReload(value => value + 1)}>Retry</button></div>
  if (!detail) return <p className="reviewed-sor-loading"><LoaderCircle className="spin" size={16} /> Loading reviewed specification…</p>
  const annual = detail.observation
  const readyRules = readyReviewedRules(detail)
  const sourceNotes = Array.isArray(detail.sourceContext.rate_notes) ? detail.sourceContext.rate_notes : []
  const informational = sourceNotes.map(note => String(sorRecord(note).text ?? '')).filter(Boolean)
    .filter(text => !readyRules.some(rule => rule.source_note?.text === text))
  const unreadyRules = detail.rules.filter(rule => !readyRules.includes(rule))
  const value = currentCalculation?.value
  const positiveQuantity = Number.isFinite(Number(quantity)) && Number(quantity) > 0
  const canCost = annual.cost_ready && annual.assessment_status === 'numeric'
  const selectionKey = `SOR:sor_catalogue:${row.item_id}${ruleIds.length ? `:rules:${[...ruleIds].sort().join(',')}` : ''}`
  const alreadySelected = selected.has(selectionKey)
  const add = (): void => {
    if (!value || !positiveQuantity || annual.sor_year !== projectYear) return
    if (value.published_rate !== annual.rate || value.basis_quantity !== annual.basis_quantity || value.quantity_unit !== annual.unit) {
      setError('The reviewed observation changed during calculation. Retry to review the current specification and tariff.')
      return
    }
    onAdd(makeReviewedMasterItem(detail, value, ruleIds))
  }
  return <article className="reviewed-sor-detail">
    <p className="reviewed-sor-reference">{reviewedReference(annual)}</p>
    <h4>Effective reviewed specification</h4><p className="reviewed-sor-specification">{annual.effective_description}</p>
    <div className="reviewed-sor-tariff"><strong>{reviewedTariff(annual, detail.sourceContext)}</strong><span>{reviewedCostStatus(annual)}</span></div>
    <details className="reviewed-sor-evidence"><summary>Printed wording &amp; review evidence</summary>
      <h4>Printed wording</h4><p>{annual.description}</p>
      <p>Source PDF page {annual.pdf_page ?? 'not recorded'} · Printed unit: {String(sorRecord(detail.payload.printed_unit_basis).raw_unit ?? '') || 'blank in source'}</p>
      {Object.keys(sorRecord(annual.features.commercial_terms ?? detail.sourceContext.commercial_terms)).length > 0 && <>
        <h4>Published commercial terms</h4><Evidence value={sorRecord(annual.features.commercial_terms ?? detail.sourceContext.commercial_terms)} />
      </>}
      {['specification_review', 'unit_resolution'].map(key => {
        const evidence = sorRecord(detail.sourceContext[key])
        return Object.keys(evidence).length ? <div key={key}>
          <h4>{key === 'specification_review' ? 'Specification review' : 'Tariff unit evidence'}</h4>
          <p>{evidence.authority === 'user_confirmation' || evidence.method === 'user_confirmation' ? 'User confirmation' : 'Historical / reviewed source evidence'}{evidence.official_correction === false ? ' · not an official correction' : ''}</p>
          <Evidence value={evidence} />
        </div> : null
      })}
    </details>
    <section className="reviewed-sor-extras"><h4>Optional add-ons</h4>
      {readyRules.filter(rule => rule.selection === 'optional').map(rule => <label key={rule.rule_id} className="reviewed-sor-rule">
        <input type="checkbox" checked={ruleIds.includes(rule.rule_id)} disabled={!canCost} onChange={event => setRuleIds(event.target.checked ? [rule.rule_id] : [])} />
        <span>{rule.label}: +{rule.value_pct}%<small>Base: selected annual published rate</small></span>
      </label>)}
      {!readyRules.some(rule => rule.selection === 'optional') && <p>No verified optional add-ons for this annual variant.</p>}
      <details><summary>Adjustments, included work &amp; source notes</summary>
        <h4>Adjustments</h4><p>Conditional increases or deductions require a verified calculation rule and base.</p>
        {readyRules.filter(rule => rule.selection !== 'optional').map(rule => <label key={rule.rule_id} className="reviewed-sor-rule"><input type="checkbox" checked={ruleIds.includes(rule.rule_id)} disabled={!canCost} onChange={event => setRuleIds(event.target.checked ? [rule.rule_id] : [])} /><span>{rule.label}: {rule.value_pct}% · selected annual published rate</span></label>)}
        <h4>Included work</h4><p>Work covered by the effective specification above is included in the published rate.</p>
        <h4>Source notes</h4>
        {readyRules.map(rule => <p key={rule.rule_id}>{rule.source_note?.text || rule.label} · verified for this annual variant{rule.source_note?.page ? ` · PDF page ${rule.source_note.page}` : ''}</p>)}
        {informational.map((text, index) => <p key={index}>{text}</p>)}
        {unreadyRules.map(rule => <p key={rule.rule_id}>{rule.label || rule.source_note?.text} · awaiting verified calculation rules</p>)}
        {!informational.length && !unreadyRules.length && <p>No additional unverified notes retained for this variant.</p>}
        {(informational.length > 0 || unreadyRules.length > 0) && <p>Informational only. No calculation or stacking is inferred.</p>}
      </details>
    </section>
    <details className="reviewed-sor-history"><summary>Rates across available editions</summary>
      {historyError ? <p role="alert">{historyError} <button onClick={() => setReload(count => count + 1)}>Retry</button></p> : !history ? <p>Loading annual observations…</p> : <div className="reviewed-sor-table-wrap"><table>
        <thead><tr><th>Edition / annual reference</th><th>Wording</th><th>Tariff</th><th>Costing status</th></tr></thead>
        <tbody>{history.map(observation => <tr key={observation.occurrence_id}><td>{reviewedReference(observation)}</td><td><details><summary>View wording</summary><p>{observation.effective_description}</p>{observation.description !== observation.effective_description && <p>Printed: {observation.description}</p>}</details></td><td>{reviewedTariff(observation)}</td><td>{reviewedCostStatus(observation)}</td></tr>)}</tbody>
      </table></div>}
    </details>
    {canCost ? <div className="reviewed-sor-costing">
      <label>Quantity ({annual.unit})<input className="text-input" type="number" min="0" step="any" value={quantity} onChange={event => setQuantity(event.target.value)} /></label>
      {!positiveQuantity ? <p role="alert">Enter a positive quantity.</p> : currentCalculation?.error ? <p className="reviewed-sor-error" role="alert">{currentCalculation.error} <button onClick={() => setReload(count => count + 1)}>Retry</button></p> : !value ? <p role="status">Calculating verified amount…</p> : <div className="reviewed-sor-amount" aria-live="polite">
        <p>Base {sorMoney(value.published_rate)}{value.adjustments.map(rule => <span key={rule.rule_id}> + {rule.label.toLowerCase()} {sorMoney(rule.extra_per_basis)}</span>)} = <strong>{sorMoney(value.adjusted_rate_per_basis)}</strong> per {value.basis_quantity === 1 ? '' : `${value.basis_quantity.toLocaleString('en-IN')} `}{value.quantity_unit}</p>
        <p>{value.quantity.toLocaleString('en-IN')} {value.quantity_unit} · Base amount {sorMoney(value.base_amount)}{value.extra_amount !== 0 ? ` + extras ${sorMoney(value.extra_amount)}` : ''}</p>
        <div>Final amount <strong>{sorMoney(value.total_amount)}</strong></div>
      </div>}
      <button className="reviewed-sor-add" disabled={!value || !positiveQuantity || annual.sor_year !== projectYear} onClick={add}>
        {alreadySelected ? <Check size={15} /> : <Plus size={15} />}{alreadySelected ? 'Update selected item' : 'Add to estimate selection'}
      </button>
    </div> : <p className="reviewed-sor-error">{reviewedCostStatus(annual)}. {String(sorRecord(detail.payload.assessment).reason ?? '')} Direct costing is blocked until the required analysis, inputs or clarification is resolved.</p>}
  </article>
}

function Evidence({ value }: { value: Record<string, unknown> }): JSX.Element {
  return <dl className="reviewed-sor-evidence-list">{Object.entries(value).filter(([key]) => !['target', 'source', 'printed_row_sha256', 'official_correction', 'authority', 'method'].includes(key)).map(([key, entry]) => <div key={key}>
    <dt>{tableLabel(key)}</dt><dd>{typeof entry === 'object' && entry !== null ? <pre>{JSON.stringify(entry, null, 2)}</pre> : String(entry ?? '')}</dd>
  </div>)}</dl>
}
