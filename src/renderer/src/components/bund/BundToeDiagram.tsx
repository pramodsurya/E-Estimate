/**
 * Live front-view of a toe trench. When separate side slopes are supplied the
 * invert is positioned from those real left/right runs; otherwise the legacy
 * fixed-width trench remains centred.
 */
export default function BundToeDiagram({
  topWidth,
  bottomWidth,
  depth,
  leftSlope,
  rightSlope,
  lined,
  solid = false
}: {
  topWidth: number
  bottomWidth: number
  depth: number
  leftSlope?: number
  rightSlope?: number
  lined: boolean
  solid?: boolean
}): JSX.Element {
  const W = 300
  const H = 190
  const padX = 40
  const padTop = 30
  const padBottom = 44

  const maxW = Math.max(topWidth, bottomWidth, 0.001)
  const scale = Math.min((W - padX * 2) / maxW, (H - padTop - padBottom) / Math.max(depth, 0.001))
  const cx = W / 2
  const groundY = padTop
  const topLeft = cx - (topWidth * scale) / 2
  const topRight = topLeft + topWidth * scale
  const hasIndependentSlopes = leftSlope != null && rightSlope != null
  const leftRun = hasIndependentSlopes
    ? Math.max(0, leftSlope) * Math.max(0, depth)
    : Math.max(0, topWidth - bottomWidth) / 2
  const bottomLeft = topLeft + leftRun * scale
  const bottomRight = bottomLeft + bottomWidth * scale
  const botY = groundY + depth * scale

  const area = ((topWidth + bottomWidth) / 2) * depth
  const ariaSlopes = hasIndependentSlopes
    ? `, left slope ${leftSlope} horizontal to 1 vertical, right slope ${rightSlope} horizontal to 1 vertical`
    : ''

  return (
    <svg
      className="bund-toe-diagram"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Toe trench ${topWidth} m top, ${bottomWidth} m bottom, ${depth} m deep${ariaSlopes}`}
    >
      {/* ground line */}
      <line x1={16} y1={groundY} x2={W - 16} y2={groundY} className="bund-toe-ground" />
      <text x={20} y={groundY - 6} className="bund-toe-note">
        ground
      </text>

      {/* trench trapezium */}
      <polygon
        points={`${topLeft},${groundY} ${topRight},${groundY} ${bottomRight},${botY} ${bottomLeft},${botY}`}
        className={solid ? 'bund-toe-solid-build' : 'bund-toe-trench'}
      />

      {/* optional revetment follows the two sides and bed; the top stays open */}
      {lined && (
        <polyline
          points={`${topLeft},${groundY} ${bottomLeft},${botY} ${bottomRight},${botY} ${topRight},${groundY}`}
          className="bund-toe-build"
        />
      )}

      {/* top width dimension */}
      <line x1={topLeft} y1={groundY - 14} x2={topRight} y2={groundY - 14} className="bund-toe-dim" />
      <text x={cx} y={groundY - 18} textAnchor="middle" className="bund-toe-dimlabel">
        {topWidth.toFixed(2)} m
      </text>

      {/* bottom width dimension */}
      <line x1={bottomLeft} y1={botY + 12} x2={bottomRight} y2={botY + 12} className="bund-toe-dim" />
      <text x={(bottomLeft + bottomRight) / 2} y={botY + 24} textAnchor="middle" className="bund-toe-dimlabel">
        {bottomWidth.toFixed(2)} m
      </text>

      {/* depth dimension */}
      <line x1={topRight + 16} y1={groundY} x2={topRight + 16} y2={botY} className="bund-toe-dim" />
      <text
        x={topRight + 20}
        y={(groundY + botY) / 2}
        className="bund-toe-dimlabel"
        dominantBaseline="middle"
      >
        {depth.toFixed(2)} m
      </text>

      {hasIndependentSlopes && (
        <>
          <text
            x={(topLeft + bottomLeft) / 2 - 5}
            y={(groundY + botY) / 2}
            textAnchor="end"
            className="bund-toe-slope-label"
          >
            L {leftSlope.toFixed(2)}:1
          </text>
          <text
            x={(topRight + bottomRight) / 2 + 5}
            y={(groundY + botY) / 2}
            className="bund-toe-slope-label"
          >
            R {rightSlope.toFixed(2)}:1
          </text>
        </>
      )}

      <text x={cx} y={H - 8} textAnchor="middle" className="bund-toe-area">
        area = {area.toFixed(3)} m²
      </text>
    </svg>
  )
}
