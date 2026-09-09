# Component "Templates" as Plug-and-Play Addons

**What an addon is (definition):** a self-contained extension for a **component type
the user builds on**. An addon owns four things:

1. its **own frontend** — the "detailed" dashboard where the user enters the component's
   inputs (e.g. the Bund design/estimate screens, the Guide Wall screens),
2. its **own `.ts`** — the data/logic adapter (computes quantities, builds the JSON blob),
3. its **own `.typ`** — the print/detailed-estimate layout,
4. its **own variables** — the readable `#let` names that the `.typ` and its frontend share.

**Bund and Guide Wall are addons. Lead, Seigniorage and Data are NOT** — they are
built-in report documents, not component extensions, and stay in the app.

**What an addon must give the component:**
- **Inject its layout + variables into `component.typ`** (the Component Typ): after the
  Component Abstract, the addon's `.typ` renders the component's detailed estimate.
- **Inject its items into the component dashboard**: the addon's frontend drives items
  into the component (like how editing the Bund detailed estimate feeds its items/quantities
  into the Component Dashboard).

---

## 1. The addon module

An addon is the unit a developer authors and the app installs. It's a folder:

```text
addons/
  bund-acme/                       # id slug (matches a ComponentTemplateId it extends)
    manifest.json
    addon.ts                       # data adapter + variables + injection entry point
    Layout.typ                     # injected .typ (uses the addon's own variables)
    frontend/
      index.tsx                    # the "detailed" dashboard component
      Dashboard.tsx
    variables.ts                   # shared variable names used by Layout.typ + frontend
    assets/                        # images / fonts
```

### `manifest.json`

```jsonc
{
  "schemaVersion": 1,
  "id": "bund-acme",                     // unique addon id
  "extends": "bund",                     // the ComponentTemplateId it plugs into
  "name": "Acme Earthen Bund",
  "version": "1.2.0",
  "author": { "name": "Acme", "email": "addons@acme.dev" },
  "engine": ">=0.1",
  "entry": {                              // module paths inside the addon
    "adapter": "addon.ts",
    "layout": "Layout.typ",
    "frontend": "frontend/index.tsx"
  },
  "inputs": ["ee-bund"],                  // sys.inputs keys the .typ reads
  "imports": ["assets/logo.svg"],         // files mounted in the shadow filesystem
  "page": {                               // optional override of document settings
    "paper": "a4", "orientation": "landscape",
    "margins": { "top": 12, "right": 12, "bottom": 12, "left": 12 },
    "fontSizePt": 9.5
  }
}
```

---

## 2. The app ↔ addon contract

The addon implements one typed interface. The app never imports a `.typ` or a dashboard
directly — it resolves through a registry.

