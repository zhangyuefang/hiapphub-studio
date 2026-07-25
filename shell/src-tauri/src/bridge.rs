use std::fs;
use std::path::Path;
use std::sync::{LazyLock, Mutex};
use std::collections::VecDeque;
use serde_json::Value;
use tauri::Manager;

use crate::bridge_inject;
use crate::db;
use crate::hap_manager;
use crate::cdylib_loader;
use crate::ipc_server::IpcServer;
use crate::process_manager::ProcessManager;

#[derive(serde::Serialize, Clone)]
pub struct HalCallLog {
    time: u64,
    app_id: String,
    module: String,
    function: String,
    params: String,
    result: String,
    elapsed_ms: u64,
    success: bool,
}

static CALL_LOGS: LazyLock<Mutex<VecDeque<HalCallLog>>> = LazyLock::new(|| Mutex::new(VecDeque::new()));
const MAX_LOGS: usize = 500;

#[tauri::command]
pub fn fs_read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("read failed: {e}"))
}

#[tauri::command]
pub fn fs_write_text_file(path: String, content: String) -> Result<(), String> {
    if let Some(parent) = std::path::Path::new(&path).parent() {
        fs::create_dir_all(parent).map_err(|e| format!("mkdir failed: {e}"))?;
    }
    fs::write(&path, &content).map_err(|e| format!("write failed: {e}"))
}

#[tauri::command]
pub fn fs_exists(path: String) -> bool {
    std::path::Path::new(&path).exists()
}

#[tauri::command]
pub fn clipboard_read_text() -> Result<String, String> {
    Err("clipboard cdylib module not loaded".into())
}

#[tauri::command]
pub fn clipboard_write_text(_text: String) -> Result<(), String> {
    Err("clipboard cdylib module not loaded".into())
}

#[tauri::command]
pub fn crypto_hash(_algorithm: String, _data: String) -> Result<String, String> {
    Err("crypto cdylib module not loaded".into())
}

#[tauri::command]
pub fn crypto_random_bytes(length: usize) -> Result<Vec<u8>, String> {
    let mut buf = vec![0u8; length];
    getrandom::fill(&mut buf).map_err(|e| format!("random bytes generation failed: {e}"))?;
    Ok(buf)
}

#[tauri::command]
pub fn hap_list_modules() -> Result<Vec<cdylib_loader::ModuleDescriptor>, String> {
    Ok(cdylib_loader::get_all_descriptors())
}

#[tauri::command]
pub fn hap_call_function(window: tauri::WebviewWindow, module_name: String, symbol_name: String, params_json: String) -> Result<String, String> {
    let label = window.label();
    let app_id_str;
    if label.starts_with("plugin-") {
        app_id_str = label.strip_prefix("plugin-")
            .unwrap_or(label)
            .split("-sub-")
            .next()
            .unwrap_or(label)
            .to_string();
        let module_perm = cdylib_loader::get_module_permission(&module_name);
        if let Some(perm) = module_perm {
            if !perm.is_empty() && !app_has_permission(&app_id_str, &perm) {
                return Err(format!("app '{app_id_str}' lacks '{perm}' permission to call module '{module_name}'"));
            }
        }
    } else {
        app_id_str = "shell".to_string();
    }

    let enriched_params = {
        if let Ok(mut obj) = serde_json::from_str::<serde_json::Value>(&params_json) {
            if let Some(map) = obj.as_object_mut() {
                map.insert("_caller".to_string(), serde_json::Value::String(label.to_string()));
            }
            serde_json::to_string(&obj).unwrap_or_else(|_| params_json.clone())
        } else {
            params_json.clone()
        }
    };

    let start = std::time::Instant::now();
    let result = cdylib_loader::call_function(&module_name, &symbol_name, &enriched_params);

    let skip_log = app_id_str == "hiapphub-devtools" && module_name == "webserver";
    if !skip_log {
        let fn_name = symbol_name.strip_prefix(&format!("hap_{}_", module_name))
            .unwrap_or(&symbol_name).to_string();
        let params_preview = if params_json.len() > 200 {
            let end = params_json.floor_char_boundary(200);
            format!("{}...", &params_json[..end])
        } else {
            params_json.clone()
        };
        let result_preview = match &result {
            Ok(r) => if r.len() > 200 { let end = r.floor_char_boundary(200); format!("{}...", &r[..end]) } else { r.clone() },
            Err(e) => format!("ERR: {}", if e.len() > 150 { let end = e.floor_char_boundary(150); &e[..end] } else { e }),
        };
        let log = HalCallLog {
            time: std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis() as u64,
            app_id: app_id_str,
            module: module_name.clone(),
            function: fn_name,
            params: params_preview,
            result: result_preview,
            elapsed_ms: start.elapsed().as_millis() as u64,
            success: result.is_ok(),
        };
        let mut logs = CALL_LOGS.lock().unwrap();
        if logs.len() >= MAX_LOGS { logs.pop_front(); }
        logs.push_back(log);
    }

    result
}

