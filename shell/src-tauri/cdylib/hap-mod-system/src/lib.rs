use std::ffi::CString;
use std::os::raw::c_char;
use sysinfo::System;

fn to_cstr(s: &str) -> *mut c_char { CString::new(s).unwrap().into_raw() }

#[unsafe(no_mangle)]
pub extern "C" fn hap_module_init() -> *const c_char {
    CString::new(r#"{"name":"system","version":"0.1.0"}"#).unwrap().into_raw()
}

#[unsafe(no_mangle)]
pub extern "C" fn hap_module_describe() -> *const c_char {
    let desc = r#"{
  "uuid": "a1b2c3d4-1000-4000-8000-000000000004",
  "name": "system",
  "version": "0.1.0",
  "author": "HiAppHub",
  "author_email": "dev@hiapphub.com",
  "author_url": "https://hiapphub.com",
  "icon": "🖥️",
  "min_shell_version": "0.1.0",
  "category": "system",
  "description": "操作系统与硬件信息",
  "descriptions": {"zh-CN":"操作系统与硬件信息","en-US":"OS and hardware information"},
  "permission": "system:info",
  "functions": [
    {"name":"platform","description":"获取当前操作系统类型","descriptions":{"zh-CN":"获取当前操作系统类型","en-US":"Get current OS type"},"symbol":"hap_system_platform","params":[],"returns":{"type":"string","desc":"windows/macos/linux","descs":{"zh-CN":"windows/macos/linux","en-US":"windows/macos/linux"}},"bridge_path":"system.platform"},
    {"name":"arch","description":"获取 CPU 架构标识","descriptions":{"zh-CN":"获取 CPU 架构标识","en-US":"Get CPU architecture"},"symbol":"hap_system_arch","params":[],"returns":{"type":"string","desc":"CPU架构","descs":{"zh-CN":"CPU架构","en-US":"CPU architecture"}},"bridge_path":"system.arch"},
    {"name":"hostname","description":"获取计算机主机名","descriptions":{"zh-CN":"获取计算机主机名","en-US":"Get computer hostname"},"symbol":"hap_system_hostname","params":[],"returns":{"type":"string","desc":"主机名","descs":{"zh-CN":"主机名","en-US":"Hostname"}},"bridge_path":"system.hostname"},
    {"name":"cpu_info","description":"获取 CPU 型号和核心数等信息","descriptions":{"zh-CN":"获取 CPU 型号和核心数等信息","en-US":"Get CPU model and core count"},"symbol":"hap_system_cpu_info","params":[],"returns":{"type":"json","desc":"CPU信息","descs":{"zh-CN":"CPU信息","en-US":"CPU info"}},"bridge_path":"system.cpuInfo"},
    {"name":"memory_info","description":"获取系统内存使用情况","descriptions":{"zh-CN":"获取系统内存使用情况","en-US":"Get system memory usage"},"symbol":"hap_system_memory_info","params":[],"returns":{"type":"json","desc":"内存信息","descs":{"zh-CN":"内存信息","en-US":"Memory info"}},"bridge_path":"system.memoryInfo"},
    {"name":"disk_info","description":"获取磁盘分区和使用情况","descriptions":{"zh-CN":"获取磁盘分区和使用情况","en-US":"Get disk partition and usage"},"symbol":"hap_system_disk_info","params":[],"returns":{"type":"json","desc":"磁盘信息","descs":{"zh-CN":"磁盘信息","en-US":"Disk info"}},"bridge_path":"system.diskInfo"},
    {"name":"process_list","description":"获取系统当前运行的进程列表","descriptions":{"zh-CN":"获取系统当前运行的进程列表","en-US":"Get running process list"},"symbol":"hap_system_process_list","params":[],"returns":{"type":"json","desc":"进程列表","descs":{"zh-CN":"进程列表","en-US":"Process list"}},"bridge_path":"system.processList"}
  ]
}"#;
    CString::new(desc).unwrap().into_raw()
}

#[unsafe(no_mangle)]
pub extern "C" fn hap_free_string(ptr: *mut c_char) {
    if !ptr.is_null() { unsafe { drop(CString::from_raw(ptr)); } }
}

#[unsafe(no_mangle)]
pub extern "C" fn hap_system_platform() -> *mut c_char {
    to_cstr(if cfg!(target_os = "windows") { "windows" }
            else if cfg!(target_os = "macos") { "macos" }
            else { "linux" })
}

#[unsafe(no_mangle)]
pub extern "C" fn hap_system_arch() -> *mut c_char {
    to_cstr(std::env::consts::ARCH)
}

#[unsafe(no_mangle)]
pub extern "C" fn hap_system_hostname() -> *mut c_char {
    to_cstr(&System::host_name().unwrap_or_default())
}

#[unsafe(no_mangle)]
pub extern "C" fn hap_system_cpu_info() -> *mut c_char {
    let mut sys = System::new();
    sys.refresh_cpu_all();
    let cpus = sys.cpus();
    let json = serde_json::json!({
        "name": cpus.first().map(|c| c.brand()).unwrap_or("unknown"),
        "cores": cpus.len(),
        "usage": cpus.iter().map(|c| c.cpu_usage()).sum::<f32>() / cpus.len().max(1) as f32,
    });
    to_cstr(&json.to_string())
}

#[unsafe(no_mangle)]
pub extern "C" fn hap_system_memory_info() -> *mut c_char {
    let mut sys = System::new();
    sys.refresh_memory();
    let json = serde_json::json!({
        "total": sys.total_memory(),
        "used": sys.used_memory(),
        "free": sys.total_memory() - sys.used_memory(),
    });
    to_cstr(&json.to_string())
}

#[unsafe(no_mangle)]
pub extern "C" fn hap_system_disk_info() -> *mut c_char {
    let disks: Vec<serde_json::Value> = sysinfo::Disks::new_with_refreshed_list()
        .iter()
        .map(|d| serde_json::json!({
            "name": d.name().to_string_lossy(),
            "mountPoint": d.mount_point().to_string_lossy(),
            "total": d.total_space(),
            "free": d.available_space(),
            "used": d.total_space() - d.available_space(),
        }))
        .collect();
    to_cstr(&serde_json::to_string(&disks).unwrap_or_default())
}

#[unsafe(no_mangle)]
pub extern "C" fn hap_system_process_list() -> *mut c_char {
    let mut sys = System::new();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
    let procs: Vec<serde_json::Value> = sys.processes()
        .values()
        .take(200)
        .map(|p| serde_json::json!({
            "pid": p.pid().as_u32(),
            "name": p.name().to_string_lossy(),
            "cpu": p.cpu_usage(),
            "memory": p.memory(),
        }))
        .collect();
    to_cstr(&serde_json::to_string(&procs).unwrap_or_default())
}
