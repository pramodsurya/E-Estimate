//! Native calculation helpers used by the desktop shell.

/// Crate version surfaced to the Tauri shell for diagnostics.
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

pub mod canal;
pub mod rate_analysis;
