use std::path::Path;
use libloading::{Library, Symbol};
use std::collections::HashMap;
use std::sync::Mutex;
use std::sync::LazyLock;
use serde::{Deserialize, Serialize};

type CCharPtr = *const std::os::raw::c_char;
type InitFn = unsafe extern "C" fn() -> CCharPtr;
type DescribeFn = unsafe extern "C" fn() -> CCharPtr;

/// 借鉴易语言支持库 .fnr 自描述机制：
/// 每个 cdylib 导出 hap_module_describe() 返回完整 API JSON，
/// Shell 无需硬编码任何模块接口，加载后自动注册 Bridge 路由。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModuleDescriptor {
    pub uuid: Option<String>,
    pub name: String,
    pub version: String,
    pub author: Option<String>,
    pub author_email: Option<String>,
    pub author_url: Option<String>,
    pub icon: Option<String>,
    pub min_shell_version: Option<String>,
    pub category: String,
    pub description: String,
    #[serde(default)]
    pub descriptions: Option<HashMap<String, String>>,
    pub permission: String,
    #[serde(default)]
    pub functions: Vec<FunctionDescriptor>,
    #[serde(skip_deserializing)]
    pub file_path: Option<String>,
    #[serde(skip_deserializing)]
    pub file_size: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FunctionDescriptor {
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub descriptions: Option<HashMap<String, String>>,
    pub symbol: String,
    pub params: Vec<ParamDescriptor>,
    pub returns: ReturnDescriptor,
    pub bridge_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParamDescriptor {
    pub name: String,
    #[serde(rename = "type")]
    pub param_type: String,
    pub desc: String,
    #[serde(default)]
    pub descs: Option<HashMap<String, String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReturnDescriptor {
    #[serde(rename = "type")]
    pub return_type: String,
    pub desc: String,
    #[serde(default)]
    pub descs: Option<HashMap<String, String>>,
}

struct LoadedModule {
    _lib: Library,
    descriptor: Option<ModuleDescriptor>,
    file_mtime: Option<std::time::SystemTime>,
    _source_path: String,
}

static LOADED_MODULES: LazyLock<Mutex<HashMap<String, LoadedModule>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

pub fn load_modules(data_dir: &Path) -> Result<(), Box<dyn std::error::Error>> {
    let lib_dir = data_dir.join("lib");
    if !lib_dir.exists() {
        return Ok(());
    }

    let entries = std::fs::read_dir(&lib_dir)?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("hal") {
            let name = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("unknown")
                .to_string();

            match unsafe { Library::new(&path) } {
                Ok(lib) => {
                    let init: Result<Symbol<InitFn>, _> =
                        unsafe { lib.get(b"hap_module_init") };
                    if let Ok(init_fn) = init {
                        let init_result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                            unsafe { init_fn() }
                        }));
                        match init_result {
                            Ok(info) if !info.is_null() => {
                                let info_str = unsafe { std::ffi::CStr::from_ptr(info) };
                                eprintln!("[cdylib] 已加载模块: {} → {:?}", name, info_str);
                            }
                            Err(_) => {
                                eprintln!("[cdylib] 模块初始化 panic: {}", name);
                                continue;
                            }
                            _ => {}
                        }
                    }

                    let mut descriptor = {
                        let describe: Result<Symbol<DescribeFn>, _> =
                            unsafe { lib.get(b"hap_module_describe") };
                        if let Ok(describe_fn) = describe {
                            let desc_result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                                unsafe { describe_fn() }
                            }));
                            match desc_result {
                                Ok(desc_ptr) if !desc_ptr.is_null() => {
                                    unsafe { std::ffi::CStr::from_ptr(desc_ptr) }
                                        .to_str().ok()
                                        .and_then(|s| serde_json::from_str::<ModuleDescriptor>(s).ok())
                                }
                                Err(_) => {
                                    eprintln!("[cdylib] 模块描述 panic: {}", name);
                                    None
                                }
                                _ => None,
                            }
                        } else {
                            None
                        }
                    };

                    let meta = std::fs::metadata(&path).ok();
                    let file_size = meta.as_ref().map(|m| m.len());
                    let file_mtime = meta.and_then(|m| m.modified().ok());
                    let file_path_str = path.to_string_lossy().to_string();

                    if let Some(ref mut d) = descriptor {
                        d.file_path = Some(file_path_str.clone());
                        d.file_size = file_size;
                        eprintln!(
                            "[cdylib] 模块描述: {} v{} — {} 个API",
                            d.name,
                            d.version,
                            d.functions.len()
                        );
                    }

                    LOADED_MODULES
                        .lock()
                        .unwrap()
                        .insert(name, LoadedModule {
                            _lib: lib,
                            descriptor,
                            file_mtime,
                            _source_path: file_path_str,
                        });
                }
                Err(e) => {
                    eprintln!("[cdylib] 加载模块失败 {:?}: {}", path, e);
                }
            }
        }
    }
    Ok(())
}

