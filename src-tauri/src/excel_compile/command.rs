use super::common::{excel_cache_dir, EXCEL_UNIQUE};
use super::dispatcher::generate_workbook;
use super::models::*;
use base64::Engine;
use std::fs;
use std::sync::atomic::Ordering;
use std::time::Instant;

pub fn excel_compile(payload: ExcelCompileRequest) -> Result<ExcelCompileResult, String> {
    let start = Instant::now();
    let duration_ms = || (start.elapsed().as_secs_f64() * 1000.0 * 100.0).round() / 100.0;
    // `kind` selects the builder; a missing kind means the legacy DATA path,
    // whose bytes are identical to before.
    match generate_workbook(&payload) {
        Ok(bytes) => {
            if payload.prefer_path.unwrap_or(false) {
                let dir = excel_cache_dir()?;
                let n = EXCEL_UNIQUE.fetch_add(1, Ordering::Relaxed);
                let path = dir.join(format!("workbook-{n}.xlsx"));
                fs::write(&path, &bytes).map_err(|e| e.to_string())?;
                return Ok(ExcelCompileResult {
                    ok: true,
                    data: None,
                    file_path: Some(path.to_string_lossy().to_string()),
                    error: None,
                    duration_ms: Some(duration_ms()),
                });
            }
            let b64 = base64::engine::general_purpose::STANDARD.encode(bytes);
            Ok(ExcelCompileResult {
                ok: true,
                data: Some(b64),
                file_path: None,
                error: None,
                duration_ms: Some(duration_ms()),
            })
        }
        Err(msg) => Ok(ExcelCompileResult {
            ok: false,
            data: None,
            file_path: None,
            error: Some(msg),
            duration_ms: Some(duration_ms()),
        }),
    }
}
