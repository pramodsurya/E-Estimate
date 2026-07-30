# E-Estimate

E-Estimate is a Windows desktop application for construction cost estimation, built around Telangana SOR/SSR workflows. It helps you manage estimate data, prepare project documents, and generate print-ready output from a single Electron app.

## What it does

- Organizes estimate-related project data in one desktop workspace.
- Supports lead, rate analysis, seigniorage, bund, and document/print workflows.
- Ships as a packaged Windows installer with auto-update support through GitHub Releases.

## Get started

```bash
npm install
npm run dev
```

## Build for Windows

```powershell
npm run build
npm run dist:win
```

## Download the latest release

Current version: v0.1.8

- Releases page: https://github.com/pramodsurya/E-Estimate/releases
- Windows installer: https://github.com/pramodsurya/E-Estimate/releases/download/v0.1.8/E-Estimate-0.1.8-windows-x64.exe

## Release notes

The app uses GitHub Releases for distribution and update delivery. When a new version is published, users can download the Windows installer from the release page above and the app can check for updates on launch.

## Configuration

- Use environment variables for runtime secrets and service endpoints.
- Common variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY`, `VITE_OSRM_URL`.
- Do not commit secrets, private tokens, or production credentials.

## Project layout

```text
src/
  main/       Electron main process and project I/O
  preload/    contextBridge API
  renderer/   React UI and frontend source
```

## Contributing

Issues and pull requests: https://github.com/pramodsurya/E-Estimate

## License

See `package.json` for license and author information.
