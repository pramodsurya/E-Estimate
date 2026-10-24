# Continue the MoRTH material Lead implementation

Repository: pramodsurya/E-Estimate. Checkpoint branch: codex/sor-morth-checkpoint-20261024.

## Next task

Implement docs/morth-material-lead-plan.md. The user approved a simple SSR-style material Lead workflow: sand gets Sand Lead, aggregates get their material Lead, and dedicated carriage/conveyance resources are excluded from active MoRTH DATA and Individual Costs. Production machinery and verified fixed operations remain. No separate vehicle-cycle UI is requested.

This implementation is pending at this checkpoint. The earlier vehicle-method proposal is superseded; use the material-Lead plan. Preserve existing SSR/SOR behavior.

The checkpoint already contains the current SOR selector, annual Lead tariff integration, MoRTH catalogue/individual resource costs, recursive appendix costing, source-separated rate/percentage overrides, SSR-style MoRTH presentation and linked appendix PDF/Excel exports. It also captures the checkout's current Canal work; avoid changing Canal during the MoRTH task.

## Important implementation details

- The main MoRTH builder is src/renderer/src/lib/morthEstimate.ts. Native arithmetic is src-tauri/estimate-core/src/rate_analysis/morth.rs.
- Shared material Lead behavior is in lead.ts, leadApplicability.ts, dashboardSync.ts and components/data/EstimateLeadPanel.tsx. The Lead panel currently excludes MORTH, and the builder does not emit its material Lead metadata.
- Recursively scale appendix material quantities. In the verified slab fixture, 120 cum parent concrete consumes 120/360 of Appendix 21.07, which contains 162 cum sand: parent sand requirement is 54 cum. Shared appendix definitions must not cause consumption to be omitted or counted twice.
- Exclude superseded carriage before native quantity validation and totals; hiding rows is insufficient. Keep validated fixed watering/pumping/placing/handling operations, and avoid overlaps with applied Lead. Processed concrete, hot mix, special precast transport and disposal still need appropriate material Lead coverage rather than being silently unpriced.
- Apply the chosen SSR-style final-rate convention consistently to UI, native results, project totals, Typst and Excel. Required Lead remains pending until explicitly resolved. Do not accidentally export a base rate as a complete final rate after deleting transport.
- MoRTH and SSR individual rate groups remain separate. Global resource rate edits must not overwrite per-usage Lead sources/distances.
- Keep exact requested/resolved annual recipe IDs, year/zone and unit evidence. Historical 2019 Delhi benchmarks must not be relabelled as current SOR prices.

## Audit evidence and backend

Supabase project reference: hqddsxnykndgcmxwqwmn. Main source table: public.morth; resource prices: public.analysis_resource; annual tariffs and policy: SOR_Recipie, SOR_Year, SOR_Lead_Rule.

Read docs/morth-lead-audit-2026-10-24.json for resource groups and scripts/fixtures/morth-lead-quantity-audit.json for all 1,830 missing-fixed-quantity occurrences, of which 1,824 depend on distance. scripts/fixtures/morth-lead-backend-audit.json contains query evidence, annual probes and relevant RPC definitions. Existing morth-slab-appendix.json and morth-foundation.json are useful full recipe fixtures.

No database changes were made for the material-Lead redesign. Earlier migrations in this checkpoint belong to the completed SOR/MoRTH integration. Inspect the current live schema before further backend changes; do not blindly replay existing migrations against production. Cloud access to the desktop's Supabase connector is not established by pushing this branch. Obtain access through the cloud environment's configured integrations/secrets; do not put privileged keys in code or logs.

## Validation

The local renderer build, web TypeScript check, relevant ESLint checks, native build and MoRTH PDF/Excel presentation tests passed before this checkpoint. A shared cement change recalculated both sample parent rates from 6075.18 to 6139.04 in Excel, matching native arithmetic. MoRTH DATA and appendices use SSR-style presentation.

For the new implementation, cover exact recursive quantities, shared-appendix usages, removal of duplicate carriage, retained fixed operations, zero distance, delivered/included scope, unresolved material mappings, annual changes and consistent final export rates. Re-run existing SSR/SOR Lead regressions.

Useful checks include npm run typecheck:web, npm run build:renderer, npm run test:lead, npm run test:pipe-lead, npm run test:rate-analysis and npm run test:morth-presentation. Native core tests can run with cargo test --manifest-path src-tauri/estimate-core/Cargo.toml --lib rate_analysis. Some existing scripts assume Windows .exe paths; adapt only the necessary test harness paths for the cloud OS, and build the required native CLI. Excel COM visual/recalculation checks require Windows and were run locally; do not claim those ran in a Linux cloud environment.
