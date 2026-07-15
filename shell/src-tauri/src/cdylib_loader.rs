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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReturnDescriptor {
    #[serde(rename = "type")]
    pub return_type: String,
    pub desc: String,
}

struct LoadedModule {
    _lib: Library,
    descriptor: Option<ModuleDescriptor>,
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
                        let info = unsafe { init_fn() };
                        if !info.is_null() {
                            let info_str = unsafe { std::ffi::CStr::from_ptr(info) };
                            eprintln!("[cdylib] 已加载模块: {} → {:?}", name, info_str);
                        }
                    }

                    // 读取模块自描述（类似易语言 .fnr 描述文件）
                    let mut descriptor = {
                        let describe: Result<Symbol<DescribeFn>, _> =
                            unsafe { lib.get(b"hap_module_describe") };
                        if let Ok(describe_fn) = describe {
                            let desc_ptr = unsafe { describe_fn() };
                            if !desc_ptr.is_null() {
                                let desc_str =
                                    unsafe { std::ffi::CStr::from_ptr(desc_ptr) }
                                        .to_str()
                                        .ok();
                                desc_str.and_then(|s| {
                                    serde_json::from_str::<ModuleDescriptor>(s).ok()
                                })
                            } else {
                                None
                            }
                        } else {
                            None
                        }
                    };

                    let file_size = std::fs::metadata(&path).ok().map(|m| m.len());
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
                        .insert(name, LoadedModule { _lib: lib, descriptor });
                }
                Err(e) => {
                    eprintln!("[cdylib] 加载模块失败 {:?}: {}", path, e);
                }
            }
        }
    }
    Ok(())
}

pub fn get_all_descriptors() -> Vec<ModuleDescriptor> {
    LOADED_MODULES
        .lock()
        .unwrap()
        .values()
        .filter_map(|m| m.descriptor.clone())
        .collect()
}

#[allow(dead_code)]
pub fn get_module_descriptor(name: &str) -> Option<ModuleDescriptor> {
    LOADED_MODULES
        .lock()
        .unwrap()
        .get(name)
        .and_then(|m| m.descriptor.clone())
}
