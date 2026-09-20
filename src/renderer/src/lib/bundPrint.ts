// Bund "Detailed Estimate" pages: the earthwork classification, the component
// details, the surveyed cross-sections and the statement of quantities.
// Returned as a full HTML document so it merges into the same combined
// component PDF as every other component's detailed estimate (shared look —
// see componentPrint.ts, and guideWallPrint.ts for the same shape).
//
// Every quantity here comes from the engine in bund.ts. Nothing is measured a
// second time in this file: a printed number that disagreed with the dashboard
// would be worse than no print at all.

import type {
  BundBerm,
  BundData,
  BundSection,
  EestimateProject,
  ProjectNode,
  TemplateMaterialRef
} from '../types/project'
import type { RateAnalysisRecipe } from '../types/rateAnalysis'
import {
  bermDrainProtectionMeasurement,
  bundLevelingGeometry,
  bundNetStrippingBands,
  downstreamDesignToePointAt,
  downstreamToeFaceSlope,
  bermLabel,
  bermSurfaceMeasurement,
  casingRows,
  heartingBaseProfile,
  heartingRepairBands,
  heartingRepairProfile,
  heartingTrenchArea,
  heartingTrenchEnabled,
  heartingTrenchProfile,
  heartingTrenchRows,
  heartingRows,
  isZonedBund,
  isZonedRepair,
  chuteDrainExcavationQuantity,
  chuteDrainProtectionMeasurement,
  clearancePerimeterRows,
  clearanceTotal,
  existLevelAt,
  steepestSection,
  formatChainage,
  formationRows,
  horizontalFilterRows,
  horizontalFilterMeasure,
  horizontalFilterLengthAt,
  horizontalFilterThicknessM,
  internalFiltersAvailable,
  verticalFilterRows,
  verticalFilterMeasure,
  orderedSections,
  phreaticGeometry,
  pitchingMeasuredQuantity,
  pitchingRows,
  pitchingThicknessM,
  projectedProfile,
  rockToeBaseWidth,
  quantityRows,
  rockToeFilterBelowThicknessM,
  rockToeHeightAt,
  rockToeExcavationRows,
  rockToeFilterRows,
  rockToeRows,
  rowsTotal,
  resolvedHeartingTrenchDepth,
  sectionAreas,
  strippingRows,
  toeDrainDepthAt,
  toeDrainInvertLevelAt,
  toeDrainTopWidthAt,
  toeExcavationRows,
  turfingRows,
  upstreamToeOffset,
  usesFreeBoardDesign,
  verticalFilterHeightAt,
  verticalFilterWidthM,
  zonedRepairAreas,
  type BundQtyRow
} from './bund'
import {
  assemblyFigure,
  bermFigure,
  chuteFigure,
  filterFigure,
  dsDrainFigure,
  rockToeFigure,
  usToeFigure
} from './bundFigures'
import {
  chooseSectionItemLayout,
  fitSectionNumber,
  type SectionLayoutDecision
} from './sectionPrintLayout'
import { findNode } from './tree'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const f2 = (n: number | null | undefined): string => (n == null ? '—' : n.toFixed(2))
const f3 = (n: number | null | undefined): string => (n == null ? '—' : n.toFixed(3))

/** The description a printed line should carry, preferring the resolved item. */
function refDescription(
  root: ProjectNode,
  data: BundData,
  ref: TemplateMaterialRef | null | undefined
): string {
  if (!ref) return ''
  if (ref.description) return ref.description
  // Fall back to the generated item node, which the sync fills from the same
  // master. Both being empty means the code was never resolved.
  const entry = (data.materialItems ?? []).find((m) => m.code === ref.code)
  const node = entry ? findNode(root, entry.itemNodeId) : null
  return node?.itemDescription ?? ''
}

/** Code · unit · description, the opening of a billed item. */
function ssrHead(
  root: ProjectNode,
  data: BundData,
  ref: TemplateMaterialRef | null | undefined,
  name: string
): string {
  if (!ref) return ''
  const description = refDescription(root, data, ref)
  return (
    `<div class="bp-ssr">` +
    `<div class="bp-ssr-h"><b>${escapeHtml(name)}</b>` +
    `<span class="bp-code">${escapeHtml(ref.code)}</span>` +
    (ref.unit ? `<span class="bp-unit">Unit ${escapeHtml(ref.unit)}</span>` : '') +
    `</div>` +
    (description ? `<p class="bp-desc">${escapeHtml(description)}</p>` : '') +
    `</div>`
  )
}

/**
 * One exhibit: a drawing and the handful of dimensions that read off it.
 *
 * `table{break-inside:auto}` is right for the schedules — a chainage run has to
 * be free to cross sheets — but a three-row parameter table is not a schedule.
 * Left to flow it can shed its last row onto the next page, and a drawing
 * separated from the dimensions it is drawn to is not worth the white space
 * that keeping them together costs.
 */
function keepTogether(...parts: string[]): string {
  return `<div class="bp-keep">${parts.filter(Boolean).join('')}</div>`
}

/** A single total line with its workings and no repeated code. */
function totalLine(workings: string, quantity: number, unit: string): string {
  return (
    `<table class="bp-t wide"><tr class="tot">` +
    `<td class="l">${escapeHtml(workings)}</td>` +
    `<td class="n">${f2(quantity)}</td><td class="u">${escapeHtml(unit)}</td>` +
    `</tr></table>`
  )
}

// ---------------------------------------------------------------------------
// Earth work excavation
// ---------------------------------------------------------------------------

const SOIL_ORDER = ['All Soils', 'HDR', 'F&F', 'HR']

interface ExcavationSource {
  label: string
  quantity: number
  role: keyof NonNullable<BundData['excavationBands']>
}

/**
 * Where earth is excavated on this bund. Quantities come from the same engine
 * calls the dashboard shows, so the sheet cannot drift from the totals.
 */
function excavationSources(data: BundData): ExcavationSource[] {
  const sources: ExcavationSource[] = [
    {
      label: data.mode === 'new' ? 'Bund Foundation Excavation' : 'Bund Stripping',
      quantity: rowsTotal(strippingRows(data)),
      role: 'stripping'
    }
  ]
  if (data.upstreamToe.excavationMaterial) {
    sources.push({
      label: 'Toe wall',
      quantity: rowsTotal(toeExcavationRows(data, data.upstreamToe)),
      role: 'ustoe-exc'
    })
  }
  if (data.downstreamToe.excavationMaterial) {
    sources.push({
      label: 'Toe drain',
      quantity: rowsTotal(toeExcavationRows(data, data.downstreamToe)),
      role: 'dstoe-exc'
    })
  }
  const rockToeTrenchQty = data.rockToeExcavationMaterial
    ? rowsTotal(rockToeExcavationRows(data))
    : 0
  if (rockToeTrenchQty > 1e-9) {
    sources.push({
      label: 'Rock toe trench',
      quantity: rockToeTrenchQty,
      role: 'rocktoe-exc'
    })
  }
  if (data.chuteDrainExcavationMaterial) {
    sources.push({
      label: 'Chute drain',
      quantity: chuteDrainExcavationQuantity(data),
      role: 'chute-exc'
    })
  }
  if (heartingTrenchEnabled(data) && data.heartingTrench.excavationMaterial) {
    sources.push({
      label: 'Hearting cut-off trench',
      quantity: rowsTotal(heartingTrenchRows(data)),
      role: 'hearting-trench-exc'
    })
  }
  return sources.filter((source) => source.quantity > 1e-9)
}

/** Percentage split for one excavation role, in the printed class order. */
function bandsFor(data: BundData, role: ExcavationSource['role']): { pct: number; code: string }[] {
  const bands =
    role === 'stripping' && data.soilBands?.length
      ? data.soilBands
      : data.excavationBands?.[role] ?? []
  return SOIL_ORDER.map((label) => {
    const key = label.toLowerCase().replaceAll(' ', '').replaceAll('&', '')
    const band = bands.find(
      (b) => b.label.toLowerCase().replaceAll(' ', '').replaceAll('&', '') === key
    )
    return { pct: band?.pct ?? 0, code: band?.material.code ?? '' }
  })
}

/** The first band ref carrying this code, for its unit and description. */
function findBandRef(data: BundData, code: string): TemplateMaterialRef | null {
  const pools = [data.soilBands ?? [], ...Object.values(data.excavationBands ?? {})]
  for (const pool of pools) {
    const band = pool.find((b) => b.material.code === code)
    if (band) return band.material
  }
  return null
}

/** Soil classes actually carrying quantity on this work, in printed order. */
function excavationClassesInUse(sources: ExcavationSource[], data: BundData): string[] {
  return SOIL_ORDER.filter((_, index) =>
    sources.some((source) => bandsFor(data, source.role)[index].pct > 0)
  )
}

/**
 * Landscape earns its width only when every soil class is billed: four
 * percentage/qty column pairs do not fit portrait. Fewer classes print in
 * portrait, flowing with the rest of the narrative.
 */
export function excavationNeedsLandscape(data: BundData): boolean {
  return excavationClassesInUse(excavationSources(data), data).length >= SOIL_ORDER.length
}

