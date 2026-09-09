// Shared surveyed vector geometry and hearting stations. No document layout is generated here.
import type { BundData, BundSection } from '../../../types/project'
import { bundLevelingGeometry, isZonedBund, heartingRepairBands, heartingRepairProfile,
  heartingBaseProfile, heartingTrenchEnabled, heartingTrenchProfile, upstreamToeOffset,
  bundNetStrippingBands, existLevelAt } from '../../bund'

function niceTicks(min: number, max: number, target: number): number[] {
  const span = max - min
  if (span <= 0) return [min]
  const magnitude = Math.pow(10, Math.floor(Math.log10(span / target)))
  const normalised = span / target / magnitude
  const step =
    (normalised >= 5 ? 5 : normalised >= 2.5 ? 2.5 : normalised >= 2 ? 2 : 1) * magnitude
  const ticks: number[] = []
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-6; v += step) {
    ticks.push(Math.round(v * 1000) / 1000)
  }
  return ticks
}

/**
 * To-scale cross-section: the surveyed ground against the proposed bund, with
 * the cut and the restoration fill hatched. This is the same geometry the
 * quantity engine measures, so what is drawn is what is billed.
 */
export function sectionSvg(data: BundData, section: BundSection, index: number): string {
  const leveling = bundLevelingGeometry(data, section)
  if (!leveling) return ''

  const width = 470
  const padL = 38
  const padR = 14
  const padT = 10
  const padB = 24

  // The impervious core is part of every section of a zoned bund — casing and
  // hearting are billed apart, so a printed section that showed only one blue
  // outline would not say which of the two any part of it is.
  const zoned = isZonedBund(data)
  const heartingBands = zoned ? heartingRepairBands(data, section) : []
  const heartingLine = zoned ? heartingRepairProfile(data, section) : []
  const heartingFloor = zoned ? heartingBaseProfile(data, section) : []
  const trench = heartingTrenchEnabled(data)
    ? heartingTrenchProfile(data, section)
    : { top: [], bottom: [] }
  const hasTrench = trench.top.length >= 2 && trench.bottom.length >= 2

  const all = [
    ...leveling.existing,
    ...leveling.proposed,
    ...heartingLine,
    ...heartingFloor,
    ...trench.top,
    ...trench.bottom
  ]
  if (all.length < 2) return ''
  const minX = Math.min(...all.map((p) => p.offset))
  const maxX = Math.max(...all.map((p) => p.offset))
  const dataMinRl = Math.min(...all.map((p) => p.rl))
  const dataMaxRl = Math.max(...all.map((p) => p.rl))
  if (maxX - minX <= 0 || dataMaxRl - dataMinRl <= 0) return ''

  // Printed chainage is local to the first point in the measured width. In
  // particular, never expose the centre-line offsets (which made the old
  // chart and table start at values such as -16.50).
  const displayOrigin = Math.min(upstreamToeOffset(section, data), minX)
  const displayMaxX = maxX - displayOrigin

  // Keep one drawing unit equal in both directions.
  const trueSpan = dataMaxRl - dataMinRl
  const unitScale = (width - padL - padR) / displayMaxX
  const plotWidth = displayMaxX * unitScale
  const plotHeight = trueSpan * unitScale
  const plotTop = padT
  const plotBottom = plotTop + plotHeight
  const plotRight = padL + plotWidth
  const height = Math.round(plotBottom + padB)
  const X = (x: number): number => padL + (x - displayOrigin) * unitScale
  const Y = (rl: number): number => plotTop + (dataMaxRl - rl) * unitScale

  const path = (points: { offset: number; rl: number }[]): string =>
    points
      .slice()
      .sort((a, b) => a.offset - b.offset)
      .map((p, i) => `${i ? 'L' : 'M'} ${X(p.offset).toFixed(1)} ${Y(p.rl).toFixed(1)}`)
      .join(' ')

  const bandPath = (band: {
    fromOffset: number
    toOffset: number
    upperFromRl: number
    upperToRl: number
    lowerFromRl: number
    lowerToRl: number
  }): string =>
    `M ${X(band.fromOffset).toFixed(1)} ${Y(band.upperFromRl).toFixed(1)} ` +
    `L ${X(band.toOffset).toFixed(1)} ${Y(band.upperToRl).toFixed(1)} ` +
    `L ${X(band.toOffset).toFixed(1)} ${Y(band.lowerToRl).toFixed(1)} ` +
    `L ${X(band.fromOffset).toFixed(1)} ${Y(band.lowerFromRl).toFixed(1)} Z`

  const fillId = `bpf${index}`
  const cutId = `bpc${index}`
  const heartId = `bph${index}`
  const defs =
    `<defs>` +
    `<pattern id="${fillId}" width="5" height="5" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">` +
    `<line x1="0" y1="0" x2="0" y2="5" stroke="#4ea1e0" stroke-width="0.8"/></pattern>` +
    `<pattern id="${cutId}" width="5" height="5" patternTransform="rotate(-45)" patternUnits="userSpaceOnUse">` +
    `<line x1="0" y1="0" x2="0" y2="5" stroke="#c9862f" stroke-width="0.8"/></pattern>` +
    // Denser cross-hatch, so the core still reads as the core where it sits
    // over the ordinary formation hatch it is cut out of.
    `<pattern id="${heartId}" width="4" height="4" patternUnits="userSpaceOnUse">` +
    `<rect width="4" height="4" fill="#fdf1f7"/>` +
    `<line x1="0" y1="0" x2="4" y2="4" stroke="#b8558c" stroke-width="0.7"/>` +
    `<line x1="4" y1="0" x2="0" y2="4" stroke="#b8558c" stroke-width="0.7"/></pattern>` +
    `</defs>`

  const grid =
    niceTicks(dataMinRl, dataMaxRl, 4)
      .map(
        (rl) =>
          `<line x1="${padL}" y1="${Y(rl).toFixed(1)}" x2="${plotRight.toFixed(1)}" y2="${Y(rl).toFixed(1)}" stroke="#e0e5ea" stroke-width="0.6"/>` +
          `<text x="${padL - 4}" y="${(Y(rl) + 3).toFixed(1)}" text-anchor="end" fill="#8a9aa5" font-size="8" font-family="Arial">${rl.toFixed(1)}</text>`
      )
      .join('') +
    niceTicks(0, displayMaxX, 5)
      .map(
        (x) =>
          `<line x1="${(padL + x * unitScale).toFixed(1)}" y1="${plotTop.toFixed(1)}" x2="${(padL + x * unitScale).toFixed(1)}" y2="${plotBottom.toFixed(1)}" stroke="#e0e5ea" stroke-width="0.6"/>` +
          `<text x="${(padL + x * unitScale).toFixed(1)}" y="${(plotBottom + 11).toFixed(1)}" text-anchor="middle" fill="#8a9aa5" font-size="8" font-family="Arial">${x.toFixed(0)}</text>`
      )
      .join('')

  const cut = bundNetStrippingBands(data, section)
    .map((band) => `<path d="${bandPath(band)}" fill="url(#${cutId})"/>`)
    .join('')
  const fill = leveling.formation
    .map((band) => `<path d="${bandPath(band)}" fill="url(#${fillId})"/>`)
    .join('')

  // Hearting drawn over the formation hatch: the zone is measured as the part
  // of that same fill placed with impervious soil, so it belongs on top of it.
  const hearting = heartingBands
    .map((band) => `<path d="${bandPath(band)}" fill="url(#${heartId})"/>`)
    .join('')
  const heartingOutline =
    heartingLine.length >= 2
      ? `<path d="${path(heartingLine)}" fill="none" stroke="#b8558c" stroke-width="1.4"/>`
      : ''
  const trenchOutline = hasTrench
    ? `<path d="${
        [
          ...trench.top.map(
            (p, i) => `${i ? 'L' : 'M'} ${X(p.offset).toFixed(1)} ${Y(p.rl).toFixed(1)}`
          ),
          `L ${X(trench.bottom[1].offset).toFixed(1)} ${Y(trench.bottom[1].rl).toFixed(1)}`,
          `L ${X(trench.bottom[0].offset).toFixed(1)} ${Y(trench.bottom[0].rl).toFixed(1)}`,
          'Z'
        ].join(' ')
      }" fill="url(#${heartId})" stroke="#b8558c" stroke-width="1.2" stroke-dasharray="3 2"/>`
    : ''

  // A key, so the two hatches on a zoned section are not left to be guessed.
  const key = zoned
    ? `<rect x="${(width - padR - 84).toFixed(1)}" y="${padT + 2}" width="8" height="7" fill="url(#${heartId})" stroke="#b8558c" stroke-width="0.6"/>` +
      `<text x="${(width - padR - 73).toFixed(1)}" y="${padT + 8}" fill="#8a4a72" font-size="7.5" font-family="Arial">Hearting${
        hasTrench ? ' + trench' : ''
      }</text>` +
      `<rect x="${(width - padR - 84).toFixed(1)}" y="${padT + 12}" width="8" height="7" fill="url(#${fillId})" stroke="#4ea1e0" stroke-width="0.6"/>` +
      `<text x="${(width - padR - 73).toFixed(1)}" y="${padT + 18}" fill="#2b6fa8" font-size="7.5" font-family="Arial">Casing</text>`
    : ''

  return (
    `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" class="bp-fig">` +
    defs +
    grid +
    cut +
    fill +
    hearting +
    trenchOutline +
    `<path d="${path(leveling.existing)}" fill="none" stroke="#8a6a3a" stroke-width="1.4"/>` +
    `<path d="${path(leveling.proposed)}" fill="none" stroke="#2b6fa8" stroke-width="1.7"/>` +
    heartingOutline +
    key +
    `<text x="${padL}" y="${height - 4}" fill="#9aa8b2" font-size="8" font-family="Arial">Ch from start (m)</text>` +
    `</svg>`
  )
}

