mod bridge;
mod bridge_inject;
mod cdylib_loader;
mod hap_format;
mod hap_manager;
mod hap_protocol;
mod db;

use tauri::{Emitter, Listener, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_shell::init())
        .register_asynchronous_uri_scheme_protocol("hap", |_ctx, req, responder| {
            std::thread::spawn(move || {
                hap_protocol::handle_request(req, responder);
            });
        })
        .setup(|app| {
            if let Err(e) = setup_app(app) {
                eprintln!("[setup] initialization failed: {e}");
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                let label = window.label().to_string();
                if let Some(app_id) = label.strip_prefix("plugin-") {
                    let app_id = app_id.split("-sub-").next().unwrap_or(app_id).to_string();
                    let has_remaining = window.app_handle().webview_windows().keys()
                        .any(|k| k != &label && k.starts_with(&format!("plugin-{app_id}")));
                    if !has_remaining {
                        cdylib_loader::cleanup_app_resources(&app_id);
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            bridge::fs_read_text_file,
            bridge::fs_write_text_file,
            bridge::fs_exists,
            bridge::clipboard_read_text,
            bridge::clipboard_write_text,
            bridge::crypto_hash,
            bridge::crypto_random_bytes,
            bridge::hap_list_modules,
            bridge::hap_call_function,
            bridge::hap_reload_modules,
            bridge::hap_list_plugins,
            bridge::hap_lib_usage_stats,
            bridge::hap_install_plugin,
            bridge::db_plugin_get,
            bridge::db_plugin_set,
            bridge::hap_reveal_in_folder,
            bridge::hap_load_plugin_html,
            bridge::hap_open_plugin_window,
            bridge::hap_create_sub_window,
            bridge::hap_close_sub_window,
            bridge::hap_js_log,
            bridge::hap_get_call_logs,
            bridge::get_data_dir,
            bridge::store_auth_data,
            bridge::load_auth_data,
            bridge::clear_auth_data,
        ])
        .run(tauri::generate_context!())
        .expect("failed to start HiAppHub Shell");
}

fn setup_app(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let data_dir = hap_manager::ensure_data_dir()?;

    if let Err(e) = db::init(&data_dir) {
        eprintln!("[setup] db init failed (non-fatal): {e}");
    }

    if let Err(e) = cdylib_loader::load_modules(&data_dir) {
        eprintln!("[setup] module loading failed (non-fatal): {e}");
    }

    let handle = app.handle().clone();
    app.listen("deep-link://new-url", move |event: tauri::Event| {
        let payload = event.payload();
        if let Some(tool_id) = payload.strip_prefix("hiapphub://tool/") {
            let tool_id = tool_id.trim_end_matches('/').to_string();
            let _ = handle.emit("open-tool", &tool_id);
        }
    });

    Ok(())
}
