import { useMemo, useRef } from 'react'
import EEstimateCombinedPrintPreview, {
  type CombinedPdfPart
} from '../print/EEstimateCombinedPrintPreview'
import { LeadMapPrintPage, type LeadMapPrintPageProps } from './LeadMapPrintStudio'
import { normalizeLeadPrintSettings } from '../../lib/leadPrintLayout'
import { captureLeadMapPng, prepareLeadMapForCapture, type LeadMapCaptureResult } from '../../lib/leadMapCapture'
import {
  leadCompileInputs,
  leadCompileSource,
  leadMapShadowFilesFromCapture
} from '../../lib/typist-output/leadTypst'
import { compileLeadMapPdfFromPage } from '../../lib/typist-output/leadMapTypst'
import type { CompiledLeadDashboardEntry, EestimateProject } from '../../types/project'

interface Props extends LeadMapPrintPageProps {
  year: string
  project: EestimateProject
  entries: CompiledLeadDashboardEntry[]
  typstSource: string
  compilePrelude?: string
  onClose: () => void
}

export default function LeadCombinedPrintPreview({
  year,
  project,
  entries,
  typstSource,
  compilePrelude = '',
  onClose,
  ...mapProps
}: Props): JSX.Element {
  const mapPageRef = useRef<HTMLElement>(null)
  const mapCaptureRef = useRef<LeadMapCaptureResult | null>(null)
  const layout = normalizeLeadPrintSettings(mapProps.printSettings)
  const parts = useMemo<CombinedPdfPart[]>(() => [
    {
      id: 'lead-statement',
      label: 'Compiling Lead Statement…',
      build: async () => {
        document.body.classList.add('eestimate-map-capture-active')
        try {
          await prepareLeadMapForCapture(mapPageRef.current)
          const capture = await captureLeadMapPng(
            mapPageRef.current,
            layout,
            mapProps.signatureFooter,
            false
          )
          mapCaptureRef.current = capture
          const result = await window.api.typst.compile(
            leadCompileSource(typstSource, compilePrelude),
            leadCompileInputs(project, entries, capture),
            leadMapShadowFilesFromCapture(capture)
          )
          if (!result.ok || !result.data) {
            throw new Error(result.error || 'The Lead Statement could not be compiled.')
          }
          return decodeBase64(result.data)
        } finally {
          document.body.classList.remove('eestimate-map-capture-active')
        }
      }
    },
    {
      id: 'route-map',
      label: 'Rendering the separate route-map page…',
      build: async () => {
        document.body.classList.add('eestimate-map-capture-active')
        try {
          return await compileLeadMapPdfFromPage({
            pageRoot: mapPageRef.current,
            layout,
            signatureFooter: mapProps.signatureFooter,
            interactive: false,
            capture: mapCaptureRef.current ?? undefined
          })
        } finally {
          document.body.classList.remove('eestimate-map-capture-active')
        }
      }
    }
  ], [compilePrelude, entries, layout, mapProps.signatureFooter, project, typstSource])

  return (
    <EEstimateCombinedPrintPreview
      title="Lead Statement and Route Map"
      description="Preparing one PDF from the Lead statement and map page"
      fileName={`Lead Statement and Route Map - ${year}.pdf`}
      parts={parts}
      captureContent={
        <LeadMapPrintPage ref={mapPageRef} {...mapProps} interactive={false} />
      }
      onClose={onClose}
    />
  )
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}