fn app_has_permission(app_id: &str, required: &str) -> bool {
    let plugins = hap_manager::list_installed_plugins().unwrap_or_default();
    for p in &plugins {
        if p["id"].as_str() == Some(app_id) {
            if let Some(perms) = p["permissions"].as_array() {
                return perms.iter().any(|v| {
                    v.as_str().is_some_and(|s| s == required || s.starts_with(&format!("{required}:")))
                });
            }
            return false;
        }
    }
    false
}

#[tauri::command]
pub fn hap_js_log(msg: String) {
    eprintln!("[JS] {msg}");
}

#[tauri::command]
pub fn hap_get_call_logs(since: Option<u64>) -> Vec<HalCallLog> {
    let logs = CALL_LOGS.lock().unwrap();
    let since_ms = since.unwrap_or(0);
    logs.iter().filter(|l| l.time > since_ms).cloned().collect()
}

#[tauri::command]
pub fn hap_reload_modules() -> Result<cdylib_loader::ReloadResult, String> {
    let data_dir = hap_manager::data_dir();
    cdylib_loader::reload_modules(&data_dir).map_err(|e| format!("reload failed: {e}"))
}

#[tauri::command]
pub fn hap_list_plugins() -> Result<Vec<Value>, String> {
    hap_manager::list_installed_plugins()
}

#[tauri::command]
pub fn hap_lib_usage_stats() -> Result<Value, String> {
    let plugins = hap_manager::list_installed_plugins().unwrap_or_default();
    let modules = cdylib_loader::get_all_descriptors();
    let mut stats = serde_json::Map::new();

    for m in &modules {
        let mut apps = Vec::new();
        for p in &plugins {
            let perms = p["permissions"].as_array();
            let has_perm = perms.is_some_and(|arr| {
                arr.iter().any(|v| v.as_str().is_some_and(|s| s == m.permission || s.starts_with(&format!("{}:", m.permission))))
            });
            let has_dep = p["dependencies"]["hal"].as_array().is_some_and(|deps| {
                deps.iter().any(|d| {
                    (m.uuid.is_some() && d["uuid"].as_str() == m.uuid.as_deref()) || d["id"].as_str().is_some_and(|id| id == format!("hap-mod-{}", m.name))
                })
            });
            if has_perm || has_dep {
                let app_id = p["id"].as_str().unwrap_or("unknown");
                let app_name = p["name"].as_str().unwrap_or(app_id);
                apps.push(serde_json::json!({ "id": app_id, "name": app_name }));
            }
        }
        stats.insert(m.name.clone(), Value::Array(apps));
    }
    Ok(Value::Object(stats))
}

#[tauri::command]
pub fn get_data_dir() -> String {
    hap_manager::data_dir().to_string_lossy().to_string()
}

