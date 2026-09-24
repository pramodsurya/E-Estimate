/**
 * Guide-wall template Excel sheet — native rust_xlsxwriter path, no ExcelJS.
 *
 * Mirrors the Typst guide-wall algorithm (`buildGuideWallRenderData` in
 * `../typist-output/guidewall/guideWallTypst.ts`, laid out by
 * `guidewall.typ`): banner, typical cross-sections, wall/base concrete
 * blocks, excavation block — in Typst order on one "Guide Wall" sheet. The
 * workbook attaches it after the component Abstract like
 * `injectGuideWallLayout` does (Rust `GuideWall` kind); the guide-wall
 * signature is the component's own.
 *
 * Numbers: render data carries fmt3 display strings (Indian grouping), so
 * `parseNum` strips grouping before writing numeric cells. Block totals are
 * live SUMs; excavation quantities are live L×B×H whenever all three parse,
 * otherwise the printed static value.
 */
import type { GuideWallRenderData } from '../typist-output/guidewall/guideWallTypst'
import { columnLabel, sanitizeSheetName, type DetailGrid, type GridCell, type GridMerge } from './detailGrid'
import { rasterizeSvg } from './svgRaster'

export interface GuideWallSheetPayload {
  name: string
  grid: DetailGrid
  landscape: boolean
}

export type GuideWallQuantityRole = 'wall' | 'base' | 'excavation'

export interface GuideWallTotalCell {
  r: number
  c: number
}

/**
 * The special Guide Wall sheet and the exact cells that own its calculated
 * quantities. Consumers must use these addresses instead of rediscovering
 * rows from the rendered grid.
 */
export interface GuideWallExcelPlan {
  sheets: GuideWallSheetPayload[]
  totalRefs: Map<string, GuideWallTotalCell>
}

export function guideWallTotalKey(role: GuideWallQuantityRole, code: string): string {
  return `${role}::${code.trim()}`
}

const QTY_FMT = '#,##0.000'

/** fmt3 strings use Indian grouping ("1,00,000.5") — strip it back to a number. */
export function parseNum(value: string | number | null | undefined): number | null {
  if (value == null) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const text = value.trim()
  if (!text || text === '—' || text === '-') return null
  const num = Number(text.replace(/,/g, ''))
  return Number.isFinite(num) ? Math.round(num * 1000) / 1000 : null
}

function numCell(r: number, c: number, value: string | number | null | undefined, bold = false): GridCell {
  const parsed = parseNum(value)
  const cell: GridCell = { r, c, value: parsed == null ? '—' : parsed }
  if (parsed != null) cell.numFmt = QTY_FMT
  if (bold) cell.style = { bold: true }
  return cell
}

function descriptionCell(
  r: number,
  description: string,
  runs: GuideWallRenderData['wall_groups'][number]['descriptionRuns']
): GridCell {
  const rich = (runs ?? []).filter((run) => run.text)
  if (rich.length) {
    return {
      r,
      c: 0,
      style: { colorRgb: '333333', wrap: true },
      runs: rich.map((run) => ({
        text: run.text.replace(/\s*\r?\n\s*/g, ' '),
        style: {
          bold: run.bold || undefined,
          italic: run.italic || undefined,
          underline: run.underline || undefined
        }
      }))
    }
  }
  return { r, c: 0, value: description, style: { colorRgb: '333333', wrap: true } }
}

