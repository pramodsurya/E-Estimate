# E-Estimate — Architecture & Migration Plan

> Discussion record: moving from Electron to a Tauri + Rust architecture with a
> future hosted-web path, including the Print/PDF pipeline replacement.
>
> Status: **Phase 0 complete — Tauri 2 is the only desktop shell (Electron removed).**

---

## 1. Target architecture

One Rust "brain", multiple doors:

```
                    E-ESTIMATE
                        │
              ┌─────────┴─────────┐
              │   Shared Web UI   │
              │  React/TS (Vite)  │
              └─────────┬─────────┘
                        │
                  EstimateAPI      ← single interface, two adapters
             ┌─────────┴──────────┐
             ▼                    ▼
        DESKTOP APP            WEB APP (future)
          Tauri                   Browser
            │                       │
      Tauri invoke()           HTTP API
            │                       │
            └──────────┬────────────┘
                       ▼
                 RUST CORE (estimate-core)
                 ├── estimation calculations
                 ├── search / ranking
                 ├── validation
                 ├── rate analysis
                 ├── business rules
                 └── REPORT / PDF LOGIC (Typst)
```

Key decisions:

| Decision | Choice | Reason |
|---|---|---|
| Desktop shell | Tauri 2 | Small binaries, uses WebView2, mobile later |
| Core logic | Rust crate `estimate-core`, no Tauri/browser deps | Shared by desktop + web |
| Web API (later) | Axum 0.8.x on Tokio/Tower | Same core exposed over HTTP |
| UI | Keep TypeScript/React — do **not** rewrite in Leptos/Yew | Web ecosystem strength in tables/forms/dialogs; AI handles UI work well |
| Database seam | Repository pattern when needed (Supabase today; SQLite/Postgres options later) | Business logic must not embed storage details |

---

## 2. Environment & tooling status

### Already present (verified)

| Requirement | Status |
|---|---|
| Node.js ≥ 18 | ✅ v22.14.0, npm 10.9.2 |
| MSVC C++ Build Tools ("Desktop development with C++") | ✅ VS 2022 17.14 |
| WebView2 Runtime | ✅ 151.0.4129.107 |

### Installed during this session

| Tool | Version | Notes |
|---|---|---|
| Rustup + Rust stable-msvc | rustc 1.98.0 | at `~\.cargo\bin`; new terminals pick up PATH automatically |
| Tauri CLI | 2.11.4 | devDependency (`npx tauri --version`) |
| Axum (planned) | 0.8.x | install into `estimate-core` workspace when the web layer starts |

---

## 3. Codebase audit summary

- **Size:** ~186 TS source files, ~73,600 lines.
  - `src-tauri` (Tauri shell): Rust commands for I/O, bund sidecar, Typst, export
  - `src/renderer`: ~73,000 lines (React SPA + all business logic)
- **Desktop bridge:** ~25 invoke channels (window controls, project file I/O
  `.eestimate`, recents, export pdf/workbook, Typst compile, updater stub).
  Renderer never imports the shell — it talks only through `window.api`
  (`platformApi.ts` / `tauriApi.ts`).
- **No native Node modules** (no better-sqlite3, no node-gyp) — major plus for Tauri.
- **Business logic is pure TS** in `src/renderer/src/lib` (~24,700 lines):
  bund.ts (5,031), rateAnalysis.ts (~2,900), seigniorage.ts (845),
  lead.ts + leadApplicability.ts (~1,500), dataVariants.ts (1,501), etc.
- **Data layer:** Supabase (Postgres) via supabase-js in the webview; no local SQL.
  Nine lib modules call Supabase inline (no repository seam yet — optional hygiene).
- **Frontend:** React 18 + Vite (`vite.config.ts`), zustand store
  (`useStore.ts` is a 1,929-line god-store), Univer editors, chart.js,
  leaflet/react-leaflet maps with OSRM routing, onnxruntime-web semantic search worker.
- **Tests:** 36 hand-rolled headless suites (`scripts/test-*.cjs`) run by
  `npm test`; most exercise lib code without Electron → they survive migration.

### Risk ranking

