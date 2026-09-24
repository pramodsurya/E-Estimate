# Bund calculation engine

This folder is the authoritative TypeScript driver for Bund calculations.
React, Typst and Excel must consume these functions or the neutral Bund output
model; they must not implement a second engineering formula.

## Files

- `configuration.ts` — constants, defaults, saved-project migration, chainage display.
- `geometry.ts` — profiles, faces, berm geometry, section areas, hearting and phreatic geometry.
- `quantities.ts` — MSA schedules, protection/drainage quantities, excavation deductions and section materialization.
- `items.ts` — required-item aggregation and synchronization into project item nodes.
- `math.ts` — shared deterministic rounding.
- `../bund.ts` — compatibility facade only; existing imports continue to work.

The geometry and quantity modules have a small intentional cyclic dependency
inherited from coupled section/toe calculations. It is safe because the
imported functions are only called after module initialization. New code should
prefer one-way dependencies and must not add top-level calculation calls.

When adding a calculation, return both its resolved numeric value and, where
Excel must remain live, semantic expression lineage consumed by
`estimate-output/calculation.ts`.
