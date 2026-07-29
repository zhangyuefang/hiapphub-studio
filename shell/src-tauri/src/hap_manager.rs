use std::fs;
use std::path::{Path, PathBuf};
use serde_json::Value;
use std::sync::Mutex;

static UPDATE_ENDPOINT: &str = "https://api.hiapphub.com/v1/updates/check";

static LAST_CHECK_RESULT: Mutex<Option<Value>> = Mutex::new(None);

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

pub fn read_versions_cache() -> Value {
    let path = data_dir().join("versions.json");
    fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_else(|| serde_json::json!({}))
}

pub fn write_versions_cache(val: &Value) -> Result<(), String> {
    let path = data_dir().join("versions.json");
    let content = serde_json::to_string_pretty(val).map_err(|e| format!("{e}"))?;
    fs::write(&path, content).map_err(|e| format!("write versions.json: {e}"))
}

pub fn rebuild_versions_cache() -> Result<Value, String> {
    let mut cache = serde_json::json!({});
    let app_dir = data_dir().join("app");
    if !app_dir.exists() {
        return Ok(cache);
    }
    let known = [
        ("hiapphub-shell", "shell"),
        ("hiapphub-devtools", "devtools"),
        ("hiapphub-dev-runner", "devRunner"),
    ];
    for (app_id, key) in &known {
        if let Some(ver) = get_plugin_version(app_id) {
            cache[key] = Value::String(ver);
        }
    }
    cache["bootstrap"] = Value::String(env!("CARGO_PKG_VERSION").to_string());
    cache["lastCheck"] = Value::Null;
    write_versions_cache(&cache)?;
    Ok(cache)
}

pub fn get_versions() -> Result<Value, String> {
    let cache = read_versions_cache();
    if cache.as_object().map(|m| m.is_empty()).unwrap_or(true) {
        return rebuild_versions_cache();
    }
    Ok(cache)
}

fn is_platform_app(app_id: &str) -> bool {
    matches!(app_id, "hiapphub-shell" | "hiapphub-devtools" | "hiapphub-dev-runner")
}

fn load_update_pubkey() -> Option<[u8; 32]> {
    let key_path = data_dir().join("config").join("update-pubkey.bin");
    if let Ok(data) = fs::read(&key_path) {
        if data.len() == 32 {
            let mut key = [0u8; 32];
            key.copy_from_slice(&data);
            return Some(key);
        }
    }
    None
}

fn verify_hap_signature(hap_path: &Path) -> Result<bool, String> {
    use crate::hap_format;
    let pubkey = match load_update_pubkey() {
        Some(k) => k,
        None => return Ok(true),
    };
    let mut reader = hap_format::HapReader::open_file(hap_path)
        .map_err(|e| format!("platform updates must use signed HAP format, not ZIP: {e}"))?;
    if !reader.is_signed() {
        return Err("hap is not signed but signature verification is required".into());
    }
    reader.verify_signature(&pubkey)
        .map_err(|e| format!("signature verification error: {e}"))
}

pub fn replace_hap(app_id: &str, new_hap_path: &str) -> Result<Value, String> {
    let new_path = Path::new(new_hap_path);
    if !new_path.exists() {
        return Err(format!("new hap not found: {new_hap_path}"));
    }

    if is_platform_app(app_id) {
        match verify_hap_signature(new_path) {
            Ok(true) => {}
            Ok(false) => return Err("signature verification failed: invalid signature".into()),
            Err(e) => return Err(e),
        }
    }

    let new_manifest_str = read_manifest_content(new_path)?;
    let new_manifest: Value = serde_json::from_str(&new_manifest_str)
        .map_err(|e| format!("parse new manifest: {e}"))?;
    let manifest_id = new_manifest["id"].as_str().unwrap_or("");
    if !manifest_id.is_empty() && manifest_id != app_id {
        return Err(format!("manifest id mismatch: expected {app_id}, got {manifest_id}"));
    }

    let target = data_dir().join("app").join(format!("{app_id}.hap"));
    let backup = data_dir().join("app").join(format!("{app_id}.hap.backup"));

    let src_canonical = new_path.canonicalize().unwrap_or_else(|_| new_path.to_path_buf());
    let dst_canonical = target.canonicalize().unwrap_or_else(|_| target.clone());
    if src_canonical == dst_canonical {
        return Err("source and target are the same file".into());
    }

    if target.exists() {
        fs::copy(&target, &backup)
            .map_err(|e| format!("backup failed: {e}"))?;
    }

    fs::copy(new_path, &target)
        .map_err(|e| format!("replace failed: {e}"))?;

    let new_version = new_manifest["version"].as_str().unwrap_or("unknown");
    let mut versions = read_versions_cache();
    let key = match app_id {
        "hiapphub-shell" => "shell",
        "hiapphub-devtools" => "devtools",
        "hiapphub-dev-runner" => "devRunner",
        _ => app_id,
    };
    versions[key] = Value::String(new_version.to_string());
    let _ = write_versions_cache(&versions);

    Ok(serde_json::json!({
        "appId": app_id,
        "version": new_version,
        "backedUp": backup.exists(),
    }))
}

