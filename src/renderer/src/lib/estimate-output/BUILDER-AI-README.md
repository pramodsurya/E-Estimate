# E-Estimate Output Builder Contract

This folder defines the one-driver/two-renderer architecture. Read this file
before changing Typst, Excel, Project Excel, or an engineering calculation.

## Non-negotiable rule

Each module has one pure TypeScript calculation owner. For Bund that owner is
`src/renderer/src/lib/bund/`; for Guide Wall it is `lib/guideWall.ts`.

DATA/rate analysis is the deliberate exception: its single calculation owner
is the native Rust rate-analysis service. Before either standalone renderer
builds output, call `calculateDataSheets()` and pass each sheet's
`calculatedSummary` into `buildRateAnalysisRenderData()`. Never recreate that
calculation in TypeScript or let a renderer fall back to zero totals.

- Do not add arithmetic to `.typ` templates.
- Do not reimplement business arithmetic in an Excel builder.
- Do not make a `*TypstData` and a separate `*ExcelData` calculation pipeline.
- A renderer may calculate layout only: row heights, page capacity, column
  widths, image scale and cell placement are renderer concerns.

Every calculated engineering value should be returned as:

```ts
interface CalculatedValue {
  id: string                 // stable semantic identity, never A1/R1C1
  value: number              // resolved TypeScript result used by UI/Typst
  expression?: CalculationExpression // same driver's derivation for Excel
}
```

## Data flow

```text
pure TypeScript calculation module
        |
        v
neutral output model (values + expression lineage + rich content)
        |                              |
        v                              v
Typst JSON adapter                Excel layout adapter
prints CalculatedValue.value      registers semantic IDs to cells
                                  and compiles expression to formulas
```

Standalone Excel may write the resolved `value` when referenced sheets are
not present. Project Excel must use the expression whenever all dependencies
are in the combined workbook. This is a rendering policy, not a second
calculation algorithm.

## Two-pass Excel rule

1. Layout assigns cells and registers `calculation.id -> {sheet,row,column}`.
2. Formula emission resolves `calculation.expression` through that registry.

Use `SemanticCellRegistry` and `compileCalculationExpression` from
`calculation.ts`. Never put a worksheet coordinate into a semantic ID.

Good:

```text
bund.component42.schedule.formation.interval.3.quantity
```

Bad:

```text
Bund!H17
```

## Bund reference implementation

- Configuration/defaults: `bund/configuration.ts`
- Cross-section geometry: `bund/geometry.ts`
- Quantities and drainage: `bund/quantities.ts`
- Material/item synchronization: `bund/items.ts`
- Public compatibility facade: `lib/bund.ts`
- Formula lineage: `estimate-output/bundOutputModel.ts`
- Typst consumer: `typist-output/bund/bund.typ`
- Excel consumer: `excel-output/bundExcel.ts`

Typst reads resolved values from the shared output model. Excel compiles the
same driver's expressions to `AVERAGE`, multiplication and `SUM` formulas.

## Module boundary

Do not add calculations to the `lib/bund.ts` facade. Put configuration and
migration rules in `bund/configuration.ts`, geometry in `bund/geometry.ts`,
measured quantities in `bund/quantities.ts`, and generated-item aggregation in
`bund/items.ts`. Avoid splitting these further unless a domain becomes large
enough to have a clear independent responsibility.

Saved Typst is a presentation language and cannot automatically become an
Excel layout. Shared content, calculations, visibility, ordering, rich text,
figures and semantic styles belong in the neutral model. Only physical layout
instructions remain renderer-specific.

## Shared Excel detail contract

`DetailGrid.pageSetup` carries the resolved paper size and millimetre margins
to the native Excel writer. Leave it absent only when the historical A4 house
defaults are intentional. Orientation stays on the surrounding sheet payload.

For a document item, the fixed final selection must be numeric-only. If that
selection is part of a larger paragraph or table cell, keep the original rich
text and place the numeric Excel precedent on the same converted row. Never
append an invented final-quantity row at the end of the block. Referenced
images must either be emitted or fail export with a useful error; silently
dropping them is not allowed.

## Builder checklist

Before merging a module migration:

1. Calculation and rounding live in the module's pure TypeScript driver.
2. Every cross-renderer result has a stable semantic ID.
3. Typst performs no engineering arithmetic for that result.
4. Standalone Excel can emit resolved values.
5. Project Excel resolves formulas without fixed coordinates.
6. Both renderers consume the same neutral model builder.
7. Tests cover driver value, expression lineage, Typst content and Excel formula.
8. The Project workbook reuses the standalone sheet renderer instead of copying it.
