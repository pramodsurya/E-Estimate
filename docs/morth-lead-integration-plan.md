# MoRTH Lead audit and recommended integration

> Current implementation direction: use SSR-style material Lead as described in [morth-material-lead-plan.md](morth-material-lead-plan.md). The vehicle-method proposal below is superseded; its catalogue findings remain audit evidence.

Read-only investigation: 24 October 2026. Supabase project hqddsxnykndgcmxwqwmn. This is an implementation proposal; no catalogue rows or project calculations were changed by this audit.

## Decision

Use the existing Lead workspace for MoRTH, with an explicit pricing method per transport leg. Preserve MoRTH resource identities, quantities and source evidence. Replace a transport contribution with a linked Lead calculation only after its replacement scope is known. Choosing a SOR conveyance tariff does not require replacing the underlying MoRTH material with a SOR material.

Recommended methods are SOR material conveyance, MoRTH vehicle-cycle analysis priced from an approved annual SOR equipment rate, and a project transport quotation/manual rate with an explicit unit and scope. Each leg uses exactly one method. Material purchase, fixed plant/site work, loading/unloading, travel and markup must be accounted for once each.

SSR retains its own parent-work policy. A SOR price link must not transfer a SOR supply-item Lead policy to SSR or MoRTH. A MoRTH route can share the UI and tariff service without acquiring SSR initial-lead or profit assumptions.

## What the live tables contain

All 3,345 records in public.morth were included, across large/medium/small categories, appendices and standalone equipment/transport analyses. The materials/machinery/labour projection columns agree with the corresponding recipe JSON arrays in every record.

| Main recipe section | Row occurrences | Null quantities |
| --- | ---: | ---: |
| Materials | 7,260 | 0 |
| Machinery | 8,128 | 1,830 |
| Labour | 8,928 | 0 |

All 1,830 null main quantities have a quantity_expression. They are not all extraction omissions: most intentionally require project input. Of these, 1,824 are distance-dependent, covering 10 resource keys in 1,170 recipe records and 102 printed item numbers. Counts are catalogue row occurrences, including category and analysis variants, not counts of distinct physical resources or rows in the user's current project.

| Resource | Distance-dependent occurrences | Quantity basis | Recommended treatment |
| --- | ---: | --- | --- |
| Transit truck agitator, 6 cum, concrete carriage | 681 | Source transport mass × lead, tonne-km | Lead vehicle-cycle analysis; preserve concrete vehicle requirements. Generic aggregate conveyance is not an established substitute. |
| Tipper 18 cum carriage | 95 | Source mass × lead, tonne-km | SOR conveyance where the cargo, unit and road/handling scope match; otherwise reviewed vehicle cycle. |
| Tipper 14 cum carriage | 98 | Source mass × lead, tonne-km | Same review; keep source mass and category-specific productivity. |
| Tipper 10 cum carriage | 95 | Source mass × lead, tonne-km | Same review; do not assume equivalence to the available 5 cum SOR tipper. |
| Tipper 10 cum, tunnel muck | 3 | Source mass × disposal lead, tonne-km | Disposal leg in Lead; tunnel/road and loading scope need explicit review. |
| Trailer 30 tonne, girder/fascia carriage | 6 | Source mass × lead, tonne-km | Special transport calculation/quotation; no confirmed generic substitute. |
| Trailer 30 tonne, structural-steel haul | 6 | Fixed hours + lead/15 | Preserve fixed allowance; review its meaning before splitting travel or substituting a tariff. |
| Water tanker 16 kL | 270 | Fixed hours + hours/km × lead | Keep fixed water operations; price travel once using reviewed WATER tariff or the source vehicle method. |
| Water tanker 12 kL | 300 | Fixed hours + hours/km × lead | Same; an 8 kL substitution requires revised productivity. |
| Water tanker 6 kL | 270 | Fixed hours + hours/km × lead | Same; an exact 6 kL SOR hourly item is available. |

