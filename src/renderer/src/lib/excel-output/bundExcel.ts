/**
 * Bund template Excel sheets — native rust_xlsxwriter path, no ExcelJS.
 *
 * Renders the shared Bund output model (`buildBundOutputModel` in
 * `../typist-output/bund/bundTypst.ts`, laid out by `bund.typ`): the same
 * schedules feed the Statement of Quantities, the same exhibit rule picks
 * the cross-sections for the Graphs sheet, and the same excavation /
 * payable / component-detail blocks feed the Others sheet. The workbook
 * attaches these after the component Abstract like `injectBundLayout`
 * does (Rust `Bund` kind); the bund signature is the component's own.
 *
 * Liveness: statement Average/Total cells are compiled from the same semantic
 * expression lineage that supplies Typst's resolved values. Measured Section
 * cells remain source values. SVG figures are rasterized to PNG via
 * the DOM at export time (no DOM, e.g. tests → figures skipped, tables
 * intact); a corrupt figure in the browser fails loudly.
 */
import type { buildBundOutputModel } from '../typist-output/bund/bundTypst'
import {
  columnLabel,
  sanitizeSheetName,
  type DetailGrid,
  type GridCell,
  type GridImage,
  type GridMerge
} from './detailGrid'
import { rasterizeSvg } from './svgRaster'
import {
  compileCalculationExpression,
  SemanticCellRegistry,
  type CalculatedValue
} from '../estimate-output/calculation'

type BundRenderData = ReturnType<typeof buildBundOutputModel>

export interface BundSheetPayload {
  name: string
  grid: DetailGrid
  landscape: boolean
}

export interface BundTotalCell {
  sheet: string
  r: number
  c: number
}

export interface BundExcelPlan {
  sheets: BundSheetPayload[]
  /** Exact payable total cell keyed by the generated Bund item node id. */
  totalRefs: Map<string, BundTotalCell>
}

export interface BundSheetNames {
  statement: string
  graphs: string
  others: string
}

interface WorkDef {
  key: string
  label: string
  sectionUnit: string
  totalUnit: string
}

const QTY_FMT = '#,##0.000'

function round3(value: number): number {
  return Math.round(value * 1000) / 1000
}

function fmtN(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? '—' : String(round3(value))
}

/** Static measured cell: number stays numeric, missing prints like Typst. */
function measured(r: number, c: number, value: number | null | undefined, bold = false): GridCell {
  const cell: GridCell = { r, c, value: value == null ? '—' : round3(value) }
  if (typeof cell.value === 'number') cell.numFmt = QTY_FMT
  if (bold) cell.style = { bold: true }
  return cell
}

function titleCell(r: number, c: number, text: string, sizePt: number): GridCell {
  return { r, c, value: text, style: { bold: true, sizePt } }
}

function mergeRow(r: number, lastCol: number): GridMerge {
  return { r1: r, c1: 0, r2: r, c2: lastCol }
}

function codeDescriptionCell(
  r: number,
  code: string,
  description: string,
  runs: Array<{ text: string; bold?: boolean; italic?: boolean; underline?: boolean }> | null | undefined
): GridCell {
  const rich = (runs ?? []).filter((run) => run.text)
  if (rich.length === 0) {
    return { r, c: 0, value: `${code}. ${description}`, style: { bold: true, wrap: true } }
  }
  return {
    r,
    c: 0,
    style: { wrap: true },
    runs: [
      { text: `${code}. `, style: { bold: true } },
      ...rich.map((run) => ({
        text: run.text,
        style: { bold: run.bold, italic: run.italic, underline: run.underline }
      }))
    ]
  }
}

function statementWorks(rd: BundRenderData): WorkDef[] {
  const has = (key: string): boolean => {
    const s = (rd.schedules as Record<string, { rows?: unknown[] }>)[key]
    return Boolean(s) && Array.isArray(s.rows) && s.rows.length > 0
  }
  const strip = fmtN(rd.design?.stripDepth)
  const defs: WorkDef[] = [
    { key: 'clearance', label: 'Jungle clearance', sectionUnit: '(m)', totalUnit: '(m²)' },
    {
      key: 'foundation',
      label: rd.is_new
        ? `Bund foundation excavation — depth ${strip} m`
        : `Stripping and excavation of existing ground — depth ${strip} m`,
      sectionUnit: '(m²)',
      totalUnit: '(m³)'
    },
    {
      key: 'formation',
      label: rd.is_new ? 'Homogeneous bund filling (excluding berms)' : 'Additional homogeneous fill for restoration / strengthening',
      sectionUnit: '(m²)',
      totalUnit: '(m³)'
    },
    { key: 'casing', label: 'Casing zone (earthwork fill)', sectionUnit: '(m²)', totalUnit: '(m³)' },
    { key: 'hearting', label: 'Hearting zone (impervious core fill)', sectionUnit: '(m²)', totalUnit: '(m³)' },
    { key: 'cutoff_trench', label: 'Hearting cut-off trench', sectionUnit: '(m²)', totalUnit: '(m³)' },
    { key: 'upstream_toe', label: 'U/S toe-wall excavation', sectionUnit: '(m²)', totalUnit: '(m³)' },
    { key: 'downstream_drain', label: 'D/S toe-drain excavation', sectionUnit: '(m²)', totalUnit: '(m³)' },
    { key: 'upstream_protection', label: 'U/S toe protection', sectionUnit: '(m²)', totalUnit: '(m³ / m²)' },
    { key: 'downstream_protection', label: 'D/S drain protection', sectionUnit: '(m²)', totalUnit: '(m³ / m²)' },
    { key: 'revetment', label: 'U/S revetment', sectionUnit: '(m²)', totalUnit: '(m³ / m²)' },
    { key: 'turfing', label: 'D/S turfing', sectionUnit: '(m)', totalUnit: '(m²)' },
    { key: 'rock_toe', label: 'Rock toe', sectionUnit: '(m²)', totalUnit: '(m³)' },
    { key: 'rock_toe_excavation', label: 'Rock-toe foundation excavation', sectionUnit: '(m²)', totalUnit: '(m³)' },
    { key: 'rock_toe_filter', label: 'Rock-toe graded filter', sectionUnit: '(m²)', totalUnit: '(m³)' },
    { key: 'horizontal_filter', label: 'Horizontal filter', sectionUnit: '(m² / m)', totalUnit: '(m³ / m²)' },
    { key: 'chimney_filter', label: 'Vertical filter', sectionUnit: '(m² / m)', totalUnit: '(m³ / m²)' },
    { key: 'chute_excavation', label: 'Chute-drain excavation', sectionUnit: '(m²)', totalUnit: '(m³)' },
    {
      key: 'chute_lining',
      label: 'Chute-drain lining',
      sectionUnit: `(${rd.chute_geometry?.equivalent_section_unit ?? 'm²/m'})`,
      totalUnit: `(${rd.chute_geometry?.protection_unit ?? 'm²'})`
    }
  ]
  for (const berm of rd.berms ?? []) {
    const side = berm.side === 'us' ? 'U/S' : 'D/S'
    const rl = fmtN(berm.level)
    defs.push({
      key: `berm_fill_${berm.schedule_index}`,
      label: `Berm filling (${side}, RL ${rl})`,
      sectionUnit: '(m²)',
      totalUnit: '(m³)'
    })
    if (berm.surface) {
      defs.push({
        key: `berm_surface_${berm.schedule_index}`,
        label: `Berm protection (${side}, RL ${rl})`,
        sectionUnit: '(m)',
        totalUnit: berm.surface.measure === 'volume' ? '(m³)' : '(m²)'
      })
    }
    if (berm.drain) {
      defs.push({
        key: `berm_drain_${berm.schedule_index}`,
        label: `Berm drain protection (${side}, RL ${rl})`,
        sectionUnit: '(m)',
        totalUnit: berm.drain.measure === 'volume' ? '(m³)' : '(m²)'
      })
    }
    if (berm.excavation) {
      defs.push({
        key: `berm_drain_exc_${berm.schedule_index}`,
        label: `Berm drain excavation (${side}, RL ${rl})`,
        sectionUnit: '(m²)',
        totalUnit: '(m³)'
      })
    }
  }
  return defs.filter((d) => has(d.key))
}

