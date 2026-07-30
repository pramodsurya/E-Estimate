interface Props {
  /** Proposed bund section, so the filters are drawn where they actually sit. */
  crestWidth: number
  usSlope: number
  dsSlope: number
  /** Bund height above the prepared base at the chainage being shown. */
  height: number
  blanketLength: number
  blanketThickness: number
  chimneyOn: boolean
  chimneyWidth: number
  chimneyHeight: number
  /** MWL as a height above the prepared base; null hides the reference line. */
  mwlRise: number | null
}

const fmt = (value: number): string =>
  Number.isFinite(value) ? value.toFixed(value < 10 ? 2 : 1).replace(/\.?0+$/, '') : '0'

const VIEW_W = 560
const VIEW_H = 300
const PAD_L = 44
const PAD_R = 30
const PAD_TOP = 34
const PAD_BOTTOM = 58

/**
 * Live internal-drainage detail: the horizontal blanket running in from the
 * downstream toe and the chimney standing on its inner end, drawn inside the
 * proposed section they are built into.
 *
 * Both are new-fill elements, so this is the shape the quantities measure: the
 * blanket is length x thickness, the chimney width x height, each carried along
 * the chainage. The vertical scale is exaggerated like every other bund
 * section drawing — a 1 m blanket under a 40 m wide bund is otherwise invisible.
 */
