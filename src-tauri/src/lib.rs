#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod bund;
mod export;
mod image;
mod project;
mod recent;
mod typst_compile;
mod update;
mod window_cmds;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            update::init_state(app);
            window_cmds::wire_maximize_events(app.handle());
            // Check for updates once at startup (release builds only) so the
            // notification centre can surface an installer before the user asks.
            #[cfg(not(debug_assertions))]
            {
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    let _ = update::update_check(handle).await;
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            window_cmds::window_minimize,
            window_cmds::window_toggle_maximize,
            window_cmds::window_close,
            window_cmds::window_is_maximized,
            project::project_save,
            project::project_save_as,
            project::project_open,
            project::project_open_path,
            recent::recent_list,
            recent::recent_clear,
            bund::bund_simulate,
            bund::bund_cancel,
            typst_compile::typst_compile,
            image::image_embed_remote,
            export::export_pdf,
            export::export_workbook,
            export::export_reveal,
            update::update_status,
            update::update_check,
            update::update_download,
            update::update_install,
        ])
        .run(tauri::generate_context!())
        .expect("error while running E-Estimate (Tauri)");
}
