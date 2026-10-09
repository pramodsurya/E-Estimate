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

Search interprets `R&B Sl. No. 230` as a table-scoped annual serial reference. Families are grouped by exact catalogue, table and published parent; individual priced observations retain their own identities and subgroup labels. Expanding a family fetches all its matching variants, including those beyond the current search page.

Only calculation-ready percentage rules with an explicit published-rate base, matching year and annual observation are interactive. The current endpoint supports one selected rule; selecting another replaces it. Notes without verified rules remain informational. Missing, deleted, conflicting and analysis-dependent observations cannot be added through direct costing.

Edition changes follow the stable Recipe ID through history, fetch the actual annual observation and clear extras. Missing or ambiguous observations clear the selection. Other editions can be compared; insertion uses the project edition.

Insertion stores the Recipe, observation, release, edition, quantity, tariff basis, rule IDs, specification evidence and server calculation under `sorCatalogue.reviewed`. A matching DATA recipe is saved immediately, and the quantity is written to an editable final cell. Shared sheets append separate quantity rows without replacing existing measurements. Base and extra-bearing selections have distinct DATA keys.

Insertion evidence stays immutable. Explicit DATA Sync refreshes current annual observations and revalidates extras against verified annual rule scope. Refreshed calculation evidence travels with the refreshed recipe; it does not overwrite the insertion evidence. Missing annual observations or invalid extras fail the refresh rather than retaining a rate under a new year.

Tariff rates are normalized only by their explicit basis quantity when entering the existing estimate engine. A ₹104/1,000-litre tariff retains ₹0.104/litre internally; the native calculator preserves that precision before estimate quantities are applied. The reviewed tariff and original calculation remain expandable in DATA.

## Verification

`npm run test:sor-reviewed` covers the published RPC contract, rule scope, costing gates, annual identity, refresh, snapshot persistence, tariff precision, and separate/shared quantity cells. Recorded fixtures came from read-only live RPC calls on 9 October 2026; source geometry was omitted.

Live Supabase verification confirmed 23,732 Recipes and 43,543 observations. The 2026–27 tray returns ₹2,058 base + ₹617.40 cover = ₹2,675.40/metre. The server rejects that rule on ladder trays and rejects conflicting observations. The 2025–26 ₹104/1,000-litre observation returns ₹156 for 1,500 litres.

Chromium checks with recorded RPC fixtures verified user interactions, stale quantity-response rejection, evidence, edition changes, missing observations, blocked costing, cooler units and project-year revalidation. TypeScript, lint, production build and the relevant legacy regression suites pass. The repository-wide React Compiler ratchet fails at 71 skipped functions on both the unchanged Git baseline and this implementation; its configured threshold is 63.
