# MoRTH catalogue and DATA integration plan

Status: investigation and implementation plan; no application or database changes made in this phase.
Verified on 23 October 2026 against Supabase project hqddsxnykndgcmxwqwmn and the current checkout.
The companion morth-supabase-investigation-2026-10-23.json records the inspected contracts and public API checks.

## Governing clarification — 24 October 2026

The user clarified that MoRTH supplies analysis quantities/rules and a provisional starting cost, while linked SOR items supply rates for each financial year. Individual Costs is a shared project resource-adoption layer for BOTH MoRTH and SSR, with Materials, Machinery and Labour pages. Default an offered SOR choice to a named Medium option or otherwise the first recorded SOR option; expose Correct / Maybe / Review Required independently from numeric price availability.

The detailed cross-source design and complete row audit are in [individual-costs-plan.md](individual-costs-plan.md) and [individual-costs-resource-audit-2026-10-24.json](individual-costs-resource-audit-2026-10-24.json). Main MoRTH cost control: the user can choose a SOR item OR simply type a manual resource rate. Both modes update all bound MoRTH uses. A manual starting rate needs no SOR selection or quotation/approval form and is preserved on ordinary Sync until the user changes it or returns to SOR-linked pricing.

Source separation and SSR pricing clarification: MoRTH and SSR rows never merge, even when their SOR item is identical. All group/adoption/override keys include ownerSource. SSR defaults to SSR_Year and additionally offers direct Manual rate entry, Choose SOR, and Use SSR rate to restore its annual default. Each source's cost edits propagate only to its own bound uses.


Interaction model: reuse the established Cement / Steel rate panel's published/adopted rate display, local staged edits, Apply/Discard, provenance, unit conversion and restore behaviour. Add the explicit Choose SOR mode. Apply automatically recalculates source-scoped uses; preserve SSR/MoRTH separation and intentional per-DATA manual locks.

This clarification supersedes any earlier proposal that deferred SSR individual resources or blocked every provisional starting price behind source cost_ready=false. No source records were changed.

## Intended result

Add MoRTH as its own catalogue/source beside SSR, SOR and Project DATA. Reuse the simple SSR selection pattern: browse or search, choose a source variant where necessary, press + and continue. An added MoRTH analysis must create real MoRTH DATA with materials, machinery, labour, its own calculation rules and its pricing evidence.

Keep internal database identities hidden. Display descriptions, source book item numbers, human-readable variant names and units. Preserve identities in saved project data.

The catalogue must be useful for starting DATA costs. Add an analysis with its shared default resource choices, and calculate a provisional cost from numeric selected-year SOR ingredient prices wherever the use basis is defined. Maybe/Review Required mapping confidence remains visible. Missing prices or quantities remain pending; never substitute zero.

## What exists in Supabase

| Surface | Verified purpose / state |
| --- | --- |
| public.morth | Authoritative recipe/source records: 3,345 rows. Source quantities, resource identities, formulas, project parameters and review evidence already exist. All 3,345 currently have cost_ready=false. |
| MORTH_Recipie_Variant_View | One source variant per row; exposes materials, machinery, labour, others, quantity, rate_structure, project_category, analysis_variant, source pages and requirements. |
| morth_variant_merge | 319 recorded merges across Small/Medium/Large variants, with source fingerprints and dependency groups. |
| MORTH_Recipie_View | Current catalogue view: 2,707 rows, including 319 shared entries. Combines equivalent category copies; invalid fingerprints or dependencies cause source rows to reappear. Both MoRTH views use security_invoker=true. |
| analysis_resource | 889 resource identities. Pricing is a JSON array, with source scope/status. Identity existence does not establish an available current price. |
| SOR_Recipie / SOR_Year | Existing approved ingredient identities and annual pricing; reuse their resolver and unit rules. |
| MoRTH annual prices | No separate MoRTH annual-rate table was found in the inspected MoRTH surfaces. Prices normally come from the linked SOR ingredients for the selected year. A distinct project adopted rate is an explicit override, not an annual MoRTH rate. |

Source book edition is Second Revision 2019 Volume I. Plant and Machinery uses a differently formatted edition string; retain raw provenance and group the same edition through an explicit display mapping, not a source rewrite.

The raw 3,345 rows include 1,062 each for Large, Medium and Small, 136 machinery records with not_applicable category and 23 carriage records without a project category. Shared does not justify inferring project size from the geographic zone: category may still affect overheads or dependencies.

