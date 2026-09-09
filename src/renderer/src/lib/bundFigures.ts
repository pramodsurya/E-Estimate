// Dimensioned detail figures for the bund's printed estimate and dashboard.
//
// Each figure is a scaled section through one component, drawn from the same
// fields the dashboard asks for — no dimension is invented here. They share one
// scaffold (`detailSvg`) that maps world metres to the page. Dashboard vs print
// is a makeup flag (`purpose`), not a second drawing pipeline.

import type { BundBerm, BundData, BundSection, BundToe } from '../types/project'
import { bundChuteDiagramSvg } from './bundChuteDiagram'
import { bundRockToeDiagramSvg } from './bundRockToeDiagram'
import {
  downstreamDesignToePointAt,
  downstreamToeFaceSlope,
  heartingBaseProfile,
  heartingRepairProfile,
  heartingTrenchEnabled,
  heartingTrenchProfile,
  horizontalFilterLengthAt,
  horizontalFilterThicknessM,
  internalFiltersAvailable,
  isZonedBund,
  lowestStrippedLevelAt,
  pitchingThicknessM,
  projectedProfile,
  rockToeBaseWidth,
  rockToeHeightAt,
  toeDrainDepthAt,
  toeDrainTopWidthAt,
  upstreamToeTrenchEnabled,
  verticalFilterHeightAt,
  verticalFilterWidthM
} from './bund'

const DIM = '#1a4a7a'

/** Visual makeup only — geometry is shared. Default is the paper/Typst look. */
export type FigurePurpose = 'print' | 'dashboard'

interface FigureMakeup {
  purpose: FigurePurpose
  prefix: string
  dim: string
  label: string
  labelMuted: string
  labelAccent: string
  ground: string
  groundLine: string
  waterFill: string
  waterStroke: string
  mwl: string
  ftl: string
  bermMark: string
  usTrenchFill: string
  usTrenchStroke: string
  margin: number
  scaleGap: number
  strokeGround: number
  strokeDetail: number
  fontSize: number
  fontSizeSmall: number
  scaleLight: string
  scaleDark: string
  hatch: {
    stoneBg: string
    stoneLine: string
    turfBg: string
    turfLine: string
    concreteBg: string
    concreteLine: string
    murumBg: string
    murumDot: string
    rubbleBg: string
    rubbleLine: string
    filterBg: string
    filterDot: string
  }
}

const PRINT_MAKEUP: FigureMakeup = {
  purpose: 'print',
  prefix: 'bf',
  dim: DIM,
  label: '#33505f',
  labelMuted: '#8a9aa5',
  labelAccent: '#5a7a90',
  ground: '#efe9df',
  groundLine: '#6b5a44',
  waterFill: '#d9ecf6',
  waterStroke: '#5aa9d6',
  mwl: '#4a90b8',
  ftl: '#4a8f7d',
  bermMark: '#c19a3d',
  usTrenchFill: '#dfe6ea',
  usTrenchStroke: '#6d7780',
  margin: 22,
  scaleGap: 18,
  strokeGround: 1.7,
  strokeDetail: 1.3,
  fontSize: 11,
  fontSizeSmall: 10.5,
  scaleLight: '#fff',
  scaleDark: '#222',
  hatch: {
    stoneBg: '#dfe6ea',
    stoneLine: '#8fa3b0',
    turfBg: '#dcebd6',
    turfLine: '#78a36f',
    concreteBg: '#e2e5e7',
    concreteLine: '#9aa3a8',
    murumBg: '#f0e4cf',
    murumDot: '#c2a06a',
    rubbleBg: '#e6e9e5',
    rubbleLine: '#7c8b78',
    filterBg: '#eef3e8',
    filterDot: '#8aa06a'
  }
}

const DASHBOARD_MAKEUP: FigureMakeup = {
  purpose: 'dashboard',
  prefix: 'bfd',
  dim: '#7eb8e8',
  label: '#e4e7ea',
  labelMuted: '#9aa3ad',
  labelAccent: '#b7c9d6',
  ground: '#3a342c',
  groundLine: '#c4b496',
  waterFill: '#1a3d52',
  waterStroke: '#5eb8e8',
  mwl: '#6cb4e0',
  ftl: '#6dc4b0',
  bermMark: '#e0c36a',
  usTrenchFill: '#3a4248',
  usTrenchStroke: '#9aa4ad',
  margin: 8,
  scaleGap: 10,
  strokeGround: 2,
  strokeDetail: 1.6,
  fontSize: 12,
  fontSizeSmall: 11,
  scaleLight: '#d8dce0',
  scaleDark: '#1a1a1a',
  hatch: {
    stoneBg: '#2a3338',
    stoneLine: '#8fa3b0',
    turfBg: '#243028',
    turfLine: '#7aab72',
    concreteBg: '#2c3033',
    concreteLine: '#8a9399',
    murumBg: '#3a3224',
    murumDot: '#c4a06a',
    rubbleBg: '#2e322e',
    rubbleLine: '#8a9a86',
    filterBg: '#2a3224',
    filterDot: '#8aaa6a'
  }
}

let makeup: FigureMakeup = PRINT_MAKEUP
let figureUid = 0

function withPurpose<T>(purpose: FigurePurpose, fn: () => T): T {
  const previous = makeup
  makeup =
    purpose === 'dashboard'
      ? { ...DASHBOARD_MAKEUP, prefix: `bfd${++figureUid}` }
      : PRINT_MAKEUP
  try {
    return fn()
  } finally {
    makeup = previous
  }
}

const n1 = (v: number): string => v.toFixed(1)
const f2 = (v: number): string => v.toFixed(2)

/**
 * One surface appearance for every slope-protection element. Routing the
 * U/S pitching, d/s slope, chute lining and berm surface through a single
 * helper keeps the textures and labels consistent — the same code always
 * draws the same pattern, with the same sub-layer (e.g. sand bedding under
 * through-stone revetment) and the same primary thickness.
 *
 * Codes are grouped into a small, intentional set so that any DAW-6-1x
 * revetment code, any turfing code, and the CAW-7-12 CC path all map to
 * the same SVG appearance as their named representatives.
 */
export interface SlopeAppearance {
  fill: string
  stroke: string
  label: string
  /** Sub-layer drawn immediately under the primary band (e.g. sand bedding). */
  subFill?: string
  subStroke?: string
  subLabel?: string
  /** Primary layer thickness (m); 0 for unmeasured protections like turf. */
  primaryThicknessM?: number
  /** Sub-layer thickness (m); 0 when no sub-layer is billed. */
  subThicknessM?: number
}

const STONE_REVETMENT_CODES = new Set([
  'IRR-DAW-6-10',
  'IRR-DAW-6-11',
  'IRR-DAW-6-12',
  'IRR-DAW-6-13',
  'IRR-DAW-6-14'
])
const TURFING_CODES = new Set([
  'IRR-DAW-6-15',
  'IRR-DAW-6-9'
])
const CC_PROTECTION_CODES = new Set([
  'IRR-CAW-7-12',
  'IRR-CAW-7-15'
])

const STONE_REVETMENT_APPEARANCE: SlopeAppearance = {
  fill: 'url(#bfStone)',
  stroke: '#5a6b76',
  label: 'stone revetment',
  subFill: 'url(#bfMurum)',
  subStroke: '#8a6a3c',
  subLabel: 'sand bedding',
  primaryThicknessM: 0.6,
  subThicknessM: 0.45
}

const TURFING_APPEARANCE: SlopeAppearance = {
  fill: 'url(#bfTurf)',
  stroke: '#6f9a68',
  label: 'turfing'
}