async function buildGuideWallSheetPlan(
  rd: GuideWallRenderData
): Promise<{ grid: DetailGrid; totalRefs: Map<string, GuideWallTotalCell> }> {
  // Concrete tables use cols 0..5; the excavation table uses cols 0..6.
  const widths = [10, 18, 12, 14, 34, 16, 16]
  const lastCol = widths.length - 1
  const cells: GridCell[] = []
  const merges: GridMerge[] = []
  const rowHeightsPt: Array<number | null> = []
  const images: DetailGrid['images'] = []
  const totalRefs = new Map<string, GuideWallTotalCell>()
  const gridPx = widths.reduce((a, w) => a + w * 7, 0)
  let r = 0

  const setH = (row: number, pt: number): void => {
    while (rowHeightsPt.length <= row) rowHeightsPt.push(null)
    rowHeightsPt[row] = pt
  }
  const heading = (text: string, size = 13): void => {
    cells.push({ r, c: 0, value: text, style: { bold: true, sizePt: size } })
    merges.push({ r1: r, c1: 0, r2: r, c2: lastCol })
    setH(r, 20)
    r += 1
  }

  // Banner (Typst section banner).
  cells.push({ r, c: 0, value: 'DETAILED ESTIMATE', style: { bold: true, sizePt: 9, colorRgb: '3B6B88' } })
  merges.push({ r1: r, c1: 0, r2: r, c2: lastCol })
  setH(r, 14)
  r += 1
  cells.push({ r, c: 0, value: rd.name ?? '', style: { bold: true, sizePt: 14 } })
  merges.push({ r1: r, c1: 0, r2: r, c2: lastCol })
  setH(r, 22)
  r += 1
  if (rd.code) {
    cells.push({ r, c: 0, value: rd.code, style: { bold: true, bgRgb: 'DBE9F1' } })
    setH(r, 15)
    r += 1
  }
  cells.push({ r, c: 0, value: rd.meta ?? '', style: { colorRgb: '557385' } })
  merges.push({ r1: r, c1: 0, r2: r, c2: lastCol })
  setH(r, 15)
  r += 1

  // 1. Typical cross-sections.
  heading('1. Typical cross-sections')
  for (const fig of rd.figures ?? []) {
    cells.push({ r, c: 0, value: fig.caption ?? '', style: { wrap: true } })
    merges.push({ r1: r, c1: 0, r2: r, c2: lastCol })
    setH(r, 15)
    r += 1
    const png = await rasterizeSvg(fig.svg ?? '', 1000)
    if (png) {
      const drawW = Math.min(gridPx, 1000)
      const drawH = Math.round((png.heightPx * drawW) / Math.max(1, png.widthPx))
      const rows = Math.max(1, Math.round(drawH / 20))
      for (let i = 0; i < rows; i++) setH(r + i, 15)
      images.push({
        r,
        c: 0,
        dataBase64: png.dataBase64,
        mime: 'image/png',
        scaleW: drawW / Math.max(1, png.widthPx),
        scaleH: drawH / Math.max(1, png.heightPx)
      })
      r += rows
    }
  }

  // 2. Concrete quantities (wall + base blocks share the table shape).
  heading('2. Concrete quantities')
  const blocks = [
    ...(rd.wall_groups ?? []).map((group) => ({ role: 'wall' as const, group })),
    ...(rd.base_groups ?? []).map((group) => ({ role: 'base' as const, group }))
  ]
  for (const { role, group } of blocks) {
    cells.push({ r, c: 0, value: `${group.heading ?? ''}${group.unit ? ` — Unit: ${group.unit}` : ''}`, style: { bold: true, sizePt: 11, wrap: true } })
    merges.push({ r1: r, c1: 0, r2: r, c2: lastCol })
    setH(r, 18)
    r += 1
    if (group.description || group.descriptionRuns?.length) {
      cells.push(descriptionCell(r, group.description, group.descriptionRuns))
      merges.push({ r1: r, c1: 0, r2: r, c2: lastCol })
      setH(r, 15)
      r += 1
    }
    const heads = ['S.No', 'Chainage', 'Side', 'Length', 'Calculation', 'Qty (cum)']
    heads.forEach((head, c) => {
      cells.push({ r, c, value: head, style: { bold: true, align: 'center' } })
    })
    setH(r, 15)
    r += 1
    const firstQty = r
    for (const row of group.rows ?? []) {
      cells.push({ r, c: 0, value: row.sl ?? '', style: { align: 'center' } })
      cells.push({ r, c: 1, value: `Ch ${row.chainage ?? ''}` })
      cells.push({ r, c: 2, value: row.side ?? '', style: { align: 'center' } })
      cells.push(numCell(r, 3, row.length))
      cells.push({ r, c: 4, value: row.formula ?? '', style: { wrap: true } })
      const factor = row.quantityFactor
      if (typeof factor === 'number' && Number.isFinite(factor)) {
        const excel = r + 1
        cells.push({ r, c: 5, formula: `=D${excel}*${Number(factor.toPrecision(12))}`, numFmt: QTY_FMT })
      } else {
        cells.push(numCell(r, 5, row.qty))
      }
      setH(r, 15)
      r += 1
    }
    cells.push({ r, c: 0, value: 'Total', style: { bold: true, align: 'right' } })
    merges.push({ r1: r, c1: 0, r2: r, c2: 4 })
    const qtyLetter = columnLabel(5)
    if ((group.rows ?? []).length > 0) {
      cells.push({
        r,
        c: 5,
        formula: `=SUM(${qtyLetter}${firstQty + 1}:${qtyLetter}${r})`,
        style: { bold: true },
        numFmt: QTY_FMT
      })
    } else {
      cells.push(numCell(r, 5, group.total, true))
    }
    totalRefs.set(guideWallTotalKey(role, group.code ?? ''), { r, c: 5 })
    setH(r, 16)
    r += 1
  }

  // 3. Excavation.
  const excavation = rd.excavation
  if (excavation && (excavation.rows ?? []).length > 0) {
    heading('3. Excavation')
    cells.push({ r, c: 0, value: `${excavation.heading ?? ''}${excavation.unit ? ` — Unit: ${excavation.unit}` : ''}`, style: { bold: true, sizePt: 11, wrap: true } })
    merges.push({ r1: r, c1: 0, r2: r, c2: lastCol })
    setH(r, 18)
    r += 1
    if (excavation.description || excavation.descriptionRuns?.length) {
      cells.push(descriptionCell(r, excavation.description, excavation.descriptionRuns))
      merges.push({ r1: r, c1: 0, r2: r, c2: lastCol })
      setH(r, 15)
      r += 1
    }
    const excHeads = ['S.No', 'From Ch', 'To Ch', 'L (m)', 'B (m)', 'H (m)', 'Qty (cum)']
    excHeads.forEach((head, c) => {
      cells.push({ r, c, value: head, style: { bold: true, align: 'center' } })
    })
    setH(r, 15)
    r += 1
    const firstQty = r
    for (const row of excavation.rows) {
      cells.push({ r, c: 0, value: row.sl ?? '', style: { align: 'center' } })
      cells.push({ r, c: 1, value: row.fromCh ?? '' })
      cells.push({ r, c: 2, value: row.toCh ?? '' })
      cells.push(numCell(r, 3, row.length))
      cells.push(numCell(r, 4, row.breadth))
      cells.push(numCell(r, 5, row.height))
      const l = parseNum(row.length)
      const b = parseNum(row.breadth)
      const h = parseNum(row.height)
      if (l != null && b != null && h != null) {
        const excel = r + 1
        cells.push({ r, c: 6, formula: `=D${excel}*E${excel}*F${excel}`, numFmt: QTY_FMT })
      } else {
        cells.push(numCell(r, 6, row.qty))
      }
      setH(r, 15)
      r += 1
    }
    cells.push({ r, c: 0, value: 'Total', style: { bold: true, align: 'right' } })
    merges.push({ r1: r, c1: 0, r2: r, c2: 5 })
    cells.push({
      r,
      c: 6,
      formula: `=SUM(${columnLabel(6)}${firstQty + 1}:${columnLabel(6)}${r})`,
      style: { bold: true },
      numFmt: QTY_FMT
    })
    totalRefs.set(guideWallTotalKey('excavation', excavation.code ?? ''), { r, c: 6 })
    setH(r, 16)
    r += 1
  }

  return {
    grid: {
      cells,
      merges,
      colWidthsChars: widths,
      rowHeightsPt,
      images,
      rowBreaks: [],
      pageSetup: {
        paperSize: rd.document_settings?.pageSize,
        marginsMm: rd.document_settings?.margins
      }
    },
    totalRefs
  }
}