The 978 tonne-km rows all have zero constant terms. All 840 distance-dependent tanker rows have positive fixed terms. The six structural-trailer rows also have fixed terms. All 1,824 distance parameters are explicitly in km. No affine expression was missing a numeric coefficient or constant.

The six other null quantities must stay as DATA design/production inputs:

- Item 3.27, large/medium/small: hard_rock_volume_cum_per_metre, a hard-rock excavation dependency volume.
- Item 5.13 C(i), large/medium/small: missing_recycled_bc_I_roller_hours, whose source quantity cells are blank.

A recursive scan also found 939 optional 8 kL replacement-hour expressions across 936 recipe records and four optional 5 hp pump-hour expressions across four records. These are explicit revised-productivity inputs, not automatically derived lead quantities. They are additional alternatives, not extra active rows to add to the 1,830 total. Their equipment-choice parameters must remain usable from the relevant row/Lead method editor.

## Transport already present with fixed quantities

Searching only for null quantities would miss existing included carriage. The same tipper transport keys occur with fixed tonne-km quantities in another 173 rows (18 cum: 57; 14 cum: 59; 10 cum: 57). Tunnel tipper transport has another nine fixed rows. Three recipes explicitly record fixed_haul_lead_km = 5. Fixed water-operation and loading/unloading rows are also present. A transport-word search is an audit aid, not a replacement rule: audit travel and delivered-material prices occur in these results too.

If a fixed included-haul component remains in DATA, extra Lead must deduct its included coverage according to that source. If the component is replaced completely, the replacement must cover the complete required haul. Removing an included 1 km component and then charging only beyond 1 km would underprice the work. Keeping it while adding the full haul would overprice it.

MoRTH item 1.04 has 14 standalone haulage analyses: surfaced, unsurfaced gravelled, katcha/river-bed track, hilly track and transit mixer cases. Their source records preserve loaded/empty speeds, payloads, onward/return times and a 10 km example basis; loading/unloading/stacking are explicitly excluded. These provide source evidence for the vehicle method, not an annual current price by themselves.

## Rates and compatibility checked

The common Lead chart already supports WATER. SOR Part 1 Table 9 matrix 2 column 5 is water carriage per cum/1000 litres, excluding loading, unloading and idle hire. Its up-to-5-km tariff quoted successfully at 70.30 in 2025-26 and 75.50 in 2026-27, zone 3. These are published tariff quotes, not final payable MoRTH rates.

Other zone-3 probes, all with status priced:

| Price source | Unit | 2025-26 | 2026-27 |
| --- | --- | ---: | ---: |
| Earth/sand common conveyance, up to 5 km | cum | 119.70 | 128.60 |
| Stone/aggregate common conveyance, up to 5 km | cum | 119.70 | 128.60 |
| Cement/steel common conveyance, up to 5 km | tonne | 74.80 | 80.30 |
| Tipper 5 cum | hour | 1,317.10 | 1,414.40 |
| Water tanker 6 kL, Part 2 | hour | 769.00 | 790.00 |
| Transit mixer, Part 2, capacity unspecified | hour | 2,779.50 | 2,992.10 |

The database preserves 2019-20 Delhi benchmarks for tipper tonne-km rates and 12/16 kL tanker hourly rates. For example, 14 cum surfaced-road tipper transport is 6.68/tonne-km; 12 kL tanker hire is 1,270/hour. They are historical starting benchmarks, not current Telangana SOR tariffs. Four affected non-roller source resources have no direct pricing_records: concrete tonne-km, structural trailer hours, trailer tonne-km and tunnel tipper tonne-km. The roller resource also has no stored price.

Stored derived_sor_candidates propose a 5 cum tipper and 2 cum/unspecified-capacity transit mixers. Their own use_conditions require actual payload, rated volume, density where relevant, road case, speeds and haul-only delays. The records explicitly reject automatic capacity equivalence. Medium/first selection remains suitable for compatible rate choices; it must not silently approve a different vehicle or transport method.