#[tauri::command]
pub fn store_auth_data(data: String) -> Result<(), String> {
    let path = hap_manager::data_dir().join("config").join("auth.json");
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("mkdir failed: {e}"))?;
    }
    std::fs::write(&path, &data).map_err(|e| format!("write failed: {e}"))
}

#[tauri::command]
pub fn load_auth_data() -> Result<Option<String>, String> {
    let path = hap_manager::data_dir().join("config").join("auth.json");
    if !path.exists() {
        return Ok(None);
    }
    std::fs::read_to_string(&path)
        .map(Some)
        .map_err(|e| format!("read failed: {e}"))
}

#[tauri::command]
pub fn clear_auth_data() -> Result<(), String> {
    let path = hap_manager::data_dir().join("config").join("auth.json");
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| format!("delete failed: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
pub fn hap_install_plugin(hap_path: String) -> Result<Value, String> {
    hap_manager::install_from_hap(&hap_path)
}

#[tauri::command]
pub fn db_plugin_get(plugin_id: String, key: String) -> Result<Option<String>, String> {
    db::plugin_kv_get(&plugin_id, &key)
}

#[tauri::command]
pub fn db_plugin_set(plugin_id: String, key: String, value: String) -> Result<(), String> {
    db::plugin_kv_set(&plugin_id, &key, &value)
}

fn cleanup_plugin_trays(_plugin_id: &str) {
    use crate::cdylib_loader;
    if let Ok(result) = cdylib_loader::call_function("tray", "hap_tray_list", "{}") {
        if let Ok(list) = serde_json::from_str::<serde_json::Value>(&result) {
            if let Some(arr) = list.as_array() {
                for item in arr {
                    if let Some(tid) = item["tray_id"].as_str() {
                        let arg = format!("{{\"tray_id\":\"{}\"}}", tid);
                        let _ = cdylib_loader::call_function("tray", "hap_tray_destroy", &arg);
                    }
                }
            }
        }
    }
}

#[tauri::command]
pub fn hap_open_app(
    app: tauri::AppHandle,
    plugin_id: String,
    plugin_name: String,
    params_json: Option<String>,
) -> Result<(), String> {
    let pm = app.state::<std::sync::Arc<ProcessManager>>();
    if pm.is_host_available() {
        hap_launch_independent_app_with_params(app, plugin_id, params_json)
    } else {
        hap_open_plugin_window(app, plugin_id, plugin_name, None, None)
    }
}

fn hap_launch_independent_app_with_params(
    app: tauri::AppHandle,
    plugin_id: String,
    params_json: Option<String>,
) -> Result<(), String> {
    let hap_path = hap_manager::data_dir().join("app").join(format!("{plugin_id}.hap"));
    if !hap_path.exists() {
        return Err(format!("app '{plugin_id}' not installed"));
    }

    let manifest = {
        let mut reader = crate::hap_format::HapReader::open_file(&hap_path)
            .map_err(|e| format!("{e}"))?;
        let data = reader.read_file("manifest.json")
            .map_err(|e| format!("{e}"))?;
        let content = String::from_utf8(data).map_err(|e| format!("{e}"))?;
        serde_json::from_str::<serde_json::Value>(&content)
            .map_err(|e| format!("manifest parse: {e}"))?
    };

    let ipc = app.state::<std::sync::Arc<IpcServer>>();
    let pm = app.state::<std::sync::Arc<ProcessManager>>();

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
                return pm.launch_app_with_overrides(
                    &plugin_id,
                    &hap_path.to_string_lossy(),
                    &manifest,
                    &ipc,
                    &overrides,
                );
            }
        }
    }

    pm.launch_app(
        &plugin_id,
        &hap_path.to_string_lossy(),
        &manifest,
        &ipc,
    )
}

