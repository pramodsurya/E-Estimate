/**
 * Dashboard mount for the berm-shelf detail. Print and the dashboard both use
 * `bermFigure` in lib/bundFigures.ts so the card matches the printed close-up
 * (face above/below, Shelf RL, width, turfing, drain, cross-fall, scale bar).
 * Dashboard makeup is dark-UI; Typst keeps print makeup.
 */
import type { BundBerm, BundData } from '../../types/project'
import { bermFigure } from '../../lib/bundFigures'

export default function BundBermDiagram({ data, berm }: { data: BundData; berm: BundBerm }): JSX.Element {
  return (
    <div
      className="bund-berm-figure"
      role="img"
      aria-label={`${berm.side === 'us' ? 'Upstream' : 'Downstream'} berm at shelf RL ${berm.level.toFixed(2)} m, ${berm.width.toFixed(2)} m wide with ${
        berm.drainLiningMaterial || berm.drainExcavationMaterial ? 'a catch-water drain' : 'no drain'
      }`}
      dangerouslySetInnerHTML={{ __html: bermFigure(data, berm, 'dashboard') }}
    />
  )
}
