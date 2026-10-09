import { useEffect, useState } from 'react'
import type { SorCatalogueItemSelection } from '../../types/project'
import { fetchSorPublishedReference, sorPublishedReferenceLabel } from '../../lib/sorCatalogue'
import SsrCode from './SsrCode'
import { reviewedReference } from '../../lib/sorReviewed'

export default function CatalogueItemReference({ code, description, catalogue, sorYear }: {
  code: string
  description?: string
  catalogue?: SorCatalogueItemSelection
  sorYear: string
}): JSX.Element {
  const isCatalogue = Boolean(catalogue) || /^[A-Z][A-Z0-9_]*_[A-F0-9]{12}$/i.test(code)
  const savedReference = catalogue?.selectedYear === sorYear ? catalogue.publishedReference : undefined
  const key = JSON.stringify([code, sorYear])
  const [resolved, setResolved] = useState<{
    key: string
    result: Awaited<ReturnType<typeof fetchSorPublishedReference>>
  } | null>(null)
  useEffect(() => {
    if (!isCatalogue || savedReference || catalogue?.reviewed) return
    let active = true
    void fetchSorPublishedReference(code, sorYear)
      .then((result) => { if (active) setResolved({ key, result }) })
      .catch(() => { if (active) setResolved({ key, result: null }) })
    return () => { active = false }
  }, [code, sorYear, key, isCatalogue, savedReference, catalogue?.reviewed])

  if (catalogue?.reviewed) {
    const label = reviewedReference(catalogue.reviewed.observation)
    return <b className="ssr-code-hover" title={[label, description].filter(Boolean).join('\n')}>{label}</b>
  }
  if (!isCatalogue) return <SsrCode code={code} description={description} />
  const fetched = resolved?.key === key ? resolved.result : null
  const reference = savedReference ?? fetched?.reference
  const label = reference ? sorPublishedReferenceLabel(reference) : catalogue?.catalogueName || description || 'Select catalogue item'
  const page = savedReference ? catalogue?.sourcePage : fetched?.page
  const title = [label, description || fetched?.description, `SOR ${sorYear}`, page ? `Page ${page}` : undefined].filter(Boolean).join('\n')
  return <b className="ssr-code-hover" title={title}>{label}</b>
}
