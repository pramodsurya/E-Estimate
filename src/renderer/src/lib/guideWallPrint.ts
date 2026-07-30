// Guide Wall "Detailed Estimate" page: to-scale cross-section drawings plus the
// measurement tables that back the computed quantities. Returned as a full HTML
// document so it merges into the same combined component PDF as every other
// component's detailed estimate (shared look — see componentPrint.ts).

import type {
  EestimateProject,
  GuideWallData,
  GuideWallMaterialItem,
  GuideWallMaterialRef,
  GuideWallSection,
  ProjectNode
} from '../types/project'
import type { RateAnalysisRecipe, RateAnalysisTextRun } from '../types/rateAnalysis'
import {
  baseMaterialGroups,
  chainageRangeLabel,
  excavationGrandTotal,
  excavationRowLength,
  excavationRowTotal,
  formatChainage,
  hasLeftWall,
  hasRightWall,
  quantityRowsTotal,
  sideModeLabel,
  wallBottomWidth,
  wallMaterialGroups,
  type GuideWallMaterialGroup,
  type GuideWallQtyRow
} from './guideWall'
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

const fmt3 = (value: number | null | undefined): string =>
  value == null ? '—' : value.toLocaleString('en-IN', { maximumFractionDigits: 3 })

interface SectionGroup {
  sample: GuideWallSection
  ranges: { fromCh: number; toCh: number }[]
}

function groupSections(sections: GuideWallSection[]): SectionGroup[] {
  const groups: SectionGroup[] = []
  for (const section of sections) {
    const key = JSON.stringify({
      sideMode: section.sideMode,
      left: section.left,
      right: section.right,
      gap: section.gap,
      baseWidth: section.baseWidth,
      baseThickness: section.baseThickness
    })
    const found = groups.find((g) => JSON.stringify({
      sideMode: g.sample.sideMode,
      left: g.sample.left,
      right: g.sample.right,
      gap: g.sample.gap,
      baseWidth: g.sample.baseWidth,
      baseThickness: g.sample.baseThickness
    }) === key)
    if (found) found.ranges.push({ fromCh: section.fromCh, toCh: section.toCh })
    else groups.push({ sample: section, ranges: [{ fromCh: section.fromCh, toCh: section.toCh }] })
  }
  return groups
}

const DIM = '#1a4a7a'

/** Horizontal dimension: extension lines, arrowed dimension line, and label. */
function hDim(x1: number, x2: number, featY: number, dimY: number, label: string, below = false): string {
  const over = dimY >= featY ? 5 : -5
  const ext =
    `<line x1="${x1}" y1="${featY}" x2="${x1}" y2="${dimY + over}" stroke="${DIM}" stroke-width="0.6"/>` +
    `<line x1="${x2}" y1="${featY}" x2="${x2}" y2="${dimY + over}" stroke="${DIM}" stroke-width="0.6"/>`
  const line = `<line x1="${x1}" y1="${dimY}" x2="${x2}" y2="${dimY}" stroke="${DIM}" stroke-width="0.9" marker-start="url(#gwdim)" marker-end="url(#gwdim)"/>`
  const ty = below ? dimY + 15 : dimY - 6
  const txt = `<text x="${(x1 + x2) / 2}" y="${ty}" text-anchor="middle" fill="${DIM}" font-size="13" font-family="Arial">${label}</text>`
  return ext + line + txt
}

/** Vertical dimension. `side` places the rotated label left or right of the line. */
function vDim(y1: number, y2: number, featX: number, dimX: number, label: string, side: 'left' | 'right'): string {
  const over = dimX >= featX ? 5 : -5
  const ext =
    `<line x1="${featX}" y1="${y1}" x2="${dimX + over}" y2="${y1}" stroke="${DIM}" stroke-width="0.6"/>` +
    `<line x1="${featX}" y1="${y2}" x2="${dimX + over}" y2="${y2}" stroke="${DIM}" stroke-width="0.6"/>`
  const line = `<line x1="${dimX}" y1="${y1}" x2="${dimX}" y2="${y2}" stroke="${DIM}" stroke-width="0.9" marker-start="url(#gwdim)" marker-end="url(#gwdim)"/>`
  const my = (y1 + y2) / 2
  const tx = side === 'left' ? dimX - 6 : dimX + 6
  const txt = `<text x="${tx}" y="${my}" text-anchor="middle" fill="${DIM}" font-size="13" font-family="Arial" transform="rotate(-90 ${tx} ${my})">${label}</text>`
  return ext + line + txt
}

/**
 * Cross-section as a fully dimensioned engineering drawing: base slab, one or
 * two walls (vertical inner face, battered outer face), with dimension lines
 * and labels for every measurement plus a metre scale bar.
 */
