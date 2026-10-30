/** Descriptive source metadata. Never use this to set rates or recipe quantities. */
export interface CatalogueGuidance {
  version: 1
  shortSummary: string
  grades: string[]
  application: string
  displayTitle?: string
  purpose?: string
  family?: string
  choiceFacts?: Array<{ label: string; value: string }>
  terminologyReference?: { title: string; url: string }
  descriptionDetail?: string
  method?: string
  aggregate?: string
  dimensions?: string
  height?: string
  scope: Array<{ label: string; detail: string; printedPage?: number }>
  searchTerms: string[]
  source: { kind: string; code: string; descriptionHash: string; pages?: unknown[] }
}

export interface CatalogueDescription {
  code: string
  description: string
  guidance?: CatalogueGuidance
}

export function readCatalogueGuidance(value: unknown): CatalogueGuidance | undefined {
  if (!value || typeof value !== 'object') return undefined
  const g = value as Partial<CatalogueGuidance>
  const textFields = ['displayTitle', 'purpose', 'family', 'descriptionDetail', 'method', 'aggregate', 'dimensions', 'height'] as const
  if (g.version !== 1 || typeof g.shortSummary !== 'string' || !g.shortSummary.trim() ||
    typeof g.application !== 'string' || !Array.isArray(g.grades) ||
    !g.grades.every(grade => typeof grade === 'string' && /^M\d{1,2}$/.test(grade)) ||
    !Array.isArray(g.scope) || !g.scope.every(row => row && typeof row.label === 'string' && typeof row.detail === 'string') ||
    !Array.isArray(g.searchTerms) || !g.searchTerms.every(term => typeof term === 'string') ||
    (g.choiceFacts !== undefined && (!Array.isArray(g.choiceFacts) || !g.choiceFacts.every(row =>
      row && typeof row.label === 'string' && typeof row.value === 'string'))) ||
    textFields.some(key => g[key] !== undefined && typeof g[key] !== 'string') ||
    !g.source || typeof g.source.code !== 'string') return undefined
  return g as CatalogueGuidance
}

export function catalogueSummary(item: CatalogueDescription): string {
  return item.guidance?.shortSummary || item.description
}

export function catalogueSearchText(item: CatalogueDescription): string {
  const g = item.guidance
  // Explanations may contrast another type of work. Search the actual work and
  // specifications, rather than returning pointing because its help says plaster.
  return [item.description, g?.displayTitle, ...(g?.choiceFacts ?? []).map(row => row.value),
    g?.descriptionDetail, g?.shortSummary, g?.application, g?.method, g?.aggregate,
    g?.dimensions, g?.height, ...(g?.searchTerms ?? []).filter(term => term !== g?.purpose)].filter(Boolean).join(' ')
}

export function catalogueDetailsText(item: CatalogueDescription): string {
  const g = item.guidance
  return [item.code, g?.displayTitle || g?.shortSummary, g?.purpose, g?.method ? `Method: ${g.method}` : '',
    ...(g?.scope ?? []).map(row => `${row.label}: ${row.detail}`),
    g ? 'Published description:' : '', item.description, g?.descriptionDetail].filter(Boolean).join('\n')
}

export function catalogueChoiceTitle(item: CatalogueDescription): string {
  return item.guidance?.displayTitle || item.guidance?.shortSummary || item.description
    .replace(/^Providing(?:,?\s+and)?\s+/i, '')
    .replace(/\s+including(?:\s+cost)?\b[\s\S]*$/i, '')
}

const catalogueCodeOrder = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })

/** Order chapter/item numbers naturally: 1-2, 1-10, 2-1. */
export function compareCatalogueCodes(left: string, right: string): number {
  return catalogueCodeOrder.compare(left, right)
}

/** Keep explanatory facts, not instructions that repeat the work title. */
export function catalogueChoiceNote(item: CatalogueDescription): string {
  const purpose = item.guidance?.purpose?.trim() ?? ''
  if (!purpose) return ''
  if (item.guidance?.family === 'plaster') return purpose.replace(/^Surface finishing coat\.?\s*/i, '')
  if (item.guidance?.family === 'masonry' && /closely dressed|less stringent/i.test(purpose)) return purpose
  if (item.guidance?.family === 'cns') return purpose.split(';')[0]
  if (/\b(?:including|excluded?|included?|priced in|separately)\b/i.test(purpose) && !/\b(?:compare|choose|check|match|select)\b/i.test(purpose)) return purpose
  return ''
}

export function catalogueChoiceFacts(item: CatalogueDescription): Array<{ label: string; value: string }> {
  const g = item.guidance
  if (!g) return []
  return g.choiceFacts ?? [
    ...(g.grades.length ? [{ label: 'Grade', value: g.grades.join(' / ') }] : []),
    ...(g.aggregate ? [{ label: 'Aggregate', value: g.aggregate }] : []),
    ...(g.dimensions ? [{ label: 'Dimensions', value: g.dimensions }] : []),
    ...(g.method ? [{ label: 'Method', value: g.method }] : [])
  ]
}

/** Verbatim differing passages, with context; never infers a missing specification. */
export function catalogueSourceDifferences(items: CatalogueDescription[]): string[] {
  const words = items.map(item => item.description.trim().split(/\s+/))
  if (words.length < 2) return items.map(item => item.description)
  const minimum = Math.min(...words.map(row => row.length))
  let start = 0
  while (start < minimum && words.every(row => row[start] === words[0][start])) start += 1
  if (start === minimum && words.every(row => row.length === minimum)) return items.map(() => 'Same published wording')
  let end = 0
  while (end < minimum - start && words.every(row => row[row.length - 1 - end] === words[0][words[0].length - 1 - end])) end += 1
  return words.map(row => {
    const from = Math.max(0, start - 6), to = Math.min(row.length, row.length - end + 6)
    return `${from ? '… ' : ''}${row.slice(from, to).join(' ')}${to < row.length ? ' …' : ''}`
  })
}

export function concreteGradeExplanation(grades: string[]): string {
  return grades.map(grade => `${grade}: ${Number(grade.slice(1))} N/mm²`).join('; ') +
    ' characteristic cube compressive strength at 28 days. The work description determines application and included costs.'
}
