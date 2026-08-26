import { useStore } from '../store/useStore'
import { readFinalValueFromSnapshot } from '../lib/finalNumber'
import { normalizeSignatureFooter } from '../lib/signatureFooter'
import { findNode } from '../lib/tree'
import type { ProjectNode, SignatureFooterSettings } from '../types/project'
import type { CountId, StateCheckId } from './types'

/**
 * Reading the project to decide whether an assignment is done.
 *
 * An assignment step offers no pointers, so the only honest way to know the
 * reader finished is to look at what they built. These checks are read-only —
 * nothing here changes the project.
 */

/**
 * Codes are compared with punctuation and case thrown away.
 *
 * A rate code gets written a dozen ways — "IRR-CCDW-2-5", "irr ccdw 2 5",
 * "IRR‑CCDW‑2‑5" with a non-breaking hyphen. Comparing the letters and digits
 * alone means the tutorial recognises the item the reader actually added rather
 * than only the spelling it happened to expect.
 */
function normaliseCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function walk(node: ProjectNode, visit: (n: ProjectNode) => void): void {
  visit(node)
  for (const child of node.children ?? []) walk(child, visit)
}

/** Item nodes in the open project, keyed by normalised code. */
function projectItemsByCode(): Map<string, ProjectNode> {
  const root = useStore.getState().project?.root
  const items = new Map<string, ProjectNode>()
  if (!root) return items
  walk(root, (node) => {
    const code = node.itemCode
    // First wins: if the same code is used twice, the earlier usage is the one
    // the reader most likely just added.
    if (code && !items.has(normaliseCode(code))) items.set(normaliseCode(code), node)
  })
  return items
}

/**
 * Which of the wanted codes are not in the project yet, in the order given.
 * An empty array means the assignment is complete.
 */
export function missingItemCodes(wanted: string[]): string[] {
  const present = projectItemsByCode()
  return wanted.filter((code) => !present.has(normaliseCode(code)))
}

/**
 * Which of the wanted codes are not yet *measured* — missing from the project, or
 * present but with no fixed final quantity.
 *
 * Adding an item is bookkeeping; giving it a quantity is the work. An assignment
 * that passed as soon as the row appeared would be marking the wrong thing, so
 * this reads the same final value the abstract and the totals read, which also
 * means it works whether the item is a sheet or a document.
 */
export function unmeasuredItemCodes(wanted: string[]): string[] {
  const present = projectItemsByCode()
  return wanted.filter((code) => {
    const node = present.get(normaliseCode(code))
    if (!node) return true
    const qty = readFinalValueFromSnapshot(node)
    return qty === null || !Number.isFinite(qty)
  })
}

// ---------------------------------------------------------------------------
// Named state checks
// ---------------------------------------------------------------------------

/**
 * Why these exist.
 *
 * Most steps can be gated on the DOM: a control was clicked, a dialog opened.
 * A handful cannot, and those are exactly the steps that were quietly lying.
 * "The Create Variant dialog closed" is satisfied by pressing Cancel. "The
 * reader opened Sand" cannot be seen at all from a click on a list whose rows
 * the reader may have scrolled past. Each check below asks the project or the
 * navigation state a question with only one honest answer.
 *
 * They are deliberately forgiving about names — a material is Sand if its name
 * contains "sand", because the compiled list writes it a dozen ways — and
 * deliberately strict about work: a variant is not a route until something is
 * applied to it.
 */

function materialMatches(name: string | undefined, want: string): boolean {
  return (name ?? '').trim().toLowerCase().includes(want)
}

/** Variants on the lead chart whose material reads as `want`. */
function variantsFor(want: string): { id: string }[] {
  const chart = useStore.getState().project?.leadChart
  return (chart?.variants ?? []).filter((variant) =>
    materialMatches(variant.materialName, want)
  )
}

/** True once one of `want`'s variants is actually applied to an item. */
function appliedFor(want: string): boolean {
  const chart = useStore.getState().project?.leadChart
  const ids = new Set(variantsFor(want).map((variant) => variant.id))
  if (ids.size === 0) return false
  return (chart?.applications ?? []).some((application) => ids.has(application.variantId))
}

/** The node the Explorer currently has selected, if any. */
function selectedNode(): ProjectNode | null {
  const state = useStore.getState()
  const root = state.project?.root
  const id = state.selectedId
  if (!root || !id) return null
  return findNode(root, id)
}

/**
 * The project-scope signature settings, as saved.
 *
 * Read straight off the project rather than through the inheritance resolver:
 * chapter 4 sets these on the Project Dashboard, which *is* the top of the
 * ladder, and the resolver needs a project that may not be open yet.
 */
function projectSignature(): SignatureFooterSettings {
  return normalizeSignatureFooter(useStore.getState().project?.signatureFooter)
}

