# SOR selector redesign investigation

Status: implemented against the current SOR source on 23 October 2026. Full Add Item uses SSR-style “+” selection and template-only Lite opens Variants first; both share SorPicker. Archived selector routes and pricing adapters are retired. The inventory and design decisions below record the source investigation; the latest interaction and performance changes are recorded at the end.
Date: 23 October 2026 (Asia/Calcutta).
Scope: SOR first. MoRTH picker implementation is deferred.
Source: live Supabase project hqddsxnykndgcmxwqwmn. Source records were inspected without changing their values; selector views, functions, index and source-refresh triggers were added through migrations.

## User requirements

- Rebuild the shared selection experience from the bottom up.
- UnifiedCodePicker is the Lite shell; AddItemModal is the Full shell.
- Top level SOR categories are Parts 1–4, analogous to SSR's TAW/DAW/CAW/etc.
- Matrix selection works from either axis: selecting a row shows compatible columns, and selecting a column shows compatible rows.
- Full selection supports one or many items, a single shared sheet or separate sheets, and AI relevance ordering.
- Both shells share the tree, search, specification, matrix, variant and add-on logic.
- Conveyance charges are managed exclusively in the Lead UI. Exclude conveyance tariff entries and containers from both SOR Add Item shells, their search results and baskets. Selecting a material retains its source-defined Lead class and rule context for the Lead workspace.
- User-confirmed Full hierarchy: Part → Heading → Section → Subsection → Item family → Item or matrix choice → Variant.
- User-confirmed Lite entry: Lite is used only inside Templates and opens with Variants for the template's item/family context. It does not start with the general Part tree.
- User-confirmed Lite navigation: Variants is the entry point, not a restriction. The user can go back through Item or matrix choice, Item family, Subsection, Section, Heading and Part, select a different item, then return to its Variants and Apply.
- A template field currently has one material slot. Lite can return one choice by default and expose a batch callback for template roles that support multiple materials; it must never silently drop all but one selection.

## Live database findings

The active model is public."SOR_Recipie" and public."SOR_Year", plus public."SOR_Recipie_View". The spelling Recipie is the actual table name.
The previous catalogue, annual observations, rates and navigation projections remain physically in legacy_sor_archive, with no active application path. No old-estimate compatibility adapter is retained. The renderer now uses the current recipe/annual/resolver contracts exclusively for SOR.

There are 11,790 permanent definitions: Part 1 = 570; Part 2 = 377; Part 3 = 6,321; Part 4 = 4,522.
Six Part 1 definitions are matrix containers without annual rates; the other 11,784 definitions have an annual entry in at least one year.
There are 22,694 annual rows across 2025–26 and 2026–27. The exact (recipe_code, year) count is also 22,694.
2026–27 has 11,517 annual entries: 535 / 369 / 6,125 / 4,488 across Parts 1–4.
2025–26 has 11,177 annual entries: 529 / 372 / 5,789 / 4,487.
These are annual-entry counts, not direct-costing eligibility counts.

## Part labels and tree

| Part | Proposed UI label | 2026–27 source annual entries (before selector exclusions) |
| --- | --- | ---: |
| 1 | Part 1 · Irrigation & CAD | 535 |
| 2 | Part 2 · Roads & Bridges | 369 |
| 3 | Part 3 · Buildings | 6,125 |
| 4 | Part 4 · Public Health | 4,488 |

Use part_no for identity and these friendly labels in the selector. Do not rename recipe codes or modify immutable definitions to label navigation.

Full browsing path:
Part → Heading → Section → Subsection → Item family → Item or matrix choice → Variant.

Full now selects an exact item or matrix cell using “+” directly in the list, with its standard configuration and quantity 1. It stays in the current list/search, like SSR. Variant rows identify exact source codes; the details arrow offers deeper variant/extras/quantity configuration when wanted. A separate mandatory review/checkout page is no longer part of normal Full selection. In template-only Lite, open the shared variant selector first using the existing item/family context, then Apply to the template. Required inputs for an enabled adjustment must still be complete before applying that configuration.
Where the matrix axes already resolve a variant dimension, carry that value into the final Variant stage without asking the user to choose the same dimension again. Offer only remaining compatible choices backed by explicit source relationships; do not synthesize additional variants. For items with no alternatives, show the resolved standard configuration without inventing a variant dropdown.
Add-ons remain separately labelled within the final review; an optional addition is not automatically a substitute variant.

Skip missing levels and redundant singleton wrapper headings. For Part 4 the single Public Health Items heading can be omitted visually; its identity remains in the path.
Do not create families by splitting descriptions or guessing from code prefixes. Use variants.main_recipe_code, matrix context and explicit source metadata.
Do not merge similarly worded headings automatically. Any friendly alias is display-only, recorded separately from original annual/source headings.

The following heading inventory describes the source book, not the final visible menu. Conveyance headings and tariff entries are excluded from selection as specified below.

