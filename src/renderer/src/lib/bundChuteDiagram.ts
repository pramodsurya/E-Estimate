export interface BundChuteDiagramSpec {
  /** Clear channel width and depth, in metres. */
  width: number
  depth: number
  /** Lining/protection thickness, in metres. */
  liningThickness: number
  protection: 'concrete' | 'stone'
  lined: boolean
}

export type BundDiagramTheme = 'screen' | 'print'

// Match the generous viewBox used by the other print-detail figures. Keeping
// text small relative to the drawing prevents Typst from magnifying labels.
const W = 720
const H = 270
const PAD_X = 44
const GROUND_Y = 62

const fmt = (value: number): string =>
  Number.isFinite(value) ? value.toFixed(2).replace(/\.?0+$/, '') : '0'

const n = (value: number): string => Number(value.toFixed(2)).toString()

/**
 * The canonical chute-drain SVG used by both the dashboard and printed bund.
 * Geometry never changes between outputs; only this function's colour theme
 * changes. The channel void is repainted with the canvas colour after the
 * lining, guaranteeing that it remains visibly hollow in either medium.
 */
export function bundChuteDiagramSvg(
  input: BundChuteDiagramSpec,
  theme: BundDiagramTheme = 'screen'
): string {
  const width = Math.max(0.05, input.width || 0)
  const depth = Math.max(0.05, input.depth || 0)
  const thickness = input.lined ? Math.max(0, input.liningThickness || 0) : 0
  const margin = Math.max(1.2, width * 1.4)
  const spanX = width + 2 * thickness + 2 * margin
  const spanY = depth + thickness + 0.75
  const scale = Math.min((W - PAD_X * 2) / spanX, (H - GROUND_Y - 68) / spanY)
  const midX = W / 2
  const left = midX - (width / 2) * scale
  const right = midX + (width / 2) * scale
  const invert = GROUND_Y + depth * scale
  const outerLeft = left - thickness * scale
  const outerRight = right + thickness * scale
  const outerInvert = invert + thickness * scale
  const excavationArea = width * depth
  const linedPerimeter = width + 2 * depth

  const colours = theme === 'print'
    ? {
        canvas: '#ffffff', ground: '#f3efe7', groundLine: '#77664e',
        lining: input.protection === 'stone' ? '#ead9b5' : '#e5edf1',
        liningLine: input.protection === 'stone' ? '#8a6a38' : '#70848f',
        text: '#52646e', dim: '#245d8f'
      }
    : {
        canvas: '#1f1f1f', ground: '#403728', groundLine: '#765724',
        lining: input.protection === 'stone' ? '#5a482e' : '#39444b',
        liningLine: input.protection === 'stone' ? '#9a702b' : '#4f91b8',
        text: '#aeb1b4', dim: '#4da3e6'
      }

  const ground = [
    `M ${PAD_X} ${GROUND_Y}`,
    `L ${n(outerLeft)} ${GROUND_Y}`,
    `L ${n(outerLeft)} ${n(outerInvert)}`,
    `L ${n(outerRight)} ${n(outerInvert)}`,
    `L ${n(outerRight)} ${GROUND_Y}`,
    `L ${W - PAD_X} ${GROUND_Y}`,
    `L ${W - PAD_X} ${H - 72}`,
    `L ${PAD_X} ${H - 72} Z`
  ].join(' ')
  const lining = [
    `M ${n(outerLeft)} ${GROUND_Y}`,
    `L ${n(outerLeft)} ${n(outerInvert)}`,
    `L ${n(outerRight)} ${n(outerInvert)}`,
    `L ${n(outerRight)} ${GROUND_Y}`,
    `L ${n(right)} ${GROUND_Y}`,
    `L ${n(right)} ${n(invert)}`,
    `L ${n(left)} ${n(invert)}`,
    `L ${n(left)} ${GROUND_Y} Z`
  ].join(' ')
  const liningLabel = input.protection === 'stone' ? 'Stone protection' : 'CC protection'
  const accessible = `Chute drain ${fmt(width)} m wide and ${fmt(depth)} m deep with ${
    input.lined ? `${input.protection} protection` : 'no protection'
  }`

  const patternId = `chute-${theme}-${input.protection}`

  return `<svg xmlns="http://www.w3.org/2000/svg" class="bund-chute-diagram${theme === 'print' ? ' bp-fig' : ''}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${accessible}">
  <defs>
    <pattern id="${patternId}" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(32)">
      <rect width="10" height="10" fill="${colours.lining}"/>
      <line x1="0" y1="0" x2="0" y2="10" stroke="${colours.liningLine}" stroke-width="0.7" opacity="0.28"/>
    </pattern>
  </defs>
  <path d="${ground}" fill="${colours.ground}" stroke="none"/>
  <path d="M ${PAD_X} ${GROUND_Y} L ${n(outerLeft)} ${GROUND_Y} M ${n(outerRight)} ${GROUND_Y} L ${W - PAD_X} ${GROUND_Y}" fill="none" stroke="${colours.groundLine}" stroke-width="1.15" stroke-linecap="round"/>
  ${thickness > 0 ? `<path d="${lining}" fill="url(#${patternId})" stroke="${colours.liningLine}" stroke-width="1.2" stroke-linejoin="round"/>` : ''}
  <rect x="${n(left)}" y="${GROUND_Y}" width="${n(right - left)}" height="${n(invert - GROUND_Y)}" fill="${colours.canvas}"/>
  <path d="M ${n(left)} ${GROUND_Y} L ${n(left)} ${n(invert)} L ${n(right)} ${n(invert)} L ${n(right)} ${GROUND_Y}" fill="none" stroke="${colours.liningLine}" stroke-width="1.2" stroke-linejoin="round"/>
  <line x1="${n(left)}" y1="${n(invert + 17)}" x2="${n(right)}" y2="${n(invert + 17)}" stroke="${colours.dim}" stroke-width="0.9"/>
  <line x1="${n(left)}" y1="${n(invert + 13)}" x2="${n(left)}" y2="${n(invert + 21)}" stroke="${colours.dim}" stroke-width="0.9"/>
  <line x1="${n(right)}" y1="${n(invert + 13)}" x2="${n(right)}" y2="${n(invert + 21)}" stroke="${colours.dim}" stroke-width="0.9"/>
  <text x="${midX}" y="${n(invert + 31)}" text-anchor="middle" fill="${colours.dim}" font-family="Arial, sans-serif" font-size="11">W = ${fmt(width)} m clear</text>
  <line x1="${n(outerRight + 18)}" y1="${GROUND_Y}" x2="${n(outerRight + 18)}" y2="${n(invert)}" stroke="${colours.dim}" stroke-width="0.9"/>
  <text x="${n(outerRight + 25)}" y="${n((GROUND_Y + invert) / 2)}" dominant-baseline="middle" fill="${colours.dim}" font-family="Arial, sans-serif" font-size="11">D = ${fmt(depth)} m</text>
  ${thickness > 0 ? `<text x="${PAD_X}" y="35" fill="${colours.text}" font-family="Arial, sans-serif" font-size="11">${liningLabel}: t = ${fmt(thickness)} m</text>` : ''}
  <text x="${PAD_X}" y="${H - 46}" fill="${colours.text}" font-family="Arial, sans-serif" font-size="10.5">Excavation area = W × D = ${fmt(width)} × ${fmt(depth)} = ${fmt(excavationArea)} m²</text>
  <text x="${PAD_X}" y="${H - 27}" fill="${colours.text}" font-family="Arial, sans-serif" font-size="10.5">Lined perimeter P = W + 2D = ${fmt(width)} + 2(${fmt(depth)}) = ${fmt(linedPerimeter)} m</text>
  <text x="${W - PAD_X}" y="${H - 8}" text-anchor="end" fill="${colours.text}" font-family="Arial, sans-serif" font-size="9.5">Cross-section of downstream chute drain</text>
</svg>`
}
