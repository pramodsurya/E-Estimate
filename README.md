# E-Estimate

E-Estimate is a desktop app for construction cost estimation (Telangana SOR/SSR).

Quick start

```bash
npm install
npm run dev
```

Build and package (Windows x64)

```powershell
npm run build
npm run dist:win
```

Download

The latest Windows installer is available from the project's GitHub Releases. Current packaged
version: v0.1.4

- Releases page: https://github.com/pramodsurya/E-Estimate/releases
- Direct download: https://github.com/pramodsurya/E-Estimate/releases/download/v0.1.4/E-Estimate-0.1.4-windows-x64.exe

Configuration

- Use environment variables for runtime secrets and service endpoints. Do not commit secret keys.
- Common variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY`, `VITE_OSRM_URL`.

Project layout (high level)

```
src/
  main/       Electron main process and project I/O
  preload/    contextBridge API
  renderer/   React UI and frontend source
```

Security and release notes

- Do NOT store API keys, private tokens, or production credentials in the repository.
- Ensure Row Level Security is enabled for any Supabase public schema used in production.
- Add appropriate Content-Security-Policy and secure response headers before shipping releases.

Where to contribute

- Issues and pull requests: https://github.com/pramodsurya/E-Estimate

License

See `package.json` for license and author information.