export async function buildGuideWallSheet(rd: GuideWallRenderData): Promise<DetailGrid> {
  return (await buildGuideWallSheetPlan(rd)).grid
}

export async function prepareGuideWallExcelPlan(
  rd: GuideWallRenderData,
  sheetName = 'Guide Wall'
): Promise<GuideWallExcelPlan> {
  const built = await buildGuideWallSheetPlan(rd)
  return {
    sheets: [{
      name: sanitizeSheetName(sheetName),
      grid: built.grid,
      landscape: rd.document_settings?.orientation === 'landscape'
    }],
    totalRefs: built.totalRefs
  }
}

export async function prepareGuideWallSheets(rd: GuideWallRenderData): Promise<GuideWallSheetPayload[]> {
  return (await prepareGuideWallExcelPlan(rd)).sheets
}

/** Stable and collision-resistant within a project workbook (31-char XLSX limit). */
export function projectGuideWallSheetName(componentName: string, componentId: string): string {
  const suffix = componentId.replace(/[^a-zA-Z0-9]/g, '').slice(-6) || 'sheet'
  return sanitizeSheetName(`GuideWall_${componentName.slice(0, 14)}_${suffix}`)
}

export function guideWallExcelFileName(projectName: string, componentName: string): string {
  const clean = (value: string): string => value.replace(/[\\/:*?"<>|]/g, '').trim() || 'Estimate'
  return `${clean(projectName)} — ${clean(componentName)} — Guide Wall.xlsx`
}
