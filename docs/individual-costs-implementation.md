# Individual Costs and MoRTH catalogue

Implemented on 24 October 2026.

## Entry points

- Components → Add Item → MoRTH catalogue: Part / Heading navigation, scoped search, project size and `+` selection. Existing separate/shared sheet storage is reused.
- Templates → Change Item → MoRTH: a single selection with access back to the catalogue.
- DATA → MoRTH DATA: source ingredients, project inputs and native starting-cost calculation.
- DATA → Individual Costs → Materials / Machinery / Labour: only resources used by DATA placed in the current project, with separate SSR and MoRTH groups. Unused master rows, library definitions and removed DATA are excluded. Repeated occurrences and aliases of the same resource appear once; variants, selected additions and nested MoRTH inputs follow the effective project recipes. The compact table opens rate editing and project locations on demand.

## Pricing

SSR keeps the selected SSR_Year rate by default. Existing project Cement/Steel settings remain visible and in force until an Individual Costs adoption replaces them. MoRTH selects an explicitly labelled Medium SOR alternative when present, otherwise the first recorded linked alternative. Either source supports manual rates, SOR selection and restoring its own default. Zero is an explicit valid manual rate; absent prices remain missing.

Settings are saved in the project file under `meta.individualCosts`. Resource identity includes the owning source, section, unit, binding and rate component/basis. SSR and MoRTH never share an adoption. Changes are staged until Apply, which recompiles the project; Discard leaves saved prices intact. Ordinary source refresh retains manual adoptions. Directly edited SSR DATA rates remain local locks.

Selected SOR prices use `sor_resource_quote` for the project year, zone, component and required unit. Its approved revision/fallback logic remains authoritative. SSR empirical basis conversions are retained when reusing the original binding.

MoRTH arithmetic runs in estimate-core. Overheads and contractor profit remain separate; dependency markups are excluded where specified. Scalar, parameter and affine quantities are supported. Missing inputs, unavailable dependencies and unsupported source expressions explicitly prevent a payable/exportable total. Special source formulae, including product yield allocations, still require review/adapters; historical source prices are never substituted as current prices.

## Catalogue performance

Navigation, grouped MoRTH resources and where-used records have indexed read projections, automatically refreshed after MoRTH source changes. Annual prices are quoted separately. Client caches deduplicate requests and limit retained pages. The measured Mate where-used query dropped from approximately 12.5 seconds to 98 milliseconds.

The project Individual Costs page does not request the global catalogue or global usage RPC. It reuses current project recipes, fetches missing sources once per identity with four workers, filters/searches locally, and only quotes the visible project resources. Rate controls and linked alternatives load when a resource is opened. Matching resource identities and binding/name aliases form one group; applying a change updates the group and its aliases, including future matching project usages.

## Retired default DATA

The M25 wearing-coat default generator, dedicated resolver and UI controls are removed. Project loading and the running app remove only the old built-in marker/id, its placed usages, associated rate overrides and Lead applications. User-created DATA survives. New projects receive no replacement default row.

## Validation

- Live public catalogue/resource RPCs for all three sections in both source groups; SQL/client identity parity.
- Live MoRTH foundation → SOR ingredient quotes → native starting rate (₹306.03/cum), including grouped manual changes.
- Source isolation, SSR defaults, explicit zero, year/zone pricing, restore defaults, local locks and confidence tests.
- Browser checks for tree navigation, `+`, DATA preview, manual Apply, SOR picker, restore, SSR separation, Discard and year changes.
- Native Excel workbook with its own MoRTH sheet and printed references; existing Excel/PDF export checks.
