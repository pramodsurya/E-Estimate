# Supabase functions relevant to the selector redesign

Inspected 23 October 2026 in project hqddsxnykndgcmxwqwmn. Read-only inspection and calls; no function, data or permission changes.

## Inventory scope

Inventoried 79 application functions/overloads in public, excluding extension-owned functions. Of these, 41 names begin with sor_ and 22 are trigger-returning functions. One additional custom function in legacy_sor_archive was inventoried separately. Captured all 79 public function definitions, reviewed the relevant pricing, rule, identity and integrity contracts, and checked live trigger attachments. This is a functional integration investigation, not a complete security or performance audit of every function.

The source snapshot is sor-supabase-function-contracts-2026-10-23.json. It includes signatures, comments, execution privileges, source definitions, trigger bindings and live read-only check results.

## Read APIs to reuse

| Function | Existing responsibility | Selector implication |
| --- | --- | --- |
| sor_resolve_recipe_revision(code, year) | Current approved forward/backward recipe lineage, including splits and review boundaries | Never match replacements by description or choose the first code from a split |
| sor_resolve_recipe_year(code, year) | Revision resolution plus explicitly recorded historical fallback where no annual row exists | Retain requested identity and audit paths; respect held/blank/other-zone annual rows |
| sor_resource_quote(code, year, zone, component, unit) | Selected-year tariff, review status, zone, cost component and supported unit conversion | Shared base-rate source for Lite, Full and rate refresh; check status rather than only requires_review |
| sor_unit_measure(unit) | Parses supported dimensions and printed quantity sizes | Preserve tariff bases such as 1000 litres and distinguish mass, volume, count and time bases |
| sor_unit_rate_factor(source, requested) | Rate multiplier only for recognized compatible dimensions, or identical unit strings | Do not guess conversions between different bases |
| ssr_resolve_recipe_revision(code, year) | SSR definition lineage with review boundaries | Use alongside the SOR resolver when the shared picker switches to SSR |
| ssr_resolve_recipe_year(code, year) | SSR lineage plus exact-year annual recipe data | Do not keep using the old static SSR recipe when its annual binding changes |
| ssr_linked_resource_quote(code, scope, line_index, year, zone) | Resolves an SSR resource line to its reviewed SOR identity and quotes it; handles explicit rate-basis multipliers and rounding | Refresh resource rates without description guessing or losing the reviewed SSR-to-SOR quantity basis; line index is zero-based |
| ssr_resolve_resource_identity(...) and ssr_master_resource_identity(...) | Explicit SOR references and reviewed aliases/resource keys; rejects retired stores in master identity creation | Retain stored identity evidence; identity resolution alone is not a price |
| morth_pricing_snapshot(year, zone, requests, resource_codes) | Read-only batch SOR quotes via sor_resource_quote and optional analysis-resource records | Already useful for a possible batch adapter; its name does not change the SOR quote semantics |

The existing batch function accepts only 2025-26 or 2026-27, at most 256 quote requests and 1000 resource codes, and a fixed supported-component list. It currently passes null for the requested unit. These restrictions matter: it is not an unrestricted generic SOR batch contract and cannot silently substitute for per-request unit conversion. Reuse it only where its actual contract fits, or prepare a separately reviewed extension later.

sor_resolve_recipe_revision_v1 remains available as an older contract. New integration should follow the current resolver called by sor_resource_quote, not independently choose the v1 implementation.

## Variant and add-on contracts

sor_recipe_relationships_valid is an attached trigger, not a browsing RPC. Its source confirms:

- An explicit ROW variant relationship contains main_recipe_code, axis and value; the main is an actual row whose family/axis agrees. Use those relationships to build the Variant screen.
- Linked recipe_codes for add-ons must reference existing adjustment recipes.
- Inline adjustment rules carry applies_to, when, operation, requires, component and basis.
- Centering, porcelain, electrical and Public Health rules have distinct structures and validation paths. They cannot be rendered or calculated as one generic percentage checkbox.

| Validator | What it checks | Implication |
| --- | --- | --- |
| sor_centering_recipe_addon_valid | Exact height-rule fields, threshold, increment, percentage, partial increment, non-compounding, component rounding and review evidence | Keep entered unsupported height, increment policy and approved calculation base; the validator does not evaluate an entered height |
| sor_centering_details_valid | H + L + approved rounding adjustment equals the stored centering total; costing review states | Show component evidence without treating H and L as independent variant choices |
| sor_electrical_recipe_rules_valid | percentage, percentage_each, fixed_each and lift_maintenance; conditions, bases, exclusivity and review_only | Each operation needs its matching input/price adapter; scheduled rate and finished-cost DATA are different bases |
| sor_plumbing_porcelain_rule_valid | Coloured porcelain adjustment on white_porcelain_component, explicitly excluding fittings | Do not apply a colour extra to the complete fitted-item total |
| sor_public_health_rules_valid | add/multiply/replace/linked_item rules and structured expressions using inputs/annual values | Preserve required inputs and references; validated expression syntax is not its evaluated result |
| sor_public_health_details_valid | Published maintenance totals or labour/implements component sums, with explicit blocked arithmetic-review exceptions | Retain a source discrepancy and its blocked status rather than silently correcting it |
| sor_single_machinery_details_valid / sor_machinery_details_valid | Component totals and nonnegative scalar/zoned machinery rate shapes | Keep hire/fuel/crew cost components and zone context |
| sor_lead_rules_v2_valid | Lead/lift/loading/unloading conditions, referenced tariff terms and explicit statuses | Read the rule version and applicability; this validator does not calculate lead charges |

