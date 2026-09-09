/** Shared page geometry and worksheet range helpers.
 * HTML/Chromium rendering was retired.
 */
import type { CellRange, PaperSize } from '../types/project'

interface CellData {
  v?: string | number | boolean | null
  p?: { body?: { dataStream?: string } } | null
}

interface WorksheetSnapshot {
  cellData?: Record<number, Record<number, CellData>>
}

export const PX_PER_MM = 96 / 25.4

export const PAPER_MM: Record<PaperSize, { w: number; h: number }> = {
  A4: { w: 210, h: 297 },
  A3: { w: 297, h: 420 },
  A2: { w: 420, h: 594 },
  Letter: { w: 215.9, h: 279.4 },
  Legal: { w: 215.9, h: 355.6 }
}

function cellText(cell: CellData): string {
  const richText = cell.p?.body?.dataStream
  if (typeof richText === 'string' && richText.length > 0) {
    return richText.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '').replace(/\n+$/g, '')
  }
  return cell.v == null ? '' : String(cell.v)
}

export function computeUsedRange(sheet: WorksheetSnapshot | undefined): CellRange | null {
  if (!sheet?.cellData) return null
  let maxRow = -1
  let maxColumn = -1
  for (const [rowKey, columns] of Object.entries(sheet.cellData)) {
    let rowHasContent = false
    for (const [columnKey, cell] of Object.entries(columns ?? {})) {
      if (cell && cellText(cell) !== '') {
        rowHasContent = true
        maxColumn = Math.max(maxColumn, Number(columnKey))
      }
    }
    if (rowHasContent) maxRow = Math.max(maxRow, Number(rowKey))
  }
  return maxRow < 0 || maxColumn < 0
    ? null
    : { startRow: 0, startColumn: 0, endRow: maxRow, endColumn: maxColumn }
}
