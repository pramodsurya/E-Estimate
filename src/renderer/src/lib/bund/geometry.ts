// Bund component template: cross-section areas per chainage, Mean Sectional
// Area quantities, and the sync that writes computed measurement into ordinary
// item children (so totals and every print keep working).
//
// Both reference estimates this was built from reduce to the same engine:
//   area per chainage → mean area with the previous chainage → × length
// A "new" bund derives its area from design parameters; a restoration derives
// it from surveyed level tables. Only the area step differs.

import type {
  BundBerm,
  BundBermSide,
  BundData,
  BundDesign,
  BundExcavationBands,
  BundExcavationRole,
  BundFillBasis,
  BundHeartingTrench,
  BundItemRole,
  BundMaterialItem,
  BundPoint,
  BundSection,
  BundSoilBand,
  BundToe,
  ItemSource,
  ProjectNode,
  TemplateMaterialRef
} from '../../types/project'
import { createNode, findNode, newId, patchNode, removeNode } from '../tree'

import { round3 } from './math'
import {
  type BundQtyRow,
  bundNetStrippingBands,
  orderedSections,
  proposedToeOffsets,
  quantityRowsBySection,
  rockToeAreaAt,
  toeDrainTopWidthAt,
  upstreamToeTrenchEnabled
} from './quantities'
import {
  BUND_CHAIN_M,
  BUND_DEFAULT_CLEARANCE_CODE,
  BUND_DEFAULT_STRIPPING_CODE,
  BUND_EXC_ALL_SOILS_CODE,
  BUND_EXC_HDR_CODE,
  BUND_EXC_FF_CODE,
  BUND_EXC_HR_CODE,
  BUND_CHANNEL_EXC_ALL_SOILS_CODE,
  BUND_CHANNEL_EXC_HDR_CODE,
  BUND_CHANNEL_EXC_FF_CODE,
  BUND_CHANNEL_EXC_HR_CODE,
  BUND_DEFAULT_FORMATION_CODE,
  BUND_SPLIT_FORMATION_CODE,
  BUND_SPLIT_ROLLING_CODE,
  BUND_ZONED_DAW_HEARTING_CODE,
  BUND_ZONED_DAW_CASING_CODE,
  BUND_ZONED_PMW_BORROW_HEARTING_CODE,
  BUND_ZONED_PMW_BORROW_CASING_CODE,
  BUND_ZONED_PMW_DUMP_HEARTING_CODE,
  BUND_ZONED_PMW_DUMP_CASING_CODE,
  BUND_HEARTING_TRENCH_FILL_CODE,
  BUND_DEFAULT_TURFING_CODE,
  BUND_DEFAULT_FREEBOARD,
  BUND_DEFAULT_PITCHING_CODE,
  BUND_DAW_REVETMENT_OPTIONS,
  BUND_DAW_REVETMENT_CODES,
  revetmentOptionForCode,
  BUND_DEFAULT_PITCHING_BEDDING_CODE,
  BUND_DEFAULT_ROCKTOE_CODE,
  BUND_DEFAULT_ROCKTOE_FILTER_CODE,
  BUND_DEFAULT_HFILTER_CODE,
  BUND_DEFAULT_VFILTER_CODE,
  BUND_ROCKTOE_FILTER_BEHIND_M,
  BUND_ROCKTOE_FILTER_BELOW_M,
  BUND_DEFAULT_TOE_EXC_CODE,
  BUND_DEFAULT_FOUNDATION_EXC_CODE,
  BUND_DEFAULT_UPSTREAM_TOE_BUILD_CODE,
  BUND_UPSTREAM_TOE_MASONRY_CODE,
  BUND_DEFAULT_TOE_BUILD_CODE,
  BUND_DEFAULT_TOE_CC_CODE,
  BUND_DEFAULT_CHUTE_EXC_CODE,
  BUND_DEFAULT_CHUTE_LINING_CODE,
  BUND_DEFAULT_CHUTE_STONE_CODE,
  BUND_BERM_MIN_WIDTH,
  BUND_DEFAULT_BERM_WIDTH,
  BUND_DEFAULT_BERM_DROP,
  BUND_BERM_HEIGHT_TRIGGER,
  BUND_DEFAULT_BERM_CROSS_FALL,
  BUND_DEFAULT_BERM_TURF_CODE,
  BUND_DEFAULT_BERM_MURUM_CODE,
  BUND_DEFAULT_BERM_CC_CODE,
  BUND_DEFAULT_BERM_DRAIN_EXC_CODE,
  BUND_DEFAULT_BERM_DRAIN_LINING_CODE,
  BUND_DEFAULT_BERM_DRAIN_STONE_CODE,
  defaultBundExcavationRows,
  defaultBundExcavationBands,
  normalizeChannelExcavationRows,
  normalizeFoundationExcavationRows,
  withStrippingExcavationFamily,
  defaultBundHeartingTrench,
  defaultBundToe,
  BUND_DETAIL_SUFFIX,
  bundDetailId,
  parseBundDetailId,
  defaultBundDesign,
  bundSlopeFractions,
  parseBundSlopePart,
  parseBundSlope,
  defaultBundBerm,
  standardTankBundDims,
  designedFromTankLevels,
  standardHeartingTrenchDepth,
  topLevelFromFreeBoard,
  usesFreeBoardDesign,
  BundZonedSsrCodePair,
  zonedSsrCodePair,
  defaultBundData,
  migrateBundDesign,
  migrateBundData,
  toDisplayChainage,
  fromDisplayChainage,
  chainageUnitLabel,
  formatChainage
} from './configuration'

// Cross-section areas.
// ---------------------------------------------------------------------------

/**
 * Area under a surveyed profile, reduced to `datum`, by the trapezoidal rule
 * over consecutive offset pairs — the same arithmetic the survey sheets do
 * cell by cell: ((RL₁ + RL₂)/2 − datum) × Δoffset.
 *
 * Points are sorted by offset first, so a table entered out of order still
 * gives the right answer instead of a silently negative strip.
 */
export function profileArea(points: BundPoint[], datum: number): number {
  if (points.length < 2) return 0
  const sorted = [...points].sort((a, b) => a.offset - b.offset)
  let area = 0
  for (let i = 1; i < sorted.length; i += 1) {
    const a = sorted[i - 1]
    const b = sorted[i]
    area += ((a.rl - datum + (b.rl - datum)) / 2) * (b.offset - a.offset)
  }
  return area
}

/** Replace or add explicitly overridden points in an otherwise automatic profile. */
export function mergeProfileOverrides(base: BundPoint[], overrides?: BundPoint[]): BundPoint[] {
  if (!overrides?.length) return base
  const merged = new Map(base.map((point) => [round3(point.offset), { ...point }]))
  for (const point of overrides) merged.set(round3(point.offset), { ...point })
  return [...merged.values()].sort((a, b) => a.offset - b.offset)
}

/**
 * Automatic excavation level at one offset.
 *
 * Ordinary seating removes `stripDepth`. Where the surveyed ground stands
 * above the fixed bund design, the excavation continues down to the design
 * instead of lifting the design to suit the ground. This leaves no formation
 * fill at that offset when formation is measured from existing ground.
 */
export function automaticStrippedLevelAt(
  existingRl: number,
  proposedRl: number,
  design: BundDesign
): number {
  return existingRl > proposedRl + 1e-9
    ? proposedRl
    : existingRl - design.stripDepth
}

/**
 * The effective stripped/excavated surface within the proposed bund footprint.
 * It is sampled at every ground/design break point so both the diagram and the
 * quantity engine see the same section-specific cut.
 */
export function strippedProfile(section: BundSection, design: BundDesign): BundPoint[] {
  // A stored full profile is retained for imported/legacy projects. New edits
  // are sparse overrides so every other point keeps following stripDepth.
  let base: BundPoint[]
  if (section.stripped && section.stripped.length >= 2) {
    base = section.stripped
  } else if ((section.pre?.length ?? 0) >= 2) {
    const proposed = projectedProfile(section, design)
    if (proposed.length >= 2) {
      const minOffset = proposed[0].offset
      const maxOffset = proposed[proposed.length - 1].offset
      const offsets = [
        ...new Set(
          [
            minOffset,
            maxOffset,
            ...proposed.map((point) => point.offset),
            ...section.pre
              .filter(
                (point) =>
                  point.offset >= minOffset - 1e-9 && point.offset <= maxOffset + 1e-9
              )
              .map((point) => point.offset)
          ].map(round3)
        )
      ].sort((a, b) => a - b)
      const refinedOffsets: number[] = [offsets[0]]
      for (let index = 1; index < offsets.length; index += 1) {
        const from = offsets[index - 1]
        const to = offsets[index]
        const differenceAt = (offset: number): number =>
          existLevelAt(section.pre, offset) -
          existLevelAt(proposed, offset)
        const fromDifference = differenceAt(from)
        const toDifference = differenceAt(to)
        if (fromDifference * toDifference < -1e-12) {
          refinedOffsets.push(
            from +
              ((0 - fromDifference) / (toDifference - fromDifference)) * (to - from)
          )
        }
        refinedOffsets.push(to)
      }
      base = refinedOffsets.map((offset) => ({
        offset,
        rl: automaticStrippedLevelAt(
          existLevelAt(section.pre, offset),
          existLevelAt(proposed, offset),
          design
        )
      }))
    } else {
      base = section.pre.map((point) => ({
        offset: point.offset,
        rl: point.rl - design.stripDepth
      }))
    }
  } else {
    base = []
  }
  return mergeProfileOverrides(base, section.strippedOverrides).sort(
    (a, b) => a.offset - b.offset
  )
}

