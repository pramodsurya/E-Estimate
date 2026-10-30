# Current-analysis print preview

26 October 2026. DATA preview/PDF renders the current calculated analysis even
when material Lead, adopted inputs or review/finalisation are pending. The editor
retains its reminders and state. Rendering never applies a zero-distance Lead or
marks missing Lead complete. Applied MoRTH Lead is repriced through the existing
native appendix path before a single-analysis preview.

Removed readiness exceptions from the Typst data adapter and excluded delivery /
handling workflow warnings from its print data. The empty `warnings` field stays
available to older saved custom templates. Real calculation and compiler errors
still propagate normally.

Validation:

- MoRTH presentation and material-Lead regressions pass, including pending
  appendix Lead, current rates, unchanged project state and applied Lead once.
- The pending-Lead fixture produces three real PDF pages: the parent and its two
  nested appendices. The first page was rasterised and visually inspected.
- DATA Typst, rate-analysis, renderer TypeScript, targeted ESLint and production
  renderer build pass.
- The separate, unchanged `test:print-content-audit` reaches a failing assertion
  for `parts/ee-bund.json`: its fixture expects a nested shadow-file update,
  whereas the existing adapter updates canonical root JSON paths. DATA and
  MoRTH print-completeness checks in their own suites pass. This change does not
  alter the project-book shadow-file adapter.

This is a renderer change; no Supabase migration is needed for print preview.
No installer was rebuilt.
