import type { BundData, BundPoint, BundSection } from '../../types/project'
import {
  downstreamToeFaceSlope,
  downstreamDesignToePointAt,
  existLevelAt,
  formatChainage,
  horizontalFilterLengthAt,
  horizontalFilterThicknessM,
  internalFiltersAvailable,
  phreaticGeometry,
  projectedProfile,
  rockToeBaseWidth,
  rockToeFilterBelowThicknessM,
  rockToeHeightAt,
  verticalFilterHeightAt,
  verticalFilterWidthM,
  heartingBaseProfile,
  heartingRepairProfile,
  isZonedBund
} from '../../lib/bund'

const W = 700
const H = 260
const PAD_X = 42
const PAD_TOP = 30
const PAD_BOTTOM = 58

/**
 * Compact seepage schematic. It deliberately shows only the proposed bund at
 * the steepest section, MWL, the phreatic line and any element that intercepts
 * that line. Only seepage-relevant elements are shown here: the bund, internal
 * filters and rock toe. All other physical works belong in the Bund Diagram.
 */
export default function BundDrainageDiagram({
  data,
  section,
  referenceData,
  referenceSection
}: {
  data: BundData
  section: BundSection | null
  referenceData?: BundData
  referenceSection?: BundSection | null
}): JSX.Element {
  const isZoned = isZonedBund(data)
  const heartingUpper = isZoned && section ? heartingRepairProfile(data, section) : []
  const heartingBase = isZoned && section ? heartingBaseProfile(data, section) : []
  const geo = section ? phreaticGeometry(data, section) : null
  const hFilterThickness = horizontalFilterThicknessM(data)
  const vFilterWidth = verticalFilterWidthM(data)
  const rockToeFilterBelow = rockToeFilterBelowThicknessM(data)
  const proj = section
    ? [...projectedProfile(section, data.design)].sort((a, b) => a.offset - b.offset)
    : []
  const referenceAt = referenceSection ?? section
  const referenceGeo =
    referenceData && referenceAt ? phreaticGeometry(referenceData, referenceAt) : null
  const referenceProj =
    referenceData && referenceAt
      ? [...projectedProfile(referenceAt, referenceData.design)].sort(
          (a, b) => a.offset - b.offset
        )
      : []

  if (!section || !geo || proj.length < 2) {
    return (
      <div className="bund-diagram-empty bund-drainage-empty">
        {data.design.mwl == null
          ? 'Enter MWL to draw the phreatic line.'
          : 'Complete the section levels to draw the seepage section.'}
      </div>
    )
  }

  const { design } = data
  const baseRl = geo.baseRl
  const waterRl = baseRl + geo.waterDepth
  const usToe = proj[0]
  // The theoretical toe of the finished no-rock-toe profile, not the existing
  // ground or the end of the survey. The rock toe is anchored here.
  const dsToe = downstreamDesignToePointAt(section, data) ?? proj[proj.length - 1]

  const rockToeHeight = data.rockToeMaterial ? rockToeHeightAt(section, data) : 0
  const rockToeOuterX = dsToe.offset
  const rockToeInnerX =
    rockToeOuterX -
    rockToeBaseWidth(rockToeHeight, data, downstreamToeFaceSlope(section, data))
  const rockToeCrestInnerX = rockToeInnerX + data.rockToeInnerSlope * rockToeHeight
  const rockToeCrestOuterX = rockToeCrestInnerX + data.rockToeTopWidth
  const rockToeCrestRl = dsToe.rl + rockToeHeight
  const horizontalFilterOn =
    internalFiltersAvailable(data) &&
    Boolean(data.horizontalFilterMaterial) &&
    horizontalFilterLengthAt(section, data) > 0
  const horizontalFilterOuterX = rockToeHeight > 0 ? rockToeInnerX : dsToe.offset
  const horizontalFilterInnerX =
    horizontalFilterOuterX - horizontalFilterLengthAt(section, data)
  const verticalFilterOn = horizontalFilterOn && Boolean(data.verticalFilterMaterial)
  const verticalFilterHeight = verticalFilterOn ? verticalFilterHeightAt(section, data) : 0
  const phreaticAtRockToeCrest =
    rockToeHeight > 0 ? existLevelAt(geo.points, rockToeCrestInnerX) : null
  const rockToeShortfall =
    phreaticAtRockToeCrest == null
      ? 0
      : Math.max(0, phreaticAtRockToeCrest - rockToeCrestRl)
  const allPoints: BundPoint[] = [
    ...proj,
    ...geo.points,
    { offset: geo.focusX, rl: geo.baseRl },
    ...referenceProj,
    ...(referenceGeo?.points ?? []),
    ...(referenceGeo
      ? [{ offset: referenceGeo.focusX, rl: referenceGeo.baseRl }]
      : []),
    ...(rockToeHeight > 0
      ? [
          { offset: rockToeInnerX, rl: dsToe.rl },
          { offset: rockToeCrestInnerX, rl: dsToe.rl + rockToeHeight },
          { offset: rockToeCrestOuterX, rl: dsToe.rl + rockToeHeight }
        ]
      : [])
  ]
  const minX = Math.min(...allPoints.map((point) => point.offset)) - 1.5
  const maxX = Math.max(...allPoints.map((point) => point.offset)) + 1.5
  const maxRl = Math.max(...allPoints.map((point) => point.rl), design.topLevel) + 0.45
  const minRl =
    Math.min(
      ...allPoints.map((point) => point.rl),
      baseRl,
      referenceGeo?.baseRl ?? baseRl
    ) - Math.max(
      0.65,
      horizontalFilterOn ? hFilterThickness : 0,
      rockToeHeight > 0 && data.rockToeFilterMaterial ? 1 : 0
    )

  const sx = (W - PAD_X * 2) / Math.max(1, maxX - minX)
  const sy = (H - PAD_TOP - PAD_BOTTOM) / Math.max(1, maxRl - minRl)
  const X = (offset: number): number => PAD_X + (offset - minX) * sx
  const Y = (rl: number): number => PAD_TOP + (maxRl - rl) * sy
  const line = (points: BundPoint[]): string =>
    points.map((point, index) => `${index ? 'L' : 'M'} ${X(point.offset)} ${Y(point.rl)}`).join(' ')
  const cut = geo.interceptX
  const cutPoint =
    cut == null || geo.interceptRl == null
      ? null
      : { offset: cut, rl: geo.interceptRl }
  const solid =
    cut == null
      ? geo.points
      : [
          ...geo.points.filter((point) => point.offset < cut - 1e-6),
          ...(cutPoint ? [cutPoint] : [])
        ]
  const cutRl = cutPoint?.rl ?? (solid.length ? solid[solid.length - 1].rl : baseRl)
  const chimneyTopRl = baseRl + verticalFilterHeight
  const chimneyShortfall =
    verticalFilterOn && geo.interceptedBy === 'blanket'
      ? Math.max(0, cutRl - chimneyTopRl)
      : 0
  const interceptedBy =
    geo.interceptedBy === 'chimney'
      ? 'chimney filter'
      : geo.interceptedBy === 'rocktoe'
        ? 'rock toe'
        : geo.interceptedBy === 'blanket'
          ? 'filter blanket'
          : null
  const referenceFocusDiffers =
    referenceGeo != null &&
    (Math.abs(referenceGeo.focusX - geo.focusX) > 1e-3 ||
      Math.abs(referenceGeo.baseRl - geo.baseRl) > 1e-3)
  const focusAtRockToeAnchor =
    rockToeHeight > 0 &&
    Math.abs(geo.focusX - rockToeOuterX) <= 1e-3 &&
    Math.abs(geo.baseRl - dsToe.rl) <= 1e-3
  const focusLabel = verticalFilterOn
    ? 'F · chimney / blanket junction'
    : horizontalFilterOn
      ? 'F · horizontal-filter inlet'
      : geo.interceptedBy === 'rocktoe'
        ? 'F · rock-toe heel'
        : 'F · design d/s toe'

  return (
    <svg
      className="bund-drainage-diagram"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Phreatic line with filters and rock toe through the proposed bund"
    >
      <rect
        x={X(minX)}
        y={Y(waterRl)}
        width={Math.max(0, X(geo.entryX) - X(minX))}
        height={Math.max(0, Y(minRl + 0.2) - Y(waterRl))}
        className="bund-dr-water"
      />

      {/* Outline only: no toe-to-toe closing line and no false ground profile. */}
      <path d={line(proj)} className="bund-dr-design-outline" fill="none" />

      {horizontalFilterOn && (
        <rect
          x={X(horizontalFilterInnerX)}
          y={Y(baseRl)}
          width={Math.max(0, X(horizontalFilterOuterX) - X(horizontalFilterInnerX))}
          height={Math.max(2, Y(baseRl - hFilterThickness) - Y(baseRl))}
          className="bund-dr-hfilter"
        />
      )}

      {verticalFilterOn && verticalFilterHeight > 0 && (
        <rect
          x={X(horizontalFilterInnerX)}
          y={Y(baseRl + verticalFilterHeight)}
          width={Math.max(3, vFilterWidth * sx)}
          height={
            Y(baseRl) - Y(baseRl + verticalFilterHeight)
          }
          className="bund-dr-vfilter"
        />
      )}

      {rockToeHeight > 0 && (
        <>
          {data.rockToeFilterMaterial && (
            <rect
              x={X(rockToeInnerX)}
              y={Y(dsToe.rl)}
              width={X(rockToeOuterX) - X(rockToeInnerX)}
              height={Y(dsToe.rl - rockToeFilterBelow) - Y(dsToe.rl)}
              className="bund-overlay-rocktoe-filter"
            />
          )}
          <polygon
            points={[
              `${X(rockToeInnerX)},${Y(dsToe.rl)}`,
              `${X(rockToeCrestInnerX)},${Y(dsToe.rl + rockToeHeight)}`,
              `${X(rockToeCrestOuterX)},${Y(dsToe.rl + rockToeHeight)}`,
              `${X(rockToeOuterX)},${Y(dsToe.rl)}`
            ].join(' ')}
            className="bund-overlay-rocktoe"
          />
          <circle
            cx={X(rockToeOuterX)}
            cy={Y(dsToe.rl)}
            r={3.2}
            className="bund-dr-rocktoe-anchor"
          />
          <text
            x={X(rockToeOuterX) + 5}
            y={Y(dsToe.rl) - 7}
            className="bund-dr-rocktoe-anchor-label"
          >
            {focusAtRockToeAnchor
              ? 'F / rock-toe anchor · design d/s toe'
              : 'F₀ / rock-toe anchor · design d/s toe'}
          </text>
        </>
      )}

            {isZoned && heartingUpper.length >= 4 && (
        <g className="bund-dr-hearting-zone">
          <polygon
            points={[
              ...heartingUpper.map((p) => `${X(p.offset)},${Y(p.rl)}`),
              ...[...heartingBase].reverse().map((p) => `${X(p.offset)},${Y(p.rl)}`)
            ].join(' ')}
            fill="#3b82f6"
            fillOpacity={0.25}
            stroke="#3b82f6"
            strokeWidth={1.5}
          />
          <text
            x={X((heartingUpper[1].offset + heartingUpper[2].offset) / 2)}
            y={Y(heartingUpper[1].rl) - 6}
            textAnchor="middle"
            fill="#3b82f6"
            fontSize={11}
            fontWeight={600}
          >
            Impervious Core (Seepage Barrier)
          </text>
        </g>
      )}

      {!isZoned && (
        <>
          <path
            d={line(solid)}
            className={geo.cutsFace ? 'bund-dr-phreatic actual warn' : 'bund-dr-phreatic actual'}
            fill="none"
          />
          {referenceGeo && (
            <path
              d={line(referenceGeo.points)}
              className="bund-dr-phreatic reference"
              fill="none"
            />
          )}
        </>
      )}
      {!isZoned && (geo.interceptedBy === 'chimney' || geo.interceptedBy === 'blanket') &&
        cut != null && (
          <line
            x1={X(cut)}
            y1={Y(cutRl)}
            x2={X(cut)}
            y2={Y(baseRl)}
            className={
              chimneyShortfall > 1e-3
                ? 'bund-dr-chimney-gap'
                : 'bund-dr-phreatic actual'
            }
          />
        )}
      {!isZoned && chimneyShortfall > 1e-3 && cut != null && (
        <text
          x={X(cut) - 5}
          y={(Y(cutRl) + Y(chimneyTopRl)) / 2}
          textAnchor="end"
          dominantBaseline="middle"
          className="bund-dr-rocktoe-gap-label"
        >
          chimney short {chimneyShortfall.toFixed(2)} m
        </text>
      )}
      {!isZoned && cutPoint && (
        <>
          <circle
            cx={X(cutPoint.offset)}
            cy={Y(cutPoint.rl)}
            r={3.2}
            className="bund-dr-intercept"
          />
          {geo.interceptedBy === 'rocktoe' && (
            <text
              x={X(cutPoint.offset) - 5}
              y={Y(cutPoint.rl) - 6}
              textAnchor="end"
              className="bund-dr-intercept-label"
            >
              I · seepage enters rock toe
            </text>
          )}
        </>
      )}

      {referenceFocusDiffers && referenceGeo && rockToeHeight <= 0 && (
        <>
          <circle
            cx={X(referenceGeo.focusX)}
            cy={Y(referenceGeo.baseRl)}
            r={3}
            className="bund-dr-reference-focus"
          />
          <text
            x={X(referenceGeo.focusX) + 5}
            y={Y(referenceGeo.baseRl) + 11}
            className="bund-dr-reference-focus-label"
          >
            F₀ · reference design toe
          </text>
        </>
      )}
      {!focusAtRockToeAnchor && (
        <>
          <circle
            cx={X(geo.focusX)}
            cy={Y(geo.baseRl)}
            r={3.2}
            className="bund-dr-focus"
          />
          <text
            x={X(geo.focusX) + 5}
            y={Y(geo.baseRl) - 6}
            className="bund-dr-focus-label"
          >
            {focusLabel}
          </text>
        </>
      )}
      {rockToeHeight > 0 &&
        geo.interceptedBy !== 'rocktoe' &&
        phreaticAtRockToeCrest != null &&
        rockToeShortfall > 1e-3 && (
          <>
            <line
              x1={X(rockToeCrestInnerX)}
              y1={Y(rockToeCrestRl)}
              x2={X(rockToeCrestInnerX)}
              y2={Y(phreaticAtRockToeCrest)}
              className="bund-dr-rocktoe-gap"
            />
            <circle
              cx={X(rockToeCrestInnerX)}
              cy={Y(phreaticAtRockToeCrest)}
              r={3}
              className="bund-dr-rocktoe-miss"
            />
            <text
              x={X(rockToeCrestInnerX) - 5}
              y={(Y(rockToeCrestRl) + Y(phreaticAtRockToeCrest)) / 2}
              textAnchor="end"
              dominantBaseline="middle"
              className="bund-dr-rocktoe-gap-label"
            >
              short {rockToeShortfall.toFixed(2)} m
            </text>
          </>
        )}

      <text x={X(minX) + 4} y={Y(waterRl) - 4} className="bund-dr-mwl">
        MWL {design.mwl?.toFixed(2)}
      </text>
      <text x={X(0)} y={Y(design.topLevel) - 6} textAnchor="middle" className="bund-toe-note">
        TBL {design.topLevel.toFixed(2)}
      </text>
      <text x={X(usToe.offset)} y={Y(usToe.rl) + 13} textAnchor="middle" className="bund-toe-note">
        U/S {usToe.rl.toFixed(2)}
      </text>
      <text x={X(dsToe.offset)} y={Y(dsToe.rl) + 13} textAnchor="middle" className="bund-toe-note">
        D/S {dsToe.rl.toFixed(2)}
      </text>
      <text x={W - 8} y={14} textAnchor="end" className="bund-dr-section-label">
        Ch {formatChainage(section.chainage, data.chainageUnit)} · steepest section
      </text>

      {referenceGeo && (
        <g className="bund-dr-legend">
          <line
            x1={12}
            y1={H - 27}
            x2={34}
            y2={H - 27}
            className="bund-dr-phreatic reference"
          />
          <text x={39} y={H - 24}>
            Reference — no options
          </text>
          <line
            x1={190}
            y1={H - 27}
            x2={212}
            y2={H - 27}
            className={
              geo.cutsFace ? 'bund-dr-phreatic actual warn' : 'bund-dr-phreatic actual'
            }
          />
          <text x={217} y={H - 24}>
            Actual selected design
          </text>
        </g>
      )}

      {isZoned ? (
        <text x={W / 2} y={H - 8} textAnchor="middle" className="bund-toe-note">
          Zoned Earth Bund: Impervious clay core prevents phreatic line formation through the embankment body.
        </text>
      ) : geo.cutsFace ? (
        <text x={W / 2} y={H - 8} textAnchor="middle" className="bund-dr-warntext">
          {rockToeHeight > 0 && rockToeShortfall > 1e-3
            ? `Entered rock toe misses the phreatic line by ${rockToeShortfall.toFixed(2)} m at its inner crest.`
            : 'Phreatic line reaches the downstream face — provide interception.'}
        </text>
      ) : chimneyShortfall > 1e-3 ? (
        <text x={W / 2} y={H - 8} textAnchor="middle" className="bund-dr-warntext">
          Vertical filter is too short; the horizontal blanket remains the controlling drain.
        </text>
      ) : (
        <text x={W / 2} y={H - 8} textAnchor="middle" className="bund-toe-note">
          Phreatic line intercepted by the {interceptedBy ?? 'toe drainage'}.
        </text>
      )}
    </svg>
  )
}
