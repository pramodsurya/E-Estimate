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
import { findItemByCode, findItemById } from '../itemCellRef'
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
  flattenSheet,
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
import { findSharedContentSource, findSharedOwner, findSharedPrintSource } from '../sharedSheet'
import { sanitizeSheetName } from './detailGrid'
import { resolveColWidthPx, resolveRowHeightPx } from './univerResolve'
import { excelPrintSettings, resolveItemExcelDocumentSettings } from './excelDocumentSettings'
import { itemSheetScopeKey } from '../typist-output/itemTypst'

export interface PageExcelPayload {
  name: string
  grid: DetailGrid
  landscape: boolean
  /**
   * Referenced item sheets, exported as extra tabs at natural coordinates so
   * rewritten `ITEMCELL("CODE","C18")` formulas resolve natively as
   * `'Tab'!C18`. Absent when the sheet references nothing.
   */
  extraSheets?: Array<{ name: string; grid: DetailGrid }>
}

/**
 * Item codes referenced via `ITEMCELL("CODE",...)` in a sheet snapshot's
 * formula cells (first sheet). Codes are string literals by construction.
 */
export function collectItemCellCodes(snapshot: {
  sheetOrder?: string[]
  sheets?: Record<string, { cellData?: Record<string, Record<string, UnivCell>> }>
}): string[] {
  const sheets = snapshot.sheets ?? {}
  const first = sheets[snapshot.sheetOrder?.[0] ?? ''] ?? Object.values(sheets)[0]
  const cells = first?.cellData ?? {}
  const seen = new Set<string>()
  const out: string[] = []
  const call = /ITEMCELL\s*\(\s*"((?:[^"]|"")+)"\s*,\s*"(?:[^"]|"")+"\s*(?:,\s*"((?:[^"]|"")+)"\s*)?\)/gi
  for (const row of Object.values(cells)) {
    for (const cell of Object.values(row ?? {})) {
      if (typeof cell?.f !== 'string') continue
      for (;;) {
        const m = call.exec(cell.f)
        if (!m) break
        const code = m[2] ? `id:${m[2].replace(/""/g, '"')}` : m[1].replace(/""/g, '"').trim()
        if (code && !seen.has(code.toLowerCase())) {
          seen.add(code.toLowerCase())
          out.push(code)
        }
      }
    }
  }
  return out
}

/**
 * Builds one raw extra tab per referenced item: the source grid flattened
 * from A1 to its used end at natural coordinates (no header rows, no
 * rebase), so `'Tab'!C18` in the main sheet lands on the source's C18.
 * Unresolvable or empty sources are skipped — their formulas keep the
 * cached-value fallback.
 */