const CC_PROTECTION_APPEARANCE: SlopeAppearance = {
  fill: 'url(#bfConcrete)',
  stroke: '#78858c',
  label: 'CC protection',
  primaryThicknessM: 0.1
}

export function slopeSurfaceAppearance(
  material?: { code?: string; description?: string } | null
): SlopeAppearance {
  if (!material) return STONE_REVETMENT_APPEARANCE
  const code = material.code
  if (code && STONE_REVETMENT_CODES.has(code)) return STONE_REVETMENT_APPEARANCE
  if (code && TURFING_CODES.has(code)) return TURFING_APPEARANCE
  if (code && CC_PROTECTION_CODES.has(code)) return CC_PROTECTION_APPEARANCE
  // Unknown / legacy code: fall back to a sensible default by description.
  const desc = (material.description ?? '').toLowerCase()
  if (/turf|grass/.test(desc)) return TURFING_APPEARANCE
  if (/cc|concrete|cement/.test(desc)) return CC_PROTECTION_APPEARANCE
  return STONE_REVETMENT_APPEARANCE
}

/**
 * Resolve the chute-drain lining appearance from the chute material code and
 * the explicit stone/concrete toggle. Both inputs must agree — concrete
 * always wins for CAW-7-12/7-15 codes, stone for the DAW-6-1x family.
 */
export function chuteLiningAppearance(data: BundData): SlopeAppearance {
  const code = data.chuteDrainLiningMaterial?.code
  if (code && CC_PROTECTION_CODES.has(code)) return CC_PROTECTION_APPEARANCE
  if (code && STONE_REVETMENT_CODES.has(code)) return STONE_REVETMENT_APPEARANCE
  return data.chuteDrainProtectionType === 'concrete'
    ? CC_PROTECTION_APPEARANCE
    : STONE_REVETMENT_APPEARANCE
}

/** Berm surface appearance (kept as a thin wrapper for callers). */
const bermSurfaceAppearance = (code?: string): SlopeAppearance =>
  slopeSurfaceAppearance({ code })

export interface DetailWorld {
  xMin: number
  xMax: number
  yMin: number
  yMax: number
}

interface DetailSpec {
  world: DetailWorld
  width?: number
  height?: number
  /** Hatch patterns and arrow markers; off for figures that style via classes. */
  defs?: boolean
  /** Metre scale bar; a screen detail leaves it to the surrounding panel. */
  scaleBar?: boolean
  className?: string
  /** Body of the drawing; receives world→page mappers and the metre scale. */
  draw: (X: (x: number) => number, Y: (y: number) => number, k: number) => string
}

/** Horizontal dimension with extension ticks, arrows and a centred label. */
export function hDim(x1: number, x2: number, y: number, label: string, below = false): string {
  const dim = makeup.dim
  const arrow = `url(#${makeup.prefix}Arrow)`
  return (
    `<line x1="${n1(x1)}" y1="${n1(y - 5)}" x2="${n1(x1)}" y2="${n1(y + 5)}" stroke="${dim}" stroke-width="0.7"/>` +
    `<line x1="${n1(x2)}" y1="${n1(y - 5)}" x2="${n1(x2)}" y2="${n1(y + 5)}" stroke="${dim}" stroke-width="0.7"/>` +
    `<line x1="${n1(x1)}" y1="${n1(y)}" x2="${n1(x2)}" y2="${n1(y)}" stroke="${dim}" stroke-width="0.9" ` +
    `marker-start="${arrow}" marker-end="${arrow}"/>` +
    `<text x="${n1((x1 + x2) / 2)}" y="${n1(below ? y + 13 : y - 5)}" text-anchor="middle" fill="${dim}" ` +
    `font-size="${makeup.fontSize}" font-family="Arial">${label}</text>`
  )
}

/** Vertical dimension; the label is rotated alongside the line. */
export function vDim(y1: number, y2: number, x: number, label: string, side: 'left' | 'right' = 'left'): string {
  const dim = makeup.dim
  const arrow = `url(#${makeup.prefix}Arrow)`
  const tx = side === 'left' ? x - 5 : x + 5
  const my = (y1 + y2) / 2
  return (
    `<line x1="${n1(x - 5)}" y1="${n1(y1)}" x2="${n1(x + 5)}" y2="${n1(y1)}" stroke="${dim}" stroke-width="0.7"/>` +
    `<line x1="${n1(x - 5)}" y1="${n1(y2)}" x2="${n1(x + 5)}" y2="${n1(y2)}" stroke="${dim}" stroke-width="0.7"/>` +
    `<line x1="${n1(x)}" y1="${n1(y1)}" x2="${n1(x)}" y2="${n1(y2)}" stroke="${dim}" stroke-width="0.9" ` +
    `marker-start="${arrow}" marker-end="${arrow}"/>` +
    `<text x="${n1(tx)}" y="${n1(my)}" text-anchor="middle" fill="${dim}" font-size="${makeup.fontSize}" font-family="Arial" ` +
    `transform="rotate(-90 ${n1(tx)} ${n1(my)})">${label}</text>`
  )
}

export function figLabel(
  x: number,
  y: number,
  text: string,
  anchor: 'start' | 'middle' | 'end' = 'middle',
  fill?: string,
  size?: number,
  weight: 'normal' | 'bold' = 'normal'
): string {
  const color = fill ?? makeup.label
  const fontSize = size ?? makeup.fontSize
  return (
    `<text x="${n1(x)}" y="${n1(y)}" text-anchor="${anchor}" fill="${color}" font-size="${fontSize}" ` +
    `font-weight="${weight}" font-family="Arial">${text}</text>`
  )
}

/**
 * Scaffold shared by every detail: uniform scale in both axes so the section is
 * true shape, a metre scale bar, and the hatch patterns the figures fill with.
 */
function detailSvg(spec: DetailSpec): string {
  const width = spec.width ?? 700
  const mL = makeup.margin
  const mR = makeup.margin
  const mT = makeup.margin
  const { world } = spec
  const spanX = world.xMax - world.xMin
  const spanY = world.yMax - world.yMin
  if (spanX <= 0 || spanY <= 0) return ''
  const k = (width - mL - mR) / spanX
  const drawHeight = spanY * k
  const X = (x: number): number => mL + (x - world.xMin) * k
  const Y = (y: number): number => mT + (world.yMax - y) * k

  const barY = Math.round(mT + drawHeight + makeup.scaleGap)
  const height =
    spec.height ?? Math.round(spec.scaleBar === false ? mT + drawHeight + 8 : barY + 14)

  const scale = spec.scaleBar === false ? '' : scaleBarBody(mL, mR, width, k, barY)
  const p = makeup.prefix
  const h = makeup.hatch

  const defs =
    spec.defs === false
      ? ''
      : `<defs>` +
    `<marker id="${p}Arrow" markerUnits="userSpaceOnUse" markerWidth="9" markerHeight="8" refX="8" refY="3" ` +
    `orient="auto-start-reverse"><path d="M0,0 L8,3 L0,6 Z" fill="${makeup.dim}"/></marker>` +
    `<pattern id="${p}Stone" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(30)">` +
    `<rect width="9" height="9" fill="${h.stoneBg}"/><line x1="0" y1="0" x2="0" y2="9" stroke="${h.stoneLine}" stroke-width="1.1"/></pattern>` +
    `<pattern id="${p}Turf" width="8" height="8" patternUnits="userSpaceOnUse">` +
    `<rect width="8" height="8" fill="${h.turfBg}"/><path d="M1 8 L3 3 M5 8 L7 2" stroke="${h.turfLine}" stroke-width="0.9"/></pattern>` +
    `<pattern id="${p}Concrete" width="12" height="12" patternUnits="userSpaceOnUse">` +
    `<rect width="12" height="12" fill="${h.concreteBg}"/><path d="M0 6 H12 M6 0 V12" stroke="${h.concreteLine}" stroke-width="0.7"/></pattern>` +
    `<pattern id="${p}Murum" width="6" height="6" patternUnits="userSpaceOnUse">` +
    `<rect width="6" height="6" fill="${h.murumBg}"/><circle cx="3" cy="3" r="0.9" fill="${h.murumDot}"/></pattern>` +
    `<pattern id="${p}Rubble" width="13" height="13" patternUnits="userSpaceOnUse">` +
    `<rect width="13" height="13" fill="${h.rubbleBg}"/>` +
    `<path d="M2 7 L6 2 L10 7 L6 11 Z" fill="none" stroke="${h.rubbleLine}" stroke-width="1"/></pattern>` +
    `<pattern id="${p}Filter" width="7" height="7" patternUnits="userSpaceOnUse">` +
    `<rect width="7" height="7" fill="${h.filterBg}"/><circle cx="2" cy="2" r="0.8" fill="${h.filterDot}"/>` +
    `<circle cx="5" cy="5" r="0.8" fill="${h.filterDot}"/></pattern>` +
    `</defs>`

  const className =
    spec.className ?? (makeup.purpose === 'dashboard' ? 'bp-fig bp-fig-dashboard' : 'bp-fig')

  return (
    `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" class="${className}">` +
    defs +
    spec.draw(X, Y, k) +
    scale +
    `</svg>`
  )
}

