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

The final MoRTH rate is the complete native DATA amount plus applied Lead, divided
by the output quantity and rounded once to two decimals. DATA, item/component
totals, Typst and the Excel formula/cache use this convention. Missing Lead blocks
final rates and parent DATA exports. Shared appendix sheets remain base analyses;
their Lead is accounted for through the parent's expanded material inventory.

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

No live database migration or desktop deployment is part of this change. Annual
tariffs continue through the existing quotation path. Linux checks generate the
Typst PDF and Excel payload; Windows Excel COM/recalculation checks require the
desktop environment.
