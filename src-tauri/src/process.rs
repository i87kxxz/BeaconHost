use crate::state::{
    load_server_config, AppState, RunningServer, ServerStatus, ServerType, LOG_BUFFER_LINES,
};
use serde_json::json;
use std::collections::VecDeque;
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::sync::{mpsc, Mutex};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

fn emit_log(app: &AppHandle, id: &str, line: &str) {
    let _ = app.emit(&format!("server-log-{id}"), line.to_string());
}

fn emit_status(app: &AppHandle, id: &str, status: &ServerStatus) {
    let _ = app.emit(
        "server-status",
        json!({ "id": id, "status": status }),
    );
}

fn emit_players(app: &AppHandle, id: &str, players: &std::collections::HashSet<String>) {
    let mut list: Vec<&String> = players.iter().collect();
    list.sort();
    let _ = app.emit("server-players", json!({ "id": id, "players": list }));
}

/// Build the launch command (program + args) for a server dir.
pub fn build_launch(
    server_dir: &std::path::Path,
    java: &str,
    ram_mb: u64,
    extra: Option<&str>,
    server_type: &ServerType,
    optimized: bool,
) -> Result<(String, Vec<String>), String> {
    // Aikar's flags require Xms == Xmx (with AlwaysPreTouch the heap is committed upfront).
    let xms = if optimized { ram_mb } else { ram_mb.min(1024) };
    let mut args: Vec<String> = vec![
        format!("-Xms{}M", xms),
        format!("-Xmx{}M", ram_mb),
    ];
    if let Some(e) = extra {
        for tok in e.split_whitespace() {
            args.push(tok.to_string());
        }
    }

    // Modern Forge/NeoForge installs create libraries/.../unix_args.txt & win_args.txt
    if server_type.is_modded() {
        if let Some(args_file) = find_args_file(server_dir) {
            args.push(format!("@{}", args_file));
            if !server_type.is_proxy() {
                args.push("nogui".into());
            }
            return Ok((java.to_string(), args));
        }
    }

    // Find launch jar
    let jar = find_launch_jar(server_dir, server_type)
        .ok_or("no server jar found - installation may be incomplete")?;
    args.push("-jar".into());
    args.push(jar);
    if !server_type.is_proxy() {
        args.push("nogui".into());
    }
    Ok((java.to_string(), args))
}

fn find_args_file(server_dir: &std::path::Path) -> Option<String> {
    let name = if cfg!(windows) {
        "win_args.txt"
    } else {
        "unix_args.txt"
    };
    let libs = server_dir.join("libraries");
    if !libs.exists() {
        return None;
    }
    for entry in walkdir::WalkDir::new(&libs)
        .max_depth(6)
        .into_iter()
        .flatten()
    {
        if entry.file_name() == name {
            let rel = entry
                .path()
                .strip_prefix(server_dir)
                .ok()?
                .to_string_lossy()
                .replace('\\', "/");
            return Some(rel);
        }
    }
    None
}

pub fn find_launch_jar(server_dir: &std::path::Path, server_type: &ServerType) -> Option<String> {
    let candidates = [
        "server.jar",
        "quilt-server-launch.jar",
        "fabric-server-launch.jar",
    ];
    for c in candidates {
        if server_dir.join(c).exists() {
            return Some(c.to_string());
        }
    }
    // spigot-<ver>.jar / forge-*.jar / any jar that is not an installer
    let mut fallback: Option<String> = None;
    if let Ok(read) = std::fs::read_dir(server_dir) {
        for entry in read.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.ends_with(".jar")
                && !name.contains("installer")
                && !name.contains("BuildTools")
            {
                if name.starts_with("spigot-") || name.starts_with("forge-") {
                    return Some(name);
                }
                fallback.get_or_insert(name);
            }
        }
    }
    let _ = server_type;
    fallback
}

/// Start a server process, wiring log streaming and crash-restart.
/// Returns a boxed future because the auto-restart path is recursive.
pub fn start_server(
    app: AppHandle,
    id: String,
) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<(), String>> + Send>> {
    Box::pin(start_server_inner(app, id))
}

