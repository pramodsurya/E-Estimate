import {
  SPECIMEN_TOTAL_CELL,
  TUTORIAL_SEED_SHEET,
  TUTORIAL_SELECT_RANGE,
  type TutorialRangeRequest
} from './events'

/**
 * Side effects a step may fire when it opens.
 *
 * None of them touch the project directly. Two ask the spreadsheet editor for
 * something only it can do — lay down a specimen, or select a range so the
 * reader can see which cell is being talked about. The editor owns the live
 * Univer workbook; see `events.ts` for why this cannot go through the store.
 */

function selectRange(range: TutorialRangeRequest): void {
  window.dispatchEvent(new CustomEvent<TutorialRangeRequest>(TUTORIAL_SELECT_RANGE, { detail: range }))
}

const ON_ENTER: Record<string, Record<string, () => void>> = {
  ch1: {
    'sheet-fill': () => window.dispatchEvent(new CustomEvent(TUTORIAL_SEED_SHEET)),
    // Point at the total by moving the sheet's own selection. Univer draws that
    // highlight itself, so it survives scrolling and zooming in a way an overlay
    // ring on a canvas could not.
    'pick-final-cell': () => selectRange(SPECIMEN_TOTAL_CELL)
  }
}

export function runStepEffect(chapterId: string, stepId: string): void {
  ON_ENTER[chapterId]?.[stepId]?.()
}
