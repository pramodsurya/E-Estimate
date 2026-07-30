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
  chuteDrainExcavationQuantity,
  chuteDrainProtectionMeasurement,
  clearancePerimeterRows,
  clearanceTotal,
  steepestSection,
  formatChainage,
  formationRows,
  horizontalFilterRows,
  internalFiltersAvailable,
  verticalFilterRows,
  orderedSections,
  phreaticGeometry,
  pitchingMeasuredQuantity,
  projectedProfile,
  quantityRows,
  rockToeExcavationRows,
  rockToeFilterRows,
  rockToeRows,
  rowsTotal,
  sectionAreas,
  strippingRows,
  zonedRepairAreas,
  toeDrainDepthAt,
  toeExcavationRows,
  turfingRows,
  usesFreeBoardDesign,
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
    { label: 'Stripping', quantity: rowsTotal(strippingRows(data)), role: 'stripping' }
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
  if (data.rockToeExcavationMaterial) {
    sources.push({
      label: 'Rock toe trench',
      quantity: rowsTotal(rockToeExcavationRows(data)),
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

function excavationBlocks(root: ProjectNode, data: BundData): string[] {
  const sources = excavationSources(data)
  if (!sources.length) return []

  const classTotals = [0, 0, 0, 0]
  let grand = 0
  const body = sources
    .map((source) => {
      grand += source.quantity
      const cells = bandsFor(data, source.role)
        .map((band, index) => {
          const quantity = (source.quantity * band.pct) / 100
          classTotals[index] += quantity
          return `<td class="n">${band.pct ? `${band.pct}%` : '—'}</td><td class="n">${f2(quantity)}</td>`
        })
        .join('')
      return `<tr><td class="l">${escapeHtml(source.label)}</td><td class="n">${f2(source.quantity)}</td>${cells}</tr>`
    })
    .join('')

  const head =
    `<tr><th class="l">Excavated at</th><th>Qty</th>` +
    SOIL_ORDER.map((label) => `<th>Percentage</th><th>${escapeHtml(label)}</th>`).join('') +
    `</tr>`
  const totals =
    `<tr class="tot"><td class="l">Total</td><td class="n">${f2(grand)}</td>` +
    classTotals.map((quantity) => `<td></td><td class="n">${f2(quantity)}</td>`).join('') +
    `</tr>`

  // Which cuts bill on which code family. The dashboard decides: stripping can
  // sit on either basis, the rest follow what they are.
  const families: { title: string; subtitle: string; roles: ExcavationSource['role'][] }[] = [
    {
      title: 'Stripping / seating',
      subtitle: 'CAW excavation codes',
      roles: ['dstoe-exc', 'chute-exc', 'berm-drain-exc']
    },
    {
      title: 'Foundation excavation',
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
      const mine = sources.filter((source) => family.roles.includes(source.role))
      const list = mine.length
        ? `<ul class="bp-fam-list">${mine
            .map(
              (source) =>
                `<li>${escapeHtml(source.label)}<span>${f2(source.quantity)}</span></li>`
            )
            .join('')}</ul>`
        : `<p class="bp-fam-none">Nothing on this basis.</p>`

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

  // An impervious bund always opens with its general arrangement, whether it is
  // new work or a repair. Its seepage is held by the core rather than by a
  // Casagrande line through a homogeneous body, so the phreatic check does not
  // apply — and the one drawing that does apply, showing how the zones and
  // every enabled element sit together, is worth having on every estimate
  // rather than behind a switch.
  if (isZonedBund(data)) {
    const figure = assemblyFigure(data, section)
    if (!figure) return []
    return [
      `<h4>Bund arrangement</h4>`,
      `<p class="bp-lead">Diagrammatic section at the tallest chainage, Ch ` +
        `${escapeHtml(formatChainage(section.chainage, data.chainageUnit))}, showing every ` +
        `element that is switched on and where it sits. It is a sketch of the assembly — each ` +
        `element is dimensioned on its own detail in the pages that follow.</p>`,
      figure
    ]
  }

  if (!data.includePhreaticInPrint) return []
  const actual = phreaticGeometry(data, section)
  const reference = phreaticGeometry(baselinePhreaticData(data), section)
  if (!actual && !reference) return []
  const primary = actual ?? reference
  if (!primary) return []

  const design = data.design
  const proposed = projectedProfile(section, design)
  if (proposed.length < 2) return []

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
    ...lines.flatMap((g) => [g.usToeX, g.dsToeX, ...g.points.map((p) => p.offset)])
  ]
  const ys = [
    ...proposed.map((p) => p.rl),
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

  const sorted = proposed.slice().sort((a, b) => a.offset - b.offset)
  const crest = sorted.filter((p) => Math.abs(p.rl - design.topLevel) < 1e-6)
  const crestL = crest.length ? crest[0] : sorted[0]
  const crestR = crest.length ? crest[crest.length - 1] : sorted[sorted.length - 1]
  const usToe = sorted[0]
  const dsToe = sorted[sorted.length - 1]

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

  // --- the two phreatic lines ---------------------------------------------
  const path = (g: NonNullable<typeof actual>): string =>
    g.points
      .map((p, i) => `${i ? 'L' : 'M'} ${n1(X(p.offset))} ${n1(Y(p.rl))}`)
      .join(' ')

  const referenceLine = reference
    ? `<path d="${path(reference)}" fill="none" stroke="#b06a2c" stroke-width="1.7" stroke-dasharray="7 4"/>`
    : ''
  const actualLine = actual
    ? `<path d="${path(actual)}" fill="none" stroke="#c0392b" stroke-width="2.1"/>`
    : ''

  // --- dimensions ----------------------------------------------------------
  const DIM = '#1a4a7a'
  const hDim = (x1: number, x2: number, y: number, label: string): string =>
    `<line x1="${n1(x1)}" y1="${n1(y)}" x2="${n1(x2)}" y2="${n1(y)}" stroke="${DIM}" stroke-width="0.9" ` +
    `marker-start="url(#phArrow)" marker-end="url(#phArrow)"/>` +
    `<line x1="${n1(x1)}" y1="${n1(y - 5)}" x2="${n1(x1)}" y2="${n1(y + 5)}" stroke="${DIM}" stroke-width="0.7"/>` +
    `<line x1="${n1(x2)}" y1="${n1(y - 5)}" x2="${n1(x2)}" y2="${n1(y + 5)}" stroke="${DIM}" stroke-width="0.7"/>` +
    `<text x="${n1((x1 + x2) / 2)}" y="${n1(y - 5)}" text-anchor="middle" fill="${DIM}" font-size="11" font-family="Arial">${escapeHtml(label)}</text>`

  const vDim = (y1: number, y2: number, x: number, label: string): string =>
    `<line x1="${n1(x)}" y1="${n1(y1)}" x2="${n1(x)}" y2="${n1(y2)}" stroke="${DIM}" stroke-width="0.9" ` +
    `marker-start="url(#phArrow)" marker-end="url(#phArrow)"/>` +
    `<text x="${n1(x - 5)}" y="${n1((y1 + y2) / 2)}" text-anchor="middle" fill="${DIM}" font-size="11" ` +
    `font-family="Arial" transform="rotate(-90 ${n1(x - 5)} ${n1((y1 + y2) / 2)})">${escapeHtml(label)}</text>`

  const bundHeight = design.topLevel - primary.baseRl
  const crestWidth = crestR.offset - crestL.offset

  const dims =
    hDim(X(crestL.offset), X(crestR.offset), Y(design.topLevel) - 16, `${f2(crestWidth)} m`) +
    vDim(Y(design.topLevel), Y(primary.baseRl), X(minX) + 22, `H ${f2(bundHeight)} m`) +
    vDim(Y(waterRl), Y(primary.baseRl), X(minX) + 52, `h ${f2(primary.waterDepth)} m`) +
    hDim(X(primary.focusX), X(primary.focusX + primary.s), Y(primary.baseRl) + 30, `S ${f3(primary.s)} m`)

  // --- labels --------------------------------------------------------------
  const label = (x: number, y: number, text: string, anchor = 'middle', fill = '#33505f'): string =>
    `<text x="${n1(x)}" y="${n1(y)}" text-anchor="${anchor}" fill="${fill}" font-size="11.5" font-family="Arial">${escapeHtml(text)}</text>`

  const usMid = { x: (usToe.offset + crestL.offset) / 2, y: (usToe.rl + design.topLevel) / 2 }
  const dsMid = { x: (crestR.offset + dsToe.offset) / 2, y: (dsToe.rl + design.topLevel) / 2 }

  const labels =
    label(X(minX) + 4, Y(waterRl) - 6, `MWL ${f2(waterRl)}`, 'start', '#3d88ad') +
    label((X(crestL.offset) + X(crestR.offset)) / 2, Y(design.topLevel) - 26, `TBL ${f2(design.topLevel)}`) +
    label(X(usToe.offset) - 4, Y(usToe.rl) + 13, `U/S toe ${f2(usToe.rl)}`, 'end') +
    label(X(dsToe.offset) + 4, Y(dsToe.rl) + 13, `D/S toe ${f2(dsToe.rl)}`, 'start') +
    label(X(usMid.x) - 14, Y(usMid.y), `1:${f2(design.usSlope)}`, 'end', '#5a7a90') +
    label(X(dsMid.x) + 14, Y(dsMid.y), `1:${f2(design.dsSlope)}`, 'start', '#5a7a90') +
    label(X(primary.entryX), Y(waterRl) - 16, 'B', 'middle', '#c0392b') +
    label(X(primary.focusX), Y(primary.baseRl) + 15, 'F', 'middle', '#c0392b') +
    `<circle cx="${n1(X(primary.focusX))}" cy="${n1(Y(primary.baseRl))}" r="2.8" fill="#c0392b"/>` +
    `<circle cx="${n1(X(primary.entryX))}" cy="${n1(Y(waterRl))}" r="2.8" fill="#c0392b"/>` +
    label(X(minX) + 4, Y(primary.baseRl) + 13, `Datum RL ${f2(primary.baseRl)}`, 'start', '#8a7a5c')

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
    `<line x1="${padL + 268}" y1="${legendY}" x2="${padL + 294}" y2="${legendY}" stroke="#c0392b" stroke-width="2.1"/>` +
    label(
      padL + 300,
      legendY + 4,
      options.length ? `Actual — with ${options.join(' + ')}` : 'Actual — no drainage selected',
      'start',
      '#902b22'
    )

  const defs =
    `<defs><marker id="phArrow" markerUnits="userSpaceOnUse" markerWidth="9" markerHeight="8" refX="8" refY="3" orient="auto-start-reverse">` +
    `<path d="M0,0 L8,3 L0,6 Z" fill="${DIM}"/></marker></defs>`

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
    
    `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" class="bp-fig">` +
    defs +
    water +
    body +
    datum +
    referenceLine +
    actualLine +
    dims +
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
          `${f2(data.heartingTrench.depth)} m below the formation base, sides ` +
          `1:${f2(data.heartingTrench.usSlope)} u/s and 1:${f2(data.heartingTrench.dsSlope)} d/s ` +
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
    parts.push(ssrHead(root, data, data.pitchingMaterial, 'Stone pitching / revetment'))
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
    parts.push(usToeFigure(data))
    parts.push(
      `<table class="bp-t"><tbody>` +
        `<tr><td class="l">Top width</td><td class="n">${f2(toe.topWidth)}</td><td class="u">m</td></tr>` +
        `<tr><td class="l">Bottom width</td><td class="n">${f2(toe.bottomWidth)}</td><td class="u">m</td></tr>` +
        `<tr><td class="l">Depth</td><td class="n">${f2(toe.depth)}</td><td class="u">m</td></tr>` +
        `</tbody></table>`
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
    const drainDepths = orderedSections(data).map((sec) => toeDrainDepthAt(sec, data))
    parts.push(dsDrainFigure(data, drainDepths.length ? Math.max(...drainDepths) : 0))
    parts.push(
      `<table class="bp-t"><tbody>` +
        (toe.invertLevel != null
          ? `<tr><td class="l">Invert RL</td><td class="n">${f3(toe.invertLevel)}</td><td class="u"></td></tr>` +
            `<tr><td class="l">Base width at invert</td><td class="n">${f2(toe.bottomWidth)}</td><td class="u">m</td></tr>` +
            `<tr><td class="l">Left side slope</td><td class="n">1:${f2(toe.leftSlope)}</td><td class="u"></td></tr>` +
            `<tr><td class="l">Right side slope</td><td class="n">1:${f2(toe.rightSlope)}</td><td class="u"></td></tr>`
          : `<tr><td class="l">Top width</td><td class="n">${f2(toe.topWidth)}</td><td class="u">m</td></tr>` +
            `<tr><td class="l">Bottom width</td><td class="n">${f2(toe.bottomWidth)}</td><td class="u">m</td></tr>` +
            `<tr><td class="l">Depth</td><td class="n">${f2(toe.depth)}</td><td class="u">m</td></tr>`) +
        `</tbody></table>`
    )
    parts.push(totalLine('Excavation quantity', rowsTotal(toeExcavationRows(data, toe)), 'cum'))
    if (toe.buildMaterial) {
      parts.push(ssrHead(root, data, toe.buildMaterial, 'Bed and side protection'))
    }
  }

  // Rock toe, with its filter and trench shown only when selected.
  if (data.rockToeMaterial) {
    parts.push(`<h4>Rock toe</h4>`)
    parts.push(rockToeFigure(data))
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
    if (data.rockToeExcavationMaterial) {
      parts.push(
        `<p class="bp-note">The trench under the rock toe is the payable <b>union</b> of the general ` +
          `leveling cut and the foundation cut — existing ground down to whichever floor is lower, ` +
          `never the sum of the two. The shared cut is deducted from stripping so it is not paid twice.</p>`
      )
      parts.push(
        totalLine('Trench of rock toe', rowsTotal(rockToeExcavationRows(data)), 'cum')
      )
    }
  }

  // Internal drainage filters — new fill only, so a repair never reaches here.
  if (internalFiltersAvailable(data) && data.horizontalFilterMaterial) {
    const filterSection = steepestSection(data) ?? orderedSections(data)[0] ?? null
    parts.push(`<h4>Internal drainage filters</h4>`)
    parts.push(
      `<p class="bp-lead">Sand blanket laid on the prepared base and running in from the ` +
        `downstream toe, with the chimney standing on its inner end where one is used. Together ` +
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
    parts.push(bermFigure(data, berm))
    parts.push(bermDesignTable(berm))
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

  // Horizontal extent always governs on a bund, so the vertical is exaggerated
  // to a bounded factor rather than left to letterbox the drawing.
  const xScale = (width - padL - padR) / (maxX - minX)
  const availH = height - padT - padB
  const trueSpan = dataMaxRl - dataMinRl
  const span = Math.min(trueSpan * 1.15, availH / Math.min(xScale * 2.5, availH / trueSpan))
  const minRl = dataMinRl - (span - trueSpan) / 2
  const maxRl = minRl + span
  const yScale = availH / span
  const X = (x: number): number => padL + (x - minX) * xScale
  const Y = (rl: number): number => padT + (maxRl - rl) * yScale

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
    niceTicks(minRl, maxRl, 4)
      .map(
        (rl) =>
          `<line x1="${padL}" y1="${Y(rl).toFixed(1)}" x2="${(width - padR).toFixed(1)}" y2="${Y(rl).toFixed(1)}" stroke="#e0e5ea" stroke-width="0.6"/>` +
          `<text x="${padL - 4}" y="${(Y(rl) + 3).toFixed(1)}" text-anchor="end" fill="#8a9aa5" font-size="8" font-family="Arial">${rl.toFixed(1)}</text>`
      )
      .join('') +
    niceTicks(minX, maxX, 5)
      .map(
        (x) =>
          `<line x1="${X(x).toFixed(1)}" y1="${padT}" x2="${X(x).toFixed(1)}" y2="${(height - padB).toFixed(1)}" stroke="#e0e5ea" stroke-width="0.6"/>` +
          `<text x="${X(x).toFixed(1)}" y="${(height - padB + 11).toFixed(1)}" text-anchor="middle" fill="#8a9aa5" font-size="8" font-family="Arial">${x.toFixed(0)}</text>`
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
    `<text x="${padL}" y="${height - 4}" fill="#9aa8b2" font-size="8" font-family="Arial">Distance from U/S toe (m)</text>` +
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

function levelsTable(section: BundSection): string {
  const points = section.pre.slice().sort((a, b) => a.offset - b.offset)
  if (!points.length) return ''
  const { scale, columns } = levelsLayout(points.length)
  const perColumn = Math.ceil(points.length / columns)

  const chunk = (slice: typeof points): string =>
    `<table class="bp-t bp-levels" style="font-size:${(scale * 100).toFixed(0)}%">` +
    `<thead><tr><th>Distance</th><th>Existing GL</th></tr></thead><tbody>` +
    slice
      .map(
        (point) =>
          `<tr><td class="n">${f2(point.offset)}</td><td class="n">${f3(point.rl)}</td></tr>`
      )
      .join('') +
    `</tbody></table>`

  if (columns === 1) return chunk(points)
  const parts: string[] = []
  for (let i = 0; i < columns; i += 1) {
    parts.push(chunk(points.slice(i * perColumn, (i + 1) * perColumn)))
  }
  return `<div class="bp-levels-cols">${parts.join('')}</div>`
}

function sectionsBlocks(data: BundData): string[] {
  const sections = orderedSections(data)
  if (!sections.length) return []

  const rows: string[] = sections
    .map((section, index) => {
      const areas = sectionAreas(data, section)
      // On a zoned bund the formation area is the two billed zones added
      // together, so the section is not measurable from this table without
      // seeing how it splits at this chainage.
      const split = isZonedBund(data) ? zonedRepairAreas(data, section) : null
      const trenchArea = heartingTrenchEnabled(data) ? heartingTrenchArea(data) : 0
      return (
        `<div class="bp-sec">` +
        `<div class="bp-sec-h">Ch ${escapeHtml(formatChainage(section.chainage, data.chainageUnit))}</div>` +
        `<div class="bp-sec-body">` +
        `<div class="bp-sec-fig">${sectionSvg(data, section, index)}</div>` +
        levelsTable(section) +
        `<table class="bp-t bp-areas"><tbody>` +
        `<tr><td class="l">Perimeter</td><td class="n">${f3(areas.clearanceWidth)}</td><td class="u">m</td></tr>` +
        `<tr><td class="l">Stripping area</td><td class="n">${f3(areas.stripping)}</td><td class="u">m²</td></tr>` +
        `<tr><td class="l">Formation area</td><td class="n">${f3(areas.formation)}</td><td class="u">m²</td></tr>` +
        (split
          ? `<tr><td class="l">— casing</td><td class="n">${f3(split.casing)}</td><td class="u">m²</td></tr>` +
            `<tr><td class="l">— hearting</td><td class="n">${f3(split.hearting)}</td><td class="u">m²</td></tr>` +
            (trenchArea > 0
              ? `<tr><td class="l">— hearting trench</td><td class="n">${f3(trenchArea)}</td><td class="u">m²</td></tr>`
              : '')
          : '') +
        `<tr><td class="l">U/S slope length</td><td class="n">${f3(areas.usFace)}</td><td class="u">m</td></tr>` +
        `<tr><td class="l">D/S slope length</td><td class="n">${f3(areas.dsFace)}</td><td class="u">m</td></tr>` +
        `</tbody></table></div></div>`
      )
    })


  // One flex container, not one block per section: the sections tile across the
  // measure and wrap, so a sheet carries as many as fit rather than one per row.
  return [`<h3>Cross-sections</h3>`, `<div class="bp-secs">${rows.join('')}</div>`]
}

// ---------------------------------------------------------------------------
// Statement of quantities
// ---------------------------------------------------------------------------

interface StatementGroup {
  label: string
  note?: string
  unit: string
  sub: string
  rows: BundQtyRow[]
}

function statementGroups(data: BundData): StatementGroup[] {
  const groups: StatementGroup[] = []
  const add = (label: string, unit: string, sub: string, rows: BundQtyRow[], note?: string): void => {
    if (rows.length && rowsTotal(rows) > 1e-9) groups.push({ label, unit, sub, rows, note })
  }

  if (data.clearanceMaterial && data.clearanceMode !== 'manual') {
    add('Jungle clearance', 'sq.m', 'Perimeter', clearancePerimeterRows(data))
  }
  add('Stripping', 'cum', 'Area', strippingRows(data))
  const formationEnabled = data.formationEnabled ?? true
  if (isZonedBund(data)) {
    add('Casing zone', 'cum', 'Area', casingRows(data))
    add('Hearting zone', 'cum', 'Area', heartingRows(data))
    add('Hearting cut-off trench', 'cum', 'Area', heartingTrenchRows(data))
  } else {
    add(formationEnabled ? 'Formation' : 'Rolling', 'cum', 'Area', formationRows(data))
  }
  if (data.pitchingMaterial) {
    add('Stone pitching / revetment', 'sq.m', 'Length', quantityRows(data, (a) => a.usFace))
  }
  if (data.turfingMaterial) add('Turfing', 'sq.m', 'Length', turfingRows(data))
  if (data.rockToeExcavationMaterial) {
    add('Trench of rock toe', 'cum', 'Area', rockToeExcavationRows(data))
  }
  if (data.downstreamToe.excavationMaterial) {
    add('D/S toe drain excavation', 'cum', 'Area', toeExcavationRows(data, data.downstreamToe))
  }
  return groups
}

function statementBlocks(data: BundData): string[] {
  const groups = statementGroups(data)
  if (!groups.length) return []

  // Every group shares the same chainage intervals, so one row per interval.
  const intervals = groups[0].rows
  const head1 =
    `<tr><th rowspan="2" class="l">Chainage</th><th rowspan="2">Length<br>(m)</th>` +
    groups
      .map(
        (group) =>
          `<th colspan="3" class="grp">${escapeHtml(group.label)}` +
          (group.note ? `<span class="add">${escapeHtml(group.note)}</span>` : '') +
          `</th>`
      )
      .join('') +
    `</tr>`
  const head2 =
    `<tr>` +
    groups
      .map(
        (group) =>
          `<th>${escapeHtml(group.sub)} 1</th><th>${escapeHtml(group.sub)} 2</th>` +
          `<th class="q">Quantity<br>(${escapeHtml(group.unit)})</th>`
      )
      .join('') +
    `</tr>`

  const totals = groups.map(() => 0)
  const body = intervals
    .map((interval, index) => {
      const cells = groups
        .map((group, groupIndex) => {
          const row = group.rows[index]
          if (!row) return `<td>—</td><td>—</td><td class="q">—</td>`
          totals[groupIndex] += row.qty
          return (
            `<td class="n">${f3(row.areaFrom)}</td><td class="n">${f3(row.areaTo)}</td>` +
            `<td class="n q">${f2(row.qty)}</td>`
          )
        })
        .join('')
      return (
        `<tr><td class="l">Ch. ${escapeHtml(formatChainage(interval.fromCh, data.chainageUnit))} – ` +
        `${escapeHtml(formatChainage(interval.toCh, data.chainageUnit))}</td>` +
        `<td class="n">${f2(interval.lengthM)}</td>${cells}</tr>`
      )
    })
  const totalRow =
    `<tr class="tot"><td class="l" colspan="2">Total</td>` +
    totals.map((total) => `<td></td><td></td><td class="n q">${f2(total)}</td>`).join('') +
    `</tr>`

  // One table. `thead` repeats on every sheet it spans and rows never split, so
  // it fills each page and continues rather than being cut into fixed chunks.
  return [
    `<h3>Statement of quantities</h3>`,
    `<p class="bp-note">Columns 1 and 2 of each group are the values measured at the two bounding ` +
      `sections. Quantity = (value 1 + value 2) / 2 × Length.</p>`,
    `<table class="bp-t bp-stmt"><thead>${head1}${head2}</thead>` +
      `<tbody>${body.join('')}${totalRow}</tbody></table>`
  ]
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
export const BUND_PRINT_MARGINS = { top: 10, bottom: 10, left: 10, right: 10 }

function styles(fontScale: number, orientation: BundPageOrientation): string {
  const base = 13 * fontScale
  return `
    *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    html,body{margin:0;padding:0;color:#111;background:#fff;font-family:"Times New Roman",serif}
    body{font-size:${base}px;line-height:1.4}

    /* Break hints. Everything below exists so the engine can fill a sheet
       without splitting something that has to stay whole. */
    h3,h4{break-after:avoid;page-break-after:avoid}
    .bp-fig,.bp-ssr,.bp-sec,.bp-xcode,.bp-fam{break-inside:avoid;page-break-inside:avoid}
    table{break-inside:auto}
    thead{display:table-header-group}
    tr{break-inside:avoid;page-break-inside:avoid}

    .section-banner{margin:0 0 5mm;padding:6px 9px;border-left:4px solid #447a9c;background:#edf5fa;font-family:Arial}
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
    .bp-fig{width:100%;max-width:${orientation === 'landscape' ? 250 : 176}mm;display:block;border:1px solid #ccc;background:#fbfbfa;margin-bottom:5px}
    .bp-fam-cols{display:flex;gap:7mm;margin-top:4px}
    .bp-fam{flex:1;min-width:0;border:1px solid #b9c4cc;padding:5px 7px}
    .bp-fam-h{font-family:Arial;border-bottom:1px solid #b9c4cc;padding-bottom:3px;margin-bottom:4px}
    .bp-fam-h b{color:#14364b}
    .bp-fam-h span{display:block;color:#8a9aa5;font-size:${base * 0.85}px}
    .bp-fam-list{margin:0 0 5px;padding-left:14px}
    .bp-fam-list li span{float:right;font-weight:600}
    .bp-fam-none{margin:0;color:#8a9aa5;font-style:italic}
    .bp-xcode{margin:0 0 5px}
    .bp-xcode-h{font-family:Arial;display:flex;align-items:baseline;gap:8px}
    .bp-xcode-h b{color:#14364b}
    .bp-xcode-q{margin-left:auto;font-weight:700;color:#10303f}
    .bp-xcode .bp-desc{margin:2px 0 0;font-size:${base * 0.88}px}

    /* Sections tile across the measure rather than one per row, so a sheet
       carries as many as fit instead of a fixed two. */
    .bp-secs{display:flex;flex-wrap:wrap;gap:4mm}
    .bp-sec{flex:1 1 ${orientation === 'landscape' ? 130 : 84}mm;min-width:${orientation === 'landscape' ? 130 : 84}mm;
            border-top:1px solid #ccd;padding-top:3px}
    .bp-sec-h{font-family:Arial;font-weight:700;color:#14364b;margin:0 0 2px}
    .bp-sec-body{display:flex;gap:3mm;align-items:flex-start}
    .bp-sec-fig{flex:1 1 auto;min-width:0}
    /* Without min-width:0 the SVG's intrinsic width becomes the section's
       min-content width, and a section can no longer share a row. */
    .bp-sec-fig .bp-fig{max-width:none;min-width:0;width:100%}
    .bp-levels{min-width:34mm}
    .bp-levels-cols{display:flex;gap:2mm;align-items:flex-start}
    .bp-stmt{width:100%;font-size:${base * 0.85}px}
  `
}

function bannerHtml(section: ProjectNode, data: BundData, subtitle: string): string {
  const sections = orderedSections(data)
  const zoned = isZonedBund(data)
  const meta = [
    `${zoned ? 'Impervious zone' : 'Homogeneous'} · ${data.mode === 'new' ? 'new bund' : 'repair of existing bund'}`,
    `${sections.length} surveyed section${sections.length === 1 ? '' : 's'}`,
    `crest ${f2(data.design.topWidth)} m`,
    `U/S 1:${f2(data.design.usSlope)} · D/S 1:${f2(data.design.dsSlope)}`,
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
  body: string
): string {
  return (
    `<!doctype html><html><head><meta charset="utf-8">` +
    `<style>${styles(fontScale, orientation)}</style></head>` +
    `<body>${banner}${body}</body></html>`
  )
}

/**
 * The bund's detailed estimate, one document per orientation.
 *
 * A print request carries a single page size, so the two landscape schedules
 * are separate documents from the portrait narrative; within each, content
 * simply flows.
 */
export function bundDetailPages(
  project: EestimateProject,
  section: ProjectNode,
  data: BundData,
  fontScale: number,
  _recipes: Record<string, RateAnalysisRecipe>
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
      html: document(fontScale, orientation, bannerHtml(section, data, subtitle), body)
    })
  }

  add('landscape', 'Earth Work Excavation', excavationBlocks(project.root, data))
  add('portrait', 'Component Details', [
    ...phreaticBlocks(data),
    ...componentDetailsBlocks(project.root, data)
  ])
  add('portrait', 'Cross-sections', sectionsBlocks(data))
  add('landscape', 'Statement of Quantities', statementBlocks(data))

  return pages
}