Six source Parts:
1. Road Works: Chapters 1–11.
2. Bridge Works: Chapters 12–17.
3. Tunnel Works: Chapter 18.
4. Environmental and Safety Management and Bio Engineering: Chapter 19.
5. Plant and Machinery: Chapter 20.
6. Appendix: Chapter 21.

The common catalogue has 2,516 entries with required_project_parameters. Its addon_table arrays are currently empty, but conditional_adjustments, optional_allowances, conditional_resources, pricing_additions and output_variants exist in recipe JSON. Empty addon_table is not proof of a plain, fully configured analysis.

The view's others column is an alias for recipe.percentage_allowances (nonempty in 1,458 source rows), while rate_structure aliases recipe.calculation. These are not additional ingredient collections to add on top of the same recipe fields. Compile each named allowance once and reconcile mirrored allowance metadata instead of duplicating it in DATA.

The component inventory contains references to SOR_Year, analysis_resource, nested morth analyses and derived_component_rate. Quantity expressions include affine and parameter forms. One stone-crushing record has no rate_divisor because it uses explicit allocation/yield output formulas; do not substitute analysis_quantity as its divisor.

Resource prices: 180 stored records across 176 identities. 118 explicitly identify Delhi 2019–20 historical benchmarks; 46 more identify 2019–20 via sor_year; four identify 2023–24/2024–25, six identify 2025–26 and six lack a year. No 2026–27 pricing record was found in analysis_resource in this inspection. This does not prevent current prices for ingredients linked to SOR_Year.

## Existing functions: reuse and boundaries

| Function | Role in implementation |
| --- | --- |
| morth_pricing_snapshot(year, zone, requests, resource_codes) | Batch ingredient acquisition. Calls sor_resource_quote for SOR requests; returns raw analysis_resource pricing records. It does not calculate a MoRTH finished-work rate or select/approve a raw resource quotation. Currently accepts only 2025–26/2026–27, up to 256 requests and 1,000 resource identities. Start with smaller measured batches. |
| sor_resource_quote | Resolve approved recipe revisions and selected-year/zone rates and supported rate components. Check priced status, returned year, scope and units; preserve revision evidence. |
| sor_unit_rate_factor | Existing source/requested-unit conversion policy to reuse where applicable. No inferred density, duty or capacity conversion. |
| sor_morth_analysis_options | SOR research-candidate lookup only. Returns null rate, cost_ready=false and can_auto_price=false. Not the native MoRTH catalogue/pricing endpoint. |
| sor_morth_analysis_rate_valid | Validates the shape of SOR research links; does not approve or price a candidate. |
| sor_morth_analysis_link_guard | Preserves costing holds and source evidence on SOR annual research links. Keep it intact. |
| sor_morth_referenced_key_guard | Protects MoRTH identities/source evidence referenced by those links. Keep it intact. |
| sor_resource_links_valid | Existing constraint validation for current resource-table links. Preserve it. |

Public-role checks succeeded: catalogue count 2,707; current zone_3 Mate binding resolves through an approved revision at 685/day and Mazdoor binding returns 635/day. An example SOR jungle-work link returns nine research candidates, scope_review_required and a null rate. That is evidence to keep candidate adoption separate from direct MoRTH selection.

For editions beyond the snapshot function's whitelist, use an explicit supported acquisition path or extend that contract with tests. Never silently substitute another financial year. In particular, historical Delhi benchmark prices are not current Telangana project prices.

## Selection UX

Recommended navigation:
Source book edition → Part → Chapter/Heading → Section, where present → Printed item family → Work/method variant.

Collapse duplicated chapter/heading/section levels when they represent the same source node. Do not invent mandatory empty sections. Distinguish recorded analysis variants from the printed family number, rather than parsing a whole internal identity to invent labels.

- Add a MoRTH tab/source to Full Add Item, backend DATA browsing and the shared single-item selector.
- Show compact tree groups before terminal items. No broad descendant item list under a Part.
- Global search supports descriptions, genuine printed item references and chapter wording.
- Plain terminal item: +. Variant/optional-scope item: arrow into the recorded choices, then +.
- Physical work/method variants belong to item selection. Shared ingredient choices/rates belong to DATA → Individual Costs. Analysis-specific parameters and Lead inputs stay in their respective DATA/Lead views; avoid a checkout form in the catalogue.
- Project size (Small/Medium/Large) is independent of zone_1/zone_2/zone_3. Use a visible project default with a per-item override where the source permits it. Use Medium as the initial project-category choice where appropriate; not_applicable stays not applicable. Ingredient candidate defaults remain a separate decision.
- Shared entries appear once. Map the chosen category through source_codes_by_category and retain the exact source identity. If a merge becomes invalid, preserve the saved source and flag review; do not switch by description.
- Multiple selections, removal, continued search, and existing single/shared measurement-sheet storage behave like SSR.
- Template Lite opens the saved MoRTH variant first, supports Back/replacement, and commits only on Apply. Wire this after the Full source/DATA path works.
- Show Pending DATA inputs / Current quote needed as useful status, never an invented rate. Source review holds remain visible in DATA.

