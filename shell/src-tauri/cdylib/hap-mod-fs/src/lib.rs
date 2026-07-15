use std::ffi::{CStr, CString};
use std::os::raw::c_char;
use std::fs;
use std::path::Path;

#[unsafe(no_mangle)]
pub extern "C" fn hap_module_init() -> *const c_char {
    CString::new(r#"{"name":"fs","version":"0.1.0"}"#).unwrap().into_raw()
}

#[unsafe(no_mangle)]
pub extern "C" fn hap_module_describe() -> *const c_char {
    let desc = r#"{
  "uuid": "a1b2c3d4-1000-4000-8000-000000000003",
  "name": "fs",
  "version": "0.1.0",
  "author": "HiAppHub",
  "author_email": "dev@hiapphub.com",
  "author_url": "https://hiapphub.com",
  "icon": "📁",
  "min_shell_version": "0.1.0",
  "category": "system",
  "description": "文件系统读写操作",
  "permission": "fs",
  "functions": [
    {"name":"read_text_file","symbol":"hap_fs_read_text_file","params":[{"name":"path","type":"string","desc":"文件路径"}],"returns":{"type":"string","desc":"文件内容"},"bridge_path":"fs.readTextFile"},
    {"name":"write_text_file","symbol":"hap_fs_write_text_file","params":[{"name":"path","type":"string","desc":"文件路径"},{"name":"content","type":"string","desc":"写入内容"}],"returns":{"type":"string","desc":"ok或error"},"bridge_path":"fs.writeTextFile"},
    {"name":"exists","symbol":"hap_fs_exists","params":[{"name":"path","type":"string","desc":"路径"}],"returns":{"type":"string","desc":"true/false"},"bridge_path":"fs.exists"},
    {"name":"remove","symbol":"hap_fs_remove","params":[{"name":"path","type":"string","desc":"路径"}],"returns":{"type":"string","desc":"ok或error"},"bridge_path":"fs.remove"},
    {"name":"read_dir","symbol":"hap_fs_read_dir","params":[{"name":"path","type":"string","desc":"目录路径"}],"returns":{"type":"json","desc":"文件列表JSON"},"bridge_path":"fs.readDir"},
    {"name":"create_dir","symbol":"hap_fs_create_dir","params":[{"name":"path","type":"string","desc":"目录路径"}],"returns":{"type":"string","desc":"ok或error"},"bridge_path":"fs.createDir"},
    {"name":"metadata","symbol":"hap_fs_metadata","params":[{"name":"path","type":"string","desc":"路径"}],"returns":{"type":"json","desc":"元信息JSON"},"bridge_path":"fs.metadata"}
  ]
}"#;
    CString::new(desc).unwrap().into_raw()
}

#[unsafe(no_mangle)]
pub extern "C" fn hap_free_string(ptr: *mut c_char) {
    if !ptr.is_null() { unsafe { drop(CString::from_raw(ptr)); } }
}

fn to_cstr(s: &str) -> *mut c_char { CString::new(s).unwrap().into_raw() }
fn read_cstr(ptr: *const c_char) -> String { unsafe { CStr::from_ptr(ptr) }.to_str().unwrap_or("").to_string() }

#[unsafe(no_mangle)]
pub extern "C" fn hap_fs_read_text_file(path: *const c_char) -> *mut c_char {
    let path = read_cstr(path);
    match fs::read_to_string(&path) {
        Ok(content) => to_cstr(&content),
        Err(e) => to_cstr(&format!("error:{e}")),
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn hap_fs_write_text_file(path: *const c_char, content: *const c_char) -> *mut c_char {
    let path = read_cstr(path);
    let content = read_cstr(content);
    if let Some(parent) = Path::new(&path).parent() {
        let _ = fs::create_dir_all(parent);
    }
    match fs::write(&path, &content) {
        Ok(()) => to_cstr("ok"),
        Err(e) => to_cstr(&format!("error:{e}")),
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn hap_fs_exists(path: *const c_char) -> *mut c_char {
    to_cstr(if Path::new(&read_cstr(path)).exists() { "true" } else { "false" })
}

#[unsafe(no_mangle)]
pub extern "C" fn hap_fs_remove(path: *const c_char) -> *mut c_char {
    let path = read_cstr(path);
    let p = Path::new(&path);
    let result = if p.is_dir() { fs::remove_dir_all(p) } else { fs::remove_file(p) };
    match result {
        Ok(()) => to_cstr("ok"),
        Err(e) => to_cstr(&format!("error:{e}")),
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn hap_fs_read_dir(path: *const c_char) -> *mut c_char {
    let path = read_cstr(path);
    match fs::read_dir(&path) {
        Ok(entries) => {
            let items: Vec<serde_json::Value> = entries
                .flatten()
                .map(|e| {
                    let meta = e.metadata().ok();
                    serde_json::json!({
                        "name": e.file_name().to_string_lossy(),
                        "path": e.path().to_string_lossy(),
                        "isDir": meta.as_ref().map(|m| m.is_dir()).unwrap_or(false),
                        "size": meta.as_ref().map(|m| m.len()).unwrap_or(0),
                    })
                })
                .collect();
            to_cstr(&serde_json::to_string(&items).unwrap_or_default())
        }
        Err(e) => to_cstr(&format!("error:{e}")),
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn hap_fs_create_dir(path: *const c_char) -> *mut c_char {
    match fs::create_dir_all(read_cstr(path)) {
        Ok(()) => to_cstr("ok"),
        Err(e) => to_cstr(&format!("error:{e}")),
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn hap_fs_metadata(path: *const c_char) -> *mut c_char {
    let path = read_cstr(path);
    match fs::metadata(&path) {
        Ok(meta) => {
            let json = serde_json::json!({
                "size": meta.len(),
                "isDir": meta.is_dir(),
                "isFile": meta.is_file(),
                "modified": meta.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_secs()),
                "created": meta.created().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_secs()),
            });
            to_cstr(&json.to_string())
        }
        Err(e) => to_cstr(&format!("error:{e}")),
    }
}
