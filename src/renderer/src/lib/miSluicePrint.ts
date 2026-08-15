// New MI tank sluice "Detailed Estimate" page: the section drawing, the
// hydraulic check that sizes the vent, and the measurement table behind every
// generated SSR item. Returned as a full HTML document so it merges into the
// same combined component PDF as the other templates (see componentPrint.ts).

import type {
  EestimateProject,
  MiSluiceMaterialItem,
  MiSluiceNewData,
  ProjectNode
} from '../types/project'
import type { RateAnalysisRecipe, RateAnalysisTextRun } from '../types/rateAnalysis'
import {
  crownCover,
  hydraulicCapacity,
  miSluiceIssues,
  miSluiceQuantityGroups,
  openingArea,
  openingCrownLevel,
  openingLabel,
  type MiSluiceQuantityGroup
} from './miSluiceNew'
import { miSluiceSectionSvg } from './miSluiceFigure'
import { descriptionRunsForDisplay, plainTextRun } from './rateAnalysisVisibility'
import { findNode } from './tree'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function runHtml(run: RateAnalysisTextRun): string {
  let value = escapeHtml(run.text).replace(/\n/g, '<br>')
  if (run.bold) value = `<strong>${value}</strong>`
  if (run.italic) value = `<em>${value}</em>`
  if (run.underline) value = `<u>${value}</u>`
  return value
}

function descriptionHtml(item: ProjectNode | null, recipe: RateAnalysisRecipe | undefined): string {
  const fallback = item?.itemDescription || item?.name || ''
  const runs = recipe?.layout?.descriptionRuns?.length
    ? descriptionRunsForDisplay(recipe.description, recipe.layout.descriptionRuns)
    : [plainTextRun(fallback)]
  return runs.map(runHtml).join('')
}

const fmt3 = (value: number): string =>
  value.toLocaleString('en-IN', { maximumFractionDigits: 3 })

const fmt2 = (value: number): string => value.toFixed(2)

/** The generated item for a group, so its published description prints. */
function itemForGroup(
  root: ProjectNode,
  materialItems: MiSluiceMaterialItem[],
  group: MiSluiceQuantityGroup
): ProjectNode | null {
  const entry = materialItems.find(
    (material) => material.role === group.role && material.code === group.ref?.code
  )
  return entry ? findNode(root, entry.itemNodeId) : null
}

function groupBlock(
  project: EestimateProject,
  data: MiSluiceNewData,
  group: MiSluiceQuantityGroup,
  index: number,
  recipes: Record<string, RateAnalysisRecipe>
): string {
  const item = itemForGroup(project.root, data.materialItems ?? [], group)
  const description = group.ref
    ? descriptionHtml(item, item ? recipes[item.id] : undefined)
    : 'No SSR code attached — this quantity is carried in the template only.'
  const unit = group.unit.toLowerCase()
  const body = group.rows
    .map(
      (row) =>
        `<tr><td>${escapeHtml(row.label)}</td><td class="f">${escapeHtml(row.formula)}</td>` +
        `<td class="n">${fmt3(row.quantity)}</td><td class="c">${escapeHtml(unit)}</td></tr>`
    )
    .join('')
  const head = group.ref
    ? `${escapeHtml(group.ref.code)}${group.ref.unit ? ` <span class="u">Unit: ${escapeHtml(group.ref.unit)}</span>` : ''}`
    : 'code not attached'
  return (
    `<div class="msp-block"><h4>${index}. ${escapeHtml(group.label)} — ${head}</h4>` +
    `<p class="msp-desc">${description}</p>` +
    `<table class="msp-table"><thead><tr><th>Description</th><th>Calculation</th>` +
    `<th>Quantity</th><th>Unit</th></tr></thead><tbody>${body}` +
    `<tr class="tot"><td colspan="2">Total</td><td class="n">${fmt3(group.total)}</td>` +
    `<td class="c">${escapeHtml(unit)}</td></tr></tbody></table></div>`
  )
}

