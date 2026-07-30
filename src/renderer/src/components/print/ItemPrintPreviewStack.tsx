import { useEffect, useState } from 'react'
import type { EestimateProject, ProjectNode } from '../../types/project'
import type { RateAnalysisRecipe } from '../../types/rateAnalysis'
import { buildItemPrintPdf } from '../../lib/componentPrint'
import PdfPageStack from './PdfPageStack'

export default function ItemPrintPreviewStack({
  project,
  item,
  recipe,
  fontScale
}: {
  project: EestimateProject
  item: ProjectNode
  recipe?: RateAnalysisRecipe
  fontScale: number
}): JSX.Element {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null
    setPdfUrl(null)
    setError(null)

    void buildItemPrintPdf({ project, item, recipe, fontScale })
      .then((bytes) => {
        if (cancelled) return
        const copy = new ArrayBuffer(bytes.byteLength)
        new Uint8Array(copy).set(bytes)
        objectUrl = URL.createObjectURL(new Blob([copy], { type: 'application/pdf' }))
        setPdfUrl(objectUrl)
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason))
      })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [fontScale, item, project, recipe])

  if (error) return <div className="component-print-preview-message error">{error}</div>
  if (!pdfUrl) return <div className="component-print-preview-message">Rendering DATA…</div>
  return <PdfPageStack src={pdfUrl} zoom={100} />
}
