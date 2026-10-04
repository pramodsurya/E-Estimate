import type { CanalData, CanalFilterDrainReach, CanalPoint, CanalSection } from '../../types/project'
import {
  canalBedLevelAt,
  canalBundFootprintRanges,
  canalDesignProfile,
  canalFlowLabel,
  canalFoundationRlAt,
  canalAutomaticFilterLengthsAtSection,
  canalFoundationExcavationBands,
  canalGroundLevelAt,
  canalHeartingSection,
  canalServiceRoadSegments,
  canalSectionAreas,
  canalSectionBankTier,
  canalStrippingBands,
  canalStrippingDepthAt,
  orderCanalPoints,
  profileDifferenceBands
} from '../../lib/canal'
import { formatChainage } from '../../lib/guideWall'

const WIDTH = 640
const HEIGHT = 360
const PAD_LEFT = 58
const PAD_RIGHT = 26
const PAD_TOP = 30
const PAD_BOTTOM = 48

const f2 = (n: number): string => n.toFixed(2)

function polygonArea(points: CanalPoint[]): number {
  if (points.length < 3) return 0
  return Math.abs(points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length]
    return sum + point.offset * next.rl - next.offset * point.rl
  }, 0)) / 2
}

interface Mapped {
  toX: (offset: number) => number
  toY: (rl: number) => number
}

/** Round grid values across [min, max] at a readable step. */
function niceTicks(min: number, max: number, target: number): number[] {
  const span = max - min
  if (span <= 0) return [min]
  const raw = span / target
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)))
  const normalised = raw / magnitude
  const step =
    (normalised >= 5 ? 5 : normalised >= 2.5 ? 2.5 : normalised >= 2 ? 2 : 1) * magnitude
  const ticks: number[] = []
  for (let value = Math.ceil(min / step) * step; value <= max + step * 1e-6; value += step) {
    ticks.push(Math.round(value * 1000) / 1000)
  }
  return ticks
}

function linePath(points: CanalPoint[], m: Mapped): string {
  return points.map((p, i) => `${i ? 'L' : 'M'} ${m.toX(p.offset)} ${m.toY(p.rl)}`).join(' ')
}

function profileBetween(points: CanalPoint[], from: number, to: number): CanalPoint[] {
  if (points.length < 2 || !(to > from)) return []
  const inside = points.filter((point) => point.offset > from && point.offset < to)
  const fromRl = canalGroundLevelAt(points, from)
  const toRl = canalGroundLevelAt(points, to)
  if (fromRl == null || toRl == null) return []
  return [{ offset: from, rl: fromRl }, ...inside, { offset: to, rl: toRl }]
}

function raisedBand(profile: CanalPoint[], thickness: number): CanalPoint[] {
  if (profile.length < 2 || !(thickness > 0)) return []
  return [...profile, ...[...profile].reverse().map((point) => ({ ...point, rl: point.rl + thickness }))]
}

/**
 * To-scale cross-section at one chainage: surveyed ground, designed canal
 * prism, and the cut/fill bands between them. Bitmap-free SVG so it can be
 * captured for print later. The bands come from `profileDifferenceBands`, the
 * same geometry `canalSectionAreas` measures.
 */
