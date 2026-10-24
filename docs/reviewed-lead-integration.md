# Reviewed Lead table integration

Implemented 23 October 2026. This step connects the existing Lead dashboard/calculations; it does not replace the SOR Lite/Full picker UI.

## Sources and calculation

- Common material Lead reads compact Part 1 conveyance coordinates from SOR_Recipie, annual availability from SOR_Year and edition-specific rules from SOR_Lead_Rule. It no longer fetches the archived lead_rate table.
- Numeric tariffs are obtained through the existing sor_resource_quote contract, via the read-only morth_pricing_snapshot batch endpoint for its supported 2025-26/2026-27 editions. Batches are kept small for the public statement-time budget. Future editions use bounded individual quote calls if the annual chart and rules are available.
- The existing chart column/row contract is retained so dashboard tables, stored snapshots, source charts and print/export adapters remain compatible. The six included-in-item initial lead/lift coordinates are not turned into invented numeric tariffs; 75 published numeric cells are loaded per current edition/zone.
- SSR uses its own chart calculation and parent-work policy. SOR supplies numeric conveyance tariffs only; a material class never automatically selects a SOR supply-item Lead policy. Explicit leadRuleCode remains available for deliberately bound SOR calculations, outside the automatic SSR path. Missing annual material rules do not prevent an otherwise available SSR tariff chart from loading.
- Published cumulative head-load and 1-5 km bands remain distinct from actual-distance increments after 5 km. Reviewed lift uses the actual extra height; a larger parent DATA lift allowance is deducted by evaluating the source rule at both physical heights, without rewriting its initial 3 m threshold.
- Unsupported handling, unavailable tariff references and stale year/zone snapshots are errors rather than zero rates. Explicit project-local manual rates remain separately supported.
- A snapshot retains optional reviewed rules once, exact requested/resolved recipe IDs and annual row IDs, plus tariff evidence on calculations. SSR calculations identify their policy source and do not claim a SOR material rule. Saved common charts can be evaluated offline without a backend fetch.

The existing common-chart 13.615% contractor-profit/overhead removal remains in place; both captured editions have that published common-chart provision. Pipe-specific transport continues to use its own source basis rather than applying the common-chart factor.

## Year changes and Sync

Changing year/zone continues to invalidate the dashboard context. Lead Sync always refetches the current chart and quotes, even when year/zone did not change, and reprices its existing common Lead applications. A new-source pricing failure stops Sync rather than relabelling the old amount as a successful refresh. Existing quantities and mapping routes remain intact.

## Pipe Lead

For new SOR pipe material codes, fetchPipeLeadQuote and fetchPipeLeadQuoteForMaterial resolve the saved code through sor_resolve_recipe_year, load its exact annual lead_rule_code and verify the schema-3 PIPE rule's source_recipe_codes and metre quantity basis. Each referenced tariff is quoted for that year/zone/unit. The recorded expression controls started-kilometre pricing, and source evidence travels with the result.

This bridge supports the existing metre-based PipeLeadQuote contract. Other PIPE quantity bases require their corresponding application adapter and are explicitly rejected by this metre-based path.

Saved RCC conveyance selections now use their explicit end type (Public Health Table 6 or 7), diameter and class to select the exact two current SOR matrix coordinates. The SSR-compatible calculation retains the up-to-5-km base and each-started-kilometre increment; it does not fetch the supply item's Lead policy. Zero distance is zero conveyance, and loading/unloading/stacking stay included in this table's tariff.

All active pipe quote callers in Lead Sync, the Lead dashboard and the DATA/rate-analysis dashboard pass the project zone and saved conveyance selection. A quoted zone mismatch is rejected before a breakdown can be relabelled. Encoded PH-PIPELEAD identifiers and their parsing fallback are retired; an explicit current tariff selection or verified current SOR material is required. No diameter/description approximation or SSR-to-SOR policy inheritance is introduced.

Retired pipe RPC calls and unused catalogue/options/year-browser APIs have been removed. No SSR records, resource links, parent policies or live database records were changed for this separation fix.

## Resolver performance fix

Public API testing initially hit PostgreSQL statement timeouts even with small batches. EXPLAIN showed successor resolution scanning SOR_Recipie because the existing predecessor indexes did not match sor_revision_previous(recipe_revision).

Migration 20261023082309_index_sor_revision_previous_for_lead_quotes.sql adds a GIN expression index on that exact immutable expression. It is applied to the live project. No source rows, pricing functions, grants or RLS policies were changed. The captured post-index lookup uses the new bitmap index and completed in approximately 1.3 ms. Public API loading then passed for both editions and two zones. Post-change advisor counts are unchanged and show no finding for the new index.

## Weighted Excel consistency

Reviewed chart payloads identify continuous increments beyond 5 km. Native weighted-Lead Excel formulas honor that flag; legacy payloads retain their previous ceiling convention. The dashboard and newly exported weighted chart therefore use the same increment basis.

## Verification

- npm run test:lead: existing Lead regression suite plus live-capture-backed reviewed tariff/rule tests.
- npm run test:lead:live: read-only public/publishable-client checks for 2026-27 zone_3 and zone_1, 2025-26 zone_3, and the exact new SOR pipe binding.
- At 7.25 km without handling: common EARTH Lead is INR 172.03/cum in 2026-27 zone_3, INR 175.73/cum in zone_1 and INR 160.20/cum in 2025-26.
- At 6.2 km, SOR-P04-T01-M0061's exact 1800 mm NP2 pipe transport is INR 395.70/m in 2026-27 and INR 376.86/m in 2025-26.
- Tests cover distance boundaries, included lead/lift, fractional increments, handling selection, parent allowances, explicit material bindings, missing rates, stale context rejection, offline JSON round trips, same-context refresh, pipe quantity/unit validation and preserved legacy route shape.
- TypeScript web checking, targeted ESLint, Lead creation, pipe Lead, project Item/DATA ownership, rate-analysis and catalogue-DATA regression checks passed.
- Lead/weighted Lead and Lead-map Typst compilation checks passed. Native cargo test --lib excel_compile --no-default-features passed all 15 tests.
- scripts/test-lead-excel.cjs has a pre-existing failing source-string assertion that export must call await syncLeadDashboardSnapshot(current). The unchanged HEAD version of LeadPrintStudioSession.tsx deliberately exports its saved snapshot and asks the user to Sync first. Its payload checks pass; this unrelated export-policy assertion was not changed.

The renderer production build passed (4,822 modules transformed). The live API checks validate the Lead data/calculation path. A complete interactive desktop run with a user project was not performed.

## SSR separation verification (23 October 2026)

Regression coverage verifies that 2025-26 SSR cement/steel remain separately payable even when SOR supply metadata includes delivery; removing material-rule metadata does not change SSR results. Included all-leads, initial-km deductions and repeated haul legs retain their SSR behavior. Pipe tests exercise both selected-zone tariffs, explicit dimensions, retired identifier rejection, zero distance, unavailable years, invalid dimensions and stale-zone rejection. Read-only public API checks passed for both annual common charts, zone 1/3 and the separate RCC table path. Web TypeScript checking, targeted ESLint and Lead creation, pipe, DATA ownership, rate-analysis and current SOR regressions passed.

The new shared SOR selector now hands its source material class, annual Lead rule, unit and exact pipe specification into DATA/Lead through sorEstimate.ts. Conveyance tariffs remain excluded from Add Item and continue to be priced through the Lead UI. See sor-selector-redesign.md for the implemented picker and verification boundaries.
