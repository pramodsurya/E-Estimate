/**
 * Per-component Excel detail preparation, shared by the Component Dashboard
 * export and the Project Dashboard export.
 *
 * Index-aligned with the abstract direct rows (same direct-items walk in the
 * same order; null = no detail sheet for that row). The estimator's set
 * print area wins over the used range. Every non-template custom item must
 * expose an exact fixed final quantity; export fails rather than silently
 * freezing a calculated quantity or guessing a cell.
 */
import { buildComponentRenderData, directComponentItems, type ComponentRenderData } from '../typist-output/componentTypst'
import {
  buildComponentDetailedSheet,
  buildComponentDetailSheets,
  resolveDetailedHeaders,
  type ComponentDetailedSheet,
  type ComponentDetailSheet,
  type DetailedItemHeader,
  type PreparedDetailInput
} from './componentExcel'
import { columnLabel, toRangeLike, type SheetSnapshotInput, type UnivCell, type UnivStyle } from './detailGrid'
import { measureMediaImages } from './pageExcel'
import { sortScheduleItems } from '../itemOrder'
import { createUniverWorkbookData, usedCellRange } from '../univerSpreadsheet'
import { extractItemMedia } from '../typist-output/itemTypst'
import { extractDocumentMedia, parseDocumentToTypstData } from '../typist-output/documentTypst'
import { resolveItemDescriptionRuns } from '../typist-output/itemTypst'
import { resolveDocumentFinal } from '../documentFinal'
import { resolveNodeSettings } from '../nodeSettings'
import { nodeDisplayName } from '../../components/nodeVisual'
import type { EestimateProject, ProjectNode } from '../../types/project'
import type { RateAnalysisRecipe } from '../../types/rateAnalysis'

export interface PreparedComponentExcel {
  renderData: ComponentRenderData
  /** Direct item nodes in abstract order (index-aligned with details). */
  directNodes: ProjectNode[]
  headers: DetailedItemHeader[]
  details: Array<ComponentDetailSheet | null>
  /** Single Detailed sheet, or null when nothing is printable. */
  detailed: ComponentDetailedSheet | null
}