function sectionSvg(section: GuideWallSection): string {
  const left = hasLeftWall(section) ? section.left : null
  const right = hasRightWall(section) ? section.right : null
  const bottomL = left ? wallBottomWidth(left) : 0
  const bottomR = right ? wallBottomWidth(right) : 0
  const both = Boolean(left && right)
  const occupied = both ? bottomL + section.gap + bottomR : Math.max(bottomL, bottomR)
  const worldW = Math.max(section.baseWidth, occupied)
  const maxWallH = Math.max(left?.height ?? 0, right?.height ?? 0)
  const worldH = maxWallH + section.baseThickness

  const W = 720
  const H = 400
  const mL = 88
  const mR = 88
  const mT = 60
  const mB = 108
  const pxPerM = Math.min((W - mL - mR) / worldW, (H - mT - mB) / worldH)

  const cx = W / 2
  const baseThick = Math.max(section.baseThickness * pxPerM, 3)
  const drawnH = worldH * pxPerM
  const topY = mT + (H - mT - mB - drawnH) / 2
  const baseTop = topY + maxWallH * pxPerM
  const baseBottom = baseTop + baseThick
  const baseW = section.baseWidth * pxPerM
  const baseLeft = cx - baseW / 2
  const baseRight = cx + baseW / 2
  const gapPx = section.gap * pxPerM
  const innerLeftX = both ? cx - gapPx / 2 : cx + (bottomL * pxPerM) / 2
  const innerRightX = both ? cx + gapPx / 2 : cx - (bottomR * pxPerM) / 2

  const shapes: string[] = []
  const dims: string[] = []

  // Base slab.
  shapes.push(
    `<rect x="${baseLeft}" y="${baseTop}" width="${baseW}" height="${baseThick}" fill="#c9c9c0" stroke="#222" stroke-width="1.4"/>`
  )

  // Walls.
  let leftGeom: { topLeftX: number; outerX: number; innerX: number; topY: number } | null = null
  let rightGeom: { topRightX: number; outerX: number; innerX: number; topY: number } | null = null
  if (left) {
    const topW = Math.max(left.topWidth * pxPerM, 2)
    const botW = Math.max(bottomL * pxPerM, 2)
    const wy = baseTop - left.height * pxPerM
    const x = innerLeftX
    shapes.push(
      `<path d="M ${x} ${baseTop} L ${x} ${wy} L ${x - topW} ${wy} L ${x - botW} ${baseTop} Z" fill="#e6e6dd" stroke="#222" stroke-width="1.6"/>`
    )
    leftGeom = { topLeftX: x - topW, outerX: x - botW, innerX: x, topY: wy }
  }
  if (right) {
    const topW = Math.max(right.topWidth * pxPerM, 2)
    const botW = Math.max(bottomR * pxPerM, 2)
    const wy = baseTop - right.height * pxPerM
    const x = innerRightX
    shapes.push(
      `<path d="M ${x} ${baseTop} L ${x} ${wy} L ${x + topW} ${wy} L ${x + botW} ${baseTop} Z" fill="#e6e6dd" stroke="#222" stroke-width="1.6"/>`
    )
    rightGeom = { topRightX: x + topW, outerX: x + botW, innerX: x, topY: wy }
  }

  // Top-width dimensions above each wall top.
  if (left && leftGeom) {
    dims.push(hDim(leftGeom.topLeftX, leftGeom.innerX, leftGeom.topY, leftGeom.topY - 20, left.topWidth.toFixed(2)))
    // Slope label along the battered (outer) face.
    const mxp = (leftGeom.topLeftX + leftGeom.outerX) / 2
    const myp = (leftGeom.topY + baseTop) / 2
    const ang = (Math.atan2(baseTop - leftGeom.topY, leftGeom.outerX - leftGeom.topLeftX) * 180) / Math.PI
    dims.push(
      `<text x="${mxp - 6}" y="${myp}" text-anchor="middle" fill="#555" font-size="11" font-family="Arial" transform="rotate(${ang} ${mxp - 6} ${myp})">1:${left.faceSlope.toFixed(2)}</text>`
    )
  }
  if (right && rightGeom) {
    dims.push(hDim(rightGeom.innerX, rightGeom.topRightX, rightGeom.topY, rightGeom.topY - 20, right.topWidth.toFixed(2)))
    const mxp = (rightGeom.topRightX + rightGeom.outerX) / 2
    const myp = (rightGeom.topY + baseTop) / 2
    const ang = (Math.atan2(baseTop - rightGeom.topY, rightGeom.outerX - rightGeom.innerX) * 180) / Math.PI
    dims.push(
      `<text x="${mxp + 6}" y="${myp}" text-anchor="middle" fill="#555" font-size="11" font-family="Arial" transform="rotate(${ang} ${mxp + 6} ${myp})">1:${right.faceSlope.toFixed(2)}</text>`
    )
  }

  // Wall height dimensions on the outer sides.
  if (left && leftGeom) {
    dims.push(vDim(leftGeom.topY, baseTop, leftGeom.outerX, baseLeft - 54, left.height.toFixed(2), 'left'))
  }
  if (right && rightGeom) {
    dims.push(vDim(rightGeom.topY, baseTop, rightGeom.outerX, baseRight + 54, right.height.toFixed(2), 'right'))
  }

  // Clear gap between inner faces (both walls only).
  if (both) {
    dims.push(hDim(innerLeftX, innerRightX, baseTop, baseTop - 16, section.gap.toFixed(2)))
  }

  // Base thickness on the left, base width below everything.
  dims.push(vDim(baseTop, baseBottom, baseLeft, baseLeft - 24, section.baseThickness.toFixed(2), 'left'))
  dims.push(hDim(baseLeft, baseRight, baseBottom, baseBottom + 40, section.baseWidth.toFixed(2), true))

  // Metre scale bar (bottom-left) and a units note.
  const bars = Math.min(Math.max(1, Math.floor((W - mL - mR) / pxPerM)), 8)
  const barY = H - 26
  const scale: string[] = []
  for (let i = 0; i < bars; i += 1) {
    scale.push(
      `<rect x="${mL + i * pxPerM}" y="${barY}" width="${pxPerM}" height="6" fill="${i % 2 === 0 ? '#222' : '#fff'}" stroke="#222" stroke-width="0.8"/>`
    )
  }
  scale.push(`<text x="${mL}" y="${barY - 4}" fill="#333" font-size="11">0</text>`)
  scale.push(
    `<text x="${mL + bars * pxPerM}" y="${barY - 4}" text-anchor="middle" fill="#333" font-size="11">${bars} m</text>`
  )
  scale.push(`<text x="${W - mR}" y="${barY + 5}" text-anchor="end" fill="#777" font-size="10.5" font-family="Arial">All dimensions in metres</text>`)

  const defs = `<defs><marker id="gwdim" markerUnits="userSpaceOnUse" markerWidth="9" markerHeight="8" refX="8" refY="3" orient="auto-start-reverse"><path d="M0,0 L8,3 L0,6 Z" fill="${DIM}"/></marker></defs>`
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" class="gwp-figure">${defs}${shapes.join('')}${dims.join('')}${scale.join('')}</svg>`
}

