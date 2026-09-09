use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::Manager;

const MAX_RECENT: usize = 30;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentEntry {
    pub path: String,
    pub name: String,
    pub opened_at: String,
}

fn store_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|p| p.join("recent-projects.json"))
        .map_err(|e| e.to_string())
}

fn read(app: &tauri::AppHandle) -> Result<Vec<RecentEntry>, String> {
    let file = store_file(app)?;
    if !file.exists() {
        return Ok(vec![]);
    }
    let raw = fs::read_to_string(&file).map_err(|e| e.to_string())?;
    let parsed: serde_json::Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    if let Some(arr) = parsed.as_array() {
        Ok(arr
            .iter()
            .filter_map(|v| serde_json::from_value(v.clone()).ok())
            .collect())
    } else {
        Ok(vec![])
    }
}

fn save(app: &tauri::AppHandle, list: &[RecentEntry]) -> Result<(), String> {
    let file = store_file(app)?;
    if let Some(parent) = file.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(list).map_err(|e| e.to_string())?;
    fs::write(file, json).map_err(|e| e.to_string())
}

fn base_name(path: &str) -> String {
    let file_path = PathBuf::from(path);
    let name = file_path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or(path);
    name.trim_end_matches(".eestimate")
        .trim_end_matches(".EESTIMATE")
        .to_string()
}

pub fn add_recent(
    app: &tauri::AppHandle,
    path: String,
    name: Option<String>,
) -> Result<(), String> {
    let mut list: Vec<RecentEntry> = read(app)?
        .into_iter()
        .filter(|e| e.path != path)
        .collect();
    list.insert(
        0,
        RecentEntry {
            path: path.clone(),
            name: name.unwrap_or_else(|| base_name(&path)),
            opened_at: chrono_now(),
        },
    );
    list.truncate(MAX_RECENT);
    save(app, &list)
}

pub fn remove_recent(app: &tauri::AppHandle, path: String) -> Result<(), String> {
    let list: Vec<RecentEntry> = read(app)?
        .into_iter()
        .filter(|e| e.path != path)
        .collect();
    save(app, &list)
}

fn chrono_now() -> String {
    time::OffsetDateTime::now_utc()
        .format(&time::format_description::well_known::Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".into())
}

#[tauri::command]
pub fn recent_list(app: tauri::AppHandle) -> Result<Vec<RecentEntry>, String> {
    read(&app)
}

#[tauri::command]
pub fn recent_clear(app: tauri::AppHandle) -> Result<Vec<RecentEntry>, String> {
    save(&app, &[])?;
    Ok(vec![])
}