/** Alternating metre blocks with the two end labels. */
function scaleBarBody(mL: number, mR: number, width: number, k: number, barY: number): string {
  const maxBarWidth = Math.min((width - mL - mR) * 0.35, 200)
  const bars = Math.max(1, Math.min(3, Math.floor(maxBarWidth / k)))
  const tick = makeup.scaleDark
  let body = ''
  for (let i = 0; i < bars; i += 1) {
    body +=
      `<rect x="${n1(mL + i * k)}" y="${barY}" width="${n1(k)}" height="5" ` +
      `fill="${i % 2 ? makeup.scaleLight : makeup.scaleDark}" stroke="${tick}" stroke-width="0.7"/>`
  }
  body +=
    figLabel(mL, barY - 4, '0', 'start', makeup.labelMuted, 10) +
    figLabel(mL + bars * k, barY - 4, `${bars} m`, 'middle', makeup.labelMuted, 10) +
    figLabel(width - mR, barY - 4, 'All dimensions in metres', 'end', makeup.labelMuted, 10)
  return body
}

function hatchUrl(name: 'Stone' | 'Turf' | 'Concrete' | 'Murum' | 'Rubble' | 'Filter'): string {
  return `url(#${makeup.prefix}${name})`
}

function themedSlopeAppearance(appearance: SlopeAppearance): SlopeAppearance {
  const remap = (fill?: string): string | undefined => {
    if (!fill) return fill
    return fill
      .replace('url(#bfStone)', hatchUrl('Stone'))
      .replace('url(#bfTurf)', hatchUrl('Turf'))
      .replace('url(#bfConcrete)', hatchUrl('Concrete'))
      .replace('url(#bfMurum)', hatchUrl('Murum'))
  }
  const isTurf = appearance.label === 'turfing' || (appearance.fill ?? '').includes('Turf')
  const isCc = appearance.label === 'CC protection' || (appearance.fill ?? '').includes('Concrete')
  const dashboardStroke = isTurf ? '#8ec98a' : isCc ? '#b0b8be' : '#9aafbc'
  return {
    ...appearance,
    fill: remap(appearance.fill) ?? appearance.fill,
    subFill: remap(appearance.subFill),
    stroke: makeup.purpose === 'dashboard' ? dashboardStroke : appearance.stroke,
    subStroke: makeup.purpose === 'dashboard' ? '#c4a06a' : appearance.subStroke
  }
}

const GROUND = '#efe9df'
const GROUND_LINE = '#6b5a44'

/** U/S toe wall — trapezoidal cut-off trench keyed under the slope pitching. */
export function usToeFigure(data: BundData): string {
  const toe: BundToe = data.upstreamToe
  const top = toe.topWidth
  const bottom = toe.bottomWidth
  const depth = toe.depth
  if (top <= 0 || depth <= 0) return ''

  const face = 1 / Math.max(0.01, data.design.usSlope)
  const run = Math.max(1.3, top * 0.6)
  const tR = 0
  const tL = -top
  const bL = -(top + bottom) / 2
  const bR = bL + bottom

  return detailSvg({
    world: { xMin: tL - 0.5, xMax: run, yMin: -(depth + 0.35), yMax: run * face + 0.3 },
    draw: (X, Y) => {
      const ground =
        `<path d="M ${n1(X(tL - 0.5))} ${n1(Y(0))} L ${n1(X(tL))} ${n1(Y(0))} ` +
        `L ${n1(X(bL))} ${n1(Y(-depth))} L ${n1(X(bR))} ${n1(Y(-depth))} L ${n1(X(tR))} ${n1(Y(0))} ` +
        `L ${n1(X(run))} ${n1(Y(run * face))} L ${n1(X(run))} ${n1(Y(-(depth + 0.35)))} ` +
        `L ${n1(X(tL - 0.5))} ${n1(Y(-(depth + 0.35)))} Z" fill="${GROUND}" stroke="${GROUND_LINE}" stroke-width="1.6"/>`
      const key =
        `<path d="M ${n1(X(tL))} ${n1(Y(0))} L ${n1(X(bL))} ${n1(Y(-depth))} ` +
        `L ${n1(X(bR))} ${n1(Y(-depth))} L ${n1(X(tR))} ${n1(Y(0))} Z" ` +
        `fill="url(#bfStone)" stroke="#5a6b76" stroke-width="1.4"/>`
      return (
        ground +
        key +
        vDim(Y(0), Y(-depth), X(tR) + 40, f2(depth), 'right') +
        hDim(X(tL), X(tR), Y(0) - 22, f2(top)) +
        hDim(X(bL), X(bR), Y(-depth) + 24, f2(bottom), true) +
        figLabel(X((tL + tR) / 2), Y(-depth / 2), 'Cut-off trench', 'middle', '#22414f') +
        figLabel(X(tL - 0.45), Y(0) - 8, 'Trimmed ground', 'start', '#7a6a52') +
        figLabel(X(run * 0.55), Y(run * 0.55 * face + 0.22), `U/S face 1:${f2(data.design.usSlope)}`, 'middle', '#5a7a90')
      )
    }
  })
}

