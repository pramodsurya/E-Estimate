import { bundChuteDiagramSvg, type BundChuteDiagramSpec } from '../../lib/bundChuteDiagram'

interface Props extends BundChuteDiagramSpec {
  /** Clear channel width and depth (m). */
  width: number
  depth: number
  /** Lining/protection thickness (m). */
  liningThickness: number
  protection: 'concrete' | 'stone'
  lined: boolean
}

/**
 * Chute-drain detail: the rectangular channel cut down the downstream face,
 * with its concrete or stone protection wrapped round the bed and sides.
 *
 * Drawn as a section across the chute, where width, depth, excavation area and
 * lined perimeter are measured. Developed length is listed in the schedule.
 */
export default function BundChuteDiagram({
  width,
  depth,
  liningThickness,
  protection,
  lined
}: Props): JSX.Element {
  const svg = bundChuteDiagramSvg(
    { width, depth, liningThickness, protection, lined },
    'screen'
  )
  return <div className="bund-chute-diagram-host" dangerouslySetInnerHTML={{ __html: svg }} />
}