/**
 * A generated restoration section is measurable only after every one of its
 * seven design offsets has an existing-ground RL. This prevents the two entered
 * toe RLs from being incorrectly joined as one straight ground line.
 */
export function hasCompleteRestorationGround(section: BundSection): boolean {
  if ((section.pre?.length ?? 0) < 2) return false
  const offsets = section.designPointOffsets
  if (!offsets?.length) return true
  // A generated section is measurable as soon as at least one existing RL is
  // entered strictly *between* the two toes. Every level routine already
  // interpolates linearly between the entered points — that interpolated line
  // is exactly what the section chart draws — so missing intermediate points
  // simply follow it, and typing one overrides it. The one case still refused
  // is toe RLs alone: those two would join as a straight chord across the
  // existing bund and measure the whole of it away as new fill.
  const first = Math.min(...offsets)
  const last = Math.max(...offsets)
  return section.pre.some((p) => p.offset > first + 1e-6 && p.offset < last - 1e-6)
}

/**
 * Which existing-ground model a chainage measures from.
 *
 * A surveyed cross-section wins wherever one has been entered — that is how a
 * repair has always worked, and a new homogeneous bund is now set out the same
 * way, from the two toe RLs and the generated design points. The flat
 * single-RL model remains for a new bund with no survey yet (a new zoned bund,
 * and every new bund saved before the cross-section entry existed).
 */
export function usesFlatGround(data: BundData, section: BundSection): boolean {
  return data.mode === 'new' && (section.pre?.length ?? 0) < 2
}

/**
 * Which ground entry the dashboard offers. Every bund is now set out from the
 * surveyed cross-section table — a new bund from the two toe RLs and the
 * generated design points, a repair from its survey. The single-RL model is
 * kept only for reading projects saved before this existed, which is what
 * `usesFlatGround` decides per section.
 */
export function usesSurveyedGroundEntry(_data: BundData): boolean {
  return true
}

/**
 * Is there enough existing ground at this chainage to measure it?
 *
 * On a repair, two toe RLs alone are refused: joined as a straight chord they
 * would cut the existing bund away as new fill. A new bund has nothing standing
 * between its toes, so that chord *is* the natural ground and two RLs are
 * enough.
 */
export function hasMeasurableGround(data: BundData, section: BundSection): boolean {
  if (usesFlatGround(data, section)) return section.groundLevel != null
  if (data.mode === 'new') return (section.pre?.length ?? 0) >= 2
  return hasCompleteRestorationGround(section)
}

/**
 * Centre-relative offset of the upstream toe. Levels are *stored* relative to
 * the centre-line, because the crest and the two side slopes are defined about
 * it, but they are *shown* as a distance measured from the u/s toe — the way a
 * tape is actually run across a bund in the field. This is the origin for that
 * display, so u/s toe reads 0 and distances increase downstream.
 */
export function upstreamToeOffset(section: BundSection, data: BundData): number {
  const offsets = sectionDesignOffsets(section, data.design)
  if (offsets?.length) return round3(Math.min(...offsets))
  const projected = projectedProfile(section, data.design)
  if (projected.length) return round3(Math.min(...projected.map((p) => p.offset)))
  if (section.pre?.length) return round3(Math.min(...section.pre.map((p) => p.offset)))
  return 0
}

/** Existing ground level at any offset, interpolated, flat beyond the survey. */
export function existLevelAt(points: BundPoint[], offset: number): number {
  if (points.length === 0) return 0
  const sorted = [...points].sort((a, b) => a.offset - b.offset)
  if (offset <= sorted[0].offset) return sorted[0].rl
  const last = sorted[sorted.length - 1]
  if (offset >= last.offset) return last.rl
  for (let i = 1; i < sorted.length; i += 1) {
    const a = sorted[i - 1]
    const b = sorted[i]
    if (offset >= a.offset && offset <= b.offset) {
      const t = b.offset === a.offset ? 0 : (offset - a.offset) / (b.offset - a.offset)
      return a.rl + (b.rl - a.rl) * t
    }
  }
  return last.rl
}

// ---------------------------------------------------------------------------
// Faces and berms. A face is a walk outward from the crest edge: a sloping run,
// then (where a berm is placed) a horizontal shelf, then the next run — which
// may carry a flatter slope below the berm. Everything berm-aware is built on
// `faceSegments`, so the drawn section, the toe search, the areas and the
// slope lengths cannot disagree about where a shelf is.
// ---------------------------------------------------------------------------

/** The face slope of one side (horizontal metres per 1 m of fall). */
export function faceSlope(design: BundDesign, side: BundBermSide): number {
  return (side === 'us' ? design.usSlope : design.dsSlope) || 1
}

/** Berms on one face, highest first, ignoring rows that form no shelf. */
export function faceBerms(design: BundDesign, side: BundBermSide): BundBerm[] {
  return (design.berms ?? [])
    .filter(
      (berm) =>
        berm.side === side && berm.width > 0 && berm.level < design.topLevel - 1e-9
    )
    .sort((a, b) => b.level - a.level)
}

export interface BundFaceSegment {
  kind: 'slope' | 'shelf'
  /** Horizontal distance from the crest edge at each end of the segment. */
  fromDistance: number
  toDistance: number
  fromRl: number
  toRl: number
  /** The berm this shelf belongs to (shelf segments only). */
  berm?: BundBerm
}

/**
 * One face from the crest edge down to `baseRl`, as alternating sloping runs
 * and berm shelves. Berms at or below the base are never reached, so they
 * simply do not appear — which is how a berm disappears where the bund becomes
 * too shallow to carry it.
 */
export function faceSegments(
  design: BundDesign,
  side: BundBermSide,
  baseRl: number
): BundFaceSegment[] {
  const out: BundFaceSegment[] = []
  if (!(baseRl < design.topLevel - 1e-9)) return out
  let level = design.topLevel
  let distance = 0
  let slope = faceSlope(design, side)
  for (const berm of faceBerms(design, side)) {
    // Buried by a higher berm, or below where this face already ends.
    if (berm.level >= level - 1e-9) continue
    if (berm.level <= baseRl + 1e-9) break
    const run = (level - berm.level) * slope
    out.push({
      kind: 'slope',
      fromDistance: distance,
      toDistance: distance + run,
      fromRl: level,
      toRl: berm.level
    })
    distance += run
    out.push({
      kind: 'shelf',
      fromDistance: distance,
      toDistance: distance + berm.width,
      fromRl: berm.level,
      toRl: berm.level,
      berm
    })
    distance += berm.width
    level = berm.level
    if (berm.slopeBelow != null && berm.slopeBelow > 0) slope = berm.slopeBelow
  }
  out.push({
    kind: 'slope',
    fromDistance: distance,
    toDistance: distance + (level - baseRl) * slope,
    fromRl: level,
    toRl: baseRl
  })
  return out
}

/** Horizontal distance from the crest edge at which a face reaches `rl`. */
export function faceDistanceToLevel(
  design: BundDesign,
  side: BundBermSide,
  rl: number
): number {
  const segments = faceSegments(design, side, rl)
  return segments.length ? round3(segments[segments.length - 1].toDistance) : 0
}

/** RL of a face at a horizontal distance beyond the crest edge. */
export function faceLevelAtDistance(
  design: BundDesign,
  side: BundBermSide,
  distance: number
): number {
  if (distance <= 0) return design.topLevel
  let level = design.topLevel
  let remaining = distance
  let slope = faceSlope(design, side)
  for (const berm of faceBerms(design, side)) {
    if (berm.level >= level - 1e-9) continue
    const run = (level - berm.level) * slope
    if (remaining <= run) return level - remaining / slope
    remaining -= run
    level = berm.level
    if (remaining <= berm.width) return berm.level
    remaining -= berm.width
    if (berm.slopeBelow != null && berm.slopeBelow > 0) slope = berm.slopeBelow
  }
  return level - remaining / slope
}

/** Centre-line offsets of the two hinges of every shelf down to `baseRl`. */
export function bermHingeOffsets(
  design: BundDesign,
  side: BundBermSide,
  baseRl: number
): number[] {
  const half = design.topWidth / 2
  return faceSegments(design, side, baseRl)
    .filter((segment) => segment.kind === 'shelf')
    .flatMap((segment) =>
      [segment.fromDistance, segment.toDistance].map((distance) =>
        round3(side === 'us' ? -half - distance : half + distance)
      )
    )
}