| Part | Current source heading | 2026–27 source annual entries |
| --- | --- | ---: |
| 1 | Conveyance Charges of Materials | 81 |
| 1 | Hire Charges of Machinery | 73 |
| 1 | Irrigation Work Items | 271 |
| 1 | Labour Rates | 110 |
| 2 | Hire Charges for Machinery | 61 |
| 2 | Labour Rates | 5 |
| 2 | Material Rates | 108 |
| 2 | Road Safety Interventions Item Rates | 28 |
| 2 | Roads & Bridges Work Items | 167 |
| 3 | Civil Items | 2,604 |
| 3 | Electrical Items | 2,562 |
| 3 | Plumbing Items | 959 |
| 4 | Public Health Items | 4,488 |

Part 1: show Irrigation Work Items, Labour Rates and Hire Charges of Machinery. Do not show Conveyance Charges of Materials. Irrigation Work Items includes materials, capital equipment and related costs; do not relabel them all as complete-work SSR recipes.
Part 2: show Labour Rates, Hire Charges for Machinery, Material Rates, Roads & Bridges Work Items, Road Safety Interventions Item Rates. Part 2 SOR remains SOR when MoRTH arrives; the MoRTH analysis source is a separate source tab.
Part 3: Civil Items / Electrical Items / Plumbing Items, followed by the recorded section and subsection. Example paths:
- Buildings → Civil → Centering & Scaffolding → exact centering system → Floor × Member.
- Buildings → Electrical → Air conditioning and ventilation → VRF / VRV HVAC SYSTEM → explicit capacity family → capacity items.
- Buildings → Plumbing → PVC PIPES & FITTINGS → recorded subsection → item.
Part 4: Public Health → material/work section → scope subsection → explicit matrix group/family → row × column or item. Preserve supply, laying, testing and maintenance distinctions. Conveyance tariff groups belong to the Lead workspace and are excluded from this menu. Pipe supply remains selectable.

Tree counts, availability and annual labels must use the selected project year and the selector exclusion policy. The 81 Part 1 conveyance cells have annual sections different from permanent recipe sections; the Lead workspace must retain those annual published references even though they are hidden in Add Item.
Keep original book/source order as default; use recorded annual PDF page/table/row evidence where supplied and stable natural identity as a tie-breaker. AI relevance applies to search results and an explicit suggested order, never overwrites the book tree.

Full section/subsection inventory is in sor-selector-inventory-2026-27.json (509 distinct annual paths).

## Lead ownership and exclusion from Add Item

Confirmed requirement: the user selects the material or work item in SOR; conveyance is calculated and applied through the existing Lead UI. Do not ask for distance, lift, handling or a transport tariff in Add Item. Do not include transport again as a picker-generated extra or add-on. Preserve any published delivery-inclusive base price and its source restrictions.

### Shared selector filter
..\
- Exclude definitions with metadata.item_type equal to conveyance_matrix or conveyance_matrix_cell. Apply this before pagination, ranking and counts, across tree, search, suggestions, matrix browsing, Lite replacement navigation and Full insertion validation. Do not merely hide a heading while leaving its tariff cells searchable.
- Prune headings/families with no remaining selectable descendants. Check the resolved definition again before Apply/Add, including restored baskets and template contexts. A hidden tariff cannot be inserted through a saved selection or replacement path.
- Use structured source classification, not description substring matching. A pipe supply description can legitimately say that transportation is included or excluded; that does not make the supply item a conveyance tariff. Future tariff shapes need an explicit exclusion classification before exposure.
- Keep the underlying SOR recipes, annual rates and matrix coordinates intact for Lead calculations and audit. This is a selector visibility rule, not a database deletion or a removal of Lead's pricing access.

Live inspection on 23 October 2026 found 6 Part 1 conveyance containers and 836 conveyance cells: 81 in Part 1 and 755 in Part 4. Part 4 tariff cells occur in P04-T06, T07, T11, T12, T13, T20 and T21. Those table IDs are inspection evidence, not a substitute for the structured filter. All 836 cells have 2026–27 annual entries. Excluding them gives 454 / 369 / 6,125 / 3,733 annual entries across Parts 1–4 (10,681 total), before other rate/eligibility filters. The inventories above and the JSON capture retain the unfiltered source counts.

### Material classification passed to Lead

SOR_Recipie.lead_applicability stores a material profile code from SOR_Lead_Profile. Current profiles are EARTH, SAND, STONE, CEMENT, STEEL, LIME, WOOD, WATER, BRICKS and PIPE. This is a transport classification, distinct from a pipe's specification class such as NP2 or PN16.

Retain the exact profile code, requested/resolved recipe codes, annual row, quantity/unit and selected specification/variant in the saved selection and DATA snapshot. Also retain the selected-year SOR_Year.metadata.lead_rule_code and the applicable source rule when present. After a year change, resolve this context again through the existing approved revision/year functions. The picker passes this context to Lead without pricing or adding a conveyance line itself.

