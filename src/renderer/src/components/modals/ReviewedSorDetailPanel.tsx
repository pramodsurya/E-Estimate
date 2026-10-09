import { useEffect, useState } from 'react'
import { Check, LoaderCircle, Plus } from 'lucide-react'
import type { MasterItem } from '../../lib/masterData'
import { calculateReviewedSorSelection, getReviewedSorHistory, getReviewedSorItem, makeReviewedMasterItem,
  readyReviewedRules, reviewedCostStatus, reviewedReference, reviewedTariff, sorMoney, sorRecord, tableLabel } from '../../lib/sorReviewed'
import type { ReviewedSorCalculation, ReviewedSorDetail, ReviewedSorObservation } from '../../types/sorReviewed'
const errorText = (error: unknown): string => error instanceof Error ? error.message : String(error)

export default function ReviewedSorDetailPanel({ row, projectYear, onAdd, selected }: {
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