/** D/S toe drain — trapezoidal channel, from invert RL or the legacy trapezium. */
export function dsDrainFigure(data: BundData, depth: number): string {
  const toe: BundToe = data.downstreamToe
  const usesSlopes = toe.invertLevel != null
  const base = toe.bottomWidth
  const left = usesSlopes ? toe.leftSlope : (toe.topWidth - toe.bottomWidth) / 2 / Math.max(0.01, toe.depth)
  const right = usesSlopes ? toe.rightSlope : left
  const d = depth > 0 ? depth : toe.depth
  if (base <= 0 || d <= 0) return ''

  const face = 1 / Math.max(0.01, data.design.dsSlope)
  const back = Math.max(1.1, base * 0.7)
  const tL = 0
  const bL = left * d
  const bR = bL + base
  const tR = bR + right * d
  const water = Math.min(0.4, d * 0.35)

  return detailSvg({
    world: { xMin: -back, xMax: tR + 0.5, yMin: -(d + 0.35), yMax: back * face + 0.3 },
    draw: (X, Y) => {
      const ground =
        `<path d="M ${n1(X(-back))} ${n1(Y(back * face))} L ${n1(X(tL))} ${n1(Y(0))} ` +
        `L ${n1(X(bL))} ${n1(Y(-d))} L ${n1(X(bR))} ${n1(Y(-d))} L ${n1(X(tR))} ${n1(Y(0))} ` +
        `L ${n1(X(tR + 0.5))} ${n1(Y(0))} L ${n1(X(tR + 0.5))} ${n1(Y(-(d + 0.35)))} ` +
        `L ${n1(X(-back))} ${n1(Y(-(d + 0.35)))} Z" fill="${GROUND}" stroke="${GROUND_LINE}" stroke-width="1.6"/>`
      const flow =
        `<path d="M ${n1(X(bL - left * water))} ${n1(Y(-d + water))} L ${n1(X(bL))} ${n1(Y(-d))} ` +
        `L ${n1(X(bR))} ${n1(Y(-d))} L ${n1(X(bR + right * water))} ${n1(Y(-d + water))} Z" ` +
        `fill="#d9ecf6" stroke="#5aa9d6" stroke-width="1.1"/>`
      return (
        ground +
        flow +
        vDim(Y(0), Y(-d), X(tR) + 40, f2(d), 'right') +
        hDim(X(bL), X(bR), Y(-d) + 24, f2(base), true) +
        hDim(X(tL), X(tR), Y(0) - 22, f2(tR - tL)) +
        figLabel(X((bL + bR) / 2), Y(-d / 2) - 3, 'Toe drain', 'middle', '#22414f') +
        (toe.invertLevel != null
          ? figLabel(X((bL + bR) / 2), Y(-d) + 15, `invert RL ${f2(toe.invertLevel)}`, 'middle', '#4a90b8', 10.5)
          : '') +
        figLabel(X(bL - left * d * 0.5), Y(-d * 0.5), `1:${f2(left)}`, 'middle', '#5a7a90', 10.5) +
        figLabel(X(bR + right * d * 0.5), Y(-d * 0.5), `1:${f2(right)}`, 'middle', '#5a7a90', 10.5) +
        figLabel(X(-back * 0.55), Y(back * 0.55 * face + 0.22), `D/S face 1:${f2(data.design.dsSlope)}`, 'middle', '#5a7a90')
      )
    }
  })
}

/** Rock toe — rubble zone on the lower d/s face, with filter and foundation cut. */
export function rockToeFigure(data: BundData, section: BundSection | null = null): string {
  const top = data.rockToeTopWidth
  // A zero stored height means automatic sizing. Print the same resolved
  // height used by the quantity calculation at the governing section.
  const height = section ? rockToeHeightAt(section, data) : data.rockToeHeight
  const inner = data.rockToeInnerSlope
  const outer = section ? downstreamToeFaceSlope(section, data) : data.design.dsSlope
  const exc = data.rockToeExcavationDepth
  const hasFilter = Boolean(data.rockToeFilterMaterial)
  if (height <= 0) return ''

  return bundRockToeDiagramSvg({
    topWidth: top,
    innerSlope: inner,
    outerSlope: outer,
    height,
    excavationDepth: exc,
    filterEnabled: hasFilter
  }, 'print')
}

/** Chute drain — rectangular channel down the d/s face with its protection. */
export function chuteFigure(data: BundData): string {
  if (data.chuteDrainWidth <= 0 || data.chuteDrainDepth <= 0) return ''
  return bundChuteDiagramSvg({
    width: data.chuteDrainWidth,
    depth: data.chuteDrainDepth,
    liningThickness: data.chuteDrainLiningThickness,
    protection: data.chuteDrainProtectionType,
    lined: Boolean(data.chuteDrainLiningMaterial)
  }, 'print')
}

/**
 * Berm — the shelf cut into a face, its cross-fall and catch-water drain.
 *
 * Scene coordinates are always D/S-canonical: drain/bund at x = 0 on the
 * left, outer edge at +width. `bermDrawX` mirrors that for U/S so the water
 * face reads on the left (crest and drain on the right), matching a section
 * sheet. Print and dashboard share this geometry; `purpose` only changes makeup.
 */
interface BermScene {
  side: BundBerm['side']
  width: number
  crossFall: number
  /** Fall of the shelf surface from the outer edge down to the drain edge (m). */
  drop: number
  slopeAbove: number
  slopeBelow: number
  level: number
  /** Horizontal runs of the drawn face segments either side of the shelf. */
  runAbove: number
  runBelow: number
  hasDrain: boolean
  world: DetailWorld
  /** Earthwork outline, closed. */
  ground: Array<[number, number]>
  /** Surface line across the two faces and the shelf, open, window-wide. */
  outline: Array<[number, number]>
  /** Catch-water drain polygon; null when there is no drain. */
  drain: Array<[number, number]> | null
  surface: { kind: string; label: string; fill: string; stroke: string } | null
}

/** Map canonical (D/S) scene x into the figure: U/S is a left–right mirror. */
function bermDrawX(X: (x: number) => number, side: BundBerm['side']): (x: number) => number {
  return side === 'us' ? (x) => X(-x) : X
}

function bermScene(data: BundData, berm: BundBerm): BermScene | null {
  const width = berm.width
  if (width <= 0) return null
  const crossFall = Math.max(1, berm.crossFall)
  const slopeAbove = Math.max(0.01, berm.side === 'us' ? data.design.usSlope : data.design.dsSlope)
  const slopeBelow = Math.max(0.01, berm.slopeBelow ?? slopeAbove)
  // Face lengths drawn either side of the shelf, and the true cross-fall drop.
  const above = Math.max(1.1, width * 0.35)
  const below = Math.max(0.9, width * 0.3)
  const drop = width / crossFall
  const hasDrain = Boolean(berm.drainLiningMaterial || berm.drainExcavationMaterial)

  const runAbove = above * slopeAbove
  const runBelow = below * slopeBelow
  const xL = -(runAbove + 0.7)
  const yTL = -drop + (runAbove + 0.7) / slopeAbove
  const xR = width + runBelow + 0.9
  const yBR = -(runBelow + 0.9) / slopeBelow
  const yBottom = -below - 0.6

  // Shelf surface: low at the bund-side drain edge, at the shelf RL out wide.
  const yAt = (x: number): number => -drop + (x / width) * drop

  let drain: Array<[number, number]> | null = null
  if (hasDrain && berm.drainWidth > 0) {
    const dL = 0.25
    const dR = Math.min(0.25 + berm.drainWidth, width - 0.05)
    const invert = yAt(dL) - Math.max(0, berm.drainDepth)
    drain = [
      [dL, yAt(dL)],
      [dL, invert],
      [dR, invert],
      [dR, yAt(dR)]
    ]
  }

  const appearance = berm.surfaceMaterial ? bermSurfaceAppearance(berm.surfaceMaterial.code) : null
  const surface = appearance
    ? {
        kind:
          appearance === STONE_REVETMENT_APPEARANCE
            ? 'is-stone'
            : appearance === TURFING_APPEARANCE
              ? 'is-turf'
              : appearance === CC_PROTECTION_APPEARANCE
                ? 'is-cc'
                : '',
        label: appearance.label,
        fill: appearance.fill,
        stroke: appearance.stroke
      }
    : null

  const padLeft = runAbove + 0.4
  const padRight = width + runBelow + 0.5
  const mirrored = berm.side === 'us'
  return {
    side: berm.side,
    width,
    crossFall,
    drop,
    slopeAbove,
    slopeBelow,
    level: berm.level,
    runAbove,
    runBelow,
    hasDrain,
    world: {
      xMin: mirrored ? -padRight : -padLeft,
      xMax: mirrored ? padLeft : padRight,
      yMin: -below - 0.4,
      yMax: -drop + above + 0.4
    },
    ground: [
      [xL, yTL],
      [0, -drop],
      [width, 0],
      [xR, yBR],
      [xR, yBottom],
      [xL, yBottom]
    ],
    outline: [
      [xL, yTL],
      [0, -drop],
      [width, 0],
      [xR, yBR]
    ],
    drain,
    surface
  }
}