async fn start_server_inner(app: AppHandle, id: String) -> Result<(), String> {
    let state = app.state::<AppState>();
    let server_dir = state.server_dir(&id);
    let cfg = load_server_config(&server_dir)?;

    {
        let inner = state.inner.lock().await;
        if let Some(r) = inner.running.get(&id) {
            if r.status == ServerStatus::Running || r.status == ServerStatus::Starting {
                return Err("Server is already running".into());
            }
        }
    }

    let java = match &cfg.java_path {
        Some(p) if !p.is_empty() => p.clone(),
        _ => crate::commands::java::ensure_java(&app, &cfg.mc_version, &cfg.server_type).await?,
    };

    // Accept EULA automatically (not needed for velocity)
    if !cfg.server_type.is_proxy() {
        let _ = std::fs::write(server_dir.join("eula.txt"), "eula=true\n");
    }

    let (program, args) = build_launch(
        &server_dir,
        &java,
        cfg.ram_mb,
        cfg.extra_jvm_args.as_deref(),
        &cfg.server_type,
        cfg.optimized,
    )?;

    let mut cmd = Command::new(&program);
    cmd.args(&args)
        .current_dir(&server_dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

    let mut child = cmd.spawn().map_err(|e| format!("spawn java: {e}"))?;
    let pid = child.id();

    let stdin = child.stdin.take().ok_or("no stdin")?;
    let stdout = child.stdout.take().ok_or("no stdout")?;
    let stderr = child.stderr.take().ok_or("no stderr")?;

    let (tx, mut rx) = mpsc::unbounded_channel::<String>();
    let logs = Arc::new(Mutex::new(VecDeque::with_capacity(LOG_BUFFER_LINES)));
    let stop_requested = Arc::new(AtomicBool::new(false));
    let java_launch_failure = Arc::new(AtomicBool::new(false));

    {
        let mut inner = state.inner.lock().await;
        inner.running.insert(
            id.clone(),
            RunningServer {
                stdin_tx: tx,
                status: ServerStatus::Starting,
                logs: logs.clone(),
                online_players: Default::default(),
                stop_requested: stop_requested.clone(),
                pid,
            },
        );
    }
    emit_status(&app, &id, &ServerStatus::Starting);

    // stdin writer task
    let mut stdin_writer = stdin;
    tokio::spawn(async move {
        while let Some(line) = rx.recv().await {
            let _ = stdin_writer.write_all(line.as_bytes()).await;
            let _ = stdin_writer.write_all(b"\n").await;
            let _ = stdin_writer.flush().await;
        }
    });

    // stdout reader
    let app_out = app.clone();
    let id_out = id.clone();
    let logs_out = logs.clone();
    let java_launch_failure_out = java_launch_failure.clone();
    tokio::spawn(async move {
        let mut lines = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            handle_line(
                &app_out,
                &id_out,
                &line,
                &logs_out,
                &java_launch_failure_out,
            )
            .await;
        }
    });

    // stderr reader
    let app_err = app.clone();
    let id_err = id.clone();
    let logs_err = logs.clone();
    let java_launch_failure_err = java_launch_failure.clone();
    tokio::spawn(async move {
        let mut lines = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            handle_line(
                &app_err,
                &id_err,
                &line,
                &logs_err,
                &java_launch_failure_err,
            )
            .await;
        }
    });

    // waiter: crash detection + auto-restart
    let app_wait = app.clone();
    let id_wait = id.clone();
    let auto_restart = cfg.auto_restart;
    tokio::spawn(async move {
        let exit = child.wait().await;
        let state = app_wait.state::<AppState>();
        let was_stop_requested = stop_requested.load(Ordering::SeqCst);
        let blocked_by_java = java_launch_failure.load(Ordering::SeqCst);
        let crashed = match &exit {
            Ok(status) => !status.success() && !was_stop_requested,
            Err(_) => true,
        };
        {
            let mut inner = state.inner.lock().await;
            if let Some(r) = inner.running.get_mut(&id_wait) {
                r.status = if crashed {
                    ServerStatus::Crashed
                } else {
                    ServerStatus::Stopped
                };
                r.online_players.clear();
            }
        }
        let status = if crashed {
            ServerStatus::Crashed
        } else {
            ServerStatus::Stopped
        };
        emit_status(&app_wait, &id_wait, &status);
        emit_log(
            &app_wait,
            &id_wait,
            &format!("[Minc] Server process exited ({:?})", exit.map(|s| s.code())),
        );
        if crashed && auto_restart && blocked_by_java {
            emit_log(
                &app_wait,
                &id_wait,
                "[Minc] Auto-restart disabled: server requires a newer Java runtime.",
            );
        } else if crashed && auto_restart {
            emit_log(&app_wait, &id_wait, "[Minc] Crash detected - restarting in 5s...");
            tokio::time::sleep(std::time::Duration::from_secs(5)).await;
            let app2 = app_wait.clone();
            let id2 = id_wait.clone();
            if let Err(e) = start_server(app2.clone(), id2.clone()).await {
                emit_log(&app2, &id2, &format!("[Minc] Auto-restart failed: {e}"));
            }
        }
    });

    Ok(())
}

