# Default Typst designs

Edit these actual Typst files to change the software defaults:

| File | Content and descriptive data root |
| --- | --- |
| `lead.typ` | Lead summary and complete calculations: `Lead.materials` |
| `seigniorage.typ` | Statutory material groups and totals: `Seigniorage.material_groups` |
| `data.typ` | SOR schedule and DATA/rate analysis: `DataBook.sor`, `DataBook.recipes`; each analysis is named `RateAnalysis` |

These are complete layouts. Their TypeScript adapters load the files verbatim and prepare JSON values; they do not assemble headings, tables, or optional sections into code. The existing Document Settings editor can update the explicitly marked page/font block. Its literal settings support the panel's two-way editing.

Each template documents its fields, units, loops, and conditional sections. Empty lists and inapplicable charges are handled in Typst, rather than by regenerating the template. JSON strings print literally, including punctuation; they are never evaluated as Typst source.

Opening a saved design continues to use that design. New data does not replace its layout. The Lead adapter retains `rows` and `breakdowns`, and seigniorage retains `groups`, so older saved scripts using `EE` remain compatible. `seigniorage-legacy.typ` supplies helper functions required by those older scripts; new defaults are self-contained and do not need it.

Item, Item Document, Univer sheet/document templates and their adapters belong to the separately maintained Item workflow. They are outside this statement-template conversion.

## Editing with another AI

Copy the entire template and its comments. Keep its JSON binding and data loops. Use meaningful local names, and keep an explicit `if` around optional sections. Change labels, heading text, columns, styles and helper functions directly in the script. A missing variable is not automatically invisible: use `.at("field", default: ...)` and an appropriate condition. Do not replace a collection loop with fixed rows copied from one project's current data.