/**
 * RL of the designed bund surface at an offset: the crest at TBL, then the two
 * faces sloping down. Beyond the crest each 1 m of fall costs `slope` metres of
 * width (a 2.5:1 face drops 1 m over 2.5 m), interrupted by any berm shelf.
 */
export function designSurfaceAt(offset: number, design: BundDesign): number {
  const beyondCrest = Math.abs(offset) - design.topWidth / 2
  if (beyondCrest <= 0) return design.topLevel
  return faceLevelAtDistance(design, offset < 0 ? 'us' : 'ds', beyondCrest)
}

/**
 * The fixed proposed bund level at an offset. Existing ground is deliberately
 * not allowed to move this line: high ground is a local cut, low ground is
 * local fill, and the two quantities are measured independently.
 */
export function proposedLevelAt(
  offset: number,
  _existingRl: number,
  design: BundDesign
): number {
  return designSurfaceAt(offset, design)
}

/**
 * The seven standard design points for a restoration section:
 * upstream toe + face midpoint, three crest points, then the downstream face
 * midpoint + toe. Each toe is the outermost place where the designed face
 * leaves the surveyed ground while moving out from the crest.
 *
 * FTL and MWL do not locate a toe: they are reservoir reference levels. The
 * toe changes at every chainage with the existing ground and the selected face
 * slope. Berms add their two hinges to each face they interrupt, so the result
 * is seven points only on a plain-faced bund. Returns an empty array when the
 * survey is insufficient or the ground is already at/above TBL at a crest edge.
 */
/**
 * Distance from the crest edge at which the designed face meets the surveyed
 * ground, on one side. Beyond the last surveyed point the ground is taken as
 * flat — the convention `existLevelAt` already uses — so the crossing exists
 * even when the survey is narrower than the bund. Null means the designed face
 * never rises above the surveyed ground on that side.
 */
export function faceToeDistance(
  pre: BundPoint[],
  design: BundDesign,
  side: -1 | 1
): number | null {
  if (pre.length < 2 || design.topWidth <= 0 || design.usSlope <= 0 || design.dsSlope <= 0) {
    return null
  }
  const sorted = [...pre].sort((a, b) => a.offset - b.offset)
  const half = design.topWidth / 2
  // Deep enough that every berm on the face is reached and listed.
  const belowGround = Math.min(...sorted.map((point) => point.rl)) - 1

  const edge = side * half
  const gap = (distance: number): number => {
    const offset = edge + side * distance
    return designSurfaceAt(offset, design) - existLevelAt(sorted, offset)
  }

  // Both lines are piecewise linear, so checking every surveyed break point
  // and every berm hinge from the crest outwards finds all face/ground
  // crossings exactly; the outermost exit is the actual toe.
  const distances = [
    ...new Set(
      [
        0,
        ...sorted.map((point) => side * (point.offset - edge)),
        ...faceSegments(design, side < 0 ? 'us' : 'ds', belowGround).flatMap(
          (segment) => [segment.fromDistance, segment.toDistance]
        )
      ]
        .filter((distance) => distance >= 0)
        .map(round3)
    )
  ].sort((a, b) => a - b)

  const farthest = distances[distances.length - 1] ?? 0
  if (gap(farthest) > 0) {
    let outsideDistance = Math.max(farthest + 1, 1)
    while (gap(outsideDistance) > 0 && outsideDistance < 1_000_000) {
      outsideDistance *= 2
    }
    if (gap(outsideDistance) > 0) return null
    distances.push(outsideDistance)
  }

  // Past the survey the ground is flat and the designed face keeps falling, so
  // a crossing is guaranteed — this is the case a berm creates, by pushing the
  // toe further out than the tape was run.
  let outermostExit: number | null = null
  for (let index = 1; index < distances.length; index += 1) {
    const from = distances[index - 1]
    const to = distances[index]
    const fromGap = gap(from)
    const toGap = gap(to)
    if (fromGap > 1e-9 && toGap <= 1e-9) {
      outermostExit = from + (fromGap / (fromGap - toGap)) * (to - from)
    }
  }
  return outermostExit
}

export function sevenPointDesignProfile(pre: BundPoint[], design: BundDesign): BundPoint[] {
  if (pre.length < 2 || design.topWidth <= 0 || design.usSlope <= 0 || design.dsSlope <= 0) {
    return []
  }

  const sorted = [...pre].sort((a, b) => a.offset - b.offset)
  const half = design.topWidth / 2

  const upstreamDistance = faceToeDistance(sorted, design, -1)
  const downstreamDistance = faceToeDistance(sorted, design, 1)
  if (upstreamDistance == null || downstreamDistance == null) return []

  const upstreamToe = -half - upstreamDistance
  const downstreamToe = half + downstreamDistance
  const usToeRl = existLevelAt(sorted, upstreamToe)
  const dsToeRl = existLevelAt(sorted, downstreamToe)
  const offsets = [
    ...new Set(
      [
        upstreamToe,
        (upstreamToe - half) / 2,
        -half,
        0,
        half,
        (half + downstreamToe) / 2,
        downstreamToe,
        ...bermHingeOffsets(design, 'us', usToeRl),
        ...bermHingeOffsets(design, 'ds', dsToeRl)
      ]
        .map(round3)
        .filter((offset) => offset >= upstreamToe - 1e-9 && offset <= downstreamToe + 1e-9)
    )
  ].sort((a, b) => a - b)

  return offsets.map((offset) => ({
    offset,
    rl: round3(designSurfaceAt(offset, design))
  }))
}

/**
 * Seven design points from the two section-specific toe ground levels. This is
 * the direct design-button workflow: the side slopes determine each toe's
 * horizontal distance from the crest edge.
 */
export function sevenPointDesignFromGroundLevels(
  upstreamGroundLevel: number,
  downstreamGroundLevel: number,
  design: BundDesign
): BundPoint[] {
  if (
    !Number.isFinite(upstreamGroundLevel) ||
    !Number.isFinite(downstreamGroundLevel) ||
    design.topWidth <= 0 ||
    design.usSlope <= 0 ||
    design.dsSlope <= 0 ||
    upstreamGroundLevel >= design.topLevel ||
    downstreamGroundLevel >= design.topLevel
  ) {
    return []
  }

  const half = design.topWidth / 2
  const upstreamToe = -half - faceDistanceToLevel(design, 'us', upstreamGroundLevel)
  const downstreamToe = half + faceDistanceToLevel(design, 'ds', downstreamGroundLevel)
  const offsets = [
    ...new Set(
      [
        upstreamToe,
        (upstreamToe - half) / 2,
        -half,
        0,
        half,
        (half + downstreamToe) / 2,
        downstreamToe,
        ...bermHingeOffsets(design, 'us', upstreamGroundLevel),
        ...bermHingeOffsets(design, 'ds', downstreamGroundLevel)
      ].map(round3)
    )
  ].sort((a, b) => a - b)

  return offsets.map((offset) => ({
    offset,
    rl: round3(designSurfaceAt(offset, design))
  }))
}

/**
 * Generated offsets refreshed against the current design.
 *
 * Stored offsets describe the design at the moment the button was pressed.
 * Berms and slope edits can widen it later, so when the two toe RLs are known
 * those RLs are the durable input and the offsets are regenerated from them.
 */
export function sectionDesignOffsets(
  section: BundSection,
  design: BundDesign
): number[] {
  const stored = section.designPointOffsets
  // Toe RLs are inputs to the explicit "Generate design points" action.
  // Do not recreate cleared Proposed points just because those inputs are
  // still present after a user has deliberately cleared the proposal.
  if (stored && stored.length < 2) return stored
  if (
    section.upstreamGroundLevel != null &&
    section.downstreamGroundLevel != null
  ) {
    const regenerated = sevenPointDesignFromGroundLevels(
      section.upstreamGroundLevel,
      section.downstreamGroundLevel,
      design
    )
    if (regenerated.length >= 2) return regenerated.map((point) => point.offset)
  }
  if (stored && stored.length >= 2 && (section.pre?.length ?? 0) >= 2) {
    const oldUsToe = Math.min(...stored)
    const oldDsToe = Math.max(...stored)
    const regenerated = sevenPointDesignFromGroundLevels(
      existLevelAt(section.pre, oldUsToe),
      existLevelAt(section.pre, oldDsToe),
      design
    )
    if (regenerated.length >= 2) return regenerated.map((point) => point.offset)
  }
  return stored ?? []
}

/**
 * Proposed profile derived from the design for a restoration, sampled at the
 * survey offsets plus the two crest corners so the crest draws crisply. The
 * profile is the fixed design surface; it is never raised by a high surveyed
 * point. Cut and fill are classified locally later.
 *
 * The profile always runs the full width of the proposed bund — out to where
 * each designed face meets the ground — even when that is past the end of the
 * survey. Berms make this ordinary: every shelf pushes its toe another shelf
 * width outward, and a face that stopped at the last surveyed offset would hang
 * in mid-air on the drawing and lose its outer wedge of fill.
 */