interface ScheduleRow {
  start_section: number | null
  end_section: number | null
  quantity: number | null
  calculation?: {
    length: CalculatedValue
    startSection: CalculatedValue
    endSection: CalculatedValue
    averageSection: CalculatedValue
    quantity: CalculatedValue
  }
}

/** Measured value at section i (Typst `statement-value`). */
function stmtValue(rows: ScheduleRow[], i: number): number | null {
  if (i === 0) return rows[0]?.start_section ?? null
  return rows[i - 1]?.end_section ?? null
}

interface SheetBuild {
  cells: GridCell[]
  merges: GridMerge[]
  colWidthsChars: number[]
  rowHeightsPt: Array<number | null>
  images: GridImage[]
  rowBreaks: number[]
}

function emptyBuild(widths: number[]): SheetBuild {
  return { cells: [], merges: [], colWidthsChars: widths, rowHeightsPt: [], images: [], rowBreaks: [] }
}

function setRowHeight(build: SheetBuild, r: number, pt: number): void {
  while (build.rowHeightsPt.length <= r) build.rowHeightsPt.push(null)
  build.rowHeightsPt[r] = pt
}

/**
 * Sheet 1: Statement of Quantities. Same panels as `statement-panel`: fixed
 * geometry columns plus Section / Average / Total per visible work, then the
 * totals row. Average and Total are live Excel formulas over the measured
 * Section cells whenever both endpoints are numeric; otherwise the Typst
 * value prints statically.
 */
