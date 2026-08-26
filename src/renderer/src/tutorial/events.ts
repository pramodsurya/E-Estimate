/**
 * The tutorial's one request to the spreadsheet editor.
 *
 * Chapter 1 needs a sheet with numbers in it before it can teach fixing a final
 * number and setting a print area. The tutorial cannot write those numbers
 * itself: the editor builds its Univer workbook once, from `node.spreadsheet`, at
 * mount — so a later write to the store never reaches the live sheet, and would
 * be overwritten the moment the editor next saved.
 *
 * So the tutorial asks, and the editor — which owns the workbook — answers. That
 * keeps every line of Univer knowledge inside the component that already has it.
 */
export const TUTORIAL_SEED_SHEET = 'e-estimate:tutorial-seed-sheet'

/**
 * A believable apron footing. Literal quantities rather than formulas: the step
 * only needs numbers to point at, and a literal reads the same whether or not
 * the formula engine has finished booting.
 */
export const SPECIMEN_SHEET_ROWS: (string | number | null)[][] = [
  ['Description', 'No.', 'L', 'B', 'D', 'Quantity'],
  ['Excavation for apron footing', 1, 12.4, 3.6, 2.1, 93.74],
  ['Deduct rock portion', 1, 4.2, 3.6, 0.9, -13.61],
  [null, null, null, null, 'Total', 80.13]
]

/** A1 notation covering exactly the specimen above. */
export const SPECIMEN_SHEET_RANGE = 'A1:F4'

/** A cell or block the tutorial wants the sheet to select, so the reader can see it. */
export interface TutorialRangeRequest {
  /** A1 notation, for the facade. */
  a1: string
  /** The same range zero-based, used to verify the selection actually moved. */
  startRow: number
  startColumn: number
  endRow: number
  endColumn: number
}

export const TUTORIAL_SELECT_RANGE = 'e-estimate:tutorial-select-range'

/** F4 in the specimen above — the Total. */
export const SPECIMEN_TOTAL_CELL: TutorialRangeRequest = {
  a1: 'F4',
  startRow: 3,
  startColumn: 5,
  endRow: 3,
  endColumn: 5
}
