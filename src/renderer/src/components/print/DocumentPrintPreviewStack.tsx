import { useEffect, useState } from 'react'
import type { EestimateProject, Margins, PrintConfig, ProjectNode } from '../../types/project'
import { buildDocumentPrintHtml } from '../../lib/documentPrint'
import { resolveNodeSettings } from '../../lib/nodeSettings'
import PdfPageStack from './PdfPageStack'
import {
  applySignatureFooterToPdf,
  resolveDocumentSignatureFooter
} from '../../lib/signatureFooter'

const DEFAULT_MARGINS: Margins = { top: 20, right: 15, bottom: 20, left: 25 }

export default function DocumentPrintPreviewStack({
  project,
  node
}: {
  project: EestimateProject
  node: ProjectNode
}): JSX.Element {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null
    setPdfUrl(null)
    setError(null)

    const inherited = resolveNodeSettings(project.root, node.id)
    const config: PrintConfig = {
      ...node.print,
      pageSize: node.print?.pageSize ?? inherited.pageSize ?? 'A4',
      orientation: node.print?.orientation ?? inherited.orientation ?? 'portrait',
      margins: node.print?.margins ?? inherited.margins ?? DEFAULT_MARGINS,
      scaleMode: node.print?.scaleMode ?? 'fit-width',
      scalePercent: node.print?.scalePercent ?? 100
    }
    const pageSize = config.pageSize ?? 'A4'
    const orientation = config.orientation ?? 'portrait'
    const margins = config.margins ?? DEFAULT_MARGINS
    const built = buildDocumentPrintHtml(
      node,
      config,
      { pageSize, orientation, margins },
      { projectName: project.meta.name, title: node.name }
    )

    if (built.empty) return
    const signed = applySignatureFooterToPdf(
      built.html,
      built.pdfOptions,
      resolveDocumentSignatureFooter(project, node)
    )
    void window.api.print.toPdf(signed.html, signed.options)
      .then((result) => {
        if (cancelled) return
        if (!result.ok || !result.data) throw new Error(result.error ?? 'Could not render document pages.')
        const binary = atob(result.data)
        const bytes = new Uint8Array(binary.length)
        for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
        objectUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
        setPdfUrl(objectUrl)
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason))
      })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [node, project])

  if (error) return <div className="component-print-preview-message error">{error}</div>
  if (!pdfUrl) return <div className="component-print-preview-message">Rendering {node.name}…</div>
  return <PdfPageStack src={pdfUrl} zoom={100} />
}
