use std::ffi::{CStr, CString};
use std::os::raw::c_char;
use arboard::Clipboard;

#[unsafe(no_mangle)]
pub extern "C" fn hap_module_init() -> *const c_char {
    let info = r#"{"name":"clipboard","version":"0.1.0","apis":["read_text","write_text"]}"#;
    CString::new(info).unwrap().into_raw()
}

#[unsafe(no_mangle)]
pub extern "C" fn hap_module_describe() -> *const c_char {
    let desc = r#"{
  "uuid": "a1b2c3d4-1000-4000-8000-000000000002",
  "name": "clipboard",
  "version": "0.1.0",
  "author": "HiAppHub",
  "author_email": "dev@hiapphub.com",
  "author_url": "https://hiapphub.com",
  "icon": "📋",
  "min_shell_version": "0.1.0",
  "category": "system",
  "description": "剪贴板读写能力模块",
  "permission": "clipboard",
  "functions": [
    {"name":"read_text","description":"读取系统剪贴板中的文本内容","symbol":"hap_clipboard_read_text","params":[],"returns":{"type":"string","desc":"剪贴板文本"},"bridge_path":"clipboard.readText"},
    {"name":"write_text","description":"将文本写入系统剪贴板","symbol":"hap_clipboard_write_text","params":[{"name":"text","type":"string","desc":"写入文本"}],"returns":{"type":"string","desc":"ok或error"},"bridge_path":"clipboard.writeText"}
  ]
}"#;
    CString::new(desc).unwrap().into_raw()
}

#[unsafe(no_mangle)]
pub extern "C" fn hap_free_string(ptr: *mut c_char) {
    if !ptr.is_null() {
        unsafe { drop(CString::from_raw(ptr)); }
    }
}

/// 读取剪贴板文本，失败返回 "error:..." 前缀
#[unsafe(no_mangle)]
pub extern "C" fn hap_clipboard_read_text() -> *mut c_char {
    let result = Clipboard::new()
        .and_then(|mut cb| cb.get_text())
        .unwrap_or_else(|e| format!("error:{e}"));
    CString::new(result).unwrap().into_raw()
}

/// 写入剪贴板文本，成功返回 "ok"，失败返回 "error:..."
#[unsafe(no_mangle)]
pub extern "C" fn hap_clipboard_write_text(text: *const c_char) -> *mut c_char {
    let text = unsafe { CStr::from_ptr(text) }.to_str().unwrap_or("");
    let result = match Clipboard::new().and_then(|mut cb| cb.set_text(text.to_string())) {
        Ok(()) => "ok".to_string(),
        Err(e) => format!("error:{e}"),
    };
    CString::new(result).unwrap().into_raw()
}
