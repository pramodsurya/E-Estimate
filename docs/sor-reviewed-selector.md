# Reviewed SOR selector

The Add Item SOR column defaults to the reviewed annual dataset. Basic rates and the legacy catalogue remain accessible. SSR selection and its existing annual add-on review are unchanged.

The frontend uses the five published RPCs:

| RPC | Parameters |
| --- | --- |
| `list_sor_reviewed_catalogues` | `p_sor_year` |
| `search_sor_reviewed_items` | `p_sor_year`, `p_query`, `p_catalogue_code`, `p_serial_number`, `p_limit`, `p_offset` |
| `get_sor_reviewed_item` | `p_occurrence_id` |
| `get_sor_reviewed_history` | `p_item_id` |
| `calculate_sor_reviewed_selection` | `p_occurrence_id`, `p_quantity`, `p_rule_ids` |

Search interprets `R&B Sl. No. 230` as a table-scoped annual serial reference. Browsing follows edition-specific schedule, section, subsection, source parent and specification-group nodes. Only retained levels are shown. Children are fetched in pages of 50; there is no full-catalogue download or parent-phrase search loop. Search results retain the printed reference and breadcrumb, and “Show in section” opens the correct page and highlights the observation. Switching between browsing, searching and the detail panel preserves the selected quantity and extras.

Only calculation-ready percentage rules with an explicit published-rate base, matching year and annual observation are interactive. The current endpoint supports one selected rule; selecting another replaces it. Notes without verified rules remain informational. Missing, deleted, conflicting and analysis-dependent observations cannot be added through direct costing.

The selector uses the project SOR year automatically; there is no separate year dropdown. Changing the project year follows the stable Recipe ID through history, fetches the actual annual observation and clears extras. Missing or ambiguous observations clear the selection. Other editions can be compared in the expandable rate-history table; insertion always uses the project edition.

Insertion stores the Recipe, observation, release, edition, quantity, tariff basis, rule IDs, specification evidence and server calculation under `sorCatalogue.reviewed`. A matching DATA recipe is saved immediately, and the quantity is written to an editable final cell. Shared sheets append separate quantity rows without replacing existing measurements. Base and extra-bearing selections have distinct DATA keys.

Insertion evidence stays immutable. Explicit DATA Sync refreshes current annual observations and revalidates extras against verified annual rule scope. Refreshed calculation evidence travels with the refreshed recipe; it does not overwrite the insertion evidence. Missing annual observations or invalid extras fail the refresh rather than retaining a rate under a new year.

Tariff rates are normalized only by their explicit basis quantity when entering the existing estimate engine. A ₹104/1,000-litre tariff retains ₹0.104/litre internally; the native calculator preserves that precision before estimate quantities are applied. The reviewed tariff and original calculation remain expandable in DATA.

## Verification

`npm run test:sor-reviewed` covers the published RPC contract, rule scope, costing gates, annual identity, refresh, snapshot persistence, tariff precision, and separate/shared quantity cells. Recorded fixtures came from read-only live RPC calls on 9 October 2026; source geometry was omitted.

Live Supabase verification confirmed 23,732 Recipes and 43,543 observations. The 2026–27 tray returns ₹2,058 base + ₹617.40 cover = ₹2,675.40/metre. The server rejects that rule on ladder trays and rejects conflicting observations. The 2025–26 ₹104/1,000-litre observation returns ₹156 for 1,500 litres.

Chromium checks with recorded RPC fixtures verified user interactions, stale quantity-response rejection, evidence, edition changes, missing observations, blocked costing, cooler units and project-year revalidation. TypeScript, lint, production build and the relevant legacy regression suites pass. The repository-wide React Compiler ratchet fails at 71 skipped functions on both the unchanged Git baseline and this implementation; its configured threshold is 63.

## Book navigation backend

The navigation projection and RPCs are published in Supabase. Original reviewed observations, Recipes, corrections, rules and estimate snapshots remain unchanged. Public access is SELECT-only, with RLS limited to the active release. Rebuilding the index is not callable by anonymous or authenticated users.

| API | Purpose |
| --- | --- |
| `browse_sor_reviewed_children` | Fetch up to 100 children for a year and parent; default 50. Mixed source nodes and priced observations share one ordered page. An optional observation anchor selects the page containing a search result. |
| `get_sor_reviewed_locations` | Return ancestor nodes for up to 100 observations in one request. |
| `sor_reviewed_navigation_node` | SELECT one edition-specific table node when the schedule picker changes. |

