/** Final estimates are sanctioned as whole rupees, always rounded upward. */
export function roundEstimateTotalUp(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.ceil(value)
}

const compactNumber = new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: 1
})

const wholeRupees = new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: 0
})

/**
 * Compact Indian estimate notation for covers and summary labels.
 * Lakhs stay below three integer digits; a value that displays as 100 Lakhs
 * is promoted to Crores. Crores are the terminal unit.
 */
export function formatCompactIndianEstimate(value: number): string {
  const rounded = roundEstimateTotalUp(value)
  const absolute = Math.abs(rounded)
  const sign = rounded < 0 ? '-' : ''
  const lakhs = absolute / 100_000

  if (absolute >= 10_000_000 || Math.round(lakhs * 10) / 10 >= 100) {
    return `${sign}${compactNumber.format(absolute / 10_000_000)} Crores`
  }
  if (absolute >= 100_000) {
    return `${sign}${compactNumber.format(lakhs)} Lakhs`
  }
  if (absolute >= 1_000) {
    return `${sign}${compactNumber.format(absolute / 1_000)} Thousand`
  }
  return `${sign}${wholeRupees.format(absolute)}`
}
