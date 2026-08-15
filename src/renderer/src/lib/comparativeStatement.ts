/**
 * The same estimate, priced in two SOR years, side by side.
 *
 * A comparative statement answers one question for a sanctioning authority:
 * what does this work cost under the new schedule against the one it was
 * sanctioned on. Both columns therefore have to be the *whole* estimate — not
 * the components re-rated and the charges left alone — or the totals do not
 * reconcile with either year's own abstract.
 *
 * So neither side is computed here. Each is evaluated as a *shadow project*:
 * the real project with its year, its cement/steel rates and its hand-typed
 * rates swapped for that side's, run through the same
 * `syncProjectDashboardSnapshot` → `computeProjectPrintInputs` path the live
 * dashboard uses. What comes back is what the Project Dashboard would show if
 * the estimate had been built on that year, which is exactly the claim a
 * comparative statement makes.
 *
 * Nothing here writes to the project: the shadows are thrown away once priced.
 */

import type {
  EestimateProject,
  LeadApplication,
  MaterialRateOverride,
  ProjectNode
} from '../types/project'
import type { RateAnalysisRecipe, RateAnalysisSectionKey } from '../types/rateAnalysis'
import { lineIdentity } from './recipeMerge'
import {
  compareAbstractLines,
  compareItemRows,
  totalOf,
  variation,
  type ComparativeRow
} from './comparativeRows'
import { syncProjectDashboardSnapshot } from './dashboardSync'
import {
  collectProjectItems,
  computeProjectPrintInputs,
  type ProjectPrintInputs
} from './projectPrintInputs'
import { getItemFinal } from './finalNumber'
import { nodeDisplayName } from '../components/nodeVisual'

/* ------------------------------------------------------------------ */
/* Hand-typed rates                                                     */
/* ------------------------------------------------------------------ */

/**
 * A rate the estimator typed into a DATA sheet themselves.
 *
 * These are the one input a year cannot supply. Everything else on a sheet is
 * published — re-fetch the year and it re-prices — but a hand-typed rate was a
 * judgement about a specific resource, and the judgement for the other year is
 * only in the estimator's head. So each is asked for once, with the side whose
 * year the edit was made under already filled in.
 *
 * A rate written by the Cement/Steel page is deliberately *not* one of these:
 * it carries a `rateOverride`, follows the cement/steel boxes set per side, and
 * asking for it again would be asking the same question twice.
 */
export interface HandTypedRate {
  /** Stable across a re-open, so answers already given are not lost. */
  key: string
  itemKey: string
  scopeNodeId?: string
  itemLabel: string
  sectionKey: RateAnalysisSectionKey
  resourceLabel: string
  unit: string
  /** The rate as saved, and the SOR year it was saved under. */
  savedRate: number
  savedYear: string
}

/** Rates the estimator supplies for one side, by `HandTypedRate.key`. */
export type RateAnswers = Record<string, number>

function handTypedRatesInRecipe(
  recipe: RateAnalysisRecipe,
  itemKey: string,
  itemLabel: string,
  scopeNodeId: string | undefined
): HandTypedRate[] {
  const found: HandTypedRate[] = []
  for (const section of recipe.sections) {
    for (const line of section.lines) {
      const handTyped = line.editedFields?.includes('rate') === true && !line.rateOverride
      if (!handTyped) continue
      found.push({
        key: [scopeNodeId ?? '', itemKey, section.key, lineIdentity(line)].join('|'),
        itemKey,
        scopeNodeId,
        itemLabel,
        sectionKey: section.key,
        resourceLabel: line.description,
        unit: line.unit,
        savedRate: line.rate,
        savedYear: recipe.year ?? ''
      })
    }
  }
  return found
}

/**
 * Every hand-typed rate in the project, shared edits and component-scoped ones
 * alike. Ordered by item so the setup screen reads like the estimate.
 */
export function collectHandTypedRates(project: EestimateProject): HandTypedRate[] {
  const labelFor = (itemKey: string): string => {
    const match = collectProjectItems(project.root).find(
      (item) => itemLabelKey(item) === itemKey
    )
    return match ? nodeDisplayName(match) : itemKey
  }

  const rates: HandTypedRate[] = []
  for (const [itemKey, recipe] of Object.entries(project.rateAnalysisOverrides ?? {})) {
    rates.push(...handTypedRatesInRecipe(recipe, itemKey, labelFor(itemKey), undefined))
  }
  for (const [scopeNodeId, scoped] of Object.entries(
    project.rateAnalysisScopedOverrides ?? {}
  )) {
    for (const [itemKey, recipe] of Object.entries(scoped)) {
      rates.push(...handTypedRatesInRecipe(recipe, itemKey, labelFor(itemKey), scopeNodeId))
    }
  }
  return rates.sort((left, right) => left.itemLabel.localeCompare(right.itemLabel))
}

