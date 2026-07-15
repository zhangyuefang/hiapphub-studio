use std::ffi::{CStr, CString};
use std::os::raw::c_char;
use sha2::{Sha256, Sha512, Digest};
use md5::Md5;
use rand::Rng;

/// 模块初始化（轻量，仅返回模块名+版本）
#[unsafe(no_mangle)]
pub extern "C" fn hap_module_init() -> *const c_char {
    let info = r#"{"name":"crypto","version":"0.1.0"}"#;
    CString::new(info).unwrap().into_raw()
}

/// 借鉴易语言支持库 .fnr 描述文件机制：
/// 返回完整 API 描述 JSON，Shell 据此自动注册 Bridge 路由，
/// 无需在 Shell 中硬编码任何模块的函数签名。
#[unsafe(no_mangle)]
pub extern "C" fn hap_module_describe() -> *const c_char {
    let desc = r#"{
  "uuid": "a1b2c3d4-1000-4000-8000-000000000001",
  "name": "crypto",
  "version": "0.1.0",
  "author": "HiAppHub",
  "author_email": "dev@hiapphub.com",
  "author_url": "https://hiapphub.com",
  "icon": "🔐",
  "min_shell_version": "0.1.0",
  "category": "security",
  "description": "加密/哈希/随机数能力模块",
  "permission": "crypto",
  "functions": [
    {
      "name": "hash",
      "symbol": "hap_crypto_hash",
      "params": [
        {"name": "algorithm", "type": "string", "desc": "md5|sha256|sha512"},
        {"name": "data", "type": "string", "desc": "待哈希数据"}
      ],
      "returns": {"type": "string", "desc": "十六进制摘要"},
      "bridge_path": "crypto.hash"
    },
    {
      "name": "random_bytes",
      "symbol": "hap_crypto_random_bytes",
      "params": [
        {"name": "length", "type": "u32", "desc": "字节数"}
      ],
      "returns": {"type": "string", "desc": "十六进制随机字节"},
      "bridge_path": "crypto.randomBytes"
    }
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

#[unsafe(no_mangle)]
pub extern "C" fn hap_crypto_hash(algo: *const c_char, data: *const c_char) -> *mut c_char {
    let algo = unsafe { CStr::from_ptr(algo) }.to_str().unwrap_or("");
    let data = unsafe { CStr::from_ptr(data) }.to_str().unwrap_or("");

    let hex = match algo {
        "md5" => {
            let mut h = Md5::new();
            h.update(data.as_bytes());
            format!("{:x}", h.finalize())
        }
        "sha256" => {
            let mut h = Sha256::new();
            h.update(data.as_bytes());
            format!("{:x}", h.finalize())
        }
        "sha512" => {
            let mut h = Sha512::new();
            h.update(data.as_bytes());
            format!("{:x}", h.finalize())
        }
        _ => format!("error:unsupported algorithm {}", algo),
    };
    CString::new(hex).unwrap().into_raw()
}

#[unsafe(no_mangle)]
pub extern "C" fn hap_crypto_random_bytes(length: u32) -> *mut c_char {
    let mut buf = vec![0u8; length as usize];
    rand::rng().fill(&mut buf[..]);
    let hex: String = buf.iter().map(|b| format!("{:02x}", b)).collect();
    CString::new(hex).unwrap().into_raw()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::ffi::CString;

    #[test]
    fn test_sha256() {
        let algo = CString::new("sha256").unwrap();
        let data = CString::new("hello").unwrap();
        let result = hap_crypto_hash(algo.as_ptr(), data.as_ptr());
        let result_str = unsafe { CStr::from_ptr(result) }.to_str().unwrap();
        assert_eq!(
            result_str,
            "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
        );
        hap_free_string(result);
    }

    #[test]
    fn test_random_bytes() {
        let result = hap_crypto_random_bytes(16);
        let result_str = unsafe { CStr::from_ptr(result) }.to_str().unwrap();
        assert_eq!(result_str.len(), 32);
        hap_free_string(result);
    }

    #[test]
    fn test_describe() {
        let desc = hap_module_describe();
        let desc_str = unsafe { CStr::from_ptr(desc) }.to_str().unwrap();
        let json: serde_json::Value = serde_json::from_str(desc_str).unwrap();
        assert_eq!(json["name"], "crypto");
        assert_eq!(json["functions"].as_array().unwrap().len(), 2);
        hap_free_string(desc as *mut c_char);
    }
}