| Source material profile | Existing Lead calculation treatment |
| --- | --- |
| EARTH | Earth conveyance column |
| SAND | EARTH chart class; preserve SAND identity/material name |
| STONE | Stone/aggregate conveyance column |
| CEMENT | Cement/packed-material conveyance; compatible tonne quantity |
| STEEL | Steel/packed-material conveyance; compatible tonne quantity and applicable fabrication/handling scope |
| LIME | EARTH for lead; STONE/LIME for handling |
| WOOD | SLAB_WOOD chart class |
| WATER | Water tariff and its explicit volume basis |
| BRICKS | Brick tariff and its per-1,000 quantity basis |
| PIPE | Exact pipe-family/specification/quantity adapter and recorded conveyance scope; never a generic earth/stone charge |

Class selects the applicable tariff column or calculation family; the recorded rule and source scope determine what is payable. For example, SOR-P01-T01-R0074 is STONE but its annual rule is STONE_INCLUDED_LOADING, so class alone must not add loading again. SOR-P04-T01-M0061 is PIPE and its recorded rule references the matching 1800 mm NP2 conveyance cells. PIPE includes several families and units; do not convert every PIPE profile into the RCC metre-based Table 6/7 calculator. Missing classification, unsupported quantity conversion or an unresolved rule remains explicitly unconfigured for additional Lead; do not guess a tariff or silently treat missing data as a priced zero.

SSR remains separate: SSR's own parent-work policy, quantities, inclusions and selected conveyance basis continue to control its Lead calculation. This SOR selector handoff must not replace SSR's policy by inheriting a SOR supply item's delivery conditions.

### Current integration

lead.ts calculates common chart charges by conveyanceClass, distance, lift, handling and parent allowances; an explicit leadRuleCode selects the source-specific SOR rule. sorEstimate.ts passes the current material profile and annual rule into DATA and Lead. pipeLead.ts supports the separate saved RCC Table 6/7 tariff selection and the exact recorded metre-based SOR pipe-rule path. Other PIPE families remain unsupported rather than being treated as RCC. See reviewed-lead-integration.md for SSR separation and tariff refresh behavior.

## Matrix normalization

The full source inventory contains 4,357 MATRIX definitions covered by four recorded shapes. This is a source-model inventory; conveyance entries below are available to Lead only and excluded from the picker:
- 6 metadata.matrix containers; these are navigation groups, not addable estimates.
- 81 metadata.matrix_cell independent conveyance recipes.
- 1,035 metadata.centering_cell independent centering recipes.
- 3,235 metadata.public_health_cell independent public-health recipes.

No unrecognized MATRIX metadata shapes were found. In 2026–27 no duplicate public-health row/column intersections were found when scoped by table_code + section + subsection + public_health_cell.group.
Do not assume this is a uniqueness guarantee for future imports: ambiguous intersections must be surfaced, not resolved by whichever recipe is first.

Normalize each group into:
- stable group key scoped by Part, source table, annual context, explicit group/system and work scope;
- row axis key + friendly label + stable row values;
- column axis key + friendly label + stable column values;
- cells mapping (rowId,columnId) to exact recipe_code;
- current annual year_row_code, original unit/basis, rate status, project-zone quote and required inputs.

In the Lead workspace, conveyance group identity uses matrix_cell.origin_matrix_recipe_code. The Add Item matrix adapter excludes all conveyance entries. Centering uses table/system + scope and metadata.centering_cell.floor/member. Public Health uses table/scope + public_health_cell.group and row/column for the remaining selectable supply/work items.
Do not treat zone columns, material H/labour L components, weights, dimensions or taxes as alternative priced items unless the recorded schema explicitly declares them selectable recipe axes.

Interaction:
1. Show both named axes immediately (e.g. Diameter / Pressure class).
2. Allow either to be chosen first; there is no separate n/m numeric input.
3. Choosing row R returns all recorded compatible (R, C) cells; choosing column C returns (R, C) across recorded rows.
4. Keep unavailable values visible but disabled with the annual reason. A missing/null cell is never zero and never interpolated.
5. Allow one or several valid second-axis choices, then proceed to Variant for each selected item. Only completed configurations are ready to add. Selection is by exact cells; do not silently expand a Cartesian product.
6. Changing first-axis values preserves basket items. Clear/reset only affects browsing filters.
7. In the final Variant stage, resolve the chosen configuration and review required inputs and separately labelled applicable add-ons per item before confirmation.

Example: Part 4 → HDPE PE-100 Water Supply Pipes → HDPE PE100 pipe supply.
This is 28 diameters × 5 pressure/SDR columns (140 recorded recipes). Not all intersections are priced.
Actual 2026–27 samples:
- OD 20 mm × PN16 / SDR9: ₹41/m.
- OD 25 mm × PN16 / SDR9: ₹51/m.
- OD 32 mm × PN10 / SDR13.6: ₹52/m.
- OD 32 mm × PN12.5 / SDR11: ₹69/m.
- OD 32 mm × PN16 / SDR9: ₹83/m.
OD 20 mm × PN6 / SDR21 is not published, with cost_ready=false; never manufacture a rate.
The production picker fetches all 140 recorded cells in this family; the earlier research demonstration used only three diameter rows.

