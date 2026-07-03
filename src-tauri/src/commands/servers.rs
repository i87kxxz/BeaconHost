use crate::process;
use crate::state::{
    load_server_config, save_server_config, AppState, ServerConfig, ServerStatus, ServerType,
};
use serde::Serialize;
use serde_json::json;
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Serialize)]
pub struct ServerSummary {
    #[serde(flatten)]
    pub config: ServerConfig,
    pub status: ServerStatus,
    pub online_players: Vec<String>,
    pub dir: String,
}

#[tauri::command]
pub async fn list_servers(app: AppHandle) -> Result<Vec<ServerSummary>, String> {
    let state = app.state::<AppState>();
    let servers_dir = state.servers_dir();
    std::fs::create_dir_all(&servers_dir).map_err(|e| e.to_string())?;
    let inner = state.inner.lock().await;
    let mut out = Vec::new();
    for entry in std::fs::read_dir(&servers_dir).map_err(|e| e.to_string())?.flatten() {
        if !entry.path().is_dir() {
            continue;
        }
        if let Ok(cfg) = load_server_config(&entry.path()) {
            let (status, players) = match inner.running.get(&cfg.id) {
                Some(r) => {
                    let mut p: Vec<String> = r.online_players.iter().cloned().collect();
                    p.sort();
                    (r.status.clone(), p)
                }
                None => (ServerStatus::Stopped, vec![]),
            };
            out.push(ServerSummary {
                dir: entry.path().to_string_lossy().to_string(),
                config: cfg,
                status,
                online_players: players,
            });
        }
    }
    out.sort_by_key(|s| -s.config.created_at);
    Ok(out)
}

#[tauri::command]
pub async fn create_server(
    app: AppHandle,
    name: String,
    server_type: ServerType,
    mc_version: String,
    ram_mb: u64,
    port: u16,
) -> Result<ServerConfig, String> {
    let state = app.state::<AppState>();
    let id = uuid::Uuid::new_v4().to_string();
    let dir = state.server_dir(&id);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let cfg = ServerConfig {
        id: id.clone(),
        name,
        server_type,
        mc_version,
        loader_version: None,
        ram_mb,
        port,
        java_path: None,
        auto_restart: true,
        backup_interval_hours: 0,
        last_backup: None,
        extra_jvm_args: None,
        optimized: false,
        install_state: "installing".into(),
        created_at: chrono::Utc::now().timestamp(),
    };
    save_server_config(&dir, &cfg)?;

    // Kick off installation in background; progress arrives via events.
    let app2 = app.clone();
    let id2 = id.clone();
    tokio::spawn(async move {
        if let Err(e) = crate::commands::downloads::install_server(app2.clone(), id2.clone()).await
        {
            let state = app2.state::<AppState>();
            let dir = state.server_dir(&id2);
            if let Ok(mut cfg) = load_server_config(&dir) {
                cfg.install_state = "broken".into();
                let _ = save_server_config(&dir, &cfg);
            }
            let _ = app2.emit(
                "install-error",
                json!({ "serverId": id2, "error": e }),
            );
        }
    });

    Ok(cfg)
}

#[tauri::command]
pub async fn retry_install(app: AppHandle, id: String) -> Result<(), String> {
    let state = app.state::<AppState>();
    let dir = state.server_dir(&id);
    let mut cfg = load_server_config(&dir)?;
    cfg.install_state = "installing".into();
    save_server_config(&dir, &cfg)?;
    let app2 = app.clone();
    tokio::spawn(async move {
        if let Err(e) = crate::commands::downloads::install_server(app2.clone(), id.clone()).await {
            let state = app2.state::<AppState>();
            let dir = state.server_dir(&id);
            if let Ok(mut cfg) = load_server_config(&dir) {
                cfg.install_state = "broken".into();
                let _ = save_server_config(&dir, &cfg);
            }
            let _ = app2.emit("install-error", json!({ "serverId": id, "error": e }));
        }
    });
    Ok(())
}

#[tauri::command]
pub async fn delete_server(app: AppHandle, id: String) -> Result<(), String> {
    let state = app.state::<AppState>();
    {
        let inner = state.inner.lock().await;
        if let Some(r) = inner.running.get(&id) {
            if r.status == ServerStatus::Running || r.status == ServerStatus::Starting {
                return Err("Stop the server before deleting it".into());
            }
        }
    }
    let dir = state.server_dir(&id);
    if dir.exists() {
        std::fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    let mut inner = state.inner.lock().await;
    inner.running.remove(&id);
    Ok(())
}

#[tauri::command]
pub async fn start_server(app: AppHandle, id: String) -> Result<(), String> {
    process::start_server(app, id).await
}

#[tauri::command]
pub async fn stop_server(app: AppHandle, id: String) -> Result<(), String> {
    process::stop_server(app, id).await
}

#[tauri::command]
pub async fn restart_server(app: AppHandle, id: String) -> Result<(), String> {
    process::stop_server(app.clone(), id.clone()).await?;
    // Wait for it to fully stop (max 60s), then start again.
    let state = app.state::<AppState>();
    for _ in 0..120 {
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        let inner = state.inner.lock().await;
        match inner.running.get(&id) {
            Some(r) if r.status == ServerStatus::Stopped || r.status == ServerStatus::Crashed => {
                break
            }
            None => break,
            _ => {}
        }
    }
    process::start_server(app, id).await
}

#[tauri::command]
pub async fn send_command(app: AppHandle, id: String, command: String) -> Result<(), String> {
    process::send_command(&app, &id, &command).await
}

#[tauri::command]
pub async fn get_logs(state: State<'_, AppState>, id: String) -> Result<Vec<String>, String> {
    let inner = state.inner.lock().await;
    match inner.running.get(&id) {
        Some(r) => {
            let logs = r.logs.lock().await;
            Ok(logs.iter().cloned().collect())
        }
        None => Ok(vec![]),
    }
}

#[tauri::command]
pub async fn update_server_config(
    app: AppHandle,
    id: String,
    name: Option<String>,
    ram_mb: Option<u64>,
    port: Option<u16>,
    auto_restart: Option<bool>,
    backup_interval_hours: Option<u32>,
    extra_jvm_args: Option<String>,
) -> Result<ServerConfig, String> {
    let state = app.state::<AppState>();
    let dir = state.server_dir(&id);
    let mut cfg = load_server_config(&dir)?;
    if let Some(v) = name {
        cfg.name = v;
    }
    if let Some(v) = ram_mb {
        cfg.ram_mb = v;
    }
    if let Some(v) = port {
        cfg.port = v;
        // keep server.properties in sync
        let _ = crate::commands::properties::set_property_internal(
            &dir,
            "server-port",
            &v.to_string(),
        );
    }
    if let Some(v) = auto_restart {
        cfg.auto_restart = v;
    }
    if let Some(v) = backup_interval_hours {
        cfg.backup_interval_hours = v;
    }
    if let Some(v) = extra_jvm_args {
        cfg.extra_jvm_args = if v.trim().is_empty() { None } else { Some(v) };
    }
    save_server_config(&dir, &cfg)?;
    Ok(cfg)
}

#[tauri::command]
pub fn get_system_ram() -> u64 {
    let mut sys = sysinfo::System::new();
    sys.refresh_memory();
    sys.total_memory() / (1024 * 1024)
}