function excavationBlocks(root: ProjectNode, data: BundData): string[] {
  const sources = excavationSources(data)
  if (!sources.length) return []

  // Unused classes take their whole Percentage/Qty pair out of the table, so
  // the sheet stays as narrow as the work actually is.
  const classesInUse = excavationClassesInUse(sources, data)
  const classIndex = (index: number) =>
    classesInUse.findIndex((label) => label === SOIL_ORDER[index])

  const classTotals = SOIL_ORDER.map(() => 0)
  let grand = 0
  const body = sources
    .map((source) => {
      grand += source.quantity
      const cells = bandsFor(data, source.role)
        .map((band, index) => {
          const quantity = (source.quantity * band.pct) / 100
          classTotals[index] += quantity
          return { band, quantity, at: classIndex(index) }
        })
        .filter(({ at }) => at >= 0)
        .sort((a, b) => a.at - b.at)
        .map(
          ({ band, quantity }) =>
            `<td class="n">${band.pct ? `${band.pct}%` : '—'}</td><td class="n">${f2(quantity)}</td>`
        )
        .join('')
      return `<tr><td class="l">${escapeHtml(source.label)}</td><td class="n">${f2(source.quantity)}</td>${cells}</tr>`
    })
    .join('')

  const head =
    `<tr><th class="l">Excavated at</th><th>Qty</th>` +
    classesInUse.map((label) => `<th>Percentage</th><th>${escapeHtml(label)}</th>`).join('') +
    `</tr>`
  const totals =
    `<tr class="tot"><td class="l">Total</td><td class="n">${f2(grand)}</td>` +
    classesInUse
      .map((label) => {
        const index = SOIL_ORDER.indexOf(label)
        return `<td></td><td class="n">${f2(classTotals[index])}</td>`
      })
      .join('') +
    `</tr>`

  // Which cuts bill on which code family. The dashboard decides: stripping can
  // sit on either basis, the rest follow what they are.
  const families: { title: string; subtitle: string; roles: ExcavationSource['role'][] }[] = [
    {
      title: data.mode === 'new' ? 'Bund Foundation Excavation' : 'Bund Stripping',
      subtitle: 'CAW excavation codes',
      roles: ['dstoe-exc', 'chute-exc', 'berm-drain-exc']
    },
    {
      title: 'Bund Foundation Excavation',
      subtitle: 'DAW excavation codes',
      roles: ['ustoe-exc', 'rocktoe-exc', 'hearting-trench-exc']
    }
  ]
  // Stripping joins whichever family its own band codes point at.
  const strippingIsFoundation = bandsFor(data, 'stripping').some((band) =>
    band.code.startsWith('IRR-DAW')
  )
  families[strippingIsFoundation ? 1 : 0].roles.unshift('stripping')

  const columns = families
    .map((family) => {
      // A basis with no cuts on it does not print at all — an empty family
      // says nothing the estimate needs.
      const mine = sources.filter((source) => family.roles.includes(source.role))
      if (!mine.length) return ''
      const list = `<ul class="bp-fam-list">${mine
        .map(
          (source) =>
            `<li>${escapeHtml(source.label)}<span>${f2(source.quantity)}</span></li>`
        )
        .join('')}</ul>`

      // The codes this family bills to, one per soil class, with the class
      // total gathered across every cut assigned here. A class carrying no
      // quantity prints nothing rather than an empty row.
      const perClass = SOIL_ORDER.map((label, index) => {
        let quantity = 0
        let code = ''
        for (const source of mine) {
          const band = bandsFor(data, source.role)[index]
          if (!band.pct) continue
          code = code || band.code
          quantity += (source.quantity * band.pct) / 100
        }
        return { label, code, quantity }
      }).filter((entry) => entry.code && entry.quantity > 1e-9)

      const codes = perClass
        .map((entry) => {
          const ref = findBandRef(data, entry.code)
          const description = refDescription(root, data, ref)
          return (
            `<div class="bp-xcode"><div class="bp-xcode-h">` +
            `<b>${escapeHtml(entry.label)}</b>` +
            `<span class="bp-code">${escapeHtml(entry.code)}</span>` +
            (ref?.unit ? `<span class="bp-unit">Unit ${escapeHtml(ref.unit)}</span>` : '') +
            `<span class="bp-xcode-q">${f2(entry.quantity)}</span></div>` +
            (description ? `<p class="bp-desc">${escapeHtml(description)}</p>` : '') +
            `</div>`
          )
        })
        .join('')

      return (
        `<div class="bp-fam"><div class="bp-fam-h"><b>${escapeHtml(family.title)}</b>` +
        `<span>${escapeHtml(family.subtitle)}</span></div>${list}${codes}</div>`
      )
    })
    .join('')

  return [
    `<h3>Earth work excavation</h3>`,
    `<p class="bp-note">Every excavation on the work, where it is dug and how its volume is ` +
      `classified across the soil profiles set on the dashboard.</p>`,
    `<table class="bp-t"><thead>${head}</thead><tbody>${body}${totals}</tbody></table>`,
    `<div class="bp-fam-cols">${columns}</div>`
  ]
}

// ---------------------------------------------------------------------------
// Phreatic line — printed only when the dashboard opts in
// ---------------------------------------------------------------------------

/** The same bund with every drainage option removed — the reference case. */
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

/** Compulsory true-shape general arrangement for every new bund. */
function bundDiagramBlocks(data: BundData): string[] {
  const section = steepestSection(data) ?? orderedSections(data)[0]
  if (!section) return []
  const figure = assemblyFigure(data, section)
  if (!figure) return []
  const design = data.design
  const value = (number: number | null | undefined): string =>
    number == null || !Number.isFinite(number) ? 'Not set' : f2(number)
  const summary =
    `<div class="bp-diagram-summary">` +
    `<span><b>MWL</b> ${value(design.mwl)} m</span>` +
    `<span><b>Freeboard</b> ${value(design.freeBoard)} m</span>` +
    `<span><b>TBL</b> ${value(design.topLevel)} m</span>` +
    `<span><b>FTL</b> ${value(design.ftl)} m</span>` +
    `<span><b>U/S slope</b> ${f2(design.usSlope)}:1</span>` +
    `<span><b>D/S slope</b> ${f2(design.dsSlope)}:1</span>` +
    `</div>`
  return [
    `<section class="bp-bund-diagram-page">${summary}` +
    `<div class="bp-bund-diagram">${figure}</div></section>`
  ]
}

/**
 * The seepage check, drawn on the proposed section at the steepest chainage.
 *
 * Two lines are shown against the same section: the reference case — a plain
 * bund with no drainage at all — and the actual case with whatever drainage is
 * selected. The pair is the whole point of the check: it shows what the rock
 * toe or filter is buying, which a single line cannot.
 */
function phreaticBlocks(data: BundData): string[] {
  const section = steepestSection(data) ?? orderedSections(data)[0]
  if (!section) return []

  // A zoned bund is covered by the separate Bund Diagram. A Casagrande line
  // through a homogeneous body is not applicable to its impervious core.
  if (isZonedBund(data)) return []

  if (!data.includePhreaticInPrint) return []
  const actual = phreaticGeometry(data, section)
  const reference = phreaticGeometry(baselinePhreaticData(data), section)
  if (!actual && !reference) return []
  const primary = actual ?? reference
  if (!primary) return []

  const design = data.design
  const proposed = projectedProfile(section, design)
  if (proposed.length < 2) return []
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
  const height = 380
  const padL = 96
  const padR = 58
  const padTop = 54
  const padBottom = 62

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
  const minY = Math.min(...ys) - 0.5
  const maxY = Math.max(...ys) + 1.2
  if (maxX - minX <= 0 || maxY - minY <= 0) return []

  const k = Math.min(
    (width - padL - padR) / (maxX - minX),
    (height - padTop - padBottom) / (maxY - minY)
  )
  const X = (x: number): number => padL + (x - minX) * k
  const Y = (y: number): number => padTop + (maxY - y) * k
  const n1 = (v: number): string => v.toFixed(1)

  const poly = (pts: { offset: number; rl: number }[]): string =>
    pts
      .slice()
      .sort((a, b) => a.offset - b.offset)
      .map((p, i) => `${i ? 'M' : 'M'}${i ? '' : ''} ${n1(X(p.offset))} ${n1(Y(p.rl))}`)
      .map((d, i) => (i ? d.replace('M', 'L') : d))
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
    label((X(crestL.offset) + X(crestR.offset)) / 2, Y(design.topLevel) - 26, `TBL ${f2(design.topLevel)}`) +
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
          Y(dsToe.rl) - 8,
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
  const legendY = height - 22
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

  const caption =
    `Casagrande phreatic line on the proposed section at the steepest chainage, ` +
    `Ch ${formatChainage(section.chainage, data.chainageUnit)}. ` +
    (options.length
      ? `The reference line is the same bund with no drainage at all; the actual line carries the ${options.join(', ')}. `
      : `No drainage option is selected, so both lines coincide. `) +
    (actual?.cutsFace
      ? 'The actual line still exits on the downstream face — the drainage is not holding it in.'
      : 'The actual line is held inside the downstream face.')

  return [
    `<h3>Phreatic line</h3>`,
    `<p class="bp-lead">${escapeHtml(caption)}</p>`,
    
    keepTogether(
    `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" class="bp-fig">` +
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
    `</svg>`,
    `<table class="bp-t"><tbody>` +
    `<tr><td class="l">Focal distance S — actual</td><td class="n">${f3(actual?.s ?? 0)}</td><td class="u">m</td></tr>` +
    (reference
      ? `<tr><td class="l">Focal distance S — reference</td><td class="n">${f3(reference.s)}</td><td class="u">m</td></tr>`
      : '') +
    `<tr><td class="l">Seepage q = K · S</td><td class="n">${f3(actual?.s ?? 0)}</td><td class="u">× K</td></tr>` +
    `<tr><td class="l">Water depth above the focus datum</td><td class="n">${f3(primary.waterDepth)}</td><td class="u">m</td></tr>` +
    `<tr class="${actual?.cutsFace ? 'bp-warn' : ''}"><td class="l">Actual line exits on the downstream face</td>` +
    `<td class="n" colspan="2">${actual?.cutsFace ? 'YES — review the drainage' : 'No'}</td></tr>` +
    (reference
      ? `<tr><td class="l">Reference line exits on the downstream face</td>` +
        `<td class="n" colspan="2">${reference.cutsFace ? 'Yes' : 'No'}</td></tr>`
      : '') +
    `</tbody></table>`
    )
  ]
}


// ---------------------------------------------------------------------------
// Component details
// ---------------------------------------------------------------------------

