use std::ffi::{CStr, CString};
use std::os::raw::c_char;
use std::path::Path;
use std::sync::Mutex;
use std::sync::LazyLock;
use libloading::{Library, Symbol};

static DB_LIB: LazyLock<Mutex<Option<Library>>> = LazyLock::new(|| Mutex::new(None));
static DB_ID: LazyLock<Mutex<String>> = LazyLock::new(|| Mutex::new(String::new()));

type FnOneStr = unsafe extern "C" fn(*const c_char) -> *mut c_char;
type FnFree = unsafe extern "C" fn(*mut c_char);

fn call(sym_name: &[u8], json_arg: &str) -> Result<String, String> {
    let guard = DB_LIB.lock().unwrap();
    let lib = guard.as_ref().ok_or("db module not loaded")?;
    let c_arg = CString::new(json_arg).unwrap();
    unsafe {
        let func: Symbol<FnOneStr> = lib.get(sym_name).map_err(|e| format!("{e}"))?;
        let ptr = func(c_arg.as_ptr());
        let result = CStr::from_ptr(ptr).to_str().unwrap_or("").to_string();
        let free: Symbol<FnFree> = lib.get(b"hap_free_string").map_err(|e| format!("{e}"))?;
        free(ptr);
        Ok(result)
    }
}

fn escape_json_str(s: &str) -> String {
    s.replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', "\\n")
        .replace('\r', "\\r")
        .replace('\t', "\\t")
}

fn get_db_id() -> Result<String, String> {
    let id = DB_ID.lock().unwrap().clone();
    if id.is_empty() { Err("database not initialized".into()) } else { Ok(id) }
}

pub fn init(data_dir: &Path) -> Result<(), Box<dyn std::error::Error>> {
    let lib_dir = data_dir.join("lib");
    let lib_path = lib_dir.join("hap-mod-sqlite.hal");
    if !lib_path.exists() {
        eprintln!("⚠ db cdylib not found: {}, skipping db init", lib_path.display());
        return Ok(());
    }

    let lib = unsafe { Library::new(&lib_path) }?;
    *DB_LIB.lock().unwrap() = Some(lib);

    let db_file = data_dir.join("data/core.db");
    std::fs::create_dir_all(db_file.parent().unwrap())?;
    let db_path_str = db_file.to_string_lossy().to_string();

    let open_json = format!(r#"{{"path":"{}"}}"#, escape_json_str(&db_path_str));
    let result = call(b"hap_sqlite_open", &open_json)?;
    let parsed: serde_json::Value = serde_json::from_str(&result)
        .map_err(|e| format!("parse open result: {e}"))?;
    if let Some(err) = parsed.get("error") {
        return Err(format!("open database failed: {err}").into());
    }
    let db_id = parsed["db_id"].as_str()
        .ok_or("hap_sqlite_open did not return db_id")?
        .to_string();
    *DB_ID.lock().unwrap() = db_id.clone();

    let stmts = [
        "CREATE TABLE IF NOT EXISTS plugins (id TEXT PRIMARY KEY, name TEXT NOT NULL, version TEXT NOT NULL, category TEXT NOT NULL, description TEXT, icon TEXT, entry_path TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'store', installed_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, enabled INTEGER NOT NULL DEFAULT 1)",
        "CREATE TABLE IF NOT EXISTS usage_history (id INTEGER PRIMARY KEY AUTOINCREMENT, plugin_id TEXT NOT NULL, used_at INTEGER NOT NULL, duration_ms INTEGER DEFAULT 0)",
        "CREATE TABLE IF NOT EXISTS favorites (plugin_id TEXT PRIMARY KEY, added_at INTEGER NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0)",
        "CREATE TABLE IF NOT EXISTS shortcuts (plugin_id TEXT PRIMARY KEY, shortcut_path TEXT NOT NULL, created_at INTEGER NOT NULL)",
        "CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)",
        "CREATE TABLE IF NOT EXISTS plugin_kv (plugin_id TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY (plugin_id, key))",
    ];
    let stmts_json: String = stmts.iter()
        .map(|s| format!(r#"{{"sql":"{}"}}"#, escape_json_str(s)))
        .collect::<Vec<_>>()
        .join(",");
    let exec_json = format!(
        r#"{{"db_id":"{}","statements":[{}]}}"#,
        escape_json_str(&db_id),
        stmts_json
    );
    let result = call(b"hap_sqlite_batch_execute", &exec_json)?;
    if result.contains("\"error\"") {
        return Err(format!("init schema failed: {result}").into());
    }

    Ok(())
}

pub fn plugin_kv_get(plugin_id: &str, key: &str) -> Result<Option<String>, String> {
    let db_id = get_db_id()?;
    let sql = "SELECT value FROM plugin_kv WHERE plugin_id = ?1 AND key = ?2";
    let json_arg = format!(
        r#"{{"db_id":"{}","sql":"{}","params":["{}","{}"]}}"#,
        escape_json_str(&db_id),
        escape_json_str(sql),
        escape_json_str(plugin_id),
        escape_json_str(key)
    );
    let result = call(b"hap_sqlite_query_one", &json_arg)?;
    let parsed: serde_json::Value = serde_json::from_str(&result).unwrap_or(serde_json::Value::Null);
    if parsed.is_null() || parsed.get("error").is_some() {
        return Ok(None);
    }
    if let Some(val) = parsed.get("value") {
        return Ok(Some(val.as_str().unwrap_or("").to_string()));
    }
    Ok(None)
}

pub fn plugin_kv_set(plugin_id: &str, key: &str, value: &str) -> Result<(), String> {
    let db_id = get_db_id()?;
    let sql = "INSERT OR REPLACE INTO plugin_kv (plugin_id, key, value) VALUES (?1, ?2, ?3)";
    let json_arg = format!(
        r#"{{"db_id":"{}","sql":"{}","params":["{}","{}","{}"]}}"#,
        escape_json_str(&db_id),
        escape_json_str(sql),
        escape_json_str(plugin_id),
        escape_json_str(key),
        escape_json_str(value)
    );
    let result = call(b"hap_sqlite_execute", &json_arg)?;
    if result.contains("\"error\"") { Err(result) } else { Ok(()) }
}
