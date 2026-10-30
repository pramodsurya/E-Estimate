# Concrete rates, machinery fuel and labour allowance — 25 October 2026

The live Supabase recipes and the application's actual TypeScript resolver/native calculator reproduce CCDW 5-4 at **Rs 8,738.10/cum** and MoRTH 14.01-B-i-p at **Rs 6,104.97/cum** (2026–27, zone 3, medium project, no additional material Lead applied). These are different analyses; concrete grade alone does not determine their total prices. The MoRTH result remains a starting estimate with historical and approximate machinery prices requiring review.

## What explains the difference

CCDW 5-4 is M15 coping-slab work with detailed shuttering resources and manual handling. Its 14.67-cum analysis contains:

| Component | Total Rs | Rs/cum |
| --- | ---: | ---: |
| Materials, including shuttering use | 71,042.46 | 4,842.70 |
| Machinery hire and separately listed fuel | 2,791.95 | 190.32 |
| Labour, including machine crews and shuttering labour | 38,992.63 | 2,657.98 |
| Contractor profit and overheads | 15,361.40 | 1,047.13 |
| Adopted rate | | 8,738.10 |

The printed shuttering-use row shows 80.69 sqm at Rs 352.32, and shuttering/scaffolding labour shows 80.69 sqm at Rs 156.90. Their published amounts together cost approximately **Rs 2,800.73/cum before markup**. This comparison preserves the published amounts rather than multiplying their rounded displayed quantities again. Conveying concrete alone uses 14.67 labour-days, costing Rs 635/cum.

The MoRTH slab consumes Appendix 21.07 batching-plant concrete and Appendix 21.22 water. It includes a **20% combined formwork/staging allowance**, approximately **Rs 770.83/cum before markup**; formwork has not been omitted. It also applies 20% overheads and 10% profit on the prescribed bases. The appendix uses mechanized bulk production; appendix machinery/labour are embedded in the parent's concrete material rate, so parent labour totals alone cannot be compared to the CCDW labour section.

The MoRTH material section is approximately Rs 3,700.69/cum. CCDW materials after separating shuttering use are approximately Rs 2,904.93/cum. Thus M25 material cost is higher here, while the different formwork and production methods make its current overall starting estimate lower. This does not establish a universal M15/M25 rate ordering or validate unresolved machinery equivalences.

## Machinery review, including both appendices

| Machine and location | Adopted Rs/hour | Fuel/crew treatment and remaining review |
| --- | ---: | --- |
| Transit mixer/agitator 6 cum — slab unloading and Appendix 21.07 loading/unloading | 2,299.00 | Original MoRTH 2019 usage benchmark; general condition 6.5 includes crew, fuel and lubricants. Do not add them again. Obtain a current comparable 6-cum quote; a 2-cum rate is not equivalent. |
| Hydraulic boom placer — parent slab | 1,029.00 | Candidate SOR-P02-T04-R0034 is a 30/45-cum concrete pump. No `rate_detailed` fuel breakdown; capacity/duty and fuel inclusion need confirmation. |
| Water tanker 12 KL — fixed parent operations and Appendix 21.22 | 1,846.30 | Rs 743.40 hire + Rs 809.40 fuel + Rs 293.50 crew. Fuel and crew already included. Provisional 8-KL-based estimate: hire/fuel ×1.5, crew ×1. Do not multiply operating hours again. |
| Batching plant 120 cum/hour — Appendix 21.07 | 4,120.00 | Candidate SOR-P02-T04-R0061. Printed SOR says “120 cum capacity”; that does not establish 120 cum/hour output. No fuel breakdown; confirm production capacity, drive and charging scope. |
| Generator 250 KVA — Appendix 21.07 | 2,410.00 | SOR-P02-T04-R0050, no fuel breakdown. Confirm whether the adopted operating quote includes diesel and whether generator energy overlaps the plant quote. |
| Loader 3.1 cum — Appendix 21.07 | 2,056.00 | Generic front-end-loader candidate SOR-P02-T04-R0005. Capacity equivalence and fuel scope require confirmation; no automatic numeric capacity factor is justified. |
| Centrifugal pump 600 litres/min — Appendix 21.22 | 340.70 | Adopted 5-hp diesel candidate SOR-P01-T08-R0026 includes hire Rs 10.70 + fuel Rs 142.80 + crew Rs 187.20. Do not add fuel/crew again, but 5 hp alone does not prove the specified flow/head. |

The current SOR Roads & Bridges machinery general note explicitly includes crew, oils/lubricants and conveyance; it does not explicitly settle diesel inclusion. A null breakdown does not mean zero fuel or fuel exclusion. Do not invent a fuel consumption rate or copy a small pump's fuel charge to a larger machine. For a verified bare hire quote, fuel must use that machine's consumption × the adopted fuel price × its own operating hours, in the analysis/appendix where it works. Split components replace an inclusive charge rather than supplementing it.

Evidence: live `ssr_item`/`ssr_year`, `morth_picker_detail`, `morth_resource_defaults`, `sor_resource_quote`, the local MoRTH 2019 general conditions PDF (printed page 4, section 6.5), and local SOR 2026–27 machinery schedule (printed pages 63–64). This investigation made no further database price changes. Tanker backend factors were deployed in the earlier migration; this allowance fix is application-side.

## Labour allowance correction

With GHMC 40% allowance, CCDW 5-4 must adopt:

| Row | Correct Rs |
| --- | ---: |
| Original labour | 38,992.63 |
| Area allowance | 15,597.05 |
| Labour including allowance | 54,589.68 |
| Materials + machinery + adjusted labour | 1,28,424.09 |
| Profit/overheads at 13.615% | 17,484.94 |
| Total cost for 14.67 cum | 1,45,909.03 |
| Rate per cum | **9,946.08** |

Fixed the screen's direct-native-call path that could bypass rebuilding abstract rows, unlabelled published subtotals retaining old amounts, saved recalculation caches surviving allowance/year/zone changes, and published rates overriding recalculated project rates. The allowance percentage is now recorded with the recalculation cache. Older SSR snapshots require refresh. PDF labour detail totals remain before allowance, with a separate allowance audit block and no duplicate addition.

Verification: real CCDW source fixture through on/change/off allowance cases; saved edits and component amount adoption; native calculation; DATA presentation; Typst PDF compilation and visual inspection; native Excel/PDF export; browser toggles at 0%, 20% and 40% against the actual sheet and native calculator; existing rate-analysis, recipe-merge, project-abstract, component-allowance and project-wiring tests; renderer type check, targeted ESLint and production renderer build. No installer was rebuilt.

Reproduce with `npm run test:ssr-allowance` (native calculator must be built) and `npm run audit:concrete-rates` (read-only live source access). Audit outputs are under `output/concrete-rate-audit/` and are not committed.