#[derive(Debug, Clone, Serialize)]
pub struct ReloadResult {
    pub added: Vec<String>,
    pub updated: Vec<String>,
    pub removed: Vec<String>,
}

pub fn reload_modules(data_dir: &Path) -> Result<ReloadResult, Box<dyn std::error::Error>> {
    let lib_dir = data_dir.join("lib");
    let mut result = ReloadResult { added: vec![], updated: vec![], removed: vec![] };

    if !lib_dir.exists() {
        let mut map = LOADED_MODULES.lock().unwrap();
        result.removed = map.keys().cloned().collect();
        map.clear();
        return Ok(result);
    }

    let mut current_files: HashMap<String, (std::path::PathBuf, Option<std::time::SystemTime>)> = HashMap::new();
    for entry in std::fs::read_dir(&lib_dir)?.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("hal") {
            let name = path.file_stem().and_then(|s| s.to_str()).unwrap_or("unknown").to_string();
            let mtime = std::fs::metadata(&path).ok().and_then(|m| m.modified().ok());
            current_files.insert(name, (path, mtime));
        }
    }

    let mut map = LOADED_MODULES.lock().unwrap();

    let old_keys: Vec<String> = map.keys().cloned().collect();
    for key in &old_keys {
        if !current_files.contains_key(key) {
            map.remove(key);
            result.removed.push(key.clone());
            eprintln!("[cdylib] 移除模块: {key}");
        }
    }

    for (name, (path, new_mtime)) in &current_files {
        let needs_load = if let Some(existing) = map.get(name) {
            match (existing.file_mtime, new_mtime) {
                (Some(old_t), Some(new_t)) => new_t > &old_t,
                _ => false,
            }
        } else {
            true
        };

        if !needs_load { continue; }

        let is_update = map.contains_key(name);
        if is_update {
            map.remove(name);
        }

        match unsafe { Library::new(path) } {
            Ok(lib) => {
                let init: Result<Symbol<InitFn>, _> = unsafe { lib.get(b"hap_module_init") };
                if let Ok(init_fn) = init {
                    let init_result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                        unsafe { init_fn() }
                    }));
                    match init_result {
                        Ok(info) if !info.is_null() => {
                            let info_str = unsafe { std::ffi::CStr::from_ptr(info) };
                            eprintln!("[cdylib] 已加载模块: {name} → {info_str:?}");
                        }
                        Err(_) => {
                            eprintln!("[cdylib] 模块初始化 panic: {name}");
                            continue;
                        }
                        _ => {}
                    }
                }

                let mut descriptor = {
                    let describe: Result<Symbol<DescribeFn>, _> = unsafe { lib.get(b"hap_module_describe") };
                    if let Ok(describe_fn) = describe {
                        let desc_result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                            unsafe { describe_fn() }
                        }));
                        match desc_result {
                            Ok(desc_ptr) if !desc_ptr.is_null() => {
                                unsafe { std::ffi::CStr::from_ptr(desc_ptr) }
                                    .to_str().ok()
                                    .and_then(|s| serde_json::from_str::<ModuleDescriptor>(s).ok())
                            }
                            Err(_) => {
                                eprintln!("[cdylib] 模块描述 panic: {name}");
                                None
                            }
                            _ => None,
                        }
                    } else { None }
                };

                let file_size = std::fs::metadata(path).ok().map(|m| m.len());
                let file_path_str = path.to_string_lossy().to_string();

                if let Some(ref mut d) = descriptor {
                    d.file_path = Some(file_path_str.clone());
                    d.file_size = file_size;
                }

                map.insert(name.clone(), LoadedModule {
                    _lib: lib,
                    descriptor,
                    file_mtime: *new_mtime,
                    _source_path: file_path_str,
                });

                if is_update {
                    result.updated.push(name.clone());
                    eprintln!("[cdylib] 热更新模块: {name}");
                } else {
                    result.added.push(name.clone());
                    eprintln!("[cdylib] 新增模块: {name}");
                }
            }
            Err(e) => {
                eprintln!("[cdylib] 加载模块失败 {path:?}: {e}");
            }
        }
    }

    Ok(result)
}

