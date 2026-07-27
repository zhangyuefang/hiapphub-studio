mod bridge;
mod bridge_inject;
mod cdylib_loader;
mod hap_format;
mod hap_manager;
mod hap_protocol;
mod db;
mod ipc_server;
mod process_manager;

use tauri::{Emitter, Listener, Manager};

macro_rules! log_shell {
    ($($arg:tt)*) => {{ let _ = std::io::Write::write_fmt(&mut std::io::stderr(), format_args!($($arg)*)); let _ = std::io::Write::write_all(&mut std::io::stderr(), b"\n"); }};
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
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
                log_shell!("[setup] initialization failed: {e}");
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
            bridge::hap_open_app,
            bridge::hap_open_plugin_window,
            bridge::hap_launch_independent_app,
            bridge::hap_create_child_window,
            bridge::hap_create_sub_window,
            bridge::hap_close_sub_window,
            bridge::hap_js_log,
            bridge::hap_get_call_logs,
            bridge::get_data_dir,
            bridge::store_auth_data,
            bridge::load_auth_data,
            bridge::clear_auth_data,
            bridge::set_locale,
        ])
        .run(tauri::generate_context!())
        .expect("failed to start HiAppHub Shell");
}

fn setup_app(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let data_dir = hap_manager::ensure_data_dir()?;

    cdylib_loader::set_app_handle(app.handle().clone());

    if let Err(e) = db::init(&data_dir) {
        log_shell!("[setup] db init failed (non-fatal): {e}");
    }

    if let Err(e) = cdylib_loader::load_modules(&data_dir) {
        log_shell!("[setup] module loading failed (non-fatal): {e}");
    }

    let ipc = std::sync::Arc::new(ipc_server::IpcServer::new());
    let open_app_rx = ipc.setup_open_app_channel();
    if let Err(e) = ipc.start() {
        log_shell!("[setup] IPC server start failed (non-fatal): {e}");
    } else {
        log_shell!("[setup] IPC server listening on {}", ipc.socket_path().display());
    }

    let pm = std::sync::Arc::new(process_manager::ProcessManager::new());
    let recovered = pm.recover_from_pid_files();
    if !recovered.is_empty() {
        log_shell!("[setup] recovered {} app process(es) from pid files", recovered.len());
    }
    pm.start_monitor(ipc.clone());

    {
        let pm_for_open = pm.clone();
        let ipc_for_open = ipc.clone();
        std::thread::spawn(move || {
            while let Ok(payload) = open_app_rx.recv() {
                let (app_id, params_json) = if let Some(idx) = payload.find('|') {
                    (payload[..idx].to_string(), Some(payload[idx+1..].to_string()))
                } else {
                    (payload, None)
                };
                log_shell!("[open-app-worker] launching: {app_id}");
                let hap_path = hap_manager::data_dir().join("app").join(format!("{app_id}.hap"));
                if !hap_path.exists() {
                    log_shell!("[open-app-worker] app '{app_id}' not installed");
                    continue;
                }
                let manifest = match crate::hap_format::HapReader::open_file(&hap_path) {
                    Ok(mut reader) => match reader.read_file("manifest.json") {
                        Ok(data) => {
                            let content = String::from_utf8_lossy(&data);
                            serde_json::from_str::<serde_json::Value>(&content).unwrap_or_default()
                        }
                        Err(e) => { log_shell!("[open-app-worker] read manifest: {e}"); continue; }
                    },
                    Err(e) => { log_shell!("[open-app-worker] open hap: {e}"); continue; }
                };

                if let Some(ref json_str) = params_json {
                    if let Ok(params) = serde_json::from_str::<serde_json::Value>(json_str) {
                        if params.get("entry").is_some() {
                            let overrides = crate::process_manager::LaunchOverrides {
                                url: params["entry"].as_str().map(|s| s.to_string()),
                                app_id_override: params["appId"].as_str().map(|s| s.to_string()),
                                dev_port: params["devPort"].as_u64().map(|p| p as u16),
                                name: params["name"].as_str().map(|s| s.to_string()),
                                window_config: params.get("windowConfig").map(|v| v.to_string()),
                                manifest_path: params["manifestPath"].as_str().map(|s| s.to_string()),
                            };
                            if let Err(e) = pm_for_open.launch_app_with_overrides(
                                &app_id,
                                &hap_path.to_string_lossy(),
                                &manifest,
                                &ipc_for_open,
                                &overrides,
                            ) {
                                log_shell!("[open-app-worker] launch with overrides failed: {e}");
                            }
                            continue;
                        }
                    }
                }

                if let Err(e) = pm_for_open.launch_app(
                    &app_id,
                    &hap_path.to_string_lossy(),
                    &manifest,
                    &ipc_for_open,
                ) {
                    log_shell!("[open-app-worker] launch failed: {e}");
                }
            }
        });
    }

    app.manage(ipc);
    app.manage(pm);

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
