import { allowanceTypeLabel, type AllowanceRuleRow } from './masterData'
import { supabase } from './supabase'
import type { ProjectAreaAllowance } from '../types/project'

/**
 * Resolve the labour area allowance from an explicit classification only.
 *
 * The New Project form carries no map, so there is no coordinate to match:
 * the village/mandal/district audit fields stay null and the percentage comes
 * straight from the annual allowance_rule table.
 */
export async function resolveManualAreaAllowance(
  manualType: string | null,
  sorYear: string
): Promise<ProjectAreaAllowance> {
  if (!manualType) {
    return {
      type: null,
      label: 'No area allowance (manual)',
      percent: 0,
      village: null,
      mandal: null,
      district: null,
      goReference: null,
      ruleYear: sorYear || null,
      source: 'manual'
    }
  }

  const select =
    'allowance_type,value,value_type,description,tier,sor_year,go_reference,applies_to'
  const exact = await supabase
    .from('allowance_rule')
    .select(select)
    .eq('allowance_type', manualType)
    .eq('sor_year', sorYear)
    .eq('value_type', 'PERCENTAGE')

  if (exact.error) throw exact.error
  let rules = (exact.data ?? []) as unknown as AllowanceRuleRow[]

  // A newly selected SOR year may precede its allowance upload. Keep the
  // chosen classification and use the latest published labour rule instead of
  // silently dropping the allowance.
  if (!rules.length) {
    const latest = await supabase
      .from('allowance_rule')
      .select(select)
      .eq('allowance_type', manualType)
      .eq('value_type', 'PERCENTAGE')
      .order('sor_year', { ascending: false })
    if (latest.error) throw latest.error
    const all = (latest.data ?? []) as unknown as AllowanceRuleRow[]
    const latestYear = all[0]?.sor_year
    rules = latestYear ? all.filter((rule) => rule.sor_year === latestYear) : []
  }

  const labourRules = rules.filter(
    (rule) => !rule.applies_to?.length || rule.applies_to.includes('LABOUR_COMPONENT')
  )
  const rule = [...labourRules].sort((a, b) => Number(b.value) - Number(a.value))[0]
  const percent = rule ? Number(rule.value) : 0

  return {
    type: manualType,
    label: allowanceTypeLabel(manualType),
    percent: Number.isFinite(percent) ? percent : 0,
    tier: rule?.tier ?? null,
    description: rule?.description ?? null,
    village: null,
    mandal: null,
    district: null,
    ruleYear: rule?.sor_year ?? sorYear ?? null,
    goReference: rule?.go_reference ?? null,
    source: 'manual'
  }
}
