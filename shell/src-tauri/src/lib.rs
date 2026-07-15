mod bridge;
mod cdylib_loader;
mod hap_format;
mod hap_manager;
mod hap_protocol;
mod db;

use tauri::{Emitter, Listener};

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
            let data_dir = hap_manager::ensure_data_dir()?;
            db::init(&data_dir)?;
            cdylib_loader::load_modules(&data_dir)?;

            let handle = app.handle().clone();
            app.listen("deep-link://new-url", move |event: tauri::Event| {
                let payload = event.payload();
                if let Some(tool_id) = payload.strip_prefix("hiapphub://tool/") {
                    let tool_id = tool_id.trim_end_matches('/').to_string();
                    let _ = handle.emit("open-tool", &tool_id);
                }
            });

            Ok(())
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
            bridge::hap_list_plugins,
            bridge::hap_install_plugin,
            bridge::db_plugin_get,
            bridge::db_plugin_set,
            bridge::hap_load_plugin_html,
            bridge::hap_open_plugin_window,
            bridge::hap_create_sub_window,
            bridge::hap_close_sub_window,
        ])
        .run(tauri::generate_context!())
        .expect("启动 HiAppHub Shell 失败");
}