const bermPath = (
  points: Array<[number, number]>,
  X: (x: number) => number,
  Y: (y: number) => number,
  close = false
): string => points.map(([x, y], i) => `${i ? 'L' : 'M'} ${n1(X(x))} ${n1(Y(y))}`).join(' ') + (close ? ' Z' : '')

/** Berm — one generator for print and dashboard; `purpose` changes makeup only. */
export function bermFigure(data: BundData, berm: BundBerm, purpose: FigurePurpose = 'print'): string {
  return withPurpose(purpose, () => {
    const scene = bermScene(data, berm)
    if (!scene) return ''
    const crop = purpose === 'dashboard' ? 0.18 : 0
    const world: DetailWorld = {
      xMin: scene.world.xMin + crop,
      xMax: scene.world.xMax - crop,
      yMin: scene.world.yMin + crop * 0.5,
      yMax: scene.world.yMax - crop * 0.35
    }
    const appearance = scene.surface
      ? themedSlopeAppearance({
          fill: scene.surface.fill,
          stroke: scene.surface.stroke,
          label: scene.surface.label
        })
      : null

    const us = scene.side === 'us'
    const face = us ? 'U/S' : 'D/S'
    const rlCaption = `${face} berm · Shelf RL ${f2(scene.level)} m`
    return detailSvg({
      world,
      width: purpose === 'dashboard' ? 520 : 700,
      draw: (X, Y) => {
        const Xp = bermDrawX(X, scene.side)
        const ground =
          `<path d="${bermPath(scene.ground, Xp, Y, true)}" fill="${makeup.ground}" ` +
          `stroke="${makeup.groundLine}" stroke-width="${makeup.strokeGround}"/>`
        const drain = scene.drain
          ? `<polygon points="${scene.drain.map(([x, y]) => `${n1(Xp(x))},${n1(Y(y))}`).join(' ')}" ` +
            `fill="${makeup.waterFill}" stroke="${makeup.waterStroke}" stroke-width="${makeup.strokeDetail}"/>`
          : ''
        const surface = appearance
          ? `<polygon points="${n1(Xp(0))},${n1(Y(-scene.drop))} ${n1(Xp(scene.width))},${n1(Y(0))} ` +
            `${n1(Xp(scene.width))},${n1(Y(0) - 5)} ${n1(Xp(0))},${n1(Y(-scene.drop) - 5)}" ` +
            `fill="${appearance.fill}" stroke="${appearance.stroke}" stroke-width="1.1"/>`
          : ''
        const note = makeup.fontSizeSmall
        return (
          ground +
          surface +
          drain +
          figLabel(
            (X(world.xMin) + X(world.xMax)) / 2,
            Y(world.yMax) - 2,
            rlCaption,
            'middle',
            makeup.label,
            makeup.fontSize,
            'bold'
          ) +
          hDim(Xp(0), Xp(scene.width), Y(0) - 18, f2(scene.width)) +
          figLabel(
            Xp(0) + (us ? 8 : -6),
            Y(-scene.drop) - 8,
            `Shelf RL ${f2(scene.level)} m`,
            us ? 'start' : 'end',
            makeup.label,
            makeup.fontSize,
            'bold'
          ) +
          (appearance
            ? figLabel(
                Xp(scene.width / 2),
                Y(-scene.drop / 2) - 8,
                appearance.label,
                'middle',
                appearance.stroke,
                note
              )
            : '') +
          figLabel(
            Xp(scene.width / 2),
            Y(-scene.drop / 2) + 24,
            `cross-fall 1 in ${f2(scene.crossFall)}`,
            'middle',
            makeup.labelAccent,
            note
          ) +
          (scene.drain
            ? figLabel(
                Xp((scene.drain[0][0] + scene.drain[2][0]) / 2),
                Y(scene.drain[1][1]) + 14,
                'catch-water drain',
                'middle',
                makeup.mwl,
                note
              )
            : '') +
          figLabel(
            Xp(-scene.runAbove / 2),
            Y(-scene.drop + scene.runAbove / 2 / scene.slopeAbove) + 16,
            `face above 1 in ${f2(scene.slopeAbove)}`,
            'middle',
            makeup.labelAccent,
            note
          ) +
          figLabel(
            Xp(scene.width + scene.runBelow / 2),
            Y(-scene.runBelow / 2 / scene.slopeBelow) + 16,
            `face below 1 in ${f2(scene.slopeBelow)}`,
            'middle',
            makeup.labelAccent,
            note
          ) +
          figLabel(
            X(world.xMax) - 4,
            Y(world.yMin) + 14,
            'shelf is part of the design face',
            'end',
            makeup.labelMuted,
            note
          )
        )
      }
    })
  })
}

/**
 * Berm — the dashboard card. The same scene as the printed detail, styled
 * through the dashboard's own CSS classes so it follows the app theme, sized
 * for the narrow berm row instead of the page.
 */
export function bermScreenFigure(data: BundData, berm: BundBerm): string {
  const scene = bermScene(data, berm)
  if (!scene) return ''

  const note = (x: number, y: number, str: string, anchor: 'start' | 'middle' | 'end'): string =>
    `<text x="${n1(x)}" y="${n1(y)}" text-anchor="${anchor}" class="bund-berm-note">${str}</text>`
  const dim = (x1: number, x2: number, y: number, label: string): string =>
    `<line x1="${n1(x1)}" y1="${n1(y - 4)}" x2="${n1(x1)}" y2="${n1(y + 4)}" class="bund-toe-dim"/>` +
    `<line x1="${n1(x2)}" y1="${n1(y - 4)}" x2="${n1(x2)}" y2="${n1(y + 4)}" class="bund-toe-dim"/>` +
    `<line x1="${n1(x1)}" y1="${n1(y)}" x2="${n1(x2)}" y2="${n1(y)}" class="bund-toe-dim"/>` +
    `<text x="${n1((x1 + x2) / 2)}" y="${n1(y - 6)}" text-anchor="middle" class="bund-toe-dimlabel">${label}</text>`

  const us = scene.side === 'us'
  return detailSvg({
    world: scene.world,
    width: 360,
    defs: false,
    scaleBar: false,
    className: 'bund-berm-fig-svg',
    draw: (X, Y) => {
      const Xp = bermDrawX(X, scene.side)
      const body = `<path d="${bermPath(scene.ground, Xp, Y, true)}" class="bund-berm-body"/>`
      const outline = `<path d="${bermPath(scene.outline, Xp, Y)}" class="bund-berm-surface-line" fill="none"/>`
      const surfacing = scene.surface
        ? `<path d="M ${n1(Xp(0))} ${n1(Y(-scene.drop))} L ${n1(Xp(scene.width))} ${n1(Y(0))}" ` +
          `class="bund-berm-surfacing ${scene.surface.kind}" fill="none"/>`
        : ''
      const drain = scene.drain
        ? `<path d="${bermPath(scene.drain, Xp, Y, true)}" class="bund-berm-drain" fill="none"/>`
        : ''
      return (
        body +
        surfacing +
        drain +
        outline +
        dim(Xp(0), Xp(scene.width), Y(0) - 20, `shelf ${f2(scene.width)} m`) +
        note(
          Xp(0) + (us ? 8 : -6),
          Y(-scene.drop) - 8,
          `${us ? 'U/S' : 'D/S'} · Shelf RL ${f2(scene.level)} m`,
          us ? 'start' : 'end'
        ) +
        (scene.surface ? note(Xp(scene.width / 2), Y(-scene.drop / 2) - 8, scene.surface.label, 'middle') : '') +
        note(Xp(scene.width / 2), Y(-scene.drop / 2) + 26, `cross-fall 1 in ${f2(scene.crossFall)}`, 'middle') +
        (scene.drain
          ? note(
              Xp((scene.drain[0][0] + scene.drain[2][0]) / 2),
              Y(scene.drain[1][1]) + 14,
              `drain ${f2(berm.drainWidth)} × ${f2(berm.drainDepth)} m`,
              'middle'
            )
          : '') +
        note(
          Xp(-scene.runAbove / 2),
          Y(-scene.drop + scene.runAbove / 2 / scene.slopeAbove) + 16,
          `face above 1 in ${f2(scene.slopeAbove)}`,
          'middle'
        ) +
        note(
          Xp(scene.width + scene.runBelow / 2),
          Y(-scene.runBelow / 2 / scene.slopeBelow) + 16,
          `face below 1 in ${f2(scene.slopeBelow)}`,
          'middle'
        )
      )
    }
  })
}

