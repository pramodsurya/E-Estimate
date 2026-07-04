import { createClient } from '@supabase/supabase-js'

// Publishable (client-safe) key. Override via VITE_SUPABASE_URL / VITE_SUPABASE_KEY if needed.
const url = (import.meta.env.VITE_SUPABASE_URL as string) || 'https://hqddsxnykndgcmxwqwmn.supabase.co'
const key =
  (import.meta.env.VITE_SUPABASE_KEY as string) || 'sb_publishable_TUvTjZ--anWcRNGSOnJGhw_q4Z3z9ES'

export const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false }
})
