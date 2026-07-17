use std::fs;
use std::path::Path;
use serde_json::Value;
use tauri::Manager;

use crate::bridge_inject;
use crate::db;
use crate::hap_manager;
use crate::cdylib_loader;

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
    let modules = cdylib_loader::get_all_descriptors();
    if let Some(http) = modules.iter().find(|m| m.name == "http") {
        if let Some(req) = http.functions.iter().find(|f| f.name == "request") {
            eprintln!("[DEBUG] http.request returns.type = {:?}", req.returns.return_type);
        }
        eprintln!("[DEBUG] http types count = {:?}", http.types.as_ref().map(|t| t.len()));
        eprintln!("[DEBUG] http constants count = {:?}", http.constants.as_ref().map(|c| c.len()));
    }
    Ok(modules)
}

#[tauri::command]
pub fn hap_call_function(window: tauri::WebviewWindow, module_name: String, symbol_name: String, params_json: String) -> Result<String, String> {
    let label = window.label();
    if label.starts_with("plugin-") {
        let app_id = label.strip_prefix("plugin-")
            .unwrap_or(label)
            .split("-sub-")
            .next()
            .unwrap_or(label);
        let module_perm = cdylib_loader::get_module_permission(&module_name);
        if let Some(perm) = module_perm {
            if !perm.is_empty() && !app_has_permission(app_id, &perm) {
                return Err(format!("app '{app_id}' lacks '{perm}' permission to call module '{module_name}'"));
            }
        }
    }
    cdylib_loader::call_function(&module_name, &symbol_name, &params_json)
}

fn app_has_permission(app_id: &str, required: &str) -> bool {
    let plugins = hap_manager::list_installed_plugins().unwrap_or_default();
    for p in &plugins {
        if p["id"].as_str() == Some(app_id) {
            if let Some(perms) = p["permissions"].as_array() {
                return perms.iter().any(|v| {
                    v.as_str().map_or(false, |s| s == required || s.starts_with(&format!("{required}:")))
                });
            }
            return false;
        }
    }
    false
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
            let has_perm = perms.map_or(false, |arr| {
                arr.iter().any(|v| v.as_str().map_or(false, |s| s == m.permission || s.starts_with(&format!("{}:", m.permission))))
            });
            let has_dep = p["dependencies"]["hal"].as_array().map_or(false, |deps| {
                deps.iter().any(|d| {
                    (m.uuid.is_some() && d["uuid"].as_str() == m.uuid.as_deref()) || d["id"].as_str().map_or(false, |id| id == format!("hap-mod-{}", m.name))
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

#[tauri::command]
pub fn hap_open_plugin_window(
    app: tauri::AppHandle,
    plugin_id: String,
    plugin_name: String,
    width: Option<f64>,
    height: Option<f64>,
) -> Result<(), String> {
    let url = format!("hap://localhost/{plugin_id}/index.html");
    let label = format!("plugin-{plugin_id}");

    if let Some(existing) = app.get_webview_window(&label) {
        let _: () = existing.set_focus().map_err(|e| format!("{e}"))?;
        return Ok(());
    }

    let bridge_script = bridge_inject::generate_bridge_script(&plugin_id);
    tauri::WebviewWindowBuilder::new(&app, &label, tauri::WebviewUrl::External(url.parse().unwrap()))
        .title(&plugin_name)
        .initialization_script(&bridge_script)
        .inner_size(width.unwrap_or(900.0), height.unwrap_or(640.0))
        .min_inner_size(400.0, 300.0)
        .center()
        .build()
        .map_err(|e| format!("window creation failed: {e}"))?;

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
) -> Result<(), String> {
    let label = format!("plugin-{plugin_id}-sub-{sub_id}");

    if let Some(existing) = app.get_webview_window(&label) {
        let _: () = existing.set_focus().map_err(|e| format!("{e}"))?;
        return Ok(());
    }

    let full_url = if url.starts_with("http") {
        url
    } else {
        format!("hap://localhost/{plugin_id}/{url}")
    };

    let bridge_script = bridge_inject::generate_bridge_script(&plugin_id);
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
    let label = format!("plugin-{plugin_id}-sub-{sub_id}");
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
