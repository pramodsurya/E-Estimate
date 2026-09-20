---
name: typecheck
description: Run and fix TypeScript type checks for the Electron main and renderer processes. Use when checking types after edits, before commits, or when tsc errors appear.
---

# Typechecking

Two tsconfig projects:

- `npm run typecheck:node` → main/preload process (`tsconfig.node.json`)
- `npm run typecheck:web` → renderer process (`tsconfig.web.json`)
- Both: `npm run typecheck`

## Workflow

1. Always run `npm run typecheck` after editing any `.ts`/`.tsx` file and
   before declaring work done or committing.
2. Fix errors at their source; never silence with `any` or `@ts-ignore` unless
   the surrounding code already does so deliberately.
3. Stale build info can hide errors — if results look wrong, delete
   `tsconfig.*.tsbuildinfo` files and re-run.

Renderer uses React 18 + Zustand + Vite; main is plain Node/Electron 31.
Match existing strictness settings in each tsconfig rather than changing them.
