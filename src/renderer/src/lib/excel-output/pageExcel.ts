/**
 * Introduction / item-sheet page Excel payload — native rust_xlsxwriter path.
 *
 * Mirrors the Typst item-sheet algorithm (`buildItemSheetRenderData` in
 * `../typist-output/itemTypst.ts`): the same identity header (code/item,
 * unit and rich description), the same detail (spreadsheet as
 * a live cell grid via the formula teacher, document as styled text/tables)
 * and the same signature footer. The header and signatures are prepended /
 * appended as grid rows so the Rust side renders one sheet with one call.
 * Images are measured here (DOM) and anchored in the grid builder.
 */
import type { EestimateProject, ProjectNode } from '../../types/project'
import { nodeDisplayName } from '../../components/nodeVisual'
import { createUniverWorkbookData, usedCellRange } from '../univerSpreadsheet'
import {
  buildItemSheetRenderData,
  extractItemMedia,
  type ItemMediaItem
} from '../typist-output/itemTypst'
import {
  extractDocumentMedia,
  parseDocumentToTypstData
} from '../typist-output/documentTypst'
import {
  measureImageDimensions,
  splitDataUrl,
  toRangeLike,
  type DetailGrid,
  type GridCell,
  type GridImageInput,
  type SheetSnapshotInput,
  type UnivCell,
  type UnivStyle
} from './detailGrid'
import { buildComponentDetailSheets, type ComponentDetailSheet, type PreparedDetailInput } from './componentExcel'
import { findNode } from '../tree'
import { sanitizeSheetName } from './detailGrid'
import { excelPrintSettings, resolveExcelDocumentSettings } from './excelDocumentSettings'
import { itemSheetScopeKey } from '../typist-output/itemTypst'

export interface PageExcelPayload {
  name: string
  grid: DetailGrid
  landscape: boolean
}

/**
 * Shared image measurer (DOM decode for true pixel size). Referenced images
 * fail loudly when their bytes or dimensions cannot be resolved. Also used by
 * the component dashboard — single source, not a copy.
 */
export async function measureMediaImages(
  images: ItemMediaItem[],
  shadowFiles: Record<string, string>
): Promise<GridImageInput[]> {
  const out: GridImageInput[] = []
  for (const img of images) {
    const direct = img.previewUrl ? splitDataUrl(img.previewUrl) : null
    const stored = !direct && shadowFiles[img.path] ? splitDataUrl(shadowFiles[img.path], 'image/png') : null
    const parts = direct ?? stored
    if (!parts) {
      throw new Error(`Excel export could not resolve image '${img.path || img.previewUrl || 'unnamed image'}'.`)
    }
    const dims = await measureImageDimensions(`data:${parts.mime};base64,${parts.dataBase64}`)
    if (!dims) {
      throw new Error(`Excel export could not decode image '${img.path || img.previewUrl || 'unnamed image'}'.`)
    }
    out.push({
      relLeftPx: img.relLeftPx ?? img.left ?? 0,
      relTopPx: img.relTopPx ?? img.top ?? 0,
      widthPx: img.width,
      heightPx: img.height,
      origWPx: dims.w,
      origHPx: dims.h,
      dataBase64: parts.dataBase64,
      mime: parts.mime
    })
  }
  return out
}

/**
 * Prepare the single detail input for a page node. Same fork as the Typst
 * item-sheet data (`buildItemSheetRenderData`): document-kind pages parse
 * the document, spreadsheet pages snapshot the first sheet's used range.
 */
