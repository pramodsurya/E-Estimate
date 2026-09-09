import type { CountId, StateCheckId, StepAdvance, TutorialStep } from './types'

/**
 * When each step is finished.
 *
 * This lives apart from the chapter content on purpose. The chapters are copy —
 * what to say and what to point at — and stay readable as prose. This file is
 * the contract with the application: which observable change means the reader
 * actually did the thing.
 *
 * Anything not listed falls back to the sensible default: a step with a target
 * waits for that control to be clicked; a step without one is an explanation
 * the reader acknowledges.
 */

const CLICK: StepAdvance = { on: 'click' }
const ACK: StepAdvance = { on: 'acknowledge' }
const INPUT: StepAdvance = { on: 'input' }

/** The project dashboard's action row — proof a project now exists. */
const PROJECT_OPEN: StepAdvance = { on: 'appears', target: { selector: '.dash-actions' } }

/** A dialog is done with when its own field is gone from the document. */
const closed = (selector: string): StepAdvance => ({ on: 'disappears', target: { selector } })

/** Something showed up. */
const shown = (selector: string): StepAdvance => ({ on: 'appears', target: { selector } })

/**
 * The application's own state came true.
 *
 * Reach for this over a DOM watcher whenever the DOM would answer a *different*
 * question than the one the step is asking. "The dialog closed" is not "the
 * variant was saved"; "a row was clicked" is not "the material is open".
 */
const state = (check: StateCheckId, hint?: string): StepAdvance => ({ on: 'state', check, hint })

/**
 * One more of something had to appear while the card was up.
 *
 * Presence is the wrong question wherever the reader may already have done the
 * work in an earlier session — a project carrying two sand points satisfied
 * "a point exists" before this step had asked for anything.
 */
const grew = (count: CountId, hint?: string): StepAdvance => ({ on: 'grew', count, hint })

/** That exact rate code is the item on screen. */
const itemOpen = (code: string): StepAdvance => ({ on: 'itemOpen', code })

/**
 * The component dashboard, told apart from the project one.
 *
 * Both render `.dash-actions`, so "a dashboard appeared" is not enough to know
 * which. Add Item only exists on a component.
 */
const COMPONENT_OPEN: StepAdvance = {
  on: 'appears',
  target: { text: 'Add Item', within: '.dash-actions' }
}

