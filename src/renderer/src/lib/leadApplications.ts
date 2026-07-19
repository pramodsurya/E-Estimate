import type { LeadApplication, LeadVariant } from '../types/project'

function materialKey(variant: Pick<LeadVariant, 'materialName'>): string {
  return variant.materialName.trim().replace(/\s+/g, ' ').toLowerCase()
}

function applicationKey(
  application: LeadApplication,
  variantsById: Map<string, LeadVariant>
): string | null {
  const variant = variantsById.get(application.variantId)
  const usageKey = application.itemNodeId || '__legacy_shared_data__'
  return variant
    ? `${materialKey(variant)}\u0000${application.itemKey}\u0000${usageKey}`
    : null
}

/**
 * One Item/component usage can have only one Lead application for a material.
 * The same shared DATA code may therefore retain different variants in other
 * components, while a conflicting application on the same Item node transfers
 * that usage to the incoming variant.
 */
export function upsertUniqueLeadApplication(
  applications: LeadApplication[],
  variants: LeadVariant[],
  application: LeadApplication
): LeadApplication[] {
  const variantsById = new Map(variants.map((variant) => [variant.id, variant]))
  const incomingKey = applicationKey(application, variantsById)
  let updatedExisting = false
  const next: LeadApplication[] = []

  for (const candidate of applications) {
    if (candidate.id === application.id) {
      if (!updatedExisting) {
        next.push(application)
        updatedExisting = true
      }
      continue
    }
    if (incomingKey && applicationKey(candidate, variantsById) === incomingKey) continue
    next.push(candidate)
  }

  if (!updatedExisting) next.push(application)
  return next
}

/** Keep the last stored application when migrating a project with duplicates. */
export function normalizeLeadApplications(
  applications: LeadApplication[],
  variants: LeadVariant[]
): LeadApplication[] {
  return applications.reduce<LeadApplication[]>(
    (normalized, application) =>
      upsertUniqueLeadApplication(normalized, variants, application),
    []
  )
}

/** Sum the per-output-unit Lead additions payable by one exact Item usage. */
export function scopedLeadRateAddition(
  applications: LeadApplication[],
  itemKey: string,
  itemNodeId: string,
  legacyTarget: boolean,
  defaultOutputQuantity = 0,
  selectedAddonId?: string
): number {
  return applications
    .filter(
      (application) =>
        application.itemKey === itemKey &&
        (!application.addonId || application.addonId === selectedAddonId) &&
        (application.itemNodeId === itemNodeId || (!application.itemNodeId && legacyTarget))
    )
    .reduce((sum, application) => {
      const divisor = application.outputQuantity || defaultOutputQuantity
      const addition =
        typeof application.rateAddition === 'number' && Number.isFinite(application.rateAddition)
          ? application.rateAddition
          : divisor > 0
            ? application.grossAmount / divisor
            : 0
      return Number.isFinite(addition) ? sum + addition : sum
    }, 0)
}