export async function preparePageDetailInput(
  node: ProjectNode
): Promise<PreparedDetailInput> {
  const hint = nodeDisplayName(node)
  const isDoc = node.itemEditorType === 'document' || node.kind === 'page'
  if (isDoc) {
    const doc = parseDocumentToTypstData(node.documentData, node.documentPrintArea, node.documentFinal)
    const media = extractDocumentMedia(node)
    return {
      kind: 'document',
      doc,
      images: await measureMediaImages(media.images, media.shadowFiles),
      sheetNameHint: hint
    }
  }
  const snapshot = createUniverWorkbookData(node) as {
    sheetOrder?: string[]
    sheets?: Record<string, {
      cellData?: Record<string, Record<string, UnivCell>>
      mergeData?: Array<{ startRow: number; startColumn: number; endRow: number; endColumn: number }>
      rowData?: Record<string, { h?: number; hd?: number }>
      columnData?: Record<string, { w?: number; hd?: number }>
      defaultColumnWidth?: number
      defaultRowHeight?: number
    }>
    styles?: Record<string, UnivStyle>
  }
  const sheets = snapshot.sheets ?? {}
  const firstSheet = sheets[snapshot.sheetOrder?.[0] ?? ''] ?? Object.values(sheets)[0]
  // The estimator's set print area wins (mirrors the Typst item sheet).
  const range = toRangeLike(node.print?.range) ?? usedCellRange(
    snapshot as Parameters<typeof usedCellRange>[0],
    node.finalCell ?? null
  )
  if (!firstSheet || !range) return { kind: null, sheetNameHint: hint }
  const media = extractItemMedia(node, range)
  const defW = firstSheet.defaultColumnWidth ?? 88
  const defH = firstSheet.defaultRowHeight ?? 24
  const colWidthsPx: number[] = []
  for (let c = range.startColumn; c <= range.endColumn; c++) {
    colWidthsPx.push(firstSheet.columnData?.[String(c)]?.hd === 1 ? 0 : firstSheet.columnData?.[String(c)]?.w ?? defW)
  }
  const rowHeightsPx: number[] = []
  for (let r = range.startRow; r <= range.endRow; r++) {
    rowHeightsPx.push(firstSheet.rowData?.[String(r)]?.hd === 1 ? 0 : firstSheet.rowData?.[String(r)]?.h ?? defH)
  }
  const sheetInput: SheetSnapshotInput = {
    cellData: firstSheet.cellData,
    mergeData: firstSheet.mergeData,
    styles: snapshot.styles,
    rowData: firstSheet.rowData,
    columnData: firstSheet.columnData,
    defaultColW: defW,
    defaultRowH: defH
  }
  return {
    kind: 'sheet',
    sheet: sheetInput,
    range,
    images: await measureMediaImages(media.images, media.shadowFiles),
    colWidthsPx,
    rowHeightsPx,
    qtyRef: null,
    sheetNameHint: hint
  }
}

function shiftGrid(grid: DetailGrid, rows: number): DetailGrid {
  return {
    cells: grid.cells.map((c) => ({ ...c, r: c.r + rows })),
    merges: grid.merges.map((m) => ({ ...m, r1: m.r1 + rows, r2: m.r2 + rows })),
    colWidthsChars: grid.colWidthsChars,
    rowHeightsPt: grid.rowHeightsPt,
    images: grid.images.map((i) => ({ ...i, r: i.r + rows })),
    rowBreaks: grid.rowBreaks.map((b) => b + rows)
  }
}

/**
 * Build the page payload: identity header rows, then the detail grid, then
 * one signature row per signatory. Header strings come from
 * `buildItemSheetRenderData`, so the Excel header reads exactly what the
 * Typst studio shows. Null detail (nothing printable) yields null — the
 * caller fails loudly, never an empty workbook.
 */
