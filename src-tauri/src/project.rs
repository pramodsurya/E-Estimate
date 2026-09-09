use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri_plugin_dialog::{DialogExt, FilePath};

use crate::recent::{add_recent, remove_recent};

const FILE_FILTER: (&str, &[&str]) = ("E-Estimate Project", &["eestimate"]);

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavePayload {
    pub data: serde_json::Value,
    pub current_path: Option<String>,
    pub name: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveResult {
    pub canceled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenResult {
    pub canceled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

fn sanitize(name: &str) -> String {
    let cleaned = name
        .replace(['\\', '/', ':', '*', '?', '"', '<', '>', '|'], "_")
        .trim()
        .to_string();
    if cleaned.is_empty() {
        "Project".to_string()
    } else {
        cleaned
    }
}

fn write_project(path: &Path, data: &serde_json::Value) -> Result<(), String> {
    let tmp = path.with_extension(format!(
        "eestimate.{}.tmp",
        std::process::id()
    ));
    let json = serde_json::to_string(data).map_err(|e| e.to_string())?;
    fs::write(&tmp, json).map_err(|e| e.to_string())?;
    fs::rename(&tmp, path).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        e.to_string()
    })
}

fn read_project(path: &Path) -> Result<serde_json::Value, String> {
    let raw = fs::read_to_string(path).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| e.to_string())
}

fn path_from_file(file: FilePath) -> Option<PathBuf> {
    match file {
        FilePath::Path(path) => Some(path),
        FilePath::Url(url) => url.to_file_path().ok(),
    }
}

#[tauri::command]
pub async fn project_save(app: tauri::AppHandle, payload: SavePayload) -> Result<SaveResult, String> {
    let mut target = payload
        .current_path
        .as_ref()
        .map(PathBuf::from);

    if target.is_none() {
        let picked = app
            .dialog()
            .file()
            .set_title("Save Project")
            .set_file_name(&format!("{}.eestimate", sanitize(&payload.name)))
            .add_filter(FILE_FILTER.0, FILE_FILTER.1)
            .blocking_save_file();
        match picked {
            Some(file) => target = path_from_file(file),
            None => return Ok(SaveResult {
                canceled: true,
                path: None,
            }),
        }
    }

    let target = target.ok_or_else(|| "No save path selected.".to_string())?;
    write_project(&target, &payload.data)?;
    add_recent(&app, target.to_string_lossy().to_string(), Some(payload.name))?;
    Ok(SaveResult {
        canceled: false,
        path: Some(target.to_string_lossy().to_string()),
    })
}

#[tauri::command]
pub async fn project_save_as(app: tauri::AppHandle, payload: SavePayload) -> Result<SaveResult, String> {
    let picked = app
        .dialog()
        .file()
        .set_title("Save Project As")
        .set_file_name(&format!("{}.eestimate", sanitize(&payload.name)))
        .add_filter(FILE_FILTER.0, FILE_FILTER.1)
        .blocking_save_file();

    let Some(file) = picked else {
        return Ok(SaveResult {
            canceled: true,
            path: None,
        });
    };
    let target = path_from_file(file).ok_or_else(|| "Invalid save path.".to_string())?;
    write_project(&target, &payload.data)?;
    add_recent(&app, target.to_string_lossy().to_string(), Some(payload.name))?;
    Ok(SaveResult {
        canceled: false,
        path: Some(target.to_string_lossy().to_string()),
    })
}

#[tauri::command]
pub async fn project_open(app: tauri::AppHandle) -> Result<OpenResult, String> {
    let picked = app
        .dialog()
        .file()
        .set_title("Open Project")
        .add_filter(FILE_FILTER.0, FILE_FILTER.1)
        .blocking_pick_file();

    let Some(file) = picked else {
        return Ok(OpenResult {
            canceled: true,
            path: None,
            data: None,
            error: None,
        });
    };
    let path = path_from_file(file).ok_or_else(|| "Invalid open path.".to_string())?;
    open_path_internal(&app, path)
}

#[tauri::command]
pub async fn project_open_path(app: tauri::AppHandle, path: String) -> Result<OpenResult, String> {
    open_path_internal(&app, PathBuf::from(path))
}

fn open_path_internal(app: &tauri::AppHandle, path: PathBuf) -> Result<OpenResult, String> {
    match read_project(&path) {
        Ok(data) => {
            let name = data
                .get("meta")
                .and_then(|m| m.get("name"))
                .and_then(|n| n.as_str())
                .map(str::to_string);
            add_recent(app, path.to_string_lossy().to_string(), name)?;
            Ok(OpenResult {
                canceled: false,
                path: Some(path.to_string_lossy().to_string()),
                data: Some(data),
                error: None,
            })
        }
        Err(err) => {
            remove_recent(app, path.to_string_lossy().to_string())?;
            Ok(OpenResult {
                canceled: false,
                path: Some(path.to_string_lossy().to_string()),
                data: None,
                error: Some(err),
            })
        }
    }
}
