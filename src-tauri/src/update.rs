//! Application auto-update (tauri-plugin-updater).
//!
//! The renderer drives the whole flow through `window.api.update.*`:
//! check → (available) → auto-download → (downloaded) → install. It never
//! imports the updater plugin directly; it only listens for the colon-named
//! events below and reads `update_status` to catch up after a restart.
//!
//! Lifecycle / events emitted to the renderer:
//!   update:checking-for-update  (no payload)
//!   update:available            (UpdateInfo)
//!   update:not-available        (no payload)
//!   update:download-progress    ({ percent: number })
//!   update:downloaded           (UpdateInfo)
//!   update:error                (string message)
//!
//! `update_status` returns { stage, info, percent, message } so the notification
//! centre can reconstruct the last event if React mounts after it fired.

use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};
use time::format_description::well_known::Rfc3339;

#[derive(Default, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub version: Option<String>,
    pub release_date: Option<String>,
    pub release_name: Option<String>,
}

#[derive(Default, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatusInfo {
    pub stage: String,
    pub info: Option<UpdateInfo>,
    pub percent: Option<f64>,
    pub message: Option<String>,
}

/// The update that is currently available / downloading, plus its bytes once
/// downloaded. Install consumes it so a second "Install" does nothing.
#[derive(Default)]
pub struct UpdateState(pub Mutex<Option<PendingUpdate>>);

#[derive(Clone)]
pub struct PendingUpdate {
    pub update: Update,
    pub bytes: Option<Vec<u8>>,
}

/// Last known status so `update_status` can answer a late-arriving renderer.
#[derive(Default)]
pub struct StatusState(pub Mutex<UpdateStatusInfo>);

impl StatusState {
    pub fn set(&self, status: UpdateStatusInfo) {
        *self.0.lock().unwrap() = status;
    }

    pub fn get(&self) -> UpdateStatusInfo {
        self.0.lock().unwrap().clone()
    }
}

impl UpdateState {
    pub fn set_pending(&self, pending: Option<PendingUpdate>) {
        *self.0.lock().unwrap() = pending;
    }

    pub fn pending(&self) -> Option<PendingUpdate> {
        self.0.lock().unwrap().clone()
    }

    pub fn take_pending(&self) -> Option<PendingUpdate> {
        self.0.lock().unwrap().take()
    }

    pub fn set_bytes(&self, bytes: Vec<u8>) {
        if let Some(pending) = self.0.lock().unwrap().as_mut() {
            pending.bytes = Some(bytes);
        }
    }
}

pub fn init_state(app: &tauri::App) {
    app.manage(StatusState::default());
    app.manage(UpdateState::default());
}

fn info_from_update(update: &Update) -> UpdateInfo {
    UpdateInfo {
        version: Some(update.version.clone()),
        release_date: update.date.map(|d| d.format(&Rfc3339).unwrap_or_default()),
        release_name: update.body.clone(),
    }
}

fn set_status(app: &AppHandle, status: UpdateStatusInfo) {
    if let Some(state) = app.try_state::<StatusState>() {
        state.set(status);
    }
}

fn current_status(app: &AppHandle) -> UpdateStatusInfo {
    app.try_state::<StatusState>()
        .map(|state| state.get())
        .unwrap_or_default()
}

/// Store the failure and tell the renderer, then return the message to the caller.
fn fail(app: &AppHandle, message: String) -> String {
    set_status(
        app,
        UpdateStatusInfo {
            stage: "error".into(),
            info: None,
            percent: None,
            message: Some(message.clone()),
        },
    );
    let _ = app.emit("update:error", message.clone());
    message
}

fn percent_of(done: usize, total: Option<u64>) -> f64 {
    match total {
        Some(0) | None => 0.0,
        Some(total) => (done as f64 / total as f64 * 100.0).min(100.0),
    }
}

#[tauri::command]
pub fn update_status(app: AppHandle) -> UpdateStatusInfo {
    current_status(&app)
}

