/** The General Abstract layout shared by standalone and combined workbooks. */
import type { AbstractLine, ProjectAbstract } from '../projectAbstract'
import type { DetailGrid } from './detailGrid'
import type { ProjectSheetPayload } from './projectExcel'
import type { EestimateProject } from '../../types/project'
import { applyGeneratedExcelFont, excelPrintSettings, resolveExcelDocumentSettings } from './excelDocumentSettings'
import { appendSignatureRows, excelSignatureRows } from './excelSignature'

export interface GeneralAbstractExcelRow {
  line: Pick<AbstractLine, 'key' | 'slNo' | 'label' | 'kind' | 'basisNote'>
  /** Standalone uses the calculated value; Project uses a live workbook formula. */
  amount: number | string
  basisPercent?: number
}

export function buildGeneralAbstractExcelSheet(
  projectName: string,
  rows: GeneralAbstractExcelRow[],
  name = 'Gen Abstract'
): ProjectSheetPayload {
  const cells: DetailGrid['cells'] = []
  const rowHeightsPt: DetailGrid['rowHeightsPt'] = [26, 30]
  const body = { sizePt: 10, fontName: 'Trebuchet MS' }
  cells.push({ r: 0, c: 0, value: `${projectName} — General Abstract of Estimate`, style: { ...body, bold: true, sizePt: 14 } })
  ;['S.No', 'Particulars', 'Amount (Rs.)', 'Basis %'].forEach((value, c) => {
    cells.push({ r: 1, c, value, style: { ...body, bold: true, align: 'center', wrap: true } })
  })
  rows.forEach(({ line, amount, basisPercent }, index) => {
    const r = index + 2
    const bold = line.kind === 'total' || line.kind === 'grand'
    if (line.slNo != null) cells.push({ r, c: 0, value: String(line.slNo), style: { ...body, align: 'center' } })
    cells.push({ r, c: 1, value: line.label, style: { ...body, bold, align: bold ? 'right' : 'left', wrap: true } })
    cells.push({
      r, c: 2,
      ...(typeof amount === 'string' ? { formula: amount } : { value: amount }),
      numFmt: '#,##0.00', style: { ...body, bold, align: 'right' }
    })
    if (basisPercent !== undefined) cells.push({
      r, c: 3, value: basisPercent, numFmt: '0.00', style: { ...body, align: 'center' }
    })
    rowHeightsPt.push(bold ? 20 : Math.max(16.5, Math.ceil(line.label.length / 58) * 15))
  })
  return {
    name,
    landscape: false,
    grid: {
      cells,
      merges: [{ r1: 0, c1: 0, r2: 0, c2: 3 }],
      colWidthsChars: [7, 58, 19, 12],
      rowHeightsPt,
      images: [], rowBreaks: []
    }
  }
}

/** Values are intentional here: a standalone file has no component sheets to reference. */
export function buildStandaloneGeneralAbstractExcelSheet(
  projectName: string,
  abstract: ProjectAbstract
): ProjectSheetPayload {
  return buildGeneralAbstractExcelSheet(
    projectName,
    abstract.lines.map((line) => {
      const percent = /(?:@|\s)(\d+(?:\.\d+)?)\s*%/.exec(line.label)
      return {
        line,
        amount: line.amount,
        basisPercent: line.kind === 'charge' || line.kind === 'gst'
          ? (percent ? Number(percent[1]) : undefined)
          : undefined
      }
    })
  )
}

export async function exportStandaloneGeneralAbstractExcel(
  projectName: string,
  abstract: ProjectAbstract,
  project?: EestimateProject
): Promise<void> {
  const page = buildStandaloneGeneralAbstractExcelSheet(projectName, abstract)
  if (project) appendSignatureRows(page.grid, excelSignatureRows(project, 'project'))
  if (project) applyGeneratedExcelFont(page.grid, excelPrintSettings(resolveExcelDocumentSettings(project, 'general-abstract', undefined, { orientation: 'portrait' })))
  const result = await window.api.excel.compile({
    kind: 'page', preferPath: true, page,
    ...(project ? { printSettings: excelPrintSettings(resolveExcelDocumentSettings(project, 'general-abstract', undefined, { orientation: 'portrait' })) } : {})
  })
  if (!result?.ok || !result.filePath) {
    throw new Error(result?.error || 'General Abstract Excel compilation failed.')
  }
  if (typeof window.api.export.workbook !== 'function') {
    throw new Error('Excel export channel is unavailable.')
  }
  await window.api.export.workbook(
    '',
    `${(projectName || 'Estimate').replace(/[\\/:*?"<>|]/g, '').trim()} — General Abstract.xlsx`,
    undefined,
    { sourcePath: result.filePath }
  )
}
