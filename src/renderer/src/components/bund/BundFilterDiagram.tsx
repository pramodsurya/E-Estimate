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
  rockToeOn: boolean
  rockToeFilterOn: boolean
  rockToeTopWidth: number
  rockToeHeight: number
  rockToeInnerSlope: number
  rockToeOuterSlope: number
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
 * Live internal-drainage detail: the horizontal blanket lies below toe RL and
 * runs inward from the rock-toe inner face (or the ordinary d/s toe when no
 * rock toe exists). The chimney stands on its inner end.
 *
 * Both are new-fill elements, so this is the shape the quantities measure: the
 * Blanket and chimney dimensions use the same metre scale as the bund section.
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
  mwlRise,
  rockToeOn,
  rockToeFilterOn,
  rockToeTopWidth,
  rockToeHeight,
  rockToeInnerSlope,
  rockToeOuterSlope
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

  const toeHeight = rockToeOn ? Math.min(h, Math.max(0, rockToeHeight || 0)) : 0
  const toeCrest = Math.max(0, rockToeTopWidth || 0)
  const toeInnerSlope = Math.max(0, rockToeInnerSlope || 0)
  const toeOuterSlope = Math.max(0, rockToeOuterSlope || 0)
  const toeBaseWidth =
    toeHeight > 0
      ? toeCrest + toeHeight * (toeInnerSlope + toeOuterSlope)
      : 0
  const toeBaseLeftX = Math.max(0, dsToeX - toeBaseWidth)
  const toeTopLeftX = toeBaseLeftX + toeInnerSlope * toeHeight
  const toeTopRightX = toeTopLeftX + toeCrest

  const thickness = Math.max(0, blanketThickness || 0)
  // With a rock toe, length is measured inward from its inner base face. With
  // no rock toe, it is measured inward from the ordinary downstream toe.
  const blanketOutletX = rockToeOn && toeHeight > 0 ? toeBaseLeftX : dsToeX
  // The blanket cannot run in past the crest — beyond that it would be under
  // the upstream face, which is the wet side it exists to keep water away from.
  const blanketInnerX = Math.max(
    crestRightX,
    blanketOutletX - Math.max(0, blanketLength || 0)
  )
  const drawnBlanketLength = Math.max(0, blanketOutletX - blanketInnerX)
  const chimney = chimneyOn ? Math.max(0, chimneyWidth || 0) : 0
  const chimneyTop = chimneyOn ? Math.max(0, chimneyHeight || 0) : 0

  const topM = Math.max(h, chimneyTop, mwlRise ?? 0) * 1.08
  const bottomM = -Math.max(thickness, rockToeOn && rockToeFilterOn ? 1 : 0, 0.1)
  const usableW = VIEW_W - PAD_L - PAD_R
  const usableH = VIEW_H - PAD_TOP - PAD_BOTTOM
  const X = (m: number): number => PAD_L + (m / Math.max(dsToeX, 0.001)) * usableW
  const Y = (m: number): number =>
    PAD_TOP + ((topM - m) / Math.max(topM - bottomM, 0.001)) * usableH

  const baseY = Y(0)
  const blanketBottomY = Y(-thickness)
  const toeFilter40Y = Y(-0.65)
  const toeFilter20Y = Y(-0.85)
  const toeFilterBottomY = Y(-1)
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
      aria-label="Connected chimney, horizontal blanket and graded rock-toe filter inside the proposed bund section"
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
            y={baseY}
            width={X(blanketOutletX) - X(blanketInnerX)}
            height={blanketBottomY - baseY}
          />
          <line
            className="bund-toe-dim"
            x1={X(blanketInnerX)}
            y1={baseY - 9}
            x2={X(blanketOutletX)}
            y2={baseY - 9}
          />
          <text
            className="bund-toe-dimlabel"
            x={(X(blanketInnerX) + X(blanketOutletX)) / 2}
            y={baseY - 13}
            textAnchor="middle"
          >
            blanket {fmt(drawnBlanketLength)} m × {fmt(thickness)} m thick
          </text>
        </>
      )}

      {rockToeOn && toeHeight > 0 && (
        <>
          {rockToeFilterOn && (
            <>
              <rect
                className="bund-overlay-rocktoe-filter bund-filter-ca40"
                x={X(toeBaseLeftX)}
                y={baseY}
                width={X(dsToeX) - X(toeBaseLeftX)}
                height={toeFilter40Y - baseY}
              />
              <rect
                className="bund-overlay-rocktoe-filter bund-filter-ca20"
                x={X(toeBaseLeftX)}
                y={toeFilter40Y}
                width={X(dsToeX) - X(toeBaseLeftX)}
                height={toeFilter20Y - toeFilter40Y}
              />
              <rect
                className="bund-overlay-rocktoe-filter bund-filter-sand"
                x={X(toeBaseLeftX)}
                y={toeFilter20Y}
                width={X(dsToeX) - X(toeBaseLeftX)}
                height={toeFilterBottomY - toeFilter20Y}
              />
              <polygon
                className="bund-overlay-rocktoe-filter bund-filter-sand"
                points={[
                  `${X(toeBaseLeftX)},${baseY}`,
                  `${X(toeTopLeftX)},${Y(toeHeight)}`,
                  `${X(toeTopLeftX - 0.5)},${Y(toeHeight)}`,
                  `${X(Math.max(0, toeBaseLeftX - 0.5))},${baseY}`
                ].join(' ')}
              />
              <text
                className="bund-filter-note"
                x={(X(toeBaseLeftX) + X(dsToeX)) / 2}
                y={toeFilterBottomY + 12}
                textAnchor="middle"
              >
                graded rock-toe filter · connected, no blanket overlap
              </text>
            </>
          )}
          <polygon
            className="bund-overlay-rocktoe"
            points={[
              `${X(toeBaseLeftX)},${baseY}`,
              `${X(toeTopLeftX)},${Y(toeHeight)}`,
              `${X(toeTopRightX)},${Y(toeHeight)}`,
              `${X(dsToeX)},${baseY}`
            ].join(' ')}
          />
        </>
      )}

      {chimneyOn && chimneyTop > 0 && (
        <>
          <rect
            className="bund-overlay-vfilter"
            x={chimneyLeft}
            y={Y(chimneyTop)}
            width={chimneyRight - chimneyLeft}
            height={Math.max(3, baseY - Y(chimneyTop))}
          />
          <line
            className="bund-toe-dim"
            x1={chimneyRight + 7}
            y1={Y(chimneyTop)}
            x2={chimneyRight + 7}
            y2={baseY}
          />
          <text
            className="bund-toe-dimlabel"
            x={chimneyRight + 12}
            y={(Y(chimneyTop) + baseY) / 2}
            dominantBaseline="middle"
          >
            chimney {fmt(chimneyHeight)} m high × {fmt(chimneyWidth)} m wide
          </text>
        </>
      )}

      {/* The seepage the pair exists to collect: down the chimney (or straight
          into the blanket without one) and out at the downstream toe. */}
      {drawnBlanketLength > 0 && (
        <path
          className="bund-filter-flow"
          d={
            chimneyOn && chimneyTop > 0
              ? `M ${(chimneyLeft + chimneyRight) / 2} ${Y(chimneyTop) + 6}
                 L ${(chimneyLeft + chimneyRight) / 2} ${Y(-thickness / 2)}
                 L ${X(blanketOutletX) - 4} ${Y(-thickness / 2)}`
              : `M ${X(blanketInnerX) + 6} ${Y(-thickness / 2)}
                 L ${X(blanketOutletX) - 4} ${Y(-thickness / 2)}`
          }
          markerEnd="url(#bund-filter-arrow)"
        />
      )}
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
      {blanketInnerX <= blanketOutletX &&
        blanketOutletX - blanketInnerX + 1e-6 < Math.max(0, blanketLength || 0) && (
        <text className="bund-filter-warn" x={PAD_L - 20} y={VIEW_H - 22}>
          Blanket clipped to {fmt(drawnBlanketLength)} m — it cannot run in past the crest.
        </text>
      )}
    </svg>
  )
}
