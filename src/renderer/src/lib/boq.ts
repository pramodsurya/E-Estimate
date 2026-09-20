/**
 * Bill of Quantities (BOQ) aggregation for a component or sub-component.
 *
 * A BOQ is a flat schedule of every item under the section:
 *   S.No | Code | Description | Quantity | Unit | Rate | Cost
 * topped by the project and component names and closed with the total cost.
 *
 * Quantity/rate/amount resolution reuses the dashboard's final numbers
 * (`getItemFinal`), so the BOQ always agrees with the synced dashboard.
 */

import type { EestimateProject, ProjectNode } from '../types/project'
import { nodeDisplayName } from '../components/nodeVisual'
import { getItemFinal } from './finalNumber'
import { sortScheduleItems } from './itemOrder'

export interface BoqRow {
  sl: string
  code: string
  heading: string
  description: string
  quantity: number | null
  unit: string
  rate: number | null
  amount: number | null
}

export interface BoqData {
  projectName: string
  componentName: string
  isSubcomponent: boolean
  rows: BoqRow[]
  totalCost: number
}

/**
 * Every item under a section, in tree order. A component contributes its
 * direct items plus every item inside its sub-components; a sub-component
 * contributes its own items.
 */
export function collectBoqItems(node: ProjectNode): ProjectNode[] {
  const items: ProjectNode[] = []
  const visit = (current: ProjectNode): void => {
    if (current.kind === 'item') {
      items.push(current)
      return
    }
    current.children.forEach(visit)
  }
  node.children.forEach(visit)
  return items
}

export function buildBoqData(
  project: EestimateProject,
  node: ProjectNode,
  rateOf: (item: ProjectNode) => number | undefined = () => undefined
): BoqData {
  return assembleBoqData(
    project,
    node.name,
    node.kind === 'subcomponent',
    sortScheduleItems(collectBoqItems(node)),
    rateOf
  )
}

/**
 * Whole-project BOQ: every item across all components in the same
 * clearance → excavation → any → SOR schedule flow.
 */
export function buildProjectBoqData(
  project: EestimateProject,
  items: ProjectNode[],
  rateOf: (item: ProjectNode) => number | undefined = () => undefined
): BoqData {
  return assembleBoqData(project, 'General', false, sortScheduleItems(items), rateOf)
}

function assembleBoqData(
  project: EestimateProject,
  sectionName: string,
  isSubcomponent: boolean,
  items: ProjectNode[],
  rateOf: (item: ProjectNode) => number | undefined
): BoqData {
  const rows: BoqRow[] = items.map((item, index) => {
    const final = getItemFinal(project, item, rateOf(item), true)
    return {
      sl: String(index + 1),
      code: item.itemCode ?? '',
      heading: nodeDisplayName(item),
      description: item.itemDescription || '',
      quantity: final.qty,
      unit: item.unit ?? final.unit ?? '',
      rate: final.rate,
      amount: final.amount
    }
  })
  const totalCost = rows.reduce(
    (sum, row) => sum + (typeof row.amount === 'number' ? row.amount : 0),
    0
  )
  return {
    projectName: project.meta.name || project.root.name,
    componentName: sectionName,
    isSubcomponent,
    rows,
    totalCost
  }
}

/** Suggested download name for the BOQ workbook. */
export function boqFileName(projectName: string, componentName: string): string {
  const clean = (value: string): string =>
    value.replace(/[\\/:*?"<>|]/g, '').trim() || 'Estimate'
  return `${clean(projectName)} — ${clean(componentName)} — BOQ.xlsx`
}