pub fn check_for_updates() -> Result<Value, String> {
    let versions = get_versions()?;
    let body = serde_json::json!({
        "bootstrapVersion": versions["bootstrap"].as_str().unwrap_or("0.0.0"),
        "shellVersion": versions["shell"].as_str().unwrap_or("0.0.0"),
        "devtoolsVersion": versions["devtools"].as_str().unwrap_or("0.0.0"),
        "devRunnerVersion": versions["devRunner"].as_str().unwrap_or("0.0.0"),
        "platform": std::env::consts::OS,
        "arch": std::env::consts::ARCH,
    });

    let params = serde_json::json!({
        "url": UPDATE_ENDPOINT,
        "method": "POST",
        "headers": { "Content-Type": "application/json" },
        "body": body.to_string(),
        "timeout": 15,
    });
    let client = crate::cdylib_loader::call_function("http", "request", &params.to_string());

    let result = match client {
        Ok(resp_str) => {
            serde_json::from_str::<Value>(&resp_str).unwrap_or_else(|_| {
                serde_json::json!({ "updates": [], "raw": resp_str })
            })
        }
        Err(e) => {
            serde_json::json!({ "updates": [], "error": format!("{e}"), "offline": true })
        }
    };

    let mut versions = get_versions().unwrap_or_default();
    versions["lastCheck"] = Value::String(chrono_now_iso());
    let _ = write_versions_cache(&versions);

    if let Ok(mut cache) = LAST_CHECK_RESULT.lock() {
        *cache = Some(result.clone());
    }

    Ok(result)
}

fn chrono_now_iso() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();
    let days = secs / 86400;
    let day_secs = secs % 86400;
    let hours = day_secs / 3600;
    let mins = (day_secs % 3600) / 60;
    let s = day_secs % 60;
    let (y, m, d) = days_to_ymd(days);
    format!("{y:04}-{m:02}-{d:02}T{hours:02}:{mins:02}:{s:02}Z")
}

fn days_to_ymd(days_since_epoch: u64) -> (u64, u64, u64) {
    let mut y = 1970;
    let mut remaining = days_since_epoch;
    loop {
        let days_in_year = if is_leap(y) { 366 } else { 365 };
        if remaining < days_in_year { break; }
        remaining -= days_in_year;
        y += 1;
    }
    let days_in_month: [u64; 12] = if is_leap(y) {
        [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    } else {
        [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    };
    let mut m = 0;
    for dm in &days_in_month {
        if remaining < *dm { break; }
        remaining -= dm;
        m += 1;
    }
    (y, m + 1, remaining + 1)
}

fn is_leap(y: u64) -> bool {
    y % 4 == 0 && (y % 100 != 0 || y % 400 == 0)
}

pub fn download_update(url: &str, app_id: &str) -> Result<Value, String> {
    let download_dir = data_dir().join("cache").join("downloads");
    let _ = fs::create_dir_all(&download_dir);
    let temp_path = download_dir.join(format!("{app_id}.hap.tmp"));

    let params = serde_json::json!({
        "url": url,
        "method": "GET",
        "output_file": temp_path.to_string_lossy(),
        "timeout": 300,
    });
    let resp = crate::cdylib_loader::call_function("http", "request", &params.to_string());

    match resp {
        Ok(resp_str) => {
            let resp_val: Value = serde_json::from_str(&resp_str).unwrap_or_default();
            if resp_val["status"].as_u64().unwrap_or(0) >= 400 {
                return Err(format!("download failed: HTTP {}", resp_val["status"]));
            }
            let result = replace_hap(app_id, &temp_path.to_string_lossy())?;
            let _ = fs::remove_file(&temp_path);
            Ok(result)
        }
        Err(e) => Err(format!("download failed: {e}")),
    }
}

pub fn rollback_hap(app_id: &str) -> Result<Value, String> {
    let target = data_dir().join("app").join(format!("{app_id}.hap"));
    let backup = data_dir().join("app").join(format!("{app_id}.hap.backup"));

    if !backup.exists() {
        return Err(format!("no backup found for {app_id}"));
    }

    fs::copy(&backup, &target)
        .map_err(|e| format!("rollback failed: {e}"))?;

    if let Some(ver) = get_plugin_version(app_id) {
        let mut versions = read_versions_cache();
        let key = match app_id {
            "hiapphub-shell" => "shell",
            "hiapphub-devtools" => "devtools",
            "hiapphub-dev-runner" => "devRunner",
            _ => app_id,
        };
        versions[key] = Value::String(ver.clone());
        let _ = write_versions_cache(&versions);
        Ok(serde_json::json!({ "appId": app_id, "version": ver, "rolledBack": true }))
    } else {
        Ok(serde_json::json!({ "appId": app_id, "rolledBack": true }))
    }
}