pub fn get_all_descriptors() -> Vec<ModuleDescriptor> {
    LOADED_MODULES
        .lock()
        .unwrap()
        .values()
        .filter_map(|m| m.descriptor.clone())
        .collect()
}

pub fn get_module_permission(module_name: &str) -> Option<String> {
    LOADED_MODULES
        .lock()
        .unwrap()
        .get(module_name)
        .and_then(|m| m.descriptor.as_ref())
        .map(|d| d.permission.clone())
}

#[allow(dead_code)]
pub fn get_module_descriptor(name: &str) -> Option<ModuleDescriptor> {
    LOADED_MODULES
        .lock()
        .unwrap()
        .get(name)
        .and_then(|m| m.descriptor.clone())
}

type HalCallFn = unsafe extern "C" fn(CCharPtr) -> CCharPtr;

/// 通用 HAL 函数调用：通过 symbol 名称动态查找并调用模块导出函数。
/// HAL 函数统一签名：`extern "C" fn(params_json: *const c_char) -> *const c_char`
pub fn call_function(module_name: &str, symbol_name: &str, params_json: &str) -> Result<String, String> {
    let map = LOADED_MODULES.lock().unwrap();
    let loaded = map.get(module_name)
        .ok_or_else(|| format!("模块 '{module_name}' 未加载"))?;

    let desc = loaded.descriptor.as_ref()
        .ok_or_else(|| format!("模块 '{module_name}' 无描述信息"))?;

    let _fn_desc = desc.functions.iter()
        .find(|f| f.symbol == symbol_name)
        .ok_or_else(|| format!("模块 '{module_name}' 中未找到函数 '{symbol_name}'"))?;

    let func: Symbol<HalCallFn> = unsafe {
        loaded._lib.get(symbol_name.as_bytes())
    }.map_err(|e| format!("查找符号 '{symbol_name}' 失败: {e}"))?;

    let c_params = std::ffi::CString::new(params_json)
        .map_err(|e| format!("参数编码失败: {e}"))?;

    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        unsafe { func(c_params.as_ptr()) }
    }));

    match result {
        Ok(ptr) if !ptr.is_null() => {
            let c_str = unsafe { std::ffi::CStr::from_ptr(ptr) };
            c_str.to_str()
                .map(|s| s.to_string())
                .map_err(|e| format!("返回值 UTF-8 解码失败: {e}"))
        }
        Ok(_) => Ok("null".to_string()),
        Err(_) => Err(format!("函数 '{symbol_name}' 执行时发生 panic")),
    }
}
