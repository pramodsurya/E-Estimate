# Development startup investigation — 29 October 2026

The supplied logs show two separate delays: waiting for the desktop executable,
and the work area's React Suspense `Loading...` while a screen's modules load.

## Measurements on this PC

- The supplied Vite startup times were 3.27 s and 11.55 s. Cargo reported cached
  dev builds of 60 s and 51.02 s, without any `Compiling` lines.
- An offline, locked build against the existing LOCALAPPDATA target completed
  in **38.91 s without recompiling any crates**. Skipping network access alone
  does not eliminate the time Cargo spends validating this dependency graph.
- At one sampling point Windows reported **1.18 GiB available of 15.37 GiB RAM**
  and **88% CPU use**. This is a constrained session, not an isolated benchmark.
  Disk queue length was 0 at that sample. No rustc process was active when the
  running desktop was inspected. Other applications were left running.
- A fresh browser session against the running Vite server reached DOM ready in
  **10.92 s**, requesting 134 resources on the home screen. Individual module
  requests took about four seconds in this loaded session. This is a browser
  baseline, not a measurement of the desktop WebView's restored project.
- After the changes, a warm-cache home-screen check reached DOM ready in
  **3.51 s** with 133 resources. Machine load and cache warmth varied between
  runs, so these observations are not a controlled before/after speedup.

## Changes

- `npm run dev:fast` starts Vite and the existing debug desktop executable,
  bypassing Cargo validation and its package-cache lock. Native IPC remains
  available from that executable. Use `npm run dev` for native changes.
- Fast mode checks for a missing executable, warns about newer native inputs,
  refuses a locked executable or an unrelated server, and only closes the Vite
  server it started. The timestamp warning is a convenience, not proof that
  native sources match the executable.
- Normal launch progress now follows Tauri/Cargo output. It no longer calls
  frontend startup “compiling”, claims all crates rebuild on every invocation,
  or reports readiness up to 30 seconds after process launch by checking locks.
- The work area no longer preloads both large Univer editors in the background
  on every project view. Items load only their selected editor. Spreadsheet
  Print Studio and PDF.js load when their respective previews are opened.
- Vite keeps its existing dependency cache, and only the main entry is warmed
  in advance. Relocating the cache was tested and reverted: it forced an
  expensive cold dependency optimization in this constrained session.

The Vite CJS deprecation message is informational. The Chrome window-class
unregistration message occurred during shutdown in the supplied log; that log
does not establish it as a startup cause. Cargo's package-cache lock indicates
another Cargo operation held that lock at the time; its owner cannot be
identified from the historical log.

Vite reference: [server.warmup](https://v5.vite.dev/config/server-options#server-warmup).

## Validation

- Node and renderer TypeScript checks completed with no diagnostics.
- All three launcher tests passed, covering cache paths, stale-source notices,
  server identification, closed ports and unresponsive services.
- Existing resource-use and shared-sheet checks passed.
- A temporary, unsaved browser spreadsheet finished initializing with three
  canvases, no editor error, and no requests for the document editor, Print
  Studio, CodeMirror or PDF.js. No user project was edited for this check.
- Fast mode was checked against the real cached executable and running server;
  it correctly refused to open a second copy of the locked desktop executable.
  A fresh desktop-window startup time was not measured because the user's
  desktop session was already open.
- Full targeted ESLint analysis did not finish within the verification window;
  no lint success is claimed.
