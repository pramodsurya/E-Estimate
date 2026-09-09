//! Shared Rust core for desktop and future web API layers.
//! Phase 0: skeleton only — business logic remains in TypeScript.

/// Crate version surfaced to the Tauri shell for diagnostics.
pub const VERSION: &str = env!("CARGO_PKG_VERSION");