/** `projectItemKey` without importing the tree walk twice. */
function itemLabelKey(item: ProjectNode): string {
  return [
    item.itemSource ?? 'OTHERS',
    item.categoryKey ?? 'custom',
    item.itemCode?.trim() || item.name
  ].join(':')
}

/**
 * The side's answers written onto the saved sheets.
 *
 * The line keeps its `editedFields: ['rate']` marking, so the merge in
 * `recipeMerge.ts` holds this rate against that side's published data exactly
 * as it holds the estimator's own — which is the point: the two sides differ
 * only in the year, the cement/steel rates and these answers.
 */
function withRateAnswers(
  recipe: RateAnalysisRecipe,
  itemKey: string,
  scopeNodeId: string | undefined,
  answers: RateAnswers
): RateAnalysisRecipe {
  let changed = false
  const sections = recipe.sections.map((section) => {
    const lines = section.lines.map((line) => {
      const handTyped = line.editedFields?.includes('rate') === true && !line.rateOverride
      if (!handTyped) return line
      const key = [scopeNodeId ?? '', itemKey, section.key, lineIdentity(line)].join('|')
      const answer = answers[key]
      if (typeof answer !== 'number' || !Number.isFinite(answer)) return line
      if (answer === line.rate) return line
      changed = true
      return { ...line, rate: answer, amount: line.quantity * answer }
    })
    return changed ? { ...section, lines } : section
  })
  if (!changed) return recipe
  // The stored calculation belongs to the old rates; force it to be rebuilt.
  return { ...recipe, sections, recalculation: undefined, calculationStale: true }
}

export interface ComparativeSide {
  /** SOR year this column is priced in. */
  year: string
  /** Cement/steel rates for this column, in the master material's own unit. */
  materialRateOverrides: Record<string, MaterialRateOverride>
  /** Hand-typed DATA rates for this column. */
  rateAnswers: RateAnswers
}

/** The project as it would have been, had it been built on this side's year. */
export function shadowProject(
  project: EestimateProject,
  side: ComparativeSide
): EestimateProject {
  const shared = Object.fromEntries(
    Object.entries(project.rateAnalysisOverrides ?? {}).map(([itemKey, recipe]) => [
      itemKey,
      withRateAnswers(recipe, itemKey, undefined, side.rateAnswers)
    ])
  )
  const scoped = Object.fromEntries(
    Object.entries(project.rateAnalysisScopedOverrides ?? {}).map(([scopeNodeId, entries]) => [
      scopeNodeId,
      Object.fromEntries(
        Object.entries(entries).map(([itemKey, recipe]) => [
          itemKey,
          withRateAnswers(recipe, itemKey, scopeNodeId, side.rateAnswers)
        ])
      )
    ])
  )
  return {
    ...project,
    meta: {
      ...project.meta,
      sorYear: side.year,
      materialRateOverrides: side.materialRateOverrides
    },
    rateAnalysisOverrides: shared,
    rateAnalysisScopedOverrides: scoped,
    // The snapshot belongs to the project's own year; this side fetches its own.
    dashboardSnapshot: undefined
  }
}

/* ------------------------------------------------------------------ */
/* The statement                                                        */
/* ------------------------------------------------------------------ */

export interface ComparativeComponent {
  nodeId: string
  name: string
  rows: ComparativeRow[]
  leftTotal: number
  rightTotal: number
  difference: number
  percent: number | null
}

/** Something the statement cannot stand behind, said plainly on its face. */
export interface ComparativeWarning {
  kind: 'stale-lead' | 'unresolved-edit'
  message: string
  detail?: string
}

/**
 * Lead charges that are not priced in the year they are being shown under.
 *
 * `lead_rate` is published per year and the sync re-fetches it, but only *pipe*
 * lead applications are recomputed — `refreshPipeLeadApplications` filters to
 * variants carrying `pipeLead`. An ordinary conveyance charge keeps the
 * `grossAmount` it was given when it was applied, and that amount is added
 * straight onto the item rate.
 *
 * On a comparative statement that is worse than a stale figure: both columns
 * inherit the same frozen lead, so the lead element of every affected item
 * shows no movement at all. A reader would take that as a finding. Each
 * application records the year it was priced under, so say so instead.
 */
