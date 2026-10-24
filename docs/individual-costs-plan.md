# Individual Costs — separate MoRTH and SSR resource groups

Status: revised design and full source-row audit. This document governs resource pricing in the MoRTH catalogue plan.
User clarification incorporated on 24 October 2026: MoRTH is a quantity/calculation starting point. Its linked SOR resources supply annual rates; adopted starting choices are provisional and editable. Include SSR resources in the same three pages from the first implementation.

## Pricing-source clarification — 24 October 2026

MoRTH rows and SSR rows NEVER merge, in data identity, stored overrides, display grouping or change propagation. This remains true when descriptions, specifications, units and selected SOR items are identical. Sharing a screen or a read-only quote cache does not share an adopted resource cost.

SSR defaults to the selected SSR_Year resource rate (through ssr_year). Each SSR row also offers Choose SOR and direct Manual rate entry. Restore SSR rate returns to SSR_Year. MoRTH has SOR-linked and Manual modes. Both sources keep their own adoptions and per-use calculation rules.

A MoRTH edit updates only bound MoRTH uses. An SSR edit updates only bound SSR uses. Neither changes authoritative source tables.

## Reuse the existing cement/steel interaction pattern

The user explicitly chose the existing Cement / Steel rates behaviour as the interaction model. Verified implementation references: MaterialRatesPanel.tsx, materialRates.ts and MaterialRateOverride in types/project.ts.

Reuse the established pattern:
- Show the original published rate alongside the estimate's adopted rate and provenance.
- Stage one or more edits locally, then Apply once; Discard restores the saved state. Avoid project-wide invalidation on each keystroke.
- After Apply, automatically recalculate affected uses within the edited source; no second manual Sync is needed.
- Preserve the original published rate, unit conversion and adopted-rate provenance; support restoring the source default.
- Preserve intentional per-DATA manually locked rows and show them clearly in where-used results. A shared Manual rate is distinct from an individually detached/locked DATA row.
- Persist adoptions in this estimate only and retain undo behaviour.

Extend that pattern with the explicit Choose SOR mode for these resource rows. SSR restores to SSR_Year by default; MoRTH restores to its chosen/default SOR binding. Keep the existing circular-specific cement/steel features where applicable; do not require a monthly-circular workflow for machinery or labour.

Reuse suitable conversion/provenance helpers, but do not reuse a raw material-code-only override key for the new adoption registry. ownerSource remains part of every key: SSR and MoRTH resources, defaults, manual values and propagation never merge.

## Required product behaviour

DATA → Individual Costs → Materials | Machinery | Labour.

Each page contains separate MoRTH and SSR sections, listing individual resources rather than whole work items. Group compatible repeated resources only within the same source. Every resource has a source-scoped adoption, and a change recalculates all bound uses in that same source. SSR defaults to SSR_Year and also supports Manual and user-selected SOR rates.

MoRTH does not own an annual finished-work rate. Source quantities and calculation rules, plus the currently adopted individual costs, generate a starting DATA cost. The starting cost is not represented as a confirmed exact final cost.

For MoRTH, source match confidence and numeric price availability are independent:
- Correct: the selected SOR resource has direct evidence for the actual specification, scope, unit and cost component.
- Maybe: a recorded approximation, role equivalent, empirical rate-basis factor, assumed grade or reviewed resource-family merge is being used.
- Review Required: mock/proxy/candidate-only binding, rejected/not-confirmed evidence, conflicting identity or unknown basis needs review.
A Maybe or Review Required mapping may still supply a useful provisional starting cost when a valid numeric SOR quote and a defined use basis exist. Missing price or missing quantity/conversion stays unresolved; never fill it with invented zero.

Source cost_ready=false is retained as source metadata. It is not a blanket prohibition on user-requested provisional project costing, and it must not drive every Individual Costs status to Review Required.

## Full scan completed

The audit file individual-costs-resource-audit-2026-10-24.json contains all grouped main MoRTH resources and SSR base/add-on identities, plus nested alternative-resource groups, source evidence, conflicts and live quote checks.

| Inventory | Materials | Machinery | Labour | Total |
| --- | ---: | ---: | ---: | ---: |
| MoRTH main row occurrences | 7,260 | 8,128 | 8,928 | 24,316 |
| MoRTH recorded main resource keys, before scope reconciliation | 695 | 342 | 58 | 1,095 |
| MoRTH nested alternative components without their own resource key | 204 | 4,764 | 1,907 | 6,875 |
| SSR base plus add-on row occurrences | 1,852 | 1,968 | 2,454 | 6,274 |