const RULES: Record<string, Record<string, StepAdvance>> = {
  ch1: {
    name: INPUT,
    year: INPUT,
    zone: ACK,
    location: CLICK,
    allowance: ACK,
    // Not "the button was pressed" — "the project came into being". Creating
    // asks for a folder, and the reader can still back out of that dialog.
    create: PROJECT_OPEN,
    // Not the press — the dialog. A press that opened nothing leaves the next
    // card describing a field that is not there.
    dashboard: shown('[data-tour="add-structure-name"]'),
    // Cancel closes that dialog too. A component either exists or it does not.
    component: state('componentExists', 'Create the component — this card waits for it to exist.'),
    'add-item': shown('[data-tour="add-item-search"]'),
    search: INPUT,
    // Any row's + counts — the overlay matches the selector, not the ringed
    // element — and the dialog stays open so the footer step can follow.
    'pick-code': CLICK,
    'confirm-add': closed('[data-tour="add-item-search"]'),
    // Opening the sheet is proven by the grid existing, not by a click on a
    // tree row — the reader may click a component, a page, the wrong item.
    'open-sheet': { on: 'appears', target: { selector: '[data-tour="sheet-grid"]' } },
    'sheet-fill': ACK,
    // Univer draws its cells to canvas, so a cell selection is not observable
    // from the DOM. The reader confirms this one, and the step after it is gated
    // on the button press that actually depends on the selection.
    'pick-final-cell': ACK,
    'fix-final': CLICK,
    // Sync lives on the component dashboard, not in the item's sheet — so the
    // reader has to be sent back there before being asked to press it.
    // The component dashboard specifically — Sync lives there, not on the
    // project dashboard the old rule would also have accepted.
    'to-dashboard': COMPONENT_OPEN,
    sync: CLICK,
    // An assignment is finished when the work exists, full stop. No button, and
    // no credit for opening the dialog and closing it again.
    'assignment-items': { on: 'itemsExist', codes: ['IRR-CCDW-2-5', 'IRR-CCDW-2-6'] },
    // A click on a tree row is not the same as landing on it.
    'open-ccdw-sheet': itemOpen('IRR-CCDW-2-5'),
    'open-item-settings': { on: 'appears', target: { selector: '[data-tour="settings-editor-type"]' } },
    'settings-editor-type': INPUT,
    'settings-orientation': ACK,
    // Save and Cancel both close the dialog; only one of them changed the item.
    'settings-save': { on: 'itemEditorIs', code: 'IRR-CCDW-2-5', editor: 'document' },
    // Not "the reader says so" — both items must actually carry a quantity. This
    // is the one thing the chapter has been teaching, so it is the one thing
    // worth checking rather than taking on trust.
    'measure-both': { on: 'itemsMeasured', codes: ['IRR-CCDW-2-5', 'IRR-CCDW-2-6'] },
    'back-to-component': COMPONENT_OPEN,
    'sync-again': CLICK,
    'print-view': CLICK,
    printed: ACK
  },
  ch2: {
    // Where you *are* matters more than what you pressed: the activity bar is
    // one click, but a reader who lands here from a stale session has already
    // done it.
    'lead-sidebar': state('activityLead', 'Open the Lead workspace to carry on.'),
    'lead-sync': CLICK,
    // The compiled list lives behind the Lead tab of the bottom-left panel, not
    // on the dashboard Sync was pressed on.
    'lead-panel': shown('.lead-abstract-panel'),
    // The step that was missing outright. Every card after this one points at a
    // control that only exists on a material's own page.
    'open-sand': state('sandOpen', 'Click Sand in the list to carry on.'),
    'open-point-dialog': shown('[data-tour="lead-point-create"]'),
    // Not "the dialog closed" — Cancel closes it too — and not "a point exists"
    // either, which any earlier session would already have satisfied.
    'create-point': grew('leadPoints', 'Create the point — this card waits for a new one.'),
    'create-variant': shown('[data-tour="variant-name"]'),
    'variant-name': INPUT,
    'variant-start': INPUT,
    'variant-end': INPUT,
    'variant-route': ACK,
    // Again: saved, not dismissed — and newly saved, not saved last week.
    'variant-save': grew('leadVariants', 'Save the variant — this card waits for a new one.'),
    // A variant charges nothing until it is linked to work, so the step that
    // teaches linking is gated on a link actually being made.
    'apply-usages': grew('leadApplications', 'Tick the usages and press Apply Checked.'),
    // The assignment is finished when a stone route is actually applied. No
    // button on the card can substitute for that.
    stone: state('stoneApplied', 'Waiting on a stone point, route and applied usages.'),
    'back-to-lead': CLICK,
    'lead-print-preview': CLICK,
    'map-layout': CLICK,
    'map-resize': ACK,
    'lead-print-view': CLICK,
    'open-seigniorage': state('seigniorageOpen', 'Open Seigniorage from the bottom-left panel.'),
    seigniorage: CLICK,
    'seigniorage-print': CLICK
  },
  ch3: {
    'data-activity': state('activityData', 'Open the DATA workspace to carry on.'),
    'data-sync': CLICK,
    'data-panel': shown('.data-tree'),
    // Clicking a row is what opens Full DATA, but the twisty is a click too —
    // so gate on the buildup actually being open.
    'open-data-item': state('dataAnalysisOpen', 'Open an item’s DATA to carry on.'),
    'full-data': ACK,
    'lead-line': ACK,
    // Edit is proven by Save appearing: the toolbar swaps one for the other.
    unlock: shown('[data-tour="rate-save"]'),
    nudge: ACK,
    'save-row': CLICK,
    live: ACK,
    'close-data': CLICK,
    'open-rates': state('dataSectionRates', 'Open Cement / Steel in the DATA sidebar.'),
    circulars: INPUT,
    selected: ACK,
    repriced: CLICK,
    'open-catalogue': state('dataSectionCatalogue', 'Open SOR / SSR DATA in the DATA sidebar.'),
    catalogue: CLICK,
    backend: ACK
  },
  ch4: {
    'to-explorer': shown('.explorer-tree'),
    'to-project': state('projectDashboardOpen', 'Open the project row to carry on.'),
    'sync-project': CLICK,
    'real-total': CLICK,
    'misc-name': INPUT,
    'misc-amount': INPUT,
    // The charge has to exist. Cancelling the dialog adds nothing, and the old
    // acknowledge button would have credited it anyway.
    'misc-add': grew('miscellaneousItems', 'Add the charge — this card waits for the line.'),
    'front-page': state('frontPageOpen', 'Open Front Page from the Explorer.'),
    'front-page-edit': ACK,
    introduction: state('introductionOpen', 'Open Introduction from the Explorer.'),
    'back-to-project': state('projectDashboardOpen', 'Open the project row to carry on.'),
    signatures: ACK,
    'sign-every-page': state('signatureEveryPage', 'Enable it and set Placement to every printed page.'),
    'sign-add-row': grew('signatureRows', 'Add a signatory row to carry on.'),
    // Three rows, counted — the sanction chain the copy describes.
    'sign-two-more': state('signatureRowsAtLeastThree', 'Waiting on three signatory rows.'),
    'sync-again': CLICK,
    'edit-project': shown('[data-tour="np-year"]'),
    'pick-year': INPUT
  }
}

export function advanceFor(chapterId: string, step: TutorialStep): StepAdvance {
  if (step.advance) return step.advance
  const fromTable = RULES[chapterId]?.[step.id]
  if (fromTable) return fromTable
  return step.target ? CLICK : ACK
}

/** True when the reader has to do something in the app to move on. */
export function isGated(advance: StepAdvance): boolean {
  return advance.on !== 'acknowledge'
}
