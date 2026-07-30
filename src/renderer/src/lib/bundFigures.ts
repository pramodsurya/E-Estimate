// Dimensioned detail figures for the bund's printed estimate.
//
// Each figure is a scaled section through one component, drawn from the same
// fields the dashboard asks for — no dimension is invented here. They share one
// scaffold (`detailSvg`) that maps world metres to the page, so every drawing
// carries the same dimension arrows, hatch patterns and scale bar.

import type { BundBerm, BundData, BundSection, BundToe } from '../types/project'
import {
  downstreamDesignToePointAt,
  downstreamToeFaceSlope,
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
} from './bund'

const DIM = '#1a4a7a'

const n1 = (v: number): string => v.toFixed(1)
const f2 = (v: number): string => v.toFixed(2)

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
  /** Body of the drawing; receives world→page mappers and the metre scale. */
  draw: (X: (x: number) => number, Y: (y: number) => number, k: number) => string
}

/** Horizontal dimension with extension ticks, arrows and a centred label. */
export function hDim(x1: number, x2: number, y: number, label: string, below = false): string {
  return (
    `<line x1="${n1(x1)}" y1="${n1(y - 5)}" x2="${n1(x1)}" y2="${n1(y + 5)}" stroke="${DIM}" stroke-width="0.7"/>` +
    `<line x1="${n1(x2)}" y1="${n1(y - 5)}" x2="${n1(x2)}" y2="${n1(y + 5)}" stroke="${DIM}" stroke-width="0.7"/>` +
    `<line x1="${n1(x1)}" y1="${n1(y)}" x2="${n1(x2)}" y2="${n1(y)}" stroke="${DIM}" stroke-width="0.9" ` +
    `marker-start="url(#bfArrow)" marker-end="url(#bfArrow)"/>` +
    `<text x="${n1((x1 + x2) / 2)}" y="${n1(below ? y + 13 : y - 5)}" text-anchor="middle" fill="${DIM}" ` +
    `font-size="11" font-family="Arial">${label}</text>`
  )
}

/** Vertical dimension; the label is rotated alongside the line. */
export function vDim(y1: number, y2: number, x: number, label: string, side: 'left' | 'right' = 'left'): string {
  const tx = side === 'left' ? x - 5 : x + 5
  const my = (y1 + y2) / 2
  return (
    `<line x1="${n1(x - 5)}" y1="${n1(y1)}" x2="${n1(x + 5)}" y2="${n1(y1)}" stroke="${DIM}" stroke-width="0.7"/>` +
    `<line x1="${n1(x - 5)}" y1="${n1(y2)}" x2="${n1(x + 5)}" y2="${n1(y2)}" stroke="${DIM}" stroke-width="0.7"/>` +
    `<line x1="${n1(x)}" y1="${n1(y1)}" x2="${n1(x)}" y2="${n1(y2)}" stroke="${DIM}" stroke-width="0.9" ` +
    `marker-start="url(#bfArrow)" marker-end="url(#bfArrow)"/>` +
    `<text x="${n1(tx)}" y="${n1(my)}" text-anchor="middle" fill="${DIM}" font-size="11" font-family="Arial" ` +
    `transform="rotate(-90 ${n1(tx)} ${n1(my)})">${label}</text>`
  )
}

export function figLabel(
  x: number,
  y: number,
  text: string,
  anchor: 'start' | 'middle' | 'end' = 'middle',
  fill = '#33505f',
  size = 11
): string {
  return (
    `<text x="${n1(x)}" y="${n1(y)}" text-anchor="${anchor}" fill="${fill}" font-size="${size}" ` +
    `font-family="Arial">${text}</text>`
  )
}

/**
 * Scaffold shared by every detail: uniform scale in both axes so the section is
 * true shape, a metre scale bar, and the hatch patterns the figures fill with.
 */