export function buildStatementSheet(
  rd: BundRenderData,
  assemblyPng: { dataBase64: string; widthPx: number; heightPx: number } | null
): DetailGrid {
  const works = statementWorks(rd)
  const sections = rd.sections ?? []
  const availableMm = rd.document_settings?.statement_page_width_mm ?? 273
  const firstCapacity = Math.max(1, Math.floor((availableMm - 86) / 49.5))
  const continuedCapacity = Math.max(1, Math.floor((availableMm - 34) / 49.5))
  const firstCount = Math.min(works.length, firstCapacity)
  const panelColumnCount = Math.max(
    5 + Math.max(1, firstCount) * 3,
    2 + Math.max(1, Math.min(continuedCapacity, Math.max(0, works.length - firstCount))) * 3
  )
  const widths = Array<number>(panelColumnCount).fill(13)
  ;[14, 12, 14, 12, 18].forEach((width, index) => { widths[index] = width })
  const lastCol = widths.length - 1
  const build = emptyBuild(widths)

  let r = 0
  build.cells.push(titleCell(r, 0, rd.component_name ?? '', 14))
  build.merges.push(mergeRow(r, lastCol))
  setRowHeight(build, r, 22)
  r += 1
  const meta =
    `${rd.project_name ? `${rd.project_name} · ` : ''}${rd.layout_label ?? ''} · ${sections.length} surveyed section(s) · ` +
    `Bund length ${fmtN(rd.length_m)} m · Datum ${fmtN(rd.datum_rl)} m · ` +
    `Crest width ${fmtN(rd.design?.topWidth)} m`
  build.cells.push({ r, c: 0, value: meta, style: { colorRgb: '557385' } })
  build.merges.push(mergeRow(r, lastCol))
  setRowHeight(build, r, 15)
  r += 1
  // Design chips as a Dimension | Value mini-table (Typst `dims`).
  const chips: Array<[string, string]> = [
    ['MWL (m)', fmtN(rd.design?.mwl)],
    ...((rd.show_freeboard ?? rd.is_new) ? [['Freeboard (m)', fmtN(rd.design?.freeBoard)] as [string, string]] : []),
    ['TBL (m)', fmtN(rd.design?.topLevel)],
    ['FTL (m)', fmtN(rd.design?.ftl)],
    ['U/S slope', fmtN(rd.design?.usSlope)],
    ['D/S slope', fmtN(rd.design?.dsSlope)]
  ]
  build.cells.push({ r, c: 0, value: 'Dimension', style: { bold: true } })
  build.cells.push({ r, c: 1, value: 'Value', style: { bold: true } })
  setRowHeight(build, r, 15)
  r += 1
  for (const [label, value] of chips) {
    build.cells.push({ r, c: 0, value: label, style: { colorRgb: '5C788A' } })
    build.cells.push({ r, c: 1, value, style: { bold: true } })
    setRowHeight(build, r, 14)
    r += 1
  }
  if (rd.show_hearting && rd.hearting_design) {
    r += 1
    build.cells.push(titleCell(r, 0, 'Zoned construction', 11))
    build.merges.push(mergeRow(r, lastCol))
    setRowHeight(build, r, 18)
    r += 1
    const hearting = rd.hearting_design
    const zoned: Array<[string, string]> = [
      ['Hearting top RL (m)', fmtN(hearting.topLevel)],
      ['Hearting top width (m)', fmtN(hearting.topWidth)],
      ['U/S hearting slope', fmtN(hearting.usSlope)],
      ['D/S hearting slope', fmtN(hearting.dsSlope)]
    ]
    if (rd.show_cutoff_trench && rd.cutoff_trench) {
      zoned.push(
        ['Cut-off trench depth (m)', fmtN(rd.cutoff_trench.resolved_depth_m)],
        ['Cut-off trench area (m²)', fmtN(rd.cutoff_trench.area_m2)],
        ['Cut-off trench bottom width (m)', fmtN(rd.cutoff_trench.bottomWidth)]
      )
    }
    for (const [label, value] of zoned) {
      build.cells.push({ r, c: 0, value: label, style: { colorRgb: '5C788A' } })
      build.cells.push({ r, c: 1, value, style: { bold: true } })
      setRowHeight(build, r, 14)
      r += 1
    }
    build.cells.push({
      r,
      c: 0,
      value: 'Casing and impervious hearting are measured separately. The core is contained within the proposed embankment.',
      style: { colorRgb: '5C788A', wrap: true }
    })
    build.merges.push(mergeRow(r, lastCol))
    setRowHeight(build, r, 28)
    r += 1
  }
  if (!rd.is_new) {
    const repairPrefix = rd.show_repair_kind
      ? `Repair category: ${rd.repair_kind ?? '—'} · Soil source: ${rd.soil_source ?? '—'}. `
      : ''
    build.cells.push({
      r,
      c: 0,
      value: `${repairPrefix}Repair is measured between the surveyed existing profile and the proposed section. Retained earth is excluded from additional fill.`,
      style: { colorRgb: '5C788A', wrap: true }
    })
    build.merges.push(mergeRow(r, lastCol))
    setRowHeight(build, r, 30)
    r += 1
  }
  if (assemblyPng) {
    const gridPx = widths.reduce((a, w) => a + w * 7, 0)
    const drawW = Math.min(gridPx, 1100)
    const drawH = Math.round((assemblyPng.heightPx * drawW) / Math.max(1, assemblyPng.widthPx))
    const rows = Math.max(1, Math.round(drawH / 20))
    for (let i = 0; i < rows; i++) setRowHeight(build, r + i, 15)
    const colPx = widths.map((w) => w * 7)
    const rowPx = Array<number>(rows).fill(20)
    const at = anchorCell(colPx, rowPx, 0, 0)
    build.images.push({
      r: r + at.r,
      c: at.c,
      dataBase64: assemblyPng.dataBase64,
      mime: 'image/png',
      scaleW: drawW / Math.max(1, assemblyPng.widthPx),
      scaleH: drawH / Math.max(1, assemblyPng.heightPx)
    })
    r += rows
  }
  const totalLen = sections.length >= 2
    ? round3(sections[sections.length - 1].chainage_m - sections[0].chainage_m)
    : 0
  const renderPanel = (panelWorks: WorkDef[], panelStart: number, first: boolean): void => {
    const registry = new SemanticCellRegistry()
    if (r > 0) build.rowBreaks.push(r - 1)
    const fixedCount = first ? 5 : 2
    const panelLastCol = fixedCount + panelWorks.length * 3 - 1
    build.cells.push(titleCell(r, 0, first ? 'Statement of quantities' : 'Statement of quantities — continued', 13))
    build.merges.push({ r1: r, c1: 0, r2: r, c2: panelLastCol })
    setRowHeight(build, r, 20)
    r += 1
    if (first) {
      build.cells.push({
        r,
        c: 0,
        value: 'Average section value = (A1 + A2) / 2. Interval quantity = average section value × length.',
        style: { colorRgb: '5C788A', wrap: true }
      })
      build.merges.push({ r1: r, c1: 0, r2: r, c2: panelLastCol })
      setRowHeight(build, r, 18)
      r += 1
    }
    const h0 = r
    const fixedLabels = first
      ? ['Chainage', 'Length (m)', 'Average toe RL (m)', 'Bund height (m)', 'Bund width / surveyed ground perimeter (m)']
      : ['Chainage', 'Length (m)']
    fixedLabels.forEach((label, c) => {
      build.cells.push({ r: h0, c, value: label, style: { bold: true, align: 'center', wrap: true } })
      build.merges.push({ r1: h0, c1: c, r2: h0 + 2, c2: c })
    })
    panelWorks.forEach((work, wi) => {
      const c = fixedCount + wi * 3
      build.cells.push({ r: h0, c, value: work.label, style: { bold: true, align: 'center', wrap: true } })
      build.merges.push({ r1: h0, c1: c, r2: h0, c2: c + 2 })
      ;['Section', 'Average', 'Total'].forEach((sub, k) => {
        build.cells.push({ r: h0 + 1, c: c + k, value: sub, style: { bold: true, align: 'center' } })
      })
      ;[work.sectionUnit, work.sectionUnit, work.totalUnit].forEach((unit, k) => {
        build.cells.push({ r: h0 + 2, c: c + k, value: unit, style: { align: 'center' } })
      })
    })
    const hNums = h0 + 3
    for (let c = 0; c < fixedCount; c++) {
      build.cells.push({ r: hNums, c, value: c + 1, style: { align: 'center', colorRgb: '5C788A' } })
    }
    panelWorks.forEach((_, wi) => {
      const c = fixedCount + wi * 3
      const numberStart = 6 + (panelStart + wi) * 3
      for (let k = 0; k < 3; k++) {
        build.cells.push({ r: hNums, c: c + k, value: numberStart + k, style: { align: 'center', colorRgb: '5C788A' } })
      }
    })
    ;[h0, h0 + 1, h0 + 2, hNums].forEach((row) => setRowHeight(build, row, row === h0 ? 30 : 15))
    const firstBody = hNums + 1
    sections.forEach((section, i) => {
      const row = firstBody + i
      const prev = i === 0 ? null : sections[i - 1]
      const length = prev == null ? null : round3(section.chainage_m - prev.chainage_m)
      build.cells.push({ r: row, c: 0, value: section.chainage ?? '' })
      build.cells.push(measured(row, 1, length))
      if (first) {
        build.cells.push(measured(row, 2, section.average_toe_rl))
        build.cells.push(measured(row, 3, section.height_m))
        build.cells.push(measured(row, 4, section.base_width_m))
      }
      panelWorks.forEach((work, wi) => {
        const c = fixedCount + wi * 3
        const schedule = (rd.schedules as Record<string, { rows: ScheduleRow[] }>)[work.key]
        const rows = schedule?.rows ?? []
        const sec = stmtValue(rows, i)
        build.cells.push(measured(row, c, sec))
        const displayed = i === 0 ? rows[0]?.calculation?.startSection : rows[i - 1]?.calculation?.endSection
        if (displayed) registry.register(displayed.id, { r: row, c })
        // Adjacent intervals describe the same physical section with an end
        // ID and a start ID. Both semantic IDs resolve to this one cell.
        const adjacentStart = i > 0 ? rows[i]?.calculation?.startSection : undefined
        if (adjacentStart) registry.register(adjacentStart.id, { r: row, c })
        const secPrev = i === 0 ? null : stmtValue(rows, i - 1)
        const calculation = i === 0 ? undefined : rows[i - 1]?.calculation
        if (calculation && length != null && sec != null && secPrev != null) {
          registry.register(calculation.length.id, { r: row, c: 1 })
          registry.register(calculation.averageSection.id, { r: row, c: c + 1 })
          build.cells.push({
            r: row,
            c: c + 1,
            formula: compileCalculationExpression(calculation.averageSection.expression!, registry),
            numFmt: QTY_FMT
          })
          registry.register(calculation.quantity.id, { r: row, c: c + 2 })
          build.cells.push({
            r: row,
            c: c + 2,
            formula: compileCalculationExpression(calculation.quantity.expression!, registry),
            numFmt: QTY_FMT
          })
        } else {
          const interval = i === 0 ? null : rows[i - 1]
          build.cells.push(measured(row, c + 1, interval && interval.start_section != null && interval.end_section != null
            ? round3((interval.start_section + interval.end_section) / 2) : null))
          build.cells.push(measured(row, c + 2, interval?.quantity ?? null))
        }
      })
      setRowHeight(build, row, 15)
    })
    const totalRow = firstBody + sections.length
    const totalExcel = totalRow + 1
    build.cells.push({ r: totalRow, c: 0, value: 'Total', style: { bold: true } })
    build.cells.push(sections.length >= 2
      ? { r: totalRow, c: 1, formula: `=SUM(B${firstBody + 1}:B${totalExcel - 1})`, style: { bold: true }, numFmt: QTY_FMT }
      : measured(totalRow, 1, totalLen, true))
    for (let c = 2; c < fixedCount; c++) build.cells.push({ r: totalRow, c, value: '' })
    panelWorks.forEach((work, wi) => {
      const c = fixedCount + wi * 3
      const totalLetter = columnLabel(c + 2)
      const schedule = (rd.schedules as Record<string, { rows: ScheduleRow[]; totalCalculation?: CalculatedValue }>)[work.key]
      build.cells.push({ r: totalRow, c, value: '' })
      build.cells.push({ r: totalRow, c: c + 1, value: '' })
      build.cells.push({
        r: totalRow,
        c: c + 2,
        formula: schedule?.totalCalculation?.expression
          ? compileCalculationExpression(schedule.totalCalculation.expression, registry)
          : `=SUM(${totalLetter}${firstBody + 1}:${totalLetter}${totalExcel - 1})`,
        style: { bold: true },
        numFmt: QTY_FMT
      })
    })
    setRowHeight(build, totalRow, 16)
    r = totalRow + 2
  }
  if (works.length > 0) {
    renderPanel(works.slice(0, firstCount), 0, true)
    for (let start = firstCount; start < works.length; start += continuedCapacity) {
      renderPanel(works.slice(start, start + continuedCapacity), start, false)
    }
  }

  let tail = r
  const manual = rd.clearance_manual ?? []
  if (manual.length > 0) {
    tail += 1
    build.cells.push(titleCell(tail, 0, 'Manual jungle clearance', 12))
    build.merges.push(mergeRow(tail, lastCol))
    setRowHeight(build, tail, 20)
    tail += 1
    const heads = ['Length (m)', 'Breadth (m)', 'Area (m²)']
    heads.forEach((head, k) => {
      build.cells.push({ r: tail, c: k, value: head, style: { bold: true, align: 'center' } })
    })
    setRowHeight(build, tail, 15)
    tail += 1
    for (const row of manual) {
      const excel = tail + 1
      build.cells.push(measured(tail, 0, row.length))
      build.cells.push(measured(tail, 1, row.breadth))
      if (row.length != null && row.breadth != null) {
        build.cells.push({ r: tail, c: 2, formula: `=A${excel}*B${excel}`, numFmt: QTY_FMT })
      } else {
        build.cells.push(measured(tail, 2, row.quantity ?? (row.length ?? 0) * (row.breadth ?? 0)))
      }
      setRowHeight(build, tail, 15)
      tail += 1
    }
  }
  return { cells: build.cells, merges: build.merges, colWidthsChars: build.colWidthsChars, rowHeightsPt: build.rowHeightsPt, images: build.images, rowBreaks: build.rowBreaks }
}