## First-class project/source model

Add MORTH to ItemSource, MasterItem.side and RateAnalysisRecipe.itemSource. Do not identify MoRTH as SSR, SOR, OTHERS or generic Project DATA.

Introduce typed MoRTH selection/configuration evidence, separate from the SSR DataVariantSelection and SOR catalogue snapshot:
- Canonical catalogue identity plus exact resolved source code(s), edition, content hash and merge fingerprint.
- Printed family/reference, work variant and explicit project category.
- Parameters, conditional scopes, resource choices, scoped approval evidence and adopted quotation references.
- Requested pricing year/zone, quote provenance, source units, conversion factors and dependency identities.
- Independent match confidence (Correct / Maybe / Review Required), price availability, default/user adoption and calculation state (starting/recalculated/pending/unsupported/stale).
- A canonical configuration key so different methods, sizes, parameters or dependency choices never collapse into the same DATA group.

Persist this on ProjectNode and RateAnalysisRecipe; include it in project item keys, deduplication, Sync fingerprints, snapshots and saved override merging. Item descriptions remain presentation only.

Keep estimate measurement quantity separate from analysis_quantity / quantity / rate_divisor. For example, a 10-cum source batch does not mean the user measured 10 cum.

## DATA and native calculation

Current DATA dispatch supports SSR/SOR. Unrecognised catalogue items would fall into the SOR path, which requires a SOR snapshot. Existing TypeScript and Rust types/calculation also assume SSR-style overhead behaviour. Add an explicit MoRTH branch end to end.

Suggested modules:
- types/morth.ts: source DTOs, configuration, quotation, readiness and evidence contracts.
- lib/morthSource.ts: compact browse/detail acquisition and validated resource batches.
- components/morth/MorthPicker.tsx: shared Full/Lite/single source picker.
- lib/morthEstimate.ts: compile resolved source/configuration into MoRTH DATA and measurement defaults.
- src-tauri/estimate-core/src/rate_analysis/morth.rs: authoritative supported formula evaluator.
Names are proposed, not existing modules.

Preserve the native-only calculation architecture. TypeScript acquires and validates source/quote inputs, adapts them into a typed native request and renders the result. Rust calculates quantities, nested direct costs, allowances, overheads, profit and final unit rates. No JavaScript financial fallback and no eval of source expression text.

Native MoRTH result must carry readiness, missing inputs/resources, source/derived trace and explicit totals:
1. Evaluate recorded quantities, signs and supported affine/parameter expressions.
2. Resolve source resource choices and exact units.
3. Price materials, machinery and labour using the chosen annual scope.
4. Evaluate nested analyses in dependency order; detect cycles and missing dependencies.
5. Apply source-defined conditional additions/omissions, credits and named percentage bases.
6. Apply overhead and contractor profit separately, using the source rules and selected project type.
7. Divide by the recorded rate basis, or use an explicit specialised output/allocation adapter.
8. Return one calculation summary consumed by DATA, Sync, estimate totals, Typst/PDF and native Excel.

Do not fold contractor profit into the SSR overheadPercent field. Do not apply the SSR default 14% or area allowance to MoRTH by accident. The inspected bridge example selects 20% or 30% overhead by project type, then 10% contractor profit; tunnel and Appendix rules differ. Appendix production dependencies can exclude parent markup. Machinery can split hire, fuel and crew; never also add hire_total to those same components.

Source cost_ready=false is not a live quote resolver or a universal block on provisional project costing. Keep that source value unchanged, re-evaluate dynamic rate availability against current SOR quotes, and hold shared starting choices in the project's Individual Costs layer. Default candidates and recorded approximations can produce a provisional numeric cost without changing their mapping confidence to Correct or fabricating a source approval.

Unknown quantity/conversion/formula bases cannot be invented. Missing rates stay null. Where a numeric adopted cost and supported basis exist, propagate that starting calculation through DATA and working estimate totals with Correct/Maybe/Review Required evidence visible. Unsupported operations remain pending. PDF/Excel must use the same result and status, rather than misrepresenting the starting cost as an exact confirmed rate.

