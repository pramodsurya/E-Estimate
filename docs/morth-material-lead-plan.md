# MoRTH material Lead using the existing SSR workflow

User direction checked against the application on 24 October 2026: use material Lead, as SSR does. MoRTH DATA should contain production/construction resources; dedicated carriage resources should be replaced by the existing material Lead workflow. This document supersedes the vehicle-method implementation proposal in morth-lead-integration-plan.md. The previous catalogue audit remains evidence, not the requested UI design. No application or database changes were made by this design check.

## Existing SSR behavior verified

- leadApplicability.ts builds material references from explicit applicability metadata and resolves quantities from DATA resources and selected add-ons. Sand remains a distinct material name even though its tariff class is EARTH.
- EstimateLeadPanel.tsx groups those references by material and conveyance class. Its source filter currently admits SSR, SOR and PROJECT_DATA, and excludes MORTH.
- Lead variants/applications hold the standard material selections, source/route, distance, quantity, annual tariff and applied amount.
- RateAnalysisTable.tsx / dashboardSync.ts add applied Lead amounts to the base DATA amount/rate. The SSR calculation sequence is base analysis including its percentages, followed by applied Lead, followed by the final adopted rate.
- MoRTH does not currently publish equivalent material Lead metadata. Its carriage costs are still machinery quantities evaluated inside direct DATA cost.

## Requested behavior

The user sees Sand, Aggregate, Cement, Steel, Water and other reviewed material Lead groups using the same controls and map as SSR. No separate MoRTH equipment/cycle selection is introduced into that user workflow. A material's basic rate remains in Individual Costs. Its conveyance is managed in Lead. A SOR price link does not change the MoRTH resource's identity or merge its rate overrides into SSR.

| Source resource | Active MoRTH DATA treatment | Lead treatment |
| --- | --- | --- |
| Sand / aggregate / cement / steel | Keep material quantity and supply rate | Attach the existing applicable material tariff |
| Dedicated tipper/transit/trailer carriage | Exclude the replaced carriage contribution from the active recipe and Individual Costs | Bind to the transported material and its exact physical quantity |
| Water tanker row combining fixed work and a distance term | Keep verified non-carriage watering/filling/site operations; separate the carriage contribution | WATER Lead for the delivery scope it replaces |
| Trailer row combining fixed hours and a distance term | Review and preserve necessary non-carriage operations | Appropriate steel/precast/special-material Lead; valid tariff or explicit standard Lead rate |
| Pumping, placing, spreading, compaction and ordinary production machinery | Keep when required by the work | Do not classify as carriage merely because the machine can move |
| Loading/unloading/handling | Keep only the operations not already covered by the selected Lead | Apply handling once using the existing Lead controls |
| Hard-rock volume / missing roller hours | Keep as DATA inputs | These are not Lead quantities |

Removing the original catalogue evidence is unnecessary. Exclusion must happen in the active calculation model before quantity/rate validation and cost aggregation, not just by hiding rows in the UI. The excluded rows must also disappear from project Individual Costs and from active Typst/Excel analyses. Source evidence remains available for audit.

## Appendix ingredients and quantity scaling

MoRTH appendix resources must contribute actual physical quantities to their parent's material Lead inventory. For each dependency edge, multiply by parent dependency quantity / child output quantity, carrying that scale through every nested appendix. Keep signed quantities/credits and explicit unit factors consistent with native calculation.

Verified local fixture, backed by the previously audited live definitions:

- Parent item 14.01 B(i), medium: output 120 cum and concrete appendix usage 120 cum.
- Appendix 21.07: output 360 cum, sand quantity 162 cum.
- Parent sand requirement: 162 × 120 / 360 = 54 cum.

Show Sand once with all contributing project usages, and use 54 cum per this parent analysis basis. Project estimate quantities then scale that analysis basis in the existing application path. Never multiply by project quantity twice.

A shared appendix definition may be reused, but each physical usage contributes its own scaled material quantity. Deduplicate catalogue definitions/rate groups, not consumption. Do not sum the same leaf material again from both an expanded parent inventory and its separately enumerated appendix. Distinct material sources or destinations can retain separate standard Lead variants.

