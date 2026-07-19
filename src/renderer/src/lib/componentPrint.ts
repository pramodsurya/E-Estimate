import { PDFDocument } from 'pdf-lib'
import type { EestimateProject, Margins, Orientation, PaperSize, PrintConfig, ProjectNode } from '../types/project'
import type { RateAnalysisRecipe, RateAnalysisTextRun } from '../types/rateAnalysis'
import { createUniverWorkbookData } from './univerSpreadsheet'
import { buildPrintHtml, type PdfOptions } from './printRender'
import { resolveNodeSettings } from './nodeSettings'
import { descriptionRunsForDisplay, plainTextRun } from './rateAnalysisVisibility'
import { nodeDisplayName } from '../components/nodeVisual'
import { componentItemsTotal, getItemFinal } from './finalNumber'

const DEFAULT_MARGINS: Margins = { top: 20, right: 15, bottom: 20, left: 25 }

export interface CombinedPrintInput {
  project: EestimateProject
  section: ProjectNode
  recipes: Record<string, RateAnalysisRecipe>
  rateOf: (node: ProjectNode) => number | undefined
  total: number
  fontScale?: number
}

interface ItemRender {
  item: ProjectNode
  config: Required<Pick<PrintConfig, 'pageSize' | 'orientation' | 'margins'>> & PrintConfig
  body: string
  scale: number
  description: string
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatNumber(value: number | null, maximumFractionDigits = 2): string {
  return value === null
    ? ''
    : value.toLocaleString('en-IN', { maximumFractionDigits })
}

function runHtml(run: RateAnalysisTextRun): string {
  let value = escapeHtml(run.text).replace(/\n/g, '<br>')
  if (run.bold) value = `<strong>${value}</strong>`
  if (run.italic) value = `<em>${value}</em>`
  if (run.underline) value = `<u>${value}</u>`
  return value
}

function itemDescription(item: ProjectNode, recipe?: RateAnalysisRecipe): string {
  const runs = recipe?.layout?.descriptionRuns?.length
    ? descriptionRunsForDisplay(recipe.description, recipe.layout.descriptionRuns)
    : [plainTextRun(item.itemDescription || nodeDisplayName(item))]
  return runs.map(runHtml).join('')
}

function extractBody(html: string): string {
  const match = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html)
  return match?.[1] ?? html
}

function itemPrintConfig(project: EestimateProject, item: ProjectNode): ItemRender['config'] {
  const inherited = resolveNodeSettings(project.root, item.id)
  return {
    ...item.print,
    range: item.print?.range ?? null,
    pageSize: item.print?.pageSize ?? inherited.pageSize ?? 'A4',
    orientation: item.print?.orientation ?? inherited.orientation ?? 'portrait',
    margins: item.print?.margins ?? inherited.margins ?? DEFAULT_MARGINS,
    scaleMode: item.print?.scaleMode ?? 'fit-width',
    scalePercent: item.print?.scalePercent ?? 100,
    fitToWidthPages: item.print?.fitToWidthPages ?? 1,
    showHeader: false,
    showFooter: false,
    showGridlines: item.print?.showGridlines ?? true,
    repeatHeaderRows: item.print?.repeatHeaderRows ?? 0,
    showRowColHeaders: item.print?.showRowColHeaders ?? false
  }
}

function basePdfOptions(pageSize: PaperSize, orientation: Orientation): PdfOptions {
  return {
    pageSize,
    landscape: orientation === 'landscape',
    margins: { top: 0, right: 0, bottom: 0, left: 0 },
    printBackground: true,
    scale: 1,
    displayHeaderFooter: false,
    headerTemplate: '<span></span>',
    footerTemplate: '<span></span>',
    preferCSSPageSize: false
  }
}

