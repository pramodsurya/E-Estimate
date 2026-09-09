import type { BundData, BundSection } from '../../types/project'
import { assemblyFigure } from '../../lib/bundFigures'

/**
 * Diagrammatic general arrangement of the proposed bund. Dashboard and print
 * both render `assemblyFigure` — the same SVG geometry, not a second diagram
 * pipeline. Dashboard passes `purpose: 'dashboard'` for dark-UI makeup.
 */
export default function BundAssemblyDiagram({
  data,
  section
}: {
  data: BundData
  section: BundSection | null
}): JSX.Element {
  if (!section) {
    return (
      <div className="bund-diagram-empty">
        Complete a chainage&rsquo;s levels to draw the bund arrangement.
      </div>
    )
  }

  const svg = assemblyFigure(data, section, 'dashboard')
  if (!svg) {
    return (
      <div className="bund-diagram-empty">
        Complete a chainage&rsquo;s levels to draw the bund arrangement.
      </div>
    )
  }

  return (
    <div
      className="bund-ga-diagram-host"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
