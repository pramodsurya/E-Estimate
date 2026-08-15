import { useEffect, useState } from 'react'
import type { EestimateProject, ProjectNode } from '../../types/project'
import type { RateAnalysisRecipe } from '../../types/rateAnalysis'
import {
  buildCombinedComponentPdf,
  isPrintAbort,
  PRINT_REBUILD_DELAY_MS
} from '../../lib/componentPrint'
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

  // The Project Print View mounts one of these per component, so a single edit
  // can queue several whole-component assemblies at once. Each waits out the
  // edit and abandons its build if another arrives, which is what keeps the
  // window answering the keyboard while a preview is open.
  useEffect(() => {
    const controller = new AbortController()
    let objectUrl: string | null = null
    setPdfUrl(null)
    setError(null)

    const handle = window.setTimeout(() => {
      void buildCombinedComponentPdf({
        project,
        section: component,
        recipes,
        rateOf,
        total: componentItemsTotal(project, component, rateOf, true),
        fontScale,
        signal: controller.signal
      })
        .then((bytes) => {
          if (controller.signal.aborted) return
          const copy = new ArrayBuffer(bytes.byteLength)
          new Uint8Array(copy).set(bytes)
          objectUrl = URL.createObjectURL(new Blob([copy], { type: 'application/pdf' }))
          setPdfUrl(objectUrl)
        })
        .catch((reason: unknown) => {
          if (controller.signal.aborted || isPrintAbort(reason)) return
          setError(reason instanceof Error ? reason.message : String(reason))
        })
    }, PRINT_REBUILD_DELAY_MS)

    return () => {
      window.clearTimeout(handle)
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [component, fontScale, project, rateOf, recipes])

  if (error) return <div className="component-print-preview-message error">{error}</div>
  if (!pdfUrl) return <div className="component-print-preview-message">Assembling {component.name}…</div>
  return <PdfPageStack src={pdfUrl} zoom={100} />
}
