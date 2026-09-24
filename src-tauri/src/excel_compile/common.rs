use rust_xlsxwriter::{Format, XlsxError};
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::AtomicU64;
use std::sync::Once;

pub(crate) fn val_to_f64(v: &Option<serde_json::Value>) -> f64 {
    match v {
        Some(serde_json::Value::Number(n)) => n.as_f64().unwrap_or(0.0),
        Some(serde_json::Value::String(s)) => {
            let cleaned: String = s
                .chars()
                .filter(|c| c.is_ascii_digit() || *c == '.' || *c == '-')
                .collect();
            cleaned.parse::<f64>().unwrap_or(0.0)
        }
        _ => 0.0,
    }
}

pub(crate) fn val_to_string(v: &Option<serde_json::Value>) -> String {
    match v {
        Some(serde_json::Value::String(s)) => s.clone(),
        Some(serde_json::Value::Number(n)) => n.to_string(),
        _ => String::new(),
    }
}

pub(crate) fn parse_amount_val(v: &serde_json::Value) -> Result<f64, String> {
    match v {
        serde_json::Value::Number(n) => n.as_f64().ok_or_else(|| "not a valid float".into()),
        serde_json::Value::String(s) => {
            let cleaned: String = s
                .chars()
                .filter(|c| c.is_ascii_digit() || *c == '.' || *c == '-')
                .collect();
            cleaned.parse::<f64>().map_err(|e| e.to_string())
        }
        _ => Err("not a number".into()),
    }
}

pub(crate) fn parse_first_number(text: &str) -> Option<f64> {
    let cleaned: String = text.chars().filter(|c| *c != ',').collect();
    let bytes = cleaned.as_bytes();
    let mut i = 0;
    while i < bytes.len() && !(bytes[i].is_ascii_digit() || bytes[i] == b'-' || bytes[i] == b'+') {
        i += 1;
    }
    if i >= bytes.len() {
        return None;
    }
    let mut j = i;
    if bytes[j] == b'-' || bytes[j] == b'+' {
        j += 1;
    }
    while j < bytes.len() && (bytes[j].is_ascii_digit() || bytes[j] == b'.') {
        j += 1;
    }
    cleaned[i..j].parse::<f64>().ok()
}

/// A JSON number, or a display string holding a number â€” else None.
pub(crate) fn json_opt_f64(v: &Option<serde_json::Value>) -> Option<f64> {
    match v {
        Some(serde_json::Value::Number(n)) => n.as_f64(),
        Some(serde_json::Value::String(s)) => parse_first_number(s),
        _ => None,
    }
}

/// 0-based column index -> Excel column letters (0 -> "A").
pub(crate) fn col_letter(col: u16) -> String {
    let mut n = u32::from(col) + 1;
    let mut s = String::new();
    while n > 0 {
        let rem = (n - 1) % 26;
        s.insert(0, (b'A' + rem as u8) as char);
        n = (n - 1) / 26;
    }
    s
}

/// Excel sheet name sanitised like the TS builders: forbids []:*?/\,
/// caps at 31 chars, falls back to "Component".
pub(crate) fn sanitize_sheet_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .filter(|c| !matches!(c, '[' | ']' | ':' | '*' | '?' | '/' | '\\'))
        .collect();
    let trimmed = cleaned.trim();
    let base = if trimmed.is_empty() {
        "Component"
    } else {
        trimmed
    };
    base.chars().take(31).collect()
}

/// Case-insensitive duplicate handling mirroring `uniqueSheetName`.
pub(crate) fn unique_sheet_name(base: &str, used: &mut Vec<String>) -> String {
    let clean = sanitize_sheet_name(base);
    let mut candidate = clean.clone();
    let mut suffix = 2u32;
    while used.iter().any(|u| u.eq_ignore_ascii_case(&candidate)) {
        let tail = format!(" ({})", suffix);
        let keep = 31usize.saturating_sub(tail.chars().count());
        candidate = format!("{}{}", clean.chars().take(keep).collect::<String>(), tail);
        suffix += 1;
    }
    used.push(candidate.clone());
    candidate
}

/// Optional figure: a finite number, else a genuinely empty cell.
pub(crate) fn write_opt_number(
    ws: &mut rust_xlsxwriter::Worksheet,
    row: u32,
    col: u16,
    value: Option<f64>,
    fmt: &Format,
) -> Result<(), XlsxError> {
    match value {
        Some(v) if v.is_finite() => {
            ws.write_number_with_format(row, col, v, fmt)?;
        }
        _ => {
            ws.write_blank(row, col, fmt)?;
        }
    }
    Ok(())
}

pub(crate) static EXCEL_CACHE_INIT: Once = Once::new();
pub(crate) static EXCEL_UNIQUE: AtomicU64 = AtomicU64::new(0);

/// Session cache dir for prefer_path workbooks (own subdir so the Typst and
/// Excel cleaners never wipe each other's files). Cleared once per boot.
pub(crate) fn excel_cache_dir() -> Result<PathBuf, String> {
    let dir = std::env::temp_dir()
        .join("e-estimate-compile-cache")
        .join("excel");
    EXCEL_CACHE_INIT.call_once(|| {
        let _ = fs::remove_dir_all(&dir);
    });
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}
