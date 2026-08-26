export const ORDINARY_SAND_SEIGNIORAGE_CODE = 'SEIG_ORDINARY_SAND'

const NON_ORDINARY_SAND_RE =
  /\b(?:m sand|manufactured sand|stone dust|crusher dust|silica sand|quartz sand|moulding sand|molding sand|foundry sand|filter sand|sand blast|blasting sand|blast gun|gun nozzle)\b/
const NATURAL_FINE_AGGREGATE_RE =
  /\b(?:fine aggregate|ordinary sand|natural sand|river sand|sand screened|sand un screened|screened sand|un screened sand|sand for filling|filling sand)\b/

/**
 * Natural fine aggregate is Ordinary Sand for seigniorage purposes. Keep
 * manufactured and specialty sands out of this invariant even when their
 * descriptions also contain the word "sand".
 */
export function isNaturalFineAggregate(description: string | null | undefined): boolean {
  const normalized = (description ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!normalized || NON_ORDINARY_SAND_RE.test(normalized)) return false
  return normalized === 'sand' || NATURAL_FINE_AGGREGATE_RE.test(normalized)
}

/** Repair stale Sand (Others) policy/snapshot codes without mutating the project file. */
export function canonicalSeigniorageCode(
  seigCode: string | null | undefined,
  materialDescription: string | null | undefined
): string | null {
  if (isNaturalFineAggregate(materialDescription)) return ORDINARY_SAND_SEIGNIORAGE_CODE
  return seigCode?.trim() || null
}