The recursive MoRTH recipe scan found 31,194 owners of price_lookup: the 24,316 main occurrences, 6,875 nested alternatives and three project-added water-purchase rows. This is a coverage check, not the number of simultaneously active financial rows. Alternatives are mutually exclusive; the source equipment and its split replacement must not both be charged.

SSR annual coverage was also scanned across all 1,436 annual records for 2023–24 through 2026–27. Their base/add-on resource arrays contain 25,179 row occurrences in total. The detailed year-aware grouping is captured in individual-costs-ssr-annual-audit-2026-10-24.json. Use the active year's annual rows alongside the recipe definition; do not build the index from static SSR_Recipe alone.

There are 109 recipe/year/section combinations with different annual/static array lengths; sampled differences include additional blank/NIL rows, so this count is not 109 bad resource links. It establishes that blind positional matching is unsuitable for the new shared resource registry. Preserve section/add-on/source identity and verify the exact annual use before applying any per-line pricing function.

The 6,875 nested alternatives collapse to 43 raw target/table/cost-component groups before unit/scope reconciliation. SSR has 1,487 raw identity/component groups, including structural fragments and source-scoped independent identities. These figures are audit groups, not final editable resource counts.

SSR inventory covers 360 source recipes and both recorded add-on definitions:
- sand_backing_75mm;
- murum_bed_15cm.
Their resource rows must not disappear from Individual Costs merely because they are conditional add-ons.

### Findings that affect grouping

1. Coarse sand uses the same MoRTH resource key for two actual uses:
   - Appendix mortar analyses 21.01 use screened mortar sand, quoted at 1,023/cum for 2026–27 zone 3.
   - Appendix concrete production analyses use a different SOR sand definition, quoted at 777/cum.
   Keep these separate as mortar sand and concrete sand. Do not merge them merely because a source key or description is similar.

2. Mate has a consistent recorded SOR target across 3,134 main occurrences in 2,858 source analyses. The associated link evidence includes role_equivalence. Sharing its adopted cost is useful; role equivalence is Maybe, not proof of a perfect printed-description match.

3. Electric detonator appears against two SOR targets:
   - the commodity target currently quotes 15/Each;
   - the R&B work-reference target returns morth_analysis_review_required and no numeric rate.
   Expose this conflict and let the shared adopted binding select the actual intended resource; never price a null work reference as zero.

4. Several excavator/trolley/breaker keys have both historical MoRTH machine identities and separate source identities. A generic name plus capacity is insufficient evidence that their owning/operating/fuel/crew scope is identical.

5. SSR base materials include 71 occurrences explicitly marked conversion_kind=empirical_factor under two-edition tracking. Keep the recorded multiplier, unit basis and rounding. These are historical SOR-link audit findings. They do not put ordinary SSR_Year-priced rows through the MoRTH mapping workflow or replace their published annual price.

6. Some SSR source fragments have missing units, blank quantities, NIL/Nill entries or explanatory lines such as manual-mixing captions. NIL, totals and headings must not turn into fictitious editable commodities. Genuine rows with missing basis stay in a review queue until the annual row/source context supplies it; do not infer a unit only from the name.

7. Direct stored SOR-code/component overlaps already exist between MoRTH and SSR:
   - 20 material SOR bindings;
   - four labour bindings;
   - one machinery hire_total binding.
   These are inventory overlaps, not permission to share an adopted SOR price across SSR and MoRTH. Keep MoRTH and SSR records and visual groups separate in all cases, even for identical physical resources.

### Multiple-choice coverage

Recorded price_lookup.cases occurs in:
- 1,794 material occurrences across 67 main resource keys;
- 461 machinery occurrences across three main resource keys;
- 12 labour occurrences across four main resource keys.

Of material case occurrences, 1,740 also have an ordered sor_refs list and 48 have ordered allowed_values. Machinery and labour cases have allowed_values arrays. There are no literal Medium keys in the inspected case objects. Candidate descriptions/variant metadata must be read before deciding whether a Medium option actually exists; never interpret the median numeric price as Medium.

Other optional equipment choices are in costing_options, and some candidate alternatives are in component_links. All these surfaces belong to the same resource inventory; price_lookup.cases alone is incomplete.

## Page design

One Individual Costs section with three pages/tabs:
1. Materials.
2. Machinery.
3. Labour.

Both MoRTH and SSR populate each page. Provide source filters All / MoRTH / SSR; All shows two separate labelled sections, search, status filter and Used in project / All resources. Default All resources honours the requirement to include the full inventory; load compact summaries and visible rates in pages.

