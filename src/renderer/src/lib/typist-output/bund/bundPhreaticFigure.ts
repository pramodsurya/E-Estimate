import type { BundData } from '../../../types/project'
const f2 = (value: number): string => value.toFixed(2)
import {
  steepestSection,
  orderedSections,
  isZonedBund,
  phreaticGeometry,
  projectedProfile,
  downstreamDesignToePointAt,
  rockToeHeightAt,
  rockToeBaseWidth,
  downstreamToeFaceSlope,
  rockToeFilterBelowThicknessM,
  internalFiltersAvailable,
  horizontalFilterLengthAt,
  horizontalFilterThicknessM,
  verticalFilterHeightAt,
  verticalFilterWidthM
} from '../../bund'
const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function baselinePhreaticData(data: BundData): BundData {
  return {
    ...data,
    design: { ...data.design, berms: [] },
    rockToeMaterial: null,
    rockToeFilterMaterial: null,
    horizontalFilterMaterial: null,
    verticalFilterMaterial: null
  }
}

/** Which drainage options are actually in play, for the caption and legend. */
function activeDrainageOptions(data: BundData): string[] {
  return [
    data.rockToeMaterial ? 'rock toe' : null,
    data.horizontalFilterMaterial || data.verticalFilterMaterial || data.rockToeFilterMaterial
      ? 'filter'
      : null,
    data.design.berms.length ? 'berm' : null
  ].filter((option): option is string => Boolean(option))
}