/**
 * Sheet 2: Graphs. One block per exhibit section (new bunds: only detailed
 * ground profiles; repair: every chainage — the same `exhibit-sections`
 * rule). Each block carries the section dims, the rasterized cross-section
 * figure, the formation calculation and the hearting calculation when the
 * section has one. Zoned layouts break the page every two sections like
 * the Typst continuation rule.
 */
export async function buildGraphsSheet(
  rd: BundRenderData,
  raster: (svg: string) => Promise<{ dataBase64: string; widthPx: number; heightPx: number } | null>
): Promise<DetailGrid | null> {
  const sections = rd.sections ?? []
  const exhibit = rd.is_new ? sections.filter((s) => s.detailed_ground_profile) : sections
  if (exhibit.length === 0) return null
  const widths = [14, 14, 14, 44, 16]
  const lastCol = widths.length - 1
  const build = emptyBuild(widths)
  const gridPx = widths.reduce((a, w) => a + w * 7, 0)

  const placeFigure = async (svg: string, r: number): Promise<number> => {
    const png = await raster(svg)
    if (!png) return 0
    const drawW = Math.min(gridPx, 1000)
    const drawH = Math.round((png.heightPx * drawW) / Math.max(1, png.widthPx))
    const rows = Math.max(1, Math.round(drawH / 20))
    for (let i = 0; i < rows; i++) setRowHeight(build, r + i, 15)
    build.images.push({
      r,
      c: 0,
      dataBase64: png.dataBase64,
      mime: 'image/png',
      scaleW: drawW / Math.max(1, png.widthPx),
      scaleH: drawH / Math.max(1, png.heightPx)
    })
    return rows
  }

  const calcTable = (stations: StationLike[], startRow: number, totalLabel = 'Total formation quantity'): number => {
    let r = startRow
    const heads = ['Ch', 'EL', 'RL', 'Calculation', 'Quantity']
    heads.forEach((head, c) => {
      build.cells.push({ r, c, value: head, style: { bold: true, align: 'center' } })
    })
    setRowHeight(build, r, 15)
    r += 1
    const firstQty = r
    for (const st of stations) {
      build.cells.push(measured(r, 0, st.distance_m))
      build.cells.push(measured(r, 1, st.existing_rl))
      build.cells.push(measured(r, 2, st.proposed_rl))
      if (st.width_m == null) {
        build.cells.push({ r, c: 3, value: 'Start point' })
      } else {
        build.cells.push({
          r,
          c: 3,
          value: `${fmtN(st.width_m)} × (${fmtN(st.start_depth_m)} + ${fmtN(st.end_depth_m)}) / 2`,
          style: { wrap: true }
        })
      }
      build.cells.push(measured(r, 4, st.signed_area_m2))
      setRowHeight(build, r, 15)
      r += 1
    }
    build.cells.push({ r, c: 0, value: totalLabel, style: { bold: true, align: 'right' } })
    build.merges.push({ r1: r, c1: 0, r2: r, c2: 3 })
    if (stations.length > 0) {
      build.cells.push({
        r,
        c: 4,
        formula: `=SUM(${columnLabel(4)}${firstQty + 1}:${columnLabel(4)}${r})`,
        style: { bold: true },
        numFmt: QTY_FMT
      })
    } else {
      build.cells.push(measured(r, 4, 0, true))
    }
    setRowHeight(build, r, 16)
    return r + 1
  };

  // Sequential so figure rows reserve exact space; figures are few.
  let r = 0
  build.cells.push(titleCell(r, 0, 'Cross-sections', 13))
  build.merges.push(mergeRow(r, lastCol))
  setRowHeight(build, r, 20)
  r += 1
  if (rd.is_new && exhibit.some((section) => section.detailed_ground_profile)) {
    build.cells.push({
      r,
      c: 0,
      value: '* Detailed existing-ground cross-section; bund width is the surveyed ground perimeter between the designed toes.',
      style: { colorRgb: '5C788A', italic: true, wrap: true }
    })
    build.merges.push(mergeRow(r, lastCol))
    setRowHeight(build, r, 24)
    r += 1
  }
  for (let si = 0; si < exhibit.length; si++) {
    const section = exhibit[si]
    if (si > 0 && rd.is_zoned && si % 2 === 0) {
      build.rowBreaks.push(r - 1)
      build.cells.push(titleCell(r, 0, 'Cross-sections — continued', 13))
      build.merges.push(mergeRow(r, lastCol))
      setRowHeight(build, r, 20)
      r += 1
    }
    build.cells.push(titleCell(r, 0, `Ch ${section.chainage ?? ''} · Average toe RL ${fmtN(section.average_toe_rl)} m`, 12))
    build.merges.push(mergeRow(r, lastCol))
    setRowHeight(build, r, 20)
    r += 1
    build.cells.push({ r, c: 0, value: 'Dimension', style: { bold: true } })
    build.cells.push({ r, c: 1, value: 'Value', style: { bold: true } })
    setRowHeight(build, r, 15)
    r += 1
    const dims: Array<[string, string]> = [
      ['Surveyed ground perimeter', `${fmtN(section.ground_perimeter_m)} m`],
      ['Foundation / stripping area', `${fmtN(section.areas?.stripping)} m²`]
    ]
    for (const [label, value] of dims) {
      build.cells.push({ r, c: 0, value: label, style: { colorRgb: '5C788A' } })
      build.cells.push({ r, c: 1, value, style: { bold: true } })
      setRowHeight(build, r, 14)
      r += 1
    }
    r += await placeFigure(section.svg ?? '', r)
    r = calcTable(section.stations ?? [], r)
    const hearting = section.hearting_stations ?? []
    if (hearting.length > 0) {
      build.cells.push(titleCell(r, 0, 'Impervious hearting', 11))
      build.merges.push(mergeRow(r, lastCol))
      setRowHeight(build, r, 18)
      r += 1
      build.cells.push({ r, c: 0, value: 'Casing = formation less hearting.', style: { colorRgb: '5C788A' } })
      build.merges.push(mergeRow(r, lastCol))
      setRowHeight(build, r, 14)
      r += 1
      r = calcTable(hearting, r, 'Total hearting quantity')
    }
    r += 1
  }
  return { cells: build.cells, merges: build.merges, colWidthsChars: build.colWidthsChars, rowHeightsPt: build.rowHeightsPt, images: build.images, rowBreaks: build.rowBreaks }
}

