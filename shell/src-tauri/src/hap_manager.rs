use std::fs;
use std::path::{Path, PathBuf};
use serde_json::Value;

pub fn data_dir() -> PathBuf {
    dirs::home_dir()
        .expect("无法获取 HOME 目录")
        .join(".hiapphub")
}

pub fn ensure_data_dir() -> Result<PathBuf, Box<dyn std::error::Error>> {
    let base = data_dir();
    let dirs_to_create = [
        "data",
        "data/plugins",
        "config",
        "app",
        "lib",
        "cache/downloads",
        "cache/wasm",
        "backup",
        "logs",
    ];
    for d in &dirs_to_create {
        fs::create_dir_all(base.join(d))?;
    }
    Ok(base)
}

pub fn list_installed_plugins() -> Result<Vec<Value>, String> {
    let mut plugins = Vec::new();

    let app_dir = data_dir().join("app");
    if app_dir.exists() {
        let entries = fs::read_dir(&app_dir).map_err(|e| format!("读取 app 目录失败: {e}"))?;
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("hap") {
                if let Ok(manifest) = read_manifest_from_hap(&path) {
                    plugins.push(manifest);
                }
            }
        }
    }

    Ok(plugins)
}

fn read_manifest_from_hap(hap_path: &Path) -> Result<Value, String> {
    use crate::hap_format;
    let mut reader = hap_format::HapReader::open_file(hap_path)
        .map_err(|e| format!("{e}"))?;
    let data = reader.read_file("manifest.json")
        .map_err(|e| format!("{e}"))?;
    let content = String::from_utf8(data).map_err(|e| format!("{e}"))?;
    let mut manifest: Value = serde_json::from_str(&content)
        .map_err(|e| format!("{e}"))?;
    if let Value::Object(ref mut map) = manifest {
        map.insert("_hapPath".to_string(), Value::String(hap_path.to_string_lossy().to_string()));
    }
    Ok(manifest)
}

pub fn install_from_hap(hap_path: &str) -> Result<Value, String> {
    use crate::hap_format;

    let hap_file = Path::new(hap_path);
    if !hap_file.exists() {
        return Err(format!("文件不存在: {hap_path}"));
    }

    let is_hap = hap_format::is_hap_format(hap_file)
        .map_err(|e| format!("{e}"))?;

    if is_hap {
        let mut reader = hap_format::HapReader::open_file(hap_file)
            .map_err(|e| format!("{e}"))?;
        let manifest_data = reader.read_file("manifest.json")
            .map_err(|e| format!("{e}"))?;
        let manifest_str = String::from_utf8(manifest_data).map_err(|e| format!("{e}"))?;
        let manifest: Value = serde_json::from_str(&manifest_str)
            .map_err(|e| format!("manifest 解析失败: {e}"))?;
        let plugin_id = manifest["id"].as_str().ok_or("manifest 缺少 id 字段")?;

        let target = data_dir().join("app").join(format!("{plugin_id}.hap"));
        fs::copy(hap_file, &target).map_err(|e| format!("复制失败: {e}"))?;
        Ok(manifest)
    } else {
        Err("不支持的文件格式，请使用 HAP 自定义格式的 .hap 文件".into())
    }
}

#[allow(dead_code)]
pub fn compute_sha256(_path: &Path) -> Result<String, String> {
    Err("sha256 已移至 crypto cdylib 模块".into())
}