/// Check for an update; if one exists, announce it and start downloading. The
/// install step is deferred until the user chooses "Restart & install".
#[tauri::command]
pub async fn update_check(app: AppHandle) -> Result<(), String> {
    set_status(
        &app,
        UpdateStatusInfo {
            stage: "checking".into(),
            ..Default::default()
        },
    );
    let _ = app.emit("update:checking-for-update", ());

    let updater = match app.updater() {
        Ok(updater) => updater,
        Err(e) => return Err(fail(&app, format!("Update service is unavailable: {e}"))),
    };

    let update = match updater.check().await {
        Ok(update) => update,
        Err(e) => return Err(fail(&app, format!("Update check failed: {e}"))),
    };

    let Some(update) = update else {
        set_status(
            &app,
            UpdateStatusInfo {
                stage: "not-available".into(),
                ..Default::default()
            },
        );
        let _ = app.emit("update:not-available", ());
        return Ok(());
    };

    let info = info_from_update(&update);
    set_status(
        &app,
        UpdateStatusInfo {
            stage: "available".into(),
            info: Some(info.clone()),
            ..Default::default()
        },
    );
    let _ = app.emit("update:available", info.clone());

    if let Some(state) = app.try_state::<UpdateState>() {
        state.set_pending(Some(PendingUpdate {
            update: update.clone(),
            bytes: None,
        }));
    }

    download(&app, update).await
}

/// Force a download when an update has been found but not fully fetched yet.
#[tauri::command]
pub async fn update_download(app: AppHandle) -> Result<(), String> {
    let update = {
        let Some(state) = app.try_state::<UpdateState>() else {
            return Err("No pending update".into());
        };
        let pending = state.pending();
        match pending.and_then(|p| p.bytes.is_none().then_some(p.update)) {
            Some(update) => update,
            None => return Err("No pending download".into()),
        }
    };
    download(&app, update).await
}

/// Install a downloaded update. On Windows the installer exits the app itself;
/// elsewhere we relaunch so the new version boots.
#[tauri::command]
pub fn update_install(app: AppHandle) -> Result<(), String> {
    let pending = {
        let Some(state) = app.try_state::<UpdateState>() else {
            return Err("No pending update".into());
        };
        state.take_pending()
    };
    let Some(pending) = pending else {
        return Err("No downloaded update to install".into());
    };
    let Some(bytes) = pending.bytes else {
        return Err("The update has not finished downloading".into());
    };
    if let Err(e) = pending.update.install(&bytes) {
        return Err(fail(&app, format!("Update install failed: {e}")));
    }
    // Windows exits here; other platforms need an explicit relaunch.
    #[cfg(not(target_os = "windows"))]
    app.restart();
    Ok(())
}

async fn download(app: &AppHandle, update: Update) -> Result<(), String> {
    set_status(
        app,
        UpdateStatusInfo {
            stage: "downloading".into(),
            info: Some(info_from_update(&update)),
            percent: Some(0.0),
            ..Default::default()
        },
    );

    let app_progress = app.clone();
    let app_finish = app.clone();
    let mut downloaded: usize = 0;
    let mut total: Option<u64> = None;

    let bytes = match update
        .download(
            |chunk, content_length| {
                total = content_length.or(total);
                downloaded += chunk;
                let percent = percent_of(downloaded, total);
                let _ = app_progress.emit(
                    "update:download-progress",
                    serde_json::json!({ "percent": percent }),
                );
                set_status(
                    &app_progress,
                    UpdateStatusInfo {
                        stage: "downloading".into(),
                        info: Some(info_from_update(&update)),
                        percent: Some(percent),
                        ..Default::default()
                    },
                );
            },
            || {
                let _ = app_finish.emit("update:downloaded", info_from_update(&update));
                set_status(
                    &app_finish,
                    UpdateStatusInfo {
                        stage: "downloaded".into(),
                        info: Some(info_from_update(&update)),
                        percent: Some(100.0),
                        ..Default::default()
                    },
                );
            },
        )
        .await
    {
        Ok(bytes) => bytes,
        Err(e) => return Err(fail(app, format!("Update download failed: {e}"))),
    };

    if let Some(state) = app.try_state::<UpdateState>() {
        state.set_bytes(bytes);
    }
    Ok(())
}
