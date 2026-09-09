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

While the first Rust/Typst compile runs (often a long time), open **http://localhost:5173** in a browser and keep working. Do not stop the terminal. Later `npm run dev` should reuse `%LOCALAPPDATA%\e-estimate\cargo-target` instead of rebuilding all 695 crates. For UI-only: `npm run dev:ui`.

## Build for Windows

Build the analysis sidecar first, then the Tauri bundle:

```powershell
npm run build:analysis-engine
npm run build
```

The NSIS installer is written under `src-tauri/target/release/bundle/nsis/`.

## Download the latest release

Current version: v0.1.8

- Releases page: https://github.com/pramodsurya/E-Estimate/releases
- Windows installer: https://github.com/pramodsurya/E-Estimate/releases/download/v0.1.8/E-Estimate-0.1.8-windows-x64.exe

## Release notes

The app uses GitHub Releases for distribution. Auto-update via `tauri-plugin-updater` is planned but not wired yet — see `src-tauri/src/update.rs`.

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
