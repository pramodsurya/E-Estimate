// Longitudinal section through a new MI tank sluice, drawn to scale from the
// same fields the dashboard asks for — nothing here is invented. Returned as an
// SVG string so the dashboard and the printed detailed estimate show the exact
// same drawing (the dashboard renders this markup directly).

import type { MiSluiceNewData } from '../types/project'
import { openingCrownLevel, openingHeight, openingLabel } from './miSluiceNew'

const DIM = '#1a4a7a'
const CONCRETE = '#dcdcd2'
const PCC = '#c9c9c0'
const EARTH = '#d9c9a8'
const WATER = '#cfe6f3'
const STEEL = '#7a828a'

const n1 = (value: number): string => value.toFixed(1)
const f2 = (value: number): string => value.toFixed(2)

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** Horizontal dimension with extension ticks, arrows and a centred label. */
function hDim(x1: number, x2: number, y: number, label: string, below = false): string {
  if (Math.abs(x2 - x1) < 6) return ''
  return (
    `<line x1="${n1(x1)}" y1="${n1(y - 5)}" x2="${n1(x1)}" y2="${n1(y + 5)}" stroke="${DIM}" stroke-width="0.7"/>` +
    `<line x1="${n1(x2)}" y1="${n1(y - 5)}" x2="${n1(x2)}" y2="${n1(y + 5)}" stroke="${DIM}" stroke-width="0.7"/>` +
    `<line x1="${n1(x1)}" y1="${n1(y)}" x2="${n1(x2)}" y2="${n1(y)}" stroke="${DIM}" stroke-width="0.9" ` +
    `marker-start="url(#msArrow)" marker-end="url(#msArrow)"/>` +
    `<text x="${n1((x1 + x2) / 2)}" y="${n1(below ? y + 13 : y - 5)}" text-anchor="middle" fill="${DIM}" ` +
    `font-size="11" font-family="Arial">${esc(label)}</text>`
  )
}

/** Vertical dimension; the label rides alongside the line. */
function vDim(y1: number, y2: number, x: number, label: string, side: 'left' | 'right' = 'left'): string {
  if (Math.abs(y2 - y1) < 6) return ''
  const tx = side === 'left' ? x - 5 : x + 5
  const my = (y1 + y2) / 2
  return (
    `<line x1="${n1(x - 5)}" y1="${n1(y1)}" x2="${n1(x + 5)}" y2="${n1(y1)}" stroke="${DIM}" stroke-width="0.7"/>` +
    `<line x1="${n1(x - 5)}" y1="${n1(y2)}" x2="${n1(x + 5)}" y2="${n1(y2)}" stroke="${DIM}" stroke-width="0.7"/>` +
    `<line x1="${n1(x)}" y1="${n1(y1)}" x2="${n1(x)}" y2="${n1(y2)}" stroke="${DIM}" stroke-width="0.9" ` +
    `marker-start="url(#msArrow)" marker-end="url(#msArrow)"/>` +
    `<text x="${n1(tx)}" y="${n1(my)}" text-anchor="middle" fill="${DIM}" font-size="11" font-family="Arial" ` +
    `transform="rotate(-90 ${n1(tx)} ${n1(my)})">${esc(label)}</text>`
  )
}

function rect(
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  stroke = '#222',
  strokeWidth = 1.2
): string {
  if (w <= 0 || h <= 0) return ''
  return (
    `<rect x="${n1(x)}" y="${n1(y)}" width="${n1(w)}" height="${n1(h)}" fill="${fill}" ` +
    `stroke="${stroke}" stroke-width="${strokeWidth}"/>`
  )
}

function label(x: number, y: number, text: string, anchor = 'middle', size = 10.5): string {
  return (
    `<text x="${n1(x)}" y="${n1(y)}" text-anchor="${anchor}" fill="#333" font-size="${size}" ` +
    `font-family="Arial">${esc(text)}</text>`
  )
}

const positive = (value: number, fallback: number): number =>
  Number.isFinite(value) && value > 0 ? value : fallback

