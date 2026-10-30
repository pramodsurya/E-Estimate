# MoRTH material Lead implementation

Implemented on the cloud branch `codex/morth-material-lead`, based on checkpoint `6b1f760`.

MoRTH now publishes material Lead metadata to the existing Lead workspace. The
versioned `morth-material-lead-v1` costing basis excludes dedicated carriage before
native quantity/rate validation, direct totals and percentage calculations. The
original source rows remain in the recipe as evidence. Active DATA, project
Individual Costs and output omit the excluded rows.

The three audited tanker capacities and structural trailer retain their affine
fixed-operation quantities. Alternative capacities require revised fixed-operation
hours; old whole-cycle hours are not reused. Fixed pumping, placing, production,
loading and unloading rows remain. Material Lead handling is suppressed only for
scopes already represented by retained operations.

`morthLeadMaterials.ts` binds stable resource identities to material groups.
Physical quantities come from native computed lines. The inventory scales every
appendix usage by its dependency quantity and child output quantity, preserving
signs and explicit dependency unit factors. Shared definitions never deduplicate
consumption. The slab fixture produces 54 cum Sand, 108 cum Stone, 48.38 tonne
Cement and 82.352 kL Water per 120 cum parent basis.

Processed concrete, hot mix, precast and disposal retain separate material delivery
entries. Their source mass-distance coefficients provide tonnes where the source
unit supports that derivation. They require explicit material Lead rates; a steel
tariff is not used as a substitute merely because both use tonnes. Fixed carriage
without a reviewed physical quantity, missing conversions and unmatched replacement
materials remain pending. The implementation does not invent densities or one-unit
preview quantities. These unresolved source cases need reviewed source/mapping
updates before final output can be produced.

Base readiness and final readiness are separate. Every required material needs a
current application for that exact project usage, quantity and unit. Explicit
zero-cost applications can resolve zero-distance or included-delivery cases.
Changed route/source/pricing inputs, year, zone or material quantity invalidate
coverage. Global MoRTH resource rate edits leave usage-specific Lead routes intact.
SSR/SOR pricing and Lead policies remain independent.

Updated on 25 October 2026: Lead belongs to the analysis that consumes the material.
Cement, sand and coarse-aggregate Lead for the slab are calculated in Appendix
21.07, on its own 360 cum production basis. Nested water Lead belongs to Appendix
21.22. Direct compaction water and finished-concrete delivery remain in the slab
DATA. The native calculator propagates each updated appendix rate through the
existing dependency quantity, explicit unit multiplier and direct-cost boundary.
Its source allowance, overhead, profit and rounding rules remain authoritative.

Applications retain the parent item usage identity and add an explicit appendix
input path. Different component usages and repeated dependency edges can carry
different routes. Calculated appendices share an output sheet when their code,
unit and adopted rates agree, even when the Lead routes or analysis inputs differ.
Both the final and direct rates are compared because parent DATA may adopt either
rate and Excel links must preserve its native calculation. Different adopted rates
retain separate appendices. Derived Lead material rows
are removed before repricing, so Sync and repeated calculation cannot compound
charges. A pricing signature invalidates cached results after input changes.

DATA, item/component totals, Typst and Excel use the same native Lead-inclusive
recipe. Lead appears in an SSR-style Lead Additions section after the base
abstract, in whichever DATA or appendix owns that application. It is excluded
from that analysis's material subtotal and percentage bases. Its final amount
and adopted rate include the local Lead once. A parent using the appendix's
direct rate adopts (appendix direct cost + appendix local Lead) / output; a parent
using its final rate adopts the final Lead-inclusive rate. Direct DATA Lead stays
on the DATA, and appendix Lead is not repeated on its parent or by Project Excel.
Missing, stale or unmatched Lead remains visible in the editor. Print preview
and PDF output render the current calculated parent and appendix pages regardless
of Lead or input readiness; workflow reminders do not print. Rendering neither
marks Lead complete nor changes review/finalisation status. Valid applied Lead is
recalculated before the single-analysis preview, using the same native appendix
pricing path as DATA sheets. Actual calculation/compiler failures remain errors. Older
aggregate applications are flagged for explicit reapplication to their consuming
appendices; reapplication replaces the older aggregate scope.

Updated 28 October 2026: Output deduplication follows calculated code/rate identity,
not complete configuration identity. Ten DATA items with thirteen appendix
occurrences, seven of one code and four equal-rate occurrences among those seven,
produce ten appendix definitions when the remaining rates are distinct. The four
equal-rate occurrences reference one appendix in Typst and Excel; all thirteen
consumption edges remain in the parent calculations. CA-only Lead is also tested
while other material Leads are pending: its row stays inside the concrete appendix
and the parent DATA adopts that updated appendix rate, without a second addition.

Clarified 28 October 2026: An appendix is not required for every Lead application.
Direct and appendix applications keep their exact paths. Both use the shared SSR
Lead Additions UI and print fields: material/basis, quantity, rate, amount,
initial-lead deduction where applicable, base amount, Lead total and final rate.
Native tests verify local Lead does not acquire overhead or profit. The pricing
signature is versioned so previously cached material-subtotal pricing is rebuilt.
Concrete delivery remains the existing native machinery-distance calculation.

Apply km now recalculates locally without waiting for a full project/network Sync.
Item-scoped recipe overrides are resolved before component and shared overrides,
so an explicit 0 km persists on reopen and subsequent Sync. Zero produces zero
tonne-km and carriage amount; unloading hours remain separate. Regression coverage
round-trips the saved item override and checks snapshot compilation and isolation
from other usages of the same DATA.

Saved scoped applications can still carry quantities on the parent DATA basis.
The Apron case used 108 cum aggregate per 120 cum parent output on an explicit
path to a 360 cum appendix needing 324 cum. Pricing and Lead refresh now recognize
that exact parent/output/factor/source match and restore the appendix basis while
retaining the selected route and unit rate. Refresh supplies the corrected
application for normal project persistence. Manual edits, changed routes, annual
context mismatches and unrelated invalid quantities remain pending. DATA, appendix
readiness and output all use the same normalization, preventing a hidden Lead row
or a repeated recalculation after the basis is repaired.

Validation covers native arithmetic, strict nested/shared quantities, resource
exclusions, retained fixed work, alternative equipment hours, manual delivery
scope, annual context, changed routes, per-usage application isolation, project
scaling, rounding and export completeness. Existing SSR/SOR Lead, pipe Lead,
Individual Costs and MoRTH presentation regressions are also exercised.

Cloud validation passed: `npm test`, `npm run typecheck:web`,
`npm run typecheck:node`, `npm run build:renderer`, `npm run test:auto-update`,
`npm run test:individual-costs`, ESLint on the changed renderer files, and
`cargo test --manifest-path src-tauri/estimate-core/Cargo.toml` (21 core tests).
The test changes also keep the checkpoint's project-book import stub and annual
Lead Sync assertions aligned with the current production contracts.

No Supabase schema change, live database migration or desktop deployment is part
of this change. Appendix scope fields are stored with the existing project Lead
applications. Annual
tariffs continue through the existing quotation path. Linux checks generate the
Typst PDF and Excel payload; Windows Excel COM/recalculation checks require the
desktop environment.


Updated 27 October 2026: Concrete transport is an exception to carriage exclusion. Its original machinery formula is active again; Concrete delivery in Lead binds actual kilometres instead of adding an SOR tariff. Manual km on a consuming DATA/appendix takes priority, with a labelled 1 km default otherwise. See [the native transport method](concrete-delivery-starting-estimate.md). The discarded SOR concrete-delivery proxy and tonne/cum selector were deleted without an existing-project migration.
