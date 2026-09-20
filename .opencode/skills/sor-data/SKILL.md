---
name: sor-data
description: Domain conventions for Telangana SOR/SSR construction cost estimation data in E-Estimate. Use when editing rate analysis, leads, abstracts, seigniorage, bund/sluice calculations, Supabase catalogue tables, or print layouts.
---

# SOR/SSR domain conventions

E-Estimate is a construction cost estimator for Telangana SOR/SSR schedules.

## Architecture

- `src/main` — Electron main process; `src/preload` — bridge;
  `src/renderer/src/lib` — estimation logic (leads, rate analysis, abstracts);
  `src/renderer/src/components` — React UI.
- Rate data comes from Supabase (`src/renderer/src/lib/supabase.ts`). Rates are
  **zone-aware**: rows are normalized per project zone via functions like
  `normalizeLeadRateRow(row, zone)`; always select `rate,zone_rates` style maps
  and index by the selected zone.
- Lead distances feed material costs; pipe leads have their own rules
  (see `scripts/test-pipe-lead.cjs`).

## Hard rules

- Never hard-code rates, zones, or constants that exist in the Supabase
  catalogue — fetch and normalize instead.
- Estimation changes must keep print/PDF output correct: abstracts, VPV,
  seigniorage & permit pages, signature footers, closing blocks all have
  dedicated tests (`test:*-abstract`, `test:seig-*`, `test:signatures`,
  `test:closing-block`, `test:print-*`).
- Feature work on bunds/guide walls/MI sluices has simulation specs in
  `BUND_SIMULATION_PLAN.md`; read it before touching those modules.
- After any estimation-logic change, run the related `test:*` suites plus
  `npm run typecheck` (see project-testing and typecheck skills).
