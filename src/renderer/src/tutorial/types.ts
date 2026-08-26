/**
 * A tutorial that points at the real application.
 *
 * Nothing here renders a mock. Every step names a control that already exists
 * on a real screen; the overlay finds it, dims everything else, and explains
 * why that control matters.
 *
 * The rule that matters most: a step is finished when the *application* says
 * so, not when the card says so. There is no button that walks the reader
 * forward past work they have not done — if the tutorial could advance itself,
 * it would drift out of step with the screen and every later card would be
 * describing somewhere the reader is not.
 */

/**
 * Named readings of the application's own state.
 *
 * A DOM watcher can tell you a dialog closed; it cannot tell you the dialog
 * closed *because the work was saved* rather than because Cancel was pressed.
 * These are the questions worth asking the project itself, and every one of
 * them is answered in `checks.ts` by reading the store — never by trusting the
 * card.
 */
export type StateCheckId =
  /** The Lead workspace is the active activity. */
  | 'activityLead'
  /** The DATA workspace is the active activity. */
  | 'activityData'
  /** Some material's page is open on the right. */
  | 'leadMaterialOpen'
  /** Specifically Sand — the material chapter 2 teaches with. */
  | 'sandOpen'
  /** Specifically Stone, for the chapter 2 assignment. */
  | 'stoneOpen'
  /** The project has at least one component under the title. */
  | 'componentExists'
  /** At least one point exists on the lead chart. */
  | 'leadPointExists'
  /** A variant whose material is Sand exists. */
  | 'sandVariantExists'
  /** A Sand variant is applied to at least one item. */
  | 'sandApplied'
  /** A variant whose material is Stone exists. */
  | 'stoneVariantExists'
  /** A Stone variant is applied to at least one item — the assignment's proof. */
  | 'stoneApplied'
  /** The Seigniorage dashboard is open. */
  | 'seigniorageOpen'
  /** The DATA sidebar is on Cement / Steel. */
  | 'dataSectionRates'
  /** The DATA sidebar is on SOR / SSR DATA. */
  | 'dataSectionCatalogue'
  /** An item's Full DATA is open. */
  | 'dataAnalysisOpen'
  /** The project dashboard is what the work area is showing. */
  | 'projectDashboardOpen'
  /** The project carries at least one miscellaneous charge. */
  | 'miscellaneousAdded'
  /** The Front Page is the open page. */
  | 'frontPageOpen'
  /** The Introduction is the open page. */
  | 'introductionOpen'
  /** The project signature block is set to print on every page. */
  | 'signatureEveryPage'
  /** At least one signatory row exists. */
  | 'signatureRowsAtLeastOne'
  /** Three or more signatory rows — the sanction chain. */
  | 'signatureRowsAtLeastThree'

/**
 * Things worth counting.
 *
 * Each maps to one number read off the open project in `checks.ts`.
 */
export type CountId =
  | 'leadPoints'
  | 'leadVariants'
  | 'leadApplications'
  | 'miscellaneousItems'
  | 'signatureRows'

/** How a step finds the control it is talking about. */
export interface TutorialTarget {
  /** Tried first. Prefer `[data-tour="…"]` for anything without stable text. */
  selector?: string
  /** Visible text of a button/label. Matched case-insensitively, trimmed. */
  text?: string
  /** Optional CSS scope the text search is confined to. */
  within?: string
  /** Where the card should sit relative to the target. Default: auto. */
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'auto'
  /** Extra pixels of breathing room around the highlight ring. Default 6. */
  pad?: number
}

