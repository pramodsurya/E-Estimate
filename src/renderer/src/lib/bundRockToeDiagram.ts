export interface BundRockToeDiagramSpec {
  topWidth: number
  innerSlope: number
  outerSlope: number
  height: number
  excavationDepth: number
  filterEnabled: boolean
}

export type BundRockToeDiagramTheme = 'screen' | 'print'

const fmt = (value: number): string =>
  Number.isFinite(value) ? value.toFixed(value < 10 ? 2 : 1).replace(/\.?0+$/, '') : '0'

const n = (value: number): string => Number(value.toFixed(2)).toString()

/** Canonical dashboard/print rock-toe detail; only colours differ by theme. */
export function bundRockToeDiagramSvg(
  input: BundRockToeDiagramSpec,
  theme: BundRockToeDiagramTheme = 'screen'
): string {
  const h = Math.max(0.1, input.height || 0)
  const crest = Math.max(0, input.topWidth || 0)
  const inner = Math.max(0, input.innerSlope || 0)
  const outer = Math.max(0, input.outerSlope || 0)
  const leftRun = inner * h
  const rightRun = outer * h
  const baseWidth = Math.max(0.1, leftRun + crest + rightRun)
  const area = h * (crest + (h * (inner + outer)) / 2)
  const scale = Math.min(345 / baseWidth, 76 / h)
  const groundY = 142
  const centreX = 260
  const baseLeft = centreX - (baseWidth * scale) / 2
  const baseRight = centreX + (baseWidth * scale) / 2
  const topY = groundY - h * scale
  const topLeft = baseLeft + leftRun * scale
  const topRight = topLeft + crest * scale
  const excavationPx = Math.max(0, input.excavationDepth || 0) * scale
  const extensionRise = Math.min(45, 0.65 * h * scale + 10)
  const bundLineStartX = topRight - outer * extensionRise
  const bundLineStartY = topY - extensionRise
  const faceDx = topLeft - baseLeft
  const faceDy = topY - groundY
  const faceLengthPx = Math.hypot(faceDx, faceDy) || 1
  const normalX = faceDy / faceLengthPx
  const normalY = -faceDx / faceLengthPx
  const facePoint = (x: number, y: number, distanceM: number) => ({
    x: x + normalX * distanceM * scale,
    y: y + normalY * distanceM * scale
  })
  const behindBand = (fromM: number, toM: number): string => {
    const bottomFrom = facePoint(baseLeft, groundY, fromM)
    const topFrom = facePoint(topLeft, topY, fromM)
    const topTo = facePoint(topLeft, topY, toM)
    const bottomTo = facePoint(baseLeft, groundY, toM)
    return `${n(bottomFrom.x)},${n(bottomFrom.y)} ${n(topFrom.x)},${n(topFrom.y)} ${n(topTo.x)},${n(topTo.y)} ${n(bottomTo.x)},${n(bottomTo.y)}`
  }
  const below40Bottom = groundY + 0.65 * scale
  const below20Bottom = below40Bottom + 0.2 * scale
  const belowSandBottom = below20Bottom + 0.15 * scale
  const colours = theme === 'print'
    ? { ground: '#f6f1e8', groundLine: '#6f604d', rock: '#d7bc87', rockLine: '#71562f', line: '#705b3a', dim: '#164d81', text: '#394955', sand: '#f0d993', ca20: '#c3c9b6', ca40: '#aa8c5b', exc: '#9d7132' }
    : { ground: '#1f1f1f', groundLine: '#c3c6c8', rock: '#b98a54', rockLine: '#8a6636', line: '#52aaf0', dim: '#4ea1e0', text: '#aeb1b4', sand: '#d7bd78', ca20: '#a5a993', ca40: '#8a744d', exc: '#d9a24f' }
  const textureKey = `brt-${Math.round(baseWidth * 10)}-${Math.round(h * 10)}-${theme}`
  const textures = theme === 'print' ? `<defs>
    <pattern id="${textureKey}-rock" width="10" height="10" patternUnits="userSpaceOnUse">
      <rect width="10" height="10" fill="${colours.rock}"/>
      <circle cx="2" cy="2.5" r="0.9" fill="#96784a" opacity=".6"/><circle cx="7" cy="4" r="1.15" fill="#8b6d3e" opacity=".5"/><circle cx="4.5" cy="8" r=".7" fill="#806235" opacity=".45"/>
    </pattern>
    <pattern id="${textureKey}-ca40" width="8" height="8" patternUnits="userSpaceOnUse">
      <rect width="8" height="8" fill="${colours.ca40}"/><circle cx="2" cy="2" r="1.1" fill="#745d39" opacity=".52"/><circle cx="6.2" cy="5.7" r="1.25" fill="#745d39" opacity=".45"/>
    </pattern>
    <pattern id="${textureKey}-ca20" width="6" height="6" patternUnits="userSpaceOnUse">
      <rect width="6" height="6" fill="${colours.ca20}"/><path d="M0 6L6 0" stroke="#78806d" stroke-width=".65" opacity=".6"/>
    </pattern>
    <pattern id="${textureKey}-sand" width="6" height="6" patternUnits="userSpaceOnUse">
      <rect width="6" height="6" fill="${colours.sand}"/><circle cx="1.5" cy="1.5" r=".55" fill="#aa843d" opacity=".6"/><circle cx="4.7" cy="4.5" r=".45" fill="#aa843d" opacity=".5"/>
    </pattern>
  </defs>` : ''
  const rockFill = theme === 'print' ? `url(#${textureKey}-rock)` : colours.rock
  const ca40Fill = theme === 'print' ? `url(#${textureKey}-ca40)` : colours.ca40
  const ca20Fill = theme === 'print' ? `url(#${textureKey}-ca20)` : colours.ca20
  const sandFill = theme === 'print' ? `url(#${textureKey}-sand)` : colours.sand
  const filter = input.filterEnabled ? `
  <rect x="${n(baseLeft)}" y="${groundY}" width="${n(baseRight - baseLeft)}" height="${n(below40Bottom - groundY)}" fill="${ca40Fill}" stroke="${colours.line}" stroke-width="0.8"/>
  <rect x="${n(baseLeft)}" y="${n(below40Bottom)}" width="${n(baseRight - baseLeft)}" height="${n(below20Bottom - below40Bottom)}" fill="${ca20Fill}" stroke="${colours.line}" stroke-width="0.8"/>
  <rect x="${n(baseLeft)}" y="${n(below20Bottom)}" width="${n(baseRight - baseLeft)}" height="${n(belowSandBottom - below20Bottom)}" fill="${sandFill}" stroke="${colours.line}" stroke-width="0.8"/>
  <polygon points="${behindBand(0, 0.15)}" fill="${ca40Fill}" stroke="${colours.line}" stroke-width="0.8"/>
  <polygon points="${behindBand(0.15, 0.3)}" fill="${ca20Fill}" stroke="${colours.line}" stroke-width="0.8"/>
  <polygon points="${behindBand(0.3, 0.5)}" fill="${sandFill}" stroke="${colours.line}" stroke-width="0.8"/>
  <rect x="${n(baseLeft)}" y="${groundY}" width="${n(baseRight - baseLeft)}" height="${n(belowSandBottom - groundY)}" fill="none" stroke="${colours.exc}" stroke-width="0.9" stroke-dasharray="3 2"/>
  <text x="${n(baseLeft + 5)}" y="${n(belowSandBottom + 13)}" fill="${colours.exc}" font-family="Arial, sans-serif" font-size="8.5">1.00 m graded filter bed</text>` : ''
  const excavation = !input.filterEnabled && excavationPx > 0
    ? `<rect x="${n(baseLeft)}" y="${groundY}" width="${n(baseRight - baseLeft)}" height="${n(excavationPx)}" fill="${colours.exc}" fill-opacity="0.16" stroke="${colours.exc}" stroke-width="0.8" stroke-dasharray="3 2"/>`
    : ''
  const filterLabels = input.filterEnabled ? `
  <text x="${n((baseLeft + baseRight) / 2)}" y="${n(groundY + 0.34 * scale)}" text-anchor="middle" dominant-baseline="middle" fill="${colours.text}" font-family="Arial, sans-serif" font-size="8.5">40 mm CA · 0.65 m</text>
  <text x="${n((baseLeft + baseRight) / 2)}" y="${n(below40Bottom + 0.1 * scale)}" text-anchor="middle" dominant-baseline="middle" fill="${colours.text}" font-family="Arial, sans-serif" font-size="8">20 mm CA · 0.20 m</text>
  <text x="${n((baseLeft + baseRight) / 2)}" y="${n(below20Bottom + 0.075 * scale)}" text-anchor="middle" dominant-baseline="middle" fill="${colours.text}" font-family="Arial, sans-serif" font-size="8">Sand · 0.15 m</text>
  <line x1="${n(baseLeft - 5)}" y1="${n(groundY + 5)}" x2="${n(baseLeft - 28)}" y2="${n(groundY + 5)}" stroke="${colours.dim}" stroke-width="0.8"/>
  <text x="${n(baseLeft - 31)}" y="${n(groundY + 8)}" text-anchor="end" fill="${colours.dim}" font-family="Arial, sans-serif" font-size="8.5">Filter behind toe: 0.50 m</text>` : ''
  const excavationLabel = !input.filterEnabled && input.excavationDepth > 0
    ? `<text x="${n((baseLeft + baseRight) / 2)}" y="${n(groundY + excavationPx + 13)}" text-anchor="middle" fill="${colours.exc}" font-family="Arial, sans-serif" font-size="8.5">Foundation excavation ${fmt(input.excavationDepth)} m below base</text>`
    : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" class="bund-rocktoe-diagram${theme === 'print' ? ' bp-fig' : ''}" viewBox="0 0 520 300" role="img" aria-label="Rock toe aligned with downstream bund slope${input.filterEnabled ? ' and graded filter layers' : ''}">
  ${textures}
  <line x1="20" y1="${groundY}" x2="510" y2="${groundY}" stroke="${colours.groundLine}" stroke-width="1.2"/>
  ${excavation}${filter}${filterLabels}${excavationLabel}
  <line x1="${n(bundLineStartX)}" y1="${n(bundLineStartY)}" x2="${baseRight}" y2="${groundY}" stroke="${colours.line}" stroke-width="1.5" stroke-linecap="round"/>
  <polygon points="${n(baseLeft)},${groundY} ${n(topLeft)},${n(topY)} ${n(topRight)},${n(topY)} ${baseRight},${groundY}" fill="${rockFill}" fill-opacity="0.82" stroke="${colours.rockLine}" stroke-width="1.2"/>
  <line x1="${n(topRight)}" y1="${n(topY)}" x2="${baseRight}" y2="${groundY}" stroke="${colours.rockLine}" stroke-width="1.6"/>
  <text x="${n((baseLeft + topLeft + topRight + baseRight) / 4)}" y="${n(topY + Math.max(16, h * scale * 0.58))}" text-anchor="middle" fill="${colours.rockLine}" font-family="Arial, sans-serif" font-size="10">Rock toe</text>
  ${crest > 0 ? `<line x1="${n(topLeft)}" y1="${n(topY - 9)}" x2="${n(topRight)}" y2="${n(topY - 9)}" stroke="${colours.dim}" stroke-width="0.9"/>
  <line x1="${n(topLeft)}" y1="${n(topY - 12)}" x2="${n(topLeft)}" y2="${n(topY - 6)}" stroke="${colours.dim}" stroke-width="0.9"/>
  <line x1="${n(topRight)}" y1="${n(topY - 12)}" x2="${n(topRight)}" y2="${n(topY - 6)}" stroke="${colours.dim}" stroke-width="0.9"/>
  <text x="${n((topLeft + topRight) / 2)}" y="${n(topY - 14)}" text-anchor="middle" fill="${colours.dim}" font-family="Arial, sans-serif" font-size="10">Crest ${fmt(crest)} m</text>` : ''}
  <line x1="${baseRight + 8}" y1="${n(topY)}" x2="${baseRight + 8}" y2="${groundY}" stroke="${colours.dim}" stroke-width="0.9"/>
  <line x1="${baseRight + 5}" y1="${n(topY)}" x2="${baseRight + 11}" y2="${n(topY)}" stroke="${colours.dim}" stroke-width="0.9"/>
  <line x1="${baseRight + 5}" y1="${groundY}" x2="${baseRight + 11}" y2="${groundY}" stroke="${colours.dim}" stroke-width="0.9"/>
  <text x="${baseRight + 13}" y="${n((topY + groundY) / 2)}" dominant-baseline="middle" fill="${colours.dim}" font-family="Arial, sans-serif" font-size="10">Height ${fmt(h)} m</text>
  <text x="${n(bundLineStartX + 3)}" y="${n(bundLineStartY - 5)}" fill="${colours.line}" font-family="Arial, sans-serif" font-size="9">D/S slope 1:${fmt(outer)}</text>
  <text x="${centreX}" y="278" text-anchor="middle" fill="${colours.text}" font-family="Arial, sans-serif" font-size="9">Area = H × [Crest + H × (inner + outer) / 2] = ${fmt(h)} × [${fmt(crest)} + ${fmt(h)} × (${fmt(inner)} + ${fmt(outer)}) / 2] = ${fmt(area)} m²</text>
  <text x="510" y="297" text-anchor="end" fill="${colours.text}" font-family="Arial, sans-serif" font-size="9">Base ${fmt(baseWidth)} m · inner 1:${fmt(inner)} · outer = D/S slope${!input.filterEnabled && input.excavationDepth > 0 ? ` · excavation ${fmt(input.excavationDepth)} m below base` : ''}</text>
</svg>`
}