export function miSluiceDetailHtml(
  project: EestimateProject,
  section: ProjectNode,
  data: MiSluiceNewData,
  fontScale: number,
  recipes: Record<string, RateAnalysisRecipe>
): string {
  const groups = miSluiceQuantityGroups(data)
  const blocks = groups
    .map((group, index) => groupBlock(project, data, group, index + 1, recipes))
    .join('')

  const designRows: [string, string][] = [
    ['Type of intake', data.intakeType === 'tower' ? 'Intake tower' : 'Upstream headwall'],
    ['Clear opening', openingLabel(data)],
    ['Total clear area', `${fmt3(openingArea(data))} m²`],
    ['Sill level', `${fmt2(data.levels.sill)} m`],
    ['Vent crown level', `${fmt2(openingCrownLevel(data))} m`],
    ['Minimum operating level', `${fmt2(data.levels.minimumOperating)} m`],
    ['Cover over the crown', `${fmt2(crownCover(data))} m (minimum adopted ${fmt2(data.hydraulic.minimumCrownCover)} m)`],
    ['F.T.L / M.W.L / T.B.L', `${fmt2(data.levels.ftl)} / ${fmt2(data.levels.mwl)} / ${fmt2(data.levels.tbl)} m`],
    ['Coefficient of discharge', fmt2(data.hydraulic.dischargeCoefficient)],
    ['Design discharge', `${fmt3(data.hydraulic.designDischarge)} m³/s`],
    ['Capacity at the minimum operating level', `${fmt3(hydraulicCapacity(data))} m³/s`]
  ]
  const designTable =
    `<table class="msp-table msp-design"><tbody>${designRows
      .map(([head, value]) => `<tr><th>${escapeHtml(head)}</th><td>${escapeHtml(value)}</td></tr>`)
      .join('')}</tbody></table>`

  const issues = miSluiceIssues(data)
  const issueList = issues.length
    ? `<ul class="msp-issues">${issues
        .map(
          (issue) =>
            `<li class="${issue.kind}">${issue.kind === 'error' ? 'Check' : 'Note'}: ${escapeHtml(issue.message)}</li>`
        )
        .join('')}</ul>`
    : '<p class="msp-desc">The vent passes the design discharge at the minimum operating level.</p>'

  const meta = [
    data.intakeType === 'tower' ? 'Intake tower sluice' : 'Headwall sluice',
    openingLabel(data),
    `barrel ${fmt2(data.barrel.length)} m`
  ].join(' · ')

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    html,body{margin:0;color:#111;background:#fff;font-family:"Times New Roman",serif}
    body{font-size:${12 * fontScale}px}
    .section-banner{margin:0 0 8mm;padding:7px 9px;border-left:4px solid #447a9c;background:#edf5fa;font-family:Arial}
    .section-banner small{display:block;color:#4e6675;font-size:${9 * fontScale}px;text-transform:uppercase;letter-spacing:.6px}
    .section-banner strong{display:block;margin-top:2px;color:#163f57;font-size:${14 * fontScale}px}
    .section-banner .m{display:block;margin-top:3px;color:#4e6675;font-size:${10 * fontScale}px;font-family:"Times New Roman",serif}
    h3{font-size:${13 * fontScale}px;font-weight:700;border-bottom:1px solid #bbb;padding-bottom:4px;margin:14px 0 10px;font-family:Arial;break-after:avoid;page-break-after:avoid}
    h4{font-size:${12.5 * fontScale}px;margin:12px 0 4px;font-family:Arial;break-after:avoid;page-break-after:avoid}
    h4 .u{font-weight:400;color:#555;font-size:${10 * fontScale}px}
    .msp-desc{margin:0 0 6px;line-height:1.4;break-after:avoid;page-break-after:avoid}
    .msp-fig{margin-bottom:12px;break-inside:avoid;page-break-inside:avoid}
    .msp-fig .mis-figure{width:100%;max-width:660px;display:block;border:1px solid #ccc}
    .msp-block{break-inside:avoid;page-break-inside:avoid}
    .msp-table{width:100%;border-collapse:collapse;font-size:${11 * fontScale}px;margin-bottom:10px}
    .msp-table thead{display:table-header-group}
    .msp-table tr{break-inside:avoid;page-break-inside:avoid}
    .msp-table th,.msp-table td{border:1px solid #999;padding:4px 7px;text-align:left}
    .msp-table th{background:#eee;font-weight:600}
    .msp-table .n{text-align:right;font-variant-numeric:tabular-nums}
    .msp-table .c{text-align:center}
    .msp-table .f{font-family:monospace;font-size:${10 * fontScale}px;color:#444}
    .msp-table .tot td{font-weight:700;background:#f6f6f0}
    .msp-design th{width:42%;background:#f6f6f0}
    .msp-issues{margin:0 0 8px;padding-left:18px;font-size:${11.5 * fontScale}px}
    .msp-issues .error{color:#8a2b1c}
    .msp-issues .warning{color:#7a5c12}
  </style></head><body>
    <div class="section-banner"><small>Detailed Estimate</small><strong>${escapeHtml(section.name)}</strong><span class="m">${escapeHtml(meta)}</span></div>
    <h3>1. Section through the sluice</h3>
    <div class="msp-fig">${miSluiceSectionSvg(data)}</div>
    <h3>2. Design and hydraulic check</h3>
    ${designTable}
    ${issueList}
    <h3>3. Measurements</h3>
    ${blocks}
  </body></html>`
}