Each MoRTH resource row shows:
- Meaningful resource description/specification and unit.
- Correct / Maybe / Review Required badge, with the actual reason.
- Selected SOR item description and published reference, if present.
- Current annual SOR rate and adopted project rate.
- Default / User selected / User rate indicator.
- Where-used count within this resource's source, with an expandable list of analyses and nested parents.
- Year/zone context in the page header, rather than internal source IDs in every row.

SSR rows show description, unit, published SSR_Year rate, adopted rate, selected pricing mode and where-used information. Offer Use SSR rate (default), Choose SOR and editable Manual rate. Keep SSR controls simple; no mandatory MoRTH-style match-review exercise or automatic Medium/first selection is required.

Editing a MoRTH resource opens an inline row/detail area:
- Choose among its recorded SOR candidates.
- See how the source and target specification/unit/component relate.
- See the conversion basis and evidence.
- Override an adopted project rate or return to the annual SOR rate.
- Show all affected uses. Explicitly separate whole hire, hire-only, fuel and crew.

Machinery crew options belong to Labour when the source alternative explicitly says section=labour. They remain connected to the equipment option so they activate/deactivate together.

Nested MoRTH analyses such as Appendix mortar are derived resources in their recorded section. Show their calculated rate and open their component breakdown. If a derived-rate override is supported, label it as a project override; do not add the derived total and its detailed ingredients twice in the same parent.

No internal database codes in ordinary rows, controls, accessible labels or source evidence labels. IDs remain available to the data model for exact linking.

## Main MoRTH cost control: choose SOR or type a rate

Each shared MoRTH resource has two equal first-class pricing modes:
- SOR linked: choose a SOR item; obtain its rate for the active year/zone and the defined unit/component.
- Manual: directly edit the rate cell for that resource's displayed unit. No SOR selection, quotation form, approval step or evidence attachment is required to enter a starting rate; an optional note can be added later.

Keep the normal rate cell editable. Typing a valid rate switches its adopted mode to Manual and shows a Manual label. Choosing a SOR item or pressing Use SOR rate switches back to SOR linked. A deliberately entered zero is an explicit user rate, distinct from an empty/missing price.

Both modes use the same shared resource adoption and automatically recalculate every bound MoRTH usage, including nested analyses. Persist mode, manual value, unit and prior SOR choice in the estimate. Ordinary Sync must not overwrite a manual value with a quoted SOR price. SOR-linked rates follow year/zone changes; manual values remain user controlled until edited or switched back to SOR, with their entered context retained as provenance.

Manual pricing does not require claiming an exact SOR match. Show Manual as the rate origin; any existing SOR-match evidence remains separate. Switching a MoRTH resource mode does not affect SSR.

## SSR cost controls: annual default, choose SOR, or type a rate

Each SSR resource offers three modes:
1. SSR annual (default): take the resource rate from the selected SSR_Year, preserving annual source evidence and existing SSR calculation rules.
2. SOR linked: user chooses a SOR item and its applicable rate component/unit; quote it for the active year/zone. Existing confirmed links can be offered as choices, but do not silently replace the annual default.
3. Manual: type an adopted rate directly, with no SOR selection or quotation/approval form required.

Typing the rate selects Manual. Choose SOR selects SOR linked. Use SSR rate restores the selected-year annual rate. Save all mode/value/selection state under the SSR resource namespace. Ordinary Sync never overwrites a manual value or discards an explicit SOR mode selection.

An SSR adopted-cost edit automatically recalculates bound SSR DATA rows, active add-ons, native abstracts and estimate totals. Preserve their own quantities, source amounts as evidence, conversion factors and rounding. It never changes a MoRTH resource or usage, even if the same SOR item is selected in both groups.

## Default selections

Apply these defaults to MoRTH SOR alternatives only, once when a shared resource enters the project, then persist the chosen option:
1. Preserve an existing user selection.
2. Use an explicitly named/recorded Medium option when the offered alternatives have that meaning.
3. Otherwise use the first eligible recorded SOR option in the displayed source order.

Use ordered sor_refs, allowed_values, source_grade_options or approved-link arrays. A JSONB object's alphabetical key order is not its original source order: the adapter must produce and persist an explicit ordered options array when only cases exist.

Defaulting does not claim specification approval. The chosen item is visibly marked Default, with Maybe or Review Required where the match evidence requires it. Do not force a checkout questionnaire just to obtain a starting cost.

Do not choose a cheaper rate, a median price or an arbitrary capacity as a substitute for Medium. A branch representing confirmed_no_charge is not a SOR-item candidate and must not become the default paid-water rate merely because its key sorts first.

MoRTH Small/Medium/Large analysis category remains separate from ingredient choices and geographic pricing zone. Medium can be the initial project-size choice where appropriate, while the selected SOR alternative follows its own options.