export function deriveProposedProfile(
  pre: BundPoint[],
  design: BundDesign,
  additionalOffsets: number[] = []
): BundPoint[] {
  if (pre.length < 2) return []
  const sorted = [...pre].sort((a, b) => a.offset - b.offset)
  const half = design.topWidth / 2
  const fixedOffsets = additionalOffsets.filter(Number.isFinite).map(round3)
  const fixedMin = fixedOffsets.length >= 2 ? Math.min(...fixedOffsets) : null
  const fixedMax = fixedOffsets.length >= 2 ? Math.max(...fixedOffsets) : null
  const usToeDistance = fixedMin == null ? faceToeDistance(sorted, design, -1) : null
  const dsToeDistance = fixedMax == null ? faceToeDistance(sorted, design, 1) : null
  // A face that never rises above the surveyed ground has no toe: the design
  // section never closes against this ground, so there is no bund to draw and
  // nothing to measure. Falling back to the ends of the tape would instead
  // sweep the designed face on downwards below the ground and bill the whole
  // surveyed width as excavation. The section reports the problem instead —
  // see sectionDesignIssues.
  if (fixedMin == null && usToeDistance == null) return []
  if (fixedMax == null && dsToeDistance == null) return []
  const usToe = fixedMin ?? round3(-half - (usToeDistance as number))
  const dsToe = fixedMax ?? round3(half + (dsToeDistance as number))
  const minOff = Math.min(usToe, dsToe)
  const maxOff = Math.max(usToe, dsToe)
  const offsets = new Set(
    sorted
      .filter((point) => point.offset >= minOff - 1e-9 && point.offset <= maxOff + 1e-9)
      .map((point) => point.offset)
  )
  offsets.add(round3(minOff))
  offsets.add(round3(maxOff))
  // Each toe is a kink in the proposed line. Unless it is sampled, the profile
  // cuts a chord straight across it — which draws the toe rounded off and
  // measures a wedge of fill that is not there.
  offsets.add(usToe)
  offsets.add(dsToe)
  for (const offset of additionalOffsets) {
    if (offset >= minOff && offset <= maxOff) offsets.add(round3(offset))
  }
  for (const edge of [-half, half]) {
    if (edge > minOff && edge < maxOff) offsets.add(Math.round(edge * 1000) / 1000)
  }
  // Berm hinges too, or a shelf would be cut off at the neighbouring survey
  // offsets and drawn (and measured) as a plain slope.
  const lowestGround = Math.min(...sorted.map((point) => point.rl))
  for (const side of ['us', 'ds'] as BundBermSide[]) {
    for (const offset of bermHingeOffsets(design, side, lowestGround)) {
      if (offset > minOff && offset < maxOff) offsets.add(offset)
    }
  }
  return [...offsets]
    .sort((a, b) => a - b)
    .map((offset) => ({ offset, rl: designSurfaceAt(offset, design) }))
}

/**
 * Carry a surveyed line flat when the fixed design footprint is wider than the
 * entered survey. Existing points outside that footprint are left intact; the
 * positive-band integrator clips both lines to their shared design span.
 */
export function extendProfileTo(
  points: BundPoint[],
  minOffset: number,
  maxOffset: number
): BundPoint[] {
  if (points.length < 2) return points
  const sorted = [...points].sort((a, b) => a.offset - b.offset)
  const out = [...sorted]
  if (minOffset < sorted[0].offset - 1e-9) {
    out.unshift({ offset: round3(minOffset), rl: sorted[0].rl })
  }
  if (maxOffset > sorted[sorted.length - 1].offset + 1e-9) {
    out.push({ offset: round3(maxOffset), rl: sorted[sorted.length - 1].rl })
  }
  return out
}

/** Piece of a profile inside an exact offset span, with interpolated ends. */
export function profileWithin(
  points: BundPoint[],
  minOffset: number,
  maxOffset: number
): BundPoint[] {
  if (points.length < 2 || maxOffset <= minOffset) return []
  const sorted = [...points].sort((a, b) => a.offset - b.offset)
  return [
    { offset: minOffset, rl: existLevelAt(sorted, minOffset) },
    ...sorted.filter(
      (point) => point.offset > minOffset + 1e-9 && point.offset < maxOffset - 1e-9
    ),
    { offset: maxOffset, rl: existLevelAt(sorted, maxOffset) }
  ]
}

export interface BundProfileBand {
  fromOffset: number
  toOffset: number
  upperFromRl: number
  upperToRl: number
  lowerFromRl: number
  lowerToRl: number
}

/**
 * Positive-only pieces between two piecewise-linear profiles.
 *
 * Every ground/design crossing is inserted explicitly. Consequently a cut on
 * one part of a section can never cancel fill on another part, and the SVG can
 * hatch precisely the same pieces that are measured.
 */
export function positiveProfileBands(
  upper: BundPoint[],
  lower: BundPoint[]
): BundProfileBand[] {
  if (upper.length < 2 || lower.length < 2) return []
  const upperSorted = [...upper].sort((a, b) => a.offset - b.offset)
  const lowerSorted = [...lower].sort((a, b) => a.offset - b.offset)
  // Callers first extend a short survey to the design limits. Intersecting the
  // spans here prevents either profile being measured outside the fixed bund
  // footprint.
  const minOffset = Math.max(upperSorted[0].offset, lowerSorted[0].offset)
  const maxOffset = Math.min(
    upperSorted[upperSorted.length - 1].offset,
    lowerSorted[lowerSorted.length - 1].offset
  )
  if (maxOffset <= minOffset + 1e-9) return []

  const offsets = [
    ...new Set(
      [
        minOffset,
        maxOffset,
        ...upperSorted
          .filter(
            (point) =>
              point.offset > minOffset + 1e-9 && point.offset < maxOffset - 1e-9
          )
          .map((point) => point.offset),
        ...lowerSorted
          .filter(
            (point) =>
              point.offset > minOffset + 1e-9 && point.offset < maxOffset - 1e-9
          )
          .map((point) => point.offset)
      ].map(round3)
    )
  ].sort((a, b) => a - b)

  const refined: number[] = [offsets[0]]
  for (let index = 1; index < offsets.length; index += 1) {
    const from = offsets[index - 1]
    const to = offsets[index]
    const fromDifference =
      existLevelAt(upperSorted, from) - existLevelAt(lowerSorted, from)
    const toDifference = existLevelAt(upperSorted, to) - existLevelAt(lowerSorted, to)
    if (fromDifference * toDifference < -1e-12) {
      const crossing =
        from + ((0 - fromDifference) / (toDifference - fromDifference)) * (to - from)
      refined.push(crossing)
    }
    refined.push(to)
  }

  const bands: BundProfileBand[] = []
  for (let index = 1; index < refined.length; index += 1) {
    const fromOffset = refined[index - 1]
    const toOffset = refined[index]
    if (toOffset <= fromOffset + 1e-9) continue
    const middle = (fromOffset + toOffset) / 2
    if (existLevelAt(upperSorted, middle) <= existLevelAt(lowerSorted, middle) + 1e-9) {
      continue
    }
    bands.push({
      fromOffset,
      toOffset,
      upperFromRl: existLevelAt(upperSorted, fromOffset),
      upperToRl: existLevelAt(upperSorted, toOffset),
      lowerFromRl: existLevelAt(lowerSorted, fromOffset),
      lowerToRl: existLevelAt(lowerSorted, toOffset)
    })
  }
  return bands
}

/** Area of positive-only bands between two profiles. */
export function positiveProfileArea(upper: BundPoint[], lower: BundPoint[]): number {
  return profileBandsArea(positiveProfileBands(upper, lower))
}

/** Area represented by profile bands. */
export function profileBandsArea(bands: BundProfileBand[]): number {
  return bands.reduce(
    (total, band) =>
      total +
      (((band.upperFromRl - band.lowerFromRl +
        (band.upperToRl - band.lowerToRl)) /
        2) *
        (band.toOffset - band.fromOffset)),
    0
  )
}

export function profileBandLevelAt(
  band: BundProfileBand,
  offset: number,
  edge: 'upper' | 'lower'
): number {
  const span = band.toOffset - band.fromOffset
  const fraction = span <= 1e-12 ? 0 : (offset - band.fromOffset) / span
  const from = edge === 'upper' ? band.upperFromRl : band.lowerFromRl
  const to = edge === 'upper' ? band.upperToRl : band.lowerToRl
  return from + fraction * (to - from)
}

/**
 * Geometrical overlap of two sets of positive profile bands.
 *
 * Zoned repair uses this to keep hearting strictly inside the already measured
 * repair fill. This makes casing + hearting equal the ordinary formation
 * quantity, even where the existing bund surface is irregular.
 */
