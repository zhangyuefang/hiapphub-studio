mod bridge;
mod cdylib_loader;
mod hap_format;
mod hap_manager;
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
                let url = req.uri().to_string();
                let path = url.strip_prefix("hap://localhost/").unwrap_or(&url);
                let decoded = urlencoding::decode(path).unwrap_or_default();
                let file_path = hap_manager::data_dir()
                    .join("plugins/installed")
                    .join(decoded.as_ref());

                if file_path.exists() {
                    let data = std::fs::read(&file_path).unwrap_or_default();
                    let mime = match file_path.extension().and_then(|e| e.to_str()) {
                        Some("html") => "text/html",
                        Some("js") => "application/javascript",
                        Some("css") => "text/css",
                        Some("json") => "application/json",
                        Some("wasm") => "application/wasm",
                        Some("png") => "image/png",
                        Some("svg") => "image/svg+xml",
                        Some("jpg" | "jpeg") => "image/jpeg",
                        _ => "application/octet-stream",
                    };
                    let resp = tauri::http::Response::builder()
                        .status(200)
                        .header("Content-Type", mime)
                        .header("Access-Control-Allow-Origin", "*")
                        .body(data)
                        .unwrap();
                    responder.respond(resp);
                } else {
                    let resp = tauri::http::Response::builder()
                        .status(404)
                        .body(b"Not Found".to_vec())
                        .unwrap();
                    responder.respond(resp);
                }
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