1. **Print/PDF pipeline (~8,300 lines)** — legacy Chromium `printToPDF` removed;
   WebView2 has no equivalent. → Solved by Typst (§4).
2. Auto-updater parity (`tauri-plugin-updater` — currently stubbed in
   `src-tauri/src/update.rs`).
3. God-store `useStore.ts` touches the bridge centrally → build an adapter shim
   (`window.api` backed by Tauri `invoke`) instead of editing call sites.
4. Window chrome (frameless custom title bar) and DevTools/shell.openExternal
   need Tauri equivalents.
5. Hardcoded publishable Supabase key in `renderer/src/lib/supabase.ts`
   (review regardless of migration).
6. Smoke-test ONNX/WASM workers and Univer inside WebView2 early.

---

## 4. Print/PDF pipeline — the plan

### Current system (two mechanisms)

1. **Typst compile** (`src-tauri/src/typst_compile.rs` / `typst_compile` command):
   renderer builds `.typ` per domain module; native Typst engine compiles to PDF.
   The first debug build that pulls Typst/krilla is often **30–90 minutes**; later
   `tauri dev` incremental builds should be seconds to a few minutes unless Rust
   dependencies change. Typst stays in the Tauri debug binary because the app
   compiles PDFs through this command (the Node Typst compiler is tests only).
2. **pdf-lib assembly**: merging pages, signature blocks, closing block,
   Telangana emblem (`lib/emblem.ts`).
3. Special cases: Univer sheets have no print engine → `printRender.ts`
   reconstructs layout constants from worksheet snapshots; lead route maps use
   html-to-image capture off-screen (`LeadCombinedPrintPreview`) then Typst
   (`leadMapTypst.ts`).

### Replacement: **Typst** (chosen)

Typst = modern typesetting engine written in Rust. Compiles plain-text `.typ`
templates + structured data directly to PDF. No browser involved.

```
DocumentModel (JSON from business logic)
        │
        ▼
   .typ template (plain text, in Git)
        │
        ▼
   Typst engine (pure Rust)
        ├── native crate → PDF bytes in estimate-core (Tauri desktop / Axum server)
        └── WASM         → same engine in any browser tab
```

| Current pipeline | With Typst |
|---|---|
| ~8,300 lines of string-built HTML tuned to Chromium | One `.typ` template per document type |
| Requires hidden BrowserWindow (legacy Electron printToPDF) | Runs natively in Rust **and** as WASM |
| Output varies by Chromium version/platform | Deterministic, byte-identical everywhere |
| pdf-lib post-processing for signatures/emblem/merging | Headers, footers, page numbers, tables, images, page sizes are first-class language features |
| Univer DOM reconstruction for sheets | Feed sheet *data* straight into a table template |
| Hidden-window render queue with timeouts | 5–30 ms per document; ~157 ms for 500 pages |

