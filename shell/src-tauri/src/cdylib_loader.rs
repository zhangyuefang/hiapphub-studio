use std::path::Path;
use std::sync::OnceLock;
use libloading::{Library, Symbol};
use std::collections::HashMap;
use std::sync::Mutex;
use std::sync::LazyLock;
use serde::{Deserialize, Serialize};
use tauri::Emitter;

type CCharPtr = *const std::os::raw::c_char;
type CCharMutPtr = *mut std::os::raw::c_char;
type FreeFn = unsafe extern "C" fn(CCharMutPtr);

#[repr(C)]
pub struct HapContext {
    pub emit_callback: extern "C" fn(CCharPtr, CCharPtr),
    pub shell_version: CCharPtr,
}

static APP_HANDLE: OnceLock<tauri::AppHandle> = OnceLock::new();

extern "C" fn real_emit(callback_id: CCharPtr, event_json: CCharPtr) {
    if callback_id.is_null() || event_json.is_null() { return; }
    let Some(handle) = APP_HANDLE.get() else { return; };
    let id = unsafe { std::ffi::CStr::from_ptr(callback_id) }.to_str().unwrap_or("");
    let json = unsafe { std::ffi::CStr::from_ptr(event_json) }.to_str().unwrap_or("");
    if let Some((event_part, target)) = id.split_once('@') {
        let event_name = format!("hap:{}", event_part);
        let _ = handle.emit_to(target, &event_name, json.to_string());
    } else {
        let event_name = format!("hap:{}", id);
        let _ = handle.emit(&event_name, json.to_string());
    }
}

pub fn set_app_handle(handle: tauri::AppHandle) {
    let _ = APP_HANDLE.set(handle);
}

static SHELL_VERSION: &std::ffi::CStr = unsafe {
    std::ffi::CStr::from_bytes_with_nul_unchecked(b"0.2.0\0")
};

static HAP_CONTEXT: HapContext = HapContext {
    emit_callback: real_emit,
    shell_version: SHELL_VERSION.as_ptr(),
};

// SAFETY: HAP_CONTEXT 中的 shell_version 指向 'static CStr，emit_callback 是 fn 指针，均线程安全
unsafe impl Sync for HapContext {}