SOR volume tariffs cannot simply replace a tonne-km price. For steel, source tonnes may match a per-tonne tariff. For aggregates/earth, use the exact transported volume or an approved source-specific density. For hot mix/concrete and special trailers, a generic material class does not establish equipment or transport equivalence. Mixed-cargo rows may require separate material quantities/tariff classes rather than one guessed class for the entire load.

## Concrete/water example: item 14.01 B(i), medium

The 120 cum slab analysis contains 300 × concrete_plant_haul_lead_km tonne-km. At a 5 km one-way lead this is 1,500 tonne-km. Keep this mass/route basis in the transport definition; obtain its compatible unit price through the chosen transport method. Appendix 21.07 provides concrete production direct cost and explicitly excludes plant-to-site carriage. Its production cost and the parent's 2.6-hour unloading/pumping rows must not disappear when carriage moves to Lead.

The same analysis has tanker hours = 3.5 + 0.583 × water_supply_lead_km. At 5 km this is 6.415 hours: 3.5 fixed hours and 2.915 travel-dependent hours. A SOR WATER-tariff replacement must identify exactly which travel scope it replaces and retain any fixed operations not covered. The current source water policy marks the water purchase tariff as purchase_only; purchase, pumping/filling and delivery therefore need distinct scope checks, including Appendix 21.22.

## Current implementation gaps

- morth_picker_detail returns the source recipe; it does not generate Lead bindings.
- fetchMorthRecipe resolves resource prices and expands selected equipment alternatives, but does not emit transport-leg/Lead ownership metadata. Its distance inputs currently come from the generic MoRTH parameter bag.
- morth_resource_defaults exposes stored prices and ordinary SOR candidates, but not the derived vehicle-cycle definitions. individual_cost_choices intentionally excludes conveyance matrices/cells. The Individual Costs picker is therefore not a replacement for a Lead tariff selector.
- The renderer/native pricing path does not implement the stored haul_cycle candidate method or explicitly evaluate haul_road_case for a transport method.
- The MoRTH native calculator evaluates affine quantities and includes their costs in direct section totals before source allowances/overheads/profit. The existing common Lead applications are generally added after the base DATA rate in dashboardSync. Appending the same amount there would change MoRTH percentage bases or duplicate transport.
- Current ordinary rate selection can offer an approximate smaller vehicle as a review-labelled starting price. A label alone does not revise its operating hours or enforce the stored substitution conditions.
- Generic Lead preview quantity fallbacks can use one unit when an exact conversion is unavailable. Automated MoRTH bindings must require exact quantities and must not adopt these preview fallbacks.

## Proposed backend contract