export interface TutorialStep {
  /** Stable id — used for resume and for the step rail. */
  id: string
  /** Short label shown on the step rail. Keep under ~14 characters. */
  rail: string
  /**
   * Small caps line above the title. Left undefined it becomes
   * "STEP n OF m" for the step's section.
   */
  eyebrow?: string
  title: string
  body?: string
  /**
   * Label for the card's button on `acknowledge` steps — the ones that only
   * explain something. Action steps have no button, so this is ignored there.
   */
  primary: string
  /** Label of the quiet link beside it. Defaults to "Skip tutorial". */
  secondary?: string
  /** Target control. Omit for a centred, screen-wide message. */
  target?: TutorialTarget
  /**
   * Where this step lives, in the user's words — shown when the target
   * cannot be found, e.g. "the Component dashboard".
   */
  screen?: string
  /**
   * Sections restart the "STEP n OF m" counter, matching the design: the
   * coached run is one section, each assignment block another.
   */
  section?: string
  /** Marks a hands-off step the reader is meant to do themselves. */
  assignment?: boolean
  /**
   * What the reader is being asked to press, in their words — used in the
   * waiting line when the control's own label is not self-explanatory.
   */
  actionLabel?: string
  /**
   * How this step completes. Omitted, it is inferred: a step with a target
   * waits for that control to be clicked, a step without one is an
   * explanation the reader acknowledges. See `advance.ts`.
   */
  advance?: StepAdvance
}

/**
 * The ways a step can finish.
 *
 * `acknowledge` is the only one with a button, and it is reserved for steps
 * that ask nothing of the reader — a paragraph of explanation about the screen
 * they are already looking at. Everything else watches the application.
 */
export type StepAdvance =
  /** Pure explanation. The card carries a button; pressing it moves on. */
  | { on: 'acknowledge' }
  /** The highlighted control was clicked. */
  | { on: 'click' }
  /** The highlighted field was filled in — typed into, or a value chosen. */
  | { on: 'input' }
  /** Something new showed up: a dialog opened, a dashboard replaced a form. */
  | { on: 'appears'; target: TutorialTarget }
  /** Something went away: a dialog closed once the work inside it was done. */
  | { on: 'disappears'; target: TutorialTarget }
  /**
   * The named rate codes exist in the project. For assignments, where the
   * reader is given a task and no pointers, and the only fair way to know they
   * finished is that the work is there.
   */
  | { on: 'itemsExist'; codes: string[] }
  /**
   * The named rate codes exist *and* each carries a fixed final quantity. The
   * stronger form of the above, for an assignment whose point is the measuring
   * rather than the adding.
   */
  | { on: 'itemsMeasured'; codes: string[] }
  /**
   * A named reading of the application's state came true.
   *
   * This is the gate for anything the DOM answers badly. "The dialog closed" is
   * satisfied by Cancel; "a Sand variant exists" is not. `hint` is what the card
   * says while it waits, in the reader's words rather than the check's.
   */
  | { on: 'state'; check: StateCheckId; hint?: string }
  /**
   * The item with this rate code is the one currently open.
   *
   * A click on a tree row is not the same as that row being open — the reader
   * can miss, hit the twisty, or land on a sibling with a similar name. Codes
   * are matched with punctuation and case thrown away.
   */
  | { on: 'itemOpen'; code: string }
  /**
   * The item with this rate code is set to a particular editor.
   *
   * For the settings dialog, where Save and Cancel both close the dialog and
   * only one of them changed anything.
   */
  | { on: 'itemEditorIs'; code: string; editor: 'spreadsheet' | 'document' }
  /**
   * A counted thing grew while this step was open.
   *
   * The gate for "make one now". A presence check — "a point exists" — is the
   * wrong question on any screen the reader may arrive at with work already
   * done: the project already had two sand points, so the card unlocked itself
   * before the reader had created anything. This one records the count when the
   * step opens and waits for it to rise.
   *
   * The baseline is remembered per step, so stepping back and forward again does
   * not silently demand a second one.
   */
  | { on: 'grew'; count: CountId; by?: number; hint?: string }

export interface TutorialChapter {
  id: string
  /** 1-based chapter number, used in copy and in the completion card. */
  number: number
  title: string
  /** One line for the chapter picker and the "up next" block. */
  blurb: string
  /** Rough length, in minutes, shown in the "up next" block. */
  minutes: number
  steps: TutorialStep[]
  complete: {
    title: string
    /** Ticked lines on the completion card. */
    checklist: string[]
    /** Optional closing paragraph, used by the final chapter. */
    body?: string
  }
}