## Match-status rules

Match status belongs to the resource/use evidence and selected candidate, not just to the price lookup's success or an approved string.

| Evidence | Initial presentation |
| --- | --- |
| Direct description/specification/capacity match, correct unit and charging component, no contrary scope evidence | Correct |
| Same resource repeated with the same verified binding | Retain its original match status; deduplicating repeats does not itself make a match uncertain |
| Role equivalent, generic family, unconfirmed type, merged by assumption, candidate chosen as a starting approximation | Maybe |
| Empirical conversion or user-authorised capacity proxy | Maybe, with factor/proxy reason visible |
| Candidate-only, mock, unconfirmed/rejected evidence, conflicting targets or undefined conversion | Review Required |
| Missing quote | Missing price shown separately; does not change an otherwise Correct physical identity into Maybe |
| Manual adopted price | Price origin becomes User rate; physical match confidence stays separate |

An analysis can have an available calculated starting rate and still show Maybe/Review Required inputs. Summarise its active resource confidence, not every unused alternative. An unsupported expression remains unsupported even if its ingredients have numeric prices.

Do not upgrade a candidate-only mapping to Correct because its SOR rate exists. Do not treat exact historical-source identity as proof of exact equivalence to a different SOR definition.

## Shared resource and adoption model

Keep three distinct concepts:

1. ResourceDefinition: the physical/service requirement, its specification, original labels, cost component and evidence.
2. ResourceAdoption: the source-scoped price provider: MoRTH uses SOR-linked or Manual; SSR uses SSR annual, SOR-linked or Manual.
3. ResourceUsage: the exact MoRTH/SSR recipe, section, add-on/alternative, quantity expression and conversion/basis using it.

A safe resource group key MUST start with ownerSource (MORTH or SSR), then include kind, specification/capacity/grade, unit/basis, hire/fuel/crew/service scope and resolved identity. Do not group by description alone, by a raw MoRTH resource key alone, or solely because two resources happen to have equal prices.

Resolve approved annual SOR identity revisions before identifying duplicate rate sources. Preserve the requested identity and its actual selected-year resolution.

MoRTH and SSR resources are always separate records and separate visual groups. Identical descriptions, identical SOR selections and identical numeric rates never establish a cross-source group. Persisted override keys, where-used indexes, grouping/deduplication, native request identities and invalidation keys must all include ownerSource.

Each use keeps its unit, quantity basis and recorded conversion/rounding. Do not make the existence of a SOR link a reason to reprice an otherwise valid SSR annual row.

Persist project resource adoptions and their versions in the estimate file. Editing Individual Costs changes that project, not the authoritative public SOR/MoRTH/SSR source tables or unrelated estimates. A project selection made before a resource is used also applies when it is used later.

## Rates and year changes

MoRTH source data supplies quantities, methods and formula/boundary rules. SOR links supply rates for the active financial year and zone.

Reuse:
- sor_resource_quote for selected-year SOR resources and supported components/units;
- morth_pricing_snapshot as the existing batched SOR-quote provider;
- SSR_Year / ssr_year rates and addon_rates for all ordinary SSR individual prices, preserving published source values and annual scope.

SSR annual mode uses SSR_Year. If the user explicitly selects SOR mode, use sor_resource_quote with its chosen source/component/unit, or ssr_linked_resource_quote for an existing confirmed per-use binding whose multiplier/rounding must be retained. Manual mode uses the saved numeric rate. Neither optional mode changes the default annual source record.

Do not infer a MoRTH finished-work rate from cost_ready or from a source benchmark. Keep analysis_resource historical values as source evidence unless the project explicitly adopts a separately identified provisional/manual cost. SOR is the normal rate source.

A provisional candidate selected from recorded SOR alternatives can be quoted and used for the starting calculation without changing the source mapping evidence to approved. Preserve any unresolved project/specification requirements as match/adoption status, not as a fabricated approval boolean.

On year/zone change:
- preserve the user's resource selection;
- obtain the selected year's SOR quote through the existing approved resolver;
- recompute converted rates and dependency costs;
- refresh SOR-linked statuses; preserve manually entered values and their original context without silently replacing them;
- represent an unavailable rate as unresolved, not as another year's price.

## Automatic propagation

Maintain an index ownerSource + Resource/RateSource → active usage rows → owning analyses → dependent analyses → estimate usages. Never traverse from a resource adoption in one source into the other source.