interface StationLike {
  distance_m: number | null
  existing_rl: number | null
  proposed_rl: number | null
  width_m: number | null
  start_depth_m: number | null
  end_depth_m: number | null
  signed_area_m2: number | null
}

const EXCAVATION_LABELS: Record<string, string> = {
  stripping: 'Foundation / stripping',
  'ustoe-exc': 'Upstream toe wall',
  'dstoe-exc': 'Downstream toe drain',
  'rocktoe-exc': 'Rock-toe trench',
  'hearting-trench-exc': 'Hearting cut-off trench',
  'chute-exc': 'Chute drain',
  'berm-drain-exc': 'Berm catch-water drains'
}

/**
 * Sheet 3: Others. Earthwork excavation classification with per-source
 * class splits, Total quantities of Excavation, Total quantities (payable,
 * non-excavation), component detail figures with their dims, berm cards,
 * and the phreatic comparison. Code totals are live SUMs over their terms.
 */
export async function buildOthersSheet(
  rd: BundRenderData,
  raster: (svg: string) => Promise<{ dataBase64: string; widthPx: number; heightPx: number } | null>,
  totalRefs?: Map<string, { r: number; c: number }>
): Promise<DetailGrid> {
  // Code blocks need one column per term plus Total — widen past 5 when needed.
  const termCounts = [
    ...(rd.excavation_by_code ?? []).map((code) => (code.terms ?? []).length),
    ...(rd.payable_by_code ?? []).map((code) => (code.terms ?? []).length)
  ]
  const needCols = Math.max(5, ...termCounts.map((n) => n + 1))
  const widths = [26, 16, 16, 34, 18]
  while (widths.length < needCols) widths.push(18)
  const lastCol = widths.length - 1
  const build = emptyBuild(widths)
  const gridPx = widths.reduce((a, w) => a + w * 7, 0)
  let r = 0

  const recordTotal = (itemNodeId: string | null | undefined, ref: { r: number; c: number }): void => {
    if (!itemNodeId || !totalRefs) return
    if (totalRefs.has(itemNodeId)) {
      throw new Error(`Bund Excel: generated item '${itemNodeId}' owns more than one payable total.`)
    }
    totalRefs.set(itemNodeId, ref)
  }

  const heading = (text: string, size = 13): void => {
    build.cells.push(titleCell(r, 0, text, size))
    build.merges.push(mergeRow(r, lastCol))
    setRowHeight(build, r, 20)
    r += 1
  }
  const note = (text: string): void => {
    build.cells.push({ r, c: 0, value: text, style: { colorRgb: '5C788A', wrap: true } })
    build.merges.push(mergeRow(r, lastCol))
    setRowHeight(build, r, 14)
    r += 1
  }
  const placeFigure = async (svg: string): Promise<void> => {
    const png = await raster(svg)
    if (!png) return
    const drawW = Math.min(gridPx, 1000)
    const drawH = Math.round((png.heightPx * drawW) / Math.max(1, png.widthPx))
    const rows = Math.max(1, Math.round(drawH / 20))
    for (let i = 0; i < rows; i++) setRowHeight(build, r + i, 15)
    build.images.push({
      r,
      c: 0,
      dataBase64: png.dataBase64,
      mime: 'image/png',
      scaleW: drawW / Math.max(1, png.widthPx),
      scaleH: drawH / Math.max(1, png.heightPx)
    })
    r += rows
  }

  // --- Excavation classification. ---
  heading('Earthwork excavation classification')
  note('Percentages are the selected dashboard classification applied to each measured source.')
  const sources = rd.excavation ?? []
  for (const source of sources) {
    const label = source.role === 'stripping' && !rd.is_new
      ? 'Bund stripping'
      : (EXCAVATION_LABELS[source.role] ?? 'Excavation')
    build.cells.push(titleCell(r, 0, `${label} · ${fmtN(source.quantity)} m³`, 11))
    build.merges.push(mergeRow(r, lastCol))
    setRowHeight(build, r, 18)
    r += 1
    const classes = source.classes ?? []
    if (classes.length > 0) {
      const heads = ['Soil / rock', 'Share (%)', 'Code', 'Calculation', 'Quantity (m³)']
      heads.forEach((head, c) => {
        build.cells.push({ r, c, value: head, style: { bold: true, align: 'center' } })
      })
      setRowHeight(build, r, 15)
      r += 1
      for (const soil of classes) {
        build.cells.push({ r, c: 0, value: soil.soil ?? '' })
        build.cells.push(measured(r, 1, soil.percent))
        build.cells.push({ r, c: 2, value: soil.code ?? '', style: { align: 'center' } })
        build.cells.push({ r, c: 3, value: `${fmtN(source.quantity)} × ${fmtN(soil.percent)} / 100` })
        build.cells.push(measured(r, 4, soil.quantity))
        setRowHeight(build, r, 15)
        r += 1
      }
    } else {
      note('No soil classification is assigned.')
    }
  }

  // --- Total quantities of Excavation. ---
  heading('Total quantities of Excavation')
  note('Each excavation DATA code is shown once, followed by the works contributing to its total.')
  for (const code of rd.excavation_by_code ?? []) {
    build.cells.push(codeDescriptionCell(r, code.code, code.description ?? '', code.descriptionRuns))
    build.merges.push(mergeRow(r, lastCol))
    setRowHeight(build, r, 16)
    r += 1
    const terms = code.terms ?? []
    terms.forEach((term, i) => {
      build.cells.push({ r, c: i, value: term.label ?? '', style: { align: 'center', wrap: true } })
    })
    build.cells.push({ r, c: terms.length, value: 'Total', style: { bold: true, align: 'center' } })
    setRowHeight(build, r, 15)
    r += 1
    const firstVal = r
    terms.forEach((term, i) => {
      build.cells.push(measured(r, i, term.quantity))
    })
    if (terms.length > 0) {
      const lastTerm = columnLabel(terms.length - 1)
      build.cells.push({
        r,
        c: terms.length,
        formula: terms.length === 1
          ? `=${lastTerm}${firstVal + 1}`
          : `=SUM(A${firstVal + 1}:${lastTerm}${firstVal + 1})`,
        style: { bold: true },
        numFmt: QTY_FMT
      })
    } else {
      build.cells.push(measured(r, 0, code.total, true))
    }
    recordTotal(code.item_node_id, { r, c: terms.length > 0 ? terms.length : 0 })
    setRowHeight(build, r, 15)
    r += 1
    build.cells.push({ r, c: 0, value: 'Unit: m³', style: { colorRgb: '5C788A' } })
    setRowHeight(build, r, 13)
    r += 1
  }

  // --- Total quantities (payable, non-excavation). ---
  const payable = rd.payable_by_code ?? []
  if (payable.length > 0) {
    heading('Total quantities')
    note('Each work code is shown once, followed by the components that add to its total. Distinct operations can share a measured volume; their quantities must not be added to obtain geometric fill.')
    for (const code of payable) {
      build.cells.push(codeDescriptionCell(r, code.code, code.description ?? '', code.descriptionRuns))
      build.merges.push(mergeRow(r, lastCol))
      setRowHeight(build, r, 16)
      r += 1
      const terms = code.terms ?? []
      terms.forEach((term, i) => {
        build.cells.push({ r, c: i, value: term.label ?? '', style: { align: 'center', wrap: true } })
      })
      build.cells.push({ r, c: terms.length, value: 'Total', style: { bold: true, align: 'center' } })
      setRowHeight(build, r, 15)
      r += 1
      const firstVal = r
      terms.forEach((term, i) => {
        build.cells.push(measured(r, i, term.quantity))
      })
      if (terms.length > 0) {
        const lastTerm = columnLabel(terms.length - 1)
        build.cells.push({
          r,
          c: terms.length,
          formula: terms.length === 1
            ? `=${lastTerm}${firstVal + 1}`
            : `=SUM(A${firstVal + 1}:${lastTerm}${firstVal + 1})`,
          style: { bold: true },
          numFmt: QTY_FMT
        })
      } else {
        build.cells.push(measured(r, 0, code.total, true))
      }
      recordTotal(code.item_node_id, { r, c: terms.length > 0 ? terms.length : 0 })
      setRowHeight(build, r, 15)
      r += 1
      build.cells.push({ r, c: 0, value: `Unit: ${code.unit ?? ''}`, style: { colorRgb: '5C788A' } })
      setRowHeight(build, r, 13)
      r += 1
    }
  }

  // --- Component details (figures + dims). ---
  const drawings = rd.drawings ?? {}
  const hasDetails = Boolean(
    drawings.upstream_toe || drawings.downstream_drain || drawings.rock_toe ||
    drawings.filters || drawings.chute || (rd.berms ?? []).length > 0
  )
  if (hasDetails) heading('Component details')
  const config = rd.configuration ?? {}
  if (drawings.upstream_toe) {
    build.cells.push(titleCell(r, 0, 'Upstream toe wall / anchorage', 11))
    build.merges.push(mergeRow(r, lastCol))
    setRowHeight(build, r, 18)
    r += 1
    const toe = config.upstreamToe ?? {}
    const dims: Array<[string, string]> = [
      ['Top width (m)', fmtN(toe.topWidth)],
      ['Bottom width (m)', fmtN(toe.bottomWidth)],
      ['Depth (m)', fmtN(toe.depth)],
      ['Side slope (H:V)', fmtN(toe.leftSlope)]
    ]
    for (const [label, value] of dims) {
      build.cells.push({ r, c: 0, value: label, style: { colorRgb: '5C788A' } })
      build.cells.push({ r, c: 1, value, style: { bold: true } })
      setRowHeight(build, r, 14)
      r += 1
    }
    await placeFigure(drawings.upstream_toe)
  }
  if (drawings.downstream_drain) {
    build.cells.push(titleCell(r, 0, 'Downstream toe drain', 11))
    build.merges.push(mergeRow(r, lastCol))
    setRowHeight(build, r, 18)
    r += 1
    await placeFigure(drawings.downstream_drain)
  }
  if (drawings.rock_toe) {
    build.cells.push(titleCell(r, 0, 'Rock toe and graded filter', 11))
    build.merges.push(mergeRow(r, lastCol))
    setRowHeight(build, r, 18)
    r += 1
    note('The shared general excavation beneath the rock-toe foundation is assigned to the rock-toe trench and deducted from the general cut. It is counted once.')
    await placeFigure(drawings.rock_toe)
  }
  if (drawings.filters) {
    build.cells.push(titleCell(r, 0, 'Internal drainage arrangement', 11))
    build.merges.push(mergeRow(r, lastCol))
    setRowHeight(build, r, 18)
    r += 1
    await placeFigure(drawings.filters)
  }
  if (drawings.chute) {
    build.cells.push(titleCell(r, 0, 'Chute drains', 11))
    build.merges.push(mergeRow(r, lastCol))
    setRowHeight(build, r, 18)
    r += 1
    const chute = rd.chute_geometry ?? {}
    note(
      `Excavation area: A = W × D = ${fmtN(chute.width_m)} × ${fmtN(chute.depth_m)} = ` +
      `${fmtN(chute.excavation_area_m2)} m². Lined perimeter: P = W + 2D = ${fmtN(chute.lined_perimeter_m)} m. ` +
      `Per chute, excavation = A × developed length; protection = P × developed length` +
      `${chute.protection_measure === 'volume' ? ' × lining thickness' : ''}.`
    )
    await placeFigure(drawings.chute)
  }
  const berms = [...(rd.berms ?? [])].sort((a, b) => (a.side === b.side ? 0 : a.side === 'us' ? -1 : 1))
  if (berms.length > 0) {
    build.cells.push(titleCell(r, 0, 'Berm shelves', 11))
    build.merges.push(mergeRow(r, lastCol))
    setRowHeight(build, r, 18)
    r += 1
    note('U/S shelves sit on the left (water face, mirrored); D/S shelves sit on the right. Each figure is labelled with its shelf RL.')
  }
  let priorBermSide: string | null = null
  for (const berm of berms) {
    const side = berm.side === 'us' ? 'U/S' : 'D/S'
    if (berm.side !== priorBermSide) {
      build.cells.push({ r, c: 0, value: `${side} berms`, style: { bold: true, colorRgb: '163F57' } })
      build.merges.push(mergeRow(r, lastCol))
      setRowHeight(build, r, 16)
      r += 1
      priorBermSide = berm.side
    }
    build.cells.push(titleCell(r, 0, `${side} berm · Shelf RL ${fmtN(berm.level)} m`, 11))
    build.merges.push(mergeRow(r, lastCol))
    setRowHeight(build, r, 18)
    r += 1
    note('The shelf is included in the embankment geometry; only its selected surfacing and drain works are additional quantities.')
    await placeFigure(berm.svg ?? '')
    if (berm.surface) {
      note(`Shelf surfacing: ${fmtN(berm.surface.quantity)} ${berm.surface.measure === 'volume' ? 'm³' : 'm²'}`)
    }
    if (berm.drain) {
      note(`Drain protection: ${fmtN(berm.drain.quantity)} ${berm.drain.measure === 'volume' ? 'm³' : 'm²'}`)
    }
    if (berm.excavation) note(`Drain excavation: ${fmtN(berm.excavation.total)} m³`)
  }

  // --- Phreatic-line comparison. ---
  const phreatic = rd.phreatic
  if (phreatic) {
    heading('Phreatic-line comparison')
    note('Reference and selected drainage conditions at the governing cross-section.')
    const heads = ['Parameter', 'Without drainage', 'Selected drainage']
    heads.forEach((head, c) => {
      build.cells.push({ r, c, value: head, style: { bold: true, align: 'center' } })
    })
    setRowHeight(build, r, 15)
    r += 1
    const rows: Array<[string, number | null, number | null]> = [
      ['Focus datum RL (m)', phreatic.baseline?.baseRl ?? null, phreatic.selected?.baseRl ?? null],
      ['Water depth (m)', phreatic.baseline?.waterDepth ?? null, phreatic.selected?.waterDepth ?? null],
      ['Focal distance S; q = K × S (m)', phreatic.baseline?.s ?? null, phreatic.selected?.s ?? null]
    ]
    for (const [label, without, selected] of rows) {
      build.cells.push({ r, c: 0, value: label })
      build.cells.push(measured(r, 1, without))
      build.cells.push(measured(r, 2, selected))
      setRowHeight(build, r, 15)
      r += 1
    }
    await placeFigure(phreatic.svg ?? '')
  }

  return { cells: build.cells, merges: build.merges, colWidthsChars: build.colWidthsChars, rowHeightsPt: build.rowHeightsPt, images: build.images, rowBreaks: build.rowBreaks }
}

