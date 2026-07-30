/**
 * Detail of one berm: the face arriving from above, the shelf with its
 * cross-fall and catch-water drain, and the face leaving below. Drawn to scale
 * across the shelf, with the two faces shown as short stubs so the shelf — the
 * part the user is dimensioning — stays readable whatever the slopes are.
 *
 * The upstream side is mirrored so the bund body is always on the left, which
 * is how the shelf is drawn on a section sheet.
 */
export default function BundBermDiagram({
  side,
  width,
  crossFall,
  slopeAbove,
  slopeBelow,
  drainWidth,
  drainDepth,
  drained,
  surfaced
}: {
  side: 'us' | 'ds'
  width: number
  crossFall: number
  slopeAbove: number
  slopeBelow: number
  drainWidth: number
  drainDepth: number
  drained: boolean
  surfaced: boolean
}): JSX.Element {
  const W = 340
  const H = 180
  const padX = 30
  const shelfY = 84

  const shelfWidth = Math.max(0.001, width)
  const stub = 1.6 // metres of face drawn either side of the shelf
  const spanM = shelfWidth + stub * 2
  const scale = (W - padX * 2) / spanM

  const shelfLeft = padX + stub * scale
  const shelfRight = shelfLeft + shelfWidth * scale
  // Cross-fall is 1 in N towards the bund; exaggerated so it reads at all.
  const fallPx = crossFall > 0 ? Math.min(9, (shelfWidth / crossFall) * scale * 6) : 0
  const innerY = shelfY + fallPx

  const riseAbove = Math.min(52, (stub / Math.max(0.2, slopeAbove)) * scale * 3.2)
  const dropBelow = Math.min(58, (stub / Math.max(0.2, slopeBelow)) * scale * 3.2)
  const aboveX = padX
  const belowX = W - padX
  const aboveY = innerY - riseAbove
  const belowY = shelfY + dropBelow

  const drainW = Math.max(0, Math.min(drainWidth, shelfWidth)) * scale
  const drainD = Math.max(0, drainDepth) * scale * 0.9
  const drainLeft = shelfLeft
  const drainRight = drainLeft + drainW

  const body = [
    `M ${aboveX} ${H - 12}`,
    `L ${aboveX} ${aboveY}`,
    `L ${shelfLeft} ${innerY}`,
    `L ${shelfRight} ${shelfY}`,
    `L ${belowX} ${belowY}`,
    `L ${belowX} ${H - 12}`,
    'Z'
  ].join(' ')

  const mirror = side === 'us'

  return (
    <svg
      className="bund-berm-diagram"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`${side === 'us' ? 'Upstream' : 'Downstream'} berm ${width} m wide with ${
        drained ? 'a catch-water drain' : 'no drain'
      }`}
    >
      <g transform={mirror ? `translate(${W},0) scale(-1,1)` : undefined}>
        <path d={body} className="bund-berm-body" />
        <path
          d={`M ${aboveX} ${aboveY} L ${shelfLeft} ${innerY} L ${shelfRight} ${shelfY} L ${belowX} ${belowY}`}
          className="bund-berm-surface-line"
          fill="none"
        />
        {surfaced && (
          <path
            d={`M ${drained ? drainRight : shelfLeft} ${
              drained ? shelfY : innerY
            } L ${shelfRight} ${shelfY}`}
            className="bund-berm-surfacing"
            fill="none"
          />
        )}
        {drained && drainW > 0 && (
          <path
            d={[
              `M ${drainLeft} ${innerY}`,
              `L ${drainLeft} ${innerY + drainD}`,
              `L ${drainRight} ${innerY + drainD}`,
              `L ${drainRight} ${shelfY}`
            ].join(' ')}
            className="bund-berm-drain"
            fill="none"
          />
        )}
        {/* Shelf width dimension. */}
        <line
          x1={shelfLeft}
          y1={shelfY - 26}
          x2={shelfRight}
          y2={shelfY - 26}
          className="bund-toe-dim"
        />
      </g>

      {/* Labels stay unmirrored so they always read left-to-right. */}
      <text
        x={mirror ? W - (shelfLeft + shelfRight) / 2 : (shelfLeft + shelfRight) / 2}
        y={shelfY - 31}
        textAnchor="middle"
        className="bund-toe-dimlabel"
      >
        shelf {width.toFixed(2)} m
      </text>
      <text
        x={mirror ? W - padX : padX}
        y={22}
        textAnchor={mirror ? 'end' : 'start'}
        className="bund-berm-note"
      >
        face above 1:{slopeAbove.toFixed(2)}
      </text>
      <text
        x={mirror ? padX : W - padX}
        y={H - 20}
        textAnchor={mirror ? 'start' : 'end'}
        className="bund-berm-note"
      >
        face below 1:{slopeBelow.toFixed(2)}
      </text>
      {crossFall > 0 && (
        <text
          x={mirror ? W - (shelfLeft + shelfRight) / 2 : (shelfLeft + shelfRight) / 2}
          y={shelfY + 30}
          textAnchor="middle"
          className="bund-berm-note"
        >
          cross-fall 1 in {crossFall.toFixed(0)} {mirror ? '→' : '←'} to the drain
        </text>
      )}
      {drained && (
        <text
          x={mirror ? W - (drainLeft + drainRight) / 2 : (drainLeft + drainRight) / 2}
          y={shelfY + 48}
          textAnchor="middle"
          className="bund-berm-note"
        >
          drain {drainWidth.toFixed(2)} × {drainDepth.toFixed(2)} m
        </text>
      )}
    </svg>
  )
}
