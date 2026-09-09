import { bundRockToeDiagramSvg, type BundRockToeDiagramSpec } from '../../lib/bundRockToeDiagram'

type Props = BundRockToeDiagramSpec

/**
 * Live rock-toe detail. The outer face is collinear with the proposed bund
 * downstream face. The shared renderer switches only its colour theme for
 * print, so both outputs retain the same geometry and dimensions.
 */
export default function BundRockToeDiagram({
  topWidth,
  innerSlope,
  outerSlope,
  height,
  excavationDepth,
  filterEnabled
}: Props): JSX.Element {
  const svg = bundRockToeDiagramSvg(
    { topWidth, innerSlope, outerSlope, height, excavationDepth, filterEnabled },
    'screen'
  )
  return <div className="bund-rocktoe-diagram-host" dangerouslySetInnerHTML={{ __html: svg }} />
}
