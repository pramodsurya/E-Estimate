---
name: project-testing
description: Run, write, and debug tests for the E-Estimate Electron app. Use when running npm test, adding a new test script, or fixing failing test:<name> scripts.
---

# Project testing (E-Estimate)

Tests are plain Node `.cjs` scripts under `scripts/` — there is no Jest/Vitest.
Each script transpiles TypeScript modules with `ts.transpileModule`, loads them
via a custom `Module._compile` loader (`loadTsModule`), and asserts with
`node:assert/strict`.

## Running

- Full suite: `npm test` (chains every `test:*` script)
- One suite: `npm run test:lead` or `node scripts/test-lead.cjs`
- Suites are independent; run only the ones touching code you changed.

## Adding a test

1. Create `scripts/test-<feature>.cjs` following the pattern in
   `scripts/test-lead.cjs`: copy `loadTsModule` from an existing test.
2. Add `"test:<feature>": "node scripts/test-<feature>.cjs"` to `package.json`
   AND append `npm run test:<feature>` to the end of the `test` chain.
3. Tests often assert on source text (`assert.match(source, /regex/)`) to pin
   implementation contracts (e.g. zoned rates) plus behavioral regression cases.

## Conventions

- Mock Supabase via the module path, e.g. `{ './supabase': { supabase: {} } }`.
- Keep tests deterministic; no network access in tests.
- After changes, run at minimum the affected suites plus `npm run typecheck`.
