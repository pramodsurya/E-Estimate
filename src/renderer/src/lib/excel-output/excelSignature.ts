import type { EestimateProject, SignatureFooterRow } from '../../types/project'
import { printableSignatureRows, resolveSignatureFooter } from '../signatureFooter'
import type { DetailGrid } from './detailGrid'

export function excelSignatureSettings(project: EestimateProject, scope: string) {
  const settings = resolveSignatureFooter(project, scope)
  return {
    placement: settings.placement,
    rows: settings.enabled ? printableSignatureRows(settings).map((row) => ({
      designation: row.designation,
      office: row.office
    })) : []
  }
}

/** Use the same project → ancestor → local resolution as the Project PDF. */
export function excelSignatureRows(project: EestimateProject, scope: string): SignatureFooterRow[] {
  const settings = resolveSignatureFooter(project, scope)
  return settings.enabled ? printableSignatureRows(settings) : []
}

/** Add sign-off cells after existing content without moving formula addresses. */
export function appendSignatureRows(grid: DetailGrid, rows: SignatureFooterRow[]): void {
  if (!rows.length) return
  const width = Math.max(1, grid.colWidthsChars.length)
  let maxRow = grid.rowHeightsPt.length - 1
  for (const cell of grid.cells) maxRow = Math.max(maxRow, cell.r)
  for (const merge of grid.merges) maxRow = Math.max(maxRow, merge.r2)
  for (const image of grid.images) maxRow = Math.max(maxRow, image.r)
  const columnsPerRow = Math.min(width, 3)
  for (let offset = 0; offset < rows.length; offset += columnsPerRow) {
    const group = rows.slice(offset, offset + columnsPerRow)
    const r = maxRow + 3 + Math.floor(offset / columnsPerRow) * 2
    while (grid.rowHeightsPt.length <= r) grid.rowHeightsPt.push(null)
    grid.rowHeightsPt[r] = 36
    group.forEach((signature, index) => {
      const c1 = Math.floor(index * width / group.length)
      const c2 = Math.floor((index + 1) * width / group.length) - 1
      grid.cells.push({
        r, c: c1,
        value: [signature.designation.trim(), signature.office.trim()].filter(Boolean).join('\n'),
        style: { bold: true, align: 'center', wrap: true },
        border: { top: { style: 'thin', colorRgb: '273B47' } }
      })
      if (c2 > c1) grid.merges.push({ r1: r, c1, r2: r, c2 })
    })
  }
}