export interface MiSluiceFigureOptions {
  width?: number
  height?: number
}

/**
 * The section runs left (tank side) to right (canal side): approach water, the
 * intake headwall or tower carrying the gate and hoist, the barrel through the
 * bund, the downstream headwall and the stilling basin, all on the levelling
 * course with its cut-off walls. The bund itself is drawn only to place the
 * structure and is labelled as indicative.
 */
export function miSluiceSectionSvg(
  data: MiSluiceNewData,
  options: MiSluiceFigureOptions = {}
): string {
  const W = options.width ?? 880
  const H = options.height ?? 470
  const mL = 54
  const mR = 104
  const mT = 34
  const mB = 66

  const vent = positive(openingHeight(data), 1)
  const sill = data.levels.sill
  const crown = openingCrownLevel(data)
  // Concrete surrounding one vent, top and bottom, from the barrel's outer size.
  const cover = Math.max((positive(data.barrel.outerHeight, vent + 0.6) - vent) / 2, 0.15)
  const barrelBottom = sill - cover
  const barrelTop = crown + cover
  const pccThickness = Math.max(data.pcc.thickness, 0.05)
  const pccBottom = barrelBottom - pccThickness

  const barrelL = positive(data.barrel.length, 6)
  const intakeL = positive(data.intake.length, 2)
  const dsL = Math.max(data.downstreamHeadwall.length, 0)
  const basinL = Math.max(data.stillingBasin.length, 0)
  const xIntake = -intakeL
  const xBarrelEnd = barrelL
  const xDsEnd = barrelL + dsL
  const xBasinEnd = xDsEnd + basinL

  const intakeTop = sill + Math.max(data.intake.height, vent + 0.5)
  const deckLevel = Math.max(data.levels.tbl, intakeTop)
  const cutoffDepth = Math.max(data.cutoffWalls.depth, 0)

  const yTop = deckLevel + 1.6
  const yBottom = pccBottom - cutoffDepth - 0.8
  const xMin = xIntake - Math.max(4, intakeL)
  const xMax = xBasinEnd + 2.5

  const k = Math.min((W - mL - mR) / (xMax - xMin), (H - mT - mB) / (yTop - yBottom))
  const X = (x: number): number => mL + (x - xMin) * k
  const Y = (y: number): number => H - mB - (y - yBottom) * k

  const out: string[] = []

  // --- Water on the tank side, held to the intake face. -------------------
  const ftl = data.levels.ftl
  out.push(rect(X(xMin), Y(ftl), X(xIntake) - X(xMin), Y(barrelBottom) - Y(ftl), WATER, '#8fb9cf', 0.8))
  out.push(
    `<line x1="${n1(X(xMin))}" y1="${n1(Y(barrelBottom))}" x2="${n1(X(xIntake))}" y2="${n1(Y(barrelBottom))}" ` +
      `stroke="#8a7a5c" stroke-width="1.2"/>`
  )
  out.push(label(X(xMin) + 6, Y(ftl) + 16, 'Tank side', 'start'))

  // --- Indicative bund over the barrel. -----------------------------------
  const crest = Math.min(Math.max(barrelL * 0.2, 1.5), 4)
  const run = Math.max((barrelL - crest) / 2, 0)
  const bundPoints = [
    [X(0), Y(barrelBottom)],
    [X(run), Y(data.levels.tbl)],
    [X(run + crest), Y(data.levels.tbl)],
    [X(barrelL), Y(barrelBottom)]
  ]
  out.push(
    `<polygon points="${bundPoints.map(([x, y]) => `${n1(x)},${n1(y)}`).join(' ')}" fill="${EARTH}" ` +
      `fill-opacity="0.75" stroke="#9c8760" stroke-width="1"/>`
  )
  out.push(label(X(run + crest / 2), Y(data.levels.tbl) - 6, 'Tank bund (indicative)'))

  // --- Levelling course and cut-off walls. --------------------------------
  out.push(rect(X(xIntake), Y(barrelBottom), X(xDsEnd) - X(xIntake), Y(pccBottom) - Y(barrelBottom), PCC))
  const cutoffCount = Math.max(0, Math.round(data.cutoffWalls.count))
  const cutoffThickness = Math.max(data.cutoffWalls.thickness, 0.1)
  if (cutoffCount > 0 && cutoffDepth > 0) {
    const span = xDsEnd - xIntake
    for (let i = 0; i < cutoffCount; i += 1) {
      const centre = xIntake + (span * (i + 0.5)) / cutoffCount
      out.push(
        rect(
          X(centre - cutoffThickness / 2),
          Y(pccBottom),
          cutoffThickness * k,
          cutoffDepth * k,
          CONCRETE
        )
      )
    }
    out.push(label(X(xIntake) + 4, Y(pccBottom - cutoffDepth) + 12, 'Cut-off walls', 'start'))
  }

  // --- Barrel with its clear vent. ----------------------------------------
  out.push(rect(X(0), Y(barrelTop), X(barrelL) - X(0), Y(barrelBottom) - Y(barrelTop), CONCRETE))
  out.push(rect(X(0), Y(crown), X(barrelL) - X(0), Y(sill) - Y(crown), '#fff', '#444', 1))
  out.push(label((X(0) + X(barrelL)) / 2, (Y(crown) + Y(sill)) / 2 + 4, `Vent ${openingLabel(data)}`))

  // --- Intake headwall or tower, with the vent carried through it. ---------
  out.push(rect(X(xIntake), Y(intakeTop), X(0) - X(xIntake), Y(barrelBottom) - Y(intakeTop), CONCRETE))
  out.push(rect(X(xIntake), Y(crown), X(0) - X(xIntake), Y(sill) - Y(crown), '#fff', '#444', 1))
  out.push(
    label(
      (X(xIntake) + X(0)) / 2,
      Y(intakeTop) - 8,
      data.intakeType === 'tower' ? 'Intake tower' : 'Upstream headwall'
    )
  )

  // --- Gate leaf on the upstream face, stem and hoist over the deck. -------
  const leaf = Math.max(0.12, vent * 0.08)
  out.push(rect(X(xIntake) - leaf * k, Y(crown + 0.25), leaf * k, Y(sill) - Y(crown + 0.25), STEEL, '#333', 1))
  out.push(
    `<line x1="${n1(X(xIntake) - (leaf * k) / 2)}" y1="${n1(Y(crown + 0.25))}" ` +
      `x2="${n1(X(xIntake) - (leaf * k) / 2)}" y2="${n1(Y(deckLevel))}" stroke="${STEEL}" stroke-width="2"/>`
  )
  const deckHalf = Math.max(1, intakeL / 2)
  out.push(
    rect(X(xIntake - deckHalf), Y(deckLevel + 0.35), (deckHalf + 1) * k, 0.35 * k, CONCRETE)
  )
  out.push(rect(X(xIntake - 0.9) - (leaf * k) / 2, Y(deckLevel + 1.1), 1.8 * k, 0.75 * k, STEEL, '#333', 1))
  out.push(label(X(xIntake) - (leaf * k) / 2, Y(deckLevel + 1.1) - 5, 'Hoist'))

  // --- Downstream headwall and stilling basin. -----------------------------
  if (dsL > 0) {
    const dsTop = sill + Math.max(data.downstreamHeadwall.height, 0.3)
    out.push(rect(X(xBarrelEnd), Y(dsTop), X(xDsEnd) - X(xBarrelEnd), Y(barrelBottom) - Y(dsTop), CONCRETE))
    out.push(label((X(xBarrelEnd) + X(xDsEnd)) / 2, Y(dsTop) - 6, 'D/S headwall'))
  }
  if (basinL > 0) {
    const slab = Math.max(data.stillingBasin.slabThickness, 0.05)
    const wallH = Math.max(data.stillingBasin.sideWallHeight, 0)
    out.push(rect(X(xDsEnd), Y(barrelBottom), X(xBasinEnd) - X(xDsEnd), slab * k, PCC))
    if (wallH > 0) {
      out.push(
        `<rect x="${n1(X(xDsEnd))}" y="${n1(Y(barrelBottom + wallH))}" width="${n1(X(xBasinEnd) - X(xDsEnd))}" ` +
          `height="${n1(wallH * k)}" fill="none" stroke="#666" stroke-width="1" stroke-dasharray="4 3"/>`
      )
    }
    out.push(
      label((X(xDsEnd) + X(xBasinEnd)) / 2, Y(barrelBottom + wallH) - 6, 'Stilling basin (side walls dashed)')
    )
  }
  out.push(label(X(xMax) - 4, Y(barrelBottom) + 16, 'Canal side', 'end'))

  // --- Levels, drawn across the sheet and labelled in the right margin. ----
  const levels: { level: number; text: string }[] = [
    { level: data.levels.tbl, text: 'T.B.L' },
    { level: data.levels.mwl, text: 'M.W.L' },
    { level: data.levels.ftl, text: 'F.T.L' },
    { level: data.levels.minimumOperating, text: 'Min. operating' },
    { level: crown, text: 'Vent crown' },
    { level: sill, text: 'Sill' }
  ].sort((a, b) => b.level - a.level)
  let lastLabelY = -Infinity
  for (const entry of levels) {
    const y = Y(entry.level)
    out.push(
      `<line x1="${n1(mL - 12)}" y1="${n1(y)}" x2="${n1(W - mR + 4)}" y2="${n1(y)}" stroke="#1f6f8b" ` +
        `stroke-width="0.7" stroke-dasharray="7 4"/>`
    )
    const labelY = Math.max(y + 3.5, lastLabelY + 12)
    lastLabelY = labelY
    out.push(
      `<text x="${n1(W - mR + 8)}" y="${n1(labelY)}" fill="#12566b" font-size="10.5" font-family="Arial">` +
        `${esc(entry.text)} ${f2(entry.level)}</text>`
    )
  }

  // --- Dimensions. ---------------------------------------------------------
  const dimY = Y(pccBottom - cutoffDepth) + 26
  out.push(hDim(X(0), X(barrelL), dimY, `Barrel ${f2(barrelL)} m`, true))
  out.push(hDim(X(xIntake), X(0), dimY, `${f2(intakeL)} m`, true))
  if (basinL > 0) out.push(hDim(X(xDsEnd), X(xBasinEnd), dimY, `${f2(basinL)} m`, true))
  out.push(vDim(Y(crown), Y(sill), X(barrelL) + 22, `${f2(vent)} m`, 'right'))
  out.push(vDim(Y(data.levels.minimumOperating), Y(crown), X(xIntake) - 26, `Cover ${f2(data.levels.minimumOperating - crown)} m`))

  // --- Metre scale bar. ----------------------------------------------------
  const bars = Math.max(1, Math.min(10, Math.floor((W - mL - mR) / k / 2)))
  const barY = H - 22
  for (let i = 0; i < bars; i += 1) {
    out.push(
      rect(mL + i * k, barY, k, 6, i % 2 === 0 ? '#222' : '#fff', '#222', 0.8)
    )
  }
  out.push(label(mL, barY - 4, '0', 'start', 10))
  out.push(label(mL + bars * k, barY - 4, `${bars} m`, 'middle', 10))
  out.push(
    `<text x="${n1(W - mR)}" y="${n1(barY + 5)}" text-anchor="end" fill="#777" font-size="10" ` +
      `font-family="Arial">Drawn to scale · dimensions in metres, levels in m RL</text>`
  )

  const defs =
    `<defs><marker id="msArrow" markerUnits="userSpaceOnUse" markerWidth="9" markerHeight="8" refX="8" refY="3" ` +
    `orient="auto-start-reverse"><path d="M0,0 L8,3 L0,6 Z" fill="${DIM}"/></marker></defs>`

  return (
    `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" class="mis-figure" ` +
    `preserveAspectRatio="xMidYMid meet">${defs}` +
    `<rect x="0" y="0" width="${W}" height="${H}" fill="#fbfbfa"/>${out.join('')}</svg>`
  )
}