function qtyTableHtml(rows: GuideWallQtyRow[]): string {
  const body = rows
    .map(
      (row, index) =>
        `<tr><td class="c">${index + 1}</td><td>Ch ${escapeHtml(chainageRangeLabel(row))}</td><td>${escapeHtml(row.side)}</td><td class="n">${fmt3(row.lengthM)}</td><td class="f">${escapeHtml(row.formula)}</td><td class="n">${fmt3(row.qty)}</td></tr>`
    )
    .join('')
  return `<table class="gwp-table"><thead><tr><th>S.No</th><th>Chainage</th><th>Side</th><th>Length</th><th>Calculation</th><th>Qty (cum)</th></tr></thead><tbody>${body}<tr class="tot"><td colspan="5">Total</td><td class="n">${fmt3(quantityRowsTotal(rows))}</td></tr></tbody></table>`
}

/** Look up the generated item node for a (role, code) so the description prints. */
function itemForCode(
  root: ProjectNode,
  materialItems: GuideWallMaterialItem[],
  role: GuideWallMaterialItem['role'],
  code: string
): ProjectNode | null {
  const entry = materialItems.find((m) => m.role === role && m.code === code)
  return entry ? findNode(root, entry.itemNodeId) : null
}

function materialBlock(
  root: ProjectNode,
  materialItems: GuideWallMaterialItem[],
  ref: GuideWallMaterialRef,
  role: GuideWallMaterialItem['role'],
  recipes: Record<string, RateAnalysisRecipe>,
  heading: string,
  tableHtml: string
): string {
  const item = itemForCode(root, materialItems, role, ref.code)
  const desc = descriptionHtml(item, item ? recipes[item.id] : undefined)
  const unit = ref.unit ?? item?.unit
  return `<div class="gwp-block"><h4>${escapeHtml(heading)} — ${escapeHtml(ref.code)}${unit ? ` <span class="u">Unit: ${escapeHtml(unit)}</span>` : ''}</h4><p class="gwp-desc">${desc}</p>${tableHtml}</div>`
}

function groupHeading(base: string, group: GuideWallMaterialGroup, multiple: boolean): string {
  return multiple ? `${base} (Ch ${groupChainageSummary(group)})` : base
}

function groupChainageSummary(group: GuideWallMaterialGroup): string {
  const from = Math.min(...group.rows.map((r) => r.fromCh))
  const to = Math.max(...group.rows.map((r) => r.toCh))
  return `${formatChainage(from)}–${formatChainage(to)}`
}