A boolean true from a validator means the stored structure satisfies its contract. It does not mean user inputs are complete, the source is approved for direct costing, or an adjusted amount has been calculated. Some validators deliberately accept explicit source-clarification records as valid blocked evidence.

## Year, references and immutability

Confirmed enabled trigger bindings on SOR_Recipie, SOR_Year, SOR_Lead_Rule, SSR_Recipe and SSR_Year. Relevant functions include:

- sor_recipie_prevent_definition_update: technical definitions and fixed item codes remain immutable; a changed technical definition needs a new recipe code. Its allowed metadata/relationship fields are separately checked.
- sor_recipe_revision_valid / sor_recipe_revision_chain_valid: revision structure and lineage guards.
- sor_year_reference_valid: fixed R&B item references and annual lead rule must match material, year and effective date.
- sor_electrical_year_review_valid: annual definition/unit/source-price binding and unchanged rule snapshot; formula entries have no invented scalar tariff.
- sor_public_health_year_valid: exact recipe scope, units, pricing status, source evidence, component print fields and annual lead binding.
- sor_shared_lead_validate / sor_shared_lead_protect_revision: existing approved tariff references and immutable shared lead revisions.
- ssr_annual_recipe_binding_valid and SSR identity/link triggers: prevent annual recipes and resource identities drifting from the reviewed definitions.

These run on writes. The picker should use their persisted, validated data and read APIs; it should not call trigger functions as if they were interactive selection endpoints.

## Other useful functions and scope boundaries

- get_excavation_extra(year, code) and fn_trial_pit_extra(depth, year) are year-specific lookup functions. Use the year-specific overload: fn_trial_pit_extra(depth) chooses the latest edition in excavation_extra, irrespective of the project's selected year.
- fn_allowance_at and fn_flyash_required are geographic requirement lookups; fn_gst_rate uses recipient, earthwork flag and date. They belong to their respective estimating contexts rather than the SOR category tree.
- sor_morth_analysis_options(code, year) resolves the SOR definition and returns recorded same-year MoRTH research candidates, full analysis data, requirements and review evidence. It explicitly returns null rate, cost_ready=false and can_auto_price=false. A candidate is not approved rate equivalence. MoRTH authoring remains outside the current SOR phase.
- The inspected public custom-function inventory contains no active SOR Part/tree/search RPC and no general runtime evaluator for every inline SOR add-on expression. Source metadata can support a new browsing adapter, but existing validators do not fill those runtime gaps.
- The source search found no application references to the new unit, linked-resource quote, batch snapshot, analysis-option or listed rule-validator function names. The prior year-resolution investigation also found no calls to the new SOR resolvers/quote APIs in this checkout. Integration work is still needed.

## Live read-only checks

- tonne → kg rate factor = 0.001.
- 1000 litres → litre rate factor = 0.001.
- Sqm → sqft rate factor = 0.09290304.
- day → hour returns null; no implicit work-hours-per-day conversion.
- Actual stored centering-height, electrical, porcelain-colour and Public Health rule samples each passed their corresponding validator.
- Batch quote check in 2026-27/zone_3 returned the automatic Rod Bender revision at INR 845/day and HDPE OD 32 mm PN10 / SDR13.6 at INR 52/m.
- Existing forward/backward, missing-year and review-required quote checks are recorded separately in sor-year-resolution-check-2026-10-23.json.

No write-only helper, trigger, rebuild or publishing function was invoked for this investigation.

## Confirmed Lite navigation

Lite is used only inside Templates. Open at the current item's Variants, with its complete resolved breadcrumb context loaded. Back/breadcrumb navigation can reach Item or matrix choice → Item family → Subsection → Section → Heading → Part. The user can select a different item, proceed forward to its Variants, then Apply.

Entry point and navigation range are different: starting at Variants does not restrict the user to that variant family. Preserve the currently applied template item during browsing/Cancel. On a replacement choice, clear incompatible dependent inputs and revalidate the template quantity basis before committing on Apply. Full keeps the forward Part-to-Variant hierarchy and its multi-item basket/storage workflow.
