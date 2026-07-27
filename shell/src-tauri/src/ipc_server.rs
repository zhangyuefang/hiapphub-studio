use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::sync::mpsc;
use serde::{Deserialize, Serialize};

macro_rules! log_ipc {
    ($($arg:tt)*) => {{ let _ = writeln!(std::io::stderr(), $($arg)*); }};
}

#[cfg(unix)]
use std::os::unix::net::{UnixListener, UnixStream};

#[cfg(unix)]
type StreamType = UnixStream;

#[cfg(windows)]
type StreamType = std::net::TcpStream;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct JsonRpcRequest {
    pub jsonrpc: String,
    pub method: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub params: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<serde_json::Value>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct JsonRpcResponse {
    pub jsonrpc: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<JsonRpcError>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<serde_json::Value>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct JsonRpcError {
    pub code: i32,
    pub message: String,
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct ConnectedApp {
    pub app_id: String,
    pub authenticated: bool,
    pub status: String,
}

pub struct IpcServer {
    socket_path: PathBuf,
    tokens: Arc<Mutex<HashMap<String, String>>>,
    connections: Arc<Mutex<HashMap<String, Arc<Mutex<StreamType>>>>>,
    apps: Arc<Mutex<HashMap<String, ConnectedApp>>>,
    open_app_tx: Arc<Mutex<Option<mpsc::Sender<String>>>>,
}

impl IpcServer {
    pub fn new() -> Self {
        #[cfg(unix)]
        let socket_path = std::env::temp_dir().join("hiapphub-shell.sock");
        #[cfg(windows)]
        let socket_path = std::env::temp_dir().join("hiapphub-shell.pipe");

        Self {
            socket_path,
            tokens: Arc::new(Mutex::new(HashMap::new())),
            connections: Arc::new(Mutex::new(HashMap::new())),
            apps: Arc::new(Mutex::new(HashMap::new())),
            open_app_tx: Arc::new(Mutex::new(None)),
        }
    }

    pub fn socket_path(&self) -> &PathBuf {
        &self.socket_path
    }

    pub fn generate_token(&self, app_id: &str) -> String {
        let token = format!("{:x}{:x}", rand_u64(), rand_u64());
        self.tokens.lock().unwrap().insert(token.clone(), app_id.to_string());
        token
    }

    pub fn start(&self) -> Result<(), String> {
        #[cfg(unix)]
        {
            self.start_unix()
        }
        #[cfg(windows)]
        {
            self.start_tcp_fallback()
        }
    }

    #[cfg(unix)]
    fn start_unix(&self) -> Result<(), String> {
        let _ = std::fs::remove_file(&self.socket_path);
        let listener = UnixListener::bind(&self.socket_path)
            .map_err(|e| format!("bind failed: {e}"))?;
        log_ipc!("[ipc-server] listening on {}", self.socket_path.display());

        let tokens = self.tokens.clone();
        let connections = self.connections.clone();
        let apps = self.apps.clone();
        let open_app_tx = self.open_app_tx.clone();

        std::thread::spawn(move || {
            for stream in listener.incoming() {
                match stream {
                    Ok(stream) => {
                        let tokens = tokens.clone();
                        let connections = connections.clone();
                        let apps = apps.clone();
                        let open_app_tx = open_app_tx.clone();
                        std::thread::spawn(move || {
                            handle_connection(stream, tokens, connections, apps, open_app_tx);
                        });
                    }
                    Err(e) => log_ipc!("[ipc-server] accept error: {e}"),
                }
            }
        });

        Ok(())
    }

    #[cfg(windows)]
    fn start_tcp_fallback(&self) -> Result<(), String> {
        let listener = std::net::TcpListener::bind("127.0.0.1:0")
            .map_err(|e| format!("tcp bind failed: {e}"))?;
        let addr = listener.local_addr().map_err(|e| format!("{e}"))?;
        let port_info = format!("{}", addr.port());
        std::fs::write(&self.socket_path, &port_info)
            .map_err(|e| format!("write pipe info: {e}"))?;
        log_ipc!("[ipc-server] listening on tcp 127.0.0.1:{}", addr.port());

        let tokens = self.tokens.clone();
        let connections = self.connections.clone();
        let apps = self.apps.clone();
        let open_app_tx = self.open_app_tx.clone();

        std::thread::spawn(move || {
            for stream in listener.incoming() {
                match stream {
                    Ok(stream) => {
                        let tokens = tokens.clone();
                        let connections = connections.clone();
                        let apps = apps.clone();
                        let open_app_tx = open_app_tx.clone();
                        std::thread::spawn(move || {
                            handle_connection(stream, tokens, connections, apps, open_app_tx);
                        });
                    }
                    Err(e) => log_ipc!("[ipc-server] accept error: {e}"),
                }
            }
        });

        Ok(())
    }

    pub fn send_to_app(&self, app_id: &str, method: &str, params: serde_json::Value) -> Result<(), String> {
        let conns = self.connections.lock().unwrap();
        let stream = conns.get(app_id)
            .ok_or_else(|| format!("app '{app_id}' not connected"))?;

        let notification = JsonRpcRequest {
            jsonrpc: "2.0".into(),
            method: method.into(),
            params: Some(params),
            id: None,
        };

        let mut msg = serde_json::to_string(&notification).unwrap();
        msg.push('\n');

        let mut writer = stream.lock().unwrap();
        writer.write_all(msg.as_bytes())
            .map_err(|e| format!("send failed: {e}"))
    }

    #[allow(dead_code)]
    pub fn terminate_app(&self, app_id: &str) -> Result<(), String> {
        self.send_to_app(app_id, "lifecycle.terminate", serde_json::json!({}))
    }

    pub fn activate_app_window(&self, app_id: &str) -> Result<(), String> {
        self.send_to_app(app_id, "window.activate", serde_json::json!({}))
    }

    #[allow(dead_code)]
    pub fn disable_app_tray(&self, app_id: &str) -> Result<(), String> {
        self.send_to_app(app_id, "tray.disable", serde_json::json!({}))
    }

    #[allow(dead_code)]
    pub fn enable_app_tray(&self, app_id: &str) -> Result<(), String> {
        self.send_to_app(app_id, "tray.enable", serde_json::json!({}))
    }

    #[allow(dead_code)]
    pub fn push_event(&self, app_id: &str, event: &str, payload: serde_json::Value) -> Result<(), String> {
        self.send_to_app(app_id, "event.push", serde_json::json!({
            "event": event,
            "payload": payload,
        }))
    }

    pub fn is_app_running(&self, app_id: &str) -> bool {
        self.connections.lock().unwrap().contains_key(app_id)
    }

    pub fn setup_open_app_channel(&self) -> mpsc::Receiver<String> {
        let (tx, rx) = mpsc::channel();
        *self.open_app_tx.lock().unwrap() = Some(tx);
        rx
    }

    #[allow(dead_code)]
    pub fn list_connected_apps(&self) -> Vec<ConnectedApp> {
        self.apps.lock().unwrap().values().cloned().collect()
    }
}

fn handle_connection(
    stream: StreamType,
    tokens: Arc<Mutex<HashMap<String, String>>>,
    connections: Arc<Mutex<HashMap<String, Arc<Mutex<StreamType>>>>>,
    apps: Arc<Mutex<HashMap<String, ConnectedApp>>>,
    open_app_tx: Arc<Mutex<Option<mpsc::Sender<String>>>>,
) {
    let writer = Arc::new(Mutex::new(
        stream.try_clone().expect("clone stream"),
    ));
    let reader = BufReader::new(stream);
    let mut authenticated_app_id: Option<String> = None;

    for line in reader.lines() {
        let line = match line {
            Ok(l) => l,
            Err(e) => {
                log_ipc!("[ipc-server] read error: {e}");
                break;
            }
        };

        if line.is_empty() { continue; }

        let req: JsonRpcRequest = match serde_json::from_str(&line) {
            Ok(r) => r,
            Err(_) => continue,
        };

        let response = if authenticated_app_id.is_none() && req.method != "auth.verify" {
            JsonRpcResponse {
                jsonrpc: "2.0".into(),
                result: None,
                error: Some(JsonRpcError { code: -32600, message: "not authenticated".into() }),
                id: req.id.clone(),
            }
        } else {
            handle_request(&req, &mut authenticated_app_id, &tokens, &connections, &apps, &writer, &open_app_tx)
        };

        if let Some(ref _id) = req.id {
            let mut msg = serde_json::to_string(&response).unwrap();
            msg.push('\n');
            let _ = writer.lock().unwrap().write_all(msg.as_bytes());
        }
    }

    if let Some(ref app_id) = authenticated_app_id {
        log_ipc!("[ipc-server] app '{app_id}' disconnected");
        connections.lock().unwrap().remove(app_id);
        apps.lock().unwrap().remove(app_id);
    }
}

fn handle_request(
    req: &JsonRpcRequest,
    authenticated_app_id: &mut Option<String>,
    tokens: &Arc<Mutex<HashMap<String, String>>>,
    connections: &Arc<Mutex<HashMap<String, Arc<Mutex<StreamType>>>>>,
    apps: &Arc<Mutex<HashMap<String, ConnectedApp>>>,
    writer: &Arc<Mutex<StreamType>>,
    open_app_tx: &Arc<Mutex<Option<mpsc::Sender<String>>>>,
) -> JsonRpcResponse {
    let params = req.params.as_ref().cloned().unwrap_or(serde_json::Value::Null);

    let result = match req.method.as_str() {
        "auth.verify" => {
            let token = params["token"].as_str().unwrap_or("");
            let token_map = tokens.lock().unwrap();
            if let Some(app_id) = token_map.get(token) {
                let app_id = app_id.clone();
                *authenticated_app_id = Some(app_id.clone());
                connections.lock().unwrap().insert(app_id.clone(), writer.clone());
                apps.lock().unwrap().insert(app_id.clone(), ConnectedApp {
                    app_id: app_id.clone(),
                    authenticated: true,
                    status: "running".into(),
                });
                log_ipc!("[ipc-server] app '{app_id}' authenticated");
                Ok(serde_json::json!({ "authenticated": true, "app_id": app_id }))
            } else {
                Err(JsonRpcError { code: -32001, message: "invalid token".into() })
            }
        }

        "auth.getToken" => {
            Ok(serde_json::json!({
                "token": null,
                "userId": null,
                "note": "auth data managed by Shell"
            }))
        }

        "shell.notify" => {
            let title = params["title"].as_str().unwrap_or("Notification");
            let body = params["body"].as_str().unwrap_or("");
            log_ipc!("[ipc-server] notify from {:?}: {} - {}", authenticated_app_id, title, body);
            Ok(serde_json::json!({ "sent": true }))
        }

        "app.reportStatus" => {
            let status = params["status"].as_str().unwrap_or("unknown");
            if let Some(ref app_id) = authenticated_app_id {
                if let Some(app) = apps.lock().unwrap().get_mut(app_id) {
                    app.status = status.to_string();
                }
            }
            Ok(serde_json::json!({ "acknowledged": true }))
        }

        "app.requestModules" => {
            let modules = params["modules"].as_array();
            let lib_dir = crate::hap_manager::data_dir().join("lib");

            let mut result = serde_json::Map::new();
            if let Some(mods) = modules {
                for m in mods {
                    let name = m.as_str().unwrap_or("");
                    let hal_file = lib_dir.join(format!("hap-mod-{name}.hal"));
                    if hal_file.exists() {
                        result.insert(name.to_string(), serde_json::json!({
                            "available": true,
                            "path": hal_file.to_string_lossy(),
                        }));
                    } else {
                        result.insert(name.to_string(), serde_json::json!({
                            "available": false,
                        }));
                    }
                }
            }
            Ok(serde_json::Value::Object(result))
        }

        "app.openApp" => {
            let target_app = params["appId"].as_str().unwrap_or("");
            let params_json = params["paramsJson"].as_str().unwrap_or("");
            log_ipc!("[ipc-server] app.openApp requested: {target_app} params={params_json}");
            if !target_app.is_empty() {
                if let Some(tx) = open_app_tx.lock().unwrap().as_ref() {
                    let payload = if params_json.is_empty() {
                        target_app.to_string()
                    } else {
                        format!("{}|{}", target_app, params_json)
                    };
                    let _ = tx.send(payload);
                }
            }
            Ok(serde_json::json!({ "queued": true, "appId": target_app }))
        }

        _ => {
            Err(JsonRpcError { code: -32601, message: format!("unknown method: {}", req.method) })
        }
    };

    match result {
        Ok(val) => JsonRpcResponse {
            jsonrpc: "2.0".into(),
            result: Some(val),
            error: None,
            id: req.id.clone(),
        },
        Err(err) => JsonRpcResponse {
            jsonrpc: "2.0".into(),
            result: None,
            error: Some(err),
            id: req.id.clone(),
        },
    }
}

fn rand_u64() -> u64 {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    std::time::SystemTime::now().hash(&mut hasher);
    std::thread::current().id().hash(&mut hasher);
    hasher.finish()
}
