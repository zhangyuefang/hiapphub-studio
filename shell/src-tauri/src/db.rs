use std::ffi::{CStr, CString};
use std::os::raw::c_char;
use std::path::Path;
use std::sync::Mutex;
use std::sync::LazyLock;
use libloading::{Library, Symbol};

static DB_LIB: LazyLock<Mutex<Option<Library>>> = LazyLock::new(|| Mutex::new(None));
static DB_PATH: LazyLock<Mutex<String>> = LazyLock::new(|| Mutex::new(String::new()));

type FnOneStr = unsafe extern "C" fn(*const c_char) -> *mut c_char;
type FnTwoStr = unsafe extern "C" fn(*const c_char, *const c_char) -> *mut c_char;
type FnThreeStr = unsafe extern "C" fn(*const c_char, *const c_char, *const c_char) -> *mut c_char;
type FnFree = unsafe extern "C" fn(*mut c_char);

fn call_one(sym_name: &[u8], arg: &str) -> Result<String, String> {
    let guard = DB_LIB.lock().unwrap();
    let lib = guard.as_ref().ok_or("db 模块未加载")?;
    let c_arg = CString::new(arg).unwrap();
    unsafe {
        let func: Symbol<FnOneStr> = lib.get(sym_name).map_err(|e| format!("{e}"))?;
        let ptr = func(c_arg.as_ptr());
        let result = CStr::from_ptr(ptr).to_str().unwrap_or("").to_string();
        let free: Symbol<FnFree> = lib.get(b"hap_free_string").map_err(|e| format!("{e}"))?;
        free(ptr);
        Ok(result)
    }
}

fn call_three(sym_name: &[u8], a: &str, b: &str, c: &str) -> Result<String, String> {
    let guard = DB_LIB.lock().unwrap();
    let lib = guard.as_ref().ok_or("db 模块未加载")?;
    let ca = CString::new(a).unwrap();
    let cb = CString::new(b).unwrap();
    let cc = CString::new(c).unwrap();
    unsafe {
        let func: Symbol<FnThreeStr> = lib.get(sym_name).map_err(|e| format!("{e}"))?;
        let ptr = func(ca.as_ptr(), cb.as_ptr(), cc.as_ptr());
        let result = CStr::from_ptr(ptr).to_str().unwrap_or("").to_string();
        let free: Symbol<FnFree> = lib.get(b"hap_free_string").map_err(|e| format!("{e}"))?;
        free(ptr);
        Ok(result)
    }
}

fn call_two(sym_name: &[u8], a: &str, b: &str) -> Result<String, String> {
    let guard = DB_LIB.lock().unwrap();
    let lib = guard.as_ref().ok_or("db 模块未加载")?;
    let ca = CString::new(a).unwrap();
    let cb = CString::new(b).unwrap();
    unsafe {
        let func: Symbol<FnTwoStr> = lib.get(sym_name).map_err(|e| format!("{e}"))?;
        let ptr = func(ca.as_ptr(), cb.as_ptr());
        let result = CStr::from_ptr(ptr).to_str().unwrap_or("").to_string();
        let free: Symbol<FnFree> = lib.get(b"hap_free_string").map_err(|e| format!("{e}"))?;
        free(ptr);
        Ok(result)
    }
}

pub fn init(data_dir: &Path) -> Result<(), Box<dyn std::error::Error>> {
    let lib_dir = data_dir.join("lib");
    let lib_path = lib_dir.join("hap-mod-sqlite.hal");
    if !lib_path.exists() {
        eprintln!("⚠ db cdylib 不存在: {}, 跳过数据库初始化", lib_path.display());
        return Ok(());
    }

    let lib = unsafe { Library::new(&lib_path) }?;
    *DB_LIB.lock().unwrap() = Some(lib);

    let db_file = data_dir.join("data/core.db");
    let db_path_str = db_file.to_string_lossy().to_string();
    *DB_PATH.lock().unwrap() = db_path_str.clone();

    let result = call_one(b"hap_sqlite_open", &db_path_str)?;
    if result.starts_with("error") {
        return Err(format!("打开数据库失败: {result}").into());
    }

    let schema_sql = "CREATE TABLE IF NOT EXISTS plugins (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, version TEXT NOT NULL,
        category TEXT NOT NULL, description TEXT, icon TEXT,
        entry_path TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'store',
        installed_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, enabled INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS usage_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT, plugin_id TEXT NOT NULL,
        used_at INTEGER NOT NULL, duration_ms INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS favorites (
        plugin_id TEXT PRIMARY KEY, added_at INTEGER NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS shortcuts (
        plugin_id TEXT PRIMARY KEY, shortcut_path TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS plugin_kv (
        plugin_id TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY (plugin_id, key));";
    let result = call_three(b"hap_sqlite_execute", &db_path_str, schema_sql, "[]")?;
    if result.contains("error") {
        return Err(format!("初始化表结构失败: {result}").into());
    }

    Ok(())
}

pub fn plugin_kv_get(plugin_id: &str, key: &str) -> Result<Option<String>, String> {
    let db_path = DB_PATH.lock().unwrap().clone();
    if db_path.is_empty() { return Err("数据库未初始化".into()); }
    let composite_key = format!("{plugin_id}:{key}");
    let result = call_two(b"hap_sqlite_kv_get", &db_path, &composite_key)?;
    if result.is_empty() { Ok(None) } else { Ok(Some(result)) }
}

pub fn plugin_kv_set(plugin_id: &str, key: &str, value: &str) -> Result<(), String> {
    let db_path = DB_PATH.lock().unwrap().clone();
    if db_path.is_empty() { return Err("数据库未初始化".into()); }
    let composite_key = format!("{plugin_id}:{key}");
    let result = call_three(b"hap_sqlite_kv_set", &db_path, &composite_key, value)?;
    if result.starts_with("error") { Err(result) } else { Ok(()) }
}