function abstractHtml(
  input: CombinedPrintInput,
  section: ProjectNode,
  items: ProjectNode[],
  total: number,
  subcomponentSummaries: Array<{ section: ProjectNode; total: number }> = []
): string {
  const fontScale = input.fontScale ?? 1
  const itemRows = items.map((item, index) => {
    const final = getItemFinal(input.project, item, input.rateOf(item))
    return `<tr><td class="abstract-sl">${index + 1}</td><td class="abstract-description"><strong>${escapeHtml(nodeDisplayName(item))}</strong><br><span>${escapeHtml(item.itemDescription ?? '')}</span></td><td class="abstract-unit">${escapeHtml(item.unit ?? final.unit ?? '')}</td><td class="abstract-number">${formatNumber(final.qty, 3)}</td><td class="abstract-number">${formatNumber(final.rate)}</td><td class="abstract-number abstract-amount">${formatNumber(final.amount)}</td></tr>`
  }).join('')
  const summaryRows = subcomponentSummaries.map(({ section: subcomponent, total: subcomponentTotal }, index) =>
    `<tr class="abstract-subcomponent"><td class="abstract-sl">S${index + 1}</td><td class="abstract-description"><strong>${escapeHtml(subcomponent.name)}</strong><br><span>Sub-component · separate General Abstract follows</span></td><td class="abstract-unit">LS</td><td class="abstract-number"></td><td class="abstract-number"></td><td class="abstract-number abstract-amount">${formatNumber(subcomponentTotal)}</td></tr>`
  ).join('')
  const abstractLabel = section.kind === 'subcomponent' ? 'Sub-component General Abstract' : 'Component Abstract'
  const totalLabel = section.kind === 'subcomponent' ? 'Sub-component Total' : 'Component Total'
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    body{margin:0;padding:16mm 14mm;font:${11 * fontScale}px Arial;color:#111}
    header{display:flex;justify-content:space-between;gap:20px;border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:12px}
    h1{font-size:${18 * fontScale}px;margin:3px 0}.total{font-size:${16 * fontScale}px;font-weight:700}
    table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #777;padding:5px 6px;vertical-align:top;white-space:normal}
    th{background:#eee;text-align:center;line-height:1.2;overflow-wrap:break-word}
    .abstract-sl{text-align:center}.abstract-description{line-height:1.35;overflow-wrap:anywhere;word-break:normal}.abstract-description strong{display:inline-block;margin-bottom:2px}.abstract-unit{text-align:center;overflow-wrap:anywhere}.abstract-number{text-align:right;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
    .abstract-subcomponent td{background:#edf5fa;border-top:2px solid #447a9c}.abstract-subcomponent .abstract-description strong{color:#174d6c}
    td span{font-size:${9 * fontScale}px;color:#444}footer{display:flex;justify-content:space-between;border-top:2px solid #111;margin-top:12px;padding-top:8px;font-size:${14 * fontScale}px}
  </style></head><body><header><div><small>${escapeHtml(input.project.meta.name)}</small><h1>${escapeHtml(section.name)}</h1><b>${abstractLabel}</b></div><div class="total">Rs. ${total.toLocaleString('en-IN')}</div></header>
  <table><colgroup><col style="width:5%"><col style="width:54%"><col style="width:7%"><col style="width:10%"><col style="width:10%"><col style="width:14%"></colgroup><thead><tr><th>Sl.</th><th>Description</th><th>Unit</th><th>Quantity</th><th>Rate</th><th>Amount</th></tr></thead><tbody>${itemRows}${summaryRows}</tbody></table>
  <footer><span>${totalLabel}</span><strong>Rs. ${total.toLocaleString('en-IN')}</strong></footer></body></html>`
}

function splitSheetStart(body: string): { first: string; remaining: string } {
  const table = /(<table\b[^>]*>)([\s\S]*?)(<\/table>)/i.exec(body)
  if (!table) return { first: body, remaining: '' }
  const beforeTable = body.slice(0, table.index).trim()
  const afterTable = body.slice((table.index ?? 0) + table[0].length).trim()
  if (beforeTable || afterTable) return { first: body, remaining: '' }

  const inner = table[2]
  const tbody = /<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i.exec(inner)
  if (!tbody) return { first: body, remaining: '' }
  const rows = tbody[1].match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) ?? []
  if (rows.length === 0) return { first: body, remaining: '' }

  const prefix = inner.slice(0, tbody.index)
  const firstRows = rows.slice(0, 2).join('')
  const remainingRows = rows.slice(2).join('')
  const open = table[1]
  const close = table[3]
  const first = `${open}${prefix}<tbody>${firstRows}</tbody>${close}`
  const remaining = remainingRows
    ? `${open}${prefix}<tbody>${remainingRows}</tbody>${close}`
    : ''
  return { first, remaining }
}

function groupHtml(
  group: ItemRender[],
  projectName: string,
  fontScale: number,
  section: ProjectNode
): string {
  const sections = group.map(({ item, config, body, scale, description }) => {
    const margins = config.margins
    const header = `<div class="item-heading"><div><strong>${escapeHtml(nodeDisplayName(item))}</strong>${item.unit ? `<span>Unit: ${escapeHtml(item.unit)}</span>` : ''}</div><p>${description}</p></div>`
    const sheet = splitSheetStart(body)
    return `<section class="item-flow" style="padding-left:${margins.left}mm;padding-right:${margins.right}mm"><div class="sheet" style="zoom:${scale}"><div class="item-start">${header}${sheet.first}</div>${sheet.remaining ? `<div class="item-remaining">${sheet.remaining}</div>` : ''}</div></section>`
  }).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    html,body{margin:0;color:#111;background:#fff;font-family:"Times New Roman",serif}
    body{padding:10mm 0}.section-banner{margin:0 15mm 7mm;padding:7px 9px;border-left:4px solid #447a9c;background:#edf5fa;font-family:Arial}.section-banner small{display:block;color:#4e6675;font-size:${9 * fontScale}px;text-transform:uppercase;letter-spacing:.6px}.section-banner strong{display:block;margin-top:2px;color:#163f57;font-size:${14 * fontScale}px}.item-flow{width:100%;break-inside:auto;margin:0 0 3mm}.item-start{break-inside:avoid;page-break-inside:avoid}.item-heading{border-top:1px solid #888;padding-top:5px;margin-bottom:8px;break-after:avoid;page-break-after:avoid}.item-heading>div{display:flex;justify-content:space-between;gap:12px}.item-heading strong{font-size:${15 * fontScale}px}.item-heading span{font:${11 * fontScale}px Arial}.item-heading p{font-size:${12 * fontScale}px;line-height:1.4;margin:5px 0 0}
    .sheet{transform-origin:top left}.sheet table{border-collapse:collapse;table-layout:fixed}.sheet td,.sheet th{word-break:break-word}
    @media print{.item-flow{break-inside:auto}.item-start{break-inside:avoid;page-break-inside:avoid}}
  </style></head><body data-project="${escapeHtml(projectName)}"><div class="section-banner"><small>${section.kind === 'subcomponent' ? 'Sub-component items' : 'Component items'}</small><strong>${escapeHtml(section.name)}</strong></div>${sections}</body></html>`
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

export async function buildCombinedComponentPdf(input: CombinedPrintInput): Promise<Uint8Array> {
  const renderItems = (items: ProjectNode[]): ItemRender[] => items.map((item) => {
      const config = itemPrintConfig(input.project, item)
      if (item.itemEditorType === 'document') {
        return {
          item,
          config,
          body: `<div class="document-content" style="font-size:${12 * (input.fontScale ?? 1)}px">${escapeHtml(item.document?.trim() || 'No document content saved.').replace(/\n/g, '<br>')}</div>`,
          scale: 1,
          description: itemDescription(item, input.recipes[item.id])
        }
      }
      const built = buildPrintHtml(
        createUniverWorkbookData(item) as never,
        config,
        { pageSize: config.pageSize, orientation: config.orientation, margins: config.margins },
        { projectName: input.project.meta.name, title: nodeDisplayName(item) },
        item.charts ?? []
      )
      return {
        item,
        config,
        // Spreadsheet cell formatting is deliberately preserved. The master
        // report font controls descriptions/abstract/document text; users keep
        // precise Excel fonts, row heights and column widths in the sheet editor.
        body: extractBody(built.html),
        scale: built.pdfOptions.scale,
        description: itemDescription(item, input.recipes[item.id])
      }
    })

  const itemPageRequests = (
    section: ProjectNode,
    items: ProjectNode[]
  ): Array<{ html: string; options: PdfOptions }> => {
    const groups = new Map<string, ItemRender[]>()
    for (const entry of renderItems(items)) {
      const key = `${entry.config.pageSize}:${entry.config.orientation}`
      groups.set(key, [...(groups.get(key) ?? []), entry])
    }
    return Array.from(groups.values()).map((group) => {
      const first = group[0]
      return {
        html: groupHtml(group, input.project.meta.name, input.fontScale ?? 1, section),
        options: basePdfOptions(first.config.pageSize, first.config.orientation)
      }
    })
  }

  const directItems = sectionOwnedItems(input.section)
  const subcomponents = input.section.kind === 'component'
    ? input.section.children.filter((child) => child.kind === 'subcomponent')
    : []
  const subcomponentSummaries = subcomponents.map((section) => ({
    section,
    total: componentItemsTotal(input.project, section, input.rateOf)
  }))
  const requests: Array<{ html: string; options: PdfOptions }> = [{
    html: abstractHtml(input, input.section, directItems, input.total, subcomponentSummaries),
    options: basePdfOptions('A4', 'portrait')
  }]

  // Main component item pages are printed first. Sub-component items never enter
  // the main Component Abstract or its item-page group.
  requests.push(...itemPageRequests(input.section, directItems))

  // Every sub-component gets its own General Abstract and item pages at the end.
  for (const summary of subcomponentSummaries) {
    const subcomponentItems = sectionOwnedItems(summary.section)
    requests.push({
      html: abstractHtml(input, summary.section, subcomponentItems, summary.total),
      options: basePdfOptions('A4', 'portrait')
    })
    requests.push(...itemPageRequests(summary.section, subcomponentItems))
  }

  const merged = await PDFDocument.create()
  for (const request of requests) {
    const result = await window.api.print.toPdf(request.html, request.options)
    if (!result.ok || !result.data) throw new Error(result.error ?? 'Could not render component print pages.')
    const source = await PDFDocument.load(decodeBase64(result.data))
    const pages = await merged.copyPages(source, source.getPageIndices())
    pages.forEach((page) => merged.addPage(page))
  }
  return merged.save()
}

function sectionOwnedItems(section: ProjectNode): ProjectNode[] {
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
