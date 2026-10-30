# MoRTH starting factors and fuel accounting

Implemented and deployed to Supabase on 25 October 2026. This supersedes the tanker starting-price findings in the earlier read-only audit.

## Backend and frontend

The two 12 kL tanker aliases and two 16 kL aliases in analysis_resource now have an explicit starting_rate_basis. The source identity, historical records and published SOR rates are preserved. The basis references SOR-P01-T08-R0064 (8,000-litre tanker), using the selected project year and zone at quote time.

The provisional policy scales hourly hire and fuel by capacity, and retains the SOR crew cost once. This is a user-requested starting estimate, not a published SOR equivalence or a verified consumption curve. It does not multiply operating hours as well.

| Equipment | Hire factor | Fuel factor | Crew factor | Starting total/hour, 2026–27 Zone 3 |
|---|---:|---:|---:|---:|
| 8 kL SOR reference | 1 | 1 | 1 | ₹1,328.70 |
| 12 kL | 1.5 | 1.5 | 1 | ₹1,846.30 |
| 16 kL | 2 | 2 | 1 | ₹2,363.90 |

For 12 kL: ₹743.40 hire + ₹809.40 fuel + ₹293.50 crew = ₹1,846.30/hour. Multiplying the entire inclusive 8 kL total by 1.5 would also scale crew, which this policy deliberately avoids.

morth_resource_starting_quote returns the calculated components, factors, year/zone and inclusion flags. It returns no price for a missing reference year, incompatible unit, unavailable component or unconfigured resource. Published SOR tariffs remain unchanged; the exact 6 kL rate remains ₹790/hour for 2026–27 Zone 3.

morth_resource_defaults exposes the stored basis. The frontend resolver prioritises it over historical benchmarks for the default starting price. Manual rates and explicit SOR adoptions retain precedence. The label identifies the reference, factors, year and provisional status. The RPC uses SECURITY INVOKER with a fixed search path and existing read permissions.

## Other items checked

The factor review covers the prior full inventory of 3,345 MoRTH analysis records and all 24,316 base ingredient occurrences. The per-route decisions are in output/morth-pricing-audit/factor-decisions.csv; the live tanker verification and decision counts are in starting-factor-verification.json in the same folder.

- 390 occurrences already use ordinary compatible-unit price factors, including tonne/kg conversions.
- 48 occurrences have a stored three-metre pipe supply basis.
- 9 occurrences require an entered density for mass/volume conversion; the rule exists, but a universal numeric factor does not.
- 12 reinforcement dependency occurrences have an explicit 0.001 basis factor, now applied by the native calculator.
- 3 occurrences use an existing 83% analysis adjustment.
- The new tanker bases cover 587 machinery occurrences through the four source aliases.
- Direct 6 kL SOR machinery bindings need no capacity factor. An explicitly selected 8 kL equipment substitution uses its own revised hours and the actual 8 kL tariff; it does not also inherit the 12/16 kL cost factor.

Other historical or candidate-only prices still require specification, annual-rate or cost-scope review. A 135 mm pipe matched to a 100 mm candidate does not establish a price factor. Likewise, a 240 cum batching plant with a 30 cum candidate does not justify multiplying its hourly price by eight: plant technology, crew and power inclusions need checking. Compressor CFM/CMM differences are capacity-unit questions, not automatic hourly price multipliers. No arbitrary diameter, horsepower or machinery-capacity factors were added for these cases.

## Fuel logic

1. Identify the exact machine and rate basis from its stored pricing binding.
2. If the adopted total includes fuel, charge the total once. A displayed fuel breakdown is already part of that amount.
3. If the method explicitly uses hire-only pricing, obtain fuel_charge from the same machine's SOR identity for the same year/zone and use the same operating hours. Crew is a separate component only when it is not already included elsewhere.
4. Apply costs in the analysis that operates the machine: production equipment in its appendix, placing/site equipment in the parent. Existing dependency calculations carry the appendix cost into the parent.
5. Never combine an inclusive total with its split hire/fuel/crew rows. The same operators, separately priced diesel or generator energy must be checked against inclusions; descriptions alone do not prove duplication.
6. If fuel is excluded and no matching SOR component exists, a scoped quote or documented fuel-consumption calculation is needed. Do not copy a generic per-hour fuel rate from another machine.

The new tanker totals already include fuel and crew. They therefore need no extra fuel surcharge. The starting factor does not establish a haulage Lead price or change the existing separation of carriage and fixed operations.

## Verification

- Live SQL assertions cover both aliases, both years, all three zones, component totals, unchanged crew, inclusion flags, missing years, incompatible units and unchanged 8/6 kL SOR rates.
- The public anonymous API and actual frontend resolver return both new defaults. A real slab recipe calculated through the native engine uses ₹1,846.30 × 3.5 hours = ₹6,462.05 for the 12 kL tanker.
- Unit regressions cover manual/SOR precedence, missing-year behaviour and separate unit/capacity factors. Individual Costs/project-scoping tests, web type checking and targeted ESLint pass.
- Supabase security and performance advisors show no new findings compared with the pre-migration baseline.

Migration: supabase/migrations/20261025014928_morth_starting_capacity_factors.sql. Read-only regression: supabase/tests/morth_starting_capacity_factors.sql. Run npm run audit:morth-starting-factors to verify the public frontend path and regenerate the factor decisions.