DATA layout:
- MoRTH source heading, printed reference, chosen variant/category, book edition, pricing year and zone.
- Materials / Machinery / Labour with source quantity, evaluated quantity, unit, selected rate and amount.
- Named allowances, dependency subtotals, overhead, contractor profit, rate basis and final rate.
- A Requirements panel for analysis-specific inputs and a link to the shared Individual Costs entry for ingredient choices/rates.
- Expandable human-readable source/price evidence; internal identities hidden.
- Existing DATA scope, override and reopen behaviour, with source-refresh conflicts shown explicitly.

## Pricing, year changes and Lead

Use approved SOR ingredient links through the existing quote resolver. Preserve source-specific no-cross-year/no-cross-region rules. An approved identity revision is different from borrowing another year's price: the returned quote must satisfy the selected annual scope.

MoRTH shared resource pricing has two first-class modes: choose a linked SOR item or directly enter a Manual rate in the resource's displayed unit. Keep historical analysis_resource benchmarks as evidence; do not silently adopt them as current SOR prices. Manual entry requires no SOR selection, quotation form, approval step or evidence attachment. Save it within the estimate and label its rate origin Manual. Optional notes/evidence can be added later.

SOR-linked mode follows annual quote resolution. Manual mode keeps the user's entered rate during ordinary Sync and year/zone changes until the user edits it or switches back to SOR. Preserve the entered unit/context and previous SOR choice for provenance. Both modes update the same bound MoRTH uses and never alter SSR_Year rates or the public source records.

Keep source book edition and ingredient pricing year as separate controls. A pricing-year/zone change invalidates affected native results and snapshot fingerprints, refreshes ingredient quotes and revalidates dependencies while preserving compatible estimator inputs. Changed definitions or units require review.

Keep Lead in the Lead UI. MoRTH carriage/water/material inputs sometimes already include transport, delivery or loading. Preserve those scope boundaries; add only eligible external Lead, once. Do not price a MoRTH whole-work line by attaching a generic SOR material class. Do not change SSR Lead policy or automatically adopt SOR research candidates.

Carry approved material classes/Lead evidence on actual MoRTH resource lines where available. Keep optional machinery substitutions, water equipment capacity, revised hours and split hire/fuel/crew as explicit source/project decisions.

## Integration map

| Area | Required change |
| --- | --- |
| masterData.ts; types/project.ts; types/rateAnalysis.ts | Source unions, MoRTH snapshots/configuration and native request/result types. |
| AddItemModal.tsx; UnifiedCodePicker.tsx; backend DATA selector | MoRTH source, matching selection actions and Lite restore. |
| useStore.ts; projectItems.ts | Validate/persist source choices, meaningful display labels, grouping keys and shared/separate measurements. |
| rateAnalysis.ts | Explicit MoRTH fetch/adaptation/recalculation dispatch; preserve null/unresolved states. |
| recipeMerge.ts; dashboardSync.ts | Per-source refresh, hash/configuration invalidation, preserved edits and no stale adopted rate on failure. |
| dataPresentation.ts; RateAnalysisTable.tsx; RateAnalysisDashboard.tsx; dataSheets.ts | MoRTH DATA sections/requirements, profit and readiness with a single native summary. |
| materialRates.ts and project rate-link providers | Apply eligible source-backed overrides by exact resource identity; reprice affected analysis/dependencies. |
| Lead integration | Exact resource/scope eligibility; no duplicate included carriage and no SSR policy changes. |
| typist-output/dataTypst.ts; Typst templates | Human-readable MoRTH headers and source-specific abstract rows using native results. |
| excel-output/dataExcel.ts; native excel_compile/data and models | Explicit MoRTH DATA grouping/sheet and total references. The current non-SOR filter sends everything into the SSR sheet; replace that classification deliberately. |
| Native estimate-core calculator and IPC types | MoRTH formula/basis/result extension, shared by screen and output drivers. |
| Project DATA resource-source selectors | Allow deliberate MoRTH analysis adoption only with supported scope/basis; retain source provenance rather than disguising it as a SOR supply rate. |

Re-use formatting components where possible, but a MoRTH output must be identified as MoRTH DATA in both screen and exports.

## Loading and query design