export function intersectProfileBands(
  first: BundProfileBand[],
  second: BundProfileBand[]
): BundProfileBand[] {
  const out: BundProfileBand[] = []
  for (const a of first) {
    for (const b of second) {
      const from = Math.max(a.fromOffset, b.fromOffset)
      const to = Math.min(a.toOffset, b.toOffset)
      if (to <= from + 1e-9) continue

      const offsets = [from, to]
      for (const edge of ['upper', 'lower'] as const) {
        const fromDiff =
          profileBandLevelAt(a, from, edge) - profileBandLevelAt(b, from, edge)
        const toDiff =
          profileBandLevelAt(a, to, edge) - profileBandLevelAt(b, to, edge)
        if (fromDiff * toDiff < -1e-12) {
          offsets.push(from + (fromDiff / (fromDiff - toDiff)) * (to - from))
        }
      }
      offsets.sort((x, y) => x - y)

      for (let index = 1; index < offsets.length; index += 1) {
        const left = offsets[index - 1]
        const right = offsets[index]
        if (right <= left + 1e-9) continue
        const topAt = (offset: number): number =>
          Math.min(
            profileBandLevelAt(a, offset, 'upper'),
            profileBandLevelAt(b, offset, 'upper')
          )
        const bottomAt = (offset: number): number =>
          Math.max(
            profileBandLevelAt(a, offset, 'lower'),
            profileBandLevelAt(b, offset, 'lower')
          )
        const leftGap = topAt(left) - bottomAt(left)
        const rightGap = topAt(right) - bottomAt(right)
        const refined =
          leftGap * rightGap < -1e-12
            ? [
                left,
                left + (leftGap / (leftGap - rightGap)) * (right - left),
                right
              ]
            : [left, right]
        for (let part = 1; part < refined.length; part += 1) {
          const partFrom = refined[part - 1]
          const partTo = refined[part]
          const middle = (partFrom + partTo) / 2
          if (topAt(middle) <= bottomAt(middle) + 1e-9) continue
          out.push({
            fromOffset: partFrom,
            toOffset: partTo,
            upperFromRl: topAt(partFrom),
            upperToRl: topAt(partTo),
            lowerFromRl: bottomAt(partFrom),
            lowerToRl: bottomAt(partTo)
          })
        }
      }
    }
  }
  return out
}

/**
 * Automatic local cut/fill classification over one fixed design footprint.
 *
 * Where existing ground is above design, only that excess is cut and there is
 * no fill. Everywhere else the ordinary strip depth applies. Formation is then
 * measured from existing ground for seating, or from the stripped surface for
 * foundation excavation.
 */
export function automaticLocalEarthworkBands(
  existing: BundPoint[],
  proposed: BundPoint[],
  design: BundDesign,
  fillBasis: BundFillBasis
): { stripping: BundProfileBand[]; formation: BundProfileBand[] } {
  if (existing.length < 2 || proposed.length < 2) {
    return { stripping: [], formation: [] }
  }
  const existingSorted = [...existing].sort((a, b) => a.offset - b.offset)
  const proposedSorted = [...proposed].sort((a, b) => a.offset - b.offset)
  const minOffset = Math.max(existingSorted[0].offset, proposedSorted[0].offset)
  const maxOffset = Math.min(
    existingSorted[existingSorted.length - 1].offset,
    proposedSorted[proposedSorted.length - 1].offset
  )
  if (maxOffset <= minOffset + 1e-9) {
    return { stripping: [], formation: [] }
  }

  const baseOffsets = [
    ...new Set(
      [
        minOffset,
        maxOffset,
        ...existingSorted
          .filter(
            (point) =>
              point.offset > minOffset + 1e-9 && point.offset < maxOffset - 1e-9
          )
          .map((point) => point.offset),
        ...proposedSorted
          .filter(
            (point) =>
              point.offset > minOffset + 1e-9 && point.offset < maxOffset - 1e-9
          )
          .map((point) => point.offset)
      ].map(round3)
    )
  ].sort((a, b) => a - b)

  const offsets: number[] = [baseOffsets[0]]
  for (let index = 1; index < baseOffsets.length; index += 1) {
    const from = baseOffsets[index - 1]
    const to = baseOffsets[index]
    const fromGap =
      existLevelAt(existingSorted, from) - existLevelAt(proposedSorted, from)
    const toGap = existLevelAt(existingSorted, to) - existLevelAt(proposedSorted, to)
    if (fromGap * toGap < -1e-12) {
      offsets.push(from + (fromGap / (fromGap - toGap)) * (to - from))
    }
    offsets.push(to)
  }

  const stripping: BundProfileBand[] = []
  const formation: BundProfileBand[] = []
  for (let index = 1; index < offsets.length; index += 1) {
    const fromOffset = offsets[index - 1]
    const toOffset = offsets[index]
    if (toOffset <= fromOffset + 1e-9) continue
    const middle = (fromOffset + toOffset) / 2
    const existingAt = (offset: number): number =>
      existLevelAt(existingSorted, offset)
    const proposedAt = (offset: number): number =>
      existLevelAt(proposedSorted, offset)
    const isCut = existingAt(middle) > proposedAt(middle) + 1e-9

    const existingFrom = existingAt(fromOffset)
    const existingTo = existingAt(toOffset)
    const proposedFrom = proposedAt(fromOffset)
    const proposedTo = proposedAt(toOffset)
    stripping.push({
      fromOffset,
      toOffset,
      upperFromRl: existingFrom,
      upperToRl: existingTo,
      lowerFromRl: isCut ? proposedFrom : existingFrom - design.stripDepth,
      lowerToRl: isCut ? proposedTo : existingTo - design.stripDepth
    })

    if (!isCut) {
      const lowerFrom =
        fillBasis === 'stripped' ? existingFrom - design.stripDepth : existingFrom
      const lowerTo =
        fillBasis === 'stripped' ? existingTo - design.stripDepth : existingTo
      if (
        proposedAt(middle) >
        (fillBasis === 'stripped'
          ? existingAt(middle) - design.stripDepth
          : existingAt(middle)) +
          1e-9
      ) {
        formation.push({
          fromOffset,
          toOffset,
          upperFromRl: proposedFrom,
          upperToRl: proposedTo,
          lowerFromRl: lowerFrom,
          lowerToRl: lowerTo
        })
      }
    }
  }
  return { stripping, formation }
}

/**
 * Height of the bund at a chainage, measured from the stripped surface at the
 * centre-line up to the top bund level. Zero where the ground is already at or
 * above TBL, matching `IF(GL > TBL, 0, ...)` in the parametric sheets.
 */
export function bundHeight(groundLevel: number, design: BundDesign): number {
  if (groundLevel >= design.topLevel) return 0
  const strippedLevel = groundLevel - design.stripDepth
  return Math.max(0, design.topLevel - strippedLevel)
}

/** Width of the bund where it meets the stripped surface. */
export function bundBaseWidth(height: number, design: BundDesign): number {
  if (height <= 0) return 0
  const baseRl = design.topLevel - height
  return round3(
    design.topWidth +
      faceDistanceToLevel(design, 'us', baseRl) +
      faceDistanceToLevel(design, 'ds', baseRl)
  )
}

/**
 * Area between one face and the vertical line dropped from its crest edge,
 * down to `baseRl`. A shelf has no area of its own; it pushes everything below
 * it outward, which the running distance of the next slope run already
 * carries — so berm fill is measured, and paid, inside the formation item.
 */
export function faceAreaBeyondCrest(
  design: BundDesign,
  side: BundBermSide,
  baseRl: number
): number {
  let area = 0
  for (const segment of faceSegments(design, side, baseRl)) {
    if (segment.kind === 'shelf') continue
    const drop = segment.fromRl - segment.toRl
    const run = segment.toDistance - segment.fromDistance
    area += segment.fromDistance * drop + (run * drop) / 2
  }
  return area
}

/**
 * Designed cross-section area for a 'new' bund: the crest rectangle plus each
 * face, which is a plain trapezium wing until a berm interrupts it.
 */
export function designedArea(height: number, design: BundDesign): number {
  if (height <= 0) return 0
  const baseRl = design.topLevel - height
  return round3(
    design.topWidth * height +
      faceAreaBeyondCrest(design, 'us', baseRl) +
      faceAreaBeyondCrest(design, 'ds', baseRl)
  )
}

/** The proposed profile as offsets and levels, for areas and the diagram. */
export function projectedProfile(section: BundSection, design: BundDesign): BundPoint[] {
  let base: BundPoint[]
  // A stored full profile is retained for imported/legacy projects.
  // An empty stored profile is an intentional user clear, not a missing
  // legacy profile to derive again from Existing ground.
  if (Array.isArray(section.projected)) {
    base = section.projected
  } else if ((section.pre?.length ?? 0) >= 2) {
    // Restoration: derive from the design against the surveyed ground.
    base = deriveProposedProfile(section.pre, design, sectionDesignOffsets(section, design))
  } else {
    // New bund: a trapezium from the single ground level at the centre-line,
    // stepped wherever a berm interrupts one of the faces.
    if (section.groundLevel == null) return []
    const h = bundHeight(section.groundLevel, design)
    if (h <= 0) return []
    const strippedLevel = section.groundLevel - design.stripDepth
    const halfTop = design.topWidth / 2
    const facePoints = (side: BundBermSide): BundPoint[] =>
      faceSegments(design, side, strippedLevel).map((segment) => ({
        offset: round3(
          side === 'us' ? -(halfTop + segment.toDistance) : halfTop + segment.toDistance
        ),
        rl: round3(segment.toRl)
      }))
    base = [
      ...facePoints('us').reverse(),
      { offset: -halfTop, rl: design.topLevel },
      { offset: halfTop, rl: design.topLevel },
      ...facePoints('ds')
    ]
  }
  return mergeProfileOverrides(base, section.projectedOverrides).sort(
    (a, b) => a.offset - b.offset
  )
}