#[tauri::command]
pub fn hap_launch_independent_app(
    app: tauri::AppHandle,
    plugin_id: String,
) -> Result<(), String> {
    let hap_path = hap_manager::data_dir().join("app").join(format!("{plugin_id}.hap"));
    if !hap_path.exists() {
        return Err(format!("app '{plugin_id}' not installed"));
    }

    let manifest = {
        let mut reader = crate::hap_format::HapReader::open_file(&hap_path)
            .map_err(|e| format!("{e}"))?;
        let data = reader.read_file("manifest.json")
            .map_err(|e| format!("{e}"))?;
        let content = String::from_utf8(data).map_err(|e| format!("{e}"))?;
        serde_json::from_str::<serde_json::Value>(&content)
            .map_err(|e| format!("manifest parse: {e}"))?
    };

    let ipc = app.state::<std::sync::Arc<IpcServer>>();
    let pm = app.state::<std::sync::Arc<ProcessManager>>();

    pm.launch_app(
        &plugin_id,
        &hap_path.to_string_lossy(),
        &manifest,
        &ipc,
    )
}

#[tauri::command]
pub fn hap_open_plugin_window(
    app: tauri::AppHandle,
    plugin_id: String,
    plugin_name: String,
    width: Option<f64>,
    height: Option<f64>,
) -> Result<(), String> {
    crate::hap_protocol::invalidate_cache(&plugin_id);
    let url = format!("hap://localhost/{plugin_id}/index.html");

    let hap_path = hap_manager::data_dir().join("app").join(format!("{plugin_id}.hap"));
    let manifest_json = if hap_path.exists() {
        crate::hap_format::HapReader::open_file(&hap_path).ok()
            .and_then(|mut r| r.read_file("manifest.json").ok())
            .and_then(|d| String::from_utf8(d).ok())
            .and_then(|s| serde_json::from_str::<Value>(&s).ok())
    } else {
        None
    };

    let multi_instance = manifest_json.as_ref()
        .and_then(|m| m["multi_instance"].as_bool())
        .unwrap_or(false);

    let label = if multi_instance {
        let base = format!("plugin-{plugin_id}");
        let mut n = 1u32;
        loop {
            let candidate = format!("{base}-{n}");
            if app.get_webview_window(&candidate).is_none() {
                break candidate;
            }
            n += 1;
        }
    } else {
        let lbl = format!("plugin-{plugin_id}");
        if let Some(existing) = app.get_webview_window(&lbl) {
            if existing.is_minimized().unwrap_or(false) {
                let _ = existing.unminimize();
            }
            if !existing.is_visible().unwrap_or(true) {
                let _ = existing.show();
            }
            let _: () = existing.set_focus().map_err(|e| format!("{e}"))?;
            return Ok(());
        }
        lbl
    };

    let win_cfg = manifest_json.as_ref()
        .and_then(|m| m["windows"].as_array().and_then(|arr| arr.first().cloned()));

    let w = win_cfg.as_ref().and_then(|c| c["width"].as_f64()).or(width).unwrap_or(900.0);
    let h = win_cfg.as_ref().and_then(|c| c["height"].as_f64()).or(height).unwrap_or(640.0);
    let min_w = win_cfg.as_ref().and_then(|c| c["minWidth"].as_f64()).unwrap_or(400.0);
    let min_h = win_cfg.as_ref().and_then(|c| c["minHeight"].as_f64()).unwrap_or(300.0);
    let decorations = win_cfg.as_ref().and_then(|c| c["decorations"].as_bool()).unwrap_or(true);
    let resizable = win_cfg.as_ref().and_then(|c| c["resizable"].as_bool()).unwrap_or(true);
    let title = win_cfg.as_ref().and_then(|c| c["title"].as_str().map(String::from)).unwrap_or(plugin_name);

    let title_bar_style = win_cfg.as_ref().and_then(|c| c["titleBarStyle"].as_str()).unwrap_or("default");
    let hidden_title = win_cfg.as_ref().and_then(|c| c["hiddenTitle"].as_bool()).unwrap_or(false);

    let bridge_script = bridge_inject::generate_bridge_script(&plugin_id);
    let mut builder = tauri::WebviewWindowBuilder::new(&app, &label, tauri::WebviewUrl::External(url.parse().unwrap()))
        .title(&title)
        .initialization_script(&bridge_script)
        .inner_size(w, h)
        .min_inner_size(min_w, min_h)
        .decorations(decorations)
        .resizable(resizable)
        .skip_taskbar(false)
        .center();

    if hidden_title {
        builder = builder.hidden_title(true);
    }

    #[cfg(target_os = "macos")]
    {
        use tauri::TitleBarStyle;
        let style = match title_bar_style.to_lowercase().as_str() {
            "overlay" => TitleBarStyle::Overlay,
            "transparent" => TitleBarStyle::Transparent,
            _ => TitleBarStyle::Visible,
        };
        builder = builder.title_bar_style(style);

        if let Some(pos) = win_cfg.as_ref().and_then(|c| c.get("trafficLightPosition")) {
            let x = pos["x"].as_f64().unwrap_or(13.0) as f32;
            let y = pos["y"].as_f64().unwrap_or(24.0) as f32;
            builder = builder.traffic_light_position(tauri::LogicalPosition::new(x, y));
        }
    }

    let win = builder.build()
        .map_err(|e| format!("window creation failed: {e}"))?;

    {
        let win_clone = win.clone();
        let plugin_id_clone = plugin_id.to_string();
        win.on_window_event(move |event| {
            match event {
                #[cfg(target_os = "macos")]
                tauri::WindowEvent::Resized(_) => {
                    let is_fs = win_clone.is_fullscreen().unwrap_or(false);
                    let is_max = win_clone.is_maximized().unwrap_or(false);
                    let js = format!(
                        "window.__hapWindowState={{isFullscreen:{},isMaximized:{}}};window.dispatchEvent(new Event('hap-window-state'))",
                        is_fs, is_max
                    );
                    let _ = win_clone.eval(&js);
                }
                tauri::WindowEvent::Destroyed => {
                    cleanup_plugin_trays(&plugin_id_clone);
                }
                _ => {}
            }
        });
    }

    Ok(())
}

