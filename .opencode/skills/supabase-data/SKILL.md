---
name: supabase-data
description: Supabase data layer of E-Estimate — client setup, catalogue tables, zone-aware rate fetching, storage bucket, migrations, and rate-sync pipelines. Use when changing data fetching, catalogue/lead/rate queries, Supabase schema, or material rate ingestion.
---

# Supabase data layer

## Client

Singleton in `src/renderer/src/lib/supabase.ts`: anonymous read access,
`persistSession: false, autoRefreshToken: false`. There is NO login/auth flow.
Publishable key is a baked-in fallback; overridable via `VITE_SUPABASE_URL` /
`VITE_SUPABASE_KEY`. Tests mock it by module path:
`{ './supabase': { supabase: {} } }`.

## Tables (via `.from(...)`)

| Table | Used by |
|---|---|
| `ssr_item` | dataVariants, lead, materialRates, seigniorage |
| `ssr_year` | comparative statement SOR years |
| `lead_rate` / `pipe_lead_rate` | lead.ts / pipeLead.ts |
| `allowance_rule` / `sor_constant` / `material` / `gst_rate` / `seigniorage_charge` / `sor_catalogue` | masterData, rateAnalysis, materialRates, projectTax, seigniorage, sorCatalogue |

Storage bucket `ssr-figures` serves dimensioned figure images
(DataDashboard, RateAnalysisTable, dataSheetPrint).

## Rules

- NEVER hard-code rates/zones/constants that live in these tables. Always fetch
  and normalize per project zone (`normalizeLeadRateRow(row, zone)`,
  `zoneRates?.[zone]` patterns).
- Schema changes go in `supabase/migrations/*.sql`; RLS policy notes live in
  `scripts/sql/`.
- The service-role key is used ONLY server-side in GitHub Actions rate-ingestion
  workflows (`.github/workflows/sync-pred-material-rates.yml`,
  `steel-cement-rates.yml`) and `scripts/rate-sync/` (Python OCR pipeline; needs
  Poppler/Tesseract). Never reference service-role keys in VITE_ vars or app code.
- Rate discovery from PRED circulars: `scripts/rate-scraper/sync.cjs`
  (content-hash dedupe); publishing discovered rates is a separate human step.

See also the sor-data skill for estimation-domain rules.