function staleLeadWarnings(
  project: EestimateProject,
  years: string[]
): ComparativeWarning[] {
  const variants = new Map(
    (project.leadChart?.variants ?? []).map((variant) => [variant.id, variant])
  )
  const stale = (project.leadChart?.applications ?? []).filter((application) => {
    if (variants.get(application.variantId)?.pipeLead) return false
    const pricedIn = application.rateYear
    return !pricedIn || !years.includes(pricedIn)
  })
  if (stale.length === 0) return []
  const pricedYears = Array.from(
    new Set(stale.map((application) => application.rateYear || 'an unrecorded year'))
  )
  return [
    {
      kind: 'stale-lead',
      message:
        `${stale.length} lead charge${stale.length === 1 ? '' : 's'} ` +
        'still carr' +
        (stale.length === 1 ? 'ies' : 'y') +
        ' the amount set when it was applied, so the same figure appears in both columns.',
      detail:
        `Priced under ${pricedYears.join(', ')}. Re-apply the lead charge under each ` +
        'year before relying on the lead element of this comparison.'
    }
  ]
}

export interface ComparativeStatement {
  leftYear: string
  rightYear: string
  /** False when only part of the work was compared — see `selectedAbstractRows`. */
  wholeEstimate: boolean
  /** Empty when both columns can be taken at face value. */
  warnings: ComparativeWarning[]
  /** The General Abstract, compared line for line. */
  abstractRows: ComparativeRow[]
  /** Each component's own abstract, compared item by item. */
  components: ComparativeComponent[]
  /** Conveyance charges in both years. Already inside the item rates above. */
  leadRows: ComparativeRow[]
  leftGrandTotal: number
  rightGrandTotal: number
  difference: number
  percent: number | null
}

/**
 * What the statement covers.
 *
 * A comparison is often asked for over part of a work — one component, or a
 * handful of items inside it — and pricing the rest is both slow and noise on
 * the page. `null` means the whole estimate; otherwise only the item ids listed
 * are compared, and a component appears only if it still has an item in it.
 *
 * The *pricing* is always done over the whole project regardless: an item's
 * rate does not depend on which of its neighbours were selected, and the
 * charges and GST are computed on the work as a whole. Selection narrows what
 * is shown and totalled, not what is fetched.
 */
export type ComparativeSelection = ReadonlySet<string> | null

export interface ComparativeScopeNode {
  node: ProjectNode
  children: ComparativeScopeNode[]
  items: ProjectNode[]
}

/** The component/sub-component tree the selection screen offers, in tree order. */
export function comparativeScope(project: EestimateProject): ComparativeScopeNode[] {
  const build = (parent: ProjectNode): ComparativeScopeNode[] =>
    parent.children
      .filter((child) => child.kind === 'component' || child.kind === 'subcomponent')
      .map((child) => ({
        node: child,
        children: build(child),
        // Items belonging to this level, not to a nested component below it.
        items: directItems(child)
      }))
  return build(project.root)
}

function directItems(section: ProjectNode): ProjectNode[] {
  const items: ProjectNode[] = []
  const visit = (node: ProjectNode): void => {
    for (const child of node.children) {
      if (child.kind === 'item') items.push(child)
      else if (child.kind !== 'component' && child.kind !== 'subcomponent') visit(child)
    }
  }
  visit(section)
  return items
}

/** Every item id under a scope node, including its nested components. */
export function scopeItemIds(scope: ComparativeScopeNode): string[] {
  return [
    ...scope.items.map((item) => item.id),
    ...scope.children.flatMap(scopeItemIds)
  ]
}

/** The published clause for an item, as the component abstract prints it. */
function itemClause(item: ProjectNode, recipe?: RateAnalysisRecipe): string {
  const description = (recipe?.description ?? item.itemDescription ?? '').trim()
  if (!description) return ''
  // The heading already carries the code and name; repeating it underneath is
  // noise on a sheet that is already ten columns wide.
  return description === nodeDisplayName(item).trim() ? '' : description
}

function componentItems(component: ProjectNode): ProjectNode[] {
  const items: ProjectNode[] = []
  const visit = (node: ProjectNode): void => {
    for (const child of node.children) {
      if (child.kind === 'item') items.push(child)
      else visit(child)
    }
  }
  visit(component)
  return items
}