#[tauri::command]
pub fn hap_create_child_window(
    app: tauri::AppHandle,
    plugin_id: String,
    label: String,
    route: Option<String>,
    title: Option<String>,
    width: Option<f64>,
    height: Option<f64>,
    decorations: Option<bool>,
    resizable: Option<bool>,
    #[allow(unused)]
    transparent: Option<bool>,
    hidden_title: Option<bool>,
    title_bar_style: Option<String>,
    anchor_right: Option<f64>,
) -> Result<(), String> {
    let safe_label = label.replace('.', "_");
    let win_label = format!("plugin-{plugin_id}-{safe_label}");

    if let Some(existing) = app.get_webview_window(&win_label) {
        let _ = existing.set_focus();
        return Ok(());
    }

    let route_path = route.unwrap_or_default();
    let route_clean = route_path.trim_start_matches('/');
    let url = if route_clean.is_empty() {
        format!("hap://localhost/{plugin_id}/index.html")
    } else {
        format!("hap://localhost/{plugin_id}/index.html#{route_clean}")
    };

    let bridge_script = bridge_inject::generate_bridge_script(&plugin_id);
    let w = width.unwrap_or(600.0);
    let h = height.unwrap_or(400.0);

    let mut builder = tauri::WebviewWindowBuilder::new(
        &app,
        &win_label,
        tauri::WebviewUrl::External(url.parse().unwrap()),
    )
    .title(title.as_deref().unwrap_or(""))
    .initialization_script(&bridge_script)
    .inner_size(w, h)
    .decorations(decorations.unwrap_or(true))
    .resizable(resizable.unwrap_or(true))
    .skip_taskbar(true);

    if hidden_title.unwrap_or(false) {
        builder = builder.hidden_title(true);
    }

    #[cfg(target_os = "macos")]
    {
        use tauri::TitleBarStyle;
        if let Some(ref tbs) = title_bar_style {
            let style = match tbs.to_lowercase().as_str() {
                "overlay" => TitleBarStyle::Overlay,
                "transparent" => TitleBarStyle::Transparent,
                _ => TitleBarStyle::Visible,
            };
            builder = builder.title_bar_style(style);
        }
    }

    if let Some(right) = anchor_right {
        if let Some(monitor) = app.primary_monitor().ok().flatten() {
            let screen_w = monitor.size().width as f64 / monitor.scale_factor();
            let x = screen_w - w - right;
            builder = builder.position(x, 80.0);
        }
    } else {
        builder = builder.center();
    }

    builder.build().map_err(|e| format!("child window creation failed: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn hap_create_sub_window(
    app: tauri::AppHandle,
    plugin_id: String,
    sub_id: String,
    title: String,
    url: String,
    width: Option<f64>,
    height: Option<f64>,
    app_id_override: Option<String>,
) -> Result<(), String> {
    let safe_sub = sub_id.replace('.', "_");
    let label = format!("plugin-{plugin_id}-sub-{safe_sub}");

    if let Some(existing) = app.get_webview_window(&label) {
        let _: () = existing.set_focus().map_err(|e| format!("{e}"))?;
        return Ok(());
    }

    let full_url = if url.starts_with("http") {
        url
    } else {
        format!("hap://localhost/{plugin_id}/{url}")
    };

    let bridge_app_id = app_id_override.as_deref().unwrap_or(&plugin_id);
    let bridge_script = bridge_inject::generate_bridge_script(bridge_app_id);
    tauri::WebviewWindowBuilder::new(
        &app,
        &label,
        tauri::WebviewUrl::External(full_url.parse().unwrap()),
    )
    .title(&title)
    .initialization_script(&bridge_script)
    .inner_size(width.unwrap_or(600.0), height.unwrap_or(400.0))
    .min_inner_size(320.0, 240.0)
    .center()
    .build()
    .map_err(|e| format!("sub-window creation failed: {e}"))?;

    Ok(())
}

#[tauri::command]
pub fn hap_close_sub_window(
    app: tauri::AppHandle,
    plugin_id: String,
    sub_id: String,
) -> Result<(), String> {
    let safe_sub = sub_id.replace('.', "_");
    let label = format!("plugin-{plugin_id}-sub-{safe_sub}");
    if let Some(win) = app.get_webview_window(&label) {
        win.close().map_err(|e| format!("{e}"))?;
    }
    Ok(())
}

#[tauri::command]
pub fn hap_reveal_in_folder(path: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Err(format!("path not found: {path}"));
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("-R")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("{e}"))?;
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(format!("/select,{}", path.replace('/', "\\")))
            .spawn()
            .map_err(|e| format!("{e}"))?;
    }
    #[cfg(target_os = "linux")]
    {
        if let Some(parent) = p.parent() {
            std::process::Command::new("xdg-open")
                .arg(parent)
                .spawn()
                .map_err(|e| format!("{e}"))?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn hap_load_plugin_html(install_path: String) -> Result<String, String> {
    let base = Path::new(&install_path);
    let html_path = base.join("index.html");
    let html = fs::read_to_string(&html_path)
        .map_err(|e| format!("read index.html failed: {e}"))?;

    let js_path = base.join("index.js");
    let css_path = base.join("style.css");

    let js = fs::read_to_string(&js_path).unwrap_or_default();
    let css = fs::read_to_string(&css_path).unwrap_or_default();

    let inlined = html
        .replace(
            r#"<script type="module" crossorigin src="./index.js"></script>"#,
            &format!("<script type=\"module\">{js}</script>"),
        )
        .replace(
            r#"<link rel="stylesheet" crossorigin href="./style.css">"#,
            &format!("<style>{css}</style>"),
        );

    Ok(inlined)
}

#[tauri::command]
pub fn set_locale(locale: String) {
    cdylib_loader::set_user_locale(&locale);
}
