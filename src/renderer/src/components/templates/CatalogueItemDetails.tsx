import { catalogueChoiceFacts, catalogueChoiceNote, catalogueChoiceTitle, concreteGradeExplanation, type CatalogueDescription } from '../../lib/catalogueGuidance'
import './catalogueItemDetails.css'

/** Shared, structured content for the hover card and the touch disclosure. */
export function CatalogueDetailContent({ item, collapsible = false }: { item: CatalogueDescription; collapsible?: boolean }): JSX.Element {
  const g = item.guidance
  const note = catalogueChoiceNote(item)
  const facts = catalogueChoiceFacts(item)
  const extraDetails = <>
    <strong className="catalogue-detail-title">{catalogueChoiceTitle(item)}</strong>
    {note && <p className="catalogue-detail-note">{note}</p>}
    {facts.length > 0 && <dl className="catalogue-detail-facts">
      {facts.map((row, index) => <div key={`${row.label}:${index}`}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}
    </dl>}
    {g && g.grades.length > 0 && <p className="catalogue-grade-meaning">{concreteGradeExplanation(g.grades)}</p>}
    {!!g?.scope.length && <section className="catalogue-detail-section">
      <h4>Work scope</h4>
      <dl className="catalogue-detail-scope">{g.scope.map((row, index) => <div key={`${row.label}:${index}`}>
        <dt>{row.label}</dt><dd>{row.detail}{row.printedPage != null && <small>Source p. {row.printedPage}</small>}</dd>
      </div>)}</dl>
    </section>}
    {g?.terminologyReference?.url === 'https://cpwd.gov.in/Publication/speci_vol1.pdf' &&
      <a href={g.terminologyReference.url} target="_blank" rel="noreferrer">{g.terminologyReference.title}</a>}
  </>
  return <div className="catalogue-detail-content">
    <section className="catalogue-description-first">
      <h4>Description</h4>
      <p className="catalogue-published-description">{item.description || 'Full description is not loaded yet.'}</p>
      {g?.descriptionDetail && g.descriptionDetail !== item.description && <p className="catalogue-published-description">{g.descriptionDetail}</p>}
    </section>
    {g && (collapsible ? <details className="catalogue-more-details">
      <summary aria-label={`More details for ${item.code}`}>More details</summary>
      <div className="catalogue-extra-details">{extraDetails}</div>
    </details> : <div className="catalogue-extra-details">{extraDetails}</div>)}
  </div>
}

/** Separate disclosure works with keyboard/touch and never contains an Add action. */
export default function CatalogueItemDetails({ item }: { item: CatalogueDescription }): JSX.Element {
  return (
    <details className="catalogue-item-details">
      <summary aria-label={`Details for ${item.code}`}>Details</summary>
      <div className="catalogue-item-detail-body">
        <CatalogueDetailContent item={item} />
      </div>
    </details>
  )
}