On a saved Individual Costs edit:
1. Persist the adoption change and increment its version.
2. Resolve only new/changed source prices.
3. Recompute affected native resource costs and dependency nodes in order.
4. Update every bound occurrence, active add-on, dependent analysis and working estimate total WITHIN the edited ownerSource. MoRTH edits affect MoRTH; SSR edits affect SSR. SSR annual mode retains SSR_Year pricing, while explicit SOR/Manual modes use their selected adopted rates.
5. Refresh DATA and output summaries from the same result. Do not require a separate manual Sync to make the edit take effect.

Work is bounded by affected usages/dependency edges and distinct quotes, rather than rescanning and repricing the entire catalogue. Coalesce input changes, discard results from an old project/year/zone/version and never show an old total as the new adopted cost while calculation is pending.

Changes affect rates/choices, not each analysis's quantity, productivity, batch output or independent method. If quantities must change for an equipment substitution, keep that as an explicit source/project quantity decision.

## SSR integration from the first release

Include SSR Materials, Machinery and Labour as separate source groups in all three pages. Initialise SSR annual mode from the exact selected-year SSR_Year rates/addon_rates. Expose Manual rate entry, Choose SOR and Use SSR rate directly in this simple view. Resolve annual identity carefully; structural NIL/headings do not become resources.

Preserve published annual amounts/totals as source evidence. An explicit SSR Manual/SOR adoption supersedes the corresponding effective rate and recomputes its project DATA/abstract using SSR's existing quantities, grouping rules and rounding. Do not retain an old published total as the effective result after adopting a changed resource rate.

Preserve SSR Lead policy and source tables. Default rates continue to follow SSR annual-year behaviour. SOR mode follows selected-year/zone SOR resolution; Manual mode remains user controlled. MoRTH and SSR adoptions never merge or update each other.

## Native DATA and exports

Extend the existing native Rust calculator for MoRTH cost rules and for shared effective costs. Use one native result for DATA, working estimate totals, PDF/Typst and Excel.

Return:
- per-resource source/adopted rate, unit and conversion;
- calculated line amounts and trace;
- material/machinery/labour totals;
- named allowances, overhead and contractor profit separately;
- batch/output basis and unit rate;
- match confidence and missing price/input state.

A known provisional numeric starting cost is allowed to propagate with its status visible. Truly absent prices/quantities remain unresolved and cannot be silently included as zero. Keep the status distinction in exports as well.

## Implementation order — revised

1. Individual resource contracts, full compact inventory and scoped grouping, for BOTH MoRTH and SSR.
2. DATA → Individual Costs with Materials/Machinery/Labour pages, recorded-candidate defaults, status/reason labels, where-used index and persisted project adoptions.
3. Native source-scoped adopted-cost propagation for both sources, preserving SSR calculation rules; one complete MoRTH foundation analysis through DATA/estimate/exports.
4. MoRTH Full catalogue + selection backed by that shared cost layer; then the additional formula/dependency adapters.
5. Year/zone changes, all conditional resource variants, material-rate integration, Lead scope reconciliation and template Lite.
6. Special analyses/credits/allocation outputs and catalogue-wide status reconciliation.

This resource layer precedes broad MoRTH catalogue rollout so the catalogue never ships with isolated, copied starting prices that cannot update together.

## Acceptance checks

- All three pages contain both MoRTH and SSR resources, including supported add-on and equipment-alternative rows.
- Compatible repeated resources are grouped only within their own source. MoRTH and SSR never merge, including identical resources selecting the same SOR item. Mortar sand and concrete sand remain separate.
- MoRTH Medium/first defaults are deterministic, persisted and labelled; switching candidates does not imply exact approval. SSR has no such default-selection step.
- Correct, Maybe and Review Required reflect actual mapping evidence. Source cost_ready=false and numeric availability do not determine those badges.
- A MoRTH cost change updates only MoRTH uses; an SSR cost change updates only SSR uses. Both update their bound DATA and working totals automatically.
- SSR defaults to SSR_Year. Both Manual and Choose SOR work as explicit options, persist through ordinary Sync, recalculate bound SSR uses, and support Use SSR rate to restore the annual default. Published evidence remains intact.
- Unused alternatives, NIL/headings, derived subanalysis totals and split hire/fuel/crew cannot double-count costs.
- Pricing year/zone changes refresh SOR-linked costs while preserving choices. Manual mode remains user controlled and ordinary Sync never overwrites its entered rate.
- Directly typing a MoRTH resource rate works without a SOR choice or extra quotation/approval form; switching back to SOR restores linked pricing and updates the same bound uses.
- Project source records and unrelated estimates stay unchanged.
- Screen DATA, estimate totals and PDF/Excel use the same native results and confidence state.

This phase records the audit and corrected design. It has not yet created the Individual Costs UI or a MoRTH calculation engine.
