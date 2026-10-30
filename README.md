# E-Estimate

E-Estimate is a Windows desktop application for construction cost estimation, built around Telangana SOR/SSR workflows. It helps you manage estimate data, prepare project documents, and generate print-ready output from a Tauri 2 + WebView2 shell.

## What it does

- Organizes estimate-related project data in one desktop workspace.
- Supports lead, rate analysis, seigniorage, bund, and document/print workflows.
- Ships as a packaged Windows installer (Tauri NSIS bundle).

## Get started

```bash
npm install
npm run dev
```

After the first successful desktop build, use **`npm run dev:fast` for React/CSS work**. It starts Vite and opens the existing debug desktop executable without waiting for Cargo. Native commands (including Typst) remain available from that build; saved frontend edits hot reload. Close the desktop window or press Ctrl+C to end the session. If Vite is already running, it is reused and left running when the fast session ends.

Use **`npm run dev` after changing Rust, Cargo dependencies or Tauri configuration**. Fast mode deliberately uses the previous native build and prints a warning when native source files are newer. If there is no debug executable yet, it tells you to build one first. `npm run dev:fast -- --check` checks for that executable without launching anything.

Cargo artifacts live under `%LOCALAPPDATA%\e-estimate`, outside OneDrive; Vite keeps using the existing dependency cache. While a first Rust/Typst build runs, **http://localhost:5173** is available in a browser. For browser-only UI work, use `npm run dev:ui`. Keep a development session running while editing; ordinary React/CSS edits do not require restarting it.

## Build for Windows

Build the analysis sidecar first, then the Tauri bundle:

```powershell
npm run build:analysis-engine
npm run build
```

The NSIS installer is written under `src-tauri/target/release/bundle/nsis/` (or, when `CARGO_TARGET_DIR` points elsewhere, under that target's `release/bundle/nsis/`).

## Download the latest release

**Latest: v0.1.15** — [github.com/pramodsurya/E-Estimate/releases/latest](https://github.com/pramodsurya/E-Estimate/releases/latest)

- **Windows installer (64-bit):** `E-Estimate_<version>_x64-setup.exe` — grab it from the latest release page.
- Direct link to this version: [E-Estimate_0.1.15_x64-setup.exe](https://github.com/pramodsurya/E-Estimate/releases/download/v0.1.15/E-Estimate_0.1.15_x64-setup.exe)

The installer bundles the XSLOPE bund-analysis engine (the bund Simulation tab needs it), and every release is signed. Installed builds **auto-update** — they check the latest release on launch.

## Release notes

The app ships through GitHub Releases. Auto-update is wired via `tauri-plugin-updater`:

- The app reads `latest.json` from the newest release and updates itself when a newer, signed version is available.
- Each release publishes the installer, its `.sig` signature, and `latest.json`.

Maintainers: see `scripts/publish.ps1` (one-command release) and `.github/workflows/release.yml` (cloud build).

## Configuration

- Use environment variables for runtime secrets and service endpoints.
- Common variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY`, `VITE_OSRM_URL`.
- Do not commit secrets, private tokens, or production credentials.

## Project layout

```text
src/
  renderer/   React UI, business logic, and window.api adapter (tauriApi.ts)
src-tauri/    Tauri 2 shell (Rust commands, bund sidecar, Typst compile)
analysis/     Python XSLOPE bridge (bund simulation sidecar)
```

## Contributing

Issues and pull requests: https://github.com/pramodsurya/E-Estimate

## License

See `package.json` for license and author information.
