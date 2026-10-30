import { useState } from 'react'
import { catalogueChoiceFacts, catalogueChoiceTitle, catalogueSourceDifferences, type CatalogueDescription } from '../../lib/catalogueGuidance'
import './catalogueItemDetails.css'

type Choice = CatalogueDescription & { unit?: string | null }
export function useCatalogueComparison(): {
  items: Choice[]; toggle: (item: Choice) => void; clear: () => void
} {
  const [items, setItems] = useState<Choice[]>([])
  return {
    items,
    toggle: item => setItems(previous => previous.some(row => row.code === item.code)
      ? previous.filter(row => row.code !== item.code) : previous.length < 3 ? [...previous, item] : previous),
    clear: () => setItems([])
  }
}
export function CatalogueCompareToggle({ item, comparison }: {
  item: Choice; comparison: ReturnType<typeof useCatalogueComparison>
}): JSX.Element {
  const checked = comparison.items.some(row => row.code === item.code)
  return <label className="catalogue-compare-toggle">
    <input type="checkbox" checked={checked} disabled={!checked && comparison.items.length >= 3}
      aria-label={`Compare ${item.code}`} onChange={() => comparison.toggle(item)} /> Compare
  </label>
}
export default function CatalogueComparison({ comparison }: {
  comparison: ReturnType<typeof useCatalogueComparison>
}): JSX.Element | null {
  if (!comparison.items.length) return null
  const rows = comparison.items.map(item => {
    const facts = new Map(catalogueChoiceFacts(item).map(row => [row.label, row.value]))
    for (const row of item.guidance?.scope ?? []) if (/Formwork|Reinforcement|Pipe supply/.test(row.label)) facts.set(row.label, row.detail)
    return { item, facts }
  })
  const labels = [...new Set(rows.flatMap(row => [...row.facts.keys()]))]
  const sourceDifferences = catalogueSourceDifferences(comparison.items)
  const showSourceDifferences = rows.length > 1 && (rows.some(row => row.item.guidance?.family === 'source') ||
    (new Set(rows.map(row => row.item.guidance?.purpose)).size === 1 &&
      labels.every(label => new Set(rows.map(row => row.facts.get(label))).size === 1)))
  return <section className="catalogue-comparison" aria-label="Compare selected work items">
    <div className="catalogue-comparison-head"><strong>Compare choices ({rows.length}/3)</strong>
      <button type="button" onClick={comparison.clear}>Clear comparison</button></div>
    {rows.length < 2 ? <p>Select one more item’s Compare box to see the differences.</p> :
      <div className="catalogue-comparison-scroll"><table>
        <caption>Highlighted specifications differ between these choices.</caption>
        <thead><tr><th>Specification</th>{rows.map(({ item }) => <th key={item.code}>{catalogueChoiceTitle(item)}<small>{item.code}</small></th>)}</tr></thead>
        <tbody>
          <tr className={new Set(rows.map(row => row.item.guidance?.purpose)).size > 1 ? 'is-different' : ''}>
            <th>Used for</th>{rows.map(({ item }) => <td key={item.code}>{item.guidance?.purpose || catalogueChoiceTitle(item)}</td>)}
          </tr>
          <tr className={new Set(rows.map(row => row.item.unit)).size > 1 ? 'is-different' : ''}>
            <th>Rate unit</th>{rows.map(({ item }) => <td key={item.code}>{item.unit || 'See description'}</td>)}
          </tr>
          {labels.map(label => <tr key={label} className={new Set(rows.map(row => row.facts.get(label))).size > 1 ? 'is-different' : ''}>
            <th>{label}</th>{rows.map(({ item, facts }) => <td key={item.code}>{facts.get(label) || 'Not stated'}</td>)}
          </tr>)}
          {showSourceDifferences && <tr className="is-different"><th>Other source differences</th>
            {rows.map(({ item }, index) => <td key={item.code}>{sourceDifferences[index]}</td>)}
          </tr>}
        </tbody>
      </table></div>}
  </section>
}
