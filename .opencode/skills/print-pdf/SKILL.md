---
name: print-pdf
description: How E-Estimate generates printable HTML, PDF exports, Excel workbooks, signature/closing blocks, and print preview stacks. Use when changing print layouts, PDF output, export flows, pagination, or fixing failing print:* tests.
---

# Print, PDF & export pipeline

Documents compile through **Typst** (`window.api.typst.compile` → `src-tauri/src/typst_compile.rs`).
The legacy Electron `printToPDF` path has been removed.

## Typst compile

Renderer builds `.typ` per domain module (`src/renderer/src/lib/*Typst*.ts`,
`*Print*.ts`). The Tauri shell compiles to PDF bytes via the native Rust Typst engine.

## pdf-lib assembly

Generated pages may still be merged and annotated with `pdf-lib` where needed
(signature blocks, closing block, Telangana emblem via `lib/emblem.ts`).
`assets/emblem-telangana.png/svg` imported `?inline`.

Finished PDFs are saved via `window.api.export.pdf`; Excel exports use `exceljs`
over `window.api.export.workbook`.

## Preview

Preview stacks live in `components/print/` (PdfPageStack,
ItemPrintPreviewStack, ComponentPrintPreviewStack, DocumentPrintPreviewStack,
GeneralAbstractPage, PrintLayoutModal, ProjectPrintView). Shared pagination
policy: `lib/smartAbstractPagination.ts`; page order: `lib/pageFlowPlanner.ts`;
single source of truth for abstract numbers: `lib/projectAbstract.ts`.

## Hard rules

- ANY change to printed output must be accompanied by updating the pinned
  tests: `test-print-columns`, `test-seig-print-layout`, `test-signature-footer`,
  `test-closing-block`, `test-export-pdf`, `test-document-final`,
  `test-print-description`, `test:pinned-pages`, etc. (see project-testing skill).
- Keep print HTML self-contained: inline styles/images; no external requests.
- Never bypass the shared rounding/sanction helpers (`estimateAmount.ts`,
  `finalNumber.ts`) when computing printed figures.