function detailSvg(spec: DetailSpec): string {
  const width = spec.width ?? 700
  const height = spec.height ?? 250
  const mL = 74
  const mR = 74
  const mT = 30
  const mB = 54
  const { world } = spec
  const spanX = world.xMax - world.xMin
  const spanY = world.yMax - world.yMin
  if (spanX <= 0 || spanY <= 0) return ''
  const k = Math.min((width - mL - mR) / spanX, (height - mT - mB) / spanY)
  const X = (x: number): number => mL + (x - world.xMin) * k
  const Y = (y: number): number => mT + (world.yMax - y) * k

  const bars = Math.max(1, Math.min(3, Math.floor((width - mL - mR) / k)))
  const barY = height - 18
  let scale = ''
  for (let i = 0; i < bars; i += 1) {
    scale +=
      `<rect x="${n1(mL + i * k)}" y="${barY}" width="${n1(k)}" height="5.5" ` +
      `fill="${i % 2 ? '#fff' : '#222'}" stroke="#222" stroke-width="0.7"/>`
  }
  scale +=
    figLabel(mL, barY - 4, '0', 'start', '#555', 10.5) +
    figLabel(mL + bars * k, barY - 4, `${bars} m`, 'middle', '#555', 10.5) +
    figLabel(width - 6, barY + 5, 'All dimensions in metres', 'end', '#8a9aa5', 10)

  const defs =
    `<defs>` +
    `<marker id="bfArrow" markerUnits="userSpaceOnUse" markerWidth="9" markerHeight="8" refX="8" refY="3" ` +
    `orient="auto-start-reverse"><path d="M0,0 L8,3 L0,6 Z" fill="${DIM}"/></marker>` +
    `<pattern id="bfStone" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(30)">` +
    `<rect width="9" height="9" fill="#dfe6ea"/><line x1="0" y1="0" x2="0" y2="9" stroke="#8fa3b0" stroke-width="1.1"/></pattern>` +
    `<pattern id="bfMurum" width="6" height="6" patternUnits="userSpaceOnUse">` +
    `<rect width="6" height="6" fill="#f0e4cf"/><circle cx="3" cy="3" r="0.9" fill="#c2a06a"/></pattern>` +
    `<pattern id="bfRubble" width="13" height="13" patternUnits="userSpaceOnUse">` +
    `<rect width="13" height="13" fill="#e6e9e5"/>` +
    `<path d="M2 7 L6 2 L10 7 L6 11 Z" fill="none" stroke="#7c8b78" stroke-width="1"/></pattern>` +
    `<pattern id="bfFilter" width="7" height="7" patternUnits="userSpaceOnUse">` +
    `<rect width="7" height="7" fill="#eef3e8"/><circle cx="2" cy="2" r="0.8" fill="#8aa06a"/>` +
    `<circle cx="5" cy="5" r="0.8" fill="#8aa06a"/></pattern>` +
    `</defs>`

  return (
    `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" class="bp-fig">` +
    defs +
    spec.draw(X, Y, k) +
    scale +
    `</svg>`
  )
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
  const run = 2.6
  const tR = 0
  const tL = -top
  const bL = -(top + bottom) / 2
  const bR = bL + bottom

  return detailSvg({
    world: { xMin: tL - 1.1, xMax: run, yMin: -(depth + 0.45), yMax: run * face + 0.7 },
    draw: (X, Y) => {
      const ground =
        `<path d="M ${n1(X(tL - 1.1))} ${n1(Y(0))} L ${n1(X(tL))} ${n1(Y(0))} ` +
        `L ${n1(X(bL))} ${n1(Y(-depth))} L ${n1(X(bR))} ${n1(Y(-depth))} L ${n1(X(tR))} ${n1(Y(0))} ` +
        `L ${n1(X(run))} ${n1(Y(run * face))} L ${n1(X(run))} ${n1(Y(-(depth + 0.45)))} ` +
        `L ${n1(X(tL - 1.1))} ${n1(Y(-(depth + 0.45)))} Z" fill="${GROUND}" stroke="${GROUND_LINE}" stroke-width="1.6"/>`
      const key =
        `<path d="M ${n1(X(tL))} ${n1(Y(0))} L ${n1(X(bL))} ${n1(Y(-depth))} ` +
        `L ${n1(X(bR))} ${n1(Y(-depth))} L ${n1(X(tR))} ${n1(Y(0))} Z" ` +
        `fill="url(#bfStone)" stroke="#5a6b76" stroke-width="1.4"/>`
      return (
        ground +
        key +
        vDim(Y(0), Y(-depth), X(tR) + 44, f2(depth), 'right') +
        hDim(X(tL), X(tR), Y(0) - 24, f2(top)) +
        hDim(X(bL), X(bR), Y(-depth) + 26, f2(bottom), true) +
        figLabel(X((tL + tR) / 2), Y(-depth / 2), 'Cut-off trench', 'middle', '#22414f') +
        figLabel(X(tL - 1.05), Y(0) - 8, 'Trimmed ground', 'start', '#7a6a52') +
        figLabel(X(run * 0.55), Y(run * 0.55 * face + 0.28), `U/S face 1:${f2(data.design.usSlope)}`, 'middle', '#5a7a90')
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
  const back = 2.1
  const tL = 0
  const bL = left * d
  const bR = bL + base
  const tR = bR + right * d
  const water = Math.min(0.4, d * 0.35)

  return detailSvg({
    world: { xMin: -back, xMax: tR + 1.1, yMin: -(d + 0.4), yMax: back * face + 0.5 },
    draw: (X, Y) => {
      const ground =
        `<path d="M ${n1(X(-back))} ${n1(Y(back * face))} L ${n1(X(tL))} ${n1(Y(0))} ` +
        `L ${n1(X(bL))} ${n1(Y(-d))} L ${n1(X(bR))} ${n1(Y(-d))} L ${n1(X(tR))} ${n1(Y(0))} ` +
        `L ${n1(X(tR + 1.1))} ${n1(Y(0))} L ${n1(X(tR + 1.1))} ${n1(Y(-(d + 0.4)))} ` +
        `L ${n1(X(-back))} ${n1(Y(-(d + 0.4)))} Z" fill="${GROUND}" stroke="${GROUND_LINE}" stroke-width="1.6"/>`
      const flow =
        `<path d="M ${n1(X(bL - left * water))} ${n1(Y(-d + water))} L ${n1(X(bL))} ${n1(Y(-d))} ` +
        `L ${n1(X(bR))} ${n1(Y(-d))} L ${n1(X(bR + right * water))} ${n1(Y(-d + water))} Z" ` +
        `fill="#d9ecf6" stroke="#5aa9d6" stroke-width="1.1"/>`
      return (
        ground +
        flow +
        vDim(Y(0), Y(-d), X(tR) + 44, f2(d), 'right') +
        hDim(X(bL), X(bR), Y(-d) + 26, f2(base), true) +
        hDim(X(tL), X(tR), Y(0) - 24, f2(tR - tL)) +
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
export function rockToeFigure(data: BundData): string {
  const top = data.rockToeTopWidth
  const height = data.rockToeHeight
  const inner = data.rockToeInnerSlope
  const outer = data.design.dsSlope
  const exc = data.rockToeExcavationDepth
  const hasFilter = Boolean(data.rockToeFilterMaterial)
  if (top <= 0 || height <= 0) return ''

  // Toe at x = 0; the zone rises to the left against the face.
  const innerTopX = -height * inner
  const outerBotX = height * outer
  const filterBelow = hasFilter ? 1 : 0
  const cut = Math.max(exc, filterBelow)

  return detailSvg({
    world: {
      xMin: innerTopX - 1.5,
      xMax: outerBotX + 1.2,
      yMin: -(cut + 0.5),
      yMax: height + 0.9
    },
    height: 270,
    draw: (X, Y) => {
      const ground =
        `<path d="M ${n1(X(innerTopX - 1.5))} ${n1(Y(height + (1.5 / outer)))} ` +
        `L ${n1(X(innerTopX))} ${n1(Y(height))} L ${n1(X(outerBotX))} ${n1(Y(0))} ` +
        `L ${n1(X(outerBotX + 1.2))} ${n1(Y(0))} L ${n1(X(outerBotX + 1.2))} ${n1(Y(-(cut + 0.5)))} ` +
        `L ${n1(X(innerTopX - 1.5))} ${n1(Y(-(cut + 0.5)))} Z" fill="${GROUND}" stroke="${GROUND_LINE}" stroke-width="1.6"/>`
      const foundation = cut
        ? `<path d="M ${n1(X(innerTopX))} ${n1(Y(0))} L ${n1(X(innerTopX))} ${n1(Y(-cut))} ` +
          `L ${n1(X(outerBotX))} ${n1(Y(-cut))} L ${n1(X(outerBotX))} ${n1(Y(0))} Z" ` +
          `fill="#f5f0e6" stroke="#b9a98c" stroke-width="1" stroke-dasharray="4 3"/>`
        : ''
      const filter = hasFilter
        ? `<path d="M ${n1(X(innerTopX))} ${n1(Y(0))} L ${n1(X(outerBotX))} ${n1(Y(0))} ` +
          `L ${n1(X(outerBotX))} ${n1(Y(-1))} L ${n1(X(innerTopX))} ${n1(Y(-1))} Z" ` +
          `fill="url(#bfFilter)" stroke="#7d9257" stroke-width="1.1"/>`
        : ''
      const rubble =
        `<path d="M ${n1(X(innerTopX))} ${n1(Y(height))} L ${n1(X(innerTopX + top))} ${n1(Y(height))} ` +
        `L ${n1(X(outerBotX))} ${n1(Y(0))} L ${n1(X(innerTopX))} ${n1(Y(0))} Z" ` +
        `fill="url(#bfRubble)" stroke="#59684f" stroke-width="1.5"/>`
      return (
        ground +
        foundation +
        filter +
        rubble +
        vDim(Y(height), Y(0), X(outerBotX) + 44, f2(height), 'right') +
        hDim(X(innerTopX), X(innerTopX + top), Y(height) - 24, f2(top)) +
        (cut ? vDim(Y(0), Y(-cut), X(innerTopX) - 34, f2(cut), 'left') : '') +
        figLabel(X(innerTopX + top * 0.45), Y(height * 0.45), 'Rock toe', 'middle', '#33452c') +
        figLabel(X(innerTopX - height * inner * 0.3), Y(height * 0.6), `inner 1:${f2(inner)}`, 'end', '#5a7a90', 10.5) +
        figLabel(X(outerBotX * 0.6), Y(height * 0.42), `outer 1:${f2(outer)}`, 'start', '#5a7a90', 10.5) +
        (hasFilter
          ? figLabel(X((innerTopX + outerBotX) / 2), Y(-0.5), 'graded filter 1.00 m below', 'middle', '#5c7040', 10.5)
          : '') +
        (cut
          ? figLabel(X((innerTopX + outerBotX) / 2), Y(-cut) + 14, 'foundation excavation', 'middle', '#8a7a5c', 10.5)
          : '')
      )
    }
  })
}

/** Chute drain — rectangular channel down the d/s face with its protection. */
export function chuteFigure(data: BundData): string {
  const w = data.chuteDrainWidth
  const d = data.chuteDrainDepth
  const t = data.chuteDrainLiningThickness
  if (w <= 0 || d <= 0) return ''
  const stone = data.chuteDrainProtectionType === 'stone'

  return detailSvg({
    world: { xMin: -(w * 0.85 + t), xMax: w * 1.85 + t, yMin: -(d + t + 0.2), yMax: 0.45 },
    height: 210,
    draw: (X, Y) => {
      const ground =
        `<path d="M ${n1(X(-(w * 0.85 + t)))} ${n1(Y(0))} L ${n1(X(0))} ${n1(Y(0))} ` +
        `L ${n1(X(0))} ${n1(Y(-d))} L ${n1(X(w))} ${n1(Y(-d))} L ${n1(X(w))} ${n1(Y(0))} ` +
        `L ${n1(X(w * 1.85 + t))} ${n1(Y(0))} L ${n1(X(w * 1.85 + t))} ${n1(Y(-(d + t + 0.2)))} ` +
        `L ${n1(X(-(w * 0.85 + t)))} ${n1(Y(-(d + t + 0.2)))} Z" fill="${GROUND}" stroke="${GROUND_LINE}" stroke-width="1.6"/>`
      const lining =
        `<path d="M ${n1(X(-t))} ${n1(Y(0))} L ${n1(X(-t))} ${n1(Y(-d - t))} ` +
        `L ${n1(X(w + t))} ${n1(Y(-d - t))} L ${n1(X(w + t))} ${n1(Y(0))} ` +
        `L ${n1(X(w))} ${n1(Y(0))} L ${n1(X(w))} ${n1(Y(-d))} L ${n1(X(0))} ${n1(Y(-d))} ` +
        `L ${n1(X(0))} ${n1(Y(0))} Z" fill="url(#bfStone)" stroke="#5a6b76" stroke-width="1.3"/>`
      return (
        ground +
        lining +
        vDim(Y(0), Y(-d), X(w) + 40, f2(d), 'right') +
        hDim(X(0), X(w), Y(-d) + 24, f2(w), true) +
        hDim(X(-t), X(0), Y(0) - 22, f2(t)) +
        figLabel(X(w / 2), Y(-d / 2), 'channel', 'middle', '#4a90b8', 10.5) +
        figLabel(X(w + t), Y(-d - t) - 6, stone ? 'Stone protection' : 'CC protection', 'end', '#33505f', 10.5)
      )
    }
  })
}

/** Berm — the shelf cut into a face, its cross-fall and catch-water drain. */
export function bermFigure(data: BundData, berm: BundBerm): string {
  const width = berm.width
  const crossFall = Math.max(1, berm.crossFall)
  if (width <= 0) return ''
  const faceSlope = berm.side === 'us' ? data.design.usSlope : data.design.dsSlope
  const face = 1 / Math.max(0.01, faceSlope)
  const above = 2.2
  const below = 2.2
  const drop = width / crossFall
  const hasDrain = Boolean(berm.drainLiningMaterial || berm.drainExcavationMaterial)
  const dw = berm.drainWidth
  const dd = berm.drainDepth

  return detailSvg({
    world: {
      xMin: -above / face - 0.7,
      xMax: width + below / face + 0.9,
      yMin: -below - 0.6,
      yMax: above + 1
    },
    height: 260,
    draw: (X, Y) => {
      const ground =
        `<path d="M ${n1(X(-above / face - 0.7))} ${n1(Y(above))} L ${n1(X(0))} ${n1(Y(0))} ` +
        `L ${n1(X(width))} ${n1(Y(-drop))} ` +
        `L ${n1(X(width + below / face + 0.9))} ${n1(Y(-drop - (below / face + 0.9) * face))} ` +
        `L ${n1(X(width + below / face + 0.9))} ${n1(Y(-below - 0.6))} ` +
        `L ${n1(X(-above / face - 0.7))} ${n1(Y(-below - 0.6))} Z" ` +
        `fill="${GROUND}" stroke="${GROUND_LINE}" stroke-width="1.7"/>`
      const drain = hasDrain
        ? `<path d="M ${n1(X(0.25))} ${n1(Y(0))} L ${n1(X(0.25))} ${n1(Y(-dd))} ` +
          `L ${n1(X(0.25 + dw))} ${n1(Y(-dd))} L ${n1(X(0.25 + dw))} ${n1(Y(-drop * (dw / width)))} Z" ` +
          `fill="#d9ecf6" stroke="#5aa9d6" stroke-width="1.3"/>`
        : ''
      return (
        ground +
        drain +
        hDim(X(0), X(width), Y(0) - 20, f2(width)) +
        `<line x1="${n1(X(-above / face - 0.7))}" y1="${n1(Y(0))}" x2="${n1(X(0))}" y2="${n1(Y(0))}" ` +
        `stroke="#9aa8b2" stroke-width="0.8" stroke-dasharray="4 3"/>` +
        figLabel(X(0) - 6, Y(0) - 8, `Shelf RL ${f2(berm.level)}`, 'end', '#33505f', 10.5) +
        figLabel(X(width / 2), Y(-drop) + 26, `cross-fall 1 in ${f2(crossFall)}`, 'middle', '#5a7a90', 10.5) +
        (hasDrain
          ? figLabel(X(0.25 + dw / 2), Y(-dd) + 14, 'catch-water drain', 'middle', '#4a90b8', 10.5)
          : '') +
        figLabel(X(width + 0.3), Y(0) - 8, 'shelf is part of the design face', 'start', '#7a6a52', 10.5)
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
  const thickness = Math.max(0, data.horizontalFilterThickness)
  const innerX = Math.max(dsToe.offset - data.horizontalFilterLength, data.design.topWidth / 2)
  const chimneyOn = Boolean(data.verticalFilterMaterial)
  const chimneyH = chimneyOn ? verticalFilterHeightAt(section, data) : 0

  const xMin = Math.min(...proj.map((p) => p.offset)) - 0.8
  const xMax = Math.max(...proj.map((p) => p.offset), dsToe.offset) + 0.8
  const yMin = Math.min(...proj.map((p) => p.rl), dsToe.rl) - 0.6
  const yMax = Math.max(...proj.map((p) => p.rl)) + 0.6

  return detailSvg({
    world: { xMin, xMax, yMin, yMax },
    height: 280,
    draw: (X, Y) => {
      const body =
        `<path d="${proj
          .map((p, i) => `${i ? 'L' : 'M'} ${n1(X(p.offset))} ${n1(Y(p.rl))}`)
          .join(' ')} L ${n1(X(dsToe.offset))} ${n1(Y(yMin))} L ${n1(X(proj[0].offset))} ${n1(
          Y(yMin)
        )} Z" fill="${GROUND}" stroke="${GROUND_LINE}" stroke-width="1.6"/>`
      const blanket =
        `<rect x="${n1(X(innerX))}" y="${n1(Y(dsToe.rl + thickness))}" ` +
        `width="${n1(Math.max(2, X(dsToe.offset) - X(innerX)))}" ` +
        `height="${n1(Math.max(3, Y(dsToe.rl) - Y(dsToe.rl + thickness)))}" ` +
        `fill="url(#bfFilter)" stroke="#7d9a5a" stroke-width="1.2"/>`
      const chimney =
        chimneyOn && chimneyH > 0
          ? `<rect x="${n1(X(innerX))}" y="${n1(Y(dsToe.rl + thickness + chimneyH))}" ` +
            `width="${n1(Math.max(3, X(innerX + data.verticalFilterWidth) - X(innerX)))}" ` +
            `height="${n1(
              Math.max(3, Y(dsToe.rl + thickness) - Y(dsToe.rl + thickness + chimneyH))
            )}" fill="url(#bfFilter)" stroke="#7d9a5a" stroke-width="1.2" stroke-dasharray="4 3"/>`
          : ''
      return (
        body +
        blanket +
        chimney +
        hDim(X(innerX), X(dsToe.offset), Y(dsToe.rl) + 24, f2(dsToe.offset - innerX), true) +
        figLabel(
          X((innerX + dsToe.offset) / 2),
          Y(dsToe.rl) + 40,
          `blanket ${f2(thickness)} m thick`,
          'middle',
          '#5a7a4a',
          10.5
        ) +
        (chimneyOn && chimneyH > 0
          ? vDim(
              Y(dsToe.rl + thickness + chimneyH),
              Y(dsToe.rl + thickness),
              X(innerX) - 14,
              f2(chimneyH),
              'left'
            ) +
            figLabel(
              X(innerX),
              Y(dsToe.rl + thickness + chimneyH) - 8,
              `chimney ${f2(data.verticalFilterWidth)} m wide`,
              'middle',
              '#5a7a4a',
              10.5
            )
          : '')
      )
    }
  })
}

/**
 * Diagrammatic general arrangement: the proposed section at the tallest
 * chainage with every enabled element drawn where it sits. Printed in place of
 * the phreatic check on a zoned bund, whose seepage is governed by its
 * impervious core rather than by a line through a homogeneous body.
 *
 * A sketch, not a measured drawing — each element carries its own dimensioned
 * detail elsewhere in these pages. Nothing switched off is drawn, so the
 * arrangement always matches the items being billed.
 */
export function assemblyFigure(data: BundData, section: BundSection): string {
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
  const hFilterInnerX = Math.max(dsToe.offset - data.horizontalFilterLength, half)
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
  const xMin = Math.min(...points.map((p) => p.offset)) - 1.2
  const xMax = Math.max(...points.map((p) => p.offset)) + 1.2
  const yMin = Math.min(...points.map((p) => p.rl)) - 0.8
  const yMax = Math.max(...points.map((p) => p.rl), design.topLevel) + 1

  return detailSvg({
    world: { xMin, xMax, yMin, yMax },
    width: 780,
    height: 330,
    draw: (X, Y) => {
      const path = (list: { offset: number; rl: number }[]): string =>
        list.map((p, i) => `${i ? 'L' : 'M'} ${n1(X(p.offset))} ${n1(Y(p.rl))}`).join(' ')
      const closed = (list: { offset: number; rl: number }[]): string =>
        list.map((p) => `${n1(X(p.offset))},${n1(Y(p.rl))}`).join(' ')

      let out =
        `<path d="${path(proj)} L ${n1(X(dsToe.offset))} ${n1(Y(yMin))} ` +
        `L ${n1(X(usToe.offset))} ${n1(Y(yMin))} Z" fill="${GROUND}" stroke="none"/>`

      if (design.mwl != null && design.mwl > yMin && design.mwl < yMax) {
        out +=
          `<line x1="${n1(X(xMin))}" y1="${n1(Y(design.mwl))}" x2="${n1(X(0))}" y2="${n1(
            Y(design.mwl)
          )}" stroke="#4a90b8" stroke-width="1" stroke-dasharray="6 3"/>` +
          figLabel(X(xMin) + 3, Y(design.mwl) - 5, `MWL ${f2(design.mwl)}`, 'start', '#4a90b8', 10.5)
      }
      if (design.ftl != null && design.ftl > yMin && design.ftl < yMax) {
        out +=
          `<line x1="${n1(X(xMin))}" y1="${n1(Y(design.ftl))}" x2="${n1(X(-half))}" y2="${n1(
            Y(design.ftl)
          )}" stroke="#4a8f7d" stroke-width="1" stroke-dasharray="3 3"/>` +
          figLabel(X(xMin) + 3, Y(design.ftl) + 12, `FTL ${f2(design.ftl)}`, 'start', '#4a8f7d', 10.5)
      }

      if (hFilterOn) {
        out +=
          `<rect x="${n1(X(hFilterInnerX))}" y="${n1(Y(dsToe.rl + hFilterThickness))}" ` +
          `width="${n1(Math.max(2, X(dsToe.offset) - X(hFilterInnerX)))}" ` +
          `height="${n1(Math.max(3, Y(dsToe.rl) - Y(dsToe.rl + hFilterThickness)))}" ` +
          `fill="url(#bfFilter)" stroke="#7d9a5a" stroke-width="1.1"/>`
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
          )}" fill="url(#bfFilter)" stroke="#7d9a5a" stroke-width="1.1" stroke-dasharray="4 3"/>`
      }

      if (hearting.length >= 2 && heartingBase.length >= 2) {
        out +=
          `<polygon points="${closed(hearting)} ${closed([...heartingBase].reverse())}" ` +
          `fill="url(#bfMurum)" stroke="#b8558c" stroke-width="1.4"/>`
      }
      if (hasTrench) {
        out +=
          `<polygon points="${closed(trench.top)} ${n1(X(trench.bottom[1].offset))},${n1(
            Y(trench.bottom[1].rl)
          )} ${n1(X(trench.bottom[0].offset))},${n1(Y(trench.bottom[0].rl))}" ` +
          `fill="url(#bfMurum)" stroke="#b8558c" stroke-width="1.3" stroke-dasharray="5 3"/>`
      }

      if (data.pitchingMaterial) {
        const face = proj.filter((p) => p.offset <= -half + 1e-6)
        if (face.length >= 2) {
          const lift = Math.max(3, pitchingThicknessM(data) * 12)
          out +=
            `<polygon points="${closed(face)} ${[...face]
              .reverse()
              .map((p) => `${n1(X(p.offset))},${n1(Y(p.rl) - lift)}`)
              .join(' ')}" fill="url(#bfStone)" stroke="#5a6b76" stroke-width="1.1"/>`
        }
      }
      if (data.turfingMaterial) {
        const face = proj.filter((p) => p.offset >= half - 1e-6)
        if (face.length >= 2) {
          out +=
            `<polygon points="${closed(face)} ${[...face]
              .reverse()
              .map((p) => `${n1(X(p.offset))},${n1(Y(p.rl) - 5)}`)
              .join(' ')}" fill="#cfe6cb" stroke="#6f9a68" stroke-width="1"/>`
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
          `fill="#dfe6ea" stroke="#6d7780" stroke-width="1.2"/>`
      }
      if (rockToeHeight > 0) {
        out +=
          `<polygon points="${n1(X(rockToeInnerX))},${n1(Y(dsToe.rl))} ` +
          `${n1(X(rockToeCrestInnerX))},${n1(Y(dsToe.rl + rockToeHeight))} ` +
          `${n1(X(rockToeCrestOuterX))},${n1(Y(dsToe.rl + rockToeHeight))} ` +
          `${n1(X(dsToe.offset))},${n1(Y(dsToe.rl))}" ` +
          `fill="url(#bfRubble)" stroke="#7c8b78" stroke-width="1.3"/>`
      }
      if (dsDrainOn && dsDrainDepth > 0) {
        out +=
          `<polygon points="${n1(X(dsToe.offset))},${n1(Y(dsToe.rl))} ` +
          `${n1(X(dsToe.offset + dsDrainTop))},${n1(Y(dsToe.rl))} ` +
          `${n1(X(dsToe.offset + dsDrainTop - data.downstreamToe.rightSlope * dsDrainDepth))},${n1(
            Y(dsToe.rl - dsDrainDepth)
          )} ${n1(X(dsToe.offset + data.downstreamToe.leftSlope * dsDrainDepth))},${n1(
            Y(dsToe.rl - dsDrainDepth)
          )}" fill="#d9ecf6" stroke="#5aa9d6" stroke-width="1.2"/>`
      }

      out += `<path d="${path(proj)}" fill="none" stroke="${GROUND_LINE}" stroke-width="1.8"/>`
      for (const berm of design.berms ?? []) {
        const from = berm.side === 'us' ? X(xMin) : X(half)
        const to = berm.side === 'us' ? X(-half) : X(xMax)
        out +=
          `<line x1="${n1(from)}" y1="${n1(Y(berm.level))}" x2="${n1(to)}" y2="${n1(
            Y(berm.level)
          )}" stroke="#c19a3d" stroke-width="1.1" stroke-dasharray="5 3"/>`
      }

      out +=
        figLabel(X(0), Y(design.topLevel) - 9, `TBL ${f2(design.topLevel)}`, 'middle', '#33505f', 11) +
        hDim(X(-half), X(half), Y(design.topLevel) - 24, f2(design.topWidth)) +
        figLabel(
          X(usToe.offset),
          Y(usToe.rl) + 15,
          `1:${f2(design.usSlope)}`,
          'middle',
          '#5a7a90',
          10.5
        ) +
        figLabel(
          X(dsToe.offset),
          Y(dsToe.rl) + 15,
          `1:${f2(design.dsSlope)}`,
          'middle',
          '#5a7a90',
          10.5
        ) +
        figLabel(
          X(xMin) + 3,
          Y(yMax) + 4,
          'Diagrammatic — enabled elements only',
          'start',
          '#8a9aa5',
          10
        )
      return out
    }
  })
}