export function buildItemCellExtraSheets(
  project: EestimateProject,
  node: ProjectNode,
  reservedNames: string[]
): { tabs: Map<string, string>; sheets: Array<{ name: string; grid: DetailGrid }> } {
  const empty = { tabs: new Map<string, string>(), sheets: [] as Array<{ name: string; grid: DetailGrid }> }
  if (node.itemEditorType === 'document' || node.kind === 'page') return empty
  const snapshot = createUniverWorkbookData(node) as Parameters<typeof collectItemCellCodes>[0] & {
    styles?: Record<string, UnivStyle>
    defaultStyle?: UnivStyle | string | null
  }
  const codes = collectItemCellCodes(snapshot)
  if (!codes.length) return empty
  interface ResolvedSource {
    code: string
    tab: string
    source: ProjectNode
    snapshot: {
      sheetOrder?: string[]
      sheets?: Record<string, {
        cellData?: Record<string, Record<string, UnivCell>>
        mergeData?: Array<{ startRow: number; startColumn: number; endRow: number; endColumn: number }>
        rowData?: Record<string, { h?: number; ia?: number; ah?: number; hd?: number; s?: UnivStyle | string | null }>
        columnData?: Record<string, { w?: number; hd?: number; s?: UnivStyle | string | null }>
        defaultColumnWidth?: number
        defaultRowHeight?: number
        defaultStyle?: UnivStyle | string | null
      }>
      styles?: Record<string, UnivStyle>
    defaultStyle?: UnivStyle | string | null
    }
    used: { endRow: number; endColumn: number }
  }
  // Pass 1: resolve sources and fix tab names, so nested references rewrite
  // regardless of processing order.
  const taken = new Set(reservedNames.map((name) => name.toLowerCase()))
  const tabs = new Map<string, string>()
  const resolved: ResolvedSource[] = []
  for (const code of codes) {
    const source = code.startsWith('id:')
      ? findItemById(project.root, code.slice(3))
      : findItemByCode(project.root, code)
    if (!source || source.itemEditorType === 'document') continue
    const sourceSnap = createUniverWorkbookData(source) as ResolvedSource['snapshot']
    const used = usedCellRange(
      sourceSnap as Parameters<typeof usedCellRange>[0],
      source.finalCell ?? null
    )
    if (!used) continue
    // Tab names must be Excel-safe: quotes would break formula quoting.
    let base = sanitizeSheetName(source.itemCode || source.name).replace(/["']/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Sheet'
    if (taken.has(base.toLowerCase())) {
      let n = 2
      while (taken.has(`${base.slice(0, 28)}_${n}`.toLowerCase())) n += 1
      base = `${base.slice(0, 28)}_${n}`
    }
    taken.add(base.toLowerCase())
    tabs.set(code.toUpperCase(), base)
    resolved.push({ code, tab: base, source, snapshot: sourceSnap, used })
  }
  // Pass 2: flatten each tab (nested ITEMCELL calls resolve via the full map).
  const sheets: Array<{ name: string; grid: DetailGrid }> = []
  for (const entry of resolved) {
    const sourceSheets = entry.snapshot.sheets ?? {}
    const first =
      sourceSheets[entry.snapshot.sheetOrder?.[0] ?? ''] ?? Object.values(sourceSheets)[0]
    if (!first) continue
    const grid = flattenSheet(
      {
        cellData: first.cellData,
        mergeData: first.mergeData,
        styles: entry.snapshot.styles,
        rowData: first.rowData,
        columnData: first.columnData,
        defaultColW: first.defaultColumnWidth ?? 88,
        defaultRowH: first.defaultRowHeight ?? 24,
        // Worksheet default wins; the workbook default applies when the
        // sheet carries none (both exist in the installed typedefs).
        defaultStyle: first.defaultStyle ?? entry.snapshot.defaultStyle ?? null
      },
      { startRow: 0, startColumn: 0, endRow: entry.used.endRow, endColumn: entry.used.endColumn },
      { sheetName: entry.tab, itemCellTabs: tabs }
    )
    sheets.push({ name: entry.tab, grid })
  }
  return { tabs, sheets }
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
      rowData?: Record<string, { h?: number; ia?: number; ah?: number; hd?: number; s?: UnivStyle | string | null }>
      columnData?: Record<string, { w?: number; hd?: number; s?: UnivStyle | string | null }>
      defaultColumnWidth?: number
      defaultRowHeight?: number
      defaultStyle?: UnivStyle | string | null
    }>
    styles?: Record<string, UnivStyle>
    defaultStyle?: UnivStyle | string | null
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
  const defW = firstSheet.defaultColumnWidth && firstSheet.defaultColumnWidth > 0 ? firstSheet.defaultColumnWidth : 88
  const defH = firstSheet.defaultRowHeight && firstSheet.defaultRowHeight > 0 ? firstSheet.defaultRowHeight : 24
  // Anchor geometry uses the same resolved heights/widths as the grid
  // (ia/ah-aware via the shared resolver), never h-or-default alone.
  const colWidthsPx: number[] = []
  for (let c = range.startColumn; c <= range.endColumn; c++) {
    const datum = firstSheet.columnData?.[String(c)]
    colWidthsPx.push(datum?.hd === 1 ? 0 : resolveColWidthPx(datum, defW))
  }
  const rowHeightsPx: number[] = []
  for (let r = range.startRow; r <= range.endRow; r++) {
    const datum = firstSheet.rowData?.[String(r)]
    rowHeightsPx.push(datum?.hd === 1 ? 0 : resolveRowHeightPx(datum, defH))
  }
  const sheetInput: SheetSnapshotInput = {
    cellData: firstSheet.cellData,
    mergeData: firstSheet.mergeData,
    styles: snapshot.styles,
    rowData: firstSheet.rowData,
    columnData: firstSheet.columnData,
    defaultColW: defW,
    defaultRowH: defH,
    // Worksheet default wins; the workbook default applies when the sheet
    // carries none (both exist in the installed typedefs).
    defaultStyle: firstSheet.defaultStyle ?? snapshot.defaultStyle ?? null
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
    ...(grid.colWidthsPx ? { colWidthsPx: grid.colWidthsPx } : {}),
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
  nameOverride?: string,
  extraSheets?: Array<{ name: string; grid: DetailGrid }>
): PageExcelPayload | null {
  if (!detail) return null
  const renderData = buildItemSheetRenderData(project, node)
  if (node.sharedSheetId && node.itemEditorType !== 'document') {
    return {
      name: nameOverride ?? sanitizeSheetName(node.sharedSheetName || 'Shared sheet'),
      landscape: renderData.setup.flipped,
      ...(extraSheets?.length ? { extraSheets } : {}),
      grid: {
        ...detail.grid,
        pageSetup: {
          paperSize: renderData.setup.paper === 'a2' ? 'A2'
            : renderData.setup.paper === 'a3' ? 'A3'
              : renderData.setup.paper === 'us-letter' ? 'Letter'
                : renderData.setup.paper === 'us-legal' ? 'Legal' : 'A4',
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
    ...(extraSheets?.length ? { extraSheets } : {}),
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

export function projectSharedSheetName(node: ProjectNode): string {
  const suffix = `_S${(node.sharedSheetId || node.id).replace(/[^A-Za-z0-9]/g, '').slice(-6) || 'sheet'}`
  const base = sanitizeSheetName(node.sharedSheetName || 'Shared sheet')
  return `${base.slice(0, Math.max(1, 31 - suffix.length))}${suffix}`
}

/** Shared standalone/project preparation path for one explicit page node. */
export async function preparePageExcelPayload(
  project: EestimateProject,
  node: ProjectNode,
  nameOverride?: string
): Promise<PageExcelPayload | null> {
  const owner = node.sharedSheetId ? findSharedOwner(project.root, node.sharedSheetId) ?? node : node
  const source = node.sharedSheetId ? findSharedContentSource(project.root, node.sharedSheetId) ?? owner : owner
  const printSource = node.sharedSheetId ? findSharedPrintSource(project.root, node.sharedSheetId) ?? owner : owner
  const sheetNode = node.sharedSheetId
    ? { ...owner, spreadsheet: source.spreadsheet, print: printSource.print, finalCell: undefined }
    : node
  // The main tab name is deterministic (first detail input), so reserve it
  // before naming the referenced tabs it may point at.
  const mainName = sanitizeSheetName(sheetNode.sharedSheetName || nodeDisplayName(sheetNode) || 'Detail')
  const extras = buildItemCellExtraSheets(project, sheetNode, [mainName, nameOverride ?? mainName])
  const details = buildComponentDetailSheets([await preparePageDetailInput(sheetNode)], {
    itemCellTabs: extras.tabs
  })
  const detail = details[0] ?? null
  return buildPageExcelPayload(project, sheetNode, detail, nameOverride, extras.sheets)
}

/**
 * Export one page/item node through the `page` workbook: fresh tree lookup,
 * detail prep, payload, compile, save. Shared by the Introduction studio and
 * the item sheet/document studios — one source, loud failures, no fallback.
 */
export async function exportItemNodeExcel(project: EestimateProject, node: ProjectNode): Promise<void> {
  const section = findNode(project.root, node.id) ?? node
  const sheet = section.sharedSheetId ? findSharedOwner(project.root, section.sharedSheetId) ?? section : section
  const payload = await preparePageExcelPayload(project, sheet)
  if (!payload) throw new Error('This item has no printable content to export.')
  const result = await window.api.excel.compile({
    kind: 'page', preferPath: true, page: payload,
    printSettings: excelPrintSettings(resolveItemExcelDocumentSettings(project, itemSheetScopeKey(sheet), sheet))
  })
  if (!result || !result.ok || !result.filePath) {
    throw new Error(result?.error || 'Excel engine did not return a workbook path.')
  }
  if (typeof window.api.export.workbook !== 'function') {
    throw new Error('Excel export channel is unavailable.')
  }
  await window.api.export.workbook(
    '',
    pageExcelFileName(project.meta.name, sheet.sharedSheetName || sheet.name),
    undefined,
    { sourcePath: result.filePath }
  )
}
