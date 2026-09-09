import type {
  RateAnalysisColumnLayout,
  RateAnalysisLayout,
  RateAnalysisSectionKey,
  RateAnalysisTextRun
} from '../types/rateAnalysis'

type JsonRecord = Record<string, unknown>

const SECTION_KEYS: RateAnalysisSectionKey[] = ['materials', 'machinery', 'labour']
const COLUMN_KEYS = ['sl_no', 'description', 'unit', 'quantity', 'rate', 'amount'] as const

const DEFAULT_SECTION_TITLES: Record<RateAnalysisSectionKey, string> = {
  materials: 'A. MATERIALS:',
  machinery: 'B. MACHINERY:',
  labour: 'C. LABOUR:'
}

const DEFAULT_TOTAL_LABELS: Record<RateAnalysisSectionKey, string> = {
  materials: 'Total cost of Materials',
  machinery: 'Total hire charges of Machinery',
  labour: 'Total cost of Labour'
}

const DEFAULT_COLUMNS: RateAnalysisColumnLayout[] = [
  { key: 'sl_no', label: 'Sl No', visible: true },
  { key: 'description', label: 'Particulars', visible: true },
  { key: 'unit', label: 'Unit', visible: true },
  { key: 'quantity', label: 'Quantity', visible: true },
  { key: 'rate', label: 'Rate in Rs.', visible: true },
  { key: 'amount', label: 'Amount in Rs', visible: true }
]

export function defaultRateAnalysisLayout(description: string): RateAnalysisLayout {
  return {
    codeVisible: true,
    descriptionVisible: true,
    descriptionRuns: [plainTextRun(description)],
    unitQuantityVisible: true,
    unitLabel: 'UNIT',
    sections: {
      materials: defaultSection('materials'),
      machinery: defaultSection('machinery'),
      labour: defaultSection('labour')
    },
    labourSummary: {
      visible: true,
      lines: [
        'labour component/unit qty',
        "Add contractor's profit and overhead charges",
        "labour component/unit qty (including contractor's profit)"
      ]
    },
    abstract: {
      visible: true,
      title: 'ABSTRACT:',
      lines: [
        'A. Cost of Materials',
        'B. Hire charges of Machinery',
        'C. Cost of Labour',
        'Total',
        "D. Add for contractor's profit and overheads on (A+B+C)",
        'Total cost',
        'Rate per unit'
      ]
    }
  }
}

export function parseRateAnalysisVisibility(
  value: unknown,
  description: string
): RateAnalysisLayout {
  const layout = defaultRateAnalysisLayout(description)
  if (!Array.isArray(value)) return layout

  const blocks = value
    .filter(isRecord)
    .sort((a, b) => numberValue(a.order) - numberValue(b.order))

  for (const block of blocks) {
    const type = textValue(block.block)
    const visible = booleanValue(block.visible, true)

    if (type === 'code') {
      layout.codeVisible = visible
    } else if (type === 'description') {
      layout.descriptionVisible = visible
      const runs = parseTextRuns(block.runs)
      layout.descriptionRuns = runs.length ? runs : [plainTextRun(description)]
    } else if (type === 'unit_quantity') {
      layout.unitQuantityVisible = visible
      layout.unitLabel = textValue(block.label, 'UNIT')
    } else if (type === 'table') {
      const section = textValue(block.section) as RateAnalysisSectionKey
      if (!SECTION_KEYS.includes(section)) continue
      layout.sections[section] = {
        title: textValue(block.title, DEFAULT_SECTION_TITLES[section]),
        visible,
        totalLabel: textValue(block.total_label, DEFAULT_TOTAL_LABELS[section]),
        columns: parseColumns(block.columns)
      }
    } else if (type === 'labour_component_summary') {
      layout.labourSummary = {
        visible,
        lines: stringArray(block.lines, layout.labourSummary.lines)
      }
    } else if (type === 'abstract') {
      layout.abstract = {
        visible,
        title: textValue(block.title, 'ABSTRACT:'),
        lines: stringArray(block.lines, layout.abstract.lines)
      }
    }
  }

  return layout
}

