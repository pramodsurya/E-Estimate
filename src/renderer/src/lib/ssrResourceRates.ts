import type { RateAnalysisLine, RateAnalysisRecipe } from '../types/rateAnalysis'
const normalize = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
function sameIdentity(left: RateAnalysisLine['resourceIdentity'], right: RateAnalysisLine['resourceIdentity']): boolean {
  if (!left || !right) return false
  if (left.resourceKey && right.resourceKey) return left.resourceKey === right.resourceKey
  return Boolean(left.sourceTable && left.masterCode &&
    left.sourceTable === right.sourceTable && left.masterCode === right.masterCode &&
    left.rateComponent === right.rateComponent)
}

export function sourceLineFor(line: RateAnalysisLine, source: RateAnalysisRecipe): RateAnalysisLine {
  const link = line.ssrRateLink!
  const rows = source.sections.find((section) => section.key === link.section)?.lines ?? []
  const identityMatches = rows.filter((row) => sameIdentity(link.resourceIdentity, row.resourceIdentity))
  if (identityMatches.length === 1) return identityMatches[0]
  const matches = (identityMatches.length ? identityMatches : rows).filter((row) =>
    normalize(row.description) === normalize(link.description) && normalize(row.unit) === normalize(link.unit)
  )
  if (matches.length !== 1) throw new Error(`Cannot match the annual SSR rate for ${line.description}.`)
  return matches[0]
}

export function annualRate(line: RateAnalysisLine): number {
  // Some schedules contain an amount without a printed unit rate.
  const printedRate = line.sourceValues?.rate?.trim()
  const printedAmount = line.sourceValues?.amount?.trim()
  if (line.sourceValues && !printedRate && !printedAmount) {
    throw new Error(`Missing SSR rate for ${line.description}.`)
  }
  const rate = !printedRate && printedAmount && line.quantity > 0
    ? Number(printedAmount.replace(/,/g, '')) / line.quantity
    : line.rate
  if (!Number.isFinite(rate) || rate < 0) throw new Error(`Missing SSR rate for ${line.description}.`)
  return rate
}
