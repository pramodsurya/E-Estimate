import type { IndividualCostInput } from '../types/individualCosts'
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
export function individualCostKey({
  owner,
  kind,
  raw,
  context
}: IndividualCostInput): string {
  const unit = String(raw.unit ?? '')
    .toLowerCase()
    .replace(/\s+/g, '')
  const identity = record(raw.resource_identity),
    lookup = record(raw.price_lookup)
  if (owner === 'SSR')
    return JSON.stringify([
      owner,
      kind,
      unit,
      identity.master_code ??
        identity.recipe_code ??
        identity.resource_key ??
        context,
      identity.rate_component ?? 'rate',
      String(record(identity.link_review).rate_basis_multiplier ?? '1')
    ])
  const targets = new Set<string>()
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) {
      v.forEach(walk)
      return
    }
    for (const [k, val] of Object.entries(record(v))) {
      if ((k === 'recipe_code' || k === 'resource_code') && val !== null)
        targets.add(String(val))
      walk(val)
    }
  }
  walk(lookup)
  const named =
    identity.recipe_code ?? identity.master_code ?? identity.resource_code
  if (named !== undefined && named !== null) targets.add(String(named))
  return JSON.stringify([
    owner,
    kind,
    unit,
    raw.resource_key ?? context,
    [...targets].sort(),
    lookup.rate_component ??
      identity.rate_component ??
      record(raw.sor_ref).component ??
      'rate'
  ])
}
/** Merge equivalent MoRTH resources without conflating different grades or rate bases. */
export function individualCostGroupKey(input: IndividualCostInput): string {
  const key = JSON.parse(individualCostKey(input)) as unknown[]
  if (input.owner === 'SSR') return JSON.stringify(key)
  const targets = key[4] as string[]
  const description = String(input.raw.desc ?? input.raw.description ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
  if (!targets.length || !description) return JSON.stringify(key)
  return JSON.stringify([
    input.owner,
    input.kind,
    key[2],
    'resource-group',
    description,
    targets,
    key[5],
    String(
      record(record(input.raw.resource_identity).link_review)
        .rate_basis_multiplier ?? '1'
    )
  ])
}