async fn handle_line(
    app: &AppHandle,
    id: &str,
    line: &str,
    logs: &Arc<Mutex<VecDeque<String>>>,
    java_launch_failure: &Arc<AtomicBool>,
) {
    {
        let mut buf = logs.lock().await;
        if buf.len() >= LOG_BUFFER_LINES {
            buf.pop_front();
        }
        buf.push_back(line.to_string());
    }
    emit_log(app, id, line);

    if is_java_version_launch_failure(line) {
        java_launch_failure.store(true, Ordering::SeqCst);
    }

    let state = app.state::<AppState>();

    // Detect "Done (x.xxxs)!" -> running
    if line.contains("Done (") || line.contains("Listening on ") {
        let mut inner = state.inner.lock().await;
        if let Some(r) = inner.running.get_mut(id) {
            if r.status == ServerStatus::Starting {
                r.status = ServerStatus::Running;
                emit_status(app, id, &ServerStatus::Running);
            }
        }
    }

    // Player join/leave tracking
    if let Some(name) = parse_join(line) {
        let mut inner = state.inner.lock().await;
        if let Some(r) = inner.running.get_mut(id) {
            r.online_players.insert(name);
            emit_players(app, id, &r.online_players);
        }
    } else if let Some(name) = parse_leave(line) {
        let mut inner = state.inner.lock().await;
        if let Some(r) = inner.running.get_mut(id) {
            r.online_players.remove(&name);
            emit_players(app, id, &r.online_players);
        }
    }

    // Chunky pregeneration progress
    if let Some(progress) = parse_chunky(id, line) {
        let _ = app.emit("pregen-progress", progress);
    }
}

/// Parse Chunky log lines into a pregen-progress event payload.
/// Running lines look like:
/// "[Chunky] Task running for world. Processed: 125 chunks (0.03%), ETA: 0:34:28, Rate: 190.0 cps, Current: 13, 6"
fn parse_chunky(id: &str, line: &str) -> Option<serde_json::Value> {
    let idx = line.find("[Chunky] Task ")?;
    let rest = &line[idx + "[Chunky] Task ".len()..];

    let mut started = false;
    let (state, rest) = if let Some(r) = rest.strip_prefix("running for ") {
        ("running", r)
    } else if let Some(r) = rest.strip_prefix("finished for ") {
        ("done", r)
    } else if let Some(r) = rest.strip_prefix("stopped for ") {
        ("paused", r)
    } else if let Some(r) = rest.strip_prefix("started for ") {
        started = true;
        ("running", r)
    } else if let Some(r) = rest.strip_prefix("cancelled for ") {
        ("cancelled", r)
    } else if let Some(r) = rest.strip_prefix("canceled for ") {
        ("cancelled", r)
    } else {
        return None;
    };

    let world = rest.split('.').next().unwrap_or("").trim().to_string();

    fn grab<'a>(s: &'a str, key: &str, stops: &[char]) -> Option<&'a str> {
        let i = s.find(key)? + key.len();
        let tail = &s[i..];
        let end = tail
            .find(|c: char| stops.contains(&c))
            .unwrap_or(tail.len());
        Some(tail[..end].trim())
    }

    let chunks = grab(rest, "Processed: ", &[' '])
        .and_then(|v| v.parse::<u64>().ok());
    let pct = grab(rest, "(", &['%'])
        .and_then(|v| v.parse::<f64>().ok())
        .or(match state {
            "done" => Some(100.0),
            _ if started => Some(0.0),
            _ => None,
        });
    let eta = grab(rest, "ETA: ", &[',']).map(String::from);
    let rate = grab(rest, "Rate: ", &[' '])
        .and_then(|v| v.parse::<f64>().ok());

    Some(serde_json::json!({
        "serverId": id,
        "state": state,
        "world": world,
        "chunks": chunks,
        "pct": pct,
        "eta": eta,
        "rate": rate,
    }))
}