Alternatives evaluated and rejected:
`@react-pdf/renderer` (flexbox subset, stays in UI layer), headless-Chromium
sidecar (~170 MB, defeats Tauri's purpose), wkhtmltopdf (abandoned),
WeasyPrint (Python dep, poor scaling), speedata Publisher (commercial, overkill).

### Migration strategy

1. Business logic emits a serializable **DocumentModel** (plain JSON).
2. One template per document type; start with the **abstract**
   (most printed; clean data source already exists in `projectAbstract.ts`).
3. Pin output against current PDFs; port remaining documents one template at a
   time using the existing pinned test suites as safety net.
4. Preview = compile to PNG pages into existing `PdfPageStack`.

---

## 5. Maps in print (Lead Route Map)

Typst cannot fetch tiles or run Leaflet — split responsibilities:

```
UI (Leaflet stays!)                     Typst template
──────────────────                      ──────────────
User configures map settings            image("lead-map.png")
  showBaseMap, showMapLabels,                 +
  legend, scale bar, bounds,               table(legend rows)
  layer choice (OSM/ArcGIS/KMZ)                +
        │                                  heading(mapTitle)
        ▼
Capture ONE image of the map
  (PNG raster; route/markers as
   SVG overlay → crisp vector)
        │
        ▼
Image bytes → DocumentModel → Typst places & frames it
```

- Existing map settings control **image generation** (UI code survives).
- Document-side presentation (title, frame, legend, caption, sizing) moves to Typst.
- Replaces flaky "wait until Leaflet stops adding tiles" polling with one
  deliberate capture step (`compileLeadMapPdfFromPage` in `leadMapTypst.ts`).

## 6. Front page ("Word"-style)

The front page is authored in the in-app Univer document editor
(`PageEditor.tsx`, `pageTemplate === 'front'`), not imported from .docx.

| Scenario | Best tool |
|---|---|
| Fixed-format front page (department, title, amounts, dates, signatures) | **Typst** — deterministic, fields auto-filled from project |
| Free-form user-typed pages in Univer | Keep Univer for *editing*; serialize its content model into a generic Typst template for *printing* |
| Importing external .docx files | Neither current pipeline nor Typst handles this well; separate docx→data converter problem if it arises |

## 7. WYSIWYG guarantee ("what I exactly see")

With Typst the **same engine** produces preview and export:

```
DocumentModel + template
        │
        ▼
   Typst compiles once
        ├── PNG page images → preview stack
        └── PDF bytes       → saved/exported file
```

Preview = print, pixel-for-pixel, guaranteed (stronger than today's
Chromium-agrees-with-itself situation).

Image placement:

| Case | Result |
|---|---|
| Fixed layout slot (map below title, etc.) | ✅ Exact |
| User-positioned image at chosen coordinates | ✅ Via coordinate mapping to Typst `place()` |
| Word-style text wrapping around image contours | ⚠️ Approximate only |

## 8. Other notes

- **Charts** (chart.js): capture to PNG/SVG → embed in Typst (same as maps).
- **Signature blocks / emblem / closing block:** become ordinary template
  elements — removes the pdf-lib post-processing dependency.
- **Fonts:** Typst embeds fonts into the PDF; verify Telugu font shaping early
  in the POC if any printed documents use Telugu text.

---

## 9. Phase 0 status (Tauri-only desktop shell)

**Last updated:** 2026-09-08

| Area | Status |
|---|---|
| Tauri 2 + WebView2 shell | ✅ Production shell (`src-tauri/`, `npm run dev`) |
| Renderer | ✅ React/Vite; `window.api` via `platformApi.ts` + `tauriApi.ts` |
| Electron | ❌ Removed — no electron-vite, electron-builder, or preload bridge |
| Window chrome | ✅ minimize / maximize / close / isMaximized + event |
| Project I/O (`.eestimate`) | ✅ dialog + fs |
| Recent projects | ✅ app data dir JSON store |
| Bund simulation sidecar | ✅ spawns `analysis/bund_analysis.py` (dev) or bundled `bund-analysis.exe` (release) |
| Typst compile | ✅ native Rust (`typst` + `typst-world` + `typst-pdf`) |
| Export PDF/xlsx + reveal | ✅ dialog + fs + opener |
| Remote image embed | ✅ reqwest |
| Lead map export | ✅ Typst + html-to-image capture (no `printToPDF`) |
| Auto-update | ⚠️ **Stub** — commands return idle/stub payloads; wire `tauri-plugin-updater` later |
| `estimate-core` Rust crate | ✅ Skeleton only (no business logic ported) |

### Run

```bash
npm install
npm run dev                 # Tauri + Vite. Open http://localhost:5173 while Rust compiles.
npm run dev:ui              # Vite only (browser UI; no Typst/file IPC)
npm run build               # Windows NSIS (requires icons + analysis engine built)
```

Rust artifacts go to `%LOCALAPPDATA%\e-estimate\cargo-target` (not OneDrive `src-tauri/target`). A full Typst debug compile is 30–90 min once; later `npm run dev` should be incremental. Do not `cargo clean`.

Bund sidecar for production: `npm run build:analysis-engine` before `npm run build` (bundled via `tauri.conf.json` resources).

---

## 10. Next steps (post Phase 0)

- [ ] Wire `tauri-plugin-updater` + signing
- [x] Lead map: deliberate capture → Typst (see §5)
- [ ] POC: reproduce one abstract page + one lead-map page as Typst templates
- [ ] Move shared validation/calc into `estimate-core` incrementally (optional)
