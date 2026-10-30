# SOR first-load navigation timeout

Deployed to the connected Supabase project on 26 October 2026 using migration
`20261026144426_optimize_sor_navigation_first_load.sql`.

Postgres logs identify `sor_picker_navigation` as the failing function, with
statement-timeout errors on initial catalogue loads. The public client uses the
anonymous role, whose statement timeout is 3 seconds. The navigation query
aggregated the wide `sor_picker_index` table. Its covering index was not selected:
the inspected plan read 3,855 cached blocks through another index and the heap.
That table occupies 40 MB, including non-navigation data. The repeated first-load
failure followed by a successful Retry is consistent with cold reads warming
those pages; production shared buffers were not flushed to reproduce a cold
start.

The existing navigation RPC now reads `sor_picker_navigation_entry`, a compact
4,544 kB projection containing only tree fields. Source-index INSERT, UPDATE,
DELETE and TRUNCATE triggers maintain it in the same transaction. A short source
write lock during migration makes initial seeding and trigger installation
atomic. Clients have read-only RLS access. Both functions remain security invoker
with fixed search paths. No role timeout was increased.

Verification:

- Source/projection equality and complete RPC-output parity for both SOR years,
  including every label, count, printed page, first code and array order.
- Rolled-back synthetic insert, primary-key/year/path/page update and deletion
  verify immediate synchronization; unknown editions return an empty tree.
- Anonymous plan: approximately 11.4 ms versus 110.3 ms before, with 569 versus
  3,855 aggregation input blocks. These are comparable warm-cache measurements,
  not a guarantee of cold-start or end-to-end network latency.
- Three uncached public API navigation requests succeeded without Retry in
  1,858, 334 and 1,019 ms. Both editions and an unknown edition were checked.
- `test:sor-selector:live` passed navigation, search, matrix and source-resolution
  checks; local SOR browser/selector regressions passed.
- Security/performance advisors introduced no new findings.
- A fresh browser loaded the actual SOR picker with one navigation request
  (HTTP 200, 1,474 ms), all four Parts visible and no Retry/error state. The
  screenshot is `output/playwright/sor-first-load-fixed.png`.

The RPC signature and response are unchanged, so the database fix is available
to existing app installations without rebuilding the desktop application.
