---
name: ui-state
description: UI shell, Zustand store, styling, and navigation conventions for E-Estimate renderer. Use when editing components, adding views/pages/dashboards, changing useStore.ts, working with styles.css, or wiring navigation.
---

# UI & state conventions

## Single Zustand store

All state lives in ONE store: `src/renderer/src/store/useStore.ts` (~2000
lines). Do NOT create additional stores. Slices: navigation (`view`:
home/work/newproject, `activity`: explorer/search/lead/data/sourcecontrol,
selection overlays like `analysisSelection`, `leadSelection`,
`seigniorageSelection`), `project` + `dirty` + autosave, tree ops (delegated to
`lib/tree.ts`), undo history (`past`/`future` snapshots capped at 100,
coalescing policy in `store/history.ts` — pure logic, tested), modals.

- Components read via selectors only: `useStore((s) => s.x)` — never destructure
  the whole store.
- Undo history: any project mutation should go through the established
  commit-with-history pattern; coalescing is per run-key within 1500 ms.

## Navigation has no router

VS Code-like shell: `TitleBar` + `ActivityBar` + `SideBar` + `WorkArea`.
Routing is pure store state resolved in an if-chain inside
`src/renderer/src/components/WorkArea.tsx`. Detail views key off synthetic tree
ids parsed via `parseBundDetailId` / `parseGuideWallDetailId` /
`parseMiSluiceNewDetailId`. To add a view: add its selection state to the store
(if needed) and a branch in WorkArea — do not introduce react-router.
Dashboards/modals are loaded with `React.lazy` + Suspense.

## Styling

ONE global stylesheet: `src/renderer/src/styles/styles.css` (~384 KB),
VS Code-inspired dark theme using CSS custom properties (`--bg-elevated`,
`--accent`, …). No Tailwind/CSS modules/styled-components. Use kebab-case
semantic class names and reuse theme variables — never hard-code colors.

## Component conventions

- Named exports for lib/util code; default exports only for components.
- Rich explanatory comments at file tops explaining WHY are the house style.
- ErrorBoundary wraps views and dialogs separately.
- Chart.js is imported ONLY inside `components/charts/ChartFloat.tsx`; chart
  configs come from pure `lib/chartData.ts` so printing can reuse them without
  importing chart.js. Follow this split for anything visualization-related.
- Estimation logic must stay out of React components — keep it in framework-free
  `lib/` modules so `.cjs` tests can load them directly.
