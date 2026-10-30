# Formwork source review — 25 October 2026

This is a read-only source review and design recommendation. No prices or source definitions were changed.

## Current sources

MoRTH `MORTH-2019-14.01-B-i-p-medium` does not get formwork from an SSR. Chapter 14, printed page 600 (chapter PDF page 6), explicitly applies combined formwork/staging at 20% of basic labour + materials + machinery for solid-slab superstructure up to 5 m height. This occurs in the parent site-work analysis, not the Appendix 21.07 batching-plant concrete mix. The existing extracted percentage is consistent with that printed rule.

CCDW `IRR-CCDW-5-4`, year 2026–27, separately stores shuttering-use material at Rs 352.32/sqm and shuttering/scaffolding labour at Rs 156.90/sqm. Both resource identities currently have null master/source-table links. They are annual SSR row rates, not proven live bindings to a standalone SOR formwork tariff. The coping-slab formwork quantities should not be copied to a different structure.

## Existing SOR options

Part III already contains a dedicated Centering & Scaffolding schedule. Local source: `C:/Users/napra/Claude/Projects/E-Estimate/2026-27/SOR 2026-27 final_merged.pdf`, printed pages 300–310 (PDF pages 345–355). It distinguishes supporting system, structural member, slab thickness, floor and unsupported height, and separates material hire from labour.

Examples in the 2026–27 Supabase catalogue, first-floor rates, unsupported height up to 3.66 m:

| SOR identity | Scope | Material hire | Labour | Total | Unit |
| --- | --- | ---: | ---: | ---: | --- |
| SOR-P03-T02-MA-R01-CI | Cuplock + plywood, slab up to 150 mm | 551 | 341 | 892 | sqm |
| SOR-P03-T02-MA-R01-CJ | Cuplock + plywood, slab >150–300 mm | 566 | 350 | 916 | sqm |
| SOR-P03-T02-MA-R01-CK | Cuplock + plywood, slab >300 mm | 592 | 366 | 958 | sqm |
| SOR-P03-T02-MB-R01-CI | Cuplock + MS plates, slab up to 150 mm | 492 | 341 | 833 | sqm |

These are scope examples, not approved substitutions for bridge falsework. The building schedule's 3.66 m unsupported-height limit does not cover every MoRTH case described as "up to 5 m". Its additional-height provision is 16.666% of the relevant basic material hire and labour for each 610 mm or part above 3.66 m, subject to the applicable schedule/departmental adoption.

`SOR-P02-T03-R0100`/`R0101` distinguish centering for spans >=3 m and <3 m. In the current backend these are nonnumeric MoRTH-analysis references explicitly marked `scope_review_required`; they must not link back to an entire slab concrete rate. That would mix complete-concrete costs with a centering component and could introduce a dependency cycle.

Standalone steel-plate/accessory SOR entries exist too, but they are not a complete erected formwork-and-staging service. A complete rate must account for use/hire basis, supports, labour and removal as applicable.

## Recommended model

1. Preserve the published MoRTH percentage as the default method for this MoRTH analysis.
2. Offer a deliberate project-specific detailed method, using an existing SOR centering/formwork item only after matching structural/system/height scope and departmental applicability.
3. Use a Formwork sub-analysis with source references and measured quantities when a breakdown is needed. Keep material hire and labour components separate so eligible labour allowance changes only labour. Parent overhead/profit must apply once; an SSR dependency's markup must not be charged twice.
4. Require the relevant measurement basis. For a sqm tariff, use measured formwork area; the cost per cum of concrete is area times formwork rate divided by concrete volume. The sqm/cum ratio comes from actual geometry, not a universal conversion factor or concrete grade. Respect a source tariff that is already per cum.
5. The detailed method replaces the corresponding 20% combined formwork/staging allowance; the two must not both charge for the same work. If only part of the scope is replaced, explicitly price the remaining support/staging scope.
6. Keep this cost at the consuming parent/site analysis. A helper Formwork appendix can hold the breakdown, but it must not inflate unrelated batching-plant concrete rates.

Do not create an official-looking SOR material that copies or mirrors an SSR shuttering price. Use the existing SOR identity directly, or a clearly identified derived/project analysis with a live SSR/SOR dependency. New numerical SOR rates are unnecessary for the entries above; implementation would need method selection, scope/quantity metadata and mutually exclusive calculation rules.