/** True when the open node carries this rate code. */
export function isItemOpen(code: string): boolean {
  const node = selectedNode()
  if (!node?.itemCode) return false
  return normaliseCode(node.itemCode) === normaliseCode(code)
}

/**
 * True when the item with this code is set to the given editor.
 *
 * Reads the item wherever it sits in the tree rather than only the open one:
 * the settings dialog can be opened from a row the reader never selected.
 */
export function itemEditorIs(code: string, editor: 'spreadsheet' | 'document'): boolean {
  const node = projectItemsByCode().get(normaliseCode(code))
  if (!node) return false
  return (node.itemEditorType ?? 'spreadsheet') === editor
}

export const STATE_CHECKS: Record<StateCheckId, () => boolean> = {
  activityLead: () => useStore.getState().activity === 'lead',
  activityData: () => useStore.getState().activity === 'data',

  leadMaterialOpen: () => useStore.getState().leadSelection !== null,
  sandOpen: () => materialMatches(useStore.getState().leadSelection?.materialName, 'sand'),
  stoneOpen: () => materialMatches(useStore.getState().leadSelection?.materialName, 'stone'),

  // Points are held on the chart, not on the material, so this is the honest
  // question: does a point exist at all? It also survives Cancel, which the
  // dialog-closed gate it replaces did not.
  componentExists: () =>
    (useStore.getState().project?.root.children ?? []).some(
      (child) => child.kind === 'component' || child.kind === 'subcomponent'
    ),

  leadPointExists: () => (useStore.getState().project?.leadChart?.points ?? []).length > 0,

  sandVariantExists: () => variantsFor('sand').length > 0,
  sandApplied: () => appliedFor('sand'),
  stoneVariantExists: () => variantsFor('stone').length > 0,
  stoneApplied: () => appliedFor('stone'),

  seigniorageOpen: () => useStore.getState().seigniorageSelection !== null,

  dataSectionRates: () => useStore.getState().dataDashboardSection === 'rates',
  dataSectionCatalogue: () => useStore.getState().dataDashboardSection === 'catalogue',
  dataAnalysisOpen: () => useStore.getState().analysisSelection !== null,

  // The project dashboard is what you get when nothing else has claimed the
  // work area — so this asks the same question WorkArea asks, in the same order.
  projectDashboardOpen: () => {
    const state = useStore.getState()
    if (state.view !== 'project') return false
    if (state.leadSelection || state.seigniorageSelection || state.analysisSelection) return false
    if (state.activity === 'lead' || state.activity === 'data') return false
    const node = selectedNode()
    return !node || node.kind === 'title'
  },

  miscellaneousAdded: () =>
    (useStore.getState().project?.miscellaneousItems ?? []).length > 0,

  frontPageOpen: () => selectedNode()?.pageTemplate === 'front',
  introductionOpen: () => selectedNode()?.pageTemplate === 'introduction',

  signatureEveryPage: () => {
    const settings = projectSignature()
    return settings.enabled && settings.placement === 'every_page'
  },
  signatureRowsAtLeastOne: () => projectSignature().rows.length >= 1,
  signatureRowsAtLeastThree: () => projectSignature().rows.length >= 3
}

/** Read one named check, treating an unreadable project as "not yet". */
export function stateSatisfied(check: StateCheckId): boolean {
  try {
    return STATE_CHECKS[check]()
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Counted things
// ---------------------------------------------------------------------------

/**
 * Some steps ask the reader to *make one*, and presence is the wrong question:
 * a project that already carries two sand points would satisfy "a point exists"
 * before the reader had done anything at all. These read the count, and the
 * step compares it against what it was when the card opened.
 */
export const COUNTS: Record<CountId, () => number> = {
  leadPoints: () => (useStore.getState().project?.leadChart?.points ?? []).length,
  leadVariants: () => (useStore.getState().project?.leadChart?.variants ?? []).length,
  leadApplications: () => (useStore.getState().project?.leadChart?.applications ?? []).length,
  miscellaneousItems: () => (useStore.getState().project?.miscellaneousItems ?? []).length,
  signatureRows: () => projectSignature().rows.length
}

/** Read one count, treating an unreadable project as zero. */
export function readCount(count: CountId): number {
  try {
    return COUNTS[count]()
  } catch {
    return 0
  }
}

/**
 * The count as it stood when a step first opened.
 *
 * Kept per step rather than per visit, so a reader who steps back to re-read a
 * card and then returns is not quietly asked to create a second point. Cleared
 * when a chapter starts, which is the only moment the old numbers stop meaning
 * anything.
 */
const baselines = new Map<string, number>()

export function growthBaseline(stepKey: string, count: CountId): number {
  const existing = baselines.get(stepKey)
  if (existing !== undefined) return existing
  const now = readCount(count)
  baselines.set(stepKey, now)
  return now
}

export function resetGrowthBaselines(): void {
  baselines.clear()
}
