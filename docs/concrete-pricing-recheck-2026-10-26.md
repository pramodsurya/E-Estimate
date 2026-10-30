# Concrete starting-price recheck — 26 October 2026

Read-only recheck of live 2026–27 Zone 3 sources through the real frontend resolver and native calculator. No production prices or database mappings were changed. The earlier explanation focused too heavily on shuttering and did not clearly distinguish bare machinery hire from inclusive operating rates.

## Findings

- CCDW 5-4 remains Rs 8,738.10/cum; MoRTH 14.01-B-i-p-medium remains Rs 6,104.97/cum before unresolved project material/delivery Lead. Their scope, productivity and markup rules differ.
- CCDW's separate Fuel/Energy rows are correct. Its machine rows adopt `hire_charge`, not an inclusive total. Machine crews are under labour. The three components sum once to the current SOR operating total.
- Within matched work families, the checked grade prices increase normally. The dam example must use dam-work analyses, not a coping-slab M15 price as a universal grade tariff.
- Formwork is not the only major difference. CCDW also has much greater separate site labour for manual batching, handling and conveying. MoRTH machinery/mix-plant crew costs may be embedded in machinery prices rather than the separate labour rows.
- Numeric readiness is not equipment-equivalence or fuel-scope validation. MoRTH's old transit-mixer benchmark and several candidate mappings still fall short of a fully verified current-year starting price.

## Grade comparison within each family

All figures below are rates in rupees per cum, before additional project allowances/Lead, subject to each source's included scope. Compare grades within a family; the rows are not interchangeable work descriptions.

| Family | M10 | M15 | M20 | M25 | M30 |
| --- | ---: | ---: | ---: | ---: | ---: |
| DAW plain mass concrete, 80 mm aggregate | 4,121.60 | 4,303.30 | 4,593.30 | — | — |
| CCDW substructure/superstructure concrete, 20 mm aggregate | 6,421.80 | 7,001.70 | 7,303.90 | — | — |
| MoRTH RCC solid slab, same plant/transit-mixer/pump method, up to 5 m | — | — | 5,546.37 | 6,104.97 | 6,184.76 |
| MoRTH PCC production appendix only, before installation/formwork/parent markup | — | 2,942.65 | 3,296.16 | 3,583.75 | — |

DAW codes: `IRR-DAW-2-5` M10, `IRR-DAW-2-3` M15, `IRR-DAW-2-4` M20. CCDW codes: `IRR-CCDW-2-12` M10, `2-11` M15, `2-10` M20. MoRTH slab codes: `MORTH-2019-14.01-A/B/C-i-p-medium`. PCC production appendices: `21.03`, `21.04`, `21.06`, medium project. The PCC appendix rates are production costs, not complete installed concrete prices.

## Fuel/crew accounting: no duplicate in CCDW 5-4

| Machine | SOR code | Hire/hour | Fuel/hour | Crew/hour | Inclusive total/hour | Hours |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Concrete mixer 300/200 litre diesel | SOR-P01-T08-R0016 | 67.20 | 142.80 | 375.70 | 585.70 | 8.00 |
| 5-hp diesel pump | SOR-P01-T08-R0026 | 10.70 | 142.80 | 187.20 | 340.70 | 0.50 |
| 8,000-litre tanker | SOR-P01-T08-R0064 | 495.60 | 539.60 | 293.50 | 1,328.70 | 1.00 |

Live `sor_resource_quote` confirms all components above. CCDW machinery hire plus fuel totals Rs 2,791.95; its machine crews total Rs 3,392.70 under labour. Their sum Rs 6,184.65 equals `8 × 585.70 + 0.5 × 340.70 + 1 × 1328.70`, exactly once.

Fuel alone is Rs 1,753.40 for 14.67 cum: Rs 119.52/cum before markup. It cannot explain the Rs 2,633.13/cum difference between the complete coping analysis and the current MoRTH starting analysis.

## Full cost decomposition, including MoRTH appendices

The MoRTH concrete and water dependencies were expanded to their physical leaf inputs, scaled once to one cum of parent output. CCDW machine crews were moved into its equipment column solely for comparison; the source recipe was not edited.

