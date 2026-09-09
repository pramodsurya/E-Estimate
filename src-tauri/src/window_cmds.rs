use tauri::{AppHandle, Emitter, Manager, WebviewWindow, WindowEvent};

pub fn wire_maximize_events(app: &AppHandle) {
    let app = app.clone();
    if let Some(window) = app.get_webview_window("main") {
        attach_maximize_listener(window);
    }
}

fn attach_maximize_listener(window: WebviewWindow) {
    let window_clone = window.clone();
    window.on_window_event(move |event| {
        if matches!(event, WindowEvent::Resized(_)) {
            let maximized = window_clone.is_maximized().unwrap_or(false);
            let _ = window_clone.emit("window:maximized-changed", maximized);
        }
    });
}

#[tauri::command]
pub fn window_minimize(window: WebviewWindow) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn window_toggle_maximize(window: WebviewWindow) -> Result<(), String> {
    if window.is_maximized().unwrap_or(false) {
        window.unmaximize().map_err(|e| e.to_string())
    } else {
        window.maximize().map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn window_close(window: WebviewWindow) -> Result<(), String> {
    window.close().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn window_is_maximized(window: WebviewWindow) -> Result<bool, String> {
    window.is_maximized().map_err(|e| e.to_string())
}
