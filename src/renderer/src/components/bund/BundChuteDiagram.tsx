interface Props {
  /** Clear channel width and depth (m). */
  width: number
  depth: number
  /** Lining/protection thickness (m). */
  liningThickness: number
  protection: 'concrete' | 'stone'
  /** Slope the chute runs down, 1 in N; drawn as the arrow beside the section. */
  faceSlope: number
  lined: boolean
}

const fmt = (value: number): string =>
  Number.isFinite(value) ? value.toFixed(2).replace(/\.?0+$/, '') : '0'

const W = 340
const H = 190
const PAD_X = 40
const GROUND_Y = 62

/**
 * Chute-drain detail: the rectangular channel cut down the downstream face,
 * with its concrete or stone protection wrapped round the bed and sides.
 *
 * Drawn as a section across the chute, which is the section the width, depth
 * and lining thickness are measured on — the run down the face is what turns
 * that section into a quantity, so it is shown only as the fall arrow.
 */
export default function BundChuteDiagram({
  width,
  depth,
  liningThickness,
  protection,
  faceSlope,
  lined
}: Props): JSX.Element {
  const w = Math.max(0.05, width || 0)
  const d = Math.max(0.05, depth || 0)
  const t = lined ? Math.max(0, liningThickness || 0) : 0

  // Fit the channel plus its lining and a margin of face either side.
  const margin = Math.max(0.5, w * 0.6)
  const spanX = w + 2 * t + 2 * margin
  const spanY = d + t + 0.6
  const scale = Math.min((W - PAD_X * 2) / spanX, (H - GROUND_Y - 46) / spanY)

  const midX = W / 2
  const left = midX - (w / 2) * scale
  const right = midX + (w / 2) * scale
  const invert = GROUND_Y + d * scale
  const outerLeft = left - t * scale
  const outerRight = right + t * scale
  const outerInvert = invert + t * scale

  // Ground with the channel notched out of it.
  const ground = [
    `M ${PAD_X - 14} ${GROUND_Y}`,
    `L ${outerLeft} ${GROUND_Y}`,
    `L ${outerLeft} ${outerInvert}`,
    `L ${outerRight} ${outerInvert}`,
    `L ${outerRight} ${GROUND_Y}`,
    `L ${W - PAD_X + 14} ${GROUND_Y}`,
    `L ${W - PAD_X + 14} ${H - 30}`,
    `L ${PAD_X - 14} ${H - 30}`,
    'Z'
  ].join(' ')

  // The protection wraps the bed and both sides: outer face against the cut,
  // inner face against the water. Drawn as one ring, which is how it is built.
  const liningRing = [
    `M ${outerLeft} ${GROUND_Y}`,
    `L ${outerLeft} ${outerInvert}`,
    `L ${outerRight} ${outerInvert}`,
    `L ${outerRight} ${GROUND_Y}`,
    `L ${right} ${GROUND_Y}`,
    `L ${right} ${invert}`,
    `L ${left} ${invert}`,
    `L ${left} ${GROUND_Y}`,
    'Z'
  ].join(' ')

  return (
    <svg
      className="bund-chute-diagram"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Chute drain ${fmt(w)} m wide and ${fmt(d)} m deep with ${
        lined ? `${protection} protection` : 'no protection'
      }`}
    >
      <path d={ground} className="bund-berm-body" />
      {t > 0 && (
        <path
          d={liningRing}
          className={
            protection === 'stone' ? 'bund-chute-lining is-stone' : 'bund-chute-lining'
          }
        />
      )}
      <path
        d={`M ${left} ${GROUND_Y} L ${left} ${invert} L ${right} ${invert} L ${right} ${GROUND_Y}`}
        className="bund-berm-surface-line"
        fill="none"
      />

      {/* Width across the invert, depth up the right-hand side. */}
      <line className="bund-toe-dim" x1={left} y1={invert + 18} x2={right} y2={invert + 18} />
      <text
        className="bund-toe-dimlabel"
        x={midX}
        y={invert + 31}
        textAnchor="middle"
      >
        {fmt(w)} m clear
      </text>
      <line className="bund-toe-dim" x1={outerRight + 14} y1={GROUND_Y} x2={outerRight + 14} y2={invert} />
      <text
        className="bund-toe-dimlabel"
        x={outerRight + 19}
        y={(GROUND_Y + invert) / 2}
        dominantBaseline="middle"
      >
        {fmt(d)} m
      </text>

      {t > 0 && (
        <text className="bund-berm-note" x={outerLeft - 4} y={GROUND_Y - 8} textAnchor="end">
          {protection === 'stone' ? 'Stone protection' : 'CC protection'} {fmt(t)} m
        </text>
      )}
      <text className="bund-berm-note" x={PAD_X - 14} y={H - 12}>
        Section across the chute · falls down the 1:{fmt(faceSlope)} face
      </text>
    </svg>
  )
}