type InitFn = unsafe extern "C" fn(*const HapContext) -> CCharPtr;
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
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub descriptions: Option<HashMap<String, String>>,
    #[serde(default)]
    pub overview: Option<String>,
    #[serde(default)]
    pub overviews: Option<HashMap<String, String>>,
    pub permission: String,
    #[serde(default)]
    pub functions: Vec<FunctionDescriptor>,
    #[serde(default)]
    pub types: Option<Vec<TypeDescriptor>>,
    #[serde(default)]
    pub constants: Option<Vec<ConstantDescriptor>>,
    #[serde(default)]
    pub events: Option<Vec<EventDescriptor>>,
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
    #[serde(default)]
    pub params: Vec<ParamDescriptor>,
    #[serde(default = "ReturnDescriptor::default_value")]
    pub returns: ReturnDescriptor,
    #[serde(default)]
    pub bridge_path: String,
    #[serde(default)]
    pub group: Option<String>,
    #[serde(default, rename = "async")]
    pub is_async: Option<bool>,
    #[serde(default)]
    pub platform: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TypeDescriptor {
    pub name: String,
    #[serde(default)]
    pub descriptions: Option<HashMap<String, String>>,
    #[serde(default)]
    pub fields: Vec<ParamDescriptor>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConstantDescriptor {
    pub name: String,
    pub value: serde_json::Value,
    #[serde(rename = "type")]
    pub value_type: String,
    #[serde(default)]
    pub group: Option<String>,
    #[serde(default)]
    pub descs: Option<HashMap<String, String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventDescriptor {
    pub name: String,
    #[serde(default)]
    pub descriptions: Option<HashMap<String, String>>,
    #[serde(default)]
    pub payload: Vec<ParamDescriptor>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParamDescriptor {
    pub name: String,
    #[serde(rename = "type")]
    pub param_type: String,
    #[serde(default)]
    pub desc: Option<String>,
    #[serde(default)]
    pub descs: Option<HashMap<String, String>>,
    #[serde(default)]
    pub optional: Option<bool>,
    #[serde(default)]
    pub default_value: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReturnDescriptor {
    #[serde(rename = "type", default)]
    pub return_type: String,
    #[serde(default)]
    pub desc: Option<String>,
    #[serde(default)]
    pub descs: Option<HashMap<String, String>>,
}

impl ReturnDescriptor {
    fn default_value() -> Self {
        Self { return_type: String::new(), desc: None, descs: None }
    }
}

static USER_LOCALE: std::sync::Mutex<String> = std::sync::Mutex::new(String::new());

pub fn set_user_locale(locale: &str) {
    *USER_LOCALE.lock().unwrap() = locale.to_string();
    let mut map = LOADED_MODULES.lock().unwrap();
    for module in map.values_mut() {
        if let Some(ref mut d) = module.descriptor {
            fill_fallback_fields(d);
        }
    }
}

fn i18n_fallback(field: &mut Option<String>, map: &Option<HashMap<String, String>>) {
    if let Some(m) = map {
        let user_locale = USER_LOCALE.lock().unwrap().clone();
        let resolved = if !user_locale.is_empty() { m.get(&user_locale) } else { None }
            .or_else(|| m.get("en-US"))
            .or_else(|| m.get("zh-CN"))
            .or_else(|| m.values().next());
        if let Some(v) = resolved {
            *field = Some(v.clone());
        }
    }
}

fn fill_fallback_fields(d: &mut ModuleDescriptor) {
    i18n_fallback(&mut d.description, &d.descriptions);
    i18n_fallback(&mut d.overview, &d.overviews);
    for f in &mut d.functions {
        i18n_fallback(&mut f.description, &f.descriptions);
        for p in &mut f.params {
            i18n_fallback(&mut p.desc, &p.descs);
        }
        i18n_fallback(&mut f.returns.desc, &f.returns.descs);
    }
}

type CleanupFn = unsafe extern "C" fn(CCharPtr);

struct LoadedModule {
    _lib: Library,
    descriptor: Option<ModuleDescriptor>,
    file_mtime: Option<std::time::SystemTime>,
    _source_path: String,
    free_fn: Option<FreeFn>,
    cleanup_fn: Option<CleanupFn>,
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
                    let free_fn: Option<FreeFn> = unsafe { lib.get::<FreeFn>(b"hap_free_string") }.ok().map(|s| *s);
                    let cleanup_fn: Option<CleanupFn> = unsafe { lib.get::<CleanupFn>(b"hap_module_cleanup") }.ok().map(|s| *s);

                    let init: Result<Symbol<InitFn>, _> =
                        unsafe { lib.get(b"hap_module_init") };
                    if let Ok(init_fn) = init {
                        let init_result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                            unsafe { init_fn(&HAP_CONTEXT) }
                        }));
                        match init_result {
                            Ok(info) if !info.is_null() => {
                                let info_str = unsafe { std::ffi::CStr::from_ptr(info) };
                                eprintln!("[cdylib] 已加载模块: {} → {:?}", name, info_str);
                                if let Some(free) = free_fn {
                                    unsafe { free(info as CCharMutPtr) };
                                }
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
                                    let parsed = unsafe { std::ffi::CStr::from_ptr(desc_ptr) }
                                        .to_str().ok()
                                        .and_then(|s| serde_json::from_str::<ModuleDescriptor>(s).ok());
                                    if let Some(free) = free_fn {
                                        unsafe { free(desc_ptr as CCharMutPtr) };
                                    }
                                    parsed
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
                        fill_fallback_fields(d);
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
                            free_fn,
                            cleanup_fn,
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
                let free_fn: Option<FreeFn> = unsafe { lib.get::<FreeFn>(b"hap_free_string") }.ok().map(|s| *s);
                let cleanup_fn: Option<CleanupFn> = unsafe { lib.get::<CleanupFn>(b"hap_module_cleanup") }.ok().map(|s| *s);

                let init: Result<Symbol<InitFn>, _> = unsafe { lib.get(b"hap_module_init") };
                if let Ok(init_fn) = init {
                    let init_result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                        unsafe { init_fn(&HAP_CONTEXT) }
                    }));
                    match init_result {
                        Ok(info) if !info.is_null() => {
                            let info_str = unsafe { std::ffi::CStr::from_ptr(info) };
                            eprintln!("[cdylib] 已加载模块: {name} → {info_str:?}");
                            if let Some(free) = free_fn {
                                unsafe { free(info as CCharMutPtr) };
                            }
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
                                let parsed = unsafe { std::ffi::CStr::from_ptr(desc_ptr) }
                                    .to_str().ok()
                                    .and_then(|s| serde_json::from_str::<ModuleDescriptor>(s).ok());
                                if let Some(free) = free_fn {
                                    unsafe { free(desc_ptr as CCharMutPtr) };
                                }
                                parsed
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
                    fill_fallback_fields(d);
                }

                map.insert(name.clone(), LoadedModule {
                    _lib: lib,
                    descriptor,
                    file_mtime: *new_mtime,
                    _source_path: file_path_str,
                    free_fn,
                    cleanup_fn,
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
    let map = LOADED_MODULES.lock().unwrap();
    map.get(module_name)
        .or_else(|| map.get(&format!("hap-mod-{module_name}")))
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
    let (func_ptr, free_fn) = {
        let map = LOADED_MODULES.lock().unwrap();
        let loaded = map.get(module_name)
            .or_else(|| map.get(&format!("hap-mod-{module_name}")))
            .ok_or_else(|| format!("module '{module_name}' not loaded"))?;

        let desc = loaded.descriptor.as_ref()
            .ok_or_else(|| format!("module '{module_name}' has no descriptor"))?;

        let _fn_desc = desc.functions.iter()
            .find(|f| f.symbol == symbol_name)
            .ok_or_else(|| format!("function '{symbol_name}' not found in module '{module_name}'"))?;

        let func: Symbol<HalCallFn> = unsafe {
            loaded._lib.get(symbol_name.as_bytes())
        }.map_err(|e| format!("symbol '{symbol_name}' lookup failed: {e}"))?;

        let fn_ptr: HalCallFn = *func;
        (fn_ptr, loaded.free_fn)
    };

    let c_params = std::ffi::CString::new(params_json)
        .map_err(|e| format!("param encoding failed: {e}"))?;

    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        unsafe { func_ptr(c_params.as_ptr()) }
    }));

    match result {
        Ok(ptr) if !ptr.is_null() => {
            let c_str = unsafe { std::ffi::CStr::from_ptr(ptr) };
            let ret = c_str.to_str()
                .map(|s| s.to_string())
                .map_err(|e| format!("return value UTF-8 decode failed: {e}"));
            if let Some(free) = free_fn {
                unsafe { free(ptr as CCharMutPtr) };
            }
            ret
        }
        Ok(_) => Ok("null".to_string()),
        Err(_) => Err(format!("function '{symbol_name}' panicked during execution")),
    }
}

/// 应用退出时通知所有模块清理该应用持有的资源
pub fn cleanup_app_resources(app_id: &str) {
    let map = LOADED_MODULES.lock().unwrap();
    let c_app_id = match std::ffi::CString::new(app_id) {
        Ok(s) => s,
        Err(_) => return,
    };
    for (name, module) in map.iter() {
        if let Some(cleanup) = module.cleanup_fn {
            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                unsafe { cleanup(c_app_id.as_ptr()) }
            }));
            if result.is_err() {
                eprintln!("[cdylib] 模块 {name} cleanup panic for app {app_id}");
            }
        }
    }
}
