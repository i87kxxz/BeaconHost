use crate::state::{load_server_config, save_server_config, AppState};
use serde::Serialize;
use serde_json::json;
use std::io::{Read, Write};
use std::path::Path;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Serialize)]
pub struct BackupInfo {
    pub file_name: String,
    pub size: u64,
    pub created: i64,
}

fn backups_dir(server_dir: &Path) -> std::path::PathBuf {
    server_dir.join("backups")
}

#[tauri::command]
pub async fn list_backups(app: AppHandle, id: String) -> Result<Vec<BackupInfo>, String> {
    let state = app.state::<AppState>();
    let dir = backups_dir(&state.server_dir(&id));
    let mut out = Vec::new();
    if dir.exists() {
        for entry in std::fs::read_dir(&dir).map_err(|e| e.to_string())?.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.ends_with(".zip") {
                let meta = entry.metadata().map_err(|e| e.to_string())?;
                out.push(BackupInfo {
                    file_name: name,
                    size: meta.len(),
                    created: meta
                        .modified()
                        .ok()
                        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                        .map(|d| d.as_secs() as i64)
                        .unwrap_or(0),
                });
            }
        }
    }
    out.sort_by_key(|b| -b.created);
    Ok(out)
}

/// Zip all world folders (and configs) of a server into backups/.
#[tauri::command]
pub async fn create_backup(app: AppHandle, id: String) -> Result<String, String> {
    let state = app.state::<AppState>();
    let server_dir = state.server_dir(&id);

    // Flush world to disk if running
    {
        let inner = state.inner.lock().await;
        if let Some(r) = inner.running.get(&id) {
            if r.status == crate::state::ServerStatus::Running {
                let _ = r.stdin_tx.send("save-all flush".to_string());
            }
        }
    }
    tokio::time::sleep(std::time::Duration::from_secs(2)).await;

    let stamp = chrono::Local::now().format("%Y-%m-%d_%H-%M-%S");
    let file_name = format!("backup_{stamp}.zip");
    let out_dir = backups_dir(&server_dir);
    std::fs::create_dir_all(&out_dir).map_err(|e| e.to_string())?;
    let out_path = out_dir.join(&file_name);

    let server_dir2 = server_dir.clone();
    let out_path2 = out_path.clone();
    tokio::task::spawn_blocking(move || -> Result<(), String> {
        let file = std::fs::File::create(&out_path2).map_err(|e| e.to_string())?;
        let mut zip = zip::ZipWriter::new(file);
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);

        // Include world folders + key config files
        let mut targets: Vec<std::path::PathBuf> = Vec::new();
        for entry in std::fs::read_dir(&server_dir2).map_err(|e| e.to_string())?.flatten() {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            if path.is_dir() && path.join("level.dat").exists() {
                targets.push(path);
            } else if matches!(
                name.as_str(),
                "server.properties" | "whitelist.json" | "ops.json" | "banned-players.json" | "minc.json"
            ) {
                targets.push(path);
            }
        }

        let mut buf = Vec::new();
        for target in targets {
            if target.is_file() {
                let rel = target
                    .strip_prefix(&server_dir2)
                    .map_err(|e| e.to_string())?
                    .to_string_lossy()
                    .replace('\\', "/");
                zip.start_file(rel, options).map_err(|e| e.to_string())?;
                let mut f = std::fs::File::open(&target).map_err(|e| e.to_string())?;
                buf.clear();
                f.read_to_end(&mut buf).map_err(|e| e.to_string())?;
                zip.write_all(&buf).map_err(|e| e.to_string())?;
            } else {
                for entry in walkdir::WalkDir::new(&target).into_iter().flatten() {
                    if !entry.path().is_file() {
                        continue;
                    }
                    // Skip session lock (held open by a running server)
                    if entry.file_name() == "session.lock" {
                        continue;
                    }
                    let rel = entry
                        .path()
                        .strip_prefix(&server_dir2)
                        .map_err(|e| e.to_string())?
                        .to_string_lossy()
                        .replace('\\', "/");
                    zip.start_file(rel, options).map_err(|e| e.to_string())?;
                    let Ok(mut f) = std::fs::File::open(entry.path()) else {
                        continue;
                    };
                    buf.clear();
                    if f.read_to_end(&mut buf).is_ok() {
                        zip.write_all(&buf).map_err(|e| e.to_string())?;
                    }
                }
            }
        }
        zip.finish().map_err(|e| e.to_string())?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())??;

    // Record last backup time
    if let Ok(mut cfg) = load_server_config(&server_dir) {
        cfg.last_backup = Some(chrono::Utc::now().timestamp());
        let _ = save_server_config(&server_dir, &cfg);
    }

    let _ = app.emit("backup-done", json!({ "serverId": id, "file": file_name }));
    Ok(file_name)
}

#[tauri::command]
pub async fn delete_backup(app: AppHandle, id: String, file_name: String) -> Result<(), String> {
    if file_name.contains('/') || file_name.contains('\\') || !file_name.ends_with(".zip") {
        return Err("invalid backup file".into());
    }
    let state = app.state::<AppState>();
    let path = backups_dir(&state.server_dir(&id)).join(&file_name);
    std::fs::remove_file(&path).map_err(|e| e.to_string())
}

/// Background scheduler: every 10 minutes check servers with backup_interval_hours > 0.
/// Must use Tauri's async runtime: `setup` runs outside any tokio runtime context,
/// so a bare `tokio::spawn` here panics and kills the app on startup.
pub fn spawn_backup_scheduler(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(600)).await;
            let state = app.state::<AppState>();
            let servers_dir = state.servers_dir();
            let Ok(entries) = std::fs::read_dir(&servers_dir) else {
                continue;
            };
            let now = chrono::Utc::now().timestamp();
            for entry in entries.flatten() {
                let Ok(cfg) = load_server_config(&entry.path()) else {
                    continue;
                };
                if cfg.backup_interval_hours == 0 {
                    continue;
                }
                let due = match cfg.last_backup {
                    Some(t) => now - t >= (cfg.backup_interval_hours as i64) * 3600,
                    None => true,
                };
                if due {
                    let _ = create_backup(app.clone(), cfg.id.clone()).await;
                }
            }
        }
    });
}