export interface BundSectionAreas {
  /** Ground area cleared of jungle growth (sq.m of plan area per metre run). */
  clearanceWidth: number
  stripping: number
  formation: number
  /** Slope length of the upstream (left) proposed face — for pitching (m). */
  usFace: number
  /** Slope length of the downstream (right) proposed face — for turfing (m). */
  dsFace: number
}

export interface BundLevelingLimits {
  /** Outer edge of the U/S toe-wall platform. */
  startOffset: number
  /** The generated U/S toe of the proposed bund. */
  usToeOffset: number
  /** The generated D/S toe of the proposed bund, after any berm widening. */
  dsToeOffset: number
  /** Outer edge of the D/S toe-drain platform. */
  endOffset: number
  usToeLevel: number
  dsToeLevel: number
}

export interface BundLevelingGeometry {
  limits: BundLevelingLimits
  /** Existing ground, including surveyed points entered outside the bund toes. */
  existing: BundPoint[]
  /** Proposed bund plus the level U/S toe-wall and D/S toe-drain platforms. */
  proposed: BundPoint[]
  /** Gross cut/stripping before any overlap is assigned to rock-toe excavation. */
  stripping: BundProfileBand[]
  formation: BundProfileBand[]
}

/**
 * Limits of the one continuous bund-leveling operation.
 *
 * The design toes remain the ends of the embankment faces. When the respective
 * component is enabled, leveling continues one top width beyond that toe so the
 * toe wall or toe drain is constructed only after its platform is formed.
 */
export function bundLevelingLimits(
  section: BundSection,
  data: BundData
): BundLevelingLimits | null {
  const toes = proposedToeOffsets(section, data)
  const projected = projectedProfile(section, data.design)
  if (!toes || projected.length < 2) return null
  const usWidth = upstreamToeTrenchEnabled(data)
    ? Math.max(0, data.upstreamToe.topWidth || 0)
    : 0
  const dsWidth = data.downstreamToe.excavationMaterial
    ? Math.max(0, toeDrainTopWidthAt(section, data)) +
      2 * Math.max(0, data.downstreamToe.bermWidth || 0)
    : 0
  return {
    startOffset: round3(toes.us - usWidth),
    usToeOffset: round3(toes.us),
    dsToeOffset: round3(toes.ds),
    endOffset: round3(toes.ds + dsWidth),
    usToeLevel: round3(existLevelAt(projected, toes.us)),
    dsToeLevel: round3(existLevelAt(projected, toes.ds))
  }
}

export function dedupeProfile(points: BundPoint[]): BundPoint[] {
  const byOffset = new Map<number, BundPoint>()
  for (const point of points) {
    byOffset.set(round3(point.offset), {
      ...point,
      offset: round3(point.offset)
    })
  }
  return [...byOffset.values()].sort((a, b) => a.offset - b.offset)
}

/** Proposed bund and the two level construction platforms measured with it. */
export function bundLevelingProposedProfile(
  section: BundSection,
  data: BundData
): BundPoint[] {
  const limits = bundLevelingLimits(section, data)
  if (!limits) return []
  const core = profileWithin(
    projectedProfile(section, data.design),
    limits.usToeOffset,
    limits.dsToeOffset
  )
  return dedupeProfile([
    { offset: limits.startOffset, rl: limits.usToeLevel },
    { offset: limits.usToeOffset, rl: limits.usToeLevel },
    ...core,
    { offset: limits.dsToeOffset, rl: limits.dsToeLevel },
    { offset: limits.endOffset, rl: limits.dsToeLevel }
  ])
}

export function earthworkBandsWithin(
  existing: BundPoint[],
  proposed: BundPoint[],
  design: BundDesign,
  fillBasis: BundFillBasis,
  fromOffset: number,
  toOffset: number
): { stripping: BundProfileBand[]; formation: BundProfileBand[] } {
  if (toOffset <= fromOffset + 1e-9) return { stripping: [], formation: [] }
  return automaticLocalEarthworkBands(
    profileWithin(existing, fromOffset, toOffset),
    profileWithin(proposed, fromOffset, toOffset),
    design,
    fillBasis
  )
}

/**
 * Full section geometry for bund seating/foundation leveling.
 *
 * Surveyed RLs outside the generated toes are used when present. Where they
 * are absent, `extendProfileTo` carries the nearest entered RL level outward.
 * The U/S and D/S component trenches are deliberately excluded: they are dug
 * only after this surface has been leveled.
 */
export function bundLevelingGeometry(
  data: BundData,
  section: BundSection
): BundLevelingGeometry | null {
  const limits = bundLevelingLimits(section, data)
  const proposed = bundLevelingProposedProfile(section, data)
  if (!limits || proposed.length < 2) return null

  const sourceExisting = usesFlatGround(data, section)
    ? section.groundLevel == null
      ? []
      : [
          { offset: limits.startOffset, rl: section.groundLevel },
          { offset: limits.endOffset, rl: section.groundLevel }
        ]
    : section.pre
  if (sourceExisting.length < 2) return null
  const existing = profileWithin(
    extendProfileTo(sourceExisting, limits.startOffset, limits.endOffset),
    limits.startOffset,
    limits.endOffset
  )

  const hasManualStripped =
    !usesFlatGround(data, section) &&
    ((section.stripped?.length ?? 0) >= 2 ||
      (section.strippedOverrides?.length ?? 0) > 0)
  if (!hasManualStripped) {
    const bands = automaticLocalEarthworkBands(
      existing,
      proposed,
      data.design,
      data.fillBasis
    )
    return { limits, existing, proposed, ...bands }
  }

  // Manual stripped/cut overrides apply to the embankment footprint. The two
  // outside platforms remain automatic so an entered outside EGL is always
  // compared with its fixed proposed toe level.
  const stripped = strippedProfile(section, data.design)
  const coreExisting = profileWithin(
    existing,
    limits.usToeOffset,
    limits.dsToeOffset
  )
  const coreProposed = profileWithin(
    proposed,
    limits.usToeOffset,
    limits.dsToeOffset
  )
  const coreStripped = profileWithin(
    extendProfileTo(stripped, limits.usToeOffset, limits.dsToeOffset),
    limits.usToeOffset,
    limits.dsToeOffset
  )
  const left = earthworkBandsWithin(
    existing,
    proposed,
    data.design,
    data.fillBasis,
    limits.startOffset,
    limits.usToeOffset
  )
  const right = earthworkBandsWithin(
    existing,
    proposed,
    data.design,
    data.fillBasis,
    limits.dsToeOffset,
    limits.endOffset
  )
  const coreFormationBase =
    data.fillBasis === 'stripped' ? coreStripped : coreExisting
  return {
    limits,
    existing,
    proposed,
    stripping: [
      ...left.stripping,
      ...positiveProfileBands(coreExisting, coreStripped),
      ...right.stripping
    ],
    formation: [
      ...left.formation,
      ...positiveProfileBands(coreProposed, coreFormationBase),
      ...right.formation
    ]
  }
}

/**
 * Slope lengths of the two proposed faces at a chainage. A face segment is one
 * whose midpoint lies beyond the crest edge; the flat crest between the corners
 * is excluded, and so is every berm shelf — a shelf is walked on, not pitched
 * or turfed, and carries its own surfacing item instead. Turfing and pitching
 * are these lengths × the chainage run.
 */
export function faceSlopeLengths(
  section: BundSection,
  design: BundDesign
): { us: number; ds: number } {
  const proj = [...projectedProfile(section, design)].sort((a, b) => a.offset - b.offset)
  if (proj.length < 2) return { us: 0, ds: 0 }
  const half = design.topWidth / 2
  const isShelf = (side: BundBermSide, a: BundPoint, b: BundPoint): boolean =>
    Math.abs(a.rl - b.rl) < 1e-6 &&
    faceBerms(design, side).some((berm) => Math.abs(berm.level - a.rl) < 1e-6)
  let us = 0
  let ds = 0
  for (let i = 1; i < proj.length; i += 1) {
    const a = proj[i - 1]
    const b = proj[i]
    const len = Math.hypot(b.offset - a.offset, b.rl - a.rl)
    const mid = (a.offset + b.offset) / 2
    if (mid < -half + 1e-9) {
      if (!isShelf('us', a, b)) us += len
    } else if (mid > half - 1e-9) {
      if (!isShelf('ds', a, b)) ds += len
    }
  }
  return { us: round3(us), ds: round3(ds) }
}

/**
 * The three areas at one chainage.
 *
 * Restoration reads the surveyed tables; a new bund derives them from the
 * design. The excavation-basis selector derives `fillBasis`: seating starts
 * formation at existing ground; foundation excavation starts it at the
 * excavated/stripped surface.
 */