1. Add a versioned morth_lead_binding relation keyed by recipe code, stable source component ID/path, option ID and leg role. Preserve the source JSON and keep SSR/SOR policies separate. Bindings record cargo, route endpoints, source quantities, mass/volume basis, included lead, handling coverage, fixed/travel split and replacement scope. Give each component an explicit stable ID rather than relying on array positions or description matching.
2. Keep pricing method separate from cargo. Method is sor_conveyance, vehicle_cycle or project_quote; a SOR conveyance class/rule is required only for the first method. Reuse existing SOR tariff coordinates and annual quote functions. Do not create fake SOR material identities or copy the full SOR rule catalogue into MoRTH.
3. Add a bounded read-only batch resolver for project-used MoRTH bindings. Return validated source definitions, requested/resolved annual recipe IDs, year-row IDs, year/zone, unit/components, rate scope, source hash, method requirements, compatibility status and missing inputs. Index recipe/component lookups and referenced tariff IDs. Fetch once per unique source/method/year/zone; route distance calculations then run locally in the native engine.
4. Store route selections per project item usage/dependency instance and leg, not as a global rate override. Quarry-to-plant and plant-to-site are separate legs. A shared resource price can update all matching MoRTH usages; one project's route distance must not overwrite unrelated usages. Share appendix calculations only when effective route and costing configurations also agree.
5. Make the native engine the single calculation authority. Validate nonnegative distances, positive payload/speeds, compatible units, rated capacity, explicit density, required road cases and substitution conditions. Use structured expressions, not executable formula strings. For a vehicle cycle, calculate travel hours/cost directly; at zero lead, avoid division by lead. Loading/return/idle scope and fractional/whole-trip rules need source evidence.
6. Track replacement contributions in a cost ledger: source component, superseding binding, route leg, method, accounting stage and markup treatment. A MoRTH source-transport replacement normally enters its original direct-cost stage so source percentage bases remain correct. Prevent that contribution being added again as a post-rate Lead surcharge. Reject overlapping original and replacement travel/handling coverage.
7. Record whether an incoming tariff already includes overhead/profit. The existing common-chart 1.13615 normalization applies only to its documented tariff scope; do not apply it to every MoRTH equipment rate or quotation. Do not feed the fully marked-up item-1.04 rate into a parent that then adds markup again. Trace net direct contributions, source allowances, overhead and profit separately.
8. Version and invalidate results on year/zone, annual revision, source/binding version, rate override, route, method, capacity, density and percentage changes. Reuse forward/backward recipe identity resolution only to locate a compatible selected-year annual rate; never relabel a historical benchmark as the requested year's rate. Missing current rates remain pending, or use an explicitly recorded project-approved quote/benchmark mode. Manual rates carry unit, scope, year/zone applicability and evidence.
9. Enforce one active method per source transport leg, foreign keys to source identities, expression-schema checks and reviewed replacement coverage before a mapping can become automatic. Apply existing catalogue/project access boundaries to new relations/RPCs. Preserve evidence and an explicit rollback to the source method.
10. Return readiness separately for base operations, transport and final cost. Moving pending transport to Lead must not turn an incomplete item into a final cost-ready item. UI, project totals, Typst and Excel must consume the same result/ledger. Export can show one linked Lead entry in the analysis and a separate transport breakdown, with no duplicated appendix or cost.

## Rollout and acceptance checks

First implement bindings and strict native methods for the concrete 14.01 example, 6/12/16 kL water rows, ordinary earth/aggregate tippers, structural trailers and tunnel disposal. Generate mapping proposals for all 1,824 distance rows and the fixed-haul rows; promote only those with reviewed physical quantities and coverage. Do not mass-delete or replace catalogue rows by text matching.

The migration must demonstrate source-method parity before enabling replacements: all known costs preserved at the same inputs; zero lead preserves fixed tanker/trailer operations; every superseded amount appears once; nested appendices propagate transport and missing inputs correctly; delivery-to-plant and delivery-to-site remain distinct; no implicit mass/volume or capacity conversion; wrong year/zone and missing prices are rejected; route variants remain separate; percentages are applied once at their proper stage. Browser, native, Typst and Excel results must agree. Existing SSR/SOR common/pipe Lead regressions must remain unchanged.

## Evidence

- docs/morth-lead-audit-2026-10-24.json: all twelve main resource groups, including the two non-Lead input groups.
- output/morth-lead-audit/affected-resources.csv: all 1,830 occurrences, exact recipe/category, formula, source resource and recommended handling.
- output/morth-lead-audit/distance-and-other-quantity-rows.json: source formula/quantity/price-reference capture.
- output/morth-lead-audit/resource-pricing.json: stored benchmarks and conditional vehicle-analysis candidates.
- output/morth-lead-audit/catalogue-and-backend-evidence.json: counts, fixed transport findings, item 1.04 definitions, annual quote probes and inspected RPC definitions.

External source cross-check: MoRTH Standard Data Book 2019 Volume I, Basic Input Parameter, explicitly distinguishes source-to-plant and plant-to-site leads and specifies one-way km: https://law.resource.org/pub/in/bis/irc/mort.sdb.01.2019.pdf . The audit uses the live source-recorded definitions for per-item transport and exclusions; it does not treat a generic haulage example as an approved project substitution.
