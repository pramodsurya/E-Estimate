import type { BundData, BundPoint, BundSection } from '../../types/project'
import {
  downstreamToeFaceSlope,
  downstreamDesignToePointAt,
  faceSlopeLengths,
  heartingBaseProfile,
  heartingRepairProfile,
  heartingTrenchEnabled,
  heartingTrenchProfile,
  internalFiltersAvailable,
  isZonedBund,
  pitchingThicknessM,
  projectedProfile,
  rockToeBaseWidth,
  rockToeHeightAt,
  toeDrainDepthAt,
  toeDrainTopWidthAt,
  upstreamToeTrenchEnabled,
  verticalFilterHeightAt
} from '../../lib/bund'

const W = 660
const H = 300
const PAD_X = 46
const PAD_TOP = 34
const PAD_BOTTOM = 62

const f2 = (n: number): string => n.toFixed(2)

interface LegendEntry {
  label: string
  className: string
}

/**
 * Diagrammatic general arrangement of the bund at its tallest section: the
 * proposed body with every enabled element drawn where it actually sits —
 * hearting and its cut-off trench, pitching, turfing, rock toe, the two toe
 * trenches, internal filters and the berms already in the design line.
 *
 * It is a sketch, not a measured drawing. Each element has its own dimensioned
 * detail card; this one exists to show how they sit together, which is the
 * thing no single detail can show. Nothing that is switched off is drawn, so
 * the sketch always matches what is being billed.
 */