/**
 * Internal drainage: the blanket running in from the downstream toe and the
 * chimney standing on its inner end, drawn inside the proposed section.
 */
export function filterFigure(data: BundData, section: BundSection): string {
  if (!internalFiltersAvailable(data) || !data.horizontalFilterMaterial) return ''
  const proj = [...projectedProfile(section, data.design)].sort((a, b) => a.offset - b.offset)
  if (proj.length < 2) return ''
  const dsToe = downstreamDesignToePointAt(section, data) ?? proj[proj.length - 1]
  const thickness = horizontalFilterThicknessM(data)
  const blanketLength = horizontalFilterLengthAt(section, data)
  const innerX = Math.max(dsToe.offset - blanketLength, data.design.topWidth / 2)
  const drawnLength = Math.max(0, dsToe.offset - innerX)
  const chimneyOn = Boolean(data.verticalFilterMaterial)
  const chimneyH = chimneyOn ? verticalFilterHeightAt(section, data) : 0
  const chimneyW = verticalFilterWidthM(data)
  const baseRl = lowestStrippedLevelAt(section, data) ?? dsToe.rl
  const sectionHeight = Math.max(0, data.design.topLevel - baseRl)

  const xMin = Math.min(...proj.map((p) => p.offset)) - 0.8
  const xMax = Math.max(...proj.map((p) => p.offset), dsToe.offset) + 0.8
  const spanX = Math.max(1, xMax - xMin)
  const kApprox = (700 - 44) / spanX
  const labelPadM = 54 / kApprox
  const yMin = Math.min(...proj.map((p) => p.rl), dsToe.rl) - Math.max(0.6, labelPadM)
  const yMax = Math.max(...proj.map((p) => p.rl)) + 0.6

  return detailSvg({
    world: { xMin, xMax, yMin, yMax },
    draw: (X, Y) => {
      const body =
        `<path d="${proj
          .map((p, i) => `${i ? 'L' : 'M'} ${n1(X(p.offset))} ${n1(Y(p.rl))}`)
          .join(' ')} L ${n1(X(dsToe.offset))} ${n1(Y(yMin))} L ${n1(X(proj[0].offset))} ${n1(
          Y(yMin)
        )} Z" fill="${GROUND}" stroke="${GROUND_LINE}" stroke-width="1.6"/>`
      const blanket =
        `<rect x="${n1(X(innerX))}" y="${n1(Y(dsToe.rl))}" ` +
        `width="${n1(Math.max(2, X(dsToe.offset) - X(innerX)))}" ` +
        `height="${n1(Math.max(3, Y(dsToe.rl - thickness) - Y(dsToe.rl)))}" ` +
        `fill="url(#bfFilter)" stroke="#7d9a5a" stroke-width="1.2"/>`
      const chimney =
        chimneyOn && chimneyH > 0
          ? `<rect x="${n1(X(innerX))}" y="${n1(Y(dsToe.rl + chimneyH))}" ` +
            `width="${n1(Math.max(3, X(innerX + chimneyW) - X(innerX)))}" ` +
            `height="${n1(
              Math.max(3, Y(dsToe.rl) - Y(dsToe.rl + chimneyH))
            )}" fill="url(#bfFilter)" stroke="#7d9a5a" stroke-width="1.2" stroke-dasharray="4 3"/>`
          : ''
      return (
        body +
        blanket +
        chimney +
        `<line x1="${n1(X(xMin))}" y1="${n1(Y(dsToe.rl))}" x2="${n1(X(xMax))}" y2="${n1(Y(dsToe.rl))}" stroke="#7f8b91" stroke-width="0.8"/>` +
        figLabel(X(xMin) + 3, Y(dsToe.rl) + 14, 'prepared base', 'start', '#7f8b91', 9.5) +
        (data.design.mwl != null && data.design.mwl > yMin && data.design.mwl < yMax
          ? `<line x1="${n1(X(xMin))}" y1="${n1(Y(data.design.mwl))}" x2="${n1(X(xMax))}" y2="${n1(Y(data.design.mwl))}" stroke="#4a90b8" stroke-width="0.9" stroke-dasharray="5 3"/>` +
            figLabel(X(xMax) - 3, Y(data.design.mwl) - 5, `MWL ${f2(data.design.mwl)}`, 'end', '#4a90b8', 9.5)
          : '') +
        hDim(X(innerX), X(dsToe.offset), Y(dsToe.rl) + 17, f2(drawnLength), true) +
        figLabel(
          X((innerX + dsToe.offset) / 2),
          Y(dsToe.rl) + 42,
          `blanket ${f2(drawnLength)} m × ${f2(thickness)} m thick`,
          'middle',
          '#5a7a4a',
          10.5
        ) +
        (chimneyOn && chimneyH > 0
          ? vDim(
              Y(dsToe.rl + chimneyH),
              Y(dsToe.rl),
              X(innerX + chimneyW) + 14,
              f2(chimneyH),
              'right'
            ) +
            figLabel(
              X(innerX + chimneyW / 2),
              Y(dsToe.rl + chimneyH) - 8,
              `chimney ${f2(chimneyH)} m high × ${f2(chimneyW)} m wide`,
              'middle',
              '#5a7a4a',
              10.5
            )
          : '') +
        figLabel(
          X(xMax) - 3,
          Y(yMin) - 5,
          `Section H ${f2(sectionHeight)} m · crest ${f2(data.design.topWidth)} m · ` +
            `1:${f2(data.design.usSlope)} u/s · 1:${f2(data.design.dsSlope)} d/s`,
          'end',
          '#7f8b91',
          9.5
        )
      )
    }
  })
}

/**
 * Diagrammatic general arrangement of the proposed (new-bund) section.
 * Dashboard (`BundAssemblyDiagram`) and print (`drawings.assembly`) both call
 * this function so there is one diagram pipeline, not two. `purpose` changes
 * fills, labels and crop only.
 */