function compareComponents(
  project: EestimateProject,
  left: ProjectPrintInputs,
  right: ProjectPrintInputs,
  selection: ComparativeSelection
): ComparativeComponent[] {
  const components: ComparativeComponent[] = []
  const included = (item: ProjectNode): boolean =>
    selection === null || selection.has(item.id)
  const visit = (node: ProjectNode): void => {
    for (const child of node.children) {
      if (child.kind !== 'component' && child.kind !== 'subcomponent') continue
      const chosen = componentItems(child).filter(included)
      // A component with nothing selected in it is not a component with a zero
      // total — it is one the reader did not ask about.
      if (chosen.length === 0) {
        visit(child)
        continue
      }
      const rows = compareItemRows(
        chosen.map((item) => {
          const leftFinal = getItemFinal(project, item, left.rateOf(item), true)
          const rightFinal = getItemFinal(project, item, right.rateOf(item), true)
          return {
            id: item.id,
            label: nodeDisplayName(item),
            // A comparative statement is read by people who did not write the
            // estimate, so a bare SSR code is not enough to know what moved.
            description: itemClause(item, left.recipes[item.id] ?? right.recipes[item.id]),
            unit: item.unit ?? leftFinal.unit ?? undefined,
            quantity: leftFinal.qty,
            leftRate: leftFinal.rate,
            rightRate: rightFinal.rate,
            leftAmount: leftFinal.amount,
            rightAmount: rightFinal.amount
          }
        })
      )
      const leftTotal = totalOf(rows, 'left')
      const rightTotal = totalOf(rows, 'right')
      components.push({
        nodeId: child.id,
        name: child.name,
        rows,
        leftTotal,
        rightTotal,
        ...variation(leftTotal, rightTotal)
      })
      visit(child)
    }
  }
  visit(project.root)
  return components
}

/**
 * The summary page, honouring the selection.
 *
 * Over the whole estimate this is the General Abstract of both years, charges
 * and GST and grand total included — the statement reconciles with each year's
 * own abstract.
 *
 * Over part of it, it cannot be. Seigniorage, NAC, Labour Cess and GST are
 * charged on the work as a whole; there is no honest way to show the share of
 * them belonging to three items out of forty. So a partial statement summarises
 * the components actually compared and totals those, and says nothing about
 * charges rather than implying a share of them.
 */
function selectedAbstractRows(
  components: ComparativeComponent[],
  left: ProjectPrintInputs,
  right: ProjectPrintInputs,
  selection: ComparativeSelection
): ComparativeRow[] {
  if (selection === null) {
    return compareAbstractLines(left.abstract.lines, right.abstract.lines)
  }
  const rows: ComparativeRow[] = components.map((component, index) => ({
    key: `component:${component.nodeId}`,
    slNo: index + 1,
    label: component.name,
    left: component.leftTotal,
    right: component.rightTotal,
    kind: 'component' as const,
    ...variation(component.leftTotal, component.rightTotal)
  }))
  const leftTotal = totalOf(rows, 'left')
  const rightTotal = totalOf(rows, 'right')
  rows.push({
    key: 'selected-total',
    slNo: null,
    label: 'TOTAL OF SELECTED WORK',
    left: leftTotal,
    right: rightTotal,
    kind: 'total',
    ...variation(leftTotal, rightTotal)
  })
  return rows
}

/** One side, priced start to finish exactly as its own dashboard would price it. */
export interface ComparativeSideResult {
  inputs: ProjectPrintInputs
  /**
   * Lead as this year charges it. The sync re-prices every conveyance charge
   * against the year being synced, so these are the amounts actually inside the
   * item rates on this side — not the ones stored on the project.
   */
  leadApplications: LeadApplication[]
}

export async function evaluateComparativeSide(
  project: EestimateProject,
  side: ComparativeSide
): Promise<ComparativeSideResult> {
  const shadow = shadowProject(project, side)
  const items = collectProjectItems(shadow.root)
  const snapshot = await syncProjectDashboardSnapshot(shadow, items)
  const priced = { ...shadow, dashboardSnapshot: snapshot }
  const repriced = new Map(
    (snapshot.leadApplicationUpdates ?? []).map((application) => [application.id, application])
  )
  return {
    inputs: computeProjectPrintInputs(priced, items),
    leadApplications: (shadow.leadChart?.applications ?? []).map(
      (application) => repriced.get(application.id) ?? application
    )
  }
}