export function phreaticFigureData(data: BundData) {
  const section = steepestSection(data) ?? orderedSections(data)[0]
  if (!section) return null

  // A zoned bund is covered by the separate Bund Diagram. A Casagrande line
  // through a homogeneous body is not applicable to its impervious core.
  if (isZonedBund(data)) return null

  if (!data.includePhreaticInPrint) return null
  const actual = phreaticGeometry(data, section)
  const reference = phreaticGeometry(baselinePhreaticData(data), section)
  if (!actual && !reference) return null
  const primary = actual ?? reference
  if (!primary) return null

  const design = data.design
  const proposed = projectedProfile(section, design)
  if (proposed.length < 2) return null
  const sorted = proposed.slice().sort((a, b) => a.offset - b.offset)
  const crest = sorted.filter((p) => Math.abs(p.rl - design.topLevel) < 1e-6)
  const crestL = crest.length ? crest[0] : sorted[0]
  const crestR = crest.length ? crest[crest.length - 1] : sorted[sorted.length - 1]
  const usToe = sorted[0]
  const dsToe = downstreamDesignToePointAt(section, data) ?? sorted[sorted.length - 1]

  const rockToeHeight = data.rockToeMaterial ? rockToeHeightAt(section, data) : 0
  const rockToeOuterX = dsToe.offset
  const rockToeInnerX =
    rockToeOuterX -
    rockToeBaseWidth(rockToeHeight, data, downstreamToeFaceSlope(section, data))
  const rockToeCrestInnerX = rockToeInnerX + data.rockToeInnerSlope * rockToeHeight
  const rockToeCrestOuterX = rockToeCrestInnerX + data.rockToeTopWidth
  const rockToeCrestRl = dsToe.rl + rockToeHeight
  const rockToeFilterBelow = rockToeFilterBelowThicknessM(data)

  const horizontalFilterOn =
    internalFiltersAvailable(data) &&
    Boolean(data.horizontalFilterMaterial) &&
    horizontalFilterLengthAt(section, data) > 0
  const horizontalFilterOuterX = rockToeHeight > 0 ? rockToeInnerX : dsToe.offset
  const horizontalFilterInnerX =
    horizontalFilterOuterX - horizontalFilterLengthAt(section, data)
  const horizontalFilterThickness = horizontalFilterThicknessM(data)
  const verticalFilterOn = horizontalFilterOn && Boolean(data.verticalFilterMaterial)
  const verticalFilterHeight = verticalFilterOn ? verticalFilterHeightAt(section, data) : 0
  const verticalFilterWidth = verticalFilterWidthM(data)

  const componentPoints = [
    ...(rockToeHeight > 0
      ? [
          { offset: rockToeInnerX, rl: dsToe.rl - (data.rockToeFilterMaterial ? rockToeFilterBelow : 0) },
          { offset: rockToeCrestInnerX, rl: rockToeCrestRl },
          { offset: rockToeCrestOuterX, rl: rockToeCrestRl },
          { offset: rockToeOuterX, rl: dsToe.rl }
        ]
      : []),
    ...(horizontalFilterOn
      ? [
          { offset: horizontalFilterInnerX, rl: primary.baseRl - horizontalFilterThickness },
          { offset: horizontalFilterOuterX, rl: primary.baseRl }
        ]
      : []),
    ...(verticalFilterOn
      ? [{ offset: horizontalFilterInnerX + verticalFilterWidth, rl: primary.baseRl + verticalFilterHeight }]
      : [])
  ]

  const width = 780
  const padL = 22
  const padR = 22
  const padTop = 26

  const waterRl = primary.baseRl + primary.waterDepth
  const lines = [actual, reference].filter(Boolean) as NonNullable<typeof actual>[]
  const xs = [
    ...proposed.map((p) => p.offset),
    ...componentPoints.map((p) => p.offset),
    ...lines.flatMap((g) => [g.usToeX, g.dsToeX, ...g.points.map((p) => p.offset)])
  ]
  const ys = [
    ...proposed.map((p) => p.rl),
    ...componentPoints.map((p) => p.rl),
    waterRl,
    ...lines.flatMap((g) => [g.baseRl, ...g.points.map((p) => p.rl)])
  ]
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys) - 0.4
  const maxY = Math.max(...ys) + 1.2
  if (maxX - minX <= 0 || maxY - minY <= 0) return null

  const k = (width - padL - padR) / (maxX - minX)
  const X = (x: number): number => padL + (x - minX) * k
  const Y = (y: number): number => padTop + (maxY - y) * k
  const n1 = (v: number): string => v.toFixed(1)

  const poly = (pts: { offset: number; rl: number }[]): string =>
    pts
      .slice()
      .sort((a, b) => a.offset - b.offset)
      .map((p, i) => `${i ? 'L' : 'M'} ${n1(X(p.offset))} ${n1(Y(p.rl))}`)
      .join(' ')
  const svgPoints = (pts: { offset: number; rl: number }[]): string =>
    pts.map((p) => `${n1(X(p.offset))},${n1(Y(p.rl))}`).join(' ')

  // --- section -------------------------------------------------------------
  const body =
    `<path d="${poly(sorted)}" fill="#eef4f8" fill-opacity="0.75" stroke="#2b6fa8" stroke-width="1.9"/>`

  const water =
    `<path d="M ${n1(X(minX))} ${n1(Y(waterRl))} L ${n1(X(primary.entryX))} ${n1(Y(waterRl))} ` +
    `L ${n1(X(usToe.offset))} ${n1(Y(usToe.rl))} L ${n1(X(minX))} ${n1(Y(usToe.rl))} Z" ` +
    `fill="#d9ecf6" fill-opacity="0.75" stroke="none"/>` +
    `<line x1="${n1(X(minX))}" y1="${n1(Y(waterRl))}" x2="${n1(X(primary.entryX))}" y2="${n1(Y(waterRl))}" ` +
    `stroke="#5aa9d6" stroke-width="1.2" stroke-dasharray="6 3"/>`

  const datum =
    `<line x1="${n1(X(minX))}" y1="${n1(Y(primary.baseRl))}" x2="${n1(X(maxX))}" y2="${n1(Y(primary.baseRl))}" ` +
    `stroke="#8a7a5c" stroke-width="1.2"/>`

  const horizontalFilter = horizontalFilterOn
    ? `<rect x="${n1(X(horizontalFilterInnerX))}" y="${n1(Y(primary.baseRl))}" ` +
      `width="${n1(X(horizontalFilterOuterX) - X(horizontalFilterInnerX))}" ` +
      `height="${n1(Y(primary.baseRl - horizontalFilterThickness) - Y(primary.baseRl))}" ` +
      `fill="url(#phFilter)" stroke="#987c3c" stroke-width="1"/>`
    : ''

  const verticalFilter = verticalFilterOn && verticalFilterHeight > 0
    ? `<rect x="${n1(X(horizontalFilterInnerX))}" y="${n1(Y(primary.baseRl + verticalFilterHeight))}" ` +
      `width="${n1(Math.max(3, verticalFilterWidth * k))}" ` +
      `height="${n1(Y(primary.baseRl) - Y(primary.baseRl + verticalFilterHeight))}" ` +
      `fill="url(#phFilter)" stroke="#987c3c" stroke-width="1" stroke-dasharray="4 3"/>`
    : ''

  const rockToeFilter = rockToeHeight > 0 && data.rockToeFilterMaterial
    ? `<rect x="${n1(X(rockToeInnerX))}" y="${n1(Y(dsToe.rl))}" ` +
      `width="${n1(X(rockToeOuterX) - X(rockToeInnerX))}" ` +
      `height="${n1(Y(dsToe.rl - rockToeFilterBelow) - Y(dsToe.rl))}" ` +
      `fill="url(#phFilter)" stroke="#987c3c" stroke-width="1"/>`
    : ''
  const rockToe = rockToeHeight > 0
    ? `<polygon points="${svgPoints([
        { offset: rockToeInnerX, rl: dsToe.rl },
        { offset: rockToeCrestInnerX, rl: rockToeCrestRl },
        { offset: rockToeCrestOuterX, rl: rockToeCrestRl },
        { offset: rockToeOuterX, rl: dsToe.rl }
      ])}" fill="url(#phRubble)" stroke="#8a6636" stroke-width="1.2"/>`
    : ''

  // --- the two phreatic lines ---------------------------------------------
  const path = (g: NonNullable<typeof actual>): string =>
    g.points
      .map((p, i) => `${i ? 'L' : 'M'} ${n1(X(p.offset))} ${n1(Y(p.rl))}`)
      .join(' ')

  const referenceLine = reference
    ? `<path d="${path(reference)}" fill="none" stroke="#b06a2c" stroke-width="1.7" stroke-dasharray="7 4"/>`
    : ''
  const actualCutPoint =
    actual?.interceptX != null && actual.interceptRl != null
      ? { offset: actual.interceptX, rl: actual.interceptRl }
      : null
  const actualVisiblePoints = actual
    ? actualCutPoint
      ? [
          ...actual.points.filter((point) => point.offset < actualCutPoint.offset - 1e-6),
          actualCutPoint
        ]
      : actual.points
    : []
  const actualLine = actualVisiblePoints.length >= 2
    ? `<path d="${poly(actualVisiblePoints)}" fill="none" stroke="#3c9de0" stroke-width="2.1"/>`
    : ''
  const actualDrainDrop =
    actualCutPoint &&
    (actual?.interceptedBy === 'chimney' || actual?.interceptedBy === 'blanket')
      ? `<line x1="${n1(X(actualCutPoint.offset))}" y1="${n1(Y(actualCutPoint.rl))}" ` +
        `x2="${n1(X(actualCutPoint.offset))}" y2="${n1(Y(primary.baseRl))}" ` +
        `stroke="#3c9de0" stroke-width="2.1"/>`
      : ''

  // --- labels --------------------------------------------------------------
  const label = (x: number, y: number, text: string, anchor = 'middle', fill = '#33505f'): string =>
    `<text x="${n1(x)}" y="${n1(y)}" text-anchor="${anchor}" fill="${fill}" font-size="14" font-family="Arial">${escapeHtml(text)}</text>`

  const labels =
    label(X(minX) + 4, Y(waterRl) - 6, `MWL ${f2(waterRl)}`, 'start', '#3d88ad') +
    label((X(crestL.offset) + X(crestR.offset)) / 2, Y(design.topLevel) - 10, `TBL ${f2(design.topLevel)}`) +
    (verticalFilterOn
      ? label(
          X(horizontalFilterInnerX + verticalFilterWidth) + 4,
          Y(primary.baseRl + verticalFilterHeight / 2),
          'chimney filter',
          'start',
          '#806d2b'
        )
      : '') +
    (horizontalFilterOn
      ? label(
          X((horizontalFilterInnerX + horizontalFilterOuterX) / 2),
          Y(primary.baseRl - horizontalFilterThickness) + 14,
          'horizontal filter blanket',
          'middle',
          '#806d2b'
        )
      : '') +
    (rockToeHeight > 0
      ? label(
          X((rockToeInnerX + rockToeOuterX) / 2),
          Y(rockToeCrestRl) - 8,
          'rock toe',
          'middle',
          '#775329'
        )
      : '')

  // Where the actual line is caught, called out on the drawing.
  const interceptLabel =
    actual && actual.interceptX != null && actual.interceptRl != null
      ? `<circle cx="${n1(X(actual.interceptX))}" cy="${n1(Y(actual.interceptRl))}" r="3" fill="#2f7d3a"/>` +
        label(
          X(actual.interceptX),
          Y(actual.interceptRl) - 8,
          `intercepted by ${actual.interceptedBy ?? 'drainage'}`,
          'middle',
          '#2f7d3a'
        )
      : ''

  // --- legend --------------------------------------------------------------
  const options = activeDrainageOptions(data)
  const geomBottom = Y(minY)
  const filterLabelBottom = horizontalFilterOn ? Y(primary.baseRl - horizontalFilterThickness) + 18 : 0
  const contentBottom = Math.max(geomBottom, filterLabelBottom)
  const legendY = Math.round(contentBottom + 16)
  const height = Math.round(legendY + 16)

  const legend =
    `<line x1="${padL}" y1="${legendY}" x2="${padL + 26}" y2="${legendY}" stroke="#b06a2c" stroke-width="1.7" stroke-dasharray="7 4"/>` +
    label(padL + 32, legendY + 4, 'Reference — plain bund, no drainage', 'start', '#7a5320') +
    `<line x1="${padL + 268}" y1="${legendY}" x2="${padL + 294}" y2="${legendY}" stroke="#3c9de0" stroke-width="2.1"/>` +
    label(
      padL + 300,
      legendY + 4,
      options.length ? `Actual — with ${options.join(' + ')}` : 'Actual — no drainage selected',
      'start',
      '#2377ad'
    )

  const defs =
    `<defs><pattern id="phFilter" width="7" height="7" patternUnits="userSpaceOnUse">` +
    `<rect width="7" height="7" fill="#d2b75f"/><circle cx="2" cy="2" r="0.7" fill="#8d762d"/>` +
    `<circle cx="5" cy="5" r="0.7" fill="#8d762d"/></pattern>` +
    `<pattern id="phRubble" width="13" height="13" patternUnits="userSpaceOnUse">` +
    `<rect width="13" height="13" fill="#b98a54"/><path d="M2 7 L6 2 L10 7 L6 11 Z" ` +
    `fill="none" stroke="#7a582f" stroke-width="1"/></pattern></defs>`

  const svg = `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" class="bp-fig">` +
    defs +
    water +
    body +
    horizontalFilter +
    verticalFilter +
    rockToeFilter +
    rockToe +
    datum +
    referenceLine +
    actualLine +
    actualDrainDrop +
    labels +
    interceptLabel +
    legend +
    `</svg>`
  return { svg, actual, reference, primary, options, section }
}