Centering example: table/system C → 4th Floor × PERGOLA SLABS (Only Rib Beams), recipe SOR-P03-T02-MC-R04-CM.
The 2026–27 total is ₹3,017/Sqm, consisting of material hire H ₹1,890 and labour L ₹1,127.
H and L are components of the chosen item; they are not the n/m alternatives. Extra-height rules are separate inputs with their recorded base and rounding.

## Rate and rule eligibility

Use recipe_code as permanent identity and year_row_code as annual evidence. The project supplies year and zone.
The rate field is JSON: scalar, zoned object, specialized conveyance object or null. Resolve through the published quote/year contracts and explicit per-type adapters; do not Number(rate).
The backend offers sor_resolve_recipe_year, sor_resolve_recipe_revision and sor_resource_quote. Their live year/revision/quote contracts were inspected and exercised on 23 October 2026; see Year changes and forward/backward resolution below.
Missing cost_ready is not automatically false or true: Part 1 has published scalar/zoned rates with no such flag. Interpret documented rate_status alongside the resolver output.
Numeric source_clarification rows remain blocked. Null formula rates can require user inputs even when cost_ready=true. analysis_required needs an explicit analysis flow.
Preserve explicit rate basis, rate_detailed, to_be_printed, source evidence, use restrictions and required inputs.
Variants and add-ons are structured objects, not the legacy reviewed rule IDs. Existing legacy reviewed calculation RPCs cannot be reused as if their contracts were unchanged.
review_only=true add-ons require the recorded confirmation/review path. Respect exclusivity, fixed targets, component bases, conditions, units and rounding.
An unsupported rule must show requirements and block direct insertion; no blanket percentage-on-total fallback.

## Year changes and forward/backward resolution

User requirement: when the project year changes, use the approved forward/backward resolution already defined in Supabase. Do not declare a saved code unavailable merely because an exact code/year lookup has no row.

Live call path:
sor_resource_quote(requested_recipe_code, project_year, project_zone, component, requested_unit)
→ sor_resolve_recipe_year
→ sor_resolve_recipe_revision
→ approved lineage/historical link resolution
→ SOR_Year for the resolved code in the requested project year
→ rate/component, zone and unit validation.

The revision resolver follows previous definitions backward before effective_from_year and successor/replacement definitions forward on or after that year. An automatic relationship can change the resolved code. Review-required relationships return candidate codes and review boundaries without a usable quote. Multi-target results likewise require review; never choose the first candidate automatically.

Separate historical_fallbacks capability exists in sor_resolve_recipe_year and its validation functions. If the revision-resolved code has NO annual row for the requested year, a relationship explicitly listing that year can resolve to another recipe. Automatic links are followed; review_required links produce fallback_review_required and fallback_candidate. Links retain source comparison/review evidence. At inspection, zero public SOR_Recipie rows had historical_fallbacks populated; 221 recipes had recipe revisions (220 automatic, one review_required). Thus live forward/backward examples below use recipe revisions, not populated historical-fallback links.

This resolves the definition for the requested year and then uses that same year's tariff. It does not carry the nearest earlier/later numeric rate into an edition with no tariff. Any existing annual row wins, including blank, held and other-zone rows, so historical fallback cannot bypass that annual restriction. No approved route to an annual tariff returns selected_year_rate_missing. Blank/unpriced/held entries and zone/unit mismatches keep their explicit failure statuses.

Live checks, zone_3:

| Requested recipe | Target year | Resolved recipe | Result |
| --- | --- | --- | --- |
| SOR-P01-T07-R0111 (Rod Bender, older definition) | 2025-26 | SOR-P01-T07-R0111 | priced, INR 805/day |
| SOR-P01-T07-R0111 | 2026-27 | SOR-P01-T07-R0001 | priced, INR 845/day; automatic forward revision |
| SOR-P01-T07-R0001 (Rod Bender, later definition) | 2025-26 | SOR-P01-T07-R0111 | priced, INR 805/day; automatic backward revision |
| SOR-P01-T07-R0001 | 2026-27 | SOR-P01-T07-R0001 | priced, INR 845/day |
| SOR-P03-T03-R0960 (water-tank cleaning, older quantity basis) | 2026-27 | SOR-P03-T03-R0408 | revision_review_required, null rate |
| SOR-P03-T03-R0408 | 2025-26 | SOR-P03-T03-R0960 | revision_review_required, null rate |
| SOR-P01-T03-R0071 (20 cum/hour batching plant) | 2025-26 | SOR-P01-T03-R0071 | selected_year_rate_missing, null rate |
| SOR-P01-T03-R0071 | 2026-27 | SOR-P01-T03-R0071 | priced, INR 50,86,913/Each |
| SOR-P04-T15-M0001 (unpublished HDPE cell) | 2026-27 | SOR-P04-T15-M0001 | source_review_required, null rate; no neighbouring tariff copied |
| SOR-P01-T07-R0001 | 2027-28 | SOR-P01-T07-R0001 | selected_year_rate_missing, null rate; no carrying forward 2026-27 price |