| Approximate Rs/cum | CCDW M15 coping | MoRTH M25 slab |
| --- | ---: | ---: |
| Physical materials excluding formwork | 2,904.93 | 3,528.68 |
| Equipment at adopted prices; CCDW crew included here | 421.58 | 289.29 |
| Other separately charged site labour, excluding shuttering and machine crews | 1,563.77 | 36.18 |
| Shuttering/formwork/staging | 2,800.73 | 770.83 |
| Source overhead/profit | 1,047.13 | 1,479.99 |

Published quantity/amount precision and rounding cause small differences when summing rounded displayed values. MoRTH equipment values retain their currently adopted scope, including the fuel-scope uncertainties below; they are not all certified inclusive operating quotes.

The higher-grade M25 physical materials cost more, approximately Rs 623.75/cum extra. CCDW's extra formwork and separately charged manual site labour more than offset that difference. CCDW explicitly charges conveying concrete at 14.67 labour-days for 14.67 cum, Rs 635/cum, in addition to batching/loading/placing labour. MoRTH relies on bulk plant production and pump placement. Its source machinery usage charges include operating crew where the adopted rate is an inclusive usage rate.

## Weak MoRTH starting-price bases

| Input | Current rate/hour | Remaining issue |
| --- | ---: | --- |
| Transit mixer/agitator 6 cum | 2,299.00 | Exact equipment benchmark is from 2019, not a verified 2026–27 operating quote. Original MoRTH machinery policy includes fuel/crew; that does not make the old amount current. Do not blindly substitute a 2-cum mixer or multiply its entire price by 3. |
| Hydraulic boom placer | 1,029.00 | Mapped to a generic 30/45-cum concrete-pump candidate. Boom configuration/duty equivalence is unproven; no separate fuel breakdown. |
| Batching plant 120 cum/hour | 4,120.00 | Candidate describes 120-cum capacity; output/hour and drive/energy boundary require confirmation. The separately listed generator must not overlap any energy already included in the adopted plant quote. |
| Loader 3.1 cum | 2,056.00 | Generic front-end-loader candidate does not establish exact bucket size/duty and operating cost scope. |
| Generator 250 KVA | 2,410.00 | Capacity matches the schedule entry, but the annual quote has no fuel-component breakdown. Confirm diesel/energy inclusion; avoid duplicate plant-energy charges. |
| Water pump 600 litres/min | 340.70 | Adopted 5-hp diesel price includes hire/fuel/crew, but that horsepower alone does not prove required flow/head. |
| Tanker 12 KL | 1,846.30 | Includes fuel and crew. Current price is an explicit provisional factor from 8 KL: hire/fuel ×1.5, crew ×1; not a published exact-capacity tariff. |

Source evidence: the local MoRTH 2019 general conditions, printed page 4 section 6.5; SOR 2026–27 machinery schedule and R&B machinery note, printed pages 63–64; live resource defaults/annual quotes; and the actual resolver's price-source labels. The R&B note includes crew, oils/lubricants, machinery conveyance and incidental charges but does not explicitly resolve a separate diesel component. A null breakdown is not proof that fuel is either free, excluded or included.

Even doubling every currently adopted MoRTH machinery cost would add only about Rs 458/cum after this parent's formwork/OH/profit multipliers. Missing/unverified machinery fuel must be resolved, but cannot be assumed to explain the entire cross-family rate difference.

## Required pricing behaviour

Keep construction method, member geometry, formwork and inclusion/markup rules fixed when comparing or changing concrete grade. A dam estimate should use the relevant dam work family and a suitable grade/mix; adopting a whole bridge or coping analysis changes much more than cement content.

For a credible current starting price, retain exact machine capacity/duty and operating hours; use a current inclusive operating quote or an explicit hire + machine-specific fuel/energy + crew build-up. Refresh old-year benchmarks with a documented current basis. Separate plant electricity/generator energy clearly. Apply grade/material changes and source-prescribed percentages once. Keep additional delivery/Lead visible and distinguish production cost from a completed installed rate.

Do not add a blanket fuel surcharge or force every M25 item above every M15 item. The necessary correction is consistent scope plus verified current operating costs, with uncertain mappings stated honestly. An original inclusive benchmark proves its accounting scope, not current-year price adequacy.

Reproduce: `node scripts/audit-concrete-rates.cjs --grades`. Results: `output/concrete-rate-audit/comparison.json` and `grade-check.json`. Live grade ordering and the CCDW split/inclusive equipment reconciliation both passed. Native numeric readiness in this report does not certify machine equivalence or resolve project material Lead.
