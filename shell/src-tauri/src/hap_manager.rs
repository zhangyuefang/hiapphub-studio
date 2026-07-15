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
        "plugins/installed",
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
    let mut seen_ids = std::collections::HashSet::new();

    let app_dir = data_dir().join("app");
    if app_dir.exists() {
        let entries = fs::read_dir(&app_dir).map_err(|e| format!("读取 app 目录失败: {e}"))?;
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("hap") {
                if let Ok(manifest) = read_manifest_from_hap(&path) {
                    if let Some(id) = manifest["id"].as_str() {
                        seen_ids.insert(id.to_string());
                    }
                    plugins.push(manifest);
                }
            }
        }
    }

    let installed_dir = data_dir().join("plugins/installed");
    if installed_dir.exists() {
        let entries = fs::read_dir(&installed_dir).map_err(|e| format!("读取插件目录失败: {e}"))?;
        for entry in entries.flatten() {
            let plugin_dir = entry.path();
            let manifest_path = plugin_dir.join("manifest.json");
            if manifest_path.exists() {
                let content = fs::read_to_string(&manifest_path)
                    .map_err(|e| format!("读取 manifest 失败: {e}"))?;
                let mut manifest: Value =
                    serde_json::from_str(&content).map_err(|e| format!("解析 manifest 失败: {e}"))?;
                if let Some(id) = manifest["id"].as_str() {
                    if seen_ids.contains(id) {
                        continue;
                    }
                }
                if let Value::Object(ref mut map) = manifest {
                    map.insert("_installPath".to_string(), Value::String(plugin_dir.to_string_lossy().to_string()));
                }
                plugins.push(manifest);
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
        let file = fs::File::open(hap_file).map_err(|e| format!("打开文件失败: {e}"))?;
        let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("ZIP 解析失败: {e}"))?;
        let manifest_content = {
            let mut mf = archive.by_name("manifest.json")
                .map_err(|_| "hap 包中缺少 manifest.json")?;
            let mut buf = String::new();
            std::io::Read::read_to_string(&mut mf, &mut buf)
                .map_err(|e| format!("读取 manifest 失败: {e}"))?;
            buf
        };
        let manifest: Value = serde_json::from_str(&manifest_content)
            .map_err(|e| format!("manifest 解析失败: {e}"))?;
        let plugin_id = manifest["id"].as_str().ok_or("manifest 缺少 id 字段")?;
        let target_dir = data_dir().join("plugins/installed").join(plugin_id);
        fs::create_dir_all(&target_dir).map_err(|e| format!("创建目录失败: {e}"))?;
        archive.extract(&target_dir).map_err(|e| format!("解压失败: {e}"))?;
        Ok(manifest)
    }
}

#[allow(dead_code)]
pub fn compute_sha256(_path: &Path) -> Result<String, String> {
    Err("sha256 已移至 crypto cdylib 模块".into())
}