/**
 * Prepare the bund sheets in Typst order: Statement of Quantities
 * (always landscape), Graphs (only when sections exhibit figures), Others
 * (content orientation). The assembly figure rasterizes on the statement.
 */
export async function prepareBundExcelPlan(
  rd: BundRenderData,
  names: BundSheetNames = {
    statement: 'Statement of Quantities',
    graphs: 'Graphs',
    others: 'Others'
  }
): Promise<BundExcelPlan> {
  const raster = (svg: string): Promise<{ dataBase64: string; widthPx: number; heightPx: number } | null> =>
    rasterizeSvg(svg, 1000)
  const flipped = rd.document_settings?.flipped ?? false
  const resolvedNames: BundSheetNames = {
    statement: sanitizeSheetName(names.statement),
    graphs: sanitizeSheetName(names.graphs),
    others: sanitizeSheetName(names.others)
  }
  const totalCells = new Map<string, { r: number; c: number }>()
  const paper = rd.document_settings?.paper
  const pageSetup: DetailGrid['pageSetup'] = {
    paperSize: paper === 'a2' ? 'A2' : paper === 'a3' ? 'A3' : paper === 'letter' || paper === 'us-letter'
      ? 'Letter' : paper === 'legal' || paper === 'us-legal' ? 'Legal' : 'A4',
    marginsMm: rd.document_settings?.margins
  }
  const withPageSetup = (grid: DetailGrid): DetailGrid => ({ ...grid, pageSetup })
  const sheets: BundSheetPayload[] = [
    {
      name: resolvedNames.statement,
      grid: withPageSetup(buildStatementSheet(rd, await raster(rd.drawings?.assembly ?? ''))),
      landscape: true
    }
  ]
  const graphs = await buildGraphsSheet(rd, raster)
  if (graphs) {
    sheets.push({ name: resolvedNames.graphs, grid: withPageSetup(graphs), landscape: flipped })
  }
  sheets.push({ name: resolvedNames.others, grid: withPageSetup(await buildOthersSheet(rd, raster, totalCells)), landscape: flipped })
  return {
    sheets,
    totalRefs: new Map(
      [...totalCells].map(([itemNodeId, ref]) => [itemNodeId, { sheet: resolvedNames.others, ...ref }])
    )
  }
}

