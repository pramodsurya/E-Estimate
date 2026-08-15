import { useMemo } from 'react'
import type { BundData, BundPoint, BundSection } from '../../types/project'
import {
  bundLevelingGeometry,
  bundNetStrippingBands,
  downstreamDesignToePointAt,
  heartingBaseProfile,
  formatChainage,
  heartingRepairBands,
  heartingRepairProfile,
  heartingTrenchEnabled,
  heartingTrenchProfile,
  upstreamToeOffset,
  hasMeasurableGround,
  usesFlatGround,
  pitchingThicknessM,
  proposedHeartingCrestProfile,
  projectedProfile,
  sectionAreas,
  toeDrainDepthAt,
  toeDrainPlatformAt,
  toeDrainInvertLevelAt,
  toeDrainTopWidthAt,
  upstreamToeTrenchEnabled,
  zonedRepairAreas,
  type BundProfileBand
} from '../../lib/bund'

const WIDTH = 620
const HEIGHT = 320
const PAD_X = 54
const PAD_TOP = 34
const PAD_BOTTOM = 52

const f2 = (n: number): string => n.toFixed(2)
const f3 = (n: number): string => n.toFixed(3)

interface Mapped {
  toX: (offset: number) => number
  toY: (rl: number) => number
  pre: BundPoint[]
  stripped: BundPoint[]
  projected: BundPoint[]
  designProjected: BundPoint[]
  strippingBands: BundProfileBand[]
  formationBands: BundProfileBand[]
  heartingBands: BundProfileBand[]
  heartingProjected: BundPoint[]
  heartingBase: BundPoint[]
  heartingIsPreview: boolean
}

/**
 * Round grid values across [min, max] at a "nice" step (1 / 2 / 2.5 / 5 × 10ⁿ)
 * so the graph-paper lines land on readable numbers.
 */
function niceTicks(min: number, max: number, target: number): number[] {
  const span = max - min
  if (span <= 0) return [min]
  const raw = span / target
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const norm = raw / mag
  const step = (norm >= 5 ? 5 : norm >= 2.5 ? 2.5 : norm >= 2 ? 2 : 1) * mag
  const ticks: number[] = []
  const start = Math.ceil(min / step) * step
  for (let v = start; v <= max + step * 1e-6; v += step) {
    ticks.push(Math.round(v * 1000) / 1000)
  }
  return ticks
}

/** A profile as an SVG polyline path. */
function linePath(points: BundPoint[], m: Mapped): string {
  return points.map((p, i) => `${i ? 'L' : 'M'} ${m.toX(p.offset)} ${m.toY(p.rl)}`).join(' ')
}

/**
 * Closed area between an upper and a lower profile, for the hatched fills.
 * The two profiles are drawn over the same offset span, so walking the upper
 * forwards and the lower backwards closes the shape.
 */
function mappedBandPath(band: BundProfileBand, m: Mapped): string {
  return [
    `M ${m.toX(band.fromOffset)} ${m.toY(band.upperFromRl)}`,
    `L ${m.toX(band.toOffset)} ${m.toY(band.upperToRl)}`,
    `L ${m.toX(band.toOffset)} ${m.toY(band.lowerToRl)}`,
    `L ${m.toX(band.fromOffset)} ${m.toY(band.lowerFromRl)}`,
    'Z'
  ].join(' ')
}

/**
 * To-scale cross-section at one chainage: the existing ground, the stripped
 * surface, and the proposed bund, with the stripping and formation areas
 * hatched. This is the same geometry the quantity engine measures, so what the
 * user sees is what gets billed.
 */