Reuse the proven bounded cache and navigation approach; do not download all 3,345 source recipes to open a menu.
- Compact navigation summaries and paginated leaf summaries, fetched independently of full detail/pricing.
- A keyed tree built once per edition, stable book ordering and local singleton collapse.
- On-demand detail, dependency closure and deduplicated resource identities.
- Browse cache by edition/path/project category/query/page; pricing cache by resource, year, zone, component, unit and approved quote version.
- Coalesced requests, cancellation guards, bounded LRU entries and delayed next-page/detail prefetch.
- Add measured full-text/printed-reference indexes if needed; inspect public-role plans and payloads.
- Do not group and return complete materials/machinery/labour JSON for navigation.

The merged view recomputes source/dependency validity. Measure it before putting recursive fingerprint checks on every tree click. A compact maintained summary/index may be appropriate, but it must preserve the view's fallback semantics and validate the exact source fingerprint at selection and Sync. Current indexes are primary keys plus source edition/chapter/printed item; no dedicated catalogue full-text index was found.

New browse/detail functions should retain security-invoker behaviour and existing source access policies. No catalogue/public-source write access is needed for adding items to a local estimate.

## Delivery order

1. Shared Individual Costs contracts and complete MoRTH/SSR resource inventory: group by compatible identity/specification/scope, preserve per-use conversion/basis, and define Correct/Maybe/Review Required plus Medium/first candidate defaults.
2. Individual Costs pages for Materials/Machinery/Labour, with BOTH MoRTH and SSR, shared project adoptions and automatic dependency propagation. Default SSR rows to SSR_Year, support optional Manual/SOR adoption with source-scoped recalculation, and connect a native MoRTH vertical slice: Bridge Foundations manual excavation (source batch 10 cum, direct labour resources), explicit project type/conditional allowances, current ingredient quotes and human-checkable DATA. This proves catalogue → + → stored item → MoRTH DATA → Sync → totals → PDF/Excel before broad rollout.
3. Catalogue navigation/search and Full multi-select, with shared/separate measurement sheets and saved configuration keys.
4. Expand supported costing: direct machinery/materials, project quotations, affine quantities, conditional choices and nested Appendix dependencies. Keep unsupported records browsable as pending with a specific reason.
5. Lead/material overrides, year/zone refresh, template Lite and deliberate Project DATA source adoption.
6. Special adapters: stone-crushing multiple outputs/allocation, source credits, special production/markup rules and other uncommon operations. Do not route these through an ordinary divisor fallback.
7. Release reconciliation and performance checks across the entire catalogue; document supported and pending source patterns.

First slice source arithmetic check: the inspected foundation analysis uses Mate 0.14 day and Mazdoor 3.5 days. With the verified zone_3 2026–27 quotes, direct labour cost for its source batch is 2,318.40 before conditional allowances, overhead and profit. Test source-prescribed rounding and the 10-cum basis explicitly; do not inherit SSR's adopted-rate rounding by assumption.

## Acceptance checks

- Correct counts and source-category grouping; a shared item appears once and invalid merge/dependency fingerprints safely fall back to original variants.
- Normal tree, global printed-item search, direct +, variant selection, multiple picks/removal, shared/separate sheets and hidden internal IDs.
- Same saved item/configuration reopens; distinct categories/methods/configurations stay separate. Lite Apply/Cancel semantics remain intact.
- Ready, provisional and pending MoRTH items are first-class DATA. Numeric starting costs retain their confidence state; missing rates/inputs never price as zero or leak a stale prior-context total.
- Individual Costs includes both source catalogues in all three pages. Editing a MoRTH shared adopted resource cost automatically updates its bound MoRTH uses and nested analyses without a second manual Sync. SSR defaults to SSR_Year and also supports explicit Manual or SOR modes using its own calculation rules. Source groups and their propagation never merge.
- Selected-year/zone ingredient prices, exact units, approved identity revisions, quote effective scope and project-specific substitutions are explicit.
- Percentage bases, separate overhead/profit, credits, nested dependency markup, cycle handling and the special missing-divisor record have native fixtures.
- Material/transport charges are counted once. Existing SSR and SOR Lead and calculation regressions pass.
- Screen DATA, Sync, estimate totals, PDF and Excel agree from the same native summary; MoRTH is labelled correctly in exports.
- Public-role browse/detail/quote requests remain within measured latency/payload budgets; revisiting a cached tree branch avoids redundant calls.
- No changes to source benchmark prices, source holds or SOR-to-MoRTH research-candidate guard semantics.

## Scope of this phase

This phase is the plan and live read-only investigation. It does not add a catalogue tab, mutate source records, clear costing holds or ship a MoRTH calculator yet. The first implementation should establish Individual Costs for both MoRTH and SSR and connect the native vertical slice above so shared ingredient changes, catalogue selection and DATA calculation arrive as one consistent workflow.
