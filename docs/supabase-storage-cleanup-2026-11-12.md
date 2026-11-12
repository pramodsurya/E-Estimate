# Supabase cleanup — 12 November 2026

Project: `hqddsxnykndgcmxwqwmn`, configured in E-Estimate.

**Database: 1,142.73 MB → 362.86 MB. Freed 779.87 MB (68.2%).** MB uses 1,000,000 bytes.

| Measurement | Before | Final |
| --- | ---: | ---: |
| Database bytes | 1,142,732,467 | 362,862,259 |
| Legacy archive tables | 40 | 0 |
| Stored public tables | 24 | 23 |
| Public materialized views | 3 | 3 |
| Public ordinary views | 17 | 18 |
| Uploaded files | 28 | 28 |

## Changes

- Deleted the unused `legacy_sor_archive` schema, its 40 tables, internal relinking function and owned sequence. Application code, catalog dependencies and function bodies showed no active path into it.
- Replaced the stored `sor_picker_navigation_entry` table with an ordinary view over the browse index; removed its two synchronization triggers and trigger function. Navigation uses the existing covering index. An anonymous-role plan confirmed an index-only scan with zero heap fetches.
- Removed six duplicated stored MoRTH columns: `materials`, `machinery`, `labour`, `calculation`, `rate_structure`, `others`. The MoRTH view derives identical output from the authoritative `recipe` JSON. Resource expansion and integrity constraints now use those JSON fields directly. A table rewrite reclaimed physical storage.
- Removed the uncalled `sor_resolve_recipe_revision_v1` function.
- Frontend road defaults now use `SOR-P02-T03-R0118` and `SOR-P02-T03-R0138` directly. Removed retired-code translation and the old default-code conversion.

MoRTH allocation decreased from 98,410,496 to 57,761,792 bytes. All 3,345 source recipes are unchanged. Backend changes are live; frontend source changes take effect in the next application build.

## Required objects retained

| Purpose | Objects |
| --- | --- |
| SOR source/pricing | `SOR_Recipie`, `SOR_Year`, `SOR_Lead_Profile`, `SOR_Lead_Rule`, `SOR_Monthly_Rate` |
| SOR search/guidance | `sor_picker_index`, `catalogue_item_guidance` |
| SSR source/identities | `SSR_Recipe`, `SSR_Year`, `ssr_resource_key`, `ssr_resource_identity_alias` |
| MoRTH source/review | `morth`, `morth_variant_merge`, `analysis_resource` |
| Geography and estimating rules | `allowance_rule`, `village_allowance`, `thermal_power_plant`, `material_policy`, `gst_rate`, `seigniorage_charge`, `excavation_extra`, `sor_constant`, `spatial_ref_sys` |
| Materialized caches | `individual_cost_morth_registry`, `individual_cost_morth_usages`, `morth_picker_index` |

The indexed browse projection and three materialized caches serve current requests. A trial equivalent live individual-cost usage query took about **15.4 seconds**, exceeding the public API budget, so these caches were retained.

All retained relation counts match their pre-cleanup values; the navigation view also returns the former table's 21,022 rows. Ordinary views hold no separate row storage. Both supported fiscal editions remain authoritative rate data.

Supabase-managed Auth, Storage, Realtime, Vault and migration schemas were retained. The 6 source PDFs and 22 SSR figures occupy only 9,467,248 bytes and were retained.

## Removed archive tables

All names below belonged to `legacy_sor_archive`.

- `civil`
- `civil_rate`
- `conveyance_charge`
- `conveyance_rate`
- `electrical`
- `electrical_item_version`
- `electrical_rate`
- `labour`
- `labour_rate`
- `lead_charge`
- `lead_detail_item`
- `lead_detail_year`
- `lead_note`
- `lead_rate`
- `machinery`
- `machinery_rate`
- `manifest`
- `material`
- `material_rate`
- `material_rate_document`
- `material_rate_monthly`
- `pipe_lead_item`
- `pipe_lead_rate`
- `plumbing`
- `plumbing_rate`
- `reviewed_links`
- `snapshot`
- `sor_adjustment_rule`
- `sor_catalogue`
- `sor_catalogue_item`
- `sor_catalogue_rate`
- `sor_dataset_release`
- `sor_recipe_alias`
- `sor_recipe_definition`
- `sor_recipe_observation`
- `sor_reviewed_navigation_node`
- `sor_reviewed_navigation_variant`
- `ssr_item_history`
- `ssr_material_alias`
- `ssr_year_history`

## Backups

Local folder:

`C:\Users\napra\OneDrive\Desktop\Software E-estimate\.codex-work\supabase-cleanup-2026-11-12`

| Archive | Bytes | Contents |
| --- | ---: | --- |
| `legacy_sor_archive.dump` | 46,596,658 | All 40 archive table definitions/data entries and internal schema objects |
| `public_before_normalization.dump` | 31,635,438 | Public schema before normalization: 23 application table definitions and 24 data entries; PostGIS owns the `spatial_ref_sys` definition |

Both PostgreSQL custom archives were inventoried using `pg_restore --list` and fully decoded using `pg_restore --exit-on-error --file=NUL`. A separate database restore was not performed. Portable restore tools, contents listings, hashes and before/after audit snapshots are in the same folder. The backup scripts did not save connection credentials.

SHA-256:

- Legacy: `685272a684fb267f658aa7d45a3d8361dc9866fe99d9e9c2d8d34ec8f92c1d47`.
- Public: `b72f18903665f3cfd18d23a2c3b1cdd68a785af27a22c8153ad93ae5b239ac9b`.

## Applied migrations

- `supabase/migrations/20261112152111_remove_unused_legacy_sor_archive.sql`
- `supabase/migrations/20261112161522_normalize_derived_catalogue_storage.sql`
- `supabase/migrations/20261112162039_finalize_catalogue_view_reads.sql`

Local filenames match the remote migration records. Drops use `RESTRICT`, without `CASCADE`. The normalization request timed out at the tool, but the server committed it successfully; its migration record, resulting schema and subsequent verification confirmed completion. It was not applied twice.

## Verification

- Exact fingerprints match for authoritative MoRTH source records, complete variant-view output, both editions' navigation JSON, and all three refreshed materialized caches.
- Live SOR, Lead, individual-cost and monthly-rate checks passed.
- Live guidance checks passed for 359 SSR and 923 MoRTH records, including source integrity, search and pagination.
- The MoRTH → SOR → native DATA calculation passed.
- Three fresh final navigation requests completed in 1,110 / 381 / 1,016 ms.
- Canal and SOR selector regressions, web TypeScript checking, targeted ESLint and change whitespace checks passed.
- No new security-advisor category remains. Both replacement views use invoker access checks.

The older scheduled circular-import scripts still reference the retired public names `material_rate_monthly` and `material_rate_document`. Those public targets were already absent before cleanup, and neither job addresses the archive schema. This task did not redesign those import jobs. Current desktop monthly-rate reads use `SOR_Monthly_Rate`; source PDFs and the archived document metadata remain available in Storage and the local backup respectively.