/**
 * Lead, charge by charge, in both years.
 *
 * Lead is already inside every item rate, so this page does not add to the
 * total — it shows where part of the movement came from. Conveyance is often
 * the largest single reason an estimate moves between schedules, and a
 * statement that buries it inside the item rates cannot be questioned.
 */
function compareLead(
  left: ComparativeSideResult,
  right: ComparativeSideResult,
  selection: ComparativeSelection
): ComparativeRow[] {
  const rightById = new Map(
    right.leadApplications.map((application) => [application.id, application])
  )
  const rows: ComparativeRow[] = []
  for (const application of left.leadApplications) {
    if (selection !== null && application.itemNodeId && !selection.has(application.itemNodeId)) {
      continue
    }
    const counterpart = rightById.get(application.id)
    const leftAmount = application.grossAmount
    const rightAmount = counterpart ? counterpart.grossAmount : null
    rows.push({
      key: `lead:${application.id}`,
      slNo: rows.length + 1,
      label: application.itemCode,
      description: application.quantitySource,
      unit: application.unit,
      quantity: application.quantity,
      leftRate: application.grossRate,
      rightRate: counterpart ? counterpart.grossRate : null,
      left: leftAmount,
      right: rightAmount,
      kind: 'item',
      ...variation(leftAmount, rightAmount)
    })
  }
  if (rows.length === 0) return rows
  const leftTotal = totalOf(rows, 'left')
  const rightTotal = totalOf(rows, 'right')
  rows.push({
    key: 'lead-total',
    slNo: null,
    label: 'TOTAL LEAD',
    left: leftTotal,
    right: rightTotal,
    kind: 'total',
    ...variation(leftTotal, rightTotal)
  })
  return rows
}

/**
 * Edits the merge could not place on either year's published sheet — recorded
 * by `recipeMerge.ts` while each side was being priced.
 */
function countUnresolvedEdits(...sides: ProjectPrintInputs[]): number {
  const seen = new Set<string>()
  for (const side of sides) {
    for (const recipe of Object.values(side.recipes)) {
      for (const entry of recipe.unresolvedEdits ?? []) {
        if (entry.reason === 'weak-match') continue
        seen.add(`${recipe.itemKey}|${entry.sectionKey}|${entry.description}`)
      }
    }
  }
  return seen.size
}

export interface ComparativeProgress {
  (stage: string): void
}

/**
 * Both years, priced and compared. `left` is always the earlier schedule.
 */
export async function buildComparativeStatement(
  project: EestimateProject,
  left: ComparativeSide,
  right: ComparativeSide,
  selection: ComparativeSelection = null,
  onProgress?: ComparativeProgress,
  includeLead = true
): Promise<ComparativeStatement> {
  onProgress?.(`Pricing ${left.year}`)
  const leftSide = await evaluateComparativeSide(project, left)
  onProgress?.(`Pricing ${right.year}`)
  const rightSide = await evaluateComparativeSide(project, right)
  onProgress?.('Comparing')
  const leftInputs = leftSide.inputs
  const rightInputs = rightSide.inputs

  const components = compareComponents(project, leftInputs, rightInputs, selection)
  // Over a partial selection the estimate's grand total is not this statement's
  // total: it includes work that was not compared. Report what was.
  const leftGrandTotal =
    selection === null
      ? leftInputs.abstract.grandTotal
      : components.reduce((sum, component) => sum + component.leftTotal, 0)
  const rightGrandTotal =
    selection === null
      ? rightInputs.abstract.grandTotal
      : components.reduce((sum, component) => sum + component.rightTotal, 0)
  const unresolved = countUnresolvedEdits(leftInputs, rightInputs)
  return {
    leftYear: left.year,
    rightYear: right.year,
    wholeEstimate: selection === null,
    warnings: [
      ...staleLeadWarnings(project, [left.year, right.year]),
      ...(unresolved > 0
        ? [
            {
              kind: 'unresolved-edit' as const,
              message:
                `${unresolved} edited DATA row${unresolved === 1 ? '' : 's'} could not be ` +
                'carried onto one of these schedules.',
              detail:
                'Those rows are priced as published for that year. Open the item’s DATA ' +
                'sheet to see which, and re-enter the edit if it still applies.'
            }
          ]
        : [])
    ],
    abstractRows: selectedAbstractRows(components, leftInputs, rightInputs, selection),
    components,
    leadRows: includeLead ? compareLead(leftSide, rightSide, selection) : [],
    leftGrandTotal,
    rightGrandTotal,
    ...variation(leftGrandTotal, rightGrandTotal)
  }
}