export async function prepareComponentExcelParts(
  project: EestimateProject,
  section: ProjectNode,
  recipes: Record<string, RateAnalysisRecipe>,
  rateOf: (node: ProjectNode) => number | undefined
): Promise<PreparedComponentExcel> {
  const renderData = buildComponentRenderData(project, section, recipes, rateOf)
  const directNodes = sortScheduleItems(directComponentItems(section))
  const detailInputs: PreparedDetailInput[] = []
  for (const itemNode of directNodes) {
    const hint = itemNode.itemCode || nodeDisplayName(itemNode)
    const settings = resolveNodeSettings(project.root, itemNode.id)
    const landscape = (itemNode.print?.orientation ?? settings.orientation ?? 'portrait') === 'landscape'
    const pageSetup = {
      paperSize: itemNode.print?.pageSize ?? settings.pageSize,
      marginsMm: itemNode.print?.margins ?? settings.margins
    }
    if (itemNode.templateGenerated) {
      detailInputs.push({ kind: null, sheetNameHint: hint })
      continue
    }
    const isDoc = itemNode.itemEditorType === 'document' || itemNode.kind === 'page'
    if (isDoc) {
      const final = resolveDocumentFinal(itemNode)
      if (final.value === null) {
        throw new Error(`Component Excel: item '${hint}' has no fixed final quantity. Use Fix Final Quantity in the document.`)
      }
      if (final.needsRefix) {
        throw new Error(`Component Excel: item '${hint}' final quantity moved or is no longer numeric-only. Use Fix Final Quantity again.`)
      }
      const doc = parseDocumentToTypstData(itemNode.documentData, itemNode.documentPrintArea, itemNode.documentFinal)
      const media = extractDocumentMedia(itemNode)
      detailInputs.push({
        kind: 'document',
        doc,
        images: await measureMediaImages(media.images, media.shadowFiles),
        documentFinal: {
          startIndex: itemNode.documentFinal?.startIndex ?? 0,
          endIndex: itemNode.documentFinal?.endIndex ?? 0,
          value: final.value,
          text: final.currentText ?? itemNode.documentFinal?.capturedText ?? ''
        },
        landscape,
        pageSetup,
        sheetNameHint: hint
      })
      continue
    }
    const snapshot = createUniverWorkbookData(itemNode) as {
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
    // The estimator's set print area wins (mirrors the Typst item sheet);
    // otherwise the used range. Hidden rows/columns zero out so image
    // anchors walk the same geometry the grid exports.
    const range = toRangeLike(itemNode.print?.range) ?? usedCellRange(
      snapshot as Parameters<typeof usedCellRange>[0],
      itemNode.finalCell ?? null
    )
    if (!firstSheet || !range) {
      throw new Error(`Component Excel: item '${hint}' has no printable spreadsheet detail.`)
    }
    const media = extractItemMedia(itemNode, range)
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
    const fc = itemNode.finalCell
    if (!fc) {
      throw new Error(`Component Excel: item '${hint}' has no fixed final quantity. Use Fix Final № in the spreadsheet.`)
    }
    const fcInRange = Boolean(
      fc.row >= range.startRow && fc.row <= range.endRow
        && fc.column >= range.startColumn && fc.column <= range.endColumn
    )
    if (!fcInRange) {
      throw new Error(
        `Component Excel: item '${hint}' fixed final cell ${columnLabel(fc.column)}${fc.row + 1} is outside its print area.`
      )
    }
    const qtyRef = { r: fc.row - range.startRow, c: fc.column - range.startColumn }
    const sheetInput: SheetSnapshotInput = {
      cellData: firstSheet.cellData,
      mergeData: firstSheet.mergeData,
      styles: snapshot.styles,
      rowData: firstSheet.rowData,
      columnData: firstSheet.columnData,
      defaultColW: defW,
      defaultRowH: defH
    }
    detailInputs.push({
      kind: 'sheet',
      sheet: sheetInput,
      range,
      images: await measureMediaImages(media.images, media.shadowFiles),
      colWidthsPx,
      rowHeightsPx,
      qtyRef,
      landscape,
      pageSetup,
      sheetNameHint: hint
    })
  }
  const details = buildComponentDetailSheets(detailInputs)
  details.forEach((detail, i) => {
    const node = directNodes[i]
    if (!detail || node?.templateGenerated || node?.itemEditorType === 'document' || node?.kind === 'page') return
    const fc = node.finalCell
    if (!fc) return
    const addr = `${columnLabel(fc.column)}${fc.row + 1}`
    const rejected = detail.formulaVerdicts.find((verdict) => verdict.addr === addr && !verdict.ok)
    if (rejected) {
      throw new Error(
        `Component Excel: item '${node.itemCode || nodeDisplayName(node)}' final quantity formula at ${addr} cannot be exported: ${rejected.reason}.`
      )
    }
  })
  // Single Detailed sheet in Typst item order (null = no printable detail
  // anywhere, keeps the legacy sheets). Header facts prefer the node, then
  // fall back to the Abstract's own direct rows — recipe items often carry
  // code/description only there, and the Abstract is what the estimator sees.
  const directAbstract = renderData.abstract.filter((row) => !row.sl.startsWith('S'))
  const headers = resolveDetailedHeaders(directNodes.map((itemNode, i) => ({
    itemCode: itemNode.itemCode,
    displayName: nodeDisplayName(itemNode),
    unit: itemNode.unit,
    itemDescription: itemNode.itemDescription,
    descriptionRuns: resolveItemDescriptionRuns(project, itemNode).map((run) => ({
      text: run.text,
      style: {
        bold: run.bold || undefined,
        italic: run.italic || undefined,
        underline: run.underline || undefined,
        sizePt: 10,
        fontName: 'Trebuchet MS'
      }
    })),
    abstractCode: directAbstract[i]?.code,
    abstractHeading: directAbstract[i]?.heading,
    abstractUnit: directAbstract[i]?.unit,
    abstractDescription: directAbstract[i]?.description
  })))
  const detailed = buildComponentDetailedSheet(
    renderData.component.name,
    headers,
    details
  )
  if (detailed) {
    const settings = resolveNodeSettings(project.root, section.id)
    detailed.grid.pageSetup = { paperSize: settings.pageSize, marginsMm: settings.margins }
  }
  return { renderData, directNodes, headers, details, detailed }
}