interface PrintableBand {
  fromOffset: number
  toOffset: number
  upperFromRl: number
  upperToRl: number
  lowerFromRl: number
  lowerToRl: number
}

function bandDepthAt(bands: PrintableBand[], offset: number): number {
  const band = bands.find(
    (candidate) =>
      offset >= candidate.fromOffset - 1e-9 && offset <= candidate.toOffset + 1e-9
  )
  if (!band) return 0
  const width = band.toOffset - band.fromOffset
  const t = width <= 1e-9 ? 0 : (offset - band.fromOffset) / width
  const upper = band.upperFromRl + (band.upperToRl - band.upperFromRl) * t
  const lower = band.lowerFromRl + (band.lowerToRl - band.lowerFromRl) * t
  return Math.max(0, upper - lower)
}

export function zonedRepairHeartingStations(
  data: BundData,
  section: BundSection
): Array<{ offset: number; ch: number; el: number; rl: number; depth: number }> {
  const hearting = heartingRepairProfile(data, section)
  const heartingBase = heartingBaseProfile(data, section)
  const heartingBands = heartingRepairBands(data, section)
  if (hearting.length < 4 || heartingBase.length < 2) return []
  const leftContact = hearting[0]
  const rightContact = hearting.at(-1)!
  const hiddenOffsets = new Set(
    (section.hiddenLevelOffsets ?? []).map((offset) => Math.round(offset * 1000) / 1000)
  )
  const requiredOffsets = new Set([
    Math.round(leftContact.offset * 1000) / 1000,
    Math.round(rightContact.offset * 1000) / 1000,
    ...hearting.map((point) => Math.round(point.offset * 1000) / 1000),
    ...heartingBase.map((point) => Math.round(point.offset * 1000) / 1000)
  ])
  const rawOffsets = [
    ...hearting.flatMap((point) => [point.offset]),
    ...heartingBase.flatMap((point) => [point.offset]),
    ...heartingBands.flatMap((band) => [band.fromOffset, band.toOffset])
  ]
  const offsets = [...new Set(rawOffsets.map((offset) => Math.round(offset * 1000) / 1000))]
    .filter(
      (offset) =>
        offset >= leftContact.offset - 1e-9 &&
        offset <= rightContact.offset + 1e-9 &&
        (!hiddenOffsets.has(offset) || requiredOffsets.has(offset))
    )
    .sort((a, b) => a - b)
  if (offsets.length < 2) return []

  const origin = Math.min(upstreamToeOffset(section, data), offsets[0])
  return offsets.map((offset) => ({
    offset,
    ch: Math.round((offset - origin) * 1000) / 1000,
    el: existLevelAt(heartingBase, offset),
    rl: existLevelAt(hearting, offset),
    depth: bandDepthAt(heartingBands, offset)
  }))
}

