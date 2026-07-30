import type { BundData, BundPoint, BundSection } from '../../types/project'
import {
  heartingBaseProfile,
  heartingRepairProfile,
  heartingTrenchEnabled,
  heartingTrenchProfile
} from '../../lib/bund'

const WIDTH = 620
const HEIGHT = 240
const PAD_X = 62
const PAD_TOP = 44
const PAD_BOTTOM = 48

const pathFor = (
  points: BundPoint[],
  toX: (offset: number) => number,
  toY: (rl: number) => number
): string =>
  points
    .map(
      (point, index) =>
        `${index ? 'L' : 'M'} ${toX(point.offset)} ${toY(point.rl)}`
    )
    .join(' ')

/** Full hearting zone at the selected chainage, including its automatic contacts. */
export default function BundHeartingDiagram({
  data,
  section
}: {
  data: BundData
  section: BundSection | null
}): JSX.Element {
  const upper = section ? heartingRepairProfile(data, section) : []
  const base = section ? heartingBaseProfile(data, section) : []
  if (upper.length < 4 || base.length < 2) {
    return (
      <div className="bund-hearting-diagram-empty">
        {data.mode === 'restoration'
          ? 'Enter the selected chainage’s surveyed Existing RL points. The full hearting zone will end automatically where both side lines touch that profile.'
          : 'Enter the selected chainage’s ground level to draw the full hearting zone down to the formation base.'}
      </div>
    )
  }

  // The cut-off trench belongs to this drawing: it is the foundation of the
  // hearting, and the zone is meaningless without seeing what carries it down.
  const trench =
    section && heartingTrenchEnabled(data)
      ? heartingTrenchProfile(data, section)
      : { top: [], bottom: [] }
  const hasTrench = trench.top.length >= 2 && trench.bottom.length >= 2

  const all = [...upper, ...base, ...trench.top, ...trench.bottom]
  const minX = Math.min(...all.map((point) => point.offset))
  const maxX = Math.max(...all.map((point) => point.offset))
  const minRl = Math.min(...all.map((point) => point.rl))
  const maxRl = Math.max(...all.map((point) => point.rl))
  const spanX = Math.max(0.001, maxX - minX)
  const spanRl = Math.max(0.001, maxRl - minRl)
  const toX = (offset: number): number =>
    PAD_X + ((offset - minX) / spanX) * (WIDTH - PAD_X * 2)
  const toY = (rl: number): number =>
    PAD_TOP +
    (1 - (rl - minRl) / spanRl) *
      (HEIGHT - PAD_TOP - PAD_BOTTOM)
  const zonePath = [
    pathFor(upper, toX, toY),
    ...[...base]
      .reverse()
      .map((point) => `L ${toX(point.offset)} ${toY(point.rl)}`),
    'Z'
  ].join(' ')
  const leftContact = upper[0]
  const leftCrest = upper[1]
  const rightCrest = upper[2]
  const rightContact = upper[3]
  const topLevel = data.heartingDesign.topLevel
  const centreX = toX(data.heartingDesign.centerOffset)

  return (
    <svg
      className="bund-hearting-diagram"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label="Complete impervious hearting zone"
    >
      <defs>
        <pattern
          id="bund-hearting-detail-hatch"
          width="7"
          height="7"
          patternTransform="rotate(-45)"
          patternUnits="userSpaceOnUse"
        >
          <line x1="0" y1="0" x2="0" y2="7" className="bund-hearting-hatch-line" />
        </pattern>
      </defs>
      <path d={zonePath} className="bund-hearting-detail-fill" />
      {hasTrench &&
        (() => {
          const corners = [
            ...trench.top.map((p) => `${toX(p.offset)},${toY(p.rl)}`),
            `${toX(trench.bottom[1].offset)},${toY(trench.bottom[1].rl)}`,
            `${toX(trench.bottom[0].offset)},${toY(trench.bottom[0].rl)}`
          ].join(' ')
          const invertY = toY(trench.bottom[0].rl)
          return (
            <>
              <polygon points={corners} className="bund-overlay-hearting-trench" />
              <polygon points={corners} className="bund-hearting-trench-outline" />
              <line
                x1={toX(trench.bottom[0].offset)}
                y1={invertY + 11}
                x2={toX(trench.bottom[1].offset)}
                y2={invertY + 11}
                className="bund-hearting-dimension"
              />
              <text
                x={(toX(trench.bottom[0].offset) + toX(trench.bottom[1].offset)) / 2}
                y={invertY + 24}
                textAnchor="middle"
              >
                cut-off trench {data.heartingTrench.bottomWidth.toFixed(2)} m at invert
                RL {trench.bottom[0].rl.toFixed(3)}
              </text>
            </>
          )
        })()}
      <path d={pathFor(base, toX, toY)} className="bund-hearting-existing-line" fill="none" />
      <path d={pathFor(upper, toX, toY)} className="bund-hearting-line" fill="none" />
      <line
        x1={centreX}
        y1={PAD_TOP - 10}
        x2={centreX}
        y2={HEIGHT - PAD_BOTTOM + 10}
        className="bund-hearting-centreline"
      />
      <line
        x1={toX(leftCrest.offset)}
        y1={toY(topLevel) - 13}
        x2={toX(rightCrest.offset)}
        y2={toY(topLevel) - 13}
        className="bund-hearting-dimension"
      />
      <text
        x={(toX(leftCrest.offset) + toX(rightCrest.offset)) / 2}
        y={toY(topLevel) - 18}
        textAnchor="middle"
      >
        top width {data.heartingDesign.topWidth.toFixed(2)} m
      </text>
      <text x={PAD_X} y={toY(topLevel) - 5}>
        top RL {topLevel.toFixed(3)}
      </text>
      <text x={toX(leftContact.offset) + 7} y={toY(leftContact.rl) - 9}>
        U/S contact · RL {leftContact.rl.toFixed(3)}
      </text>
      <text
        x={toX(rightContact.offset) - 7}
        y={toY(rightContact.rl) - 9}
        textAnchor="end"
      >
        D/S contact · RL {rightContact.rl.toFixed(3)}
      </text>
      <text x={toX(leftContact.offset) + 7} y={toY(leftContact.rl) + 16}>
        {data.heartingDesign.usSlope.toFixed(2)}H : 1V
      </text>
      <text
        x={toX(rightContact.offset) - 7}
        y={toY(rightContact.rl) + 16}
        textAnchor="end"
      >
        {data.heartingDesign.dsSlope.toFixed(2)}H : 1V
      </text>
      <text x={centreX + 5} y={HEIGHT - PAD_BOTTOM + 25}>
        offset {data.heartingDesign.centerOffset.toFixed(2)} m
      </text>
      <text x={WIDTH - PAD_X} y={HEIGHT - 8} textAnchor="end">
        {data.mode === 'restoration'
          ? 'Automatic contacts with surveyed Existing RL'
          : hasTrench
            ? 'Full zone to the formation base, carried down by its cut-off trench'
            : 'Full zone to new bund formation base'}
      </text>
    </svg>
  )
}
