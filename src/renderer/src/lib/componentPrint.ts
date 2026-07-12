import { PDFDocument } from 'pdf-lib'
import type { EestimateProject, Margins, Orientation, PaperSize, PrintConfig, ProjectNode } from '../types/project'
import type { RateAnalysisRecipe, RateAnalysisTextRun } from '../types/rateAnalysis'
import { createUniverWorkbookData } from './univerSpreadsheet'
import { buildPrintHtml, type PdfOptions } from './printRender'
import { resolveNodeSettings } from './nodeSettings'
import { descriptionRunsForDisplay, plainTextRun } from './rateAnalysisVisibility'
import { nodeDisplayName } from '../components/nodeVisual'
import { getItemFinal } from './finalNumber'

const DEFAULT_MARGINS: Margins = { top: 20, right: 15, bottom: 20, left: 25 }

export interface CombinedPrintInput {
  project: EestimateProject
  section: ProjectNode
  items: ProjectNode[]
  recipes: Record<string, RateAnalysisRecipe>
  rateOf: (node: ProjectNode) => number | undefined
  total: number
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

function abstractHtml(input: CombinedPrintInput): string {
  const rows = input.items.map((item, index) => {
    const final = getItemFinal(input.project, item, input.rateOf(item))
    return `<tr><td>${index + 1}</td><td><strong>${escapeHtml(nodeDisplayName(item))}</strong><br><span>${escapeHtml(item.itemDescription ?? '')}</span></td><td>${escapeHtml(item.unit ?? final.unit ?? '')}</td><td>${final.qty ?? ''}</td><td>${final.rate ?? ''}</td><td>${final.amount ?? ''}</td></tr>`
  }).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    body{margin:0;padding:16mm 14mm;font:11px Arial;color:#111}
    header{display:flex;justify-content:space-between;gap:20px;border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:12px}
    h1{font-size:18px;margin:3px 0}.total{font-size:16px;font-weight:700}
    table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #777;padding:5px;vertical-align:top}
    th{background:#eee}td:nth-child(1){width:7%;text-align:center}td:nth-child(3){width:10%}td:nth-child(n+4){width:12%;text-align:right}
    td span{font-size:9px;color:#444}footer{display:flex;justify-content:space-between;border-top:2px solid #111;margin-top:12px;padding-top:8px;font-size:14px}
  </style></head><body><header><div><small>${escapeHtml(input.project.meta.name)}</small><h1>${escapeHtml(input.section.name)}</h1><b>Abstract</b></div><div class="total">Rs. ${input.total.toLocaleString('en-IN')}</div></header>
  <table><thead><tr><th>Sl.</th><th>Description</th><th>Unit</th><th>Quantity</th><th>Rate</th><th>Amount</th></tr></thead><tbody>${rows}</tbody></table>
  <footer><span>Section Total</span><strong>Rs. ${input.total.toLocaleString('en-IN')}</strong></footer></body></html>`
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

function groupHtml(group: ItemRender[], projectName: string): string {
  const sections = group.map(({ item, config, body, scale, description }) => {
    const margins = config.margins
    const header = `<div class="item-heading"><div><strong>${escapeHtml(nodeDisplayName(item))}</strong>${item.unit ? `<span>Unit: ${escapeHtml(item.unit)}</span>` : ''}</div><p>${description}</p></div>`
    const sheet = splitSheetStart(body)
    return `<section class="item-flow" style="padding-left:${margins.left}mm;padding-right:${margins.right}mm"><div class="sheet" style="zoom:${scale}"><div class="item-start">${header}${sheet.first}</div>${sheet.remaining ? `<div class="item-remaining">${sheet.remaining}</div>` : ''}</div></section>`
  }).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    html,body{margin:0;color:#111;background:#fff;font-family:"Times New Roman",serif}
    body{padding:10mm 0}.item-flow{width:100%;break-inside:auto;margin:0 0 3mm}.item-start{break-inside:avoid;page-break-inside:avoid}.item-heading{border-top:1px solid #888;padding-top:5px;margin-bottom:8px;break-after:avoid;page-break-after:avoid}.item-heading>div{display:flex;justify-content:space-between;gap:12px}.item-heading strong{font-size:15px}.item-heading span{font:11px Arial}.item-heading p{font-size:12px;line-height:1.4;margin:5px 0 0}
    .sheet{transform-origin:top left}.sheet table{border-collapse:collapse;table-layout:fixed}.sheet td,.sheet th{word-break:break-word}
    @media print{.item-flow{break-inside:auto}.item-start{break-inside:avoid;page-break-inside:avoid}}
  </style></head><body data-project="${escapeHtml(projectName)}">${sections}</body></html>`
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

export async function buildCombinedComponentPdf(input: CombinedPrintInput): Promise<Uint8Array> {
  const rendered: ItemRender[] = input.items.map((item) => {
    const config = itemPrintConfig(input.project, item)
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
      body: extractBody(built.html),
      scale: built.pdfOptions.scale,
      description: itemDescription(item, input.recipes[item.id])
    }
  })

  const groups = new Map<string, ItemRender[]>()
  for (const entry of rendered) {
    const key = `${entry.config.pageSize}:${entry.config.orientation}`
    groups.set(key, [...(groups.get(key) ?? []), entry])
  }

  const requests: Array<{ html: string; options: PdfOptions }> = [{
    html: abstractHtml(input),
    options: basePdfOptions('A4', 'portrait')
  }]
  for (const group of groups.values()) {
    const first = group[0]
    requests.push({
      html: groupHtml(group, input.project.meta.name),
      options: basePdfOptions(first.config.pageSize, first.config.orientation)
    })
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
