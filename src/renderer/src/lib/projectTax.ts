import { supabase } from './supabase'
import type { GstRecipientType, ProjectNode } from '../types/project'
import type { RateAnalysisRecipe } from '../types/rateAnalysis'

export interface GstRateRule {
  recipientType: GstRecipientType
  earthworkPredominant: boolean
  ratePct: number
  effectiveFrom: string
  effectiveTo: string | null
  notificationRef: string | null
  description: string | null
}

export interface EarthworkClassification {
  isEarthwork: boolean
  reason: string
  confidence: 'high' | 'review' | 'manual'
}

let rulesCache: Promise<GstRateRule[]> | null = null

export async function fetchGstRateRules(): Promise<GstRateRule[]> {
  if (!rulesCache) {
    rulesCache = (async () => {
      const { data, error } = await supabase
        .from('gst_rate')
        .select(
          'recipient_type,earthwork_predominant,rate_pct,effective_from,effective_to,notification_ref,description'
        )
        .order('effective_from', { ascending: false })
      if (error) throw error
      return ((data ?? []) as Record<string, unknown>[])
        .map((row) => ({
          recipientType: String(row.recipient_type) as GstRecipientType,
          earthworkPredominant: row.earthwork_predominant === true,
          ratePct: Number(row.rate_pct),
          effectiveFrom: String(row.effective_from ?? ''),
          effectiveTo: row.effective_to ? String(row.effective_to) : null,
          notificationRef: row.notification_ref ? String(row.notification_ref) : null,
          description: row.description ? String(row.description) : null
        }))
        .filter(
          (rule) =>
            (rule.recipientType === 'CENTRAL_STATE_UT_LOCAL' ||
              rule.recipientType === 'GOVT_ENTITY_OR_AUTHORITY') &&
            Number.isFinite(rule.ratePct)
        )
    })().catch((error) => {
      rulesCache = null
      throw error
    })
  }
  return rulesCache
}

export function resolveGstRateRule(
  rules: GstRateRule[],
  recipientType: GstRecipientType,
  earthworkPredominant: boolean,
  at = new Date()
): GstRateRule | null {
  const date = at.toISOString().slice(0, 10)
  return (
    rules.find(
      (rule) =>
        rule.recipientType === recipientType &&
        rule.earthworkPredominant === earthworkPredominant &&
        (!rule.effectiveFrom || rule.effectiveFrom <= date) &&
        (!rule.effectiveTo || rule.effectiveTo >= date)
    ) ?? null
  )
}

export function classifyEarthwork(
  node: ProjectNode,
  recipe: RateAnalysisRecipe | undefined,
  manual: boolean | undefined
): EarthworkClassification {
  if (manual !== undefined) {
    return {
      isEarthwork: manual,
      reason: manual ? 'Marked as earthwork by the estimator.' : 'Excluded from earthwork by the estimator.',
      confidence: 'manual'
    }
  }
  if (recipe?.earthworkClassification) return recipe.earthworkClassification

  const sourceText = `${node.name} ${node.itemDescription ?? ''}`.toLowerCase()
  const isEarthwork = /\b(excavat(?:e|ion|ing)|earth\s*work|embankment|borrow\s+(?:earth|soil)|selected\s+soil|soil\s+filling|earth\s+filling|murr?um\s+filling|desilt(?:ing|ation))\b/.test(sourceText)
  return {
    isEarthwork,
    reason: isEarthwork
      ? 'Item description identifies earthwork.'
      : 'Awaiting or lacking an explicit earthwork marker in DATA.',
    confidence: 'review'
  }
}

