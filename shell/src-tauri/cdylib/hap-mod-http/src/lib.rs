use std::ffi::{CStr, CString};
use std::os::raw::c_char;

fn to_cstr(s: &str) -> *mut c_char { CString::new(s).unwrap().into_raw() }
fn read_cstr(ptr: *const c_char) -> String { unsafe { CStr::from_ptr(ptr) }.to_str().unwrap_or("").to_string() }

#[unsafe(no_mangle)]
pub extern "C" fn hap_module_init() -> *const c_char {
    CString::new(r#"{"name":"http","version":"0.1.0"}"#).unwrap().into_raw()
}

#[unsafe(no_mangle)]
pub extern "C" fn hap_module_describe() -> *const c_char {
    let desc = r#"{
  "uuid": "a1b2c3d4-1000-4000-8000-000000000005",
  "name": "http",
  "version": "0.1.0",
  "author": "HiAppHub",
  "author_email": "dev@hiapphub.com",
  "author_url": "https://hiapphub.com",
  "icon": "🌐",
  "min_shell_version": "0.1.0",
  "category": "network",
  "description": "HTTP 请求客户端",
  "permission": "http:request",
  "functions": [
    {"name":"fetch","description":"发起 HTTP 请求（GET/POST/PUT/DELETE）","symbol":"hap_http_fetch","params":[{"name":"url","type":"string","desc":"请求URL"},{"name":"options","type":"json","desc":"请求选项JSON"}],"returns":{"type":"json","desc":"响应JSON"},"bridge_path":"http.fetch"}
  ]
}"#;
    CString::new(desc).unwrap().into_raw()
}

#[unsafe(no_mangle)]
pub extern "C" fn hap_free_string(ptr: *mut c_char) {
    if !ptr.is_null() { unsafe { drop(CString::from_raw(ptr)); } }
}

/// options JSON: {"method":"GET","headers":{"k":"v"},"body":"...","timeout":30}
#[unsafe(no_mangle)]
pub extern "C" fn hap_http_fetch(url: *const c_char, options: *const c_char) -> *mut c_char {
    let url = read_cstr(url);
    let opts_str = read_cstr(options);
    let opts: serde_json::Value = serde_json::from_str(&opts_str).unwrap_or_default();

    let method = opts["method"].as_str().unwrap_or("GET");

    let result = (|| -> Result<serde_json::Value, String> {
        let agent = ureq::Agent::new_with_defaults();
        let body_str = opts["body"].as_str().map(|s| s.to_string());
        let headers = opts["headers"].as_object().cloned();
        let m = method.to_uppercase();
        let has_body = matches!(m.as_str(), "POST" | "PUT" | "PATCH");

        let mut resp = if has_body {
            let mut req = match m.as_str() {
                "PUT" => agent.put(&url),
                "PATCH" => agent.patch(&url),
                _ => agent.post(&url),
            };
            if let Some(h) = &headers {
                for (k, v) in h { if let Some(val) = v.as_str() { req = req.header(k, val); } }
            }
            if let Some(b) = &body_str {
                req.content_type("application/json").send(b.as_bytes())
            } else {
                req.send_empty()
            }.map_err(|e| format!("{e}"))?
        } else {
            let mut req = match m.as_str() {
                "DELETE" => agent.delete(&url),
                "HEAD" => agent.head(&url),
                _ => agent.get(&url),
            };
            if let Some(h) = &headers {
                for (k, v) in h { if let Some(val) = v.as_str() { req = req.header(k, val); } }
            }
            req.call().map_err(|e| format!("{e}"))?
        };

        let status = resp.status().as_u16();
        let body = resp.body_mut().read_to_string().map_err(|e| format!("{e}"))?;

        Ok(serde_json::json!({ "status": status, "body": body }))
    })();

    match result {
        Ok(json) => to_cstr(&json.to_string()),
        Err(e) => to_cstr(&serde_json::json!({"error": e}).to_string()),
    }
}
