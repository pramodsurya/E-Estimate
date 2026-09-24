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
    if window.is_maximized().map_err(|e| e.to_string())? {
        return window.unmaximize().map_err(|e| e.to_string());
    }

    window.maximize().map_err(|e| e.to_string())?;
    clamp_to_work_area(&window)
}

/// Keep a maximized frameless window out from behind the Windows taskbar.
///
/// Frameless (`decorations: false`) windows miss Windows' normal
/// maximize-to-work-area clipping, so `maximize()` alone sizes the window to
/// the full monitor and the bottom edge ends up behind the taskbar. Correct
/// the bounds to the monitor's work area afterwards; calling `maximize()`
/// first (rather than only `set_size`/`set_position`) keeps the OS maximized
/// flag correct so `unmaximize()`/`is_maximized()` keep working normally.
/// No-op off Windows.
pub fn clamp_to_work_area(window: &WebviewWindow) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        if let Ok(Some(monitor)) = window.current_monitor() {
            let area = monitor.work_area();
            window
                .set_position(area.position)
                .map_err(|e| e.to_string())?;
            window.set_size(area.size).map_err(|e| e.to_string())?;
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = window;
    }
    Ok(())
}

#[tauri::command]
pub fn window_close(window: WebviewWindow) -> Result<(), String> {
    window.close().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn window_is_maximized(window: WebviewWindow) -> Result<bool, String> {
    window.is_maximized().map_err(|e| e.to_string())
}
