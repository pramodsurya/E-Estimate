# MoRTH fuel and conversion audit — 25 October 2026

This is the earlier audit snapshot. The subsequent backend tanker factors and current starting prices are documented in [MoRTH starting factors and fuel accounting](morth-starting-capacity-factors.md).

Read-only audit of all 3345 stored MoRTH analysis records, including all project-size variants, base rows, equipment alternatives and pricing additions. Prices were checked for 2026–27, Zone 3 using the actual application resolver. This verifies pricing routes and arithmetic, not physical equivalence of every suggested machine or material.

## Coverage and findings

- 24,316 base ingredient occurrences; 8,128 machinery occurrences across 342 resource keys.
- 4911 distinct pricing input combinations, including conditional alternatives; 3979 resolve to a number and 288 lack a default number. Appendix dependencies and quotation-only inputs are recorded separately.
- 218 priced combinations use a historical benchmark; 318 use review-labelled starting SOR candidates. These counts are not approvals of technical equivalence or current-year market prices.
- 862 explicit SOR fuel combinations were checked; 0 select a component other than fuel after the correction.
- 786 input combinations have a changed default price relative to the pre-fix audit. Repeated occurrences and alternatives are aggregated, so this is not a count of physical products.
- Stored special conversion rules cover 48 fixed supply-length occurrences, 9 density-dependent occurrences, and 12 dependency quantity-basis occurrences.

## How fuel is identified

The explicit machinery price binding supplies its SOR recipe code and component. A fuel row quotes that same machine's fuel_charge for the project year/zone and uses the selected option's operating hours. It does not select a generic diesel rate by matching the description. Crew uses crew_charge under labour when the selected equipment method explicitly separates it. The split method must replace the inclusive total, rather than add to it.

Existing explicit split alternatives cover 6/12/16 kL tanker substitutions and centrifugal/dewatering pump options. Other machines may use a complete SOR tariff, an inclusive historical benchmark, or a review-labelled candidate. Their fuel/crew inclusions and separately listed operators, diesel and generators still need source review before restructuring the analysis. No global automatic fuel surcharge was added.

## Corrections in application source

1. An explicit SOR code/component takes precedence over inherited source identities and nearby candidates. Component choices retain their hire/fuel/crew basis.
2. Quotation-only inputs stay unpriced until a rate is adopted; no silent SOR substitute is used.
3. Legacy machinery hire_total and sor_year fields are recognised. An exact historical benchmark is labelled with its actual year, rather than replaced by a nearby current SOR machine.
4. Normal unit factors returned by sor_resource_quote are already applied and are not multiplied twice. Conversion factors now appear in the rate-source label.
5. Stored 3-metre PVC supply rules divide the per-item quote by three; an explicitly selected pressure-class case is respected.
6. Density conversions use the analysis's positive entered density. No density is invented. Individual Costs previews retain that basis.
7. The native dependency calculator applies the stored quantity_multiplier once. The twelve affected reinforcement occurrences convert a tonne-based analysis to the parent's kg rate. Existing rate_multiplier handling remains separate.

## Representative starting prices after correction

| Source resource | Unit | Starting rate | Source/basis |
|---|---|---:|---|
| Water tanker 12 KL | hour | 1270 | Stored starting benchmark · 2019-20 · review required |
| Sand for CM1:1 repair grout, kg charging basis | kg | Requires input | Enter bulk density (kg/cum) to convert the SOR rate |
| Fly ash for PQC, approved specification | tonne | Requires input | Enter bulk density (kg/cum) to convert the SOR rate |
| PVC pipe for horizontal drainage, nominal bore 90 mm | metre | 166 | 90 mm dia 3 M single Socket PVC/SWR pipe - 4 Kg/sq.cm · ×0.3333333333333333 (Each → metre) |
| PVC pipe for horizontal drainage, nominal bore 110 mm | metre | 198 | 110 mm dia 3 M Single Socket PVC/SWR pipe - 4 Kg/sq.cm · ×0.3333333333333333 (Each → metre) |
| PVC pipe for horizontal drainage, nominal bore 135 mm | metre | 213 | PVC pipe of 100 mm dia · starting SOR choice · review required |

For the 12 kL tanker, the stored exact-equipment benchmark is ₹1,270/hour from 2019–20 Delhi. It is not a verified 2026–27 Telangana rate. The previous ₹1,328.70/hour default was the unscaled 8 kL SOR candidate. No approved 1.5 capacity factor was found for this resource.

## Data and remaining review

The full route inventory is output/morth-pricing-audit/all-price-routes.csv. Before/after snapshots, source records and summary.json are in the same directory. Rerun npm run audit:morth-pricing; --refresh reloads source records, --reprice reuses recorded choices while obtaining live annual quotes, and --report-only regenerates the review files.

No Supabase records, functions or schema were changed. Ordinary unit factors, SSR empirical basis multipliers and MoRTH's explicit supply/density/dependency rules already exist in Supabase. Machine capacity changes need an explicit justified equipment mapping or quotation; a difference in capacity does not establish a unit-conversion factor.

## Validation

The focused price-basis tests cover real recipe expansion into hire/fuel/crew rows, equal operating hours, summing components once, fixed supply lengths, selected pressure classes, explicit densities, historical inclusive rates, manual overrides and quotation boundaries. Existing Individual Costs/project-scoping tests and material Lead regression tests pass. Web type checking and targeted ESLint pass. Twelve native MoRTH calculator tests pass, including the new reinforcement conversion regression. Native tests were compiled directly against cached dependencies because the running development Cargo process held the package-cache lock. A packaged desktop build was not produced in this audit; the native conversion change requires rebuilding the desktop app.