## What can be removed from the current transport inventory

The completed catalogue audit found 978 distance-dependent tonne-km occurrences, 840 water-tanker occurrences combining fixed and distance-based hours, and six structural-trailer occurrences combining fixed and distance-based hours. There are also fixed included-carriage rows which a null-quantity search does not catch. The 1,824 distance-dependent occurrences represent ten resource keys, not 1,824 distinct individual materials.

Dedicated carriage is eligible for exclusion only together with an explicit material replacement binding. A combined row needs a reviewed split before exclusion. The six other missing quantities (hard-rock dependency volume and recycled-pavement roller hours) remain untouched DATA inputs.

Fresh concrete, hot mix, precast girders and tunnel disposal require correct material-specific Lead coverage. Sand/aggregate Lead does not automatically cover delivery of a processed product from a plant, and a general STEEL tariff does not establish special girder transport suitability. Keep these as material-based Lead entries, using a validated tariff or the existing explicit manual Lead rate option. An unavailable mapping stays visibly unresolved rather than silently free.

## Backend implementation contract

1. Record the project costing basis as a versioned material-Lead model. This deliberately adopts SSR-style Lead placement for MoRTH: base DATA including source percentages, then Lead. It can change totals compared with the original MoRTH analysis where carriage sat inside percentage bases. Do not retain that embedded contribution and add Lead again.
2. Add reviewed mappings from stable MoRTH source component IDs to material identities/classes, physical quantity derivations, included scope and the source carriage contribution being replaced. Keep source edition/category/variant evidence. Avoid description-only removal rules and positional array IDs as permanent identities.
3. Build a recursive material inventory from active selected project DATA/appendices, using the dependency scaling above. Preserve concrete leaf identity, source owner and usage paths. Do not flatten supply/delivery scopes into one undifferentiated material price.
4. Generate leadApplicability compatible with the SSR material contract and extend the Lead source filter to MORTH. Use a dedicated strict quantity resolver for the derived inventory; do not reuse preview fallbacks that invent one unit when an exact material quantity or conversion is missing.
5. Reuse existing SOR annual conveyance quotation and standard Lead applications. Preserve requested/resolved recipe IDs, annual row, year/zone, unit, source and admissible handling. SOR rates provide prices; MoRTH's replacement metadata determines which scope is eligible. Do not import unrelated SOR supply-item policies into MoRTH or SSR.
6. Remove replaced carriage from native MoRTH base calculation, not only renderer rows. Preserve required fixed operations. Reprice percentages on the selected active base and apply Lead through the existing SSR-style final-rate path exactly once. Record replacement ownership so dashboard, native results, Typst and Excel agree on the same final rate.
7. Material rate changes can remain shared within the MoRTH source group. Lead distance/source and applications stay scoped to project usages/variants; they must not become global individual-resource quantity overrides. Changing year, zone, material quantity, dependency configuration, material price, percentage, mapping version or Lead application invalidates the affected result.
8. Base readiness and Lead completeness must be distinct. After transport is removed, the base DATA can be calculable, but required replacement Lead must remain pending until an application, justified no-extra-Lead scope or explicit approved rate is recorded. Missing transport must not become a final zero amount accidentally.

## Acceptance examples

- The slab shows Sand with 54 cum per parent analysis basis, and the associated aggregate/cement ingredients with their correctly scaled quantities.
- Adding a second slab usage increases consumption; it does not create duplicated material cards or lose the second usage because the appendix is shared.
- A pure carriage row is absent from active machinery and Individual Costs; its material Lead is applied once.
- Water's verified fixed operations remain costed when distance is zero. Removing tanker carriage does not remove pumping/application work.
- Loading/unloading, delivered material prices and included fixed carriage never overlap with additional Lead for the same scope.
- Concrete/hot-mix/precast delivery and disposal are not lost by replacing every carriage row with raw-material Lead.
- The existing SSR/SOR behavior remains unchanged, and MoRTH UI, abstract, project rates, Typst and Excel use the same final total.

Evidence: morth-lead-audit-2026-10-24.json and output/morth-lead-audit contain the complete occurrence inventory, annual quote probes, fixed-carriage findings and backend function definitions from the preceding audit.