export default function CanalSectionDiagram({
  data,
  section,
  showFoundationExcavation = true,
  onToggleFoundationExcavation,
  filterDrainWorks
}: {
  data: CanalData
  section: CanalSection
  showFoundationExcavation?: boolean
  onToggleFoundationExcavation?: (show: boolean) => void
  /** Explicit rock-toe/drain works for a live preview. Saved works are used when omitted. */
  filterDrainWorks?: CanalFilterDrainReach[]
}): JSX.Element {
  const isTiered = data.design.bankConfig?.mode === 'tiered'
  const leftTier = isTiered ? canalSectionBankTier(data, section, 'left') : null
  const rightTier = isTiered ? canalSectionBankTier(data, section, 'right') : null
  const leftTreatment = leftTier?.foundationTreatment
  const rightTreatment = rightTier?.foundationTreatment
  const resolvedFilterDrainWorks = filterDrainWorks ?? data.filterDrainReaches.filter((row) => section.chainage >= row.fromChainage && section.chainage <= row.toChainage)
  const view = (() => {
    const design = canalDesignProfile(data, section)
    const rawGround = orderCanalPoints(section.ground)
    let ground = rawGround
    if (design.length >= 2 && rawGround.length >= 2) {
      const minDesign = design[0].offset
      const maxDesign = design[design.length - 1].offset
      const minGround = rawGround[0].offset
      const maxGround = rawGround[rawGround.length - 1].offset
      if (minDesign < minGround - 1e-6 || maxDesign > maxGround + 1e-6) {
        const leftExt = minDesign < minGround - 1e-6 ? [{ offset: minDesign, rl: rawGround[0].rl }] : []
        const rightExt = maxDesign > maxGround + 1e-6 ? [{ offset: maxDesign, rl: rawGround[rawGround.length - 1].rl }] : []
        ground = [...leftExt, ...rawGround, ...rightExt]
      }
    }
    const bands =
      design.length >= 2 && ground.length >= 2
        ? profileDifferenceBands(ground, design)
        : []
    const coreSection = canalHeartingSection(data, section)
    const hearting = coreSection.profiles
    const stripping = canalStrippingBands(data, section)
    const foundation = showFoundationExcavation ? canalFoundationExcavationBands(data, section) : []
    const bedRl = canalBedLevelAt(data, section.chainage)
    const strippingDepth = canalStrippingDepthAt(data, section.chainage)
    const autoFilterLengths = canalAutomaticFilterLengthsAtSection(data, section)
    const preparedProfiles = canalBundFootprintRanges(data, section).flatMap(([from, to]) => {
      const side = (from + to) / 2 < 0 ? 'left' as const : 'right' as const
      const groundProfile = profileBetween(ground, from, to)
      if (groundProfile.length < 2) return []
      return [{ side, from, to, points: groundProfile.map((point) => ({ ...point, rl: point.rl - strippingDepth })) }]
    })
    const sandBlankets = preparedProfiles.flatMap((prepared) => {
      const treatment = prepared.side === 'left' ? leftTreatment : rightTreatment
      if (!treatment || treatment.blanket === 'none') return []
      const thickness = treatment.blanket === '5-4' ? 0.25 : Math.max(0, treatment.blanketThickness)
      const impervious = hearting.find((profile) => profile.bank === prepared.side)
      const imperviousOffsets = impervious ? [...impervious.points, ...impervious.trench].map((point) => point.offset) : []
      const available = imperviousOffsets.length
        ? prepared.side === 'left'
          ? Math.max(0, Math.min(...imperviousOffsets) - prepared.from)
          : Math.max(0, prepared.to - Math.max(...imperviousOffsets))
        : prepared.to - prepared.from
      const requested = treatment.blanketWidthMode === 'automatic'
        ? available
        : prepared.side === 'left' ? treatment.blanketLeftWidth : treatment.blanketRightWidth
      const width = Math.min(available, Math.max(0, requested))
      const from = prepared.side === 'left' ? prepared.from : prepared.to - width
      const to = prepared.side === 'left' ? prepared.from + width : prepared.to
      const points = raisedBand(profileBetween(prepared.points, from, to), thickness)
      return points.length ? [{ side: prepared.side, kind: treatment.blanket, thickness, points }] : []
    })
    const horizontalFilters = preparedProfiles.flatMap((prepared) => {
      const treatment = prepared.side === 'left' ? leftTreatment : rightTreatment
      if (!treatment?.horizontalFilter || !(treatment.filterThickness > 0)) return []
      const impervious = hearting.find((profile) => profile.bank === prepared.side)
      const imperviousOffsets = impervious ? [...impervious.points, ...impervious.trench].map((point) => point.offset) : []
      const available = imperviousOffsets.length
        ? prepared.side === 'left'
          ? Math.max(0, Math.min(...imperviousOffsets) - prepared.from)
          : Math.max(0, prepared.to - Math.max(...imperviousOffsets))
        : prepared.to - prepared.from
      const requested = treatment.filterLengthMode === 'automatic'
        ? autoFilterLengths[prepared.side]
        : prepared.side === 'left' ? treatment.filterLeftLength : treatment.filterRightLength
      const width = Math.min(available, Math.max(0, requested))
      const from = prepared.side === 'left' ? prepared.from : prepared.to - width
      const to = prepared.side === 'left' ? prepared.from + width : prepared.to
      const blanketThickness = treatment.blanket === 'none' ? 0 : treatment.blanket === '5-4' ? 0.25 : Math.max(0, treatment.blanketThickness)
      const base = profileBetween(prepared.points, from, to).map((point) => ({ ...point, rl: point.rl + blanketThickness }))
      const points = raisedBand(base, treatment.filterThickness)
      return points.length ? [{ side: prepared.side, thickness: treatment.filterThickness, points }] : []
    })
    const fsl = bedRl == null ? null : bedRl + data.design.fullSupplyDepth
    const chimneyFilters = horizontalFilters.flatMap((filter) => {
      const treatment = filter.side === 'left' ? leftTreatment : rightTreatment
      if (!treatment?.rockToe || (treatment.rockToeSide !== 'both' && treatment.rockToeSide !== filter.side)) return []
      const offsets = filter.points.map((point) => point.offset)
      const inner = filter.side === 'left' ? Math.max(...offsets) : Math.min(...offsets)
      const width = Math.min(Math.max(0, treatment.rockToeWidth), Math.max(...offsets) - Math.min(...offsets))
      const from = filter.side === 'left' ? inner - width : inner
      const to = filter.side === 'left' ? inner : inner + width
      const base = Math.max(...filter.points.filter((point) => point.offset === inner).map((point) => point.rl))
      const height = treatment.rockToeHeight > 0 ? treatment.rockToeHeight : Math.max(0, (fsl ?? base) - base)
      const points = [{ offset: from, rl: base }, { offset: to, rl: base }, { offset: to, rl: base + height }, { offset: from, rl: base + height }]
      return height > 0 && width > 0 ? [{ side: filter.side, points }] : []
    })
    const roads = canalServiceRoadSegments(data, section)
    const leftToe = design[0]
    const rightToe = design[design.length - 1]
    const externalWorks = leftToe && rightToe ? resolvedFilterDrainWorks.flatMap((work) => {
      const requestedSides: Array<'left' | 'right' | 'bed'> = work.kind === '5-9' && work.plugLocations
        ? work.plugLocations
        : work.side === 'both' ? ['left', 'right'] : [work.side]
      return requestedSides.map((side) => {
        const width = work.kind === '5-9' || work.kind === '5-8' ? 0.6 : Math.max(0.05, work.width)
        const depth = Math.max(0.05, work.kind === '5-9' || work.kind === '5-8' ? 0.75 : work.kind === '5-12' || work.kind === '5-13' ? 0.2 : work.depth)
        const rockToe = work.kind === '5-6'
        const rockToeFilter = work.kind === '5-11'
        const bedOffset = work.offsetMode === 'left'
          ? -Math.max(0, data.design.bedWidth / 4)
          : work.offsetMode === 'right'
            ? Math.max(0, data.design.bedWidth / 4)
            : work.offsetMode === 'custom' ? (work.offset ?? 0) : 0
        const anchor = side === 'left' ? leftToe : side === 'right' ? rightToe : { offset: bedOffset, rl: bedRl ?? Math.min(leftToe.rl, rightToe.rl) }
        const outerSlope = side === 'left' ? data.design.leftBankOuterSlope : data.design.rightBankOuterSlope
        const crest = Math.max(0, work.rockToeTopWidth ?? 0)
        const innerSlope = Math.max(0, work.rockToeInnerSlope ?? 1)
        const outerRun = Math.max(0, outerSlope) * depth
        const innerRun = innerSlope * depth
        const rockToeBaseWidth = outerRun + crest + innerRun
        const innerBaseOffset = side === 'left' ? anchor.offset + rockToeBaseWidth : anchor.offset - rockToeBaseWidth
        const innerCrestOffset = side === 'left' ? anchor.offset + outerRun + crest : anchor.offset - outerRun - crest
        const innerFaceLength = Math.hypot(depth, innerRun) || 1
        const behindDx = (side === 'left' ? 1 : -1) * depth / innerFaceLength * 0.5
        const behindDy = innerRun / innerFaceLength * 0.5
        const points: CanalPoint[] = rockToe
          ? side === 'left'
            ? [{ offset: anchor.offset, rl: anchor.rl }, { offset: anchor.offset + rockToeBaseWidth, rl: anchor.rl }, { offset: anchor.offset + outerRun + crest, rl: anchor.rl + depth }, { offset: anchor.offset + outerRun, rl: anchor.rl + depth }]
            : [{ offset: anchor.offset - rockToeBaseWidth, rl: anchor.rl }, { offset: anchor.offset, rl: anchor.rl }, { offset: anchor.offset - outerRun, rl: anchor.rl + depth }, { offset: anchor.offset - outerRun - crest, rl: anchor.rl + depth }]
          : rockToeFilter
            ? side === 'left'
              ? [{ offset: anchor.offset, rl: anchor.rl }, { offset: anchor.offset + rockToeBaseWidth, rl: anchor.rl }, { offset: anchor.offset + rockToeBaseWidth, rl: anchor.rl - 1 }, { offset: anchor.offset, rl: anchor.rl - 1 }]
              : [{ offset: anchor.offset - rockToeBaseWidth, rl: anchor.rl }, { offset: anchor.offset, rl: anchor.rl }, { offset: anchor.offset, rl: anchor.rl - 1 }, { offset: anchor.offset - rockToeBaseWidth, rl: anchor.rl - 1 }]
          : side === 'left'
            ? [{ offset: anchor.offset - width, rl: anchor.rl }, { offset: anchor.offset, rl: anchor.rl }, { offset: anchor.offset, rl: anchor.rl - depth }, { offset: anchor.offset - width, rl: anchor.rl - depth }]
            : side === 'right'
              ? [{ offset: anchor.offset, rl: anchor.rl }, { offset: anchor.offset + width, rl: anchor.rl }, { offset: anchor.offset + width, rl: anchor.rl - depth }, { offset: anchor.offset, rl: anchor.rl - depth }]
              : [{ offset: -width / 2, rl: anchor.rl }, { offset: width / 2, rl: anchor.rl }, { offset: width / 2, rl: anchor.rl - depth }, { offset: -width / 2, rl: anchor.rl - depth }]
        const secondaryPoints: CanalPoint[] | null = rockToeFilter
          ? [
              { offset: innerBaseOffset, rl: anchor.rl },
              { offset: innerCrestOffset, rl: anchor.rl + depth },
              { offset: innerCrestOffset + behindDx, rl: anchor.rl + depth + behindDy },
              { offset: innerBaseOffset + behindDx, rl: anchor.rl + behindDy }
            ]
          : null
        return { id: `${work.id}-${side}`, kind: work.kind, side, rockToe, rockToeFilter, points, secondaryPoints }
      })
    }) : []
    const all = [
      ...design,
      ...ground,
      ...bands.flatMap((band) => band.points),
      ...hearting.flatMap((profile) => [...profile.points, ...profile.trench]),
      ...stripping.flat()
      , ...foundation.flat()
      , ...sandBlankets.flatMap((blanket) => blanket.points)
      , ...horizontalFilters.flatMap((filter) => filter.points)
      , ...chimneyFilters.flatMap((filter) => filter.points)
      , ...externalWorks.flatMap((work) => work.points)
      , ...externalWorks.flatMap((work) => work.secondaryPoints ?? [])
      , ...roads.flatMap((road) => [{ offset: road.fromOffset, rl: road.level }, { offset: road.toOffset, rl: road.level }])
    ]
    if (all.length < 2) return null
    const offsets = all.map((p) => p.offset)
    const rls = all.map((p) => p.rl)
    let minX = Math.min(...offsets)
    let maxX = Math.max(...offsets)
    let minRl = Math.min(...rls)
    let maxRl = Math.max(...rls)
    if (maxX - minX < 0.5) {
      minX -= 1
      maxX += 1
    }
    if (maxRl - minRl < 0.5) {
      minRl -= 0.5
      maxRl += 0.5
    }

    const rawSpanX = maxX - minX
    const rawSpanY = maxRl - minRl

    // Generous breathing margins so diagram never clips or touches borders
    const padX = Math.max(1.5, rawSpanX * 0.08)
    // Extra top padding (16%) gives headroom so the readout text doesn't overlap cut hatching
    const padYTop = Math.max(1.2, rawSpanY * 0.16)
    const padYBottom = Math.max(0.6, rawSpanY * 0.08)

    minX -= padX
    maxX += padX
    minRl -= padYBottom
    maxRl += padYTop

    const usableW = WIDTH - PAD_LEFT - PAD_RIGHT
    const usableH = HEIGHT - PAD_TOP - PAD_BOTTOM
    const spanX = maxX - minX
    const spanY = maxRl - minRl
    const toX = (offset: number): number => PAD_LEFT + ((offset - minX) / spanX) * usableW
    const toY = (rl: number): number => PAD_TOP + usableH - ((rl - minRl) / spanY) * usableH
    return {
      design,
      ground,
      bands,
      hearting,
      stripping,
      preparedProfiles,
      foundation,
      sandBlankets,
      horizontalFilters,
      chimneyFilters,
      roads,
      coreErrors: coreSection.errors,
      coreTrenches: coreSection.trenches,
      combinedTrench: coreSection.combinedTrench,
      coreOverlap: coreSection.overlap,
      externalWorks,
      toX,
      toY,
      minX,
      maxX,
      minRl,
      maxRl,
      gridX: niceTicks(minX, maxX, 7),
      gridY: niceTicks(minRl, maxRl, 6),
      exaggeration: usableH / spanY / (usableW / spanX)
    }
  })()

  const areas = (canalSectionAreas(data, section))
  const foundationArea = view?.foundation.reduce((sum, points) => sum + polygonArea(points), 0) ?? 0
  const bed = canalBedLevelAt(data, section.chainage)
  const hydraulicLevels = bed == null ? null : {
    fsl: bed + data.design.fullSupplyDepth,
    top: bed + data.design.fullSupplyDepth + data.design.freeBoard,
    halfBed: data.design.bedWidth / 2,
    halfFsl: data.design.bedWidth / 2 + data.design.sideSlope * data.design.fullSupplyDepth,
    halfTop: data.design.bedWidth / 2 + data.design.sideSlope * (data.design.fullSupplyDepth + data.design.freeBoard)
  }

  if (!view) {
    return (
      <div className="canal-diagram-empty">
        Enter the ground level and populate this chainage to draw the canal section.
      </div>
    )
  }

  const m: Mapped = { toX: view.toX, toY: view.toY }
  const hasGround = view.ground.length >= 2
  const hasDesign = view.design.length >= 2

  return (
    <>
    {view.hearting.length > 0 && <div className="canal-bank-recommendation"><strong>{data.design.heartingConnection === 'continuous' ? (view.coreOverlap.length ? 'Continuous core beneath bed' : 'Continuous mode — cores do not meet at this section') : (view.coreOverlap.length ? 'Design conflict: separate cores overlap' : 'Separate bank cores')}</strong>{view.combinedTrench && <span> · One connected cutoff trench</span>}</div>}
    <svg
      className="canal-diagram"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={`Canal cross-section at chainage ${formatChainage(section.chainage)}`}
    >
      <defs>
        <pattern
          id="canal-hatch-cut"
          width="7"
          height="7"
          patternTransform="rotate(45)"
          patternUnits="userSpaceOnUse"
        >
          <rect width="7" height="7" className="canal-hatch-cut-bg" />
          <line x1="0" y1="0" x2="0" y2="7" className="canal-hatch-cut-line" />
        </pattern>
        <pattern
          id="canal-hatch-fill"
          width="7"
          height="7"
          patternTransform="rotate(-45)"
          patternUnits="userSpaceOnUse"
        >
          <line x1="0" y1="0" x2="0" y2="7" className="canal-hatch-fill-line" />
        </pattern>
        <pattern
          id="canal-hatch-hearting"
          width="7"
          height="7"
          patternTransform="rotate(45)"
          patternUnits="userSpaceOnUse"
        >
          <rect width="7" height="7" className="canal-hearting-pattern-bg" />
          <line x1="0" y1="0" x2="0" y2="7" className="canal-hatch-hearting-line" />
        </pattern>
        <pattern id="canal-foundation-fill-5-1" width="9" height="9" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.5" fill="#e6b85c"/><circle cx="7" cy="6" r="2" fill="#9b8357"/></pattern>
        <pattern id="canal-foundation-fill-5-2" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line y2="7" stroke="#f2d27a" strokeWidth="2"/></pattern>
        <pattern id="canal-foundation-fill-5-3" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M0 8 L4 3 L8 8" fill="none" stroke="#b87942" strokeWidth="2"/><circle cx="8" cy="2" r="1" fill="#d99b55"/></pattern>
        <pattern id="canal-sand-blanket-5-4" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#164e45" opacity=".7"/><circle cx="2" cy="2" r="1" fill="#6ee7b7"/><circle cx="6" cy="5" r="1" fill="#6ee7b7"/></pattern>
        <pattern id="canal-sand-blanket-5-5" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#164e45" opacity=".7"/><line y2="8" stroke="#6ee7b7" strokeWidth="2"/></pattern>
        <pattern id="canal-horizontal-filter" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#164e63" opacity=".72"/><path d="M0 7 L7 0 M4 8 L8 4" stroke="#67e8f9" strokeWidth="1.4"/></pattern>
        <pattern id="canal-chimney-filter" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#164e63" opacity=".75"/><circle cx="2" cy="2" r="1.2" fill="#a5f3fc"/><circle cx="6" cy="6" r="1.2" fill="#a5f3fc"/></pattern>
        <pattern id="canal-rocktoe-work" width="9" height="9" patternUnits="userSpaceOnUse"><rect width="9" height="9" fill="#594a32"/><circle cx="2" cy="2" r="1.8" fill="#d6a85f"/><circle cx="7" cy="6" r="2.1" fill="#9f7841"/></pattern>
        <pattern id="canal-rocktoe-filter-work" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#4d4638"/><path d="M0 8 L8 0 M4 8 L8 4" stroke="#f8cf72" strokeWidth="1.2"/></pattern>
        <pattern id="canal-drainage-work" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#123f4c"/><circle cx="2" cy="2" r="1.2" fill="#67e8f9"/><circle cx="6" cy="6" r="1.2" fill="#2dd4bf"/></pattern>
        <marker id="canal-filter-arrow" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="#67e8f9"/></marker>
      </defs>

      <g className="canal-diagram-grid">
        <rect
          x={PAD_LEFT}
          y={PAD_TOP}
          width={WIDTH - PAD_LEFT - PAD_RIGHT}
          height={HEIGHT - PAD_TOP - PAD_BOTTOM}
          className="canal-diagram-frame"
        />
        {view.gridY.map((rl) => (
          <g key={`rl-${rl}`}>
            <line
              x1={PAD_LEFT}
              y1={view.toY(rl)}
              x2={WIDTH - PAD_RIGHT}
              y2={view.toY(rl)}
              className="canal-diagram-gridline"
            />
            <text x={PAD_LEFT - 8} y={view.toY(rl) + 4} className="canal-diagram-tick" textAnchor="end">
              {f2(rl)}
            </text>
          </g>
        ))}
        {view.gridX.map((offset) => (
          <g key={`off-${offset}`}>
            <line
              x1={view.toX(offset)}
              y1={PAD_TOP}
              x2={view.toX(offset)}
              y2={HEIGHT - PAD_BOTTOM}
              className="canal-diagram-gridline"
            />
            <text
              x={view.toX(offset)}
              y={HEIGHT - PAD_BOTTOM + 16}
              className="canal-diagram-tick"
              textAnchor="middle"
            >
              {f2(offset)}
            </text>
          </g>
        ))}
      </g>

      {view.bands.map((band, index) => (
        <polygon
          key={`band-${index}`}
          className={band.cutting ? 'canal-diagram-band-cut' : 'canal-diagram-band-fill'}
          points={band.points.map((p) => `${view.toX(p.offset)},${view.toY(p.rl)}`).join(' ')}
        />
      ))}

      {view.stripping.length > 0 && (
        <g>
          {view.preparedProfiles.map((profile) => <g key={`prepared-${profile.side}`}><path d={linePath(profile.points, m)} className="canal-diagram-stripping-line" fill="none"/><text x={view.toX((profile.from + profile.to) / 2)} y={view.toY(Math.min(...profile.points.map((point) => point.rl))) + 11} textAnchor="middle" className="canal-diagram-stripping-label">Prepared level −{f2(data.strippingDepth)} m</text></g>)}
        </g>
      )}

      {view.foundation.length > 0 && (
        <g>
          {view.foundation.map((points, index) => <polygon key={`foundation-${index}`} className="canal-diagram-foundation-excavation" points={points.map((p) => `${view.toX(p.offset)},${view.toY(p.rl)}`).join(' ')} />)}
          <text x={view.toX(0)} y={view.toY(Math.min(...view.foundation.flat().map((point) => point.rl))) + 11} textAnchor="middle" className="canal-diagram-foundation-label">
            Canal foundation excavation · Bottom RL {f2(canalFoundationRlAt(data, section.chainage) ?? 0)} m
          </text>
        </g>
      )}
      {view.sandBlankets.length > 0 && <g>{view.sandBlankets.map((blanket, index) => { const centre = blanket.points.reduce((sum, point) => sum + point.offset, 0) / blanket.points.length; return <g key={`sand-blanket-${index}`}><polygon points={blanket.points.map((p) => `${view.toX(p.offset)},${view.toY(p.rl)}`).join(' ')} fill={`url(#canal-sand-blanket-${blanket.kind})`} stroke="#67d7b7" strokeWidth="1.5"/><text x={view.toX(centre)} y={view.toY(Math.max(...blanket.points.map((point) => point.rl))) - 7} textAnchor="middle" className="canal-diagram-foundation-label">{blanket.side === 'left' ? 'Left' : 'Right'} sand blanket · {f2(blanket.thickness)} m</text></g> })}</g>}
      {view.horizontalFilters.length > 0 && <g>{view.horizontalFilters.map((filter, index) => { const centre = filter.points.reduce((sum, point) => sum + point.offset, 0) / filter.points.length; return <g key={`horizontal-filter-${index}`}><polygon points={filter.points.map((p) => `${view.toX(p.offset)},${view.toY(p.rl)}`).join(' ')} fill="url(#canal-horizontal-filter)" stroke="#22d3ee" strokeWidth="1.5"/><text x={view.toX(centre)} y={view.toY(Math.max(...filter.points.map((point) => point.rl))) - 7} textAnchor="middle" className="canal-diagram-fsl-label">Horizontal filter · {f2(filter.thickness)} m</text></g> })}</g>}
      {view.chimneyFilters.length > 0 && <g>{view.chimneyFilters.map((filter, index) => {
        const points = filter.points
        const centre = (points[0].offset + points[1].offset) / 2
        const prepared = view.preparedProfiles.find((profile) => profile.side === filter.side)
        const outlet = filter.side === 'left' ? prepared?.from ?? centre : prepared?.to ?? centre
        const midRl = points[0].rl + (points[2].rl - points[0].rl) * 0.55
        return <g key={`chimney-filter-${index}`}><polygon points={points.map((p) => `${view.toX(p.offset)},${view.toY(p.rl)}`).join(' ')} fill="url(#canal-chimney-filter)" stroke="#22d3ee" strokeWidth="1.5"/><path d={`M ${view.toX(centre)} ${view.toY(points[2].rl)+3} L ${view.toX(centre)} ${view.toY(points[0].rl)-2} L ${view.toX(outlet)} ${view.toY(points[0].rl)-2}`} fill="none" stroke="#67e8f9" strokeWidth="1.7" markerEnd="url(#canal-filter-arrow)"/><text x={view.toX(centre)} y={view.toY(midRl)} className="canal-diagram-foundation-label" textAnchor="middle">Chimney</text></g>
      })}</g>}

      {view.coreTrenches.map((points, index) => <polygon key={`core-trench-${index}`} className="canal-diagram-hearting-trench" points={points.map((p) => `${view.toX(p.offset)},${view.toY(p.rl)}`).join(' ')} />)}
      {view.hearting.map((profile) => (
        <g key={`hearting-${profile.bank}`} className="canal-diagram-hearting">
          {(profile.pieces ?? [profile.points]).map((points, index) => <polygon key={index} className="canal-diagram-hearting-zone" style={{ stroke: 'none' }} points={points.map((p) => `${view.toX(p.offset)},${view.toY(p.rl)}`).join(' ')} />)}
          {(data.design.heartingConnection !== 'continuous' || view.coreErrors.length > 0 || !view.coreOverlap.length) && <polygon fill="none" stroke={view.coreErrors.length ? '#f59e0b' : '#93c5fd'} strokeWidth="1.2" strokeDasharray="4 3" points={profile.points.map((p) => `${view.toX(p.offset)},${view.toY(p.rl)}`).join(' ')} />}
          <text
            x={view.toX((profile.points[1].offset + profile.points[2].offset) / 2)}
            y={view.toY(profile.level.topRl) - 5}
            textAnchor="middle"
            className="canal-diagram-hearting-label"
          >
            {profile.bank === 'left' ? 'Left' : 'Right'} hearting · Top RL {f2(profile.level.topRl)}
          </text>
        </g>
      ))}

      {data.design.heartingConnection !== 'continuous' && view.coreOverlap.map((points, index) => <polygon key={`core-overlap-${index}`} points={points.map((p) => `${view.toX(p.offset)},${view.toY(p.rl)}`).join(' ')} fill="#ef4444" fillOpacity="0.55" stroke="none" />)}

      {hasDesign && hydraulicLevels && (
        <g className="canal-diagram-hydraulic-levels">
          <polygon
            className="canal-diagram-water"
            points={[
              `${view.toX(-hydraulicLevels.halfBed)},${view.toY(bed ?? 0)}`,
              `${view.toX(hydraulicLevels.halfBed)},${view.toY(bed ?? 0)}`,
              `${view.toX(hydraulicLevels.halfFsl)},${view.toY(hydraulicLevels.fsl)}`,
              `${view.toX(-hydraulicLevels.halfFsl)},${view.toY(hydraulicLevels.fsl)}`
            ].join(' ')}
          />
          <line
            x1={view.toX(-hydraulicLevels.halfFsl)}
            y1={view.toY(hydraulicLevels.fsl)}
            x2={view.toX(hydraulicLevels.halfFsl)}
            y2={view.toY(hydraulicLevels.fsl)}
            className="canal-diagram-fsl-line"
          />
          <text x={view.toX(0)} y={view.toY(hydraulicLevels.fsl) - 6} textAnchor="middle" className="canal-diagram-fsl-label">
            FSL {f2(hydraulicLevels.fsl)} m · FSD {f2(data.design.fullSupplyDepth)} m
          </text>
          <line
            x1={view.toX(-hydraulicLevels.halfTop)}
            y1={view.toY(hydraulicLevels.top)}
            x2={view.toX(hydraulicLevels.halfTop)}
            y2={view.toY(hydraulicLevels.top)}
            className="canal-diagram-freeboard-line"
          />
          <text x={view.toX(0)} y={view.toY(hydraulicLevels.top) - 6} textAnchor="middle" className="canal-diagram-freeboard-label">
            Bank Top RL {f2(hydraulicLevels.top)} m · Freeboard {f2(data.design.freeBoard)} m
          </text>
        </g>
      )}

      {hasGround && (
        <path d={linePath(view.ground, m)} className="canal-diagram-ground" fill="none" />
      )}
      {hasDesign && (
        <path d={linePath(view.design, m)} className="canal-diagram-design" fill="none" />
      )}

      {view.externalWorks.map((work) => <g key={work.id}>
        <polygon points={work.points.map((point) => `${view.toX(point.offset)},${view.toY(point.rl)}`).join(' ')} fill={work.rockToe ? 'url(#canal-rocktoe-work)' : work.rockToeFilter ? 'url(#canal-rocktoe-filter-work)' : 'url(#canal-drainage-work)'} stroke={work.rockToe || work.rockToeFilter ? '#f59e0b' : '#22d3ee'} strokeWidth="1.8" />
        {work.secondaryPoints && <polygon points={work.secondaryPoints.map((point) => `${view.toX(point.offset)},${view.toY(point.rl)}`).join(' ')} fill="url(#canal-rocktoe-filter-work)" stroke="#f59e0b" strokeWidth="1.8" />}
        <text x={view.toX(work.points.reduce((sum, point) => sum + point.offset, 0) / work.points.length)} y={view.toY(Math.max(...work.points.map((point) => point.rl))) - 6} textAnchor="middle" className={work.rockToe || work.rockToeFilter ? 'canal-diagram-rocktoe-label' : 'canal-diagram-drainage-label'}>{work.rockToe ? 'Rock toe' : work.rockToeFilter ? 'Filter bed · 1.00 m' : work.kind === '5-9' ? 'Local filter + Ø100 plug' : work.kind === '5-8' ? 'Bed drain' : work.kind === '5-12' || work.kind === '5-13' ? 'Fabric + aggregate toe drain' : 'Graded toe drain'}</text>
        {work.secondaryPoints && <text x={view.toX(work.secondaryPoints.reduce((sum, point) => sum + point.offset, 0) / work.secondaryPoints.length)} y={view.toY(work.secondaryPoints.reduce((sum, point) => sum + point.rl, 0) / work.secondaryPoints.length)} textAnchor="middle" className="canal-diagram-rocktoe-label">Back filter · 0.50 m</text>}
      </g>)}

      {view.roads.map((road) => (
        <g key={road.id} className="canal-diagram-road">
          <line x1={view.toX(road.fromOffset)} y1={view.toY(road.level)} x2={view.toX(road.toOffset)} y2={view.toY(road.level)} className="canal-diagram-road-platform" />
          <line x1={view.toX(road.fromOffset + road.shoulderWidth)} y1={view.toY(road.level) - 4} x2={view.toX(road.fromOffset + road.shoulderWidth)} y2={view.toY(road.level) + 4} className="canal-diagram-road-shoulder" />
          <line x1={view.toX(road.toOffset - road.shoulderWidth)} y1={view.toY(road.level) - 4} x2={view.toX(road.toOffset - road.shoulderWidth)} y2={view.toY(road.level) + 4} className="canal-diagram-road-shoulder" />
          <text x={view.toX((road.fromOffset + road.toOffset) / 2)} y={view.toY(road.level) - 8} textAnchor="middle" className="canal-diagram-road-label">{road.side === 'left' ? 'Left' : 'Right'} road {f2(road.carriagewayWidth)} m + shoulders</text>
        </g>
      ))}

      {hasDesign && bed != null && (
        <g className="canal-diagram-labels">
          <text x={view.toX(0)} y={view.toY(bed) - 8} textAnchor="middle" className="canal-diagram-label">
            Centre-line 0 · Bed RL {f2(bed)} · B = {f2(data.design.bedWidth)} m
          </text>
        </g>
      )}

      <g className="canal-diagram-readout">
        <text x={PAD_LEFT + 6} y={PAD_TOP + 16} className="canal-diagram-readout-title">
          {hasGround && hasDesign
            ? `Cutting ${f2(areas.cutting)} m² · Filling ${f2(areas.filling)} m²`
            : hasGround
              ? 'Ground entered — populate the canal design to measure'
              : 'Enter ground levels to measure cutting and filling'}
        </text>
        <text x={PAD_LEFT + 6} y={PAD_TOP + 30} className="canal-diagram-readout-sub">
          {view.foundation.length > 0
            ? `Foundation excavation ${f2(foundationArea)} m² · below bank footprint only`
            : data.flowDirection
              ? `Water flows ${canalFlowLabel(data.flowDirection)} · vertical ×${f2(view.exaggeration)}`
              : `Water flow direction not set · vertical ×${f2(view.exaggeration)}`}
        </text>
      </g>

      <g className="canal-diagram-excavation-legend" aria-label="Excavation colour legend">
        <rect x={PAD_LEFT + 6} y={HEIGHT - 19} width="14" height="8" className="canal-diagram-band-cut" />
        <text x={PAD_LEFT + 25} y={HEIGHT - 11}>Canal excavation</text>
        {(showFoundationExcavation || onToggleFoundationExcavation) && <g
          className={`canal-diagram-foundation-toggle${onToggleFoundationExcavation ? ' is-interactive' : ''}`}
          role={onToggleFoundationExcavation ? 'checkbox' : undefined}
          aria-checked={onToggleFoundationExcavation ? showFoundationExcavation : undefined}
          tabIndex={onToggleFoundationExcavation ? 0 : undefined}
          onClick={() => onToggleFoundationExcavation?.(!showFoundationExcavation)}
          onKeyDown={(event) => {
            if (onToggleFoundationExcavation && (event.key === 'Enter' || event.key === ' ')) {
              event.preventDefault()
              onToggleFoundationExcavation(!showFoundationExcavation)
            }
          }}
        >
          <rect x={PAD_LEFT + 145} y={HEIGHT - 21} width="12" height="12" rx="1" className="canal-diagram-foundation-checkbox" />
          {showFoundationExcavation && <path d={`M ${PAD_LEFT + 148} ${HEIGHT - 15} l 3 3 l 5 -7`} className="canal-diagram-foundation-check" />}
          <rect x={PAD_LEFT + 164} y={HEIGHT - 19} width="14" height="8" className="canal-diagram-foundation-excavation" />
          <text x={PAD_LEFT + 183} y={HEIGHT - 11}>{onToggleFoundationExcavation ? 'Show canal foundation excavation' : 'Canal foundation excavation under banks'}</text>
        </g>}
      </g>
    </svg>
    {view.hearting.length > 0 && <p className="settings-note">{data.design.heartingConnection === 'continuous' && view.coreOverlap.length && !view.coreErrors.length ? 'The filled core is one connected soil zone. Internal crossing lines are removed; shared soil is counted once.' : 'Dashed outline: entered core width and slopes. Red fill marks overlap that conflicts with separate bank cores.'}</p>}
    {view.combinedTrench && <p className="settings-note">One continuous cutoff trench spans beneath the connected cores and canal bed. The full span is included in excavation once.</p>}
    {view.coreErrors.map((error) => <p className="canal-road-warning" role="status" key={error}>{error} Hearting and casing quantities at this section remain pending.</p>)}
    </>
  )
}
