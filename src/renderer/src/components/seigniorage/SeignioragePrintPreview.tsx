import { useMemo } from 'react'
import EEstimateCombinedPrintPreview, { type CombinedPdfPart } from '../print/EEstimateCombinedPrintPreview'

export default function SeignioragePrintPreview({
  typstSource,
  compileInputs,
  year,
  onClose
}: {
  typstSource: string
  compileInputs: Record<string, string>
  year: string
  onClose: () => void
}): JSX.Element {
  const parts = useMemo<CombinedPdfPart[]>(() => [{
    id: 'seigniorage-statement',
    label: 'Compiling Seigniorage Statement…',
    build: async () => {
      const result = await window.api.typst.compile(typstSource, compileInputs)
      if (!result.ok || !result.data) {
        throw new Error(result.error || 'The Seigniorage Statement could not be compiled.')
      }
      const binary = atob(result.data)
      return Uint8Array.from(binary, (character) => character.charCodeAt(0))
    }
  }], [typstSource, compileInputs, year])

  return (
    <EEstimateCombinedPrintPreview
      title="Seigniorage Statement"
      description="Preparing the Seigniorage PDF from the current calculation"
      fileName={`Seigniorage Statement - ${year}.pdf`}
      parts={parts}
      onClose={onClose}
    />
  )
}