export function buildPageExcelPayload(
  project: EestimateProject,
  node: ProjectNode,
  detail: ComponentDetailSheet | null,
  nameOverride?: string
): PageExcelPayload | null {
  if (!detail) return null
  const renderData = buildItemSheetRenderData(project, node)
  const width = Math.max(1, detail.grid.colWidthsChars.length)
  const lastCol = width - 1
  const title = renderData.code && !renderData.item.startsWith(renderData.code)
    ? `${renderData.code} — ${renderData.item}`
    : renderData.item
  const hasDescription = Boolean(renderData.description && renderData.description !== renderData.item)
  const header: GridCell[] = [
    { r: 0, c: 0, value: title, style: { bold: true, sizePt: 14 } }
  ]
  const headerMerges: DetailGrid['merges'] = []
  if (lastCol > 0) {
    if (lastCol > 1) headerMerges.push({ r1: 0, c1: 0, r2: 0, c2: lastCol - 1 })
    header.push({ r: 0, c: lastCol, value: renderData.unit ? `Unit: ${renderData.unit}` : '', style: { align: 'right' } })
  } else if (renderData.unit) {
    header[0]!.value = `${title}    Unit: ${renderData.unit}`
  }
  let detailOffset = 2
  if (hasDescription) {
    const rich = (renderData.descriptionRuns ?? []).filter((run) => run.text)
    header.push(rich.length
      ? {
          r: 1,
          c: 0,
          style: { wrap: true },
          runs: rich.map((run) => ({
            text: run.text,
            style: { bold: run.bold, italic: run.italic, underline: run.underline }
          }))
        }
      : { r: 1, c: 0, value: renderData.description, style: { wrap: true } })
    if (lastCol > 0) headerMerges.push({ r1: 1, c1: 0, r2: 1, c2: lastCol })
    detailOffset = 3
  }
  const shifted = shiftGrid(detail.grid, detailOffset)
  const contentMax = Math.max(
    detailOffset - 1,
    ...shifted.cells.map((c) => c.r),
    ...shifted.merges.map((m) => m.r2),
    ...shifted.images.map((i) => i.r)
  )
  const sigStart = contentMax + 3
  const sigCells: GridCell[] = []
  const sigMerges: DetailGrid['merges'] = []
  const signatureGroups = renderData.signature.length > width
    ? Array.from({ length: width }, (_, column) => ({
        column,
        signatures: renderData.signature.filter((_, index) => index % width === column)
      })).filter((group) => group.signatures.length)
    : renderData.signature.map((signature, index) => ({
        column: Math.floor(index * width / renderData.signature.length),
        signatures: [signature]
      }))
  signatureGroups.forEach((group, i) => {
    const c1 = group.column
    const c2 = renderData.signature.length > width
      ? c1
      : Math.max(c1, Math.floor((i + 1) * width / signatureGroups.length) - 1)
    sigCells.push({
      r: sigStart,
      c: c1,
      value: group.signatures
        .map((sig) => sig.office ? `${sig.designation} — ${sig.office}` : sig.designation)
        .join('     '),
      style: { bold: true, align: 'center', wrap: true },
      border: { top: { style: 'thin', colorRgb: '273B47' } }
    })
    if (c2 > c1) sigMerges.push({ r1: sigStart, c1, r2: sigStart, c2 })
  })
  const rowHeightsPt: Array<number | null> = [22]
  if (hasDescription) rowHeightsPt.push(null)
  rowHeightsPt.push(8, ...detail.grid.rowHeightsPt)
  while (rowHeightsPt.length <= sigStart) rowHeightsPt.push(null)
  if (renderData.signature.length) rowHeightsPt[sigStart] = 34
  return {
    name: nameOverride ?? detail.name,
    landscape: renderData.setup.flipped,
    grid: {
      cells: [...header, ...shifted.cells, ...sigCells],
      merges: [...headerMerges, ...shifted.merges, ...sigMerges],
      colWidthsChars: detail.grid.colWidthsChars,
      rowHeightsPt,
      images: shifted.images,
      rowBreaks: shifted.rowBreaks,
      pageSetup: {
        paperSize: renderData.setup.paper === 'a2'
          ? 'A2'
          : renderData.setup.paper === 'a3'
            ? 'A3'
            : renderData.setup.paper === 'us-letter'
              ? 'Letter'
              : renderData.setup.paper === 'us-legal'
                ? 'Legal'
                : 'A4',
        marginsMm: {
          top: renderData.setup.marginTop,
          right: renderData.setup.marginRight,
          bottom: renderData.setup.marginBottom,
          left: renderData.setup.marginLeft
        }
      }
    }
  }
}

export function pageExcelFileName(projectName: string, pageName: string): string {
  const clean = (value: string): string => value.replace(/[\\/:*?"<>|]/g, '').trim() || 'Estimate'
  return `${clean(projectName)} — ${clean(pageName)}.xlsx`
}

/** Stable project-book tab name; the node suffix prevents equal page titles colliding. */
export function projectPageSheetName(node: ProjectNode): string {
  const suffix = `_P${node.id.replace(/[^A-Za-z0-9]/g, '').slice(-6) || 'page'}`
  const base = sanitizeSheetName(`Page_${nodeDisplayName(node)}`)
  return `${base.slice(0, Math.max(1, 31 - suffix.length))}${suffix}`
}

/** Shared standalone/project preparation path for one explicit page node. */
export async function preparePageExcelPayload(
  project: EestimateProject,
  node: ProjectNode,
  nameOverride?: string
): Promise<PageExcelPayload | null> {
  const details = buildComponentDetailSheets([await preparePageDetailInput(node)])
  return buildPageExcelPayload(project, node, details[0] ?? null, nameOverride)
}

/**
 * Export one page/item node through the `page` workbook: fresh tree lookup,
 * detail prep, payload, compile, save. Shared by the Introduction studio and
 * the item sheet/document studios — one source, loud failures, no fallback.
 */
export async function exportItemNodeExcel(project: EestimateProject, node: ProjectNode): Promise<void> {
  const section = findNode(project.root, node.id) ?? node
  const payload = await preparePageExcelPayload(project, section)
  if (!payload) throw new Error('This item has no printable content to export.')
  const result = await window.api.excel.compile({
    kind: 'page', preferPath: true, page: payload,
    printSettings: excelPrintSettings(resolveExcelDocumentSettings(project, itemSheetScopeKey(section), section))
  })
  if (!result || !result.ok || !result.filePath) {
    throw new Error(result?.error || 'Excel engine did not return a workbook path.')
  }
  if (typeof window.api.export.workbook !== 'function') {
    throw new Error('Excel export channel is unavailable.')
  }
  await window.api.export.workbook(
    '',
    pageExcelFileName(project.meta.name, section.name),
    undefined,
    { sourcePath: result.filePath }
  )
}