export function sectionAreas(
  data: BundData,
  section: BundSection
): BundSectionAreas {
  const { design } = data

  const zero = { clearanceWidth: 0, stripping: 0, formation: 0, usFace: 0, dsFace: 0 }

  if (!hasMeasurableGround(data, section)) return zero
  const leveling = bundLevelingGeometry(data, section)
  if (!leveling) return zero
  const faces = faceSlopeLengths(section, design)
  // General bund excavation stops at the designed toes. Excavation for the
  // toe wall and toe drain is measured separately outside these limits.
  const netBundExcavation = profileBandsArea(bundNetStrippingBands(data, section))
  return {
    clearanceWidth: profileWidth(leveling.proposed),
    stripping: round3(netBundExcavation),
    formation: round3(profileBandsArea(leveling.formation)),
    usFace: faces.us,
    dsFace: faces.ds
  }
}

/** Horizontal extent of a profile — the width cleared/occupied at a chainage. */
export function isZonedBund(data: BundData): boolean {
  return data.embankmentType === 'zoned'
}

export function isZonedRepair(data: BundData): boolean {
  return data.mode === 'restoration' && isZonedBund(data)
}

/** Top and short side runs used to preview the proposed hearting immediately. */
export function proposedHeartingCrestProfile(
  data: BundData,
  verticalDrop = 1
): BundPoint[] {
  const design = data.heartingDesign
  const drop = Math.max(0.1, verticalDrop)
  if (design.topWidth <= 0 || design.usSlope < 0 || design.dsSlope < 0) return []
  const halfTop = design.topWidth / 2
  const leftCrest = design.centerOffset - halfTop
  const rightCrest = design.centerOffset + halfTop
  return [
    {
      offset: round3(leftCrest - design.usSlope * drop),
      rl: round3(design.topLevel - drop)
    },
    { offset: round3(leftCrest), rl: round3(design.topLevel) },
    { offset: round3(rightCrest), rl: round3(design.topLevel) },
    {
      offset: round3(rightCrest + design.dsSlope * drop),
      rl: round3(design.topLevel - drop)
    }
  ]
}

/**
 * Surface that the full hearting side lines meet.
 *
 * Repair uses the actual surveyed Existing RL profile — the sides stop where
 * they first touch the bund that is already there. New work uses the prepared
 * formation base instead: the zone is built up from the excavated surface, so
 * that surface is what closes it. A new bund set out from a surveyed
 * cross-section takes the stripped profile of that survey; one still on the
 * single-RL model takes its flat base.
 */
export function heartingSupportProfile(
  data: BundData,
  section: BundSection
): BundPoint[] {
  if (!isZonedBund(data)) return []
  if (data.mode === 'restoration') {
    return [...(section.pre || [])].sort((a, b) => a.offset - b.offset)
  }
  if (!usesFlatGround(data, section)) {
    const stripped = strippedProfile(section, data.design)
    return stripped.length >= 2 ? stripped : []
  }
  if (section.groundLevel == null) return []
  const casing = projectedProfile(section, data.design)
  if (casing.length < 2) return []
  const baseRl = round3(section.groundLevel - Math.max(0, data.design.stripDepth))
  return [
    { offset: casing[0].offset, rl: baseRl },
    { offset: casing[casing.length - 1].offset, rl: baseRl }
  ]
}

export function heartingSideContact(
  support: BundPoint[],
  side: 'us' | 'ds',
  crestOffset: number,
  topLevel: number,
  slope: number
): BundPoint | null {
  if (support.length < 2 || slope < 0) return null
  const sorted = [...support].sort((a, b) => a.offset - b.offset)
  const minOffset = sorted[0].offset
  const maxOffset = sorted[sorted.length - 1].offset

  // A zero batter is a vertical side. Its contact is directly below its crest.
  if (slope <= 1e-9) {
    if (crestOffset < minOffset - 1e-9 || crestOffset > maxOffset + 1e-9) {
      return null
    }
    const rl = existLevelAt(sorted, crestOffset)
    return rl < topLevel - 1e-9
      ? { offset: round3(crestOffset), rl: round3(rl) }
      : null
  }

  const sideLevelAt = (offset: number): number =>
    side === 'us'
      ? topLevel - (crestOffset - offset) / slope
      : topLevel - (offset - crestOffset) / slope
  const domainContains = (offset: number): boolean =>
    side === 'us' ? offset <= crestOffset + 1e-9 : offset >= crestOffset - 1e-9
  const candidates: number[] = []

  for (let index = 1; index < sorted.length; index += 1) {
    const a = sorted[index - 1]
    const b = sorted[index]
    const from = side === 'us' ? a.offset : Math.max(a.offset, crestOffset)
    const to = side === 'us' ? Math.min(b.offset, crestOffset) : b.offset
    if (to < from - 1e-9 || !domainContains(from) || !domainContains(to)) continue

    const differenceAt = (offset: number): number =>
      sideLevelAt(offset) - existLevelAt([a, b], offset)
    const fromDifference = differenceAt(from)
    const toDifference = differenceAt(to)
    if (Math.abs(fromDifference) <= 1e-8) candidates.push(from)
    if (Math.abs(toDifference) <= 1e-8) candidates.push(to)
    if (fromDifference * toDifference < -1e-12) {
      candidates.push(
        from +
          ((0 - fromDifference) * (to - from)) /
            (toDifference - fromDifference)
      )
    }
  }

  const valid = candidates
    .filter(
      (offset) =>
        domainContains(offset) &&
        offset >= minOffset - 1e-9 &&
        offset <= maxOffset + 1e-9
    )
    .sort((a, b) => (side === 'us' ? b - a : a - b))
  const offset = valid[0]
  if (offset == null) return null
  return {
    offset: round3(offset),
    rl: round3(existLevelAt(sorted, offset))
  }
}

export interface BundHeartingGeometry {
  upper: BundPoint[]
  base: BundPoint[]
}

export function heartingGeometry(data: BundData, section: BundSection): BundHeartingGeometry {
  const design = data.heartingDesign
  const support = heartingSupportProfile(data, section)
  if (
    support.length < 2 ||
    design.topWidth <= 0 ||
    design.usSlope < 0 ||
    design.dsSlope < 0
  ) {
    return { upper: [], base: [] }
  }
  const halfTop = design.topWidth / 2
  const leftCrest = design.centerOffset - halfTop
  const rightCrest = design.centerOffset + halfTop
  const leftContact = heartingSideContact(
    support,
    'us',
    leftCrest,
    design.topLevel,
    design.usSlope
  )
  const rightContact = heartingSideContact(
    support,
    'ds',
    rightCrest,
    design.topLevel,
    design.dsSlope
  )
  if (!leftContact || !rightContact || rightContact.offset <= leftContact.offset + 1e-9) {
    return { upper: [], base: [] }
  }
  return {
    upper: [
      leftContact,
      { offset: round3(leftCrest), rl: round3(design.topLevel) },
      { offset: round3(rightCrest), rl: round3(design.topLevel) },
      rightContact
    ],
    base: profileWithin(support, leftContact.offset, rightContact.offset)
  }
}

/** Existing RL/formation-base portion enclosed by the full hearting zone. */
export function heartingBaseProfile(
  data: BundData,
  section: BundSection
): BundPoint[] {
  return heartingGeometry(data, section).base
}

/**
 * Full proposed hearting boundary. In repair, each side stops at its first
 * contact with Existing RL. In new work it stops at the formation base.
 */
export function heartingRepairProfile(
  data: BundData,
  section: BundSection
): BundPoint[] {
  if (!isZonedBund(data)) return []
  return heartingGeometry(data, section).upper
}

/**
 * Hearting actually placed. It is intersected with ordinary formation, so it
 * cannot include existing earth, excavation, or space outside the casing.
 */
export function heartingRepairBands(
  data: BundData,
  section: BundSection
): BundProfileBand[] {
  const upper = heartingRepairProfile(data, section)
  const lower = heartingBaseProfile(data, section)
  const leveling = bundLevelingGeometry(data, section)
  if (upper.length < 2 || lower.length < 2 || !leveling) return []
  return intersectProfileBands(
    positiveProfileBands(upper, lower),
    leveling.formation
  )
}

// ---------------------------------------------------------------------------
// Cut-off trench under the hearting. A key cut from the prepared formation base
// down into tighter soil, backfilled with the same impervious material as the
// core, so seepage cannot travel under it. New work only: on a repair the bund
// already stands on its foundation and the trench cannot be dug without taking
// that bund down first.
// ---------------------------------------------------------------------------

/** Is the cut-off trench offered on this bund at all? */
export function heartingTrenchAvailable(data: BundData): boolean {
  return isZonedBund(data) && data.mode === 'new'
}

/** Trench on, with a backfill code attached and a real section to measure. */
export function heartingTrenchEnabled(data: BundData): boolean {
  return (
    heartingTrenchAvailable(data) &&
    Boolean(data.heartingTrench?.fillMaterial) &&
    heartingTrenchArea(data) > 0
  )
}

export interface BundDeepestToe {
  sectionId: string
  chainage: number
  side: BundBermSide
  rl: number
}