requires_review=false alone does not mean that a usable rate exists: both selected_year_rate_missing and an unpublished source cell can retain that boolean. Require a priced quote for direct base-rate costing, plus completion of any applicable variant/add-on requirements. Formula/analysis cases use their explicit supported workflow instead.

Application integration: updateMeta in useStore.ts marks project DATA rates pending when year/zone changes, and dashboardContextMatches invalidates old compiled context. Component/Data dashboards ask for Sync. refreshSorSelection in sorSource.ts uses the existing approved year/revision resolver through sor_picker_detail. The obsolete reviewed observation/history adapter has been deleted. Full basket entries refresh independently and remain visibly stale if resolution fails; insertion stays blocked until resolved or removed.

Redesign behavior:
- A year/zone change triggers re-resolution of the current Lite template choice and every Full basket/saved item through the same shared resolver. Retain the requested recipe identity separately from the resolved annual recipe/code.
- The selector refreshes its quote and shows original code → resolved code when a replacement occurs. Lite remains on Variants first using the resolved family/context. Full retains independent per-item results.
- Automatic approved replacements update the compatible quote. Review-required replacements open review/variant choices; unavailable entries remain selected but visibly unresolved until addressed. Do not drop them or price them as zero.
- Preserve measurements and quantities. Revalidate quantity basis, units, variants, add-ons and required inputs against the resolved annual definition before recalculation. Reuse only explicitly compatible configuration.
- Include project year, zone, component and requested unit in cache/request identities; discard responses from earlier contexts. Invalidate compiled DATA/component totals until recalculated with the new resolution.
- Keep requested code, resolved code, annual year_row_code, revision_path, fallback_path, source year, zone, rate basis and calculation evidence in the current pricing snapshot. Retain the original insertion evidence separately.
- Tree/search availability must account for approved resolution paths, not only an exact code/year row. Resolve candidate sets server-side/in batches rather than issuing a quote call for every stored definition on each render.

## Lite and Full shells

Shared core: part labels, lazy tree, query parser, result retrieval/ranking, matrix adapter, recipe inspection, variant selector, separately labelled add-on inputs, eligibility and selection identity. The shells enter this shared core at different points.
Lite is template-only. Its initial flow is Template item/family context → Variants first → Apply to template. Variants is an entry point, not a navigation lock: Back and ancestor breadcrumbs let the user go through Item or matrix choice → Item family → Subsection → Section → Heading → Part and choose a different item. From the replacement choice, proceed forward to its Variants and Apply. Initialize the complete breadcrumb context even when opening directly at Variants; provide a way to select another item when the old item cannot resolve for the project year. Keep the template's existing applied choice intact while browsing and on Cancel; commit only on Apply. Discard incompatible dependent variant/add-on inputs when switching items and revalidate the final choice against the template quantity basis. Do not open the Part tree as the initial screen. Any required unresolved matrix dimensions remain part of completing the compatible configuration. One field/role uses a single choice; allow batch only where the template provides a collection destination.
Full: persistent multi-item basket across all Parts/search modes; per-item review and quantity; Add selected; one shared sheet or separate sheet per item, retaining the existing append-to-shared-sheet workflow.
Both preserve independent quantities and final cells; shared storage does not combine distinct rate items or mix their bases.
Saved selection identity includes recipe_code, year_row_code, project zone and canonical applicable variant/add-on/input configuration.
Deduplicate identical configurations; different valid configurations remain distinct. Deliberately repeated identical items need an explicit repeat action rather than accidental duplicates.
Changing year/zone re-resolves each basket entry, marks stale/unavailable choices and requires renewed rule review.

## Search and local AI

Existing code: semanticMasterSearch.worker.ts loads mixedbread-ai/mxbai-edge-colbert-v0-17m, a 17M ColBERT using quantized ONNX/WASM. The wrapper reranks at most 48 lexical candidates. The reviewed SOR book browser currently uses server text search without this local reranking.
The shared SOR picker now offers explicit local AI relevance ordering of the currently retrieved search shortlist, using the existing model and ranking wrapper. Book order remains available when the model fails. This is optional reranking, not a replacement model or an AI-generated tree; additional source pages must still be loaded explicitly. A domain benchmark and model replacement remain future work.

Pipeline:
- Resolve project year/zone and source filters first.
- Retrieve using exact recipe/printed-code and numeric constraints plus lexical full-text/BM25-style retrieval.
- Include complete section/family context and named matrix values in candidate text; retain full specification for inspection even if model input is bounded.
- Return usable lexical results immediately.
- Rerank the shortlist locally; preserve exact code/diameter/pressure/grade/unit constraints as hard filters.
- Offer Book order / Relevance and a clear model loading/fallback state. Cached model failure must never block selection.
- Cache candidate representations by model revision and recipe/source-content revision, not by description alone.