export default function BundSectionDiagram({
  data,
  section
}: {
  data: BundData
  section: BundSection
}): JSX.Element {
  const view = useMemo(() => {
    const designProjected = [...projectedProfile(section, data.design)].sort(
      (a, b) => a.offset - b.offset
    )
    const canMeasureEarthwork = hasMeasurableGround(data, section)
    const leveling = canMeasureEarthwork ? bundLevelingGeometry(data, section) : null
    const projected = leveling?.proposed ?? designProjected
    const pre =
      leveling?.existing ??
      (section.pre.length >= 2
        ? [...section.pre].sort((a, b) => a.offset - b.offset)
        : usesFlatGround(data, section) && section.groundLevel != null
          ? designProjected.map((point) => ({
              offset: point.offset,
              rl: section.groundLevel as number
            }))
          : [])
    // A cleared section must stay empty. Do not let optional design overlays
    // create a chart after both Existing and Proposed points have been removed.
    if (pre.length < 2 && projected.length < 2) return null
    const strippingBands = leveling ? bundNetStrippingBands(data, section) : []
    const formationBands = leveling?.formation ?? []
    const heartingBands = heartingRepairBands(data, section)
    const measuredHeartingProjected = heartingRepairProfile(data, section)
    const heartingIsPreview =
      data.embankmentType === 'zoned' && measuredHeartingProjected.length < 2
    const heartingProjected =
      measuredHeartingProjected.length >= 2
        ? measuredHeartingProjected
        : data.embankmentType === 'zoned'
          ? proposedHeartingCrestProfile(data)
          : []
    const heartingBase = heartingBaseProfile(data, section)
    const heartingTrench = heartingTrenchEnabled(data)
      ? heartingTrenchProfile(data, section)
      : { top: [], bottom: [] }
    const stripped = (leveling?.stripping ?? []).reduce<BundPoint[]>((points, band) => {
      const from = { offset: band.fromOffset, rl: band.lowerFromRl }
      const to = { offset: band.toOffset, rl: band.lowerToRl }
      const last = points.at(-1)
      if (
        !last ||
        Math.abs(last.offset - from.offset) > 1e-9 ||
        Math.abs(last.rl - from.rl) > 1e-9
      ) {
        points.push(from)
      }
      points.push(to)
      return points
    }, [])

    const all = [
      ...pre,
      ...stripped,
      ...projected,
      ...designProjected,
      ...heartingProjected,
      ...heartingBase,
      // The trench invert is the lowest thing on the section — it has to be
      // inside the extents or the cut-off is drawn off the bottom of the chart.
      ...heartingTrench.top,
      ...heartingTrench.bottom
    ]
    if (all.length < 2) return null

    const offsets = all.map((p) => p.offset)
    const rls = all.map((p) => p.rl)
    let minX = Math.min(...offsets)
    let maxX = Math.max(...offsets)
    let minRl = Math.min(...rls)
    let maxRl = Math.max(...rls)

    const usToe = designProjected[0]
    const dsToe = designProjected.at(-1)
    if (usToe && upstreamToeTrenchEnabled(data)) {
      minX = Math.min(minX, usToe.offset - data.upstreamToe.topWidth)
      minRl = Math.min(minRl, usToe.rl - data.upstreamToe.depth)
    }
    if (dsToe) {
      if (data.downstreamToe.excavationMaterial) {
        // The trench is anchored at the d/s toe — it is cut where the bund
        // ends, not floated off it, so the section reads as one continuous line.
        const drainLeft = dsToe.offset
        const drainTopWidth =
          toeDrainInvertLevelAt(section, data) != null
            ? toeDrainTopWidthAt(section, data)
            : data.downstreamToe.topWidth
        maxX = Math.max(maxX, drainLeft + drainTopWidth)
        minRl = Math.min(minRl, dsToe.rl - toeDrainDepthAt(section, data))
      }
    }
    const spanX = Math.max(maxX - minX, 0.001)
    // Vertical exaggeration is normal on section drawings; without it a 20 m
    // wide, 1 m high restoration section renders as a flat line.
    const spanY = Math.max(maxRl - minRl, 0.001)

    const usableW = WIDTH - PAD_X * 2
    const usableH = HEIGHT - PAD_TOP - PAD_BOTTOM
    const toX = (offset: number): number => PAD_X + ((offset - minX) / spanX) * usableW
    const toY = (rl: number): number => PAD_TOP + usableH - ((rl - minRl) / spanY) * usableH

    const scaleX = usableW / spanX
    const scaleY = usableH / spanY

    return {
      toX,
      toY,
      pre,
      stripped,
      projected,
      designProjected,
      strippingBands,
      formationBands,
      heartingBands,
      heartingProjected,
      heartingBase,
      heartingTrench,
      heartingIsPreview,
      minX,
      maxX,
      minRl,
      maxRl,
      gridX: niceTicks(minX, maxX, 8),
      gridY: niceTicks(minRl, maxRl, 6),
      exaggeration: scaleY / scaleX
    }
  }, [data, section])

  if (!view) {
    return (
      <div className="bund-diagram-empty">
        {data.mode === 'new' && data.embankmentType === 'zoned'
          ? 'Enter a ground level for this chainage to draw the section.'
          : 'Enter the existing levels for this chainage to draw the section.'}
      </div>
    )
  }

  const m = view as Mapped
  // Axis distances are read from the u/s toe, matching the level table.
  const toeOrigin = upstreamToeOffset(section, data)
  const areas = sectionAreas(data, section)
  const formationPaths = view.formationBands.map((band) => mappedBandPath(band, m))
  const heartingPaths = view.heartingBands.map((band) => mappedBandPath(band, m))
  const strippingPaths = view.strippingBands.map((band) => mappedBandPath(band, m))
  const effectiveStrippedLine = view.stripped
  const zonedAreas = data.embankmentType === 'zoned' ? zonedRepairAreas(data, section) : null

  return (
    <svg
      className="bund-diagram"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={`Bund cross-section at chainage ${formatChainage(section.chainage, data.chainageUnit)}`}
    >
      <defs>
        <pattern
          id="bund-hatch-fill"
          width="7"
          height="7"
          patternTransform="rotate(45)"
          patternUnits="userSpaceOnUse"
        >
          <line x1="0" y1="0" x2="0" y2="7" className="bund-hatch-fill-line" />
        </pattern>
        <pattern
          id="bund-hatch-strip"
          width="6"
          height="6"
          patternTransform="rotate(-45)"
          patternUnits="userSpaceOnUse"
        >
          <line x1="0" y1="0" x2="0" y2="6" className="bund-hatch-strip-line" />
        </pattern>
        <pattern
          id="bund-hatch-hearting"
          width="7"
          height="7"
          patternTransform="rotate(-45)"
          patternUnits="userSpaceOnUse"
        >
          <line x1="0" y1="0" x2="0" y2="7" className="bund-hatch-hearting-line" />
        </pattern>
      </defs>

      {/* Graph-paper grid: RL lines across, distance lines down, drawn first so
          the profiles sit on top of it. */}
      <g className="bund-grid">
        <rect
          x={PAD_X}
          y={PAD_TOP}
          width={WIDTH - PAD_X * 2}
          height={HEIGHT - PAD_TOP - PAD_BOTTOM}
          className="bund-grid-frame"
        />
        {view.gridY.map((rl) => (
          <line
            key={`gy-${rl}`}
            x1={PAD_X}
            y1={m.toY(rl)}
            x2={WIDTH - PAD_X}
            y2={m.toY(rl)}
            className="bund-grid-line"
          />
        ))}
        {view.gridX.map((x) => (
          <line
            key={`gx-${x}`}
            x1={m.toX(x)}
            y1={PAD_TOP}
            x2={m.toX(x)}
            y2={HEIGHT - PAD_BOTTOM}
            className="bund-grid-line"
          />
        ))}
      </g>

      {/* Formation: everything between the proposed profile and whichever
          surface the fill is measured from. */}
      {formationPaths.map((path, index) => (
        <path key={`formation-${index}`} d={path} fill="url(#bund-hatch-fill)" />
      ))}
      {heartingPaths.map((path, index) => (
        <path
          key={`hearting-${index}`}
          d={path}
          className="bund-hearting-band"
          fill="url(#bund-hatch-hearting)"
        />
      ))}
      {/* Stripping: the layer taken off between existing ground and stripped. */}
      {strippingPaths.map((path, index) => (
        <path key={`stripping-${index}`} d={path} fill="url(#bund-hatch-strip)" />
      ))}

      {view.pre.length >= 2 && (
        <path d={linePath(view.pre, m)} className="bund-line-pre" fill="none" />
      )}
      {effectiveStrippedLine.length >= 2 && (
        <path
          d={linePath(effectiveStrippedLine, m)}
          className="bund-line-stripped"
          fill="none"
        />
      )}
      {view.projected.length >= 2 && (
        <path d={linePath(view.projected, m)} className="bund-line-projected" fill="none" />
      )}
      {view.heartingProjected.length >= 2 && (
        <path
          d={linePath(view.heartingProjected, m)}
          className={`bund-hearting-line${
            view.heartingIsPreview ? ' is-preview' : ''
          }`}
          fill="none"
        />
      )}
      {view.heartingBase.length >= 2 && (
        <>
          <path
            d={linePath(view.heartingBase, m)}
            className="bund-hearting-existing-line"
            fill="none"
          />
          <text
            x={m.toX(view.heartingBase[0].offset)}
            y={m.toY(view.heartingBase[0].rl) + 17}
            className="bund-hearting-label"
          >
            U/S contact · RL {f3(view.heartingBase[0].rl)}
          </text>
          <text
            x={m.toX(view.heartingBase.at(-1)!.offset)}
            y={m.toY(view.heartingBase.at(-1)!.rl) + 17}
            textAnchor="end"
            className="bund-hearting-label"
          >
            D/S contact · RL {f3(view.heartingBase.at(-1)!.rl)}
          </text>
        </>
      )}
      {/* Cut-off trench: the hearting carried below the formation base. Drawn
          in the hearting fill, because that is what it is backfilled with, with
          its cut outlined so the excavation being paid for is visible. */}
      {view.heartingTrench.top.length >= 2 && view.heartingTrench.bottom.length >= 2 && (
        (() => {
          const { top, bottom } = view.heartingTrench
          const corners = [
            ...top.map((p) => `${m.toX(p.offset)},${m.toY(p.rl)}`),
            `${m.toX(bottom[1].offset)},${m.toY(bottom[1].rl)}`,
            `${m.toX(bottom[0].offset)},${m.toY(bottom[0].rl)}`
          ].join(' ')
          const midX = m.toX((bottom[0].offset + bottom[1].offset) / 2)
          return (
            <>
              <polygon points={corners} className="bund-overlay-hearting-trench" />
              <polygon points={corners} className="bund-hearting-trench-outline" />
              <text
                x={midX}
                y={m.toY(bottom[0].rl) + 14}
                textAnchor="middle"
                className="bund-hearting-label"
              >
                cut-off trench · invert RL {f3(bottom[0].rl)}
              </text>
            </>
          )
        })()
      )}
      {view.heartingProjected.length >= 4 && (
        <text
          x={m.toX(
            (view.heartingProjected[1].offset + view.heartingProjected[2].offset) / 2
          )}
          y={m.toY(view.heartingProjected[1].rl) - 6}
          textAnchor="middle"
          className="bund-hearting-label"
        >
          hearting top RL {f3(view.heartingProjected[1].rl)}
          {view.heartingIsPreview
            ? data.mode === 'restoration'
              ? ' · enter Existing RLs for automatic contacts'
              : ' · enter ground RL for full zone'
            : ''}
        </text>
      )}

      {/* Enabled extras drawn on the same chainage. Rock-toe geometry belongs
          only to the phreatic-line chart; this section stays focused on the
          bund leveling and the component trenches built after it. */}
      {view.designProjected.length >= 2 &&
        (() => {
          const half = data.design.topWidth / 2
          const proj = view.designProjected
          const usFace = proj.filter((p) => p.offset <= -half + 1e-6)
          const dsFace = proj.filter((p) => p.offset >= half - 1e-6)
          /**
           * A face split into the stretches that are actually pitched/turfed:
           * the berm shelves are cut out, using the same test `faceSlopeLengths`
           * measures with, so a drawn layer is never wider than what is billed.
           */
          const faceRuns = (points: BundPoint[], side: 'us' | 'ds'): BundPoint[][] => {
            const berms = (data.design.berms ?? []).filter((berm) => berm.side === side)
            if (points.length < 2) return []
            if (!berms.length) return [points]
            const runs: BundPoint[][] = []
            let current: BundPoint[] = [points[0]]
            for (let i = 1; i < points.length; i += 1) {
              const a = points[i - 1]
              const b = points[i]
              const onShelf =
                Math.abs(a.rl - b.rl) < 1e-6 &&
                berms.some((berm) => Math.abs(berm.level - a.rl) < 1e-6)
              if (onShelf) {
                if (current.length >= 2) runs.push(current)
                current = [b]
              } else {
                current.push(b)
              }
            }
            if (current.length >= 2) runs.push(current)
            return runs
          }
          const usToe = proj[0]
          const dsToe = downstreamDesignToePointAt(section, data) ?? proj[proj.length - 1]
          // The trench is anchored at the d/s toe — it is cut where the bund
          // ends, not floated off it, so the section reads as one continuous line.
          const drainLeft = dsToe.offset
          const drainDepth = toeDrainDepthAt(section, data)
          const drainInvert = toeDrainInvertLevelAt(section, data)
          // The trench is formed at the proposed level, on a platform filled up
          // from the existing ground across its own width.
          const drainPlatform = toeDrainPlatformAt(section, data)
          const drainGroundRl = drainPlatform?.level ?? dsToe.rl
          const drainTopWidth =
            drainInvert != null ? toeDrainTopWidthAt(section, data) : data.downstreamToe.topWidth
          const drainBottomWidth = Math.max(0, data.downstreamToe.bottomWidth)
          const drainLeftRun =
            drainInvert != null
              ? Math.max(0, data.downstreamToe.leftSlope || 0) * drainDepth
              : Math.max(0, (drainTopWidth - drainBottomWidth) / 2)
          const pxPerM = m.toX(1) - m.toX(0)
          // A layer of thickness `t` (m) drawn as a band offset perpendicular to
          // the face, on its outer (upper) side.
          const layerBand = (pts: BundPoint[], t: number): string => {
            const S = pts.map((p) => ({ x: m.toX(p.offset), y: m.toY(p.rl) }))
            const tPx = t * pxPerM
            const off = S.map((s, i) => {
              const a = S[Math.max(0, i - 1)]
              const b = S[Math.min(S.length - 1, i + 1)]
              const dx = b.x - a.x
              const dy = b.y - a.y
              const len = Math.hypot(dx, dy) || 1
              let nx = -dy / len
              let ny = dx / len
              if (ny > 0) {
                nx = -nx
                ny = -ny
              }
              return { x: s.x + nx * tPx, y: s.y + ny * tPx }
            })
            const fwd = S.map((s, i) => `${i ? 'L' : 'M'} ${s.x} ${s.y}`)
            const back = [...off].reverse().map((s) => `L ${s.x} ${s.y}`)
            return [...fwd, ...back, 'Z'].join(' ')
          }
          return (
            <g>
              {data.pitchingMaterial &&
                faceRuns(usFace, 'us').map((run, index) => (
                  <g key={`pitching-run-${index}`}>
                    <path
                      d={layerBand(run, pitchingThicknessM(data))}
                      className="bund-overlay-pitching-band"
                    />
                    <path d={linePath(run, m)} className="bund-overlay-pitching" fill="none" />
                  </g>
                ))}
              {upstreamToeTrenchEnabled(data) && (
                <>
                  <path
                    d={[
                      `M ${m.toX(usToe.offset - data.upstreamToe.topWidth)} ${m.toY(usToe.rl)}`,
                      `L ${m.toX(usToe.offset)} ${m.toY(usToe.rl)}`,
                      `L ${m.toX(
                        usToe.offset -
                          (data.upstreamToe.topWidth - data.upstreamToe.bottomWidth) / 2
                      )} ${m.toY(usToe.rl - data.upstreamToe.depth)}`,
                      `L ${m.toX(
                        usToe.offset -
                          (data.upstreamToe.topWidth - data.upstreamToe.bottomWidth) / 2 -
                          data.upstreamToe.bottomWidth
                      )} ${m.toY(usToe.rl - data.upstreamToe.depth)}`,
                      'Z'
                    ].join(' ')}
                    className="bund-overlay-ustoe-trench"
                  />
                  <text
                    x={m.toX(usToe.offset - data.upstreamToe.topWidth / 2)}
                    y={m.toY(usToe.rl) - 7}
                    textAnchor="middle"
                    className="bund-overlay-label"
                  >
                    {data.upstreamToe.buildMaterial ? 'U/S toe wall' : 'U/S toe trench'}
                  </text>
                </>
              )}
              {/* Berm shelves: the flat runs the face lengths deliberately skip. */}
              {(data.design.berms ?? []).map((berm) => {
                const shelf = proj.filter(
                  (point) =>
                    Math.abs(point.rl - berm.level) < 1e-6 &&
                    (berm.side === 'us' ? point.offset < -half : point.offset > half)
                )
                if (shelf.length < 2) return null
                const from = shelf[0]
                const to = shelf[shelf.length - 1]
                return (
                  <g key={`berm-${berm.id}`}>
                    <line
                      x1={m.toX(from.offset)}
                      y1={m.toY(from.rl)}
                      x2={m.toX(to.offset)}
                      y2={m.toY(to.rl)}
                      className="bund-overlay-berm"
                    />
                    <text
                      x={m.toX((from.offset + to.offset) / 2)}
                      y={m.toY(from.rl) - 6}
                      textAnchor="middle"
                      className="bund-overlay-label"
                    >
                      berm {f2(to.offset - from.offset)} m · RL {f3(berm.level)}
                    </text>
                  </g>
                )
              })}
              {data.turfingMaterial &&
                faceRuns(dsFace, 'ds').map((run, index) => (
                  <g key={`turfing-run-${index}`}>
                    {/* Turfing has no billed thickness; draw a thin nominal band. */}
                    <path d={layerBand(run, 0.1)} className="bund-overlay-turfing-band" />
                    <path d={linePath(run, m)} className="bund-overlay-turfing" fill="none" />
                  </g>
                ))}
              {data.downstreamToe.excavationMaterial && drainDepth > 0 && (
                <>
                  <path
                    d={[
                      `M ${m.toX(drainLeft)} ${m.toY(drainGroundRl)}`,
                      `L ${m.toX(drainLeft + drainTopWidth)} ${m.toY(drainGroundRl)}`,
                      `L ${m.toX(
                        drainLeft + drainLeftRun + drainBottomWidth
                      )} ${m.toY(drainGroundRl - drainDepth)}`,
                      `L ${m.toX(drainLeft + drainLeftRun)} ${m.toY(
                        drainGroundRl - drainDepth
                      )}`,
                      'Z'
                    ].join(' ')}
                    className="bund-overlay-toedrain"
                  />
                  {data.downstreamToe.buildMaterial && (
                    <path
                      d={[
                        `M ${m.toX(drainLeft)} ${m.toY(drainGroundRl)}`,
                        `L ${m.toX(drainLeft + drainLeftRun)} ${m.toY(
                          drainGroundRl - drainDepth
                        )}`,
                        `L ${m.toX(
                          drainLeft + drainLeftRun + drainBottomWidth
                        )} ${m.toY(drainGroundRl - drainDepth)}`,
                        `L ${m.toX(drainLeft + drainTopWidth)} ${m.toY(
                          drainGroundRl
                        )}`
                      ].join(' ')}
                      className="bund-overlay-toedrain-lining"
                      fill="none"
                    />
                  )}
                  <text
                    x={m.toX(drainLeft + drainTopWidth / 2)}
                    y={m.toY(drainGroundRl) - 7}
                    textAnchor="middle"
                    className="bund-overlay-label"
                  >
                    toe drain{drainInvert != null ? ` · inv. ${f3(drainInvert)}` : ''} ·{' '}
                    {f2(drainDepth)} m deep
                  </text>
                </>
              )}
            </g>
          )
        })()}

      {/* Reservoir reference levels (MWL / FTL), where they fall on the section. */}
      {(
        [
          ['MWL', data.design.mwl],
          ['FTL', data.design.ftl]
        ] as [string, number | null][]
      ).map(([label, rl]) =>
        rl != null && rl >= view.minRl && rl <= view.maxRl ? (
          <g key={label} className="bund-waterline">
            <line x1={PAD_X} y1={m.toY(rl)} x2={WIDTH - PAD_X} y2={m.toY(rl)} />
            <text x={WIDTH - PAD_X - 2} y={m.toY(rl) - 3} textAnchor="end">
              {label} {f3(rl)}
            </text>
          </g>
        ) : null
      )}

      {/* Centre-line. */}
      <line
        x1={m.toX(0)}
        y1={PAD_TOP - 6}
        x2={m.toX(0)}
        y2={HEIGHT - PAD_BOTTOM + 8}
        className="bund-centreline"
      />

      <g className="bund-diagram-labels">
        {/* Distance axis (bottom): a label under each vertical grid line. */}
        {view.gridX.map((x) => (
          <text
            key={`lx-${x}`}
            x={m.toX(x)}
            y={HEIGHT - PAD_BOTTOM + 16}
            textAnchor="middle"
            className={Math.abs(x) < 1e-6 ? 'bund-axis-centre' : undefined}
          >
            {Math.abs(x) < 1e-6 ? '℄' : f2(x - toeOrigin)}
          </text>
        ))}
        <text x={WIDTH / 2} y={HEIGHT - PAD_BOTTOM + 30} textAnchor="middle" className="bund-axis-title">
          distance from u/s toe (m)
        </text>
        <text x={PAD_X} y={PAD_TOP - 6} textAnchor="start" className="bund-side-label">
          ← Upstream
        </text>
        <text x={WIDTH - PAD_X} y={PAD_TOP - 6} textAnchor="end" className="bund-side-label">
          Downstream →
        </text>

        {/* RL axis (left): a label beside each horizontal grid line. */}
        {view.gridY.map((rl) => (
          <text key={`ly-${rl}`} x={PAD_X - 6} y={m.toY(rl) + 3.5} textAnchor="end">
            {f3(rl)}
          </text>
        ))}

        <text x={WIDTH - 8} y={HEIGHT - 8} textAnchor="end" className="bund-diagram-note">
          vertical exaggeration ×{view.exaggeration.toFixed(1)}
        </text>
        <text x={PAD_X} y={HEIGHT - 8} textAnchor="start" className="bund-diagram-note">
          cut / stripping {f3(areas.stripping)} m²
          {data.rockToeMaterial && data.rockToeExcavationMaterial
            ? ' (net of rock-toe union)'
            : ''}{' '}
          {zonedAreas
            ? ` · casing ${f3(zonedAreas.casing)} m² · hearting ${f3(zonedAreas.hearting)} m²`
            : ` · formation ${f3(areas.formation)} m²`}
        </text>
      </g>
    </svg>
  )
}