function componentDetailsBlocks(root: ProjectNode, data: BundData): string[] {
  const parts: string[] = []

  if (data.clearanceMaterial) {
    parts.push(ssrHead(root, data, data.clearanceMaterial, 'Jungle clearance'))
    parts.push(totalLine('Total quantity', clearanceTotal(data), data.clearanceMaterial.unit ?? 'sq.m'))
  }

  const formationTotal = rowsTotal(formationRows(data))
  const formationEnabled = data.formationEnabled ?? true
  const compactionEnabled = data.compactionEnabled ?? true

  if (isZonedBund(data)) {
    // A zoned bund is two fills, not one: an impervious hearting zone inside an
    // outer casing. They carry their own codes and are never merged, even where
    // the same code happens to serve both.
    parts.push(`<h4>Zoned embankment</h4>`)
    parts.push(
      `<p class="bp-lead">The section is placed in two zones — an impervious hearting core ` +
        `carrying the water load, and the outer casing around it. Each is measured and billed ` +
        `separately; together they make up the formation volume for the section.</p>`
    )
    parts.push(ssrHead(root, data, data.formationMaterial, 'Casing zone'))
    parts.push(
      totalLine('Total quantity', rowsTotal(casingRows(data)), data.formationMaterial.unit ?? 'cum')
    )
    // No separate zone figure here: the arrangement drawing at the head of
    // these pages already shows the core in place, and every cross-section
    // draws it again at its own chainage.
    parts.push(ssrHead(root, data, data.heartingMaterial, 'Hearting zone (impervious)'))
    parts.push(
      totalLine('Total quantity', rowsTotal(heartingRows(data)), data.heartingMaterial.unit ?? 'cum')
    )
    // The cut-off trench is the hearting's foundation: the same impervious soil
    // carried below the formation base, in a confined cut the SSR rates apart.
    if (heartingTrenchEnabled(data)) {
      const trenchFill = data.heartingTrench.fillMaterial as TemplateMaterialRef
      const trench = rowsTotal(heartingTrenchRows(data))
      parts.push(
        ssrHead(root, data, trenchFill, 'Hearting cut-off trench — impervious filling')
      )
      parts.push(
        `<p class="bp-lead">Trapezoidal key trench under the core: ` +
          `${f2(data.heartingTrench.bottomWidth)} m wide at the invert, ` +
          `${f2(resolvedHeartingTrenchDepth(data))} m below the formation base${
            data.heartingTrench.depthMode === 'auto'
              ? ' (auto from FTL/FRL, or MWL when FTL is blank, and the lowest toe RL)'
              : ' (manual)'
          }, sides ` +
          `${f2(data.heartingTrench.usSlope)}:1 u/s and ${f2(data.heartingTrench.dsSlope)}:1 d/s ` +
          `— ${f2(heartingTrenchArea(data))} sq.m of section. It is excavated and filled back ` +
          `with selected impervious soil, so the cut and the filling are one volume.</p>`
      )
      parts.push(totalLine('Total quantity', trench, trenchFill.unit ?? 'cum'))
      if (data.heartingTrench.excavationMaterial) {
        parts.push(
          ssrHead(
            root,
            data,
            data.heartingTrench.excavationMaterial,
            'Hearting cut-off trench — foundation excavation'
          )
        )
        parts.push(
          totalLine(
            'Total quantity',
            trench,
            data.heartingTrench.excavationMaterial.unit ?? 'cum'
          )
        )
      }
    }
    if (compactionEnabled && !formationEnabled) {
      parts.push(ssrHead(root, data, data.rollingMaterial, 'Rolling — casing zone'))
      parts.push(
        totalLine('Total quantity', rowsTotal(casingRows(data)), data.rollingMaterial.unit ?? 'cum')
      )
      parts.push(ssrHead(root, data, data.heartingRollingMaterial, 'Rolling — hearting zone'))
      parts.push(
        totalLine(
          'Total quantity',
          rowsTotal(heartingRows(data)),
          data.heartingRollingMaterial.unit ?? 'cum'
        )
      )
    }
  } else if (formationEnabled) {
    parts.push(
      ssrHead(
        root,
        data,
        data.formationMaterial,
        compactionEnabled ? 'Formation of embankment, including compaction' : 'Formation of embankment'
      )
    )
    parts.push(totalLine('Total quantity', formationTotal, data.formationMaterial.unit ?? 'cum'))
  } else if (compactionEnabled) {
    parts.push(ssrHead(root, data, data.rollingMaterial, 'Rolling of embankment'))
    parts.push(totalLine('Total quantity', formationTotal, data.rollingMaterial.unit ?? 'cum'))
  }

  if (data.pitchingMaterial) {
    const measured = pitchingMeasuredQuantity(data)
    parts.push(ssrHead(root, data, data.pitchingMaterial, 'Revetment'))
    parts.push(
      `<p class="bp-note">Extent: ${
        data.pitchingExtent === 'full'
          ? 'complete developed upstream face.'
          : 'up to MWL on each section, ending where MWL meets the ground.'
      }</p>`
    )
    if (data.pitchingMaterial.dataVariant?.addonId) {
      parts.push(
        `<p class="bp-note">Includes the ${escapeHtml(
          data.pitchingMaterial.dataVariant.label ?? 'selected'
        )} add-on — a DATA variant on this rate, not a work code of its own.</p>`
      )
    }
    parts.push(
      totalLine(
        'Total quantity',
        measured.quantity,
        measured.measure === 'volume' ? 'cum' : 'sq.m'
      )
    )
  }

  if (data.turfingMaterial) {
    parts.push(ssrHead(root, data, data.turfingMaterial, 'Turfing'))
    parts.push(totalLine('Total quantity', rowsTotal(turfingRows(data)), data.turfingMaterial.unit ?? 'sq.m'))
  }

  // Toe works.
  if (data.upstreamToe.excavationMaterial) {
    const toe = data.upstreamToe
    parts.push(`<h4>U/S toe wall / anchorage</h4>`)
    parts.push(
      `<p class="bp-lead">Cut-off trench at the upstream toe. It anchors the slope pitching where ` +
        `pitching is used, and stands on its own otherwise.</p>`
    )
    parts.push(
      keepTogether(
        usToeFigure(data),
        `<table class="bp-t"><tbody>` +
          `<tr><td class="l">Top width</td><td class="n">${f2(toe.topWidth)}</td><td class="u">m</td></tr>` +
          `<tr><td class="l">Bottom width</td><td class="n">${f2(toe.bottomWidth)}</td><td class="u">m</td></tr>` +
          `<tr><td class="l">Depth</td><td class="n">${f2(toe.depth)}</td><td class="u">m</td></tr>` +
          `</tbody></table>`
      )
    )
    parts.push(totalLine('Excavation quantity', rowsTotal(toeExcavationRows(data, toe)), 'cum'))
  }

  if (data.downstreamToe.excavationMaterial) {
    const toe = data.downstreamToe
    parts.push(`<h4>D/S toe drain</h4>`)
    parts.push(
      `<p class="bp-lead">Longitudinal drain along the downstream toe: it collects the seepage ` +
        `emerging there and the runoff off the downstream face, so the toe does not stand saturated.</p>`
    )
    const drainSection = orderedSections(data).reduce<BundSection | null>(
      (governing, candidate) =>
        !governing || toeDrainDepthAt(candidate, data) > toeDrainDepthAt(governing, data)
          ? candidate
          : governing,
      null
    )
    const drainDepth = drainSection ? toeDrainDepthAt(drainSection, data) : toe.depth
    const drainTopWidth = drainSection
      ? toeDrainTopWidthAt(drainSection, data)
      : toe.bottomWidth + (toe.leftSlope + toe.rightSlope) * drainDepth
    const drainInvert = drainSection ? toeDrainInvertLevelAt(drainSection, data) : null
    parts.push(
      keepTogether(
        drainSection ? dsDrainFigure(data, drainDepth) : '',
        `<table class="bp-t"><tbody>` +
          (drainSection
            ? `<tr><td class="l">Governing section</td><td class="n">${escapeHtml(
                formatChainage(drainSection.chainage, data.chainageUnit)
              )}</td><td class="u"></td></tr>`
            : '') +
          (drainInvert != null
            ? `<tr><td class="l">Invert RL</td><td class="n">${f3(drainInvert)}</td><td class="u"></td></tr>`
            : '') +
          `<tr><td class="l">Top width at governing depth</td><td class="n">${f2(drainTopWidth)}</td><td class="u">m</td></tr>` +
          `<tr><td class="l">Bottom width</td><td class="n">${f2(toe.bottomWidth)}</td><td class="u">m</td></tr>` +
          `<tr><td class="l">Depth</td><td class="n">${f2(drainDepth)}</td><td class="u">m</td></tr>` +
          `<tr><td class="l">U/S side slope (H:V)</td><td class="n">${f2(toe.leftSlope)}:1</td><td class="u"></td></tr>` +
          `<tr><td class="l">D/S side slope (H:V)</td><td class="n">${f2(toe.rightSlope)}:1</td><td class="u"></td></tr>` +
          `<tr><td class="l">Berm on each side</td><td class="n">${f2(toe.bermWidth)}</td><td class="u">m</td></tr>` +
          `</tbody></table>`
      )
    )
    parts.push(totalLine('Excavation quantity', rowsTotal(toeExcavationRows(data, toe)), 'cum'))
    if (toe.buildMaterial) {
      parts.push(ssrHead(root, data, toe.buildMaterial, 'Bed and side protection'))
    }
  }

  // Rock toe, with its filter and trench shown only when selected.
  if (data.rockToeMaterial) {
    const rockToeSection = steepestSection(data) ?? orderedSections(data)[0] ?? null
    parts.push(keepTogether(`<h4>Rock toe</h4>`, rockToeFigure(data, rockToeSection)))
    parts.push(ssrHead(root, data, data.rockToeMaterial, 'Rock toe'))
    parts.push(totalLine('Total quantity', rowsTotal(rockToeRows(data)), data.rockToeMaterial.unit ?? 'cum'))
    if (data.rockToeFilterMaterial) {
      parts.push(ssrHead(root, data, data.rockToeFilterMaterial, 'Graded filter media'))
      parts.push(
        totalLine(
          'Total quantity',
          rowsTotal(rockToeFilterRows(data)),
          data.rockToeFilterMaterial.unit ?? 'cum'
        )
      )
    }
    const rockToeTrenchQty = data.rockToeExcavationMaterial
      ? rowsTotal(rockToeExcavationRows(data))
      : 0
    if (rockToeTrenchQty > 1e-9) {
      parts.push(
        `<p class="bp-note">The trench under the rock toe is the payable <b>union</b> of the general ` +
          `leveling cut and the foundation cut — existing ground down to whichever floor is lower, ` +
          `never the sum of the two. The shared cut is deducted from ${
            data.mode === 'new' ? 'foundation excavation' : 'stripping'
          } so it is not paid twice.</p>`
      )
      parts.push(
        totalLine('Trench of rock toe', rockToeTrenchQty, 'cum')
      )
    }
  }

  // Internal drainage filters — new fill only, so a repair never reaches here.
  if (internalFiltersAvailable(data) && data.horizontalFilterMaterial) {
    const filterSection = steepestSection(data) ?? orderedSections(data)[0] ?? null
    parts.push(`<h4>Internal drainage filters</h4>`)
    parts.push(
      `<p class="bp-lead">Sand blanket laid below the prepared base and running inward from the ` +
        `${data.rockToeMaterial ? 'rock-toe inner face' : 'downstream toe'}, with the chimney standing on its inner end where one is used. Together ` +
        `they intercept the seepage inside the body and carry it out at the toe.</p>`
    )
    if (filterSection) parts.push(filterFigure(data, filterSection))
    parts.push(ssrHead(root, data, data.horizontalFilterMaterial, 'Horizontal filter blanket'))
    parts.push(
      totalLine(
        'Total quantity',
        rowsTotal(horizontalFilterRows(data)),
        data.horizontalFilterMaterial.unit ?? 'cum'
      )
    )
    if (data.verticalFilterMaterial) {
      parts.push(ssrHead(root, data, data.verticalFilterMaterial, 'Vertical (chimney) filter'))
      parts.push(
        totalLine(
          'Total quantity',
          rowsTotal(verticalFilterRows(data)),
          data.verticalFilterMaterial.unit ?? 'cum'
        )
      )
    }
  }

  // Chute drains.
  if (data.chuteDrainExcavationMaterial || data.chuteDrainLiningMaterial) {
    parts.push(`<h4>Chute drains</h4>`)
    parts.push(
      `<p class="bp-lead">Cross drains down the downstream face, taking the water collected on the ` +
        `berm and the face to the toe drain instead of letting it gully the slope.</p>`
    )
    parts.push(chuteFigure(data))
    if (data.chuteDrainExcavationMaterial) {
      parts.push(totalLine('Excavation quantity', chuteDrainExcavationQuantity(data), 'cum'))
    }
    if (data.chuteDrainLiningMaterial) {
      const protection = chuteDrainProtectionMeasurement(data)
      parts.push(ssrHead(root, data, data.chuteDrainLiningMaterial, 'Chute protection'))
      parts.push(
        totalLine(
          'Total quantity',
          protection.quantity,
          protection.measure === 'volume' ? 'cum' : 'sq.m'
        )
      )
    }
  }

  // Berms carry no earthwork of their own — the shelf is part of the design
  // face, so its fill is already inside the formation quantity.
  for (const berm of data.design.berms ?? []) {
    parts.push(`<h4>Berm — ${escapeHtml(bermLabel(berm))}</h4>`)
    parts.push(
      `<p class="bp-note">A berm generates no earthwork item of its own: the shelf is part of the ` +
        `proposed design face, so the fill that forms it is already measured inside the formation ` +
        `quantity. Only what is placed on the shelf is billed here.</p>`
    )
    parts.push(keepTogether(bermFigure(data, berm), bermDesignTable(berm)))
    if (berm.surfaceMaterial) {
      const surfacing = bermSurfaceMeasurement(data, berm)
      parts.push(ssrHead(root, data, berm.surfaceMaterial, 'Berm shelf surfacing'))
      parts.push(
        totalLine(
          'Total quantity',
          surfacing.quantity,
          surfacing.measure === 'volume' ? 'cum' : 'sq.m'
        )
      )
    }
    if (berm.drainLiningMaterial) {
      const protection = bermDrainProtectionMeasurement(data, berm)
      parts.push(ssrHead(root, data, berm.drainLiningMaterial, 'Catch-water drain on the shelf'))
      parts.push(
        totalLine(
          'Total quantity',
          protection.quantity,
          protection.measure === 'volume' ? 'cum' : 'sq.m'
        )
      )
    }
  }

  return parts.filter(Boolean)
}

