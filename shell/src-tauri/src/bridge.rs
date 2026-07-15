use std::fs;
use std::path::Path;
use serde_json::Value;
use tauri::Manager;

use crate::db;
use crate::hap_manager;
use crate::cdylib_loader;

#[tauri::command]
pub fn fs_read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("读取失败: {e}"))
}

#[tauri::command]
pub fn fs_write_text_file(path: String, content: String) -> Result<(), String> {
    if let Some(parent) = std::path::Path::new(&path).parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {e}"))?;
    }
    fs::write(&path, &content).map_err(|e| format!("写入失败: {e}"))
}

#[tauri::command]
pub fn fs_exists(path: String) -> bool {
    std::path::Path::new(&path).exists()
}

#[tauri::command]
pub fn clipboard_read_text() -> Result<String, String> {
    Err("剪贴板 cdylib 模块未加载".into())
}

#[tauri::command]
pub fn clipboard_write_text(_text: String) -> Result<(), String> {
    Err("剪贴板 cdylib 模块未加载".into())
}

#[tauri::command]
pub fn crypto_hash(_algorithm: String, _data: String) -> Result<String, String> {
    Err("加密 cdylib 模块未加载".into())
}

#[tauri::command]
pub fn crypto_random_bytes(length: usize) -> Result<Vec<u8>, String> {
    let mut buf = vec![0u8; length];
    getrandom::fill(&mut buf).map_err(|e| format!("生成随机字节失败: {e}"))?;
    Ok(buf)
}

#[tauri::command]
pub fn hap_list_modules() -> Result<Vec<cdylib_loader::ModuleDescriptor>, String> {
    Ok(cdylib_loader::get_all_descriptors())
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

    tauri::WebviewWindowBuilder::new(&app, &label, tauri::WebviewUrl::External(url.parse().unwrap()))
        .title(&plugin_name)
        .inner_size(width.unwrap_or(900.0), height.unwrap_or(640.0))
        .min_inner_size(400.0, 300.0)
        .center()
        .build()
        .map_err(|e| format!("创建窗口失败: {e}"))?;

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

    tauri::WebviewWindowBuilder::new(
        &app,
        &label,
        tauri::WebviewUrl::External(full_url.parse().unwrap()),
    )
    .title(&title)
    .inner_size(width.unwrap_or(600.0), height.unwrap_or(400.0))
    .min_inner_size(320.0, 240.0)
    .center()
    .build()
    .map_err(|e| format!("创建子窗口失败: {e}"))?;

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
        return Err(format!("路径不存在: {path}"));
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
        .map_err(|e| format!("读取 index.html 失败: {e}"))?;

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
