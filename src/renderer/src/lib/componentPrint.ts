import { PDFDocument } from 'pdf-lib'
import type { EestimateProject, Margins, Orientation, PaperSize, PrintConfig, ProjectNode } from '../types/project'
import type { RateAnalysisRecipe, RateAnalysisTextRun } from '../types/rateAnalysis'
import { createUniverWorkbookData } from './univerSpreadsheet'
import { buildPrintHtml, type PdfOptions } from './printRender'
import { resolveNodeSettings } from './nodeSettings'
import { descriptionRunsForDisplay, plainTextRun } from './rateAnalysisVisibility'
import { nodeDisplayName } from '../components/nodeVisual'
import { componentItemsTotal, getItemFinal } from './finalNumber'
import { guideWallDetailHtml } from './guideWallPrint'
import { bundDetailPages, BUND_PRINT_MARGINS } from './bundPrint'
import { migrateBundData } from './bund'
import { migrateGuideWallData } from './guideWall'
import { buildDocumentPrintHtml } from './documentPrint'
import {
  applySignatureFooterToPdf,
  printableSignatureRows,
  resolveSignatureFooter,
  SIGNATURE_FOOTER_SLOT
} from './signatureFooter'
import {
  chooseSmartAbstractPlan,
  type AbstractDensity,
  type SmartAbstractProfile
} from './smartAbstractPagination'

const DEFAULT_MARGINS: Margins = { top: 20, right: 15, bottom: 20, left: 25 }
// Only lift genuinely tiny renderer text. Normal 11–12 px table/body text and
// larger headings retain their original sizing and page density.
const COMPONENT_MIN_FONT_SIZE = 11

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