export default function BundAssemblyDiagram({
  data,
  section
}: {
  data: BundData
  section: BundSection | null
}): JSX.Element {
  const proj = section
    ? [...projectedProfile(section, data.design)].sort((a, b) => a.offset - b.offset)
    : []

  if (!section || proj.length < 2) {
    return (
      <div className="bund-diagram-empty">
        Complete a chainage&rsquo;s levels to draw the bund arrangement.
      </div>
    )
  }

  const { design } = data
  const zoned = isZonedBund(data)
  const usToe = proj[0]
  const dsToe = downstreamDesignToePointAt(section, data) ?? proj[proj.length - 1]

  // ---- Enabled elements ----------------------------------------------------
  const pitchingOn = Boolean(data.pitchingMaterial)
  const turfingOn = Boolean(data.turfingMaterial)
  const usTrenchOn = upstreamToeTrenchEnabled(data)
  const dsDrainOn = Boolean(data.downstreamToe.excavationMaterial)
  const rockToeHeight = data.rockToeMaterial ? rockToeHeightAt(section, data) : 0
  const hearting = zoned ? heartingRepairProfile(data, section) : []
  const heartingBase = zoned ? heartingBaseProfile(data, section) : []
  const trench = heartingTrenchEnabled(data)
    ? heartingTrenchProfile(data, section)
    : { top: [], bottom: [] }
  const trenchOn = trench.top.length >= 2 && trench.bottom.length >= 2
  const hFilterOn =
    internalFiltersAvailable(data) &&
    Boolean(data.horizontalFilterMaterial) &&
    data.horizontalFilterLength > 0
  const vFilterOn = hFilterOn && Boolean(data.verticalFilterMaterial)

  // ---- Geometry of each overlay -------------------------------------------
  const rockToeOuterX = dsToe.offset
  const rockToeInnerX =
    rockToeOuterX - rockToeBaseWidth(rockToeHeight, data, downstreamToeFaceSlope(section, data))
  const rockToeCrestInnerX = rockToeInnerX + data.rockToeInnerSlope * rockToeHeight
  const rockToeCrestOuterX = rockToeCrestInnerX + data.rockToeTopWidth
  const rockToeCrestRl = dsToe.rl + rockToeHeight

  const usTrenchTop = data.upstreamToe.topWidth
  const usTrenchDepth = data.upstreamToe.depth
  const dsDrainTop = dsDrainOn ? toeDrainTopWidthAt(section, data) : 0
  const dsDrainDepth = dsDrainOn ? toeDrainDepthAt(section, data) : 0

  const hFilterInnerX = Math.max(dsToe.offset - data.horizontalFilterLength, design.topWidth / 2)
  const hFilterThickness = Math.max(0, data.horizontalFilterThickness)
  const vFilterHeight = vFilterOn ? verticalFilterHeightAt(section, data) : 0

  // Face segments, so pitching and turfing can be drawn as bands on the faces
  // they actually protect rather than as straight toe-to-crest lines.
  const half = design.topWidth / 2
  const usFace = proj.filter((p) => p.offset <= -half + 1e-6)
  const dsFace = proj.filter((p) => p.offset >= half - 1e-6)

  // ---- Extents -------------------------------------------------------------
  const extra: BundPoint[] = [
    ...hearting,
    ...heartingBase,
    ...trench.top,
    ...trench.bottom,
    ...(rockToeHeight > 0
      ? [
          { offset: rockToeInnerX, rl: dsToe.rl },
          { offset: rockToeCrestOuterX, rl: rockToeCrestRl }
        ]
      : []),
    ...(usTrenchOn
      ? [
          { offset: usToe.offset - usTrenchTop, rl: usToe.rl - usTrenchDepth },
          { offset: usToe.offset, rl: usToe.rl }
        ]
      : []),
    ...(dsDrainOn
      ? [
          { offset: dsToe.offset + dsDrainTop, rl: dsToe.rl },
          { offset: dsToe.offset, rl: dsToe.rl - dsDrainDepth }
        ]
      : []),
    ...(vFilterOn
      ? [{ offset: hFilterInnerX, rl: dsToe.rl + hFilterThickness + vFilterHeight }]
      : []),
    ...(design.mwl != null ? [{ offset: usToe.offset, rl: design.mwl }] : []),
    ...(design.ftl != null ? [{ offset: usToe.offset, rl: design.ftl }] : [])
  ]
  const all = [...proj, ...extra]
  const minX = Math.min(...all.map((p) => p.offset)) - 1.5
  const maxX = Math.max(...all.map((p) => p.offset)) + 1.5
  const maxRl = Math.max(...all.map((p) => p.rl), design.topLevel) + 0.5
  const minRl = Math.min(...all.map((p) => p.rl)) - 0.6

  const sx = (W - PAD_X * 2) / Math.max(0.001, maxX - minX)
  const sy = (H - PAD_TOP - PAD_BOTTOM) / Math.max(0.001, maxRl - minRl)
  const X = (offset: number): number => PAD_X + (offset - minX) * sx
  const Y = (rl: number): number => PAD_TOP + (maxRl - rl) * sy
  const line = (points: BundPoint[]): string =>
    points.map((p, i) => `${i ? 'L' : 'M'} ${X(p.offset)} ${Y(p.rl)}`).join(' ')
  const poly = (points: BundPoint[]): string =>
    points.map((p) => `${X(p.offset)},${Y(p.rl)}`).join(' ')

  /**
   * A band drawn on a face by pushing the face line outward. Slope-normal
   * offsetting would be exact; a vertical push reads the same at sketch scale
   * and cannot fold on itself where a berm flattens the face to horizontal.
   */
  const faceBand = (points: BundPoint[], thickness: number): string => {
    if (points.length < 2) return ''
    const outward = points.map((p) => ({ offset: p.offset, rl: p.rl }))
    const inward = [...points].reverse().map((p) => ({ offset: p.offset, rl: p.rl }))
    return [
      ...outward.map((p) => `${X(p.offset)},${Y(p.rl)}`),
      ...inward.map((p) => `${X(p.offset)},${Y(p.rl) - Math.max(3, thickness * sy)}`)
    ].join(' ')
  }

  const faces = faceSlopeLengths(section, design)
  const legend: LegendEntry[] = [
    zoned && hearting.length >= 2
      ? { label: 'Impervious hearting', className: 'bund-ga-hearting' }
      : null,
    trenchOn ? { label: 'Hearting cut-off trench', className: 'bund-ga-trench' } : null,
    pitchingOn ? { label: 'Stone pitching (u/s)', className: 'bund-ga-pitching' } : null,
    usTrenchOn ? { label: 'U/S toe wall', className: 'bund-ga-ustoe' } : null,
    turfingOn ? { label: 'Turfing (d/s)', className: 'bund-ga-turfing' } : null,
    rockToeHeight > 0 ? { label: 'Rock toe', className: 'bund-ga-rocktoe' } : null,
    hFilterOn ? { label: 'Filter blanket', className: 'bund-ga-filter' } : null,
    vFilterOn ? { label: 'Chimney filter', className: 'bund-ga-filter' } : null,
    dsDrainOn ? { label: 'D/S toe drain', className: 'bund-ga-drain' } : null,
    design.berms.length ? { label: `${design.berms.length} berm shelf`, className: 'bund-ga-berm' } : null
  ].filter((entry): entry is LegendEntry => entry != null)

  return (
    <svg
      className="bund-ga-diagram"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Diagrammatic section of the bund showing every enabled element"
    >
      {/* Bund body, closed along its own toe line. */}
      <polygon
        className="bund-ga-body"
        points={`${poly(proj)} ${X(dsToe.offset)},${Y(minRl)} ${X(usToe.offset)},${Y(minRl)}`}
      />

      {/* Water reference lines: what the section is sized against. */}
      {design.mwl != null && design.mwl > minRl && design.mwl < maxRl && (
        <>
          <line className="bund-ga-mwl" x1={PAD_X - 20} y1={Y(design.mwl)} x2={X(0)} y2={Y(design.mwl)} />
          <text className="bund-ga-note" x={PAD_X - 20} y={Y(design.mwl) - 4}>
            MWL {f2(design.mwl)}
          </text>
        </>
      )}
      {design.ftl != null && design.ftl > minRl && design.ftl < maxRl && (
        <>
          <line className="bund-ga-ftl" x1={PAD_X - 20} y1={Y(design.ftl)} x2={X(-half)} y2={Y(design.ftl)} />
          <text className="bund-ga-note" x={PAD_X - 20} y={Y(design.ftl) + 11}>
            FTL {f2(design.ftl)}
          </text>
        </>
      )}

      {/* Internal drainage, drawn first so the zone lines sit over it. */}
      {hFilterOn && (
        <rect
          className="bund-ga-filter"
          x={X(hFilterInnerX)}
          y={Y(dsToe.rl + hFilterThickness)}
          width={Math.max(2, X(dsToe.offset) - X(hFilterInnerX))}
          height={Math.max(3, Y(dsToe.rl) - Y(dsToe.rl + hFilterThickness))}
        />
      )}
      {vFilterOn && vFilterHeight > 0 && (
        <rect
          className="bund-ga-filter"
          x={X(hFilterInnerX)}
          y={Y(dsToe.rl + hFilterThickness + vFilterHeight)}
          width={Math.max(3, data.verticalFilterWidth * sx)}
          height={Math.max(
            3,
            Y(dsToe.rl + hFilterThickness) - Y(dsToe.rl + hFilterThickness + vFilterHeight)
          )}
        />
      )}

      {/* Impervious core and the trench that carries it down. */}
      {zoned && hearting.length >= 2 && heartingBase.length >= 2 && (
        <polygon
          className="bund-ga-hearting"
          points={`${poly(hearting)} ${poly([...heartingBase].reverse())}`}
        />
      )}
      {trenchOn && (
        <polygon
          className="bund-ga-trench"
          points={`${poly(trench.top)} ${X(trench.bottom[1].offset)},${Y(trench.bottom[1].rl)} ${X(
            trench.bottom[0].offset
          )},${Y(trench.bottom[0].rl)}`}
        />
      )}

      {/* Slope protection. */}
      {pitchingOn && usFace.length >= 2 && (
        <polygon className="bund-ga-pitching" points={faceBand(usFace, pitchingThicknessM(data))} />
      )}
      {turfingOn && dsFace.length >= 2 && (
        <polygon className="bund-ga-turfing" points={faceBand(dsFace, data.turfingThickness)} />
      )}

      {/* Toe works. */}
      {usTrenchOn && (
        <polygon
          className="bund-ga-ustoe"
          points={[
            `${X(usToe.offset - usTrenchTop)},${Y(usToe.rl)}`,
            `${X(usToe.offset)},${Y(usToe.rl)}`,
            `${X(usToe.offset - (usTrenchTop - data.upstreamToe.bottomWidth) / 2)},${Y(
              usToe.rl - usTrenchDepth
            )}`,
            `${X(usToe.offset - usTrenchTop + (usTrenchTop - data.upstreamToe.bottomWidth) / 2)},${Y(
              usToe.rl - usTrenchDepth
            )}`
          ].join(' ')}
        />
      )}
      {rockToeHeight > 0 && (
        <polygon
          className="bund-ga-rocktoe"
          points={[
            `${X(rockToeInnerX)},${Y(dsToe.rl)}`,
            `${X(rockToeCrestInnerX)},${Y(rockToeCrestRl)}`,
            `${X(rockToeCrestOuterX)},${Y(rockToeCrestRl)}`,
            `${X(rockToeOuterX)},${Y(dsToe.rl)}`
          ].join(' ')}
        />
      )}
      {dsDrainOn && dsDrainDepth > 0 && (
        <polygon
          className="bund-ga-drain"
          points={[
            `${X(dsToe.offset)},${Y(dsToe.rl)}`,
            `${X(dsToe.offset + dsDrainTop)},${Y(dsToe.rl)}`,
            `${X(dsToe.offset + dsDrainTop - data.downstreamToe.rightSlope * dsDrainDepth)},${Y(
              dsToe.rl - dsDrainDepth
            )}`,
            `${X(dsToe.offset + data.downstreamToe.leftSlope * dsDrainDepth)},${Y(
              dsToe.rl - dsDrainDepth
            )}`
          ].join(' ')}
        />
      )}

      {/* The proposed line last, so it reads on top of every fill. */}
      <path className="bund-ga-outline" d={line(proj)} fill="none" />
      {design.berms.map((berm) => (
        <line
          key={berm.id}
          className="bund-ga-berm"
          x1={X(berm.side === 'us' ? minX : half)}
          y1={Y(berm.level)}
          x2={X(berm.side === 'us' ? -half : maxX)}
          y2={Y(berm.level)}
        />
      ))}

      <text className="bund-ga-crest" x={X(0)} y={Y(design.topLevel) - 7} textAnchor="middle">
        TBL {f2(design.topLevel)} · crest {f2(design.topWidth)} m
      </text>
      <text className="bund-ga-note" x={X(usToe.offset)} y={Y(usToe.rl) + 13} textAnchor="middle">
        U/S 1:{f2(design.usSlope)}
      </text>
      <text className="bund-ga-note" x={X(dsToe.offset)} y={Y(dsToe.rl) + 13} textAnchor="middle">
        D/S 1:{f2(design.dsSlope)}
      </text>

      {/* Legend of what is actually enabled, in the drawing's own colours. */}
      {legend.map((entry, index) => {
        const perRow = 4
        const x = PAD_X + (index % perRow) * 150
        const y = H - 34 + Math.floor(index / perRow) * 15
        return (
          <g key={entry.label}>
            <rect className={`bund-ga-swatch ${entry.className}`} x={x} y={y - 8} width={12} height={9} />
            <text className="bund-ga-note" x={x + 17} y={y}>
              {entry.label}
            </text>
          </g>
        )
      })}
      <text className="bund-ga-note" x={W - PAD_X} y={PAD_TOP - 14} textAnchor="end">
        u/s face {f2(faces.us)} m · d/s face {f2(faces.ds)} m
      </text>
    </svg>
  )
}