```ts
// contract a component addon implements
interface ComponentAddon {
  kind: ComponentTemplateId            // 'bund' | 'guide-wall' | 'mi-sluice-new' | custom id
  manifest: AddonManifest

  // --- data / variables (own .ts) ---
  buildRenderData(project, node, ctx): unknown
  compileInputs(project, node, ctx): Record<string, string>   // { 'ee-bund': … }
  variables(): Record<string, string>                         // readable #let names → values
  variablesPrelude(): string                                  // the `#let … = …` block

  // --- layout injection (own .typ) ---
  layoutSource(project, node): string                          // the .typ (default or saved)
  documentSettings(project, node): DocumentSettings
  inject(componentSource, renderData): string                  // strip per-item section + insert layout + re-append items

  // --- frontend injection (own dashboard) ---
  DetailView: React.ComponentType<{ node: ProjectNode }>       // the "detailed" editor

  // --- persistence ---
  scopeKey(node): string                                        // printStudioDocuments[scopeKey]
}
```

The app's **Component Typ** path becomes:

```ts
const addon = await addons.resolveFor(node.templateId)          // bund-acme, built-in, etc.
const renderData = buildComponentRenderData(project, node, ...) // component abstract/items
const source = saved ?? addon.inject(defaultComponentTypstSource(), renderData)
compile(
  componentCompilePrelude() + addon.variablesPrelude() + source,
  { 'ee-data': …, ...addon.compileInputs(project, node) },
  shadowFiles
)
await import(/* @vite-ignore */ addon.manifest.entry.adapter)   // load addon modules at runtime
```

The **Component Dashboard** renders the addon's `DetailView` in place of (or alongside)
the items it owns, and its generated items appear as normal children — identical to how
Bund/Guide Wall dashboards already push their measured items into the component.

---

## 3. What stays built-in (NOT an addon)

| Kind | Addon? | Why |
|---|---|---|
| `bund` | ✔ | Has a frontend, its own `.ts`, `.typ`, variables |
| `guide-wall` | ✔ | Same |
| `mi-sluice-new` | ✔ (future) | Same shape |
| **Lead** | ✘ | Built-in conveyance-charge report; fixed data contract |
| **Seigniorage** | ✘ | Built-in statutory schedule; fixed |
| **Data / Component / Item** | ✘ | The generic sheets and component report; the injection *target*, not a template |

Only **component-extending** kinds are addons. Report documents stay versioned with the
app, because they depend on core engine rules (SOR, SSRs, seigniorage policy).

---

## 4. Where to host addons

Three sources, resolved by the same registry:

| Source | How | When |
|---|---|---|
| **Built-in** | Addons shipped in-app (bund, guide-wall today) | Everyday defaults, no install step |
| **Folder** | `addons/` next to the project, or `~/.e-estimate/addons/<id>/` | Team-shared, dev iteration, offline |
| **Remote catalog** | Supabase `addons` table + Storage bucket, or a Git/JSON index + CDN | Public sharing, versioned, one-click install |

For remote, the app already has Supabase — the natural home:

```sql
create table addons (
  id          text primary key,               -- "bund-acme"
  extends     text not null,                  -- ComponentTemplateId
  name        text not null,
  version     text not null,
  author      text,
  description text,
  content_url text not null,                  -- Storage path to the addon bundle (.zip)
  checksum    text not null,                  -- sha256 of the bundle
  manifest    jsonb,
  created_at  timestamptz default now()
);
```

Each addon is published as a **prebuilt bundle** (zip of the `dist` from its own build)
so the app can load `.ts/.tsx` without a compile step.

---

## 5. Runtime loading of addon code

Because an addon ships TS/TSX (frontend + adapter), the app can't `import` it at build
time. Options, in order of preference:

1. **Prebuilt module per addon.** The addon is built with Vite and loaded by URL or path.
   In Electron main, load with `import(url)`/`import(/* @vite-ignore */ path)`; the renderer
   mounts `DetailView` from the module. The `.typ` and manifest are plain files.
2. **Plugin host (VS Code-style).** The app owns an `AddonHost` that registers an addon's
   adapter + frontend reactively. Each addon exposes a small, versioned entry with a fixed
   API; the host type-checks the manifest against `engine` before mounting.
3. **App-bundled addons** for built-ins (bund, guide-wall) — same interface, but the module
   is already in the bundle.

All three go through the same `ComponentAddon` interface, so a built-in and a remote addon
are indistinguishable to the Component Typ / Dashboard.

---

## 6. Injection policy (already built for bund/guide-wall)

For a component addon, the app:
1. Renders **Component Abstract + banner** from `component.typ`.
2. **Strips** the per-item "every item on its own page" section.
3. **Injects** the addon's `Layout.typ` (with its variable bindings) after the abstract.
4. Re-appends **user-added (non-template) items** each on its own page.
5. Keeps **one signature block at the end** (strips the addon layout's own signature).

The addon's `inject()` implements this; the default value comes from the app, and a
**custom/saved** layout skips injection but still gets `variablesPrelude()` (variables are
always available; injection is only for the default).

---

## 7. Validation & safety

- Validate `manifest`: `schemaVersion`, `extends` is a known `ComponentTemplateId` (or a
  previously-registered custom id), `inputs` match the kind's contract, `engine` compatible.
- **Checksum** the installed bundle; never execute an addon that fails verification.
- **Sandbox scope**: only files in `manifest.imports` are mounted in the shadow fs; the
  `.typ` reads only declared `sys.inputs`.
- **Fail soft**: if compile or module load fails, fall back to the built-in addon for that
  `extends` so printing never breaks.
- Store the **selection** (addon id + version), not the code, in the project file.

---

## 8. Migration phases

- **Phase 0 — today:** bund + guide wall as app-bundled addons (behind the `ComponentAddon`
  interface), lead/seigniorage/data stay built-in.
- **Phase 1 — `AddonRegistry` seam:** a registry resolves an addon by `extends`; built-ins
  routed through it (no raw `.typ` imports).
- **Phase 2 — folder addons:** drop an addon folder in `addons/`, manifests validated, a
  picker ("choose your Bund addon"), hot-reload, fail-back to default.
- **Phase 3 — remote catalog:** Supabase `addons` table + Storage, checksum, one-click
  install, offline cache, update checks.
- **Phase 4 — dev kit / marketplace:** a developer addon that wraps a local folder so authors
  iterate without repackaging; optional signing & enterprise allow-list.
