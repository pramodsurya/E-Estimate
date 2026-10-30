# Catalogue distinctions and transit rate trace — 27 October 2026

The audit covered 1,221 MoRTH picker choices for each of the medium, large and small project settings, plus the SSR catalogue. It compared the visible title, first four non-redundant facts, unit and work context. Distinct source codes are preserved.

MoRTH had 16 groups sharing published wording (40 choices), including the already clarified 1.01 options. The remaining distinctions were payload in the 1.04 haulage analyses, operating-hour versus tonne-km basis for transit mixers, and chapter context for foundation concrete and drainage spouts. SSR had 33 groups (93 choices) whose simplified titles/facts concealed differences, including compaction targets, watering, material source, repair versus new work, tunnel supports, boulder size, line drilling, stone dressing/bond and fabric weight.

The descriptive guidance now exposes those published distinctions. Tunnel rock/adit items no longer say soil merely because the generic summary lacked the rock term. Rockfill casing is distinguished from soil casing. The 1.04-iii-C source equipment-caption inconsistency remains disclosed in Details; the stored 25-tonne interpretation is not presented as a new verified source fact.

Shared work published in different chapters remains separate. Search results show the chapter heading so Foundations and Pipe Culverts, or Super-structure and Box Cell Structure, are visible contexts. No technical recipes, rates, quantities or source descriptions were edited. Before/after hashes:

- MoRTH code/content-hash aggregate: ec5db908f1c9997033c108de3c5144c8.
- SSR code/description aggregate: 48930eb132d07142099627309e525787.

After the update, no same-context title/fact/unit collisions remained under the audit criterion in any project size. This checks presentation collisions, not engineering interchangeability or price suitability.

## Transit truck carriage shown in DATA 14.01

The native carriage row has no stored direct tonne-km price. Its derived starting price uses the hourly component `morth:transit_truck_agitator_6_cum`, source resource `MORTH_SRC_54D3FBDD6D7E38FA2AB3`. This is the same hourly truck component visible in the unloading row. Its stored price is ₹2,299/hour, a **2019 historical source benchmark** from Plant & Machinery serial 79, printed page 775 / original PDF page 795. It is not a current SOR quote.

The 6 cum transit truck model in MoRTH SDB 1.04(v) uses a 15 tonne payload, 20 km/h loaded and 30 km/h empty return:

`rate per tonne-km = 2299 × (1/20 + 1/30) ÷ 15 = 2299/180 = 12.772222…`

For the screenshot's 120 cum slab source basis:

`tonne-km = 300 × 108.861 = 32658.3`

`transport amount = 32658.3 × (2299/180) = ₹417119.07`

The displayed ₹12.77 is rounded for presentation; the amount uses the full derived precision. Unloading remains a separate 2.6 hours × ₹2,299 = ₹5,977.40. Return travel is already represented by the empty-return speed term. No SOR cement Lead price or additional fuel/crew charge is added to this carriage calculation. Updating the linked hourly component recalculates derived carriage unless a direct tonne-km rate was explicitly adopted.

The separate Plant & Machinery serial 128 (`MORTH-2019-20.128`, resource `MORTH_SRC_49A527A8D0D0B5DE8E8D`) also stores ₹12.77/tonne-km as a 2019–20 Delhi historical benchmark, printed page 777. That rounded published value agrees with the derived `2299/180` rate. The active DATA row uses the hourly companion derivation, so it follows an adopted hourly rate change; it is not currently linked directly to serial 128's rounded benchmark.