export function guideWallDetailHtml(
  project: EestimateProject,
  section: ProjectNode,
  data: GuideWallData,
  fontScale: number,
  recipes: Record<string, RateAnalysisRecipe>
): string {
  const groups = groupSections(data.sections)
  const figures = groups
    .map((group, index) => {
      const ranges = group.ranges.map((r) => `Ch ${chainageRangeLabel(r)}`).join(', ')
      return `<div class="gwp-fig-wrap"><div class="gwp-cap"><b>Type ${String.fromCharCode(65 + index)}</b> — ${escapeHtml(sideModeLabel(group.sample.sideMode))}. Applies at: ${escapeHtml(ranges)}</div>${sectionSvg(group.sample)}</div>`
    })
    .join('')

  const excBody = data.excavationRows
    .map(
      (row, index) =>
        `<tr><td class="c">${index + 1}</td><td>${row.fromCh ?? '—'}</td><td>${row.toCh ?? '—'}</td><td class="n">${fmt3(excavationRowLength(row))}</td><td class="n">${fmt3(row.breadth)}</td><td class="n">${fmt3(row.height)}</td><td class="n">${fmt3(excavationRowTotal(row))}</td></tr>`
    )
    .join('')
  const excTable = data.excavationRows.length
    ? `<table class="gwp-table"><thead><tr><th>S.No</th><th>From Ch</th><th>To Ch</th><th>L</th><th>B</th><th>H</th><th>Qty</th></tr></thead><tbody>${excBody}<tr class="tot"><td colspan="6">Total</td><td class="n">${fmt3(excavationGrandTotal(data.excavationRows))}</td></tr></tbody></table>`
    : ''

  const wallGroups = wallMaterialGroups(data)
  const baseGroups = baseMaterialGroups(data)
  const items = data.materialItems ?? []
  const wallBlock = wallGroups
    .map((g) =>
      materialBlock(
        project.root,
        items,
        g.ref,
        'wall',
        recipes,
        groupHeading('Wall concrete', g, wallGroups.length > 1),
        qtyTableHtml(g.rows)
      )
    )
    .join('')
  const baseBlock = baseGroups
    .map((g) =>
      materialBlock(
        project.root,
        items,
        g.ref,
        'base',
        recipes,
        groupHeading('Base slab concrete', g, baseGroups.length > 1),
        qtyTableHtml(g.rows)
      )
    )
    .join('')
  const excBlock =
    excTable && data.excavationMaterial
      ? materialBlock(project.root, items, data.excavationMaterial, 'excavation', recipes, 'Excavation', excTable)
      : ''

  const meta = [
    `Total length ${formatChainage(data.lengthM)} m`,
    data.sectionMode === 'continuous'
      ? `sections every ${formatChainage(data.intervalM)} m`
      : `${data.sections.length} marked sections`
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
    h4{font-size:${12.5 * fontScale}px;margin:12px 0 4px;font-family:Arial;break-after:avoid;page-break-after:avoid}h4 .u{font-weight:400;color:#555;font-size:${10 * fontScale}px}
    .gwp-desc{margin:0 0 6px;line-height:1.4;break-after:avoid;page-break-after:avoid}
    .gwp-fig-wrap{margin-bottom:12px;break-inside:avoid;page-break-inside:avoid}
    .gwp-cap{font-size:${11.5 * fontScale}px;margin-bottom:5px}
    .gwp-figure{width:100%;max-width:640px;display:block;border:1px solid #ccc;background:#fbfbfa}
    /* Long measurement tables flow across pages instead of being pushed whole. */
    .gwp-table{width:100%;border-collapse:collapse;font-size:${11 * fontScale}px;margin-bottom:10px}
    .gwp-table thead{display:table-header-group}
    .gwp-table tr{break-inside:avoid;page-break-inside:avoid}
    .gwp-table th,.gwp-table td{border:1px solid #999;padding:4px 7px;text-align:left}
    .gwp-table th{background:#eee;font-weight:600}
    .gwp-table .n{text-align:right;font-variant-numeric:tabular-nums}.gwp-table .c{text-align:center}
    .gwp-table .f{font-family:monospace;font-size:${10 * fontScale}px;color:#444}
    .gwp-table .tot td{font-weight:700;background:#f6f6f0}
  </style></head><body>
    <div class="section-banner"><small>Detailed Estimate</small><strong>${escapeHtml(section.name)}</strong><span class="m">${escapeHtml(meta)}</span></div>
    <h3>1. Typical cross-sections</h3>${figures}
    <h3>2. Concrete quantities</h3>${wallBlock}${baseBlock}
    ${excBlock ? `<h3>3. Excavation</h3>${excBlock}` : ''}
  </body></html>`
}
