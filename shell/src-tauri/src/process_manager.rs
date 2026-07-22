use std::collections::HashMap;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde_json::Value;

use crate::ipc_server::IpcServer;

const MAX_RESTART_ATTEMPTS: u32 = 3;
const RESTART_WINDOW_SECS: u64 = 60;

#[derive(Debug)]
#[allow(dead_code)]
struct AppProcess {
    app_id: String,
    child: Child,
    hap_path: String,
    window_config_json: String,
    launch_binary: PathBuf,
    restart_count: u32,
    first_start_at: Instant,
    last_start_at: Instant,
    multi_instance: bool,
    instance_index: u32,
}

pub struct ProcessManager {
    processes: Arc<Mutex<HashMap<String, AppProcess>>>,
    host_binary: PathBuf,
    lib_dir: String,
    pid_dir: PathBuf,
}

impl ProcessManager {
    pub fn new() -> Self {
        let data_dir = crate::hap_manager::data_dir();
        let host_binary = Self::find_host_binary();
        let lib_dir = data_dir.join("lib").to_string_lossy().to_string();
        let pid_dir = data_dir.join("run");
        let _ = std::fs::create_dir_all(&pid_dir);

        Self {
            processes: Arc::new(Mutex::new(HashMap::new())),
            host_binary,
            lib_dir,
            pid_dir,
        }
    }

    fn find_host_binary() -> PathBuf {
        if let Ok(exe) = std::env::current_exe() {
            let dir = exe.parent().unwrap_or(std::path::Path::new("."));
            let candidate = dir.join("hiapphub-host");
            if candidate.exists() {
                return candidate;
            }
        }

        let data_dir = crate::hap_manager::data_dir();
        let candidate = data_dir.join("bin").join("hiapphub-host");
        if candidate.exists() {
            return candidate;
        }

        PathBuf::from("hiapphub-host")
    }

    pub fn is_host_available(&self) -> bool {
        self.host_binary.exists()
    }

    fn resolve_localized_name(manifest: &Value) -> String {
        if let Some(obj) = manifest["names"].as_object() {
            if let Some(v) = obj.get("en-US").and_then(|v| v.as_str()) {
                return v.to_string();
            }
        }
        manifest["name"].as_str().unwrap_or("").to_string()
    }

    fn get_named_binary(&self, manifest: &Value, app_id: &str) -> PathBuf {
        #[cfg(target_os = "macos")]
        {
            let display_name = Self::resolve_localized_name(manifest);
            if let Some(path) = self.create_app_bundle(app_id, &display_name) {
                return path;
            }
        }
        let _ = (manifest, app_id);
        self.host_binary.clone()
    }

    #[cfg(target_os = "macos")]
    fn create_app_bundle(&self, app_id: &str, display_name: &str) -> Option<PathBuf> {
        let bundle_dir = self.pid_dir.join(format!("{app_id}.app"));
        let contents = bundle_dir.join("Contents");
        let macos_dir = contents.join("MacOS");
        let _ = std::fs::create_dir_all(&macos_dir);

        let exec_name = app_id;
        let exec_path = macos_dir.join(exec_name);
        let _ = std::fs::remove_file(&exec_path);
        if std::fs::hard_link(&self.host_binary, &exec_path).is_err() {
            if std::fs::copy(&self.host_binary, &exec_path).is_err() {
                return None;
            }
        }

        let safe_id = app_id.replace(' ', "-").to_lowercase();
        let name = if display_name.is_empty() { app_id } else { display_name };
        let plist = format!(
            r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key>
    <string>{name}</string>
    <key>CFBundleDisplayName</key>
    <string>{name}</string>
    <key>CFBundleExecutable</key>
    <string>{exec_name}</string>
    <key>CFBundleIdentifier</key>
    <string>com.hiapphub.app.{safe_id}</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>CFBundleDevelopmentRegion</key>
    <string>en</string>
</dict>
</plist>"#,
        );
        std::fs::write(contents.join("Info.plist"), &plist).ok()?;

        Some(exec_path)
    }

    pub fn launch_app(
        &self,
        app_id: &str,
        hap_path: &str,
        manifest: &Value,
        ipc_server: &IpcServer,
    ) -> Result<(), String> {
        let multi_instance = manifest["multi_instance"].as_bool().unwrap_or(false);

        let process_key = if multi_instance {
            let procs = self.processes.lock().unwrap();
            let mut idx = 1u32;
            loop {
                let key = format!("{app_id}-{idx}");
                if !procs.contains_key(&key) {
                    break key;
                }
                idx += 1;
            }
        } else {
            if ipc_server.is_app_running(app_id) {
                eprintln!("[pm] {app_id} already running, activating window");
                return ipc_server.activate_app_window(app_id);
            }
            app_id.to_string()
        };

        let ipc_id = &process_key;
        let token = ipc_server.generate_token(ipc_id);
        let socket_path = ipc_server.socket_path().to_string_lossy().to_string();

        let window_config_json = Self::build_window_config(manifest);

        let launch_binary = self.get_named_binary(manifest, app_id);

        let mut cmd = Command::new(&launch_binary);
        cmd.arg("--app-id").arg(app_id)
            .arg("--hap-path").arg(hap_path)
            .arg("--ipc-endpoint").arg(&socket_path)
            .arg("--ipc-token").arg(&token)
            .arg("--lib-dir").arg(&self.lib_dir)
            .arg("--window-config").arg(&window_config_json)
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit());