export function descriptionRunsForDisplay(
  description: string,
  runs: RateAnalysisTextRun[] | undefined
): RateAnalysisTextRun[] {
  if (!runs?.length) return [plainTextRun(description)]
  const reconstructed = runs.map((run) => run.text).join('')
  if (reconstructed === description) return runs
  if (reconstructed.replace(/\r\n/g, '\n').trim() === description.replace(/\r\n/g, '\n').trim()) {
    return runs
  }
  return [plainTextRun(description)]
}

export function plainTextRun(text: string): RateAnalysisTextRun {
  return { text, bold: false, italic: false, underline: false }
}

/**
 * Converts rich text runs to WhatsApp-style markup string:
 * *bold*, _italic_, *_bold-italic_*, <u>underline</u>
 */
export function runsToWhatsApp(runs: RateAnalysisTextRun[]): string {
  if (!runs?.length) return ''
  return runs
    .map((run) => {
      const t = run.text
      if (run.bold && run.italic) return `*_${t}_*`
      if (run.bold) return `*${t}*`
      if (run.italic) return `_${t}_`
      if (run.underline) return `<u>${t}</u>`
      return t
    })
    .join('')
}

/**
 * Parses WhatsApp-style markup (*bold*, _italic_, *_bold-italic_*, <u>underline</u>)
 * into RateAnalysisTextRun[] array.
 */
export function whatsAppToRuns(text: string): RateAnalysisTextRun[] {
  if (!text) return [plainTextRun('')]
  const runs: RateAnalysisTextRun[] = []
  const regex = /(\*_([^*_\n]+?)_\*|_\*([^*_\n]+?)\*_|\*([^*\n]+?)\*|_([^_\n]+?)_|<u>([\s\S]+?)<\/u>)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      runs.push(plainTextRun(text.slice(lastIndex, match.index)))
    }
    if (match[2] || match[3]) {
      runs.push({ text: match[2] || match[3], bold: true, italic: true, underline: false })
    } else if (match[4]) {
      runs.push({ text: match[4], bold: true, italic: false, underline: false })
    } else if (match[5]) {
      runs.push({ text: match[5], bold: false, italic: true, underline: false })
    } else if (match[6]) {
      runs.push({ text: match[6], bold: false, italic: false, underline: true })
    }
    lastIndex = regex.lastIndex
  }

  if (lastIndex < text.length) {
    runs.push(plainTextRun(text.slice(lastIndex)))
  }

  return runs.length ? runs : [plainTextRun(text)]
}

