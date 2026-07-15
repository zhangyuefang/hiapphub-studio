use std::ffi::{CStr, CString};
use std::os::raw::c_char;
use rusqlite::Connection;
use std::sync::Mutex;
use std::collections::HashMap;
use std::sync::LazyLock;

fn to_cstr(s: &str) -> *mut c_char { CString::new(s).unwrap().into_raw() }
fn read_cstr(ptr: *const c_char) -> String { unsafe { CStr::from_ptr(ptr) }.to_str().unwrap_or("").to_string() }

static CONNECTIONS: LazyLock<Mutex<HashMap<String, Connection>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

#[unsafe(no_mangle)]
pub extern "C" fn hap_module_init() -> *const c_char {
    CString::new(r#"{"name":"sqlite","version":"0.1.0"}"#).unwrap().into_raw()
}

#[unsafe(no_mangle)]
pub extern "C" fn hap_module_describe() -> *const c_char {
    let desc = r#"{
  "uuid": "a1b2c3d4-1000-4000-8000-000000000006",
  "name": "sqlite",
  "version": "0.1.0",
  "author": "HiAppHub",
  "author_email": "dev@hiapphub.com",
  "author_url": "https://hiapphub.com",
  "icon": "🗄️",
  "min_shell_version": "0.1.0",
  "category": "data",
  "description": "SQLite 数据库操作",
  "permission": "db:sqlite",
  "functions": [
    {"name":"open","description":"打开或创建 SQLite 数据库文件","symbol":"hap_sqlite_open","params":[{"name":"db_path","type":"string","desc":"数据库文件路径"}],"returns":{"type":"string","desc":"ok或error"},"bridge_path":"sqlite.open"},
    {"name":"execute","description":"执行 SQL 语句（INSERT/UPDATE/DELETE/CREATE）","symbol":"hap_sqlite_execute","params":[{"name":"db_path","type":"string","desc":"数据库路径"},{"name":"sql","type":"string","desc":"SQL语句"},{"name":"params","type":"json","desc":"参数JSON数组"}],"returns":{"type":"json","desc":"执行结果"},"bridge_path":"sqlite.execute"},
    {"name":"query","description":"执行 SQL 查询并返回结果集","symbol":"hap_sqlite_query","params":[{"name":"db_path","type":"string","desc":"数据库路径"},{"name":"sql","type":"string","desc":"SQL语句"},{"name":"params","type":"json","desc":"参数JSON数组"}],"returns":{"type":"json","desc":"查询结果"},"bridge_path":"sqlite.query"},
    {"name":"kv_get","description":"从键值表中读取指定键的值","symbol":"hap_sqlite_kv_get","params":[{"name":"db_path","type":"string","desc":"数据库路径"},{"name":"key","type":"string","desc":"键"}],"returns":{"type":"string","desc":"值或空"},"bridge_path":"sqlite.kvGet"},
    {"name":"kv_set","description":"向键值表中写入或更新键值对","symbol":"hap_sqlite_kv_set","params":[{"name":"db_path","type":"string","desc":"数据库路径"},{"name":"key","type":"string","desc":"键"},{"name":"value","type":"string","desc":"值"}],"returns":{"type":"string","desc":"ok或error"},"bridge_path":"sqlite.kvSet"}
  ]
}"#;
    CString::new(desc).unwrap().into_raw()
}

#[unsafe(no_mangle)]
pub extern "C" fn hap_free_string(ptr: *mut c_char) {
    if !ptr.is_null() { unsafe { drop(CString::from_raw(ptr)); } }
}

fn get_or_open_conn(db_path: &str) -> Result<(), String> {
    let mut conns = CONNECTIONS.lock().unwrap();
    if !conns.contains_key(db_path) {
        let conn = Connection::open(db_path).map_err(|e| format!("打开数据库失败: {e}"))?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
            .map_err(|e| format!("PRAGMA 失败: {e}"))?;
        conns.insert(db_path.to_string(), conn);
    }
    Ok(())
}

#[unsafe(no_mangle)]
pub extern "C" fn hap_sqlite_open(db_path: *const c_char) -> *mut c_char {
    let path = read_cstr(db_path);
    match get_or_open_conn(&path) {
        Ok(()) => to_cstr("ok"),
        Err(e) => to_cstr(&format!("error:{e}")),
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn hap_sqlite_execute(db_path: *const c_char, sql: *const c_char, _params: *const c_char) -> *mut c_char {
    let path = read_cstr(db_path);
    let sql = read_cstr(sql);
    if let Err(e) = get_or_open_conn(&path) { return to_cstr(&format!("error:{e}")); }
    let conns = CONNECTIONS.lock().unwrap();
    match conns.get(&path).unwrap().execute_batch(&sql) {
        Ok(()) => to_cstr(r#"{"rowsAffected":0}"#),
        Err(e) => to_cstr(&serde_json::json!({"error": e.to_string()}).to_string()),
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn hap_sqlite_query(db_path: *const c_char, sql: *const c_char, _params: *const c_char) -> *mut c_char {
    let path = read_cstr(db_path);
    let sql = read_cstr(sql);
    if let Err(e) = get_or_open_conn(&path) { return to_cstr(&format!("error:{e}")); }
    let conns = CONNECTIONS.lock().unwrap();
    let conn = conns.get(&path).unwrap();
    let result = match conn.prepare(&sql) {
        Ok(mut stmt) => {
            let cols: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
            let rows: Vec<serde_json::Value> = stmt.query_map([], |row| {
                let mut obj = serde_json::Map::new();
                for (i, col) in cols.iter().enumerate() {
                    let val: rusqlite::Result<String> = row.get(i);
                    obj.insert(col.clone(), serde_json::Value::String(val.unwrap_or_default()));
                }
                Ok(serde_json::Value::Object(obj))
            }).unwrap().flatten().collect();
            serde_json::to_string(&rows).unwrap_or_default()
        }
        Err(e) => serde_json::json!({"error": e.to_string()}).to_string(),
    };
    to_cstr(&result)
}

#[unsafe(no_mangle)]
pub extern "C" fn hap_sqlite_kv_get(db_path: *const c_char, key: *const c_char) -> *mut c_char {
    let path = read_cstr(db_path);
    let key = read_cstr(key);
    if let Err(e) = get_or_open_conn(&path) { return to_cstr(&format!("error:{e}")); }
    let conns = CONNECTIONS.lock().unwrap();
    let conn = conns.get(&path).unwrap();
    let _ = conn.execute_batch("CREATE TABLE IF NOT EXISTS kv(key TEXT PRIMARY KEY, value TEXT)");
    match conn.query_row("SELECT value FROM kv WHERE key=?1", [&key], |r| r.get::<_, String>(0)) {
        Ok(v) => to_cstr(&v),
        Err(_) => to_cstr(""),
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn hap_sqlite_kv_set(db_path: *const c_char, key: *const c_char, value: *const c_char) -> *mut c_char {
    let path = read_cstr(db_path);
    let key = read_cstr(key);
    let value = read_cstr(value);
    if let Err(e) = get_or_open_conn(&path) { return to_cstr(&format!("error:{e}")); }
    let conns = CONNECTIONS.lock().unwrap();
    let conn = conns.get(&path).unwrap();
    let _ = conn.execute_batch("CREATE TABLE IF NOT EXISTS kv(key TEXT PRIMARY KEY, value TEXT)");
    match conn.execute("INSERT OR REPLACE INTO kv(key,value)VALUES(?1,?2)", rusqlite::params![key, value]) {
        Ok(_) => to_cstr("ok"),
        Err(e) => to_cstr(&format!("error:{e}")),
    }
}
