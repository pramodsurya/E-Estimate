import { catalogueChoiceFacts, catalogueChoiceNote, catalogueChoiceTitle, type CatalogueDescription } from '../../lib/catalogueGuidance'
import './catalogueItemDetails.css'

/** The work and its distinguishing specification are visible before any click. */
export default function CatalogueChoiceText({ item }: { item: CatalogueDescription }): JSX.Element {
  const title = catalogueChoiceTitle(item)
  const note = catalogueChoiceNote(item)
  const normalizedTitle = title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
  const facts = catalogueChoiceFacts(item).filter(row =>
    !normalizedTitle.includes(row.value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')))
  return <span className="catalogue-choice-text">
    <strong className="catalogue-choice-title">{title}</strong>
    {facts.length > 0 && <span className="catalogue-choice-facts">{facts.slice(0, 4).map(row => row.value).join(' · ')}</span>}
    {note && <span className="catalogue-choice-purpose">{note}</span>}
  </span>
}