export default function BundFilterDiagram({
  crestWidth,
  usSlope,
  dsSlope,
  height,
  blanketLength,
  blanketThickness,
  chimneyOn,
  chimneyWidth,
  chimneyHeight,
  mwlRise
}: Props): JSX.Element {
  const h = Math.max(0.5, height || 0)
  const crest = Math.max(0.1, crestWidth || 0)
  const us = Math.max(0, usSlope || 0)
  const ds = Math.max(0, dsSlope || 0)

  // Metres, measured from the u/s toe along the base and up from the prepared
  // (stripped) surface the blanket is laid on.
  const usRun = us * h
  const dsToeX = usRun + crest + ds * h
  const crestLeftX = usRun
  const crestRightX = usRun + crest

  const thickness = Math.max(0, blanketThickness || 0)
  // The blanket cannot run in past the crest — beyond that it would be under
  // the upstream face, which is the wet side it exists to keep water away from.
  const blanketInnerX = Math.max(crestRightX, dsToeX - Math.max(0, blanketLength || 0))
  const drawnBlanketLength = dsToeX - blanketInnerX
  const chimney = chimneyOn ? Math.max(0, chimneyWidth || 0) : 0
  const chimneyTop = chimneyOn ? thickness + Math.max(0, chimneyHeight || 0) : 0

  const topM = Math.max(h, chimneyTop, mwlRise ?? 0) * 1.08
  const usableW = VIEW_W - PAD_L - PAD_R
  const usableH = VIEW_H - PAD_TOP - PAD_BOTTOM
  const X = (m: number): number => PAD_L + (m / Math.max(dsToeX, 0.001)) * usableW
  const Y = (m: number): number => PAD_TOP + usableH - (m / Math.max(topM, 0.001)) * usableH

  const baseY = Y(0)
  const blanketTopY = Y(thickness)
  // Thin layers vanish at this exaggeration; keep them legible without
  // pretending they are thicker than they are (the label carries the number).
  const blanketBandY = Math.min(blanketTopY, baseY - 4)
  const chimneyLeft = X(blanketInnerX)
  const chimneyRight = Math.max(X(blanketInnerX + chimney), chimneyLeft + 4)

  const bund = [
    `${X(0)},${baseY}`,
    `${X(crestLeftX)},${Y(h)}`,
    `${X(crestRightX)},${Y(h)}`,
    `${X(dsToeX)},${baseY}`
  ].join(' ')

  return (
    <svg
      className="bund-filter-diagram"
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      role="img"
      aria-label="Horizontal filter blanket and chimney filter inside the proposed bund section"
    >
      <polygon className="bund-filter-body" points={bund} />
      <line className="bund-filter-base" x1={PAD_L - 20} y1={baseY} x2={VIEW_W - 8} y2={baseY} />
      <text className="bund-filter-note" x={PAD_L - 20} y={baseY + 14}>
        prepared base
      </text>

      {mwlRise != null && mwlRise > 0 && mwlRise < topM && (
        <>
          <line
            className="bund-filter-mwl"
            x1={PAD_L - 20}
            y1={Y(mwlRise)}
            x2={VIEW_W - 8}
            y2={Y(mwlRise)}
          />
          <text className="bund-filter-note" x={VIEW_W - 10} y={Y(mwlRise) - 4} textAnchor="end">
            MWL
          </text>
        </>
      )}

      {drawnBlanketLength > 0 && (
        <>
          <rect
            className="bund-overlay-hfilter"
            x={X(blanketInnerX)}
            y={blanketBandY}
            width={X(dsToeX) - X(blanketInnerX)}
            height={baseY - blanketBandY}
          />
          <line
            className="bund-toe-dim"
            x1={X(blanketInnerX)}
            y1={baseY + 24}
            x2={X(dsToeX)}
            y2={baseY + 24}
          />
          <text
            className="bund-toe-dimlabel"
            x={(X(blanketInnerX) + X(dsToeX)) / 2}
            y={baseY + 37}
            textAnchor="middle"
          >
            blanket {fmt(drawnBlanketLength)} m × {fmt(thickness)} m thick
          </text>
        </>
      )}

      {chimneyOn && chimneyTop > thickness && (
        <>
          <rect
            className="bund-overlay-vfilter"
            x={chimneyLeft}
            y={Y(chimneyTop)}
            width={chimneyRight - chimneyLeft}
            height={Math.max(3, blanketBandY - Y(chimneyTop))}
          />
          <line
            className="bund-toe-dim"
            x1={chimneyRight + 7}
            y1={Y(chimneyTop)}
            x2={chimneyRight + 7}
            y2={blanketBandY}
          />
          <text
            className="bund-toe-dimlabel"
            x={chimneyRight + 12}
            y={(Y(chimneyTop) + blanketBandY) / 2}
            dominantBaseline="middle"
          >
            chimney {fmt(chimneyHeight)} m high × {fmt(chimneyWidth)} m wide
          </text>
        </>
      )}

      {/* The seepage the pair exists to collect: down the chimney (or straight
          into the blanket without one) and out at the downstream toe. */}
      <path
        className="bund-filter-flow"
        d={
          chimneyOn && chimneyTop > thickness
            ? `M ${(chimneyLeft + chimneyRight) / 2} ${Y(chimneyTop) + 6}
               L ${(chimneyLeft + chimneyRight) / 2} ${blanketBandY - 3}
               L ${X(dsToeX) - 6} ${blanketBandY - 3}`
            : `M ${X(blanketInnerX) + 6} ${blanketBandY - 3}
               L ${X(dsToeX) - 6} ${blanketBandY - 3}`
        }
        markerEnd="url(#bund-filter-arrow)"
      />
      <defs>
        <marker
          id="bund-filter-arrow"
          markerWidth="7"
          markerHeight="7"
          refX="5"
          refY="3"
          orient="auto"
        >
          <path className="bund-filter-arrowhead" d="M0,0 L6,3 L0,6 z" />
        </marker>
      </defs>

      <text className="bund-toe-area" x={VIEW_W - 8} y={VIEW_H - 6} textAnchor="end">
        Section at H {fmt(h)} m · crest {fmt(crest)} m · 1:{fmt(us)} u/s · 1:{fmt(ds)} d/s
      </text>
      {drawnBlanketLength + 1e-6 < Math.max(0, blanketLength || 0) && (
        <text className="bund-filter-warn" x={PAD_L - 20} y={VIEW_H - 22}>
          Blanket clipped to {fmt(drawnBlanketLength)} m — it cannot run in past the crest.
        </text>
      )}
    </svg>
  )
}
