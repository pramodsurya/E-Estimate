# E-Estimate

Construction cost-estimation desktop app for Telangana SOR/SSR. Electron, React, and TypeScript
shell with a VS Code and Fusion 360 feel.

## Run

```bash
npm install
npm run dev
npm run build
npm run typecheck
```

## Windows x64 Build

```powershell
npm run package:win
npm run dist:win
```

- `package:win` creates an unpacked application folder in `release`.
- `dist:win` creates the Windows x64 NSIS installer in `release`.

## Project Layout

```text
src/
  main/        Electron main process, project file IPC, recent projects
  preload/     contextBridge API
  renderer/    React UI
    src/
      components/   shell, explorer, dashboards, editors, rate analysis, modals
      store/        Zustand project state, selection, undo/redo
      lib/          tree helpers, Supabase queries, recipe calculations
      types/        project and rate-analysis models
```

## Data

Master data is read live from Supabase with the publishable key in
`src/renderer/src/lib/supabase.ts`. It can be overridden with
`VITE_SUPABASE_URL` and `VITE_SUPABASE_KEY`.

- SSR items and recipe definitions: `ssr_item`
- SSR year-specific rates and totals: `ssr_year`
- Lead/lift/loading master data: `lead_charge`, `lead_rate`, `lead_note`
- SOR items: `material`, `labour`, `machinery`, `plumbing`, `electrical`, `civil`
- SOR/SSR years and flags: `allowance_rule`
- Rate-analysis recipes: unified SSR JSON from `ssr_item` / `ssr_year`, SOR rate tables, and
  `sor_constant`

Projects are saved as JSON in a custom `.eestimate` file.

Recipe defaults and SSR summary values are read from Supabase for the project's SOR year. User
edits are stored in the project file and shared by every occurrence of the same item code. SSR
values are not recalculated on load. Editing a line's quantity or rate updates only that line's
amount and its section total. `Defaults` restores the Supabase recipe.

## Implemented

The app includes the desktop shell, project creation, Explorer hierarchy, Supabase item selection,
project pages, the native document editor, the Univer spreadsheet editor, the bottom Data usage
tree, editable rate-analysis dashboards, a left DTL Lead reconstruction workspace, and a bottom
Lead Abstract workflow that opens right-side map/location/variant pages for applying
Supabase-backed lead/lift charges to DATA items.

## Deferred

Quantity/data extraction, PDF export, Seigniorage, item-level automatic lead reconstruction, local
git, the bundled Python engine, and SQLite cache remain later work.

## Notes

- No Content-Security-Policy meta is set yet. Add production response headers before packaging.
- The Supabase public schema must use Row Level Security before release.