Candidates to evaluate (recommendations, not measured SOR results):
1. Keep the existing Mixedbread 17M baseline first: already implemented ONNX and suitable for edge reranking.
2. TinyBERT-L2 MS MARCO cross-encoder: candidate for lower reranking cost. Validate numeric and near-identical specification discrimination; published benchmark throughput is not Windows/WebView CPU timing.
3. MiniLM-L6 MS MARCO cross-encoder: accuracy/latency comparison candidate, not automatically superior on SOR.
4. BGE-small-en-v1.5 (33.4M): an embedding retrieval option; it is not a smaller drop-in cross-encoder.
5. static-retrieval-mrl-en-v1: static token embeddings can make first-stage retrieval cheap. Quantization/download footprint and domain accuracy need measurement; faster does not mean a smaller distributed model.

Do not replace a model solely because it is newer. Benchmark the full retrieval+ranking path, not only reranking on a shortlist that already excludes the correct item.
Build a reviewed SOR query set covering printed codes, misspellings, Indian construction terminology, exact diameter/pressure/grade, matrix-axis reversal, long specifications, negative constraints and unavailable cells.
Measure Recall@50, MRR@10/NDCG@10, exact-constraint violations, cold/warm CPU latency, memory, download size and offline behavior on the actual desktop/WebView hardware.
Choose a replacement only after those results. No SOR-specific model benchmark or replacement was performed in this investigation.

Primary model sources:
- https://huggingface.co/mixedbread-ai/mxbai-edge-colbert-v0-17m
- https://huggingface.co/cross-encoder/ms-marco-TinyBERT-L2-v2
- https://huggingface.co/cross-encoder/ms-marco-MiniLM-L6-v2
- https://huggingface.co/BAAI/bge-small-en-v1.5
- https://huggingface.co/sentence-transformers/static-retrieval-mrl-en-v1
- https://www.sbert.net/docs/pretrained-models/ce-msmarco.html

Official SOR discovery page:
https://www.pred.telangana.gov.in/ssr.php
It links the 2026–27 book at https://www.pred.telangana.gov.in/uploads/documents/doc-1786011352680-dce1d071-2aba-40d8-92c2-5dc6ef1cd301.pdf .
The web reader could not ingest this 18.3 MB PDF. This investigation's detailed schema and sample values were verified from live Supabase, not independently re-extracted from that PDF.

## Implementation sequence

1. New typed SOR source adapter and resolver contract tests using live captured shapes; preserve material profile and annual Lead-rule context for the Lead UI while keeping SSR policy separate.
2. Read-only, project-year tree/search/matrix projection with the shared conveyance exclusion applied before counts/pagination; paginate summaries and leaf results, never download full source geometry for browsing.
3. Shared selection core and new Lite shell; connect Canal Roads and SLRB without discarding variants/add-ons.
4. New Full shell with persistent basket, per-item requirements, shared/separate storage and insertion/refresh snapshot support for new SOR identities.
5. Local ranking integration and measured model comparison; choose and pin a replacement only if it improves agreed results.
6. Remove old SOR selector routes and adapters. No old-estimate compatibility layer is required or retained.
7. MoRTH as the later independent source.

Use the existing Supabase function contracts mapped in sor-supabase-function-map.md. The captured public function definitions, trigger bindings and read-only checks are in sor-supabase-function-contracts-2026-10-23.json. Reuse supported resolver/quote/unit/identity behavior. Keep database validators and write triggers separate from runtime pricing APIs; a valid rule definition is not a computed adjusted rate. No new tree/search or general add-on calculation endpoint was identified in the inspected public custom-function inventory.

Verification must cover row-first/column-first same recipe, sparse cells, group isolation, current-year headings, zone rates, formula/analysis/reference statuses, Full item/matrix-to-Variant navigation, template-only Lite opening Variants first with the template context, Lite Back/breadcrumb navigation up to Part and replacement-item selection returning to its Variants, Apply committing and Cancel preserving the original template choice, incomplete required variants blocking insertion, independent per-item variants in batch selection, matrix-resolved dimensions carried into Variant without repeated selection, items without variant alternatives, add-on inputs/bases, one/multiple picks, shared/separate sheets, reopen/preserved basket, year changes, stale async responses and local AI fallback.

Also verify conveyance containers/cells cannot appear through tree/search/AI suggestions, matrix results, restored baskets or Lite template replacement; visible counts exclude them; pipe/material supply items remain selectable; the saved SOR profile/specification/annual-rule context reaches Lead; Lead selects compatible year/zone tariffs without a duplicate Add Item transport charge; included loading/delivery is respected; unsupported PIPE families/units remain explicit; and SSR Lead policy is unchanged.

## Investigation verification completed