export function runsToHtml(runs: RateAnalysisTextRun[]): string {
  if (!runs?.length) return ''
  return runs
    .map((run) => {
      let text = escapeHtml(run.text).replace(/\n/g, '<br>')
      if (run.underline) text = `<u>${text}</u>`
      if (run.italic) text = `<em>${text}</em>`
      if (run.bold) text = `<strong>${text}</strong>`
      return text
    })
    .join('')
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export function htmlToDescriptionRuns(html: string): RateAnalysisTextRun[] {
  if (typeof DOMParser !== 'undefined') {
    const parser = new DOMParser()
    const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html')
    const root = doc.body.firstElementChild || doc.body
    const runs: RateAnalysisTextRun[] = []

    function walk(node: Node, bold: boolean, italic: boolean, underline: boolean): void {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent || ''
        if (text) {
          runs.push({
            text,
            bold: Boolean(bold),
            italic: Boolean(italic),
            underline: Boolean(underline)
          })
        }
        return
      }
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement
        const tag = el.tagName.toLowerCase()

        if (tag === 'br') {
          runs.push({ text: '\n', bold: false, italic: false, underline: false })
          return
        }

        const isBold =
          bold ||
          tag === 'strong' ||
          tag === 'b' ||
          el.style.fontWeight === 'bold' ||
          parseInt(el.style.fontWeight, 10) >= 600
        const isItalic =
          italic ||
          tag === 'em' ||
          tag === 'i' ||
          el.style.fontStyle === 'italic'
        const isUnderline =
          underline ||
          tag === 'u' ||
          el.style.textDecoration.includes('underline')

        for (let i = 0; i < node.childNodes.length; i++) {
          walk(node.childNodes[i], isBold, isItalic, isUnderline)
        }

        if (tag === 'p' || tag === 'div') {
          if (el.nextSibling) {
            runs.push({ text: '\n', bold: false, italic: false, underline: false })
          }
        }
      }
    }

    for (let i = 0; i < root.childNodes.length; i++) {
      walk(root.childNodes[i], false, false, false)
    }

    // Merge adjacent runs with identical styling
    const merged: RateAnalysisTextRun[] = []
    for (const r of runs) {
      const last = merged[merged.length - 1]
      if (
        last &&
        Boolean(last.bold) === Boolean(r.bold) &&
        Boolean(last.italic) === Boolean(r.italic) &&
        Boolean(last.underline) === Boolean(r.underline)
      ) {
        last.text += r.text
      } else {
        merged.push({ ...r })
      }
    }

    return merged.length ? merged : [plainTextRun(root.textContent || '')]
  }

  // Regex fallback for headless node environments
  const runs: RateAnalysisTextRun[] = []
  const tokens = html.split(/(<br\s*\/?>|<\/?[a-z0-9]+[^>]*>)/gi)
  let bold = false
  let italic = false
  let underline = false

  for (const token of tokens) {
    if (!token) continue
    const lower = token.toLowerCase()
    if (/^<br\s*\/?>$/i.test(lower)) {
      runs.push({ text: '\n', bold: false, italic: false, underline: false })
    } else if (/^<(strong|b)>/i.test(lower)) {
      bold = true
    } else if (/^<\/(strong|b)>/i.test(lower)) {
      bold = false
    } else if (/^<(em|i)>/i.test(lower)) {
      italic = true
    } else if (/^<\/(em|i)>/i.test(lower)) {
      italic = false
    } else if (/^<u>/i.test(lower)) {
      underline = true
    } else if (/^<\/u>/i.test(lower)) {
      underline = false
    } else if (!token.startsWith('<')) {
      const decoded = token
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
      runs.push({ text: decoded, bold, italic, underline })
    }
  }

  const merged: RateAnalysisTextRun[] = []
  for (const r of runs) {
    const last = merged[merged.length - 1]
    if (
      last &&
      Boolean(last.bold) === Boolean(r.bold) &&
      Boolean(last.italic) === Boolean(r.italic) &&
      Boolean(last.underline) === Boolean(r.underline)
    ) {
      last.text += r.text
    } else {
      merged.push({ ...r })
    }
  }

  return merged.length ? merged : [plainTextRun(html.replace(/<[^>]+>/g, ''))]
}

function defaultSection(section: RateAnalysisSectionKey) {
  return {
    title: DEFAULT_SECTION_TITLES[section],
    visible: true,
    totalLabel: DEFAULT_TOTAL_LABELS[section],
    columns: DEFAULT_COLUMNS.map((column) => ({
      ...column,
      label:
        column.key === 'description' && section !== 'materials'
          ? 'Description'
          : column.label
    }))
  }
}

function parseTextRuns(value: unknown): RateAnalysisTextRun[] {
  if (!Array.isArray(value)) return []
  return value.filter(isRecord).map((run) => ({
    text: textValue(run.text),
    bold: booleanValue(run.bold),
    italic: booleanValue(run.italic),
    underline: booleanValue(run.underline)
  }))
}

function parseColumns(value: unknown): RateAnalysisColumnLayout[] {
  if (!Array.isArray(value)) return DEFAULT_COLUMNS.map((column) => ({ ...column }))
  const parsed = value
    .filter(isRecord)
    .filter((column) => COLUMN_KEYS.includes(textValue(column.key) as (typeof COLUMN_KEYS)[number]))
    .map((column) => ({
      key: textValue(column.key) as RateAnalysisColumnLayout['key'],
      label: textValue(column.label),
      visible: booleanValue(column.visible, true)
    }))
  return parsed.length ? parsed : DEFAULT_COLUMNS.map((column) => ({ ...column }))
}

function stringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback
  const strings = value.filter((item): item is string => typeof item === 'string')
  return strings.length ? strings : fallback
}

function isRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function textValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function numberValue(value: unknown): number {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function booleanValue(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback
}
