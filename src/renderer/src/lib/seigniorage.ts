import { supabase } from './supabase'

export interface SeigniorageCharge {
  seig_code: string
  mineral_name: string
  rate_per_mt: number | null
  rate_per_m3: number | null
  schedule: string | null
  go_reference: string | null
  effective_from: string | null
  confidence: string | null
  notes: string | null
}

let chargesCache: Promise<SeigniorageCharge[]> | null = null

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function textOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  return text || null
}

export async function fetchSeigniorageCharges(): Promise<SeigniorageCharge[]> {
  if (!chargesCache) {
    chargesCache = (async () => {
      const { data, error } = await supabase
        .from('seigniorage_charge')
        .select(
          'seig_code, mineral_name, rate_per_mt, rate_per_m3, schedule, go_reference, effective_from, confidence, notes'
        )
        .order('mineral_name', { ascending: true })

      if (error) throw error

      return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
        seig_code: String(row.seig_code ?? ''),
        mineral_name: String(row.mineral_name ?? ''),
        rate_per_mt: numberOrNull(row.rate_per_mt),
        rate_per_m3: numberOrNull(row.rate_per_m3),
        schedule: textOrNull(row.schedule),
        go_reference: textOrNull(row.go_reference),
        effective_from: textOrNull(row.effective_from),
        confidence: textOrNull(row.confidence),
        notes: textOrNull(row.notes)
      }))
    })().catch((error) => {
      chargesCache = null
      throw error
    })
  }

  return chargesCache
}

export function seigniorageRateLabel(charge: SeigniorageCharge): string {
  const mt = charge.rate_per_mt !== null ? `Rs. ${charge.rate_per_mt.toFixed(2)} / MT` : ''
  const m3 = charge.rate_per_m3 !== null ? `Rs. ${charge.rate_per_m3.toFixed(2)} / m3` : ''
  return [mt, m3].filter(Boolean).join(' | ') || 'Rate not specified'
}
