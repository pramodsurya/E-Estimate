---
name: build-package
description: Dev server, production build, and Windows packaging workflow for the E-Estimate Tauri app. Use when running npm run dev/build, tauri build packaging, or fixing build failures.
---

# Build & package (E-Estimate)

Tauri 2 desktop app with a Vite React renderer and Rust shell (`src-tauri/`).

## Commands

- `npm run dev` — `tauri dev` (Vite renderer on :5173 + WebView2 shell)
- `npm run build` — `tauri build` (renderer bundle + NSIS installer)
- `npm run dev:renderer` — Vite only (used internally by Tauri)
- `npm run build:renderer` — Vite production bundle only
- `npm run build:analysis-engine` — build the bund simulation sidecar (required before release)
- `npm run package:win` — analysis engine + full Tauri build + sidecar smoke test
- `npm run dist:win` — same as a full release build (alias of the build chain)

## Notes

- Renderer config: `vite.config.ts`. Tauri config: `src-tauri/tauri.conf.json`.
- `dist/renderer/` and `src-tauri/target/` are generated; never edit or commit them.
- Bund sidecar is bundled via `tauri.conf.json` `bundle.resources` from `vendor/bund-analysis/`.
- If a build fails, first try `npm run typecheck` and `npm test`.
- Auto-update is stubbed — wire `tauri-plugin-updater` before changing publish flows.
