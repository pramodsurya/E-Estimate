---
name: ipc-bridge
description: Tauri invoke conventions for E-Estimate — command naming, window.api adapter, adding new shell↔renderer features. Use when adding or changing invoke handlers, window controls, project open/save, export, or updater features.
---

# Shell bridge (Tauri invoke + window.api)

## Layout

- Rust commands registered in `src-tauri/src/lib.rs` via `tauri::generate_handler![...]`.
- Renderer adapter: `src/renderer/src/lib/tauriApi.ts` (`createTauriApi()`), installed by
  `platformApi.ts` at bootstrap.
- Types: `src/renderer/src/types/eestimateApi.d.ts` (`Window.api` / `EestimateApi`).

## Conventions

- Command names: snake_case Rust functions mapped to camelCase in the adapter —
  `window_minimize`, `project_save_as`, `bund_simulate`, `typst_compile`, `export_pdf`.
- Events broadcast to the renderer use colon names — `window:maximized-changed`,
  `bund:simulation-progress`, `update:available`.
- Binary payloads (PDFs) cross as base64 strings.

## Adding a command

1. Implement `#[tauri::command]` in the appropriate `src-tauri/src/*.rs` module.
2. Register it in `src-tauri/src/lib.rs`.
3. Extend the matching group in `tauriApi.ts` and its type in `eestimateApi.d.ts`.
4. Call it from the renderer only through `window.api.*` — never import Tauri APIs
   directly outside the adapter modules.

## Security posture

The WebView2 renderer has no Node integration. All filesystem, dialog, sidecar, and
network-privileged work runs in Rust commands invoked from `window.api`.
