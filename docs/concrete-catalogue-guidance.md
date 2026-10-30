# Concrete catalogue selection guidance

Implemented and deployed on 26 October 2026. Coverage: 359 SSR catalogue items and 903 MoRTH source variants, including 24 longer MoRTH descriptions.

## User behaviour

- Add DATA, the shared SSR template picker and the MoRTH picker show the code above a wrapping work title, followed by key specifications. Generic purpose sentences are omitted; extra information such as stone dressing, mortar proportions, included formwork and production-only scope remains. Examples include `M15 · Coping slab`, `12 mm cement plaster · CM 1:4` and first/second-sort coursed rubble masonry. Titles do not use ellipses.
- SSR categories display full work names. Default browsing and filtered results use natural numeric code order: `1-1, 1-2, 1-10, 2-1`. The Add DATA toolbar can reverse this order. Description relevance and semantic scores no longer rearrange these catalogue lists; exact/specification search still determines matches.
- `Compare` selects up to three choices without adding them to the estimate. A table highlights differing specifications, including mortar, thickness, stone sort, concrete grade and construction method. Where structured facts do not capture a difference, verbatim differing source passages remain available.
- Code hover/focus opens a coloured card showing the complete published description first. Specifications and work scope stay collapsed under `More details`; expanding repositions the card to keep it within the viewport. The card is portalled outside scrollable pickers, can be scrolled and closes with Escape. Compact `Details` provides the same information for touch, also with description first. Grade strength is explained separately from work application. General first/second-sort terminology links to the CPWD source; it does not substitute CPWD tolerances for the governing SSR/project specification.
- Source-supported details include construction method, aggregate, dimensions, height, cement content stated in SSR, initial carriage/lift, reinforcement exclusions, source formwork percentages and SSR's separate fuel/crew accounting where those rows exist.
- MoRTH production appendices are explicitly labelled as production sub-analyses. Their details distinguish them from completed parent work.
- Search uses descriptions, summaries, physical facts and aliases such as shuttering/formwork/centering. Grades, mortar ratios and first/second sort constrain the physical choice, rather than matching a different option mentioned in explanatory text. A plaster search returns four plaster choices, not masonry pointing. MoRTH supports multiple query words, pagination and the selected project-size source code.

## Backend and source integrity

SSR technical recipes remain immutable. `catalogue_item_guidance(source, code, guidance)` is a separate table. It has RLS, public catalogue SELECT access for anon/authenticated clients and no client INSERT/UPDATE permissions. Service-maintained triggers refresh annotations when source records are inserted or applicable source definitions change. Invoker functions use a fixed search path.

`ssr_catalogue_items` is a new invoker view joining published SSR descriptions with matching guidance. It checks the description hash before exposing annotations. The existing technical `ssr_item` view is unchanged, and renderer selections retain `category: ssr_item`.

`morth_picker_browse` joins guidance to the selected category's physical source code. It preserves the existing catalogue hierarchy and source-code alternatives. Its search includes longer descriptions, but grade constraints use the item's explicit grade metadata.

Guidance is derived deterministically from published descriptions and source recipe scope, with source code, description hash and available printed-page references. Unknown applications fall back to the source wording. Unknown cost inclusions are not invented. This feature does not change annual prices, recipe quantities, material Lead, markup calculations or the previously identified machinery pricing bases.

Reviewed edge cases: gate text `0.50 M 16 Elements` is not M16 concrete; solid and ornamental parapets are not re-labelled as coping just because they include coping slabs; precast slab dimensions, tunnel applications, manual/pump placement and transit-mixer variants remain distinct.

Migrations, in order:

1. `20261026093842_concrete_catalogue_guidance.sql`: separate catalogue table, SSR read view, source helpers/hooks and MoRTH browse/search.
2. `20261026094140_refine_concrete_catalogue_scope.sql`: primary-work precedence, transit-mixer distinctions and evidence from SSR fuel/crew rows.
3. `20261026095013_preserve_catalogue_source_details.sql`: complete longer MoRTH descriptions and explicit grade constraints independent of those descriptions.
4. `20261026132927_catalogue_choice_clarity.sql`: work titles, purposes and choice facts across all SSR families; exact mortar search.
5. `20261026133513_preserve_choice_distinctions.sql`: retain grade formatting, dimensions, thickness, material and maintenance distinctions.
6. `20261026134446_clarify_existing_work_and_help_text.sql`: preserve repair/resetting operations and shorten masonry explanations.

Local filenames match the versions recorded by the connected Supabase migration service.

The SSR catalogue cache version advances to v8 so older saved catalogue data does not retain description ordering. Persisted project item identities and published descriptions keep their existing format. The ordering/layout/hover revision requires no database migration.

## Verification

- `npm run test:master-search`: exact grade/dimension constraints, scope aliases, semantic re-ranking and descriptive-detail grade isolation.
- `npm run test:catalogue-guidance:live`: anonymous API through the real frontend fetcher/search modules; all 1262 records validate, all 24 longer MoRTH descriptions are present, source hashes and original descriptions survive, source identities remain correct, project-size selection/pagination/detail calls work.
- `supabase/tests/concrete_catalogue_guidance.sql`: source integrity, read-only client grants, future unknown-work fallback, false-grade rejection and real MoRTH source-trigger regeneration. Test mutations are inside a transaction ending in ROLLBACK.
- `npm run test:sor-selector` and `npm run test:data-variants`: existing selection and variant behaviour passes.
- Renderer TypeScript, targeted ESLint, `git diff --check` and the final production renderer build pass. Existing large-chunk/dynamic-import build warnings remain.
- Playwright exercised the actual selectors against the live backend in a temporary test page: coping search, hover title, source disclosures, Enter-key toggle, Add DATA selection, template variant review/application, medium/small MoRTH categories and multi-result dam search through completed AI ranking. No render-loop or application errors remain; the temporary page's only console error was a missing favicon. Screenshots were visually inspected; no horizontal overflow or nested buttons were found.
- The ordering revision was checked against all 22 Tunnel items, filtered M10 results (including DAW 2-5 before 2-13), descending order, full category names, keyboard and pointer hover, viewport bounds, Compare followed by item selection, and the shared template variant flow. Hover needs deliberate pointer movement, so list reflow cannot reopen it beneath a stationary pointer. Screenshots are in `output/playwright/catalogue-code-order.png` and `catalogue-code-hover.png`.
- Supabase advisor findings match the pre-change baseline; no new security findings were introduced.

The temporary browser test page/server are removed after verification. No installer or packaged desktop application is rebuilt by this change; the production renderer is built and ready for the normal application build workflow.
