use std::collections::HashMap;
use std::sync::Mutex;
use std::sync::LazyLock;
use std::path::PathBuf;

use crate::hap_format;
use crate::hap_manager;

struct CacheEntry {
    data: Vec<u8>,
}

static FILE_CACHE: LazyLock<Mutex<HashMap<String, CacheEntry>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

const MAX_CACHE_ENTRIES: usize = 256;

pub fn invalidate_cache(app_id: &str) {
    if let Ok(mut cache) = FILE_CACHE.lock() {
        let prefix = format!("{app_id}/");
        cache.retain(|k, _| !k.starts_with(&prefix));
    }
}

pub fn handle_request(
    req: tauri::http::Request<Vec<u8>>,
    responder: tauri::UriSchemeResponder,
) {
    let url = req.uri().to_string();
    let path = url.strip_prefix("hap://localhost/").unwrap_or(&url);
    let decoded = urlencoding::decode(path).unwrap_or_default();
    let decoded = decoded.as_ref();

    let (app_id, file_path) = match decoded.split_once('/') {
        Some((id, rest)) => (id, rest),
        None => {
            respond_404(responder);
            return;
        }
    };

    if app_id.contains("..") || app_id.contains('/') || app_id.contains('\\')
        || file_path.contains("..") {
        respond_404(responder);
        return;
    }

    let cache_key = format!("{app_id}/{file_path}");

    if let Ok(cache) = FILE_CACHE.lock() {
        if let Some(entry) = cache.get(&cache_key) {
            let mime = guess_mime(file_path);
            respond_ok(responder, &entry.data, mime);
            return;
        }
    }

    let app_dir = hap_manager::data_dir().join("app");
    let hap_path = app_dir.join(format!("{app_id}.hap"));

    let data = match read_from_hap(&hap_path, file_path) {
        Ok(d) => d,
        Err(e) => {
            eprintln!("[hap://] {app_id}/{file_path}: {e}");
            respond_404(responder);
            return;
        }
    };

    if let Ok(mut cache) = FILE_CACHE.lock() {
        if cache.len() >= MAX_CACHE_ENTRIES {
            let first_key = cache.keys().next().cloned();
            if let Some(k) = first_key {
                cache.remove(&k);
            }
        }
        cache.insert(cache_key, CacheEntry { data: data.clone() });
    }

    let mime = guess_mime(file_path);
    respond_ok(responder, &data, mime);
}

fn read_from_hap(hap_path: &PathBuf, file_path: &str) -> Result<Vec<u8>, String> {
    let mut reader = hap_format::HapReader::open_file(hap_path)
        .map_err(|e| format!("{e}"))?;

    if reader.is_encrypted() {
        let app_id = hap_path.file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("unknown");
        let key = hap_manager::load_app_key(app_id)
            .map_err(|e| format!("load encryption key: {e}"))?;
        reader.read_file_with_key(file_path, Some(&key))
            .map_err(|e| format!("{e}"))
    } else {
        reader.read_file(file_path).map_err(|e| format!("{e}"))
    }
}

fn guess_mime(path: &str) -> &'static str {
    match path.rsplit('.').next() {
        Some("html") => "text/html",
        Some("js" | "mjs") => "application/javascript",
        Some("css") => "text/css",
        Some("json") => "application/json",
        Some("wasm") => "application/wasm",
        Some("png") => "image/png",
        Some("svg") => "image/svg+xml",
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("ico") => "image/x-icon",
        Some("woff2") => "font/woff2",
        Some("woff") => "font/woff",
        Some("ttf") => "font/ttf",
        Some("otf") => "font/otf",
        Some("mp3") => "audio/mpeg",
        Some("mp4") => "video/mp4",
        Some("webm") => "video/webm",
        Some("ogg") => "audio/ogg",
        Some("xml") => "application/xml",
        Some("txt") => "text/plain",
        Some("pdf") => "application/pdf",
        Some("zip") => "application/zip",
        _ => "application/octet-stream",
    }
}

fn respond_ok(responder: tauri::UriSchemeResponder, data: &[u8], mime: &str) {
    let resp = tauri::http::Response::builder()
        .status(200)
        .header("Content-Type", mime)
        .header("Access-Control-Allow-Origin", "*")
        .header("Cache-Control", "max-age=3600")
        .body(data.to_vec())
        .unwrap();
    responder.respond(resp);
}

fn respond_404(responder: tauri::UriSchemeResponder) {
    let resp = tauri::http::Response::builder()
        .status(404)
        .body(b"Not Found".to_vec())
        .unwrap();
    responder.respond(resp);
}
