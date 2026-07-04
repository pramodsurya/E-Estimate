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
  return reconstructed === description ? runs : [plainTextRun(description)]
}

export function plainTextRun(text: string): RateAnalysisTextRun {
  return { text, bold: false, italic: false, underline: false }
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