        let child = cmd.spawn().map_err(|e| format!("spawn {app_id} failed: {e}"))?;
        let pid = child.id();
        eprintln!("[pm] launched {app_id} pid={pid} key={process_key}");

        self.write_pid_file(app_id, pid);

        let now = Instant::now();
        let instance_index = if multi_instance {
            process_key.rsplit('-').next().and_then(|s| s.parse().ok()).unwrap_or(1)
        } else {
            0
        };

        self.processes.lock().unwrap().insert(
            process_key,
            AppProcess {
                app_id: app_id.to_string(),
                child,
                hap_path: hap_path.to_string(),
                window_config_json,
                launch_binary,
                restart_count: 0,
                first_start_at: now,
                last_start_at: now,
                multi_instance,
                instance_index,
            },
        );

        Ok(())
    }

    fn build_window_config(manifest: &Value) -> String {
        let win = manifest["windows"]
            .as_array()
            .and_then(|arr| arr.first());

        let mut cfg = serde_json::Map::new();
        if let Some(w) = win {
            for key in &[
                "width", "height", "minWidth", "minHeight", "title",
                "decorations", "resizable", "titleBarStyle", "hiddenTitle",
                "trafficLightPosition",
            ] {
                if let Some(v) = w.get(*key) {
                    cfg.insert(key.to_string(), v.clone());
                }
            }
        }

        if !cfg.contains_key("title") {
            let localized = Self::resolve_localized_name(manifest);
            if !localized.is_empty() {
                cfg.insert("title".into(), Value::String(localized));
            }
        }

        if let Some(icon) = manifest["icon"].as_str() {
            cfg.insert("icon".into(), Value::String(icon.to_string()));
        }

        serde_json::to_string(&Value::Object(cfg)).unwrap_or_else(|_| "{}".into())
    }

    #[allow(dead_code)]
    pub fn terminate_app(&self, app_id: &str, ipc_server: &IpcServer) -> Result<(), String> {
        let _ = ipc_server.terminate_app(app_id);

        let mut procs = self.processes.lock().unwrap();
        if let Some(proc) = procs.get_mut(app_id) {
            let _ = proc.child.kill();
            let _ = proc.child.wait();
            self.remove_pid_file(app_id);
            procs.remove(app_id);
            Ok(())
        } else {
            Err(format!("app '{app_id}' not managed"))
        }
    }

    pub fn check_and_restart(&self, ipc_server: &IpcServer) {
        let keys: Vec<String> = {
            self.processes.lock().unwrap().keys().cloned().collect()
        };

        for key in keys {
            let should_restart = {
                let mut procs = self.processes.lock().unwrap();
                if let Some(proc) = procs.get_mut(&key) {
                    match proc.child.try_wait() {
                        Ok(Some(status)) => {
                            let code = status.code().unwrap_or(-1);
                            eprintln!("[pm] {} exited with code {code}", proc.app_id);
                            self.remove_pid_file(&proc.app_id);

                            if code == 0 {
                                procs.remove(&key);
                                None
                            } else if proc.restart_count < MAX_RESTART_ATTEMPTS {
                                let elapsed = proc.last_start_at.elapsed();
                                if elapsed < Duration::from_secs(RESTART_WINDOW_SECS) {
                                    Some((
                                        proc.app_id.clone(),
                                        proc.hap_path.clone(),
                                        proc.window_config_json.clone(),
                                        proc.launch_binary.clone(),
                                        proc.restart_count + 1,
                                    ))
                                } else {
                                    proc.restart_count = 0;
                                    Some((
                                        proc.app_id.clone(),
                                        proc.hap_path.clone(),
                                        proc.window_config_json.clone(),
                                        proc.launch_binary.clone(),
                                        1,
                                    ))
                                }
                            } else {
                                eprintln!(
                                    "[pm] {} exceeded max restart attempts ({})",
                                    proc.app_id, MAX_RESTART_ATTEMPTS
                                );
                                procs.remove(&key);
                                None
                            }
                        }
                        Ok(None) => None,
                        Err(e) => {
                            eprintln!("[pm] check {} failed: {e}", proc.app_id);
                            None
                        }
                    }
                } else {
                    None
                }
            };

            if let Some((app_id, hap_path, window_config_json, launch_binary, count)) = should_restart {
                eprintln!("[pm] restarting {app_id} (attempt {count}/{MAX_RESTART_ATTEMPTS})");

                let token = ipc_server.generate_token(&key);
                let socket_path = ipc_server.socket_path().to_string_lossy().to_string();

                let mut cmd = Command::new(&launch_binary);
                cmd.arg("--app-id").arg(&app_id)
                    .arg("--hap-path").arg(&hap_path)
                    .arg("--ipc-endpoint").arg(&socket_path)
                    .arg("--ipc-token").arg(&token)
                    .arg("--lib-dir").arg(&self.lib_dir)
                    .arg("--window-config").arg(&window_config_json)
                    .stdout(Stdio::piped())
                    .stderr(Stdio::piped());

                #[cfg(target_os = "macos")]
                {
                    cmd.env("LSUIElement", "1");
                }

                match cmd.spawn() {
                    Ok(child) => {
                        let pid = child.id();
                        eprintln!("[pm] restarted {app_id} pid={pid}");
                        self.write_pid_file(&app_id, pid);

                        let mut procs = self.processes.lock().unwrap();
                        if let Some(proc) = procs.get_mut(&key) {
                            proc.child = child;
                            proc.restart_count = count;
                            proc.last_start_at = Instant::now();
                        } else {
                            procs.insert(
                                key.clone(),
                                AppProcess {
                                    app_id: app_id.clone(),
                                    child,
                                    hap_path,
                                    window_config_json,
                                    launch_binary,
                                    restart_count: count,
                                    first_start_at: Instant::now(),
                                    last_start_at: Instant::now(),
                                    multi_instance: false,
                                    instance_index: 0,
                                },
                            );
                        }
                    }
                    Err(e) => {
                        eprintln!("[pm] restart {app_id} failed: {e}");
                        self.processes.lock().unwrap().remove(&key);
                    }
                }
            }
        }
    }

    pub fn start_monitor(self: &Arc<Self>, ipc_server: Arc<IpcServer>) {
        let pm = self.clone();
        std::thread::spawn(move || {
            loop {
                std::thread::sleep(Duration::from_secs(5));
                pm.check_and_restart(&ipc_server);
            }
        });
    }

    fn write_pid_file(&self, app_id: &str, pid: u32) {
        let path = self.pid_dir.join(format!("{app_id}.pid"));
        let _ = std::fs::write(&path, pid.to_string());
    }

    fn remove_pid_file(&self, app_id: &str) {
        let path = self.pid_dir.join(format!("{app_id}.pid"));
        let _ = std::fs::remove_file(&path);
    }

    pub fn recover_from_pid_files(&self) -> Vec<(String, u32)> {
        let mut recovered = Vec::new();
        let entries = match std::fs::read_dir(&self.pid_dir) {
            Ok(e) => e,
            Err(_) => return recovered,
        };

        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("pid") {
                continue;
            }
            let app_id = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_string();
            if app_id.is_empty() {
                continue;
            }

            if let Ok(content) = std::fs::read_to_string(&path) {
                if let Ok(pid) = content.trim().parse::<u32>() {
                    if is_process_alive(pid) {
                        eprintln!("[pm] found alive process {app_id} pid={pid}");
                        recovered.push((app_id, pid));
                    } else {
                        eprintln!("[pm] stale pid file {app_id} pid={pid}, removing");
                        let _ = std::fs::remove_file(&path);
                    }
                }
            }
        }

        recovered
    }

    #[allow(dead_code)]
    pub fn is_app_managed(&self, app_id: &str) -> bool {
        self.processes.lock().unwrap().contains_key(app_id)
    }

    #[allow(dead_code)]
    pub fn list_managed_apps(&self) -> Vec<String> {
        self.processes.lock().unwrap().keys().cloned().collect()
    }

    #[allow(dead_code)]
    pub fn cleanup_all(&self) {
        let mut procs = self.processes.lock().unwrap();
        for (key, proc) in procs.iter_mut() {
            eprintln!("[pm] killing {key}");
            let _ = proc.child.kill();
            let _ = proc.child.wait();
            self.remove_pid_file(&proc.app_id);
        }
        procs.clear();
    }
}

fn is_process_alive(pid: u32) -> bool {
    #[cfg(unix)]
    {
        let output = std::process::Command::new("kill")
            .arg("-0")
            .arg(pid.to_string())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
        output.map(|s| s.success()).unwrap_or(false)
    }
    #[cfg(windows)]
    {
        let output = std::process::Command::new("tasklist")
            .args(["/FI", &format!("PID eq {pid}"), "/NH"])
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .output();
        match output {
            Ok(o) => String::from_utf8_lossy(&o.stdout).contains(&pid.to_string()),
            Err(_) => false,
        }
    }
}
