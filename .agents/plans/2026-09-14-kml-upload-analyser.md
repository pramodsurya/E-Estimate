## Goal

Add an intelligent geometry upload to the Add Component locate step (Draw a line mode only): the user uploads a line KML / GeoJSON / SHP, sees it on the map, and gets a proposal — N components (with ch ranges), branch lines as sub-components — with assumptions stated, removable rows, and one-click batch creation. Deterministic geometry logic only; no AI service.

## Success Criteria

- A KML, GeoJSON, or SHP file uploaded in Draw a line mode renders on the map and produces a proposal panel stating exactly what will be created (e.g. 3 components when 3 distinct lines exist — the count never comes from chainage bands), or the message "No line found. Please only upload a line KML/GeoJSON/SHP."
- Points within the tolerance join into lines; gaps above it split into separate components; a smaller line touching a main line's middle becomes a sub-component.
- Splitting happens only for genuinely independent lines: a connected upload always proposes exactly one component — never one per segment, length band, or vertex count. Three components are proposed only when three independent lines exist.
- The user can rename and remove proposed rows (removing a component removes its branch sub-components) before creating.
- Each proposed component offers trim-first / trim-last: cut N meters off the line start or end, with the ch range updating live (chainage restarts at ch 0 for the trimmed line).
- Each created component carries its working line/point and its own resolved allowance; items under it price with that allowance after Sync.

## Context And Current Facts

- Add Component wizard (`src/renderer/src/components/modals/AddStructureModal.tsx`): details dialog (name + type) → locate step for custom components (point/line via `WorkingPointMap.tsx`, allowance resolved live with `resolveAreaAllowance` from `lib/masterData.ts`, line middle from `workingLineCentroid` in `lib/componentAllowance.ts`).
- Per-component allowance already flows: `ProjectNode.areaAllowance` / `workingLine` (`types/project.ts`), `effectiveAllowanceForNode` + `componentAllowanceAudit` (`lib/componentAllowance.ts`), per-allowance fetch groups and signature coverage (`lib/dashboardSync.ts`), `setNodeAreaAllowance` and `createStructureNode(..., extra)` (`store/useStore.ts`).
- Single creation path today: `createStructureNode` closes the modal and parents under `addStructure.parentId`; batch creation needs a new explicit-parent action.
- Repo test convention: Node source-assertion scripts plus TS transpile-and-run (`ts.transpileModule` pattern in `scripts/test-rate-analysis.cjs`); new scripts register as `test:*` in `package.json`.
- User decisions already given: 50 m default tolerance (30/40/50 selectable); branch touch uses the same tolerance; deterministic logic only; upload lives in Draw a line mode, nowhere else; chains need ≥3 points (a lone pair "can't help" — reported, not created); spacing consistency is shown and irregular chains are flagged rather than blocked.
- Environment constraint: shell execution is broken in this session, so all commands and test runs are user-executed.

## Constraints And Non-goals

- No new npm dependencies (unverifiable in this environment; the needed format subsets are small enough to parse by hand).
- Upload UI appears only in Draw a line mode. No point-mode upload, no polygon support, no `.dbf` attribute import, no coordinate reprojection (SHP coordinates assumed WGS84; `.prj` ignored and stated).
- No AI/agent ("needle") integration — user chose deterministic only. Vertex editing on the map is out; removal happens in the proposal list.
- Existing single-component manual draw flow stays untouched; importing replaces the hand-drawn line (with a Discard path back).

## Key Decisions

1. **Hand-written parsers, no libraries.** KML via `DOMParser` (Placemark LineString/Point `<coordinates>`, lon-lat order); GeoJSON via `JSON.parse` (Point/MultiPoint → loose points; LineString/MultiLineString → lines); SHP via `DataView` over the `.shp` buffer (shape types Point=1, PolyLine=13, X=lon/Y=lat). Rejected: npm packages (togeojson, shpjs) — cannot install or verify here, and the subset needed is small.
2. **Join/chain rule (user's 50 m + consistency ask).** Greedy nearest-neighbor chaining of loose points; consecutive gaps ≤ tolerance join. A chain becomes a line only with ≥3 points; exact pairs are listed as "point pair — not enough to form a line" and never auto-created. Each chain reports min/max spacing; chains whose max/min gap ratio exceeds 3× are flagged "irregular spacing — confirm" but still proposed (flag, don't block). Duplicate points within 1 m are collapsed first.
3. **Merge then split — conservatively.** Line endpoints within tolerance join (reversing as needed) until stable; only lines still disconnected after merging become separate components. No line is ever split by length, vertex count, or segment: one connected line is always one component, and N components are proposed only when N independent lines remain. Closed loops stay one line and are noted.
4. **Branch rule (same tolerance, per user).** A line endpoint within tolerance of another line's interior (and farther than tolerance from its endpoints) attaches as a sub-component of the longest such line; one level only.
5. **Chainage in meters.** Cumulative haversine length per proposed line; displayed as ch 0–N (rounded) with total length.
6. **Preview before creation.** Allowances resolve per proposal centroid during preview (same `resolveAreaAllowance` path as manual placement), so each row shows its allowance before anything is created.
7. **Batch creation as a new store action** (`createComponentsFromImport(parentId, proposals)`), not repeated `createStructureNode` calls (which reset the modal parent state after the first call). Names default to `<name> · Reach i` / `<parent> · Branch i` / `<name> · Point i` and are editable per row.
8. **End trimming per component.** Trim-first cuts meters off the line start, trim-last off the line end; the cut interpolates a new endpoint on the segment it falls on (never drops to a coarser vertex), chainage restarts at ch 0 for the trimmed line, and the allowance re-resolves from the new middle. No middle-section removal, no trimming of point-components.

