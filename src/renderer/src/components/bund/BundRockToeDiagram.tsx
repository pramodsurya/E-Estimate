interface Props {
  topWidth: number
  innerSlope: number
  /** Exposed face slope; supplied from the bund D/S slope. */
  outerSlope: number
  height: number
  excavationDepth: number
  filterEnabled: boolean
}

const fmt = (value: number): string =>
  Number.isFinite(value) ? value.toFixed(value < 10 ? 2 : 1).replace(/\.?0+$/, '') : '0'

type FacePoint = { x: number; y: number }

/**
 * Live rock-toe detail. The outer face is collinear with the proposed bund
 * downstream face. CAW-5-11's three media are drawn individually behind and
 * below the rubble; the below layers occupy the excavation.
 */
export default function BundRockToeDiagram({
  topWidth,
  innerSlope,
  outerSlope,
  height,
  excavationDepth,
  filterEnabled
}: Props): JSX.Element {
  const h = Math.max(0.1, height || 0)
  const crest = Math.max(0, topWidth || 0)
  const inner = Math.max(0, innerSlope || 0)
  const outer = Math.max(0, outerSlope || 0)
  const leftRun = inner * h
  const rightRun = outer * h
  const baseWidth = Math.max(0.1, leftRun + crest + rightRun)
  const scale = Math.min(345 / baseWidth, 76 / h)
  const groundY = 142
  const baseRight = 492
  const baseLeft = baseRight - baseWidth * scale
  const topY = groundY - h * scale
  const topLeft = baseLeft + leftRun * scale
  const topRight = topLeft + crest * scale
  const excavationPx = Math.max(0, excavationDepth || 0) * scale

  // Extend the same outer-face line upward to show that the exposed rock-toe
  // face and the proposed downstream face are one continuous line.
  const extensionRise = Math.min(45, 0.65 * h * scale + 10)
  const bundLineStartX = topRight - outer * extensionRise
  const bundLineStartY = topY - extensionRise

  // Unit normal toward the embankment side of the inner face.
  const faceDx = topLeft - baseLeft
  const faceDy = topY - groundY
  const faceLengthPx = Math.hypot(faceDx, faceDy) || 1
  const normalX = faceDy / faceLengthPx
  const normalY = -faceDx / faceLengthPx
  const facePoint = (point: FacePoint, distanceM: number): FacePoint => ({
    x: point.x + normalX * distanceM * scale,
    y: point.y + normalY * distanceM * scale
  })
  const behindBand = (fromM: number, toM: number): string => {
    const bottomFrom = facePoint({ x: baseLeft, y: groundY }, fromM)
    const topFrom = facePoint({ x: topLeft, y: topY }, fromM)
    const topTo = facePoint({ x: topLeft, y: topY }, toM)
    const bottomTo = facePoint({ x: baseLeft, y: groundY }, toM)
    return [
      `${bottomFrom.x},${bottomFrom.y}`,
      `${topFrom.x},${topFrom.y}`,
      `${topTo.x},${topTo.y}`,
      `${bottomTo.x},${bottomTo.y}`
    ].join(' ')
  }

  const belowTop = groundY
  const below40Bottom = belowTop + 0.65 * scale
  const below20Bottom = below40Bottom + 0.2 * scale
  const belowSandBottom = below20Bottom + 0.15 * scale

  return (
    <svg
      className="bund-rocktoe-diagram"
      viewBox="0 0 520 300"
      role="img"
      aria-label="Rock toe aligned with downstream bund slope and CAW-5-11 filter layers"
    >
      <line className="bund-toe-ground" x1="20" y1={groundY} x2="510" y2={groundY} />

      {!filterEnabled && excavationPx > 0 && (
        <rect
          className="bund-overlay-exc"
          x={baseLeft}
          y={groundY}
          width={baseRight - baseLeft}
          height={excavationPx}
        />
      )}

      {filterEnabled && (
        <>
          {/* Below: 65 cm 40 mm CA over 20 cm 20 mm CA over 15 cm sand. */}
          <rect
            className="bund-overlay-rocktoe-filter bund-filter-ca40"
            x={baseLeft}
            y={belowTop}
            width={baseRight - baseLeft}
            height={below40Bottom - belowTop}
          />
          <rect
            className="bund-overlay-rocktoe-filter bund-filter-ca20"
            x={baseLeft}
            y={below40Bottom}
            width={baseRight - baseLeft}
            height={below20Bottom - below40Bottom}
          />
          <rect
            className="bund-overlay-rocktoe-filter bund-filter-sand"
            x={baseLeft}
            y={below20Bottom}
            width={baseRight - baseLeft}
            height={belowSandBottom - below20Bottom}
          />

          {/* Behind, from rubble toward earth: 15 cm 40 mm, 15 cm 20 mm,
              then 20 cm sand against the embankment. */}
          <polygon
            className="bund-overlay-rocktoe-filter bund-filter-ca40"
            points={behindBand(0, 0.15)}
          />
          <polygon
            className="bund-overlay-rocktoe-filter bund-filter-ca20"
            points={behindBand(0.15, 0.3)}
          />
          <polygon
            className="bund-overlay-rocktoe-filter bund-filter-sand"
            points={behindBand(0.3, 0.5)}
          />
          <rect
            className="bund-rocktoe-exc-outline"
            x={baseLeft}
            y={belowTop}
            width={baseRight - baseLeft}
            height={belowSandBottom - belowTop}
          />
        </>
      )}

      <line
        className="bund-rocktoe-bund-line"
        x1={bundLineStartX}
        y1={bundLineStartY}
        x2={baseRight}
        y2={groundY}
      />
      <polygon
        className="bund-overlay-rocktoe"
        points={`${baseLeft},${groundY} ${topLeft},${topY} ${topRight},${topY} ${baseRight},${groundY}`}
      />
      <line
        className="bund-rocktoe-aligned-face"
        x1={topRight}
        y1={topY}
        x2={baseRight}
        y2={groundY}
      />

      <line className="bund-toe-dim" x1={topLeft} y1={topY - 9} x2={topRight} y2={topY - 9} />
      <text
        className="bund-toe-dimlabel"
        x={(topLeft + topRight) / 2}
        y={topY - 13}
        textAnchor="middle"
      >
        crest {fmt(crest)} m
      </text>
      <line
        className="bund-toe-dim"
        x1={baseRight + 8}
        y1={topY}
        x2={baseRight + 8}
        y2={groundY}
      />
      <text
        className="bund-toe-dimlabel"
        x={baseRight + 13}
        y={(topY + groundY) / 2}
        dominantBaseline="middle"
      >
        H {fmt(h)} m
      </text>
      <text className="bund-rocktoe-line-label" x={bundLineStartX + 3} y={bundLineStartY - 5}>
        proposed D/S slope 1:{fmt(outer)}
      </text>

      {filterEnabled && (
        <>
          <text className="bund-rocktoe-exc-label" x={baseLeft + 5} y={belowSandBottom + 13}>
            1.00 m CAW-5-11 filter bed · payable cut follows section union
          </text>

          <text className="bund-filter-legend-head" x="30" y="226">CAW-5-11 media</text>
          <text className="bund-filter-legend-head" x="246" y="226">Behind</text>
          <text className="bund-filter-legend-head" x="352" y="226">Below</text>

          <rect className="bund-filter-swatch bund-filter-sand" x="30" y="237" width="14" height="10" />
          <text className="bund-filter-legend-text" x="51" y="246">Sand</text>
          <text className="bund-filter-legend-text" x="246" y="246">20 cm</text>
          <text className="bund-filter-legend-text" x="352" y="246">15 cm</text>

          <rect className="bund-filter-swatch bund-filter-ca20" x="30" y="255" width="14" height="10" />
          <text className="bund-filter-legend-text" x="51" y="264">20 mm down CA</text>
          <text className="bund-filter-legend-text" x="246" y="264">15 cm</text>
          <text className="bund-filter-legend-text" x="352" y="264">20 cm</text>

          <rect className="bund-filter-swatch bund-filter-ca40" x="30" y="273" width="14" height="10" />
          <text className="bund-filter-legend-text" x="51" y="282">40 mm down CA</text>
          <text className="bund-filter-legend-text" x="246" y="282">15 cm</text>
          <text className="bund-filter-legend-text" x="352" y="282">65 cm</text>
        </>
      )}

      <text className="bund-toe-area" x="510" y="297" textAnchor="end">
        Base {fmt(baseWidth)} m · inner 1:{fmt(inner)} · outer = bund D/S slope
        {!filterEnabled && excavationDepth > 0
          ? ` · bed bottom ${fmt(excavationDepth)} m below base`
          : ''}
      </text>
    </svg>
  )
}
