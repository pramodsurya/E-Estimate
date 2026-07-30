/**
 * The project General Abstract — the single source of truth shared by the
 * Project Dashboard and the project print view.
 *
 * Shape of the statement:
 *
 *   1..N  Components                        (tree order)
 *         TOTAL                             (sum of components)
 *   N+1   Add Seigniorage charges           from the Seigniorage dashboard
 *   N+2   DMF 30%                           from the Seigniorage dashboard
 *   N+3   SMET 2%                           from the Seigniorage dashboard
 *   N+4   NAC @ 0.1%                        of the components TOTAL
 *   N+5   Labour Cess @ 1%                  of the components TOTAL
 *   N+6   Permit fee                        from the Seigniorage dashboard
 *   ...   Miscellaneous rows                entered by the estimator
 *   last  LS Add G.S.T @ x%                 on everything above
 *         GRAND TOTAL
 */

import type { EestimateProject, ProjectNode } from '../types/project'
import { roundEstimateTotalUp } from './estimateAmount'
import { componentItemsTotal } from './finalNumber'

/** Charges levied on the components total rather than on seigniorage. */
export const DEFAULT_NAC_PERCENT = 0.1
export const DEFAULT_LABOUR_CESS_PERCENT = 1

export type AbstractLineKind =
  | 'component'
  | 'total'
  | 'charge'
  | 'miscellaneous'
  | 'gst'
  | 'grand'

export interface AbstractLine {
  /** Stable key for React and for print rendering. */
  key: string
  /** Serial number shown in the Sl. No. column; null for TOTAL/GRAND rows. */
  slNo: number | null
  label: string
  amount: number
  kind: AbstractLineKind
  /** Component lines carry their node id so the row can be clicked through. */
  nodeId?: string
  /** How the amount was derived, e.g. "0.1% of Total". */
  basisNote?: string
}

export interface ProjectAbstractInput {
  project: EestimateProject
  /** Totals frozen by each Component Dashboard Sync, keyed by component id. */
  componentTotals?: Record<string, number>
  /** Live DATA rate for an item, when one has been fetched. */
  rateOf?: (node: ProjectNode) => number | null | undefined
  /** Treat rateOf as a frozen final DATA rate (including Lead), without live overlays. */
  useDataRateExactly?: boolean
  /** Totals lifted straight from the Seigniorage dashboard. */
  seigniorage: {
    totalSeigniorage: number
    totalDmft: number
    totalSmft: number
    totalPermit: number
  }
  /** Resolved GST rate (percent). */
  gstRate: number
  nacPercent?: number
  labourCessPercent?: number
}

export interface ProjectAbstract {
  /** One line per component, in tree order. */
  componentLines: AbstractLine[]
  componentsTotal: number
  /** Seigniorage, DMF, SMET, NAC, Labour Cess, Permit. */
  chargeLines: AbstractLine[]
  chargesTotal: number
  miscellaneousLines: AbstractLine[]
  miscellaneousTotal: number
  /** The amount GST is charged on: components + charges + miscellaneous. */
  gstBase: number
  gstRate: number
  gstAmount: number
  /** Exact calculated total before the final upward whole-rupee rounding. */
  calculatedGrandTotal: number
  /** Authoritative rounded estimate used by the Dashboard, cover and print view. */
  grandTotal: number
  roundedGrandTotal: number
  /** Every line in printed order, including the TOTAL and GRAND TOTAL rows. */
  lines: AbstractLine[]
}

export function computeProjectAbstract(input: ProjectAbstractInput): ProjectAbstract {
  const { project, componentTotals, rateOf, seigniorage, gstRate } = input
  const nacPercent = input.nacPercent ?? DEFAULT_NAC_PERCENT
  const labourCessPercent = input.labourCessPercent ?? DEFAULT_LABOUR_CESS_PERCENT

  const components = project.root.children.filter((child) => child.kind === 'component')

  let slNo = 0
  const componentLines: AbstractLine[] = components.map((component) => {
    slNo += 1
    return {
      key: `component:${component.id}`,
      slNo,
      label: component.name,
      amount:
        typeof componentTotals?.[component.id] === 'number'
          ? componentTotals[component.id]
          : componentItemsTotal(project, component, rateOf, input.useDataRateExactly),
      kind: 'component' as const,
      nodeId: component.id
    }
  })
  const componentsTotal = componentLines.reduce((sum, line) => sum + line.amount, 0)

  const totalLine: AbstractLine = {
    key: 'components-total',
    slNo: null,
    label: 'TOTAL',
    amount: componentsTotal,
    kind: 'total'
  }

  const charge = (
    key: string,
    label: string,
    amount: number,
    basisNote?: string
  ): AbstractLine => {
    slNo += 1
    return { key, slNo, label, amount, kind: 'charge', basisNote }
  }

  const chargeLines: AbstractLine[] = [
    charge('seigniorage', 'Add Seigniorage charges', seigniorage.totalSeigniorage),
    charge('dmf', 'DMF 30%', seigniorage.totalDmft, '30% of seigniorage'),
    charge('smet', 'SMET 2%', seigniorage.totalSmft, '2% of seigniorage'),
    charge(
      'nac',
      `NAC @ ${formatPercent(nacPercent)}%`,
      (componentsTotal * nacPercent) / 100,
      `${formatPercent(nacPercent)}% of Total`
    ),
    charge(
      'labour-cess',
      `Labour Cess @ ${formatPercent(labourCessPercent)}%`,
      (componentsTotal * labourCessPercent) / 100,
      `${formatPercent(labourCessPercent)}% of Total`
    ),
    charge('permit', 'Permit fee', seigniorage.totalPermit)
  ]
  const chargesTotal = chargeLines.reduce((sum, line) => sum + line.amount, 0)

  const miscellaneousLines: AbstractLine[] = (project.miscellaneousItems ?? []).map((misc) => {
    slNo += 1
    return {
      key: `misc:${misc.id}`,
      slNo,
      label: misc.name,
      amount: misc.cost,
      kind: 'miscellaneous' as const
    }
  })
  const miscellaneousTotal = miscellaneousLines.reduce((sum, line) => sum + line.amount, 0)

  const gstBase = componentsTotal + chargesTotal + miscellaneousTotal
  const gstAmount = (gstBase * gstRate) / 100
  slNo += 1
  const gstLine: AbstractLine = {
    key: 'gst',
    slNo,
    label: `LS Add G.S.T @ ${formatPercent(gstRate)}%`,
    amount: gstAmount,
    kind: 'gst',
    basisNote: `${formatPercent(gstRate)}% of Total + charges`
  }

  const calculatedGrandTotal = gstBase + gstAmount
  const grandTotal = roundEstimateTotalUp(calculatedGrandTotal)
  const grandLine: AbstractLine = {
    key: 'grand-total',
    slNo: null,
    label: 'GRAND TOTAL',
    amount: grandTotal,
    kind: 'grand'
  }

  return {
    componentLines,
    componentsTotal,
    chargeLines,
    chargesTotal,
    miscellaneousLines,
    miscellaneousTotal,
    gstBase,
    gstRate,
    gstAmount,
    calculatedGrandTotal,
    grandTotal,
    roundedGrandTotal: grandTotal,
    lines: [
      ...componentLines,
      totalLine,
      ...chargeLines,
      ...miscellaneousLines,
      gstLine,
      grandLine
    ]
  }
}

/** Trims trailing zeros so 0.1 prints as "0.1" and 18 as "18". */
function formatPercent(value: number): string {
  return String(Number(value.toFixed(4)))
}