## Recommended Approach

Pure-TS `lib/geometryImport.ts` (haversine, three parsers, chaining/merging/branching analyzer returning proposals + assumption strings) keeps all intelligence unit-testable without a browser. The modal gains an upload button, tolerance selector, assumptions list, editable/removable proposal rows, and colored map overlays (extended `WorkingPointMap` `overlays` prop); confirm calls the batch store action with the already-resolved allowances. Manual draw and proposal are mutually exclusive, toggled by Upload/Discard.

## Work Plan

1. **`lib/geometryImport.ts`.** Haversine/distance helpers; `parseKmlGeometry`, `parseGeoJsonGeometry`, `parseShpGeometry` → `{ lines, points, ignored }`; `analyzeImportedGeometry(lines, points, toleranceM)` → `{ proposals, assumptions }` implementing the chain (≥3 pts, ≤ tol gaps, dedupe 1 m, min/max spacing + irregular flag), end-to-end merge, split of genuinely disconnected lines only (never by length or vertex count), branch-to-sub-component, isolated points → point-components, chainage per proposal, `trimLine(line, trimStartM, trimEndM)` cutting by distance with interpolated endpoints.
2. **Store batch action.** `createComponentsFromImport(parentId, proposals)` in `store/useStore.ts` (+ interface entry): builds custom component nodes with `location`/`workingLine`/`areaAllowance`, nests branch sub-components, applies sibling-safe names, selects the first top-level node, closes the modal.
3. **Map overlays.** `WorkingPointMap` accepts `overlays: { points, color }[]` and renders colored `Polyline`s (+ endpoint markers); manual drawing hidden while a proposal is active.
4. **Modal upload + proposal UI.** Line-mode-only file input (`.kml,.geojson,.json,.shp`), tolerance select (30/40/50, default 50, re-analyzes), loading/error states, "No line found. Please only upload a line KML/GeoJSON/SHP." empty state, assumptions list, proposal rows (color dot, editable name, Component/Sub badge, ch range, length, allowance, trim-first/trim-last meter inputs with live ch preview, Remove with cascade), Discard import, footer creates N components via the batch action with preview-resolved allowances.
5. **Tests + wiring.** `scripts/test-geometry-import.cjs` transpiling `geometryImport.ts` (repo pattern) with fixtures: 10 even points → 1 line; lone pair → reported not created; 60 m gap → 2 components; connected zigzag → exactly 1 component; T-touch branch → sub-component; empty file → no-line message; plus source assertions for line-mode-only upload UI. Register `test:geometry-import` in the `npm test` chain.

## Validation Plan

- `npm run typecheck` — must pass (catches store/component/prop mismatches).
- `npm run test:geometry-import` — fixture assertions above; `npm test` — full chain green.
- Manual walkthrough (user-run): upload a 3-reach line KML → map shows 3 colors, panel says 3 components with ch ranges; remove one → count updates; create → 3 components each with line + allowance; branch file → sub-component nested; pair-only file → "point pair" note, nothing created; non-line file → no-line message; trim 20 m off a 100 m line → ch 0–80.

## Risks / Rollback

- Shell is broken in this session: implementation and test runs cannot be observed here; mitigate by keeping the diff small, pure, and fixture-tested, and having the user run Validation Plan commands.
- SHP WGS84 assumption: wrong if the file uses another projection — stated in assumptions panel; no silent reprojection.
- Large files: cap processed vertices (e.g. 20k, downsample beyond) and state it; prevents map/Sync stalls.
- Rollback: additive code only (new lib, new store action, modal-local UI); removing the upload button + batch action restores the previous wizard with no model changes needed (proposals never persist until created).

## Open Questions

None — tolerance (50 m default, 30/40/50 selectable), branch rule (same tolerance), deterministic-only, line-mode-only scope, pair/consistency handling, and no-line message were all answered by the user. If "needle 2" meant a specific tool to integrate later, that is a future request, not part of this plan.