/** Lowest proposed toe RL found across both sides of every measurable section. */
export function deepestBundToe(data: BundData): BundDeepestToe | null {
  let deepest: BundDeepestToe | null = null
  for (const section of orderedSections(data)) {
    const toes = proposedToeOffsets(section, data)
    const profile = projectedProfile(section, data.design)
    if (!toes || profile.length < 2) continue
    for (const [side, offset] of [
      ['us', toes.us],
      ['ds', toes.ds]
    ] as const) {
      const rl = round3(existLevelAt(profile, offset))
      if (!Number.isFinite(rl)) continue
      if (!deepest || rl < deepest.rl) {
        deepest = { sectionId: section.id, chainage: section.chainage, side, rl }
      }
    }
  }
  return deepest
}

/** Effective depth used by quantities and drawings for the selected mode. */
export function resolvedHeartingTrenchDepth(data: BundData): number {
  if (data.heartingTrench.depthMode !== 'auto') {
    return round3(Math.max(0, data.heartingTrench.depth || 0))
  }
  return standardHeartingTrenchDepth(
    data.design.ftl ?? data.design.mwl,
    deepestBundToe(data)?.rl ?? null
  )
}

/**
 * Trapezoidal cut area: bottom width at the invert, widening by the two side
 * batters over the depth. Excavation and backfill are the same solid — the
 * trench is dug and filled back with impervious soil — so one area serves both.
 */
export function heartingTrenchArea(data: BundData): number {
  const trench = data.heartingTrench
  if (!trench) return 0
  const depth = resolvedHeartingTrenchDepth(data)
  const bottom = Math.max(0, trench.bottomWidth || 0)
  const us = Math.max(0, trench.usSlope || 0)
  const ds = Math.max(0, trench.dsSlope || 0)
  if (depth <= 0 || bottom <= 0) return 0
  return round3((bottom + ((us + ds) * depth) / 2) * depth)
}

/** Trench top width at the formation base — bottom width plus both batters. */
export function heartingTrenchTopWidth(data: BundData): number {
  const trench = data.heartingTrench
  if (!trench) return 0
  const depth = resolvedHeartingTrenchDepth(data)
  return round3(
    Math.max(0, trench.bottomWidth || 0) +
      (Math.max(0, trench.usSlope || 0) + Math.max(0, trench.dsSlope || 0)) * depth
  )
}

/**
 * The trench outline at one chainage, in section coordinates: the two top
 * corners on the formation base under the hearting, and the two invert corners
 * below them. Centred on the hearting's own centre offset, because the trench
 * exists to carry that core down — it follows the core, not the bund axis.
 */
export function heartingTrenchProfile(
  data: BundData,
  section: BundSection
): { top: BundPoint[]; bottom: BundPoint[] } {
  const empty = { top: [], bottom: [] }
  if (!heartingTrenchAvailable(data)) return empty
  const trench = data.heartingTrench
  const area = heartingTrenchArea(data)
  if (!trench || area <= 0) return empty
  const support = heartingSupportProfile(data, section)
  if (support.length < 2) return empty

  const centre = data.heartingDesign.centerOffset
  const halfTop = heartingTrenchTopWidth(data) / 2
  const leftTop = centre - halfTop
  const rightTop = centre + halfTop
  const sorted = [...support].sort((a, b) => a.offset - b.offset)
  if (
    leftTop < sorted[0].offset - 1e-9 ||
    rightTop > sorted[sorted.length - 1].offset + 1e-9
  ) {
    return empty
  }

  // The invert is level: a key trench is cut to one RL, taken from the base
  // directly under the core so the depth entered is the depth actually got.
  const baseAtCentre = existLevelAt(sorted, centre)
  const depth = resolvedHeartingTrenchDepth(data)
  const invertRl = round3(baseAtCentre - depth)
  const us = Math.max(0, trench.usSlope || 0)
  const ds = Math.max(0, trench.dsSlope || 0)
  return {
    top: profileWithin(sorted, leftTop, rightTop),
    bottom: [
      { offset: round3(leftTop + us * depth), rl: invertRl },
      { offset: round3(rightTop - ds * depth), rl: invertRl }
    ]
  }
}

/** Cut-off trench excavation / backfill, MSA'd along the chainage. */
export function heartingTrenchRows(data: BundData): BundQtyRow[] {
  if (!heartingTrenchEnabled(data)) return []
  const area = heartingTrenchArea(data)
  return quantityRowsBySection(data, () => area)
}

export interface BundHeartingTrenchIssue {
  code: 'below-hearting' | 'no-code'
  message: string
}

/** What would stop the trench being buildable or measurable as entered. */
export function heartingTrenchIssues(
  data: BundData,
  _section: BundSection | null
): BundHeartingTrenchIssue[] {
  if (!heartingTrenchAvailable(data) || !data.heartingTrench?.fillMaterial) return []
  const issues: BundHeartingTrenchIssue[] = []
  if (heartingTrenchArea(data) <= 0) {
    issues.push({
      code: 'below-hearting',
      message:
        'Enter a trench depth and bottom width greater than zero before the cut-off trench can be measured.'
    })
    return issues
  }
  if (!data.heartingTrench.excavationMaterial) {
    issues.push({
      code: 'no-code',
      message:
        'The trench backfill is billed but its excavation is not. Attach a foundation excavation code so the cut is paid for.'
    })
  }
  return issues
}

export interface BundZonedRepairAreas {
  totalFormation: number
  casing: number
  hearting: number
}

/** Material split of one zoned section. */
export function zonedRepairAreas(
  data: BundData,
  section: BundSection
): BundZonedRepairAreas {
  const totalFormation = round3(Math.max(
    0,
    sectionAreas(data, section).formation -
      (data.rockToeMaterial ? rockToeAreaAt(section, data) : 0)
  ))
  const hearting = round3(profileBandsArea(heartingRepairBands(data, section)))
  return {
    totalFormation,
    hearting,
    casing: round3(Math.max(0, totalFormation - hearting))
  }
}

export interface BundHeartingIssue {
  code:
    | 'missing-boundary'
    | 'no-intersection'
    | 'level-order'
    | 'outside-casing'
    | 'invalid-dimensions'
  message: string
}

/** Checks for the automatically terminated full hearting zone. */
export function heartingRepairIssues(
  data: BundData,
  section: BundSection
): BundHeartingIssue[] {
  if (!isZonedBund(data)) return []
  const design = data.heartingDesign
  const issues: BundHeartingIssue[] = []
  if (design.topWidth <= 0 || design.usSlope < 0 || design.dsSlope < 0) {
    issues.push({
      code: 'invalid-dimensions',
      message: 'Hearting top width must be greater than zero and its side slopes cannot be negative.'
    })
    return issues
  }
  const support = heartingSupportProfile(data, section)
  if (support.length < 2) {
    return [{
      code: 'missing-boundary',
      message:
        data.mode === 'restoration'
          ? 'Enter the surveyed Existing RL points to draw the full hearting zone.'
          : 'Enter the ground level for this chainage to draw the full hearting zone.'
    }]
  }
  const halfTop = design.topWidth / 2
  const supportBelowTop = profileWithin(
    support,
    design.centerOffset - halfTop,
    design.centerOffset + halfTop
  )
  const highestSupportAtCrest = Math.max(
    ...supportBelowTop.map((point) => point.rl)
  )
  if (design.topLevel <= highestSupportAtCrest + 1e-9) {
    issues.push({
      code: 'level-order',
      message:
        data.mode === 'restoration'
          ? 'Hearting top RL must be above the Existing RL beneath its top width.'
          : 'Hearting top RL must be above the new bund formation base.'
    })
  }
  if (design.topLevel > data.design.topLevel + 1e-9) {
    issues.push({
      code: 'outside-casing',
      message: 'Proposed hearting top RL cannot be above the proposed casing TBL.'
    })
  }
  const hearting = heartingRepairProfile(data, section)
  if (hearting.length < 4 && !issues.some((issue) => issue.code === 'level-order')) {
    issues.push({
      code: 'no-intersection',
      message:
        data.mode === 'restoration'
          ? 'The hearting side lines do not both touch the surveyed Existing RL. Enter enough survey width or adjust the hearting width, slopes, top RL, or offset.'
          : 'The hearting side lines do not both reach the new bund formation base inside the casing.'
    })
  }
  const casing = projectedProfile(section, data.design)
  if (
    hearting.length >= 2 &&
    casing.length >= 2 &&
    hearting.some(
      (point) =>
        point.offset < casing[0].offset - 1e-9 ||
        point.offset > casing[casing.length - 1].offset + 1e-9 ||
        point.rl > existLevelAt(casing, point.offset) + 1e-6
    )
  ) {
    issues.push({
      code: 'outside-casing',
      message: 'The proposed hearting extends outside the casing at this chainage. Reduce its width, slopes, top RL, or centre offset.'
    })
  }
  return issues
}

export function profileWidth(points: BundPoint[]): number {
  if (points.length < 2) return 0
  const offsets = points.map((p) => p.offset)
  return Math.max(...offsets) - Math.min(...offsets)
}

// ---------------------------------------------------------------------------