- Reconciled all 509 annual navigation paths to 2026–27 Part totals of 535 / 369 / 6,125 / 4,488.
- Captured the 140-cell HDPE matrix; 116 cells have a numeric rate and cost_ready=true for 2026–27.
- Checked the demonstration's 15 cells against the live HDPE capture.
- Chromium interaction checks passed for row-first/column-first navigation, same-cell identity after axis reversal, batch selection, basket preservation, disabled unpublished cells, duplicate prevention, remove and clear.
- The demonstration has no horizontal document overflow at 736px and 320px viewport widths; both layouts were visually inspected.
- The preceding capture checks describe the original research demonstration. Current implementation checks are listed below. No replacement search model was implemented.

## Implemented source and application contract

- `sor_picker_source_rows` derives compact annual tree/family/matrix rows from current SOR tables. `sor_picker_index` stores that projection, with public read-only RLS and indexes for year/Part, year/family and recipe/year. Row triggers refresh affected recipes and variant dependants whenever source recipe/annual records change. Source bulk operations must keep these triggers enabled; no archived records feed this index.
- `sor_picker_rows` is a security-invoker view of the index. `sor_picker_browse` returns paginated summaries or leaves; `sor_picker_detail` re-resolves the requested code, quotes the selected year/zone and returns compact annual evidence, related add-ons and Lead rule. Browse never downloads annual drawing geometry. Pricing remains in the existing resolver/quote functions.
- Search vectors are generated in the current index and indexed with GIN. Exact SOR-code queries use a separate code predicate. Search vectors are omitted from returned leaf payloads. Final public-role EXPLAIN checks were approximately 63 ms for an exact plumbing code and 15 ms for “sand filling”; repeated exact-code public API checks pass.
- All three new RPC/view surfaces retain source access controls. No SOR prices, definitions, SSR policies or source revision links were changed. Latest public-role root EXPLAIN was approximately 18 ms. Public API tree/search, all 140 HDPE cells and approved forward/backward resolution pass.
- Full AddItemModal uses the shared hierarchy with direct “+” selection, required review for variants/add-ons and existing shared/separate-sheet storage. Browsing follows Part → Heading → Section → Subsection → family/item. Single-child heading/section/subsection branches collapse locally; items never mix into ancestor group pages. Plain terminal families include their item summary and direct “+”; variant/add-on items open their choices before adding. “+” preserves list, search and scroll position; the selected check can remove the standard selection just like SSR. Saved selection keys distinguish configurations. Exact recipe, annual row, requested/resolved code, quote, rule, inputs and calculation evidence travel into DATA. SOR publishes a unit-rate recipe without adding SSR overhead again.
- UnifiedCodePicker is template-only Lite in Canal Roads and SLRB. It restores Variants first, provides Back and all ancestor breadcrumbs, and commits only on Apply. The custom DATA resource editor uses a separate single-resource mode with the same browsing/review core. The backend SOR browser uses inspection mode.
- Year/zone changes re-resolve saved SOR selections through approved links and revalidate units/configuration. Missing annual rates and review-required replacements stay unresolved; no nearest-year tariff or adjacent matrix price is copied. Compiled totals require Sync in the new context.
- SOR material class and annual Lead rule reach Lead. Conveyance containers and cells are excluded before browsing/counts/search and rejected by detail/insertion guards. SSR retains its own policy. The exact RCC SOR pipe adapter checks end type, diameter, class, annual binding and metre unit.
- Archived material/labour/machinery table reads are retired. Custom DATA Timely crew/fuel rates use exact `ssr_linked_resource_quote` scope/index/component in the selected zone; published SSR analyses retain their published annual rates. Cement/steel project overrides use current SOR identities. Dated circulars read `SOR_Monthly_Rate` using its explicit recipe/resource bindings and source units. Unbound Public Health resource keys remain distinct and are never guessed into a SOR supply recipe.

## Implementation verification

- `npm run test:sor-selector` and `npm run test:sor-selector:live`: matrix identity, missing cells, source units, centering height, electrical percentage, HDPE resin adjustment, unsupported input/rule blocking, insertion guards, independent/shared sheet quantity seeding, profile/rule snapshots and approved forward/backward/review resolution.
- `node scripts/test-material-rates.cjs --live`: all 86 current monthly rows, explicit recipe/resource separation, date selection, kg/tonne/One Metric Tonne conversions and the May 2026 cement rate. The adapter reads compact circular fields rather than document OCR metadata.
- Live index/source reconciliation: 21,022 rows across the two annual editions. A source annual update inside a rolled-back transaction refreshed the matching index rows with zero differences.
- Chromium using the production SorPicker and live Supabase: either-axis selection, identical cell after axis reversal, disabled unpublished cells, two-item review queue with quantities 3 and 5, Lite direct Variants, Back to matrix, Cancel preserving the applied choice, replacement Apply, navigation to Parts and year/zone context reset. Root layouts were visually inspected at 320px and 1200px; no horizontal document overflow at 320px.
- The actual UnifiedCodePicker shell also passed focused browser checks with a test project context and live catalogue requests: an existing SSR code resolves its published description/unit before Apply; switching to SOR, choosing the 152.4 mm plumbing variant, applying and reopening restores its exact variant and annual snapshot. The optional AI ordering control was exercised; Book order remained available and the selected basket stayed intact.
- Lead, pipe Lead, rate-analysis, project Items, material overrides, built-in DATA, Timely DATA, shared sheets, component template and SLRB regressions pass. Web TypeScript and the renderer production build pass. Targeted lint passes; repository-wide lint still reports unrelated existing CanalBankDesign/CanalCutDesign hook errors.
- Final security/performance advisor checks show no finding for the selector views, functions, table or indexes. Existing unrelated findings remain (including eight existing public tables without RLS); no new selector privilege or RLS warning was introduced.

