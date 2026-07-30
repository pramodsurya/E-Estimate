import { useEffect, useState } from 'react'
import type { EestimateProject, ProjectNode } from '../../types/project'
import type { RateAnalysisRecipe } from '../../types/rateAnalysis'
import { buildCombinedComponentPdf } from '../../lib/componentPrint'
import { componentItemsTotal } from '../../lib/finalNumber'
import PdfPageStack from './PdfPageStack'

export default function ComponentPrintPreviewStack({
  project,
  component,
  recipes,
  rateOf,
  fontScale
}: {
  project: EestimateProject
  component: ProjectNode
  recipes: Record<string, RateAnalysisRecipe>
  rateOf: (node: ProjectNode) => number | undefined
  fontScale: number
}): JSX.Element {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null
    setPdfUrl(null)
    setError(null)

    void buildCombinedComponentPdf({
      project,
      section: component,
      recipes,
      rateOf,
      total: componentItemsTotal(project, component, rateOf, true),
      fontScale
    })
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
  }, [component, fontScale, project, rateOf, recipes])

  if (error) return <div className="component-print-preview-message error">{error}</div>
  if (!pdfUrl) return <div className="component-print-preview-message">Assembling {component.name}…</div>
  return <PdfPageStack src={pdfUrl} zoom={100} />
}
