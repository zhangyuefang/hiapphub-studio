use std::fs;
use std::path::{Path, PathBuf};
use serde_json::Value;

pub fn data_dir() -> PathBuf {
    dirs::home_dir()
        .expect("cannot get HOME directory")
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
        let entries = fs::read_dir(&app_dir).map_err(|e| format!("read app dir failed: {e}"))?;
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
    let content = read_manifest_content(hap_path)?;
    let mut manifest: Value = serde_json::from_str(&content)
        .map_err(|e| format!("{e}"))?;
    if let Value::Object(ref mut map) = manifest {
        map.insert("_hapPath".to_string(), Value::String(hap_path.to_string_lossy().to_string()));
    }
    Ok(manifest)
}

pub fn read_manifest_content(hap_path: &Path) -> Result<String, String> {
    use crate::hap_format;
    if let Ok(mut reader) = hap_format::HapReader::open_file(hap_path) {
        let data = reader.read_file("manifest.json")
            .map_err(|e| format!("{e}"))?;
        return String::from_utf8(data).map_err(|e| format!("{e}"));
    }
    let file = fs::File::open(hap_path).map_err(|e| format!("{e}"))?;
    let mut archive = zip::ZipArchive::new(std::io::BufReader::new(file))
        .map_err(|e| format!("not a valid HAP file (neither custom nor zip): {e}"))?;
    let mut entry = archive.by_name("manifest.json")
        .map_err(|e| format!("manifest.json not found in zip: {e}"))?;
    let mut content = String::new();
    std::io::Read::read_to_string(&mut entry, &mut content)
        .map_err(|e| format!("read manifest: {e}"))?;
    Ok(content)
}

pub fn install_from_hap(hap_path: &str) -> Result<Value, String> {
    use crate::hap_format;

    let hap_file = Path::new(hap_path);
    if !hap_file.exists() {
        return Err(format!("file not found: {hap_path}"));
    }

    let is_hap = hap_format::is_hap_format(hap_file)
        .map_err(|e| format!("{e}"))?;

    if is_hap {
        let mut reader = hap_format::HapReader::open_file(hap_file)
            .map_err(|e| format!("{e}"))?;

        if let Err(e) = hap_format::verify_data_integrity(&mut reader) {
            return Err(format!("HAP integrity check failed: {e}"));
        }

        let manifest_data = reader.read_file("manifest.json")
            .map_err(|e| format!("{e}"))?;
        let manifest_str = String::from_utf8(manifest_data).map_err(|e| format!("{e}"))?;
        let manifest: Value = serde_json::from_str(&manifest_str)
            .map_err(|e| format!("manifest parse failed: {e}"))?;
        let plugin_id = manifest["id"].as_str().ok_or("manifest missing id field")?;

        let target = data_dir().join("app").join(format!("{plugin_id}.hap"));
        fs::copy(hap_file, &target).map_err(|e| format!("copy failed: {e}"))?;
        Ok(manifest)
    } else {
        Err("unsupported file format, please use .hap files in HAP custom format".into())
    }
}

pub fn get_plugin_version(app_id: &str) -> Option<String> {
    let hap_path = data_dir().join("app").join(format!("{app_id}.hap"));
    if !hap_path.exists() { return None; }
    read_manifest_from_hap(&hap_path).ok()
        .and_then(|m| m["version"].as_str().map(String::from))
}

#[allow(dead_code)]
pub fn save_app_key(app_id: &str, key: &[u8; 32]) -> Result<(), String> {
    let key_path = data_dir().join("config").join(format!("{app_id}.key"));
    fs::write(&key_path, key).map_err(|e| format!("save key failed: {e}"))
}

pub fn load_app_key(app_id: &str) -> Result<[u8; 32], String> {
    let key_path = data_dir().join("config").join(format!("{app_id}.key"));
    let data = fs::read(&key_path)
        .map_err(|_| format!("encryption key not found for app '{app_id}'"))?;
    if data.len() != 32 {
        return Err("invalid key length".into());
    }
    let mut key = [0u8; 32];
    key.copy_from_slice(&data);
    Ok(key)
}

#[allow(dead_code)]
pub fn compute_sha256(_path: &Path) -> Result<String, String> {
    Err("sha256 moved to crypto cdylib module".into())
}