## Explicit boundaries

Review-only, unpriced, analysis-required and unsupported formula/finished-cost rules remain blocked. Supported optional extras require their explicit source bases, inputs and units; no universal percentage fallback is used. PIPE families beyond the verified metre-based RCC rule path need their own Lead adapters. New local AI models and MoRTH are deferred. Browser checks exercise the production picker in a focused harness; they do not constitute a full interactive desktop project acceptance run.

## SSR-style selection and navigation performance update

- The Full workflow follows the tree to an item or matrix cell. A plain item has “+” and keeps the user in the list. If variants/add-ons exist, an arrow opens their choices before adding. Search results follow the same rules. The old checkbox/review queue is removed. Lite retains its template-first Variants flow.
- `sor_picker_navigation` returns compact annual path summaries once per edition. `SorTreeIndex` builds a keyed tree in O(paths × 4), then resolves group lookups and singleton-heading/section/subsection skips locally. It does not fetch all 10,681 item definitions to navigate.
- A covering navigation index supplies the path summaries without reading the large item payloads. The measured public-role navigation function fell from approximately 907 ms to 28 ms after the index was added.
- In-memory LRU caches bound browse pages (80), details (128) and navigation editions (4). Browse/tree entries expire after five minutes, quoted details after one minute. Keys include edition, path, query/page and, for quotes, zone/code. Hover/focus prefetch starts after 140 ms. Identical requests share one promise; canceling an old view does not abort a request another view needs.
- The picker has no Refresh/Sync button. Estimate rate Sync continues to bypass cached quotes. Failed requests are not cached. Full requests for a new year/zone cannot commit into a different picker session.
- Detail and browse loading are separate. Loading a detail no longer causes a second general browse; standard items do not fetch a variant family. Returning to a cached group requires no network round trip for its navigation.
- `scripts/test-sor-browser.cjs` covers cancellation/deduplication, bounded expiry, fresh Sync, failed-request retry, group isolation and local tree collapse. Live selector tests reconcile the new navigation to all four visible Part counts. Earlier Chromium checks covered consecutive direct selections, exact-variant searches and standard Lite loading; the hierarchy correction below supersedes the former direct-from-Part behavior.
- Final browser checks also confirm that matrix filters do not hide a subsequent global search, either-axis matrix selection retains exact identities, unpublished cells remain disabled, and returning to a visited Part makes zero additional catalogue requests. The 320px layout has no horizontal document overflow. Final web type checking, targeted lint and production renderer build pass.


## Tree-only navigation correction

- Part and intermediate tree pages display groups only. They do not request or show every item below the selected Part. Delayed prefetch only fetches the next family/item page; intermediate navigation uses the cached path index.
- Family pages return one compact item summary for singleton families in the same RPC. Multi-item variant/matrix families remain groups. A plain terminal item shows only “+” in Full; an item with variants or add-ons shows a configuration arrow. Item descriptions still open details when needed.
- Browse derives `requires_configuration` from the current permanent recipe for just the visible page. The direct-add handler rechecks the resolved recipe before insertion, so a stale summary cannot bypass new variant/add-on requirements. Unknown future rule keys require review.
- The manual Refresh icon and obsolete compact group grid are removed. Error Retry remains available. Pricing resolution, Lead class/rules, shared/separate sheets and estimate Sync retain their existing behavior.

- Correction verification: live public-role browse flags for plain crane / plumbing variants / HDPE add-ons; singleton-family summaries; full matrix and approved year-resolution regressions passed. Chromium confirmed tree-only Part 2 and Labour category pages, plain terminal “+” without detail navigation, variant choice before adding, add-on choice without automatic insertion, and Lite Variants reopening with Cancel preserving selection. Web type checking and targeted lint passed.
- Final renderer production build passed after the hierarchy correction (existing Vite deprecation/chunk notices only).
- Internal recipe/table/year-row IDs are storage identities only: picker rows and accessible actions use descriptions, units and genuine published item references. Detail evidence and shared template/measurement references omit internal IDs; a missing printed reference uses the named SOR Part and edition.