function bermDesignTable(berm: BundBerm): string {
  return (
    `<table class="bp-t"><tbody>` +
    `<tr><td class="l">Shelf RL</td><td class="n">${f3(berm.level)}</td><td class="u"></td></tr>` +
    `<tr><td class="l">Shelf width</td><td class="n">${f2(berm.width)}</td><td class="u">m</td></tr>` +
    `<tr><td class="l">Cross-fall</td><td class="n">1 in ${f2(berm.crossFall)}</td><td class="u"></td></tr>` +
    `</tbody></table>`
  )
}

// ---------------------------------------------------------------------------
// Section sheets
// ---------------------------------------------------------------------------

/**
 * Round grid values at a 1 / 2 / 2.5 / 5 × 10ⁿ step, so the graph-paper lines
 * land on readable numbers. Same rule as the on-screen section diagram.
 */
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
function sectionSvg(data: BundData, section: BundSection, index: number): string {
  const leveling = bundLevelingGeometry(data, section)
  if (!leveling) return ''

  const width = 470
  const height = 210
  const padL = 46
  const padR = 14
  const padT = 12
  const padB = 30

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

  // Keep one drawing unit equal in both directions. The earlier print view
  // deliberately exaggerated the vertical, which made the proposed and
  // existing lines look steeper than the section they represent.
  const availH = height - padT - padB
  const trueSpan = dataMaxRl - dataMinRl
  const unitScale = Math.min((width - padL - padR) / displayMaxX, availH / trueSpan)
  const plotWidth = displayMaxX * unitScale
  const plotHeight = trueSpan * unitScale
  const plotTop = padT + Math.max(0, (availH - plotHeight) / 2)
  const plotBottom = plotTop + plotHeight
  const plotRight = padL + plotWidth
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

/**
 * How the levels table for a section should be typeset.
 *
 * A survey may record six levels at one chainage and forty at the next. Rather
 * than clip the long ones or waste the page on the short ones, the type tightens
 * as the list grows and then wraps into further columns — and past that the
 * section simply takes more height and pushes what follows to the next page,
 * which is what `break-inside: avoid` on the section block already arranges.
 * Nothing is ever dropped.
 */
function levelsLayout(rowCount: number): { scale: number; columns: number } {
  if (rowCount <= 14) return { scale: 1, columns: 1 }
  if (rowCount <= 22) return { scale: 0.92, columns: 1 }
  if (rowCount <= 34) return { scale: 0.88, columns: 2 }
  if (rowCount <= 54) return { scale: 0.82, columns: 2 }
  return { scale: 0.78, columns: 3 }
}

function signedTrapeziumQuantity(
  width: number,
  firstDepth: number,
  secondDepth: number
): number {
  if (width <= 1e-9) return 0
  // A negative depth is excavation/stripping. Keep its sign in the printed
  // quantity; intersection stations split a change from fill to cut so this
  // signed trapezium is exact for every interval.
  return (width * (firstDepth + secondDepth)) / 2
}

/** Compact numbers used only inside the calculation column. */
function calculationNumber(value: number): string {
  if (Math.abs(value) < 0.0005) return '0'
  return value.toFixed(3).replace(/\.?(0+)$/, '')
}

/** A level normally uses two decimals; a meaningful third digit earns smaller type. */
function sectionLevelCell(value: number): string {
  const fitted = fitSectionNumber(value)
  return `<td class="n${fitted.compact ? ' bp-num-tight' : ''}">${fitted.text}</td>`
}

function levelsTable(data: BundData, section: BundSection, fontScale: number): string {
  const leveling = bundLevelingGeometry(data, section)
  if (!leveling) return ''

  const hiddenOffsets = new Set(
    (section.hiddenLevelOffsets ?? []).map((offset) => Math.round(offset * 1000) / 1000)
  )
  const rawOffsets = [
    ...leveling.existing.map((point) => point.offset),
    ...leveling.proposed.map((point) => point.offset),
    ...leveling.formation.flatMap((band) => [band.fromOffset, band.toOffset]),
    ...leveling.stripping.flatMap((band) => [band.fromOffset, band.toOffset])
  ]
  const offsets = [...new Set(rawOffsets.map((offset) => Math.round(offset * 1000) / 1000))]
    .filter((offset) => !hiddenOffsets.has(offset))
    .sort((a, b) => a - b)
  if (offsets.length < 2) return ''

  const origin = Math.min(upstreamToeOffset(section, data), offsets[0])
  const stations = offsets.map((offset) => ({
    offset,
    ch: Math.round((offset - origin) * 1000) / 1000,
    el: existLevelAt(leveling.existing, offset),
    rl: existLevelAt(leveling.proposed, offset)
  }))
  const { scale } = levelsLayout(stations.length)
  let total = 0

  const body = stations
    .map((station, index) => {
      if (index === 0) {
        return (
          `<tr><td class="n">${f2(station.ch)}</td>` +
          sectionLevelCell(station.el) +
          sectionLevelCell(station.rl) +
          `<td class="bp-calc">Start point</td><td class="n">—</td></tr>`
        )
      }

      const previous = stations[index - 1]
      const width = station.ch - previous.ch
      const firstDepth = previous.rl - previous.el
      const secondDepth = station.rl - station.el
      const exactQuantity = signedTrapeziumQuantity(width, firstDepth, secondDepth)
      const quantity = Math.round(exactQuantity * 1000) / 1000
      total += exactQuantity
      const calculation =
        `${calculationNumber(width)} × [` +
        `(${calculationNumber(previous.rl)} - ${calculationNumber(previous.el)}) + ` +
        `(${calculationNumber(station.rl)} - ${calculationNumber(station.el)})] ÷ 2`
      return (
        `<tr><td class="n">${f2(station.ch)}</td>` +
        sectionLevelCell(station.el) +
        sectionLevelCell(station.rl) +
        `<td class="bp-calc">${calculation}</td>` +
        `<td class="n">${f3(quantity)}</td></tr>`
      )
    })
    .join('')

  return (
    `<table class="bp-t bp-levels bp-calc-levels" style="font-size:${(14 * fontScale * scale).toFixed(1)}px">` +
    `<colgroup><col class="bp-col-ch"><col class="bp-col-level"><col class="bp-col-level">` +
    `<col class="bp-col-calc"><col class="bp-col-qty"></colgroup>` +
    `<thead><tr><th>Ch</th><th>EL</th><th>RL</th><th>Calculation</th><th class="bp-qty-head">Quantity</th></tr></thead>` +
    `<tbody>${body}` +
    `<tr class="tot"><td colspan="4" class="l">Total Formation Quantity</td>` +
    `<td class="n">${f3(Math.round(total * 1000) / 1000)} m²</td></tr>` +
    `</tbody></table>`
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

function zonedRepairHeartingStations(
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

function zonedRepairHeartingTable(
  data: BundData,
  section: BundSection,
  fontScale: number
): string {
  const stations = zonedRepairHeartingStations(data, section)
  if (stations.length < 2) return ''
  const { scale } = levelsLayout(stations.length)
  let total = 0
  const body = stations
    .map((station, index) => {
      if (index === 0) {
        return (
          `<tr><td class="n">${f2(station.ch)}</td>` +
          sectionLevelCell(station.el) +
          sectionLevelCell(station.rl) +
          `<td class="bp-calc">Start point</td><td class="n">—</td></tr>`
        )
      }
      const previous = stations[index - 1]
      const width = station.ch - previous.ch
      const exactQuantity = signedTrapeziumQuantity(width, previous.depth, station.depth)
      total += exactQuantity
      return (
        `<tr><td class="n">${f2(station.ch)}</td>` +
        sectionLevelCell(station.el) +
        sectionLevelCell(station.rl) +
        `<td class="bp-calc">${calculationNumber(width)} × [` +
        `${calculationNumber(previous.depth)} + ${calculationNumber(station.depth)}] ÷ 2</td>` +
        `<td class="n">${f3(Math.round(exactQuantity * 1000) / 1000)}</td></tr>`
      )
    })
    .join('')
  return (
    `<table class="bp-t bp-levels bp-calc-levels bp-hearting-levels" style="font-size:${(
      14 * fontScale * scale
    ).toFixed(1)}px">` +
    `<caption class="bp-table-title">Hearting quantity</caption>` +
    `<colgroup><col class="bp-col-ch"><col class="bp-col-level"><col class="bp-col-heart-level">` +
    `<col class="bp-col-calc"><col class="bp-col-qty"></colgroup>` +
    `<thead><tr><th>Ch</th><th>EL</th><th>RL</th><th>Calculation</th><th class="bp-qty-head">Quantity</th></tr></thead>` +
    `<tbody>${body}` +
    `<tr class="tot"><td colspan="4" class="l">Total Hearting Quantity</td>` +
    `<td class="n">${f3(Math.round(total * 1000) / 1000)} m²</td></tr>` +
    `</tbody></table>`
  )
}

function formationStationCount(data: BundData, section: BundSection): number {
  const leveling = bundLevelingGeometry(data, section)
  if (!leveling) return 0
  const hiddenOffsets = new Set(
    (section.hiddenLevelOffsets ?? []).map((offset) => Math.round(offset * 1000) / 1000)
  )
  const rawOffsets = [
    ...leveling.existing.map((point) => point.offset),
    ...leveling.proposed.map((point) => point.offset),
    ...leveling.formation.flatMap((band) => [band.fromOffset, band.toOffset]),
    ...leveling.stripping.flatMap((band) => [band.fromOffset, band.toOffset])
  ]
  const offsets = new Set(rawOffsets.map((offset) => Math.round(offset * 1000) / 1000))
  return [...offsets].filter((offset) => !hiddenOffsets.has(offset)).length
}

/**
 * Put the summary in the column that has the shorter exhibit budget. The
 * chart costs roughly five table rows; this keeps homogeneous summaries under
 * the chart, while a zoned repair with a shorter formation table can use the
 * otherwise empty space below that table.
 */
function sectionSummaryLayout(data: BundData, section: BundSection): SectionLayoutDecision {
  const repair = isZonedRepair(data)
  const chartBudget = 5
  const heartingBudget = repair
    ? zonedRepairHeartingStations(data, section).length
    : 0
  const leftBudget = chartBudget + heartingBudget
  const rightBudget = formationStationCount(data, section)
  return chooseSectionItemLayout({
    itemCount: repair ? 6 : 4,
    leftUsedRows: leftBudget,
    rightUsedRows: rightBudget,
    sideColumns: 2,
    fullColumns: repair ? 3 : 4,
    allowSidePlacement: !isZonedBund(data) || repair
  })
}

function sectionSummary(
  data: BundData,
  section: BundSection,
  layout: SectionLayoutDecision
): string {
  const areas = sectionAreas(data, section)
  const split = isZonedBund(data) ? zonedRepairAreas(data, section) : null
  const trenchArea = heartingTrenchEnabled(data) ? heartingTrenchArea(data) : 0
  const repairSummary = split && isZonedRepair(data)
  const summaryClass =
    (repairSummary ? ' bp-sec-summary-repair' : '') +
    (layout.placement !== 'full' ? ' bp-sec-summary-in-column' : '')
  return (
    `<div class="bp-sec-summary${summaryClass}" style="grid-template-columns:repeat(${layout.columns},minmax(0,1fr))">` +
    `<div><span>Perimeter</span><b>${f3(areas.clearanceWidth)} m</b></div>` +
    `<div><span>Slope - U/S</span><b>${f3(areas.usFace)} m</b></div>` +
    `<div><span>Slope - D/S</span><b>${f3(areas.dsFace)} m</b></div>` +
    `<div><span>${data.mode === 'new' ? 'Foundation Excavation Area' : 'Stripping Area'}</span>` +
    `<b>${f3(areas.stripping)} m²</b></div>` +
    (repairSummary
      ? `<div><span>Casing</span><b>${f3(split.casing)} m²</b></div>` +
        `<div><span>Hearting</span><b>${f3(split.hearting)} m²</b></div>`
      : '') +
    `</div>` +
    (!repairSummary && split
      ? `<table class="bp-t bp-sec-zone-table"><tbody>` +
        `<tr><td class="l">— casing</td><td class="n">${f3(split.casing)}</td><td class="u">m²</td>` +
        `<td class="l">— hearting</td><td class="n">${f3(split.hearting)}</td><td class="u">m²</td>` +
        (trenchArea > 0
          ? `<td class="l">— hearting trench</td><td class="n">${f3(trenchArea)}</td><td class="u">m²</td>`
          : '') +
        `</tr></tbody></table>`
      : '')
  )
}

function sectionsBlocks(data: BundData, fontScale: number): string[] {
  const sections = orderedSections(data)
  // A new bund is drawn once in its arrangement figure; per-section diagrams
  // belong to repairs, where existing ground actually varies along the work.
  if (data.mode === 'new') return []
  if (!sections.length) return []
  const zoned = isZonedBund(data)
  const zonedRepair = isZonedRepair(data)

  const rows: string[] = sections
    .map((section, index) => {
      const figure = `<div class="bp-sec-fig">${sectionSvg(data, section, index)}</div>`
      const layout = sectionSummaryLayout(data, section)
      const summary = sectionSummary(data, section, layout)
      const left = zonedRepair
        ? `<div class="bp-sec-left">${figure}${zonedRepairHeartingTable(
            data,
            section,
            fontScale
          )}${layout.placement === 'left' ? summary : ''}</div>`
        : `<div class="bp-sec-left">${figure}${layout.placement === 'left' ? summary : ''}</div>`
      const table = levelsTable(data, section, fontScale)
      return (
        `<div class="bp-sec">` +
        `<div class="bp-sec-h">Ch ${escapeHtml(formatChainage(section.chainage, data.chainageUnit))}</div>` +
        `<div class="bp-sec-body">` +
        left +
        `<div class="bp-sec-right">${table}${layout.placement === 'right' ? summary : ''}</div>` +
        `</div>` +
        (layout.placement === 'full' ? summary : '') +
        `</div>`
      )
    })


  // Keep each calculation exhibit together so its chart, table, and summary
  // remain one readable block on the printed sheet.
  return [`<h3>Cross-sections</h3>`, `<div class="bp-secs">${rows.join('')}</div>`]
}

// ---------------------------------------------------------------------------
// Statement of quantities
// ---------------------------------------------------------------------------

/**
 * Bund statement requested as one cross-section schedule. Wide work-item
 * columns are split into landscape continuation tables so 14 pt text is
 * never compressed into unreadable slivers. Chainage and length appear in the
 * first column group, while every quantity comes from the normal MSA engine.
 */
function bundStatementBlocks(data: BundData): string[] {
  const sections = orderedSections(data)
  if (sections.length < 2) return []

  const zoned = isZonedBund(data)
  const clearance =
    data.clearanceMaterial && data.clearanceMode !== 'manual'
      ? clearancePerimeterRows(data)
      : []
  const foundation = strippingRows(data)
  const usToe = data.upstreamToe.excavationMaterial
    ? toeExcavationRows(data, data.upstreamToe)
    : []
  const dsToe = data.downstreamToe.excavationMaterial
    ? toeExcavationRows(data, data.downstreamToe)
    : []
  const homogeneous = zoned ? [] : formationRows(data)
  const cutoffTrench = zoned ? heartingTrenchRows(data) : []
  const hearting = zoned ? heartingRows(data) : []
  const casing = zoned ? casingRows(data) : []
  const revetment = data.pitchingMaterial ? pitchingRows(data) : []
  const turf = data.turfingMaterial ? turfingRows(data) : []
  const rockToe = data.rockToeMaterial ? rockToeRows(data) : []
  const rockToeTrench = data.rockToeExcavationMaterial ? rockToeExcavationRows(data) : []
  const rockFilter = data.rockToeFilterMaterial ? rockToeFilterRows(data) : []
  const horizontal = data.horizontalFilterMaterial ? horizontalFilterRows(data) : []
  const vertical = data.verticalFilterMaterial ? verticalFilterRows(data) : []
  const revetmentMeasure = pitchingMeasuredQuantity(data).measure
  const revetmentFactor = revetmentMeasure === 'volume' ? pitchingThicknessM(data) : 1
  const horizontalMeasure = horizontalFilterMeasure(data)
  const verticalMeasure = verticalFilterMeasure(data)
  const chuteMeasure = chuteDrainProtectionMeasurement(data).measure

  const sectionValue = (rows: BundQtyRow[], index: number, factor = 1): number | null => {
    if (!rows.length) return null
    if (index === 0) return rows[0]?.areaFrom == null ? null : rows[0].areaFrom * factor
    return rows[index - 1]?.areaTo == null ? null : rows[index - 1].areaTo * factor
  }
  const averageToeRl = (section: BundSection): number | null => {
    const geometry = bundLevelingGeometry(data, section)
    if (!geometry) return null
    const usRl = existLevelAt(geometry.existing, geometry.limits.usToeOffset)
    const dsRl = existLevelAt(geometry.existing, geometry.limits.dsToeOffset)
    return (usRl + dsRl) / 2
  }
  const baseWidth = (section: BundSection): number | null => {
    const geometry = bundLevelingGeometry(data, section)
    if (!geometry) return null
    return geometry.limits.dsToeOffset - geometry.limits.usToeOffset
  }

  const totalRun = Math.max(0, (sections.at(-1)?.chainage ?? 0) - sections[0].chainage)
  const chuteExcavationPerM =
    data.chuteDrainExcavationMaterial && totalRun > 0
      ? chuteDrainExcavationQuantity(data) / totalRun
      : null
  const chuteLiningPerM =
    data.chuteDrainLiningMaterial && totalRun > 0
      ? chuteDrainProtectionMeasurement(data).quantity / totalRun
      : null

  const sectionRows = sections.map((section, index) => {
    const toeRl = averageToeRl(section)
    return {
      chainage: section.chainage,
      lengthM: index === 0 ? null : section.chainage - sections[index - 1].chainage,
      toeRl,
      height:
        toeRl == null
          ? null
          : Math.max(0, data.design.topLevel - (toeRl - data.design.stripDepth)),
      width: baseWidth(section),
      clearance: sectionValue(clearance, index),
      foundation: sectionValue(foundation, index),
      usToe: sectionValue(usToe, index),
      dsToe: sectionValue(dsToe, index),
      homogeneous: sectionValue(homogeneous, index),
      cutoffTrench: sectionValue(cutoffTrench, index),
      hearting: sectionValue(hearting, index),
      casing: sectionValue(casing, index),
      revetment: sectionValue(revetment, index, revetmentFactor),
      turf: sectionValue(turf, index),
      rockToe: sectionValue(rockToe, index),
      rockToeTrench: sectionValue(rockToeTrench, index),
      rockFilter: sectionValue(rockFilter, index),
      horizontal: sectionValue(horizontal, index),
      vertical: sectionValue(vertical, index),
      chuteExcavation: chuteExcavationPerM,
      chuteLining: chuteLiningPerM
    }
  })

  type StatementRow = (typeof sectionRows)[number]
  interface Column {
    key: keyof StatementRow
    label: string
    sectionUnit: string
    totalUnit: string
  }
  const orderedWorkKeys: (keyof StatementRow)[] = zoned
    ? [
        'clearance',
        'foundation',
        'cutoffTrench',
        'casing',
        'hearting',
        'usToe',
        'dsToe',
        'revetment',
        'turf',
        'rockToe',
        ...(data.mode !== 'new' ? (['rockToeTrench'] as const) : []),
        'rockFilter',
        'horizontal',
        'vertical',
        'chuteExcavation',
        'chuteLining'
      ]
    : [
        'clearance',
        'foundation',
        'homogeneous',
        'usToe',
        'dsToe',
        'revetment',
        'turf',
        'rockToe',
        ...(data.mode !== 'new' ? (['rockToeTrench'] as const) : []),
        'rockFilter',
        'horizontal',
        'vertical',
        'chuteExcavation',
        'chuteLining'
      ]
  const fixedColumnCount = data.mode === 'new' ? 5 : 2
  const workColumnStart = new Map<keyof StatementRow, number>(
    orderedWorkKeys.map((key, index) => [key, fixedColumnCount + 1 + index * 3] as const)
  )
  const fmt = (value: unknown): string =>
    typeof value === 'number' && Number.isFinite(value) ? f2(value) : '—'
  const fmtCalculated = (value: unknown): string =>
    typeof value === 'number' && Number.isFinite(value) ? f2(value) : ''
  const rowAverage = (key: keyof StatementRow, index: number): number | null => {
    if (index === 0) return null
    const previous = sectionRows[index - 1][key]
    const current = sectionRows[index][key]
    return typeof previous === 'number' && typeof current === 'number'
      ? (previous + current) / 2
      : null
  }
  const rowTotal = (key: keyof StatementRow, index: number): number | null => {
    const average = rowAverage(key, index)
    const length = sectionRows[index].lengthM
    return average == null || length == null ? null : average * length
  }
  const quantityTotal = (key: keyof StatementRow): number => {
    return sectionRows.reduce((sum, _row, index) => sum + (rowTotal(key, index) ?? 0), 0)
  }
  const renderPanel = (
    title: string,
    columns: Column[],
    includeGeometry: boolean,
    first: boolean
  ): string => {
    const includeIdentifiers = first
    const fixedHeaders = includeIdentifiers
      ? includeGeometry
        ? `<th rowspan="3" class="bp-vhead"><span>Chainage</span></th>` +
          `<th rowspan="3" class="bp-vhead"><span>Length (m)</span></th>` +
          `<th rowspan="3" class="bp-vhead"><span>Average toe RL (m)</span></th>` +
          `<th rowspan="3" class="bp-vhead"><span>Bund height (m)</span></th>` +
          `<th rowspan="3" class="bp-vhead"><span>Width at stripped level (m)</span></th>`
        : `<th rowspan="3" class="bp-vhead"><span>Chainage</span></th>` +
          `<th rowspan="3" class="bp-vhead"><span>Length (m)</span></th>`
      : ''
    const headers = columns
      .map(
        (column) =>
          `<th colspan="3">${escapeHtml(column.label)}</th>`
      )
      .join('')
    const subHeaders = columns.map(() => `<th>Qty</th><th>Avg</th><th>Total</th>`).join('')
    const unitHeaders = columns
      .map(
        (column) =>
          `<th>(${escapeHtml(column.sectionUnit)})</th>` +
          `<th>(${escapeHtml(column.sectionUnit)})</th>` +
          `<th>(${escapeHtml(column.totalUnit)})</th>`
      )
      .join('')
    const fixedColumnNumbers = includeIdentifiers
      ? includeGeometry
        ? `<th>(1)</th><th>(2)</th><th>(3)</th><th>(4)</th><th>(5)</th>`
        : `<th>(1)</th><th>(2)</th>`
      : ''
    const workColumnNumbers = columns
      .map((column) => {
        const start = workColumnStart.get(column.key)
        return start == null
          ? `<th></th><th></th><th></th>`
          : `<th>(${start})</th><th>(${start + 1})</th><th>(${start + 2})</th>`
      })
      .join('')
    const body = sectionRows
      .map((row, index) => {
        const fixed = includeIdentifiers
          ? `<td class="l">${escapeHtml(formatChainage(row.chainage, data.chainageUnit))}</td>` +
            `<td class="n">${fmtCalculated(row.lengthM)}</td>` +
            (includeGeometry
              ? `<td class="n">${fmt(row.toeRl)}</td><td class="n">${fmt(row.height)}</td>` +
                `<td class="n">${fmt(row.width)}</td>`
              : '')
          : ''
        return `<tr>${fixed}${columns
          .map(
            (column) =>
              `<td class="n">${fmt(row[column.key])}</td>` +
              `<td class="n">${fmtCalculated(rowAverage(column.key, index))}</td>` +
              `<td class="n q">${fmtCalculated(rowTotal(column.key, index))}</td>`
          )
          .join('')}</tr>`
      })
      .join('')
    const totalLength = sectionRows.reduce((sum, row) => sum + (row.lengthM ?? 0), 0)
    const fixedTotal = includeIdentifiers
      ? includeGeometry
        ? `<td class="l">Total</td><td class="n">${f2(totalLength)}</td>` +
          `<td></td><td></td><td></td>`
        : `<td class="l">Total</td><td class="n">${f2(totalLength)}</td>`
      : ''
    const totals = columns
      .map(
        (column, index) =>
          (!includeIdentifiers && index === 0
            ? `<td colspan="2" class="l">Total</td>`
            : `<td></td><td></td>`) +
          `<td class="n q">${fmt(quantityTotal(column.key))}</td>`
      )
      .join('')
    return (
      `<section class="bp-stmt-panel${first ? '' : ' bp-stmt-new-sheet'}">` +
      `<h3>${escapeHtml(title)}</h3>` +
      (first
        ? `<p class="bp-note">Average section value = (A1 + A2) / 2. ` +
          `Interval quantity = average section value × length.</p>`
        : '') +
      `<table class="bp-t bp-stmt bp-stmt-hnew"><thead><tr>${fixedHeaders}${headers}</tr>` +
      `<tr class="bp-label-row">${subHeaders}</tr>` +
      `<tr class="bp-unit-row">${unitHeaders}</tr>` +
      `<tr class="bp-column-number-row">${fixedColumnNumbers}${workColumnNumbers}</tr></thead>` +
      `<tbody>${body}<tr class="tot">${fixedTotal}${totals}</tr>` +
      `</tbody></table></section>`
    )
  }

  if (zoned) {
    return [
      renderPanel(
        'Statement of quantities — zoned bund earthwork',
        [
          {
            key: 'clearance',
            label: 'Jungle Clearance',
            sectionUnit: 'm',
            totalUnit: 'sq.m'
          },
          {
            key: 'foundation',
            label: `${data.mode === 'new' ? 'Bund Foundation Excavation' : 'Bund Stripping'} — depth ${f2(data.design.stripDepth)} m`,
            sectionUnit: 'sq.m',
            totalUnit: 'cu.m'
          },
          {
            key: 'cutoffTrench',
            label: 'Hearting cut-off trench',
            sectionUnit: 'sq.m',
            totalUnit: 'cu.m'
          },
          {
            key: 'casing',
            label: 'Casing soil',
            sectionUnit: 'sq.m',
            totalUnit: 'cu.m'
          },
          {
            key: 'hearting',
            label: 'Hearting soil',
            sectionUnit: 'sq.m',
            totalUnit: 'cu.m'
          }
        ],
        data.mode === 'new',
        true
      ),
      renderPanel(
        'Statement of quantities — toe and slope protection',
        [
          {
            key: 'usToe',
            label: 'U/S toe-wall excavation',
            sectionUnit: 'sq.m',
            totalUnit: 'cu.m'
          },
          {
            key: 'dsToe',
            label: 'D/S toe-drain excavation',
            sectionUnit: 'sq.m',
            totalUnit: 'cu.m'
          },
          {
            key: 'revetment',
            label: 'U/S revetment',
            sectionUnit: revetmentMeasure === 'volume' ? 'sq.m' : 'm',
            totalUnit: revetmentMeasure === 'volume' ? 'cu.m' : 'sq.m'
          },
          { key: 'turf', label: 'D/S turfing', sectionUnit: 'm', totalUnit: 'sq.m' },
          {
            key: 'rockToe',
            label: 'Rock toe',
            sectionUnit: 'sq.m',
            totalUnit: 'cu.m'
          },
          ...(data.mode !== 'new'
            ? [
                {
                  key: 'rockToeTrench' as const,
                  label: 'Rock-toe trench',
                  sectionUnit: 'sq.m',
                  totalUnit: 'cu.m'
                }
              ]
            : [])
        ],
        false,
        false
      ),
      renderPanel(
        'Statement of quantities — filters and chute drains',
        [
          {
            key: 'rockFilter',
            label: 'Rock-toe graded filter',
            sectionUnit: 'sq.m',
            totalUnit: 'cu.m'
          },
          {
            key: 'horizontal',
            label: 'Horizontal filter',
            sectionUnit: horizontalMeasure === 'volume' ? 'sq.m' : 'm',
            totalUnit: horizontalMeasure === 'volume' ? 'cu.m' : 'sq.m'
          },
          {
            key: 'vertical',
            label: 'Vertical filter',
            sectionUnit: verticalMeasure === 'volume' ? 'sq.m' : 'm',
            totalUnit: verticalMeasure === 'volume' ? 'cu.m' : 'sq.m'
          },
          {
            key: 'chuteExcavation',
            label: 'Chute-drain excavation',
            sectionUnit: 'sq.m',
            totalUnit: 'cu.m'
          },
          {
            key: 'chuteLining',
            label: 'Chute-drain lining',
            sectionUnit: chuteMeasure === 'volume' ? 'sq.m' : 'm',
            totalUnit: chuteMeasure === 'volume' ? 'cu.m' : 'sq.m'
          }
        ],
        false,
        false
      )
    ]
  }

  return [
    renderPanel(
      'Statement of quantities — bund earthwork',
      [
        {
          key: 'clearance',
          label: 'Jungle Clearance',
          sectionUnit: 'm',
          totalUnit: 'sq.m'
        },
        {
          key: 'foundation',
          label: `${data.mode === 'new' ? 'Bund Foundation Excavation' : 'Bund Stripping'} — depth ${f2(data.design.stripDepth)} m`,
          sectionUnit: 'sq.m',
          totalUnit: 'cu.m'
        },
        {
          key: 'homogeneous',
          label: 'Homogeneous soil fill',
          sectionUnit: 'sq.m',
          totalUnit: 'cu.m'
        },
        {
          key: 'usToe',
          label: 'U/S toe-wall excavation',
          sectionUnit: 'sq.m',
          totalUnit: 'cu.m'
        },
        {
          key: 'dsToe',
          label: 'D/S toe-drain excavation',
          sectionUnit: 'sq.m',
          totalUnit: 'cu.m'
        }
      ],
      data.mode === 'new',
      true
    ),
    renderPanel(
      'Statement of quantities — slope and toe protection',
      [
        {
          key: 'revetment',
          label: 'U/S revetment',
          sectionUnit: revetmentMeasure === 'volume' ? 'sq.m' : 'm',
          totalUnit: revetmentMeasure === 'volume' ? 'cu.m' : 'sq.m'
        },
        { key: 'turf', label: 'D/S turfing', sectionUnit: 'm', totalUnit: 'sq.m' },
        {
          key: 'rockToe',
          label: 'Rock toe',
          sectionUnit: 'sq.m',
          totalUnit: 'cu.m'
        },
        ...(data.mode !== 'new'
          ? [
              {
                key: 'rockToeTrench' as const,
                label: 'Rock-toe trench',
                sectionUnit: 'sq.m',
                totalUnit: 'cu.m'
              }
            ]
          : []),
        {
          key: 'rockFilter',
          label: 'Rock-toe graded filter',
          sectionUnit: 'sq.m',
          totalUnit: 'cu.m'
        }
      ],
      false,
      false
    ),
    renderPanel(
      'Statement of quantities — filters and chute drains',
      [
        {
          key: 'horizontal',
          label: 'Horizontal filter',
          sectionUnit: horizontalMeasure === 'volume' ? 'sq.m' : 'm',
          totalUnit: horizontalMeasure === 'volume' ? 'cu.m' : 'sq.m'
        },
        {
          key: 'vertical',
          label: 'Vertical filter',
          sectionUnit: verticalMeasure === 'volume' ? 'sq.m' : 'm',
          totalUnit: verticalMeasure === 'volume' ? 'cu.m' : 'sq.m'
        },
        {
          key: 'chuteExcavation',
          label: 'Chute-drain excavation',
          sectionUnit: 'sq.m',
          totalUnit: 'cu.m'
        },
        {
          key: 'chuteLining',
          label: 'Chute-drain lining',
          sectionUnit: chuteMeasure === 'volume' ? 'sq.m' : 'm',
          totalUnit: chuteMeasure === 'volume' ? 'cu.m' : 'sq.m'
        }
      ],
      false,
      false
    )
  ]
}

function statementBlocks(data: BundData): string[] {
  return bundStatementBlocks(data)
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Page assembly
//
// Content flows and the print engine paginates it. An earlier version packed
// blocks into fixed-height A4 boxes; that was the wrong model here — a box
// exactly as tall as the sheet spills a fraction and emits a blank page after
// every one, and any box the content does not fill wastes the remainder. What
// the engine needs is not page boxes but break *hints*: keep a figure whole,
// keep a heading with what follows, repeat a long table's header. Given those
// it fills each sheet properly and starts a new one only when it must.
// ---------------------------------------------------------------------------

export type BundPageOrientation = 'portrait' | 'landscape'

export interface BundPrintPage {
  html: string
  orientation: BundPageOrientation
}

/** Narrow margins: these sheets are wide and margin-hungry. */
export const BUND_PRINT_MARGINS = { top: 10, bottom: 10, left: 10, right: 2 }

function styles(fontScale: number, orientation: BundPageOrientation): string {
  const base = 13 * fontScale
  return `
    *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    html,body{margin:0;padding:0;color:#111;background:#fff;font-family:"Times New Roman",serif}
    body{font-size:${base}px;line-height:1.4}

    /* Break hints. Everything below exists so the engine can fill a sheet
       without splitting something that has to stay whole. */
    h3,h4{break-after:avoid;page-break-after:avoid}
    .bp-fig,.bp-ssr,.bp-sec,.bp-xcode,.bp-fam,.bp-keep{break-inside:avoid;page-break-inside:avoid}
    table{break-inside:auto}
    .bp-keep table{break-inside:avoid;page-break-inside:avoid}
    thead{display:table-header-group}
    tr{break-inside:avoid;page-break-inside:avoid}

    .section-banner{margin:0 0 4mm;padding:5px 8px;border-left:4px solid #447a9c;background:#edf5fa;font-family:Arial;break-after:avoid;page-break-after:avoid}
    .section-banner small{display:block;color:#4e6675;font-size:${base * 0.78}px;text-transform:uppercase;letter-spacing:.6px}
    .section-banner strong{display:block;margin-top:2px;color:#163f57;font-size:${base * 1.3}px}
    .section-banner .m{display:block;margin-top:2px;color:#4e6675;font-size:${base * 0.85}px;font-family:"Times New Roman",serif}
    h3{font-size:${base * 1.16}px;font-weight:700;border-bottom:1px solid #bbb;padding-bottom:3px;margin:9px 0 6px;font-family:Arial}
    h3:first-of-type{margin-top:0}
    h4{font-size:${base * 1.05}px;margin:9px 0 4px;font-family:Arial}
    .bp-lead{margin:0 0 5px}
    .bp-note{margin:0 0 5px;color:#4e6675;font-style:italic}
    .bp-ssr{margin:6px 0 3px}
    .bp-ssr-h{font-family:Arial;display:flex;align-items:baseline;gap:10px}
    .bp-ssr-h b{color:#14364b}
    .bp-code{color:#2b6fa8;font-weight:600}
    .bp-unit{margin-left:auto;color:#8a9aa5;font-size:${base * 0.85}px}
    .bp-desc{margin:2px 0 3px;text-align:justify}
    .bp-t{width:auto;border-collapse:collapse;font-size:${base * 0.92}px;margin-bottom:6px;font-variant-numeric:tabular-nums}
    .bp-t.wide{width:100%}
    .bp-t th,.bp-t td{border:1px solid #999;padding:2.5px 6px;text-align:right}
    .bp-t th{background:#eee;font-weight:600}
    .bp-t th.grp{text-align:center;background:#e5edf3;color:#14364b}
    .bp-t th.grp .add{display:block;font-weight:400;font-style:italic;color:#5c788a}
    .bp-t .l{text-align:left}
    .bp-t .n{text-align:right}
    .bp-t .u{color:#777;text-align:left}
    .bp-t .q{background:#f7fafc;font-weight:700}
    .bp-t .tot td{font-weight:700;background:#f6f6f0}
    .bp-t .bp-warn td{background:#fdeceb;color:#902b22}
    .bp-fig{width:100%;max-width:${orientation === 'landscape' ? 'none' : '176mm'};display:block;border:1px solid #ccc;background:#fbfbfa;margin-bottom:5px}
    .bp-fam-cols{display:flex;gap:7mm;margin-top:4px}
    .bp-fam{flex:1;min-width:0;border:1px solid #b9c4cc;padding:5px 7px}
    .bp-fam-h{font-family:Arial;border-bottom:1px solid #b9c4cc;padding-bottom:3px;margin-bottom:4px}
    .bp-fam-h b{color:#14364b}
    .bp-fam-h span{display:block;color:#8a9aa5;font-size:${base * 0.85}px}
    .bp-fam-list{margin:0 0 5px;padding-left:14px}
    .bp-fam-list li span{float:right;font-weight:600}
    .bp-xcode{margin:0 0 5px}
    .bp-xcode-h{font-family:Arial;display:flex;align-items:baseline;gap:8px}
    .bp-xcode-h b{color:#14364b}
    .bp-xcode-q{margin-left:auto;font-weight:700;color:#10303f}
    .bp-xcode .bp-desc{margin:2px 0 0;font-size:${base * 0.88}px}

    /* Each section is one full-width exhibit; its body is split into the
       chart on the left and the calculation table on the right. */
    .bp-secs{display:flex;flex-wrap:wrap;gap:4mm}
    .bp-sec{flex:1 1 100%;min-width:0;border-top:1px solid #ccd;padding-top:3px}
    .bp-sec-h{font-family:Arial;font-weight:700;color:#14364b;margin:0 0 2px}
    .bp-sec-body{display:grid;grid-template-columns:minmax(0,50%) minmax(0,50%);gap:0;align-items:start}
    .bp-sec-left{min-width:0}
    .bp-sec-right{min-width:0}
    .bp-sec-fig{min-width:0;padding-right:2mm}
    /* Without min-width:0 the SVG's intrinsic width becomes the section's
       min-content width, and a section can no longer share a row. */
    .bp-sec-fig .bp-fig{max-width:none;min-width:0;width:100%}
    .bp-levels{min-width:0;width:100%;margin:0;padding-left:2mm}
    .bp-table-title{caption-side:top;text-align:left;font-family:Arial,sans-serif;font-size:${base * 0.78}px;font-weight:700;color:#14364b;padding:0 0 2px}
    .bp-calc-levels{table-layout:fixed}
    .bp-calc-levels th,.bp-calc-levels td{padding:2px 3px;vertical-align:top;overflow-wrap:anywhere}
    .bp-calc-levels th{white-space:nowrap}
    .bp-calc-levels .n{white-space:nowrap}
    .bp-calc-levels .bp-col-ch{width:12%}
    .bp-calc-levels .bp-col-level,.bp-hearting-levels .bp-col-heart-level{width:15%}
    .bp-calc-levels .bp-col-calc{width:38%}
    .bp-calc-levels .bp-col-qty{width:20%}
    .bp-calc-levels .bp-qty-head{font-size:.9em;padding-left:1px;padding-right:1px;overflow-wrap:normal}
    .bp-calc-levels .bp-num-tight{font-size:.88em;letter-spacing:-.01em}
    .bp-calc{font-family:Arial,sans-serif;font-size:${base * 0.68}px;line-height:1.15;text-align:left!important;white-space:normal;overflow-wrap:anywhere;color:#354b59}
    .bp-levels-cols{display:flex;gap:2mm;align-items:flex-start}
    .bp-sec-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:2mm;margin-top:2mm;border-top:1px solid #ccd;padding-top:2mm}
    .bp-sec-summary-in-column{padding-right:2mm}
    .bp-sec-summary>div{display:flex;justify-content:space-between;gap:2mm;padding:2px 5px;background:#f4f7f9;border:1px solid #d2d9de}
    .bp-sec-summary span{font-family:Arial,sans-serif;color:#496170;font-size:${base * 0.78}px}
    .bp-sec-summary b{font-variant-numeric:tabular-nums;color:#14364b;white-space:nowrap}
    .bp-sec-zone-table{margin:2mm 0 0;width:auto;font-size:${base * 0.82}px}
    .bp-stmt{width:100%;font-size:${base * 0.85}px}
    .bp-page-title{margin:0 0 3mm;text-align:center;font:700 ${base * 1.35}px Arial,sans-serif;color:#14364b}
    body.bp-diagram-document{height:var(--bp-diagram-page-height,186mm);max-height:var(--bp-diagram-page-height,186mm);overflow:hidden;box-sizing:border-box;display:flex;flex-direction:column;page-break-inside:avoid;break-inside:avoid}
    body.bp-diagram-document>.section-banner{margin:0 0 2mm;padding:3px 8px;flex-shrink:0}
    .bp-bund-diagram-page{width:100%;flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden;page-break-inside:avoid;break-inside:avoid}
    .bp-diagram-summary{display:flex;justify-content:center;flex-wrap:wrap;gap:1.5mm 6mm;margin:0 0 2mm;padding:2px 4mm;border:1px solid #b9c4cc;background:#f7fafc;font-family:Arial,sans-serif;font-size:${base * 0.85}px;font-variant-numeric:tabular-nums;flex-shrink:0}
    .bp-diagram-summary span{white-space:nowrap}.bp-diagram-summary b{color:#14364b}
    .bp-bund-diagram{width:100%;flex:1;min-height:0;display:flex;align-items:center;justify-content:center;overflow:hidden;margin:0;padding:0;page-break-inside:avoid;break-inside:avoid}
    .bp-bund-diagram .bp-fig{display:block;width:auto;max-width:100%;height:auto;max-height:calc(var(--bp-diagram-page-height,186mm) - 34mm);margin:0 auto;border:1px solid #ccc;background:#fbfbfa;page-break-inside:avoid;break-inside:avoid}
    .bp-statement-page-title{margin:0 0 5mm;padding-bottom:2mm;border-bottom:1.5px solid #14364b;text-align:center;font:700 ${base * 1.45}px Arial,sans-serif;color:#14364b}
    .bp-stmt-panel{margin:0 0 5mm;break-inside:auto;page-break-inside:auto}
    .bp-stmt-panel.bp-stmt-new-sheet{break-before:page;page-break-before:always}
    .bp-stmt-panel h3{margin-top:0}
    .bp-stmt-hnew{width:100%;max-width:100%;table-layout:auto;font-size:14pt!important}
    .bp-stmt-hnew th,.bp-stmt-hnew td{min-width:0;padding:2px 3px;white-space:normal;overflow-wrap:anywhere;word-break:normal;vertical-align:middle}
    .bp-stmt-hnew tbody td{white-space:nowrap;overflow-wrap:normal;word-break:normal}
    .bp-stmt-hnew thead .bp-label-row th{border-bottom-color:transparent;padding-bottom:0}
    .bp-stmt-hnew thead .bp-unit-row th{border-top-color:transparent;padding-top:0;white-space:nowrap}
    .bp-stmt-hnew thead .bp-column-number-row th{padding:1px 3px;white-space:nowrap;font-weight:400;background:#f7f7f7}
    .bp-stmt-hnew .bp-vhead{width:9mm;min-width:9mm;height:48mm;padding:2mm 1mm;text-align:center;vertical-align:middle;overflow:visible}
    .bp-stmt-hnew .bp-vhead span{display:inline-block;writing-mode:vertical-rl;transform:rotate(180deg);white-space:nowrap;line-height:1.05}
  `
}

function bannerHtml(section: ProjectNode, data: BundData, subtitle: string): string {
  const sections = orderedSections(data)
  const zoned = isZonedBund(data)
  const meta = [
    `${zoned ? 'Impervious zone' : 'Homogeneous'} · ${data.mode === 'new' ? 'new bund' : 'repair of existing bund'}`,
    `${sections.length} surveyed section${sections.length === 1 ? '' : 's'}`,
    `crest ${f2(data.design.topWidth)} m`,
    `U/S ${f2(data.design.usSlope)}:1 · D/S ${f2(data.design.dsSlope)}:1`,
    // A free-board design earns its TBL from MWL; showing the derivation says
    // where the crest came from without a second line.
    usesFreeBoardDesign(data) && data.design.freeBoard != null && data.design.mwl != null
      ? `TBL ${f2(data.design.topLevel)} = MWL ${f2(data.design.mwl)} + free board ${f2(
          data.design.freeBoard
        )}`
      : `TBL ${f2(data.design.topLevel)}`
  ].join(' · ')
  return (
    `<div class="section-banner"><small>${escapeHtml(subtitle)}</small>` +
    `<strong>${escapeHtml(section.name)}</strong>` +
    `<span class="m">${escapeHtml(meta)}</span></div>`
  )
}

function document(
  fontScale: number,
  orientation: BundPageOrientation,
  banner: string,
  body: string,
  bodyClass = '',
  diagramPageHeightMm?: number
): string {
  const bodyStyle =
    bodyClass === 'bp-diagram-document' && diagramPageHeightMm != null
      ? ` style="--bp-diagram-page-height:${Math.max(20, diagramPageHeightMm - 4)}mm"`
      : ''
  return (
    `<!doctype html><html><head><meta charset="utf-8">` +
    `<style>${styles(fontScale, orientation)}</style></head>` +
    `<body${bodyClass ? ` class="${bodyClass}"` : ''}${bodyStyle}>${banner}${body}</body></html>`
  )
}

/**
 * The bund's detailed estimate, one document per orientation.
 *
 * A print request carries a single page size, so landscape schedules are
 * separate documents from the portrait narrative; within each, content simply
 * flows. The excavation sheet only takes its own landscape document when every
 * soil class is billed — four Percentage/Qty column pairs need the width.
 * Otherwise it prints portrait, leading the component details.
 */
export function bundDetailPages(
  project: EestimateProject,
  section: ProjectNode,
  data: BundData,
  fontScale: number,
  _recipes: Record<string, RateAnalysisRecipe>,
  landscapePrintableHeightMm = 190
): BundPrintPage[] {
  const pages: BundPrintPage[] = []

  const add = (
    orientation: BundPageOrientation,
    subtitle: string,
    fragments: string[]
  ): void => {
    const body = fragments.filter(Boolean).join('')
    if (!body) return
    pages.push({
      orientation,
      html: document(
        fontScale,
        orientation,
        bannerHtml(section, data, subtitle),
        body,
        subtitle === 'Bund Diagram' ? 'bp-diagram-document' : '',
        landscapePrintableHeightMm
      )
    })
  }

  const excavation = excavationBlocks(project.root, data)
  const bundDiagram = bundDiagramBlocks(data)
  const statement = statementBlocks(data)
  const componentDetails = [
    ...phreaticBlocks(data),
    ...componentDetailsBlocks(project.root, data)
  ]
  // Every bund starts its detailed estimate with one large landscape drawing,
  // immediately after the component abstract.
  if (bundDiagram.length) {
    add('landscape', 'Bund Diagram', bundDiagram)
  }
  add('landscape', 'Statement of Quantities', [
    `<h2 class="bp-statement-page-title">Statement of Quantities</h2>`,
    ...statement
  ])
  if (excavationNeedsLandscape(data)) {
    add('landscape', 'Earth Work Excavation', excavation)
    add('portrait', 'Component Details', componentDetails)
  } else {
    add('portrait', 'Earth Work Excavation & Component Details', [
      ...excavation,
      ...componentDetails
    ])
  }
  add('portrait', 'Cross-sections', sectionsBlocks(data, fontScale))

  return pages
}
