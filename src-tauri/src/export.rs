use std::fs;
use std::path::PathBuf;

use base64::Engine;
use serde::{Deserialize, Serialize};
use tauri_plugin_dialog::{DialogExt, FilePath};
use tauri_plugin_opener::OpenerExt;

const PDF_FILTER: (&str, &[&str]) = ("PDF Document", &["pdf"]);
const WORKBOOK_FILTER: (&str, &[&str]) = ("Excel Workbook", &["xlsx"]);
const PNG_FILTER: (&str, &[&str]) = ("PNG Image", &["png"]);

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportPayload {
    pub data: String,
    pub name: String,
    pub default_path: Option<String>,
    /// When present, the file at this path is copied to the picked location
    /// instead of decoding `data`. Only paths inside the session compile
    /// cache are accepted; anything else is rejected.
    #[serde(default)]
    pub source_path: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub canceled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
}

fn sanitize(name: &str) -> String {
    let cleaned = name
        .replace(['\\', '/', ':', '*', '?', '"', '<', '>', '|'], "_")
        .trim()
        .to_string();
    if cleaned.is_empty() {
        "Export".to_string()
    } else {
        cleaned
    }
}

fn path_from_file(file: FilePath) -> Option<PathBuf> {
    match file {
        FilePath::Path(path) => Some(path),
        FilePath::Url(url) => url.to_file_path().ok(),
    }
}

#[tauri::command]
pub async fn export_pdf(
    app: tauri::AppHandle,
    payload: ExportPayload,
) -> Result<ExportResult, String> {
    save_binary_export(
        &app,
        "Export PDF",
        payload
            .default_path
            .unwrap_or_else(|| format!("{}.pdf", sanitize(&payload.name))),
        PDF_FILTER,
        ".pdf",
        &payload.data,
        payload.source_path.clone(),
    )
    .await
}

#[tauri::command]
pub async fn export_workbook(
    app: tauri::AppHandle,
    payload: ExportPayload,
) -> Result<ExportResult, String> {
    save_binary_export(
        &app,
        "Export Excel Workbook",
        payload
            .default_path
            .unwrap_or_else(|| format!("{}.xlsx", sanitize(&payload.name))),
        WORKBOOK_FILTER,
        ".xlsx",
        &payload.data,
        payload.source_path.clone(),
    )
    .await
}

#[tauri::command]
pub async fn export_png(
    app: tauri::AppHandle,
    payload: ExportPayload,
) -> Result<ExportResult, String> {
    save_binary_export(
        &app,
        "Export PNG Image",
        payload
            .default_path
            .unwrap_or_else(|| format!("{}.png", sanitize(&payload.name))),
        PNG_FILTER,
        ".png",
        &payload.data,
        payload.source_path.clone(),
    )
    .await
}

/// Session compile outputs live here (`typst_compile` / `excel_compile`
/// prefer_path). Only these files may be used as `source_path`.
fn cache_root() -> PathBuf {
    std::env::temp_dir().join("e-estimate-compile-cache")
}

fn resolve_cached_source(raw: &str) -> Result<PathBuf, String> {
    let candidate = PathBuf::from(raw);
    let root = cache_root();
    let ok = candidate.starts_with(&root)
        && fs::metadata(&candidate)
            .map(|m| m.len() > 0)
            .unwrap_or(false);
    if !ok {
        return Err("source_path is not a current compile output.".to_string());
    }
    Ok(candidate)
}

async fn save_binary_export(
    app: &tauri::AppHandle,
    title: &str,
    default_path: String,
    filter: (&str, &[&str]),
    extension: &str,
    data_b64: &str,
    source_path: Option<String>,
) -> Result<ExportResult, String> {
    let picked = app
        .dialog()
        .file()
        .set_title(title)
        .set_file_name(&default_path)
        .add_filter(filter.0, filter.1)
        .blocking_save_file();

    let Some(file) = picked else {
        return Ok(ExportResult {
            canceled: true,
            path: None,
        });
    };
    let mut target = path_from_file(file).ok_or_else(|| "Invalid export path.".to_string())?;
    let lower = target.to_string_lossy().to_lowercase();
    if !lower.ends_with(extension) {
        target.set_extension(&extension[1..]);
    }

    if let Some(source) = source_path {
        let cached = resolve_cached_source(&source)?;
        fs::copy(&cached, &target).map_err(|e| e.to_string())?;
    } else {
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(data_b64)
            .map_err(|e| e.to_string())?;
        fs::write(&target, bytes).map_err(|e| e.to_string())?;
    }

    Ok(ExportResult {
        canceled: false,
        path: Some(target.to_string_lossy().to_string()),
    })
}

#[tauri::command]
pub async fn export_reveal(app: tauri::AppHandle, path: String) -> Result<(), String> {
    app.opener()
        .reveal_item_in_dir(path)
        .map_err(|e| e.to_string())
}
