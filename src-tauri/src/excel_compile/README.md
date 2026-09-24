# Excel compiler structure

Each workbook format owns its Rust writer and payload model. The project
workbook is an orchestrator only: it calls the same reusable sheet writers as
the standalone exports, then adds project-specific sheets and links.

## Ownership

- `command.rs`: Tauri response, cache path and base64/path transport.
- `dispatcher.rs`: `ExcelKind` routing only.
- `models/`: payloads grouped by workbook.
- `grid.rs`: generic renderer for prepared cell grids.
- `styles.rs`: only formatting primitives that have identical meaning across
  workbook types. Workbook-specific styles stay with their workbook.
- `data/`: DATA composition with independent SSR and SOR sheet writers.
- `lead.rs`, `component.rs`, `seigniorage.rs`, etc.: standalone workbook
  formats.
- `project.rs`: composes reusable workbook writers and resolves cross-sheet
  links. It must not duplicate a standalone sheet layout.

## Adding a workbook

1. Add its payload under `models/`.
2. Add one workbook writer module.
3. Register the kind in `models/request.rs` and `dispatcher.rs`.
4. Add a focused Rust generation test and a frontend payload-contract test.
5. If Project needs the sheet, expose a reusable sheet writer from that
   workbook module and call it from `project.rs`; do not copy its layout.

Standalone exports may write resolved numeric values. Combined Project export
may pass cross-sheet references into reusable writers where live formulas are
required.

For formula-aware output models and the mandatory one-driver rule, also read
`src/renderer/src/lib/estimate-output/BUILDER-AI-README.md`.