fn is_java_version_launch_failure(line: &str) -> bool {
    line.contains("requires running the server with Java")
        || line.contains("UnsupportedClassVersionError")
        || line.contains("has been compiled by a more recent version of the Java Runtime")
}

fn parse_join(line: &str) -> Option<String> {
    // "[12:00:00 INFO]: Steve joined the game"
    let idx = line.find(" joined the game")?;
    let before = &line[..idx];
    let name = before.rsplit(|c: char| c == ' ' || c == ']').next()?;
    if name.is_empty() {
        return None;
    }
    Some(name.to_string())
}

fn parse_leave(line: &str) -> Option<String> {
    let idx = line.find(" left the game")?;
    let before = &line[..idx];
    let name = before.rsplit(|c: char| c == ' ' || c == ']').next()?;
    if name.is_empty() {
        return None;
    }
    Some(name.to_string())
}

/// Send a raw command to the server console.
pub async fn send_command(app: &AppHandle, id: &str, command: &str) -> Result<(), String> {
    let state = app.state::<AppState>();
    let inner = state.inner.lock().await;
    let r = inner.running.get(id).ok_or("Server is not running")?;
    if r.status != ServerStatus::Running && r.status != ServerStatus::Starting {
        return Err("Server is not running".into());
    }
    r.stdin_tx
        .send(command.to_string())
        .map_err(|_| "failed to write to server stdin".to_string())
}

/// Graceful stop; force-kill after timeout.
pub async fn stop_server(app: AppHandle, id: String) -> Result<(), String> {
    let state = app.state::<AppState>();
    let pid;
    {
        let mut inner = state.inner.lock().await;
        let r = inner.running.get_mut(&id).ok_or("Server is not running")?;
        if r.status == ServerStatus::Stopped || r.status == ServerStatus::Crashed {
            return Err("Server is not running".into());
        }
        r.stop_requested.store(true, Ordering::SeqCst);
        r.status = ServerStatus::Stopping;
        pid = r.pid;
        let cfg = load_server_config(&state.server_dir(&id))?;
        let stop_cmd = if cfg.server_type.is_proxy() { "shutdown" } else { "stop" };
        let _ = r.stdin_tx.send(stop_cmd.to_string());
    }
    emit_status(&app, &id, &ServerStatus::Stopping);

    // Force kill after 30s if still alive
    let app2 = app.clone();
    tokio::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_secs(30)).await;
        let state = app2.state::<AppState>();
        let inner = state.inner.lock().await;
        if let Some(r) = inner.running.get(&id) {
            if r.status == ServerStatus::Stopping {
                if let Some(pid) = pid {
                    kill_pid(pid);
                }
            }
        }
    });
    Ok(())
}

fn kill_pid(pid: u32) {
    #[cfg(windows)]
    {
        let _ = std::process::Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .creation_flags(0x08000000)
            .output();
    }
    #[cfg(not(windows))]
    {
        let _ = std::process::Command::new("kill")
            .args(["-9", &pid.to_string()])
            .output();
    }
}