export async function prepareBundSheets(rd: BundRenderData): Promise<BundSheetPayload[]> {
  return (await prepareBundExcelPlan(rd)).sheets
}

export function projectBundSheetNames(componentName: string, componentId: string): BundSheetNames {
  const suffix = componentId.replace(/[^a-zA-Z0-9]/g, '').slice(-6) || 'sheet'
  const stem = componentName.replace(/\s+/g, ' ').trim().slice(0, 10) || 'Bund'
  return {
    statement: sanitizeSheetName(`Bund Qty_${stem}_${suffix}`),
    graphs: sanitizeSheetName(`Bund Graphs_${stem}_${suffix}`),
    others: sanitizeSheetName(`Bund Others_${stem}_${suffix}`)
  }
}

export function bundExcelFileName(projectName: string, componentName: string): string {
  const clean = (value: string): string => value.replace(/[\\/:*?"<>|]/g, '').trim() || 'Estimate'
  return `${clean(projectName)} — ${clean(componentName)} — Bund Statement.xlsx`
}

/** Nearest-cell anchor from px profiles (same walk as detailGrid.anchorCellAt). */
function anchorCell(colWidthsPx: number[], rowHeightsPx: number[], leftPx: number, topPx: number): { r: number; c: number } {
  let c = 0
  let acc = 0
  for (let i = 0; i < colWidthsPx.length; i++) {
    const w = colWidthsPx[i] > 0 ? colWidthsPx[i] : 88
    if (leftPx < acc + w) {
      c = i
      break
    }
    acc += w
    c = i
  }
  let r = 0
  acc = 0
  for (let i = 0; i < rowHeightsPx.length; i++) {
    const h = rowHeightsPx[i] > 0 ? rowHeightsPx[i] : 20
    if (topPx < acc + h) {
      r = i
      break
    }
    acc += h
    r = i
  }
  return { r, c }
}