export function assemblyFigure(
  data: BundData,
  section: BundSection,
  purpose: FigurePurpose = 'print'
): string {
  return withPurpose(purpose, () => {
  const design = data.design
  const proj = [...projectedProfile(section, design)].sort((a, b) => a.offset - b.offset)
  if (proj.length < 2) return ''

  const usToe = proj[0]
  const dsToe = downstreamDesignToePointAt(section, data) ?? proj[proj.length - 1]
  const half = design.topWidth / 2

  const hearting = isZonedBund(data) ? heartingRepairProfile(data, section) : []
  const heartingBase = isZonedBund(data) ? heartingBaseProfile(data, section) : []
  const trench = heartingTrenchEnabled(data)
    ? heartingTrenchProfile(data, section)
    : { top: [], bottom: [] }
  const hasTrench = trench.top.length >= 2 && trench.bottom.length >= 2

  const rockToeHeight = data.rockToeMaterial ? rockToeHeightAt(section, data) : 0
  const rockToeInnerX =
    dsToe.offset - rockToeBaseWidth(rockToeHeight, data, downstreamToeFaceSlope(section, data))
  const rockToeCrestInnerX = rockToeInnerX + data.rockToeInnerSlope * rockToeHeight
  const rockToeCrestOuterX = rockToeCrestInnerX + data.rockToeTopWidth

  const usTrenchOn = upstreamToeTrenchEnabled(data)
  const dsDrainOn = Boolean(data.downstreamToe.excavationMaterial)
  const dsDrainDepth = dsDrainOn ? toeDrainDepthAt(section, data) : 0
  const dsDrainTop = dsDrainOn ? toeDrainTopWidthAt(section, data) : 0

  const hFilterOn =
    internalFiltersAvailable(data) &&
    Boolean(data.horizontalFilterMaterial) &&
    data.horizontalFilterLength > 0
  const hFilterInnerX = Math.max(dsToe.offset - horizontalFilterLengthAt(section, data), half)
  const hFilterThickness = Math.max(0, data.horizontalFilterThickness)
  const vFilterOn = hFilterOn && Boolean(data.verticalFilterMaterial)
  const vFilterHeight = vFilterOn ? verticalFilterHeightAt(section, data) : 0

  const points = [
    ...proj,
    ...hearting,
    ...heartingBase,
    ...trench.top,
    ...trench.bottom,
    ...(rockToeHeight > 0 ? [{ offset: rockToeCrestOuterX, rl: dsToe.rl + rockToeHeight }] : []),
    ...(usTrenchOn
      ? [
          {
            offset: usToe.offset - data.upstreamToe.topWidth,
            rl: usToe.rl - data.upstreamToe.depth
          }
        ]
      : []),
    ...(dsDrainOn ? [{ offset: dsToe.offset + dsDrainTop, rl: dsToe.rl - dsDrainDepth }] : []),
    ...(vFilterOn
      ? [{ offset: hFilterInnerX, rl: dsToe.rl + hFilterThickness + vFilterHeight }]
      : [])
  ]
  const pad = purpose === 'dashboard' ? 0.25 : 0.8
  const xMin = Math.min(...points.map((p) => p.offset)) - pad
  const xMax = Math.max(...points.map((p) => p.offset)) + pad
  const yMin = Math.min(...points.map((p) => p.rl)) - (purpose === 'dashboard' ? 0.15 : 0.4)
  const yMax = Math.max(...points.map((p) => p.rl), design.topLevel) + (purpose === 'dashboard' ? 0.25 : 0.6)

  return detailSvg({
    world: { xMin, xMax, yMin, yMax },
    width: purpose === 'dashboard' ? 920 : 780,
    draw: (X, Y) => {
      const path = (list: { offset: number; rl: number }[]): string =>
        list.map((p, i) => `${i ? 'L' : 'M'} ${n1(X(p.offset))} ${n1(Y(p.rl))}`).join(' ')
      const closed = (list: { offset: number; rl: number }[]): string =>
        list.map((p) => `${n1(X(p.offset))},${n1(Y(p.rl))}`).join(' ')
      const note = makeup.fontSizeSmall

      let out =
        `<path d="${path(proj)} L ${n1(X(dsToe.offset))} ${n1(Y(yMin))} ` +
        `L ${n1(X(usToe.offset))} ${n1(Y(yMin))} Z" fill="${makeup.ground}" stroke="none"/>`

      if (design.mwl != null && design.mwl > yMin && design.mwl < yMax) {
        out +=
          `<line x1="${n1(X(xMin))}" y1="${n1(Y(design.mwl))}" x2="${n1(X(0))}" y2="${n1(
            Y(design.mwl)
          )}" stroke="${makeup.mwl}" stroke-width="1" stroke-dasharray="6 3"/>` +
          figLabel(X(xMin) + 3, Y(design.mwl) - 5, `MWL ${f2(design.mwl)}`, 'start', makeup.mwl, note)
      }
      if (design.ftl != null && design.ftl > yMin && design.ftl < yMax) {
        out +=
          `<line x1="${n1(X(xMin))}" y1="${n1(Y(design.ftl))}" x2="${n1(X(-half))}" y2="${n1(
            Y(design.ftl)
          )}" stroke="${makeup.ftl}" stroke-width="1" stroke-dasharray="3 3"/>` +
          figLabel(X(xMin) + 3, Y(design.ftl) + 12, `FTL ${f2(design.ftl)}`, 'start', makeup.ftl, note)
      }

      if (hFilterOn) {
        out +=
          `<rect x="${n1(X(hFilterInnerX))}" y="${n1(Y(dsToe.rl + hFilterThickness))}" ` +
          `width="${n1(Math.max(2, X(dsToe.offset) - X(hFilterInnerX)))}" ` +
          `height="${n1(Math.max(3, Y(dsToe.rl) - Y(dsToe.rl + hFilterThickness)))}" ` +
          `fill="${hatchUrl('Filter')}" stroke="#7d9a5a" stroke-width="1.1"/>`
      }
      if (vFilterOn && vFilterHeight > 0) {
        out +=
          `<rect x="${n1(X(hFilterInnerX))}" y="${n1(
            Y(dsToe.rl + hFilterThickness + vFilterHeight)
          )}" width="${n1(
            Math.max(3, X(hFilterInnerX + data.verticalFilterWidth) - X(hFilterInnerX))
          )}" height="${n1(
            Math.max(
              3,
              Y(dsToe.rl + hFilterThickness) - Y(dsToe.rl + hFilterThickness + vFilterHeight)
            )
          )}" fill="${hatchUrl('Filter')}" stroke="#7d9a5a" stroke-width="1.1" stroke-dasharray="4 3"/>`
      }

      if (hearting.length >= 2 && heartingBase.length >= 2) {
        out +=
          `<polygon points="${closed(hearting)} ${closed([...heartingBase].reverse())}" ` +
          `fill="${hatchUrl('Murum')}" stroke="#b8558c" stroke-width="1.4"/>`
      }
      if (hasTrench) {
        out +=
          `<polygon points="${closed(trench.top)} ${n1(X(trench.bottom[1].offset))},${n1(
            Y(trench.bottom[1].rl)
          )} ${n1(X(trench.bottom[0].offset))},${n1(Y(trench.bottom[0].rl))}" ` +
          `fill="${hatchUrl('Murum')}" stroke="#b8558c" stroke-width="1.3" stroke-dasharray="5 3"/>`
      }

      if (data.pitchingMaterial) {
        const face = proj.filter((p) => p.offset <= -half + 1e-6)
        if (face.length >= 2) {
          const appearance = themedSlopeAppearance(slopeSurfaceAppearance(data.pitchingMaterial))
          const subPx = Math.max(2, (appearance.subThicknessM ?? 0) * 12)
          const primaryPx = Math.max(3, (appearance.primaryThicknessM ?? pitchingThicknessM(data)) * 12)
          // A berm shelf is part of the earthwork unless it has its own
          // surfacing item. Draw pitching on each sloping run separately so a
          // horizontal shelf is never accidentally included in this hatch.
          for (let i = 1; i < face.length; i += 1) {
            const a = face[i - 1]
            const b = face[i]
            if (Math.abs(a.rl - b.rl) <= 1e-6) continue
            if (appearance.subFill) {
              out +=
                `<polygon points="${closed([a, b])} ${n1(X(b.offset))},${n1(
                  Y(b.rl) - subPx
                )} ${n1(X(a.offset))},${n1(Y(a.rl) - subPx)}" ` +
                `fill="${appearance.subFill}" stroke="${appearance.subStroke ?? appearance.stroke}" ` +
                `stroke-width="1"/>` +
                figLabel(
                  (X(a.offset) + X(b.offset)) / 2,
                  Y((a.rl + b.rl) / 2) - subPx / 2,
                  appearance.subLabel ?? 'sand bedding',
                  'middle',
                  appearance.subStroke ?? appearance.stroke,
                  9.5
                )
            }
            out +=
              `<polygon points="${closed([a, b])} ${n1(X(b.offset))},${n1(
                Y(b.rl) - subPx - primaryPx
              )} ${n1(X(a.offset))},${n1(Y(a.rl) - subPx - primaryPx)}" ` +
              `fill="${appearance.fill}" stroke="${appearance.stroke}" stroke-width="1.1"/>`
          }
        }
      }
      if (data.turfingMaterial) {
        const face = proj.filter((p) => p.offset >= half - 1e-6)
        if (face.length >= 2) {
          const appearance = themedSlopeAppearance(slopeSurfaceAppearance(data.turfingMaterial))
          const bandPx = Math.max(3, (appearance.primaryThicknessM ?? 0.1) * 12)
          out +=
            `<polygon points="${closed(face)} ${[...face]
              .reverse()
              .map((p) => `${n1(X(p.offset))},${n1(Y(p.rl) - bandPx)}`)
              .join(' ')}" fill="${appearance.fill}" stroke="${appearance.stroke}" ` +
            `stroke-width="1"/>`
        }
      }

      if (usTrenchOn) {
        const top = data.upstreamToe.topWidth
        const bottom = data.upstreamToe.bottomWidth
        const depth = data.upstreamToe.depth
        const inset = (top - bottom) / 2
        out +=
          `<polygon points="${n1(X(usToe.offset - top))},${n1(Y(usToe.rl))} ` +
          `${n1(X(usToe.offset))},${n1(Y(usToe.rl))} ` +
          `${n1(X(usToe.offset - inset))},${n1(Y(usToe.rl - depth))} ` +
          `${n1(X(usToe.offset - top + inset))},${n1(Y(usToe.rl - depth))}" ` +
          `fill="${makeup.usTrenchFill}" stroke="${makeup.usTrenchStroke}" stroke-width="1.2"/>`
      }
      if (rockToeHeight > 0) {
        out +=
          `<polygon points="${n1(X(rockToeInnerX))},${n1(Y(dsToe.rl))} ` +
          `${n1(X(rockToeCrestInnerX))},${n1(Y(dsToe.rl + rockToeHeight))} ` +
          `${n1(X(rockToeCrestOuterX))},${n1(Y(dsToe.rl + rockToeHeight))} ` +
          `${n1(X(dsToe.offset))},${n1(Y(dsToe.rl))}" ` +
          `fill="${hatchUrl('Rubble')}" stroke="#7c8b78" stroke-width="1.3"/>`
      }
      if (dsDrainOn && dsDrainDepth > 0) {
        out +=
          `<polygon points="${n1(X(dsToe.offset))},${n1(Y(dsToe.rl))} ` +
          `${n1(X(dsToe.offset + dsDrainTop))},${n1(Y(dsToe.rl))} ` +
          `${n1(X(dsToe.offset + dsDrainTop - data.downstreamToe.rightSlope * dsDrainDepth))},${n1(
            Y(dsToe.rl - dsDrainDepth)
          )} ${n1(X(dsToe.offset + data.downstreamToe.leftSlope * dsDrainDepth))},${n1(
            Y(dsToe.rl - dsDrainDepth)
          )}" fill="${makeup.waterFill}" stroke="${makeup.waterStroke}" stroke-width="1.2"/>`
      }

      // Protect only the actual shelf segment. A berm must never inherit the
      // adjacent U/S pitching or D/S turf merely because it shares that face.
      for (const berm of design.berms ?? []) {
        const shelf = proj.filter(
          (point) =>
            Math.abs(point.rl - berm.level) < 1e-6 &&
            (berm.side === 'us' ? point.offset < -half : point.offset > half)
        )
        if (shelf.length < 2) continue
        const a = shelf[0]
        const b = shelf[shelf.length - 1]
        if (berm.surfaceMaterial) {
          const appearance = themedSlopeAppearance(bermSurfaceAppearance(berm.surfaceMaterial.code))
          out +=
            `<polygon points="${closed([a, b])} ${n1(X(b.offset))},${n1(Y(b.rl) - 5)} ` +
            `${n1(X(a.offset))},${n1(Y(a.rl) - 5)}" fill="${appearance.fill}" ` +
            `stroke="${appearance.stroke}" stroke-width="1.1"/>`
        }
        if (berm.drainLiningMaterial || berm.drainExcavationMaterial) {
          const drainAt = berm.side === 'us' ? b : a
          out += `<circle cx="${n1(X(drainAt.offset))}" cy="${n1(Y(drainAt.rl) - 2.5)}" r="3.2" fill="${makeup.waterFill}" stroke="${makeup.mwl}" stroke-width="1"/>`
        }
      }

      out += `<path d="${path(proj)}" fill="none" stroke="${makeup.groundLine}" stroke-width="${makeup.strokeGround}"/>`
      for (const berm of design.berms ?? []) {
        const shelf = proj.filter(
          (point) =>
            Math.abs(point.rl - berm.level) < 1e-6 &&
            (berm.side === 'us' ? point.offset < -half : point.offset > half)
        )
        if (shelf.length < 2) continue
        const from = X(shelf[0].offset)
        const to = X(shelf[shelf.length - 1].offset)
        out +=
          `<line x1="${n1(from)}" y1="${n1(Y(berm.level))}" x2="${n1(to)}" y2="${n1(
            Y(berm.level)
          )}" stroke="${makeup.bermMark}" stroke-width="1.1" stroke-dasharray="5 3"/>`
      }

      out +=
        figLabel(X(0), Y(design.topLevel) - 9, `TBL ${f2(design.topLevel)}`, 'middle', makeup.label, makeup.fontSize) +
        hDim(X(-half), X(half), Y(design.topLevel) - 24, f2(design.topWidth)) +
        figLabel(
          X(usToe.offset),
          Y(usToe.rl) + 15,
          `1:${f2(design.usSlope)}`,
          'middle',
          makeup.labelAccent,
          note
        ) +
        figLabel(
          X(dsToe.offset),
          Y(dsToe.rl) + 15,
          `1:${f2(design.dsSlope)}`,
          'middle',
          makeup.labelAccent,
          note
        ) +
        figLabel(
          X(xMin) + 3,
          Y(yMax) + 4,
          'Diagrammatic — enabled elements only',
          'start',
          makeup.labelMuted,
          10
        )
      return out
    }
  })
  })
}