The original five RPCs retain their signatures. `search_sor_reviewed_items` now orders by the same physical source position as browsing and searches retained headings as well as descriptions, references and schedule names. Deleted/not-applicable observations are removed before paging; missing/conflicting/analysis-dependent observations remain visible and require the original costing gates.

The explicit node contract includes `node_id`, `parent_node_id`, `sor_year`, catalogue/table, node type, printed reference, display title, `source_order`, available variant count, `has_children` and compact evidence. Locations return the complete node contract. Variant responses retain Recipe and occurrence identities, parent, source order, reviewed wording, features, rate, unit, basis and costing status. The project zone is passed to catalogue, browse and search RPCs. Zonal observations are filtered before counts and pagination; universal rates remain available. Zone columns are inherited project context and do not appear as variant choices or labels. Other matrix-column labels still distinguish actual specification variants. When project settings change, the selector resolves the matching zone through the exact retained annual source-row key before following its Recipe across years; ambiguous or missing observations clear the selection. Saved estimate snapshots remain unchanged until an explicit rate refresh.

Order uses PDF page, physical table and row positions, then natural serial/column-reference tokens. Cells supply row/table positions for matrix schedules. The numeric key puts 6.2 before 6.10 and preserves a/b/c suffix order. IDs include release, edition and exact source ancestry; a family additionally uses its retained parent page and printed parent row. Similar labels are never merged across parents.

The basic-resource screen retains Material/Labour/Machinery for existing SSR resources. Its Electrical/Civil/Plumbing links open the reviewed book navigation. The main item selector, SOR source picker and exported SOR selection column all use the same navigation component.

### Source coverage and remaining extraction gaps

| Edition | Normally visible observations | Available schedules |
| --- | ---: | ---: |
| 2023–24 | 10,329 | 47 |
| 2024–25 | 10,166 | 41 |
| 2025–26 | 11,179 | 46 |
| 2026–27 | 11,833 | 47 |

All normally visible observations are indexed, including blocked rates. The 36 excluded observations across editions are deleted/not-applicable rows or unpriced headings.

Electrical uses `source_context.section_scope`, `parent_description`, printed parent row and `variant_group`. Civil and Plumbing use their retained annual heading paths. Existing `section_name`/`subsection_name` metadata is projected only when it exactly agrees with that edition’s retained heading. A current metadata label never supplies an unrecorded historical heading. Matrix `header_rows` are column headers and are deliberately not treated as book sections.

For 2026–27, Plumbing has verified section/subsection paths for all 959 observations. Civil has verified section headings for all 1,458 normally visible observations, but 1,440 lack a retained subsection path. The reviewed payloads for centering/scaffolding, mechanical lift, Public Health matrix schedules and R&B work/machinery do not expose verified section/subsection fields. These tables expose their published items directly, preserving complete descriptions, column roles and source order. R&B labour retains semi-skilled/unskilled sections; 135 observations lack a retained skill heading.

The original extractor and source PDFs referenced by the user are in a Windows path and are unavailable in this workspace. They have not been modified. Completing those missing subsection/caption levels requires a source-backed extractor update and republishing; no headings were invented from codes, fragments, similar descriptions, notes or table-column headers. The projection already accepts verified `source_context.section_name` and `subsection_name` when supplied by that update.

Release publishers must invoke `rebuild_sor_reviewed_navigation(release_id)` in the publication transaction, after observations are loaded and before activating the release. The browser reports an unpublished index rather than falling back to another edition.

### Navigation verification

`npm run test:sor-navigation` uses live RPC captures to verify source hierarchy, distinct cable specifications, cross-page order, VRF capacities, price units/bases, location mapping, anchored navigation and cancellation. `supabase/tests/reviewed_sor_navigation.sql` passes against the live database under the anonymous role and verifies total coverage, node counts, hidden rows, pagination, year isolation, repeated labels, actual Plumbing subsections, rejection of matrix column headings, anchored paging, read-only grants and tray rule scope.

Chromium checks with captured live responses pass for cable navigation, 6/8/10 HP order, search-to-section highlighting, the server calculation snapshot, preserving quantity/extras when browsing and resetting extras on year change. Browser-to-Supabase traffic is blocked by this cloud workspace’s host policy, so browser tests use connector-captured responses; live SQL tests use the Supabase connector. TypeScript, lint, production renderer build and the reviewed/legacy pricing and persistence regression suites pass.