interface ComponentPrintRequest {
  html: string
  options: PdfOptions
  signatureScope: string
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Keep every component-rendered page readable without touching signature
 * fields. This runs before `applySignatureFooterToPdf`, so signature typography
 * is appended afterward with its own intentionally compact sizes.
 */
export function enforceComponentMinimumFontSize(html: string): string {
  const signatureBlocks: string[] = []
  const protectedHtml = html.replace(
    /<section\b[^>]*\bestimate-signature-footer\b[^>]*>[\s\S]*?<\/section>/gi,
    (block) => {
      const token = `<!--component-signature-${signatureBlocks.length}-->`
      signatureBlocks.push(block)
      return token
    }
  )
  const clampAbsolute = (_match: string, value: string, unit: string): string =>
    `font-size:${Math.max(COMPONENT_MIN_FONT_SIZE, Number(value))}${unit}`
  const clampRelative = (_match: string, value: string, unit: string): string => {
    const minimum = unit === '%' ? 100 : 1
    return `font-size:${Math.max(minimum, Number(value))}${unit}`
  }
  const clampShorthand = (_match: string, value: string, unit: string): string =>
    `font:${Math.max(COMPONENT_MIN_FONT_SIZE, Number(value))}${unit}`
  const clampSvg = (_match: string, quote: string, value: string): string =>
    `font-size=${quote}${Math.max(COMPONENT_MIN_FONT_SIZE, Number(value))}${quote}`

  const clamped = protectedHtml
    .replace(/font-size\s*:\s*(\d*\.?\d+)\s*(px|pt)/gi, clampAbsolute)
    .replace(/font-size\s*:\s*(\d*\.?\d+)\s*(%|rem|em)/gi, clampRelative)
    .replace(/font\s*:\s*(\d*\.?\d+)\s*(px|pt)(?=\s|\/)/gi, clampShorthand)
    .replace(/font-size\s*=\s*(["'])(\d*\.?\d+)(?:px|pt)?\1/gi, clampSvg)
  return clamped.replace(
    /<!--component-signature-(\d+)-->/g,
    (_token, index: string) => signatureBlocks[Number(index)] ?? ''
  )
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

/** Add the same DATA identity block used by an item's own Print Preview. */
function withItemDescription(
  html: string,
  item: ProjectNode,
  recipe: RateAnalysisRecipe | undefined,
  fontScale: number
): string {
  const css = `
    .component-doc-description{font-family:"Times New Roman",serif;color:#111;margin:0 0 14px;line-height:1.45;break-after:avoid;page-break-after:avoid}
    .component-doc-description header{display:flex;justify-content:space-between;gap:16px;margin:0 0 8px;padding-bottom:6px;border-bottom:1px solid #888}
    .component-doc-description header strong{font-size:${18 * fontScale}px}
    .component-doc-description header span{font:12px Arial;color:#555;white-space:nowrap}
    .component-doc-description div{font-size:${14 * fontScale}px;white-space:normal}
  `
  const heading =
    '<section class="component-doc-description">' +
    '<header>' +
    `<strong>${escapeHtml(nodeDisplayName(item))}</strong>` +
    `${item.unit ? `<span>Unit: ${escapeHtml(item.unit)}</span>` : ''}` +
    '</header>' +
    `<div>${itemDescription(item, recipe)}</div>` +
    '</section>'
  const withCss = html.includes('</style>')
    ? html.replace('</style>', `${css}</style>`)
    : html.replace('</head>', `<style>${css}</style></head>`)
  return withCss.replace(/<body[^>]*>/i, (bodyTag) => `${bodyTag}${heading}`)
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

interface ComponentAbstractRow {
  html: string
  textLength: number
}

function componentAbstractRowHeight(
  row: ComponentAbstractRow,
  density: AbstractDensity
): number {
  const textLines = Math.max(2, Math.ceil(row.textLength / 62) + 1)
  const factor = density === 'normal' ? 1 : density === 'compact' ? 0.9 : 0.82
  return Math.max(34, (textLines * 14 + 12) * factor)
}

function abstractHtml(
  input: CombinedPrintInput,
  section: ProjectNode,
  items: ProjectNode[],
  total: number,
  subcomponentSummaries: Array<{ section: ProjectNode; total: number }> = []
): string {
  const fontScale = input.fontScale ?? 1
  const itemRows: ComponentAbstractRow[] = items.map((item, index) => {
    const final = getItemFinal(input.project, item, input.rateOf(item), true)
    const description = itemDescription(item, input.recipes[item.id])
    return {
      html: `<tr><td class="abstract-sl">${index + 1}</td><td class="abstract-description"><strong>${escapeHtml(nodeDisplayName(item))}</strong><br><span>${description}</span></td><td class="abstract-unit">${escapeHtml(item.unit ?? final.unit ?? '')}</td><td class="abstract-number">${formatNumber(final.qty, 3)}</td><td class="abstract-number">${formatNumber(final.rate)}</td><td class="abstract-number abstract-amount">${formatNumber(final.amount)}</td></tr>`,
      textLength: nodeDisplayName(item).length + description.replace(/<[^>]*>/g, '').length
    }
  })
  const summaryRows: ComponentAbstractRow[] = subcomponentSummaries.map(
    ({ section: subcomponent, total: subcomponentTotal }, index) => ({
      html: `<tr class="abstract-subcomponent"><td class="abstract-sl">S${index + 1}</td><td class="abstract-description"><strong>${escapeHtml(subcomponent.name)}</strong><br><span>Sub-component · separate General Abstract follows</span></td><td class="abstract-unit">LS</td><td class="abstract-number"></td><td class="abstract-number"></td><td class="abstract-number abstract-amount">${formatNumber(subcomponentTotal)}</td></tr>`,
      textLength: subcomponent.name.length + 53
    })
  )
  const abstractLabel =
    section.kind === 'subcomponent' ? 'Sub-component General Abstract' : 'Component Abstract'
  const totalLabel =
    section.kind === 'subcomponent' ? 'Sub-component Total' : 'Component Total'
  const detailRows = [...itemRows, ...summaryRows]
  const signatureSettings = resolveSignatureFooter(input.project, section.id)
  const hasSignatures =
    signatureSettings.enabled && printableSignatureRows(signatureSettings).length > 0
  const everyPageReserve =
    hasSignatures && signatureSettings.placement === 'every_page' ? 100 : 0
  const subjectEndReserve =
    hasSignatures && signatureSettings.placement === 'subject_end' ? 145 : 0
  const densities: AbstractDensity[] = ['normal', 'compact', 'tight']
  const profiles: SmartAbstractProfile<ComponentAbstractRow>[] = densities.map((density) => ({
    density,
    rows: detailRows.map((row) => ({
      value: row,
      height: componentAbstractRowHeight(row, density) * fontScale,
      detail: true
    })),
    capacities: {
      first: 820 - everyPageReserve,
      continuation: 900 - everyPageReserve,
      finalFirst: 770 - everyPageReserve - subjectEndReserve,
      finalContinuation: 850 - everyPageReserve - subjectEndReserve
    }
  }))
  const pagePlan = chooseSmartAbstractPlan(profiles)
  const bodies = pagePlan.pages.map((page, pageIndex) => {
    const pageBreak = pageIndex > 0 ? ' abstract-page-break' : ''
    const detailHtml = page.rows.map((row) => row.value.html).join('')
    const totalRow = page.isFinal
      ? `<tr class="abstract-total"><td colspan="5">${totalLabel}</td><td class="abstract-number">Rs. ${total.toLocaleString('en-IN')}</td></tr>`
      : ''
    return `<tbody class="${page.isFinal ? 'abstract-final-block' : 'abstract-page-block'}${pageBreak}">${detailHtml}${totalRow}</tbody>`
  }).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    body{margin:0;padding:16mm 14mm;font:${11 * fontScale}px Arial;color:#111}
    header{display:flex;justify-content:space-between;gap:20px;border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:12px}
    h1{font-size:${18 * fontScale}px;margin:3px 0}.total{font-size:${16 * fontScale}px;font-weight:700}
    table{width:100%;border-collapse:collapse;table-layout:fixed}thead{display:table-header-group}th,td{border:1px solid #777;padding:5px 6px;vertical-align:top;white-space:normal}
    th{background:#eee;text-align:center;line-height:1.2;overflow-wrap:break-word}
    tr{break-inside:avoid;page-break-inside:avoid}.abstract-page-break{break-before:page;page-break-before:always}.abstract-final-block{break-inside:avoid;page-break-inside:avoid}
    .abstract-sl{text-align:center}.abstract-description{line-height:1.35;overflow-wrap:anywhere;word-break:normal}.abstract-description strong{display:inline-block;margin-bottom:2px}.abstract-unit{text-align:center;overflow-wrap:anywhere}.abstract-number{text-align:right;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
    .abstract-subcomponent td{background:#edf5fa;border-top:2px solid #447a9c}.abstract-subcomponent .abstract-description strong{color:#174d6c}
    .abstract-total td{border-top:2px solid #111;background:#f3f6f8;font-size:${14 * fontScale}px;font-weight:700}.abstract-total td:first-child{text-align:right}
    td span{font-size:${9 * fontScale}px;color:#444}
    body.abstract-density-compact{padding-top:14.5mm;padding-bottom:14.5mm}body.abstract-density-compact header{padding-bottom:7px;margin-bottom:10px}body.abstract-density-compact th,body.abstract-density-compact td{padding-top:4px;padding-bottom:4px}
    body.abstract-density-tight{padding-top:13.5mm;padding-bottom:13.5mm}body.abstract-density-tight header{padding-bottom:6px;margin-bottom:9px}body.abstract-density-tight th,body.abstract-density-tight td{padding-top:3px;padding-bottom:3px}
  </style></head><body class="abstract-density-${pagePlan.density}"><header><div><small>${escapeHtml(input.project.meta.name)}</small><h1>${escapeHtml(section.name)}</h1><b>${abstractLabel}</b></div><div class="total">Rs. ${total.toLocaleString('en-IN')}</div></header>
  <table><colgroup><col style="width:5%"><col style="width:54%"><col style="width:7%"><col style="width:10%"><col style="width:10%"><col style="width:14%"></colgroup><thead><tr><th>Sl.</th><th>Description</th><th>Unit</th><th>Quantity</th><th>Rate</th><th>Amount</th></tr></thead>${bodies}</table>${SIGNATURE_FOOTER_SLOT}</body></html>`
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
  section: Pick<ProjectNode, 'name'>
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
  </style></head><body data-project="${escapeHtml(projectName)}"><div class="section-banner"><small>Detailed Estimate</small><strong>${escapeHtml(section.name)}</strong></div>${sections}</body></html>`
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
  ): ComponentPrintRequest[] => {
    if (items.length === 1 && items[0].itemEditorType === 'document') {
      const item = items[0]
      const config = itemPrintConfig(input.project, item)
      const built = buildDocumentPrintHtml(
        item,
        config,
        {
          pageSize: config.pageSize,
          orientation: config.orientation,
          margins: config.margins
        },
        { projectName: input.project.meta.name, title: nodeDisplayName(item) }
      )
      return built.empty
        ? []
        : [{
            html: withItemDescription(
              built.html,
              item,
              input.recipes[item.id],
              input.fontScale ?? 1
            ),
            options: built.pdfOptions,
            signatureScope: section.id
          }]
    }
    const groups = new Map<string, ItemRender[]>()
    for (const entry of renderItems(items)) {
      const key = `${entry.config.pageSize}:${entry.config.orientation}`
      groups.set(key, [...(groups.get(key) ?? []), entry])
    }
    return Array.from(groups.values()).map((group) => {
      const first = group[0]
      return {
        html: groupHtml(group, input.project.meta.name, input.fontScale ?? 1, section),
        options: basePdfOptions(first.config.pageSize, first.config.orientation),
        signatureScope: section.id
      }
    })
  }

  const documentPageRequests = (page: ProjectNode): ComponentPrintRequest[] => {
    const config = itemPrintConfig(input.project, page)
    const built = buildDocumentPrintHtml(
      page,
      config,
      {
        pageSize: config.pageSize,
        orientation: config.orientation,
        margins: config.margins
      },
      { projectName: input.project.meta.name, title: page.name }
    )
    return built.empty
      ? []
      : [{ html: built.html, options: built.pdfOptions, signatureScope: page.id }]
  }

  const directItems = sectionOwnedItems(input.section)
  const subcomponents = input.section.kind === 'component'
    ? input.section.children.filter((child) => child.kind === 'subcomponent')
    : []
  const subcomponentSummaries = subcomponents.map((section) => ({
    section,
    total: componentItemsTotal(input.project, section, input.rateOf, true)
  }))
  const requests: ComponentPrintRequest[] = [{
    html: abstractHtml(input, input.section, directItems, input.total, subcomponentSummaries),
    options: basePdfOptions('A4', 'portrait'),
    signatureScope: input.section.id
  }]

  // Component-template detailed estimate (drawings + measurement tables) replaces
  // its generated DATA rows, but ordinary supporting pages still follow it.
  const bundData = input.section.templateId === 'bund' ? input.section.bund : undefined
  const hasComponentDetail =
    (input.section.templateId === 'guide-wall' && Boolean(input.section.guideWall)) ||
    Boolean(bundData)
  if (hasComponentDetail) {
    const settings = resolveNodeSettings(input.project.root, input.section.id)
    const pageSize = settings.pageSize ?? 'A4'
    const orientation = settings.orientation ?? 'portrait'
    const margins = settings.margins ?? DEFAULT_MARGINS
    if (bundData) {
      // A bund mixes portrait narrative with landscape schedules, and one print
      // request carries a single orientation — so each page set is rendered as
      // its own PDF and merged. Margins default narrow: these sheets are wide.
      const bundMargins = settings.margins ?? BUND_PRINT_MARGINS
      for (const page of bundDetailPages(
        input.project,
        input.section,
        migrateBundData(bundData),
        input.fontScale ?? 1,
        input.recipes
      )) {
        requests.push({
          html: page.html,
          options: {
            ...basePdfOptions(pageSize, page.orientation),
            margins: {
              top: bundMargins.top / 25.4,
              bottom: bundMargins.bottom / 25.4,
              left: bundMargins.left / 25.4,
              right: bundMargins.right / 25.4
            }
          },
          signatureScope: input.section.id
        })
      }
    } else {
    requests.push({
      html: guideWallDetailHtml(
            input.project,
            input.section,
            migrateGuideWallData(input.section.guideWall!),
            input.fontScale ?? 1,
            input.recipes
          ),
      // Real page margins (inches) so every page of the multi-page detailed
      // estimate honours the component's margin settings, not just the first.
      options: {
        ...basePdfOptions(pageSize, orientation),
        margins: {
          top: margins.top / 25.4,
          bottom: margins.bottom / 25.4,
          left: margins.left / 25.4,
          right: margins.right / 25.4
        }
      },
      signatureScope: input.section.id
    })
    }
  }

  const appendChildrenInTreeOrder = (section: ProjectNode, skipGeneratedItems = false): void => {
    let pendingSpreadsheetItems: ProjectNode[] = []
    let pendingGeometry = ''
    const flushSpreadsheetItems = (): void => {
      if (pendingSpreadsheetItems.length === 0) return
      requests.push(...itemPageRequests(section, pendingSpreadsheetItems))
      pendingSpreadsheetItems = []
      pendingGeometry = ''
    }

    for (const child of section.children) {
      if (child.kind === 'page') {
        flushSpreadsheetItems()
        requests.push(...documentPageRequests(child))
      } else if (child.kind === 'item') {
        if (skipGeneratedItems || child.templateGenerated) continue
        // Rich DOC items use their exact document print pipeline and therefore
        // form an intentional document boundary. Consecutive spreadsheet DATA
        // items share one HTML/PDF request so Chromium can paginate them as a
        // continuous detailed estimate instead of starting every code on a page.
        if (child.itemEditorType === 'document') {
          flushSpreadsheetItems()
          requests.push(...itemPageRequests(section, [child]))
          continue
        }
        const config = itemPrintConfig(input.project, child)
        const geometry = `${config.pageSize}:${config.orientation}`
        if (pendingGeometry && pendingGeometry !== geometry) flushSpreadsheetItems()
        pendingGeometry = geometry
        pendingSpreadsheetItems.push(child)
      } else if (child.kind === 'subcomponent' || child.kind === 'component') {
        flushSpreadsheetItems()
        const childItems = sectionOwnedItems(child)
        requests.push({
          html: abstractHtml(
            input,
            child,
            childItems,
            componentItemsTotal(input.project, child, input.rateOf, true)
          ),
          options: basePdfOptions('A4', 'portrait'),
          signatureScope: child.id
        })
        appendChildrenInTreeOrder(
          child,
          child.templateId === 'guide-wall' || child.templateId === 'bund'
        )
      }
    }
    flushSpreadsheetItems()
  }

  appendChildrenInTreeOrder(input.section, hasComponentDetail)

  const decoratedRequests = requests.map((request) => {
    const readableHtml = enforceComponentMinimumFontSize(request.html)
    const signatureFooter = resolveSignatureFooter(
      input.project,
      request.signatureScope
    )
    const signed = applySignatureFooterToPdf(
      readableHtml,
      request.options,
      signatureFooter
    )
    return { ...request, ...signed }
  })

  const merged = await PDFDocument.create()
  for (const request of decoratedRequests) {
    const result = await window.api.print.toPdf(request.html, request.options)
    if (!result.ok || !result.data) throw new Error(result.error ?? 'Could not render component print pages.')
    const source = await PDFDocument.load(decodeBase64(result.data))
    const pages = await merged.copyPages(source, source.getPageIndices())
    pages.forEach((page) => merged.addPage(page))
  }
  return merged.save()
}

/** Render one DATA item exactly through the item's own Print Preview pipeline. */
export async function buildItemPrintPdf({
  project,
  item,
  recipe,
  fontScale = 1
}: {
  project: EestimateProject
  item: ProjectNode
  recipe?: RateAnalysisRecipe
  fontScale?: number
}): Promise<Uint8Array> {
  const config = itemPrintConfig(project, item)
  const geometry = {
    pageSize: config.pageSize,
    orientation: config.orientation,
    margins: config.margins
  }
  const context = { projectName: project.meta.name, title: nodeDisplayName(item) }
  const built = item.itemEditorType === 'document'
    ? buildDocumentPrintHtml(item, config, geometry, context)
    : buildPrintHtml(
        createUniverWorkbookData(item) as never,
        config,
        geometry,
        context,
        item.charts ?? []
      )
  if (built.empty) throw new Error(`${nodeDisplayName(item)} has no printable content.`)
  const html = enforceComponentMinimumFontSize(
    withItemDescription(built.html, item, recipe, fontScale)
  )
  const signed = applySignatureFooterToPdf(
    html,
    built.pdfOptions,
    resolveSignatureFooter(project, item.id)
  )
  const result = await window.api.print.toPdf(signed.html, signed.options)
  if (!result.ok || !result.data) {
    throw new Error(result.error ?? `Could not render ${nodeDisplayName(item)}.`)
  }
  return decodeBase64(result.data)
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
