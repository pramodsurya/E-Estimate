# E-Estimate 0.1.20

This release includes the pending canal design/export improvements and the
Supabase storage cleanup completed on 12 November 2026.

- Bank Design edits remain drafts until Save & Calculate. Saving applies one
  update; selection and typing avoid unnecessary geometry work.
- Drainage saves reuse the shared quantity schedule across reaches. The local
  61-section/60-reach regression completed in about 0.32 seconds with one build.
- Canal preparation includes eligible bed stripping/refill. Toe ditches follow
  their saved first invert RL and longitudinal grade.
- Bank Excel exports use one calculation sheet per group, unique chainages,
  item-specific Nos., range measurements for constant-section works, and native
  section diagrams with formula reconciliation.
- Removed unused backend archive tables and duplicated MoRTH storage. SOR
  navigation now uses an ordinary view and the existing covering index.
  Database usage decreased from about 1.14 GB to 363 MB. Required source records,
  pricing data and useful performance caches remain.
- Road template defaults use current SOR identities directly.

## Validation

- Full npm test suite passed.
- Renderer production build and complete Node/web TypeScript checks passed.
- Renderer ESLint passed.
- Native estimate-core tests passed: 25 unit tests and 23 bank export tests.
- Native export/app geometry reconciliation fixtures passed.
- Live SOR, Lead, monthly rates, individual costs and catalogue guidance passed
  during the backend cleanup. Source and cache fingerprints were unchanged.
- The optional strict React Compiler ratchet still reports 84 skip diagnostics
  against a stale 63 baseline. A before/after compiler audit found identical
  diagnostics in every modified renderer file. The ratchet was not relaxed.

Versions are synchronized in package.json, package-lock.json, Tauri config,
Cargo.toml and Cargo.lock. GitHub Actions runs the release checks again before
building and uploading the signed Windows installer and automatic-update feed.
