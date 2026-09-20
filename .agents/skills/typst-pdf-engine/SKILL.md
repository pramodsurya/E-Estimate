---
name: typst-pdf-engine
description: >-
  Comprehensive guide and reference for writing, generating, and compiling Typst (.typ)
  markup to PDF in Electron/Node.js. Use when generating engineering estimates, cross-sections,
  multi-page tables with repeating headers, diagrams, and high-performance PDF export/preview.
---

# Typst PDF Engine for E-Estimate

Typst is a modern, Rust-based typesetting system that replaces slow and fragile HTML/Chromium `printToPDF` workflows with sub-50ms native PDF compilation.

## 1. Core Typst Concepts & Syntax

### Document Configuration & Page Setup
```typst
#set document(title: "Detailed Estimate", author: "E-Estimate")

// Portrait Page
#set page(
  paper: "a4",
  flipped: false,
  margin: (top: 15mm, bottom: 15mm, left: 20mm, right: 15mm),
  header: align(right)[#text(8pt, fill: luma(120))[Detailed Estimate]],
  footer: locate(loc => {
    let page_number = counter(page).at(loc).first()
    let total_pages = counter(page).final(loc).first()
    align(center)[#text(9pt)[Page #page_number of #total_pages]]
  })
)
```

### Landscape Schedules
Switch page orientation within a document:
```typst
#set page(paper: "a4", flipped: true, margin: (x: 10mm, y: 12mm))
```

### Multi-page Tables with Repeating Headers
```typst
#table(
  columns: (15mm, 20mm, 25mm, 1fr, 25mm),
  align: (center, right, right, left, right),
  stroke: (x, y) => if y == 0 { (bottom: 1.5pt + rgb("#14364b")) } else { 0.5pt + rgb("#d0d0d0") },
  fill: (col, row) => if row == 0 { rgb("#edf5fa") } else if calc.even(row) { rgb("#fcfcfc") } else { none },
  table.header(
    repeat: true,
    [*Ch*], [*Length*], [*Avg Toe RL*], [*Description*], [*Quantity*]
  ),
  // Dynamic rows generated from sections
  [0+000], [0.00], [100.25], [Formation excavation], [145.20],
  [0+030], [30.00], [100.50], [Homogeneous fill], [580.40]
)
```

### Embedding Vector SVGs & Drawings
```typst
// Embedded SVG string
#image.decode("<svg ...>...</svg>", width: 100%)

// Grid with side-by-side Drawing & Calculations
#grid(
  columns: (1fr, 1fr),
  gutter: 10pt,
  image.decode(section_svg, width: 100%),
  table(
    columns: (auto, auto, auto),
    table.header([*Ch*], [*Level*], [*Qty*]),
    ..calc_cells
  )
)
```

## 2. Integration in Electron

1. **Main Process IPC Handler**:
   - Accepts `.typ` source or JSON data payload.
   - Invokes the Typst compiler in a background worker or process.
   - Emits a PDF `Uint8Array` / `Buffer` in <50ms.
2. **Renderer Process**:
   - Lightweight template generator functions that map TypeScript data types (`BundData`, `ProjectNode`) to clean Typst strings.
   - Instant PDF preview via Blob URL in `PdfPageStack`.

