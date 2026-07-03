use crate::providers::{self, USER_AGENT};
use crate::state::{AppState, ServerType};
use futures_util::StreamExt;
use serde_json::json;
use sha2::{Digest, Sha256};
use std::path::Path;
use tauri::{AppHandle, Emitter, Manager};

fn emit_progress(app: &AppHandle, server_id: &str, stage: &str, pct: f64, detail: &str) {
    let _ = app.emit(
        "install-progress",
        json!({ "serverId": server_id, "stage": stage, "pct": pct, "detail": detail }),
    );
}

#[tauri::command]
pub async fn list_mc_versions(server_type: ServerType) -> Result<Vec<String>, String> {
    providers::list_versions(&server_type).await
}

/// Download a file with progress + optional sha256 verification.
pub async fn download_file(
    app: &AppHandle,
    server_id: &str,
    url: &str,
    dest: &Path,
    sha256: Option<&str>,
    stage: &str,
    detail: &str,
) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("download {url}: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("download {url}: HTTP {}", resp.status()));
    }
    let total = resp.content_length().unwrap_or(0);
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let mut file = std::fs::File::create(dest).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    let mut stream = resp.bytes_stream();
    let mut downloaded: u64 = 0;
    use std::io::Write;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        hasher.update(&chunk);
        downloaded += chunk.len() as u64;
        if total > 0 {
            emit_progress(
                app,
                server_id,
                stage,
                (downloaded as f64 / total as f64) * 100.0,
                detail,
            );
        }
    }
    drop(file);
    if let Some(expected) = sha256 {
        let actual = format!("{:x}", hasher.finalize());
        if !actual.eq_ignore_ascii_case(expected) {
            let _ = std::fs::remove_file(dest);
            return Err(format!("SHA-256 mismatch for {url}"));
        }
    }
    Ok(())
}

/// Run an installer jar (Forge/NeoForge/Quilt/BuildTools) inside the server dir, streaming output.
async fn run_installer(
    app: &AppHandle,
    server_id: &str,
    java: &str,
    server_dir: &Path,
    jar: &str,
    args: &[String],
) -> Result<(), String> {
    use tokio::io::{AsyncBufReadExt, BufReader};
    let mut cmd = tokio::process::Command::new(java);
    cmd.arg("-jar")
        .arg(jar)
        .args(args)
        .current_dir(server_dir)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    #[cfg(windows)]
    cmd.creation_flags(0x08000000);
    let mut child = cmd.spawn().map_err(|e| format!("run installer: {e}"))?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let app1 = app.clone();
    let sid1 = server_id.to_string();
    if let Some(out) = stdout {
        tokio::spawn(async move {
            let mut lines = BufReader::new(out).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                emit_progress(&app1, &sid1, "install", -1.0, &line);
            }
        });
    }
    let app2 = app.clone();
    let sid2 = server_id.to_string();
    if let Some(err) = stderr {
        tokio::spawn(async move {
            let mut lines = BufReader::new(err).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                emit_progress(&app2, &sid2, "install", -1.0, &line);
            }
        });
    }

    let status = child.wait().await.map_err(|e| e.to_string())?;
    if !status.success() {
        return Err(format!("installer exited with {:?}", status.code()));
    }
    Ok(())
}

/// Full install pipeline for a server: ensure java, download jar/installer, run installer if needed.
pub async fn install_server(app: AppHandle, server_id: String) -> Result<(), String> {
    let state = app.state::<AppState>();
    let server_dir = state.server_dir(&server_id);
    let mut cfg = crate::state::load_server_config(&server_dir)?;

    emit_progress(&app, &server_id, "java", 0.0, "Preparing Java");
    let java =
        crate::commands::java::ensure_java(&app, &cfg.mc_version, &cfg.server_type).await?;

    emit_progress(&app, &server_id, "download", 0.0, "Resolving download");
    let resolved = providers::resolve_download(&cfg.server_type, &cfg.mc_version).await?;

    let dest = server_dir.join(&resolved.file_name);
    download_file(
        &app,
        &server_id,
        &resolved.url,
        &dest,
        resolved.sha256.as_deref(),
        "download",
        &format!("Downloading {}", resolved.file_name),
    )
    .await?;

    if resolved.is_installer {
        emit_progress(
            &app,
            &server_id,
            "install",
            -1.0,
            "Running installer (this can take a while)",
        );
        run_installer(
            &app,
            &server_id,
            &java,
            &server_dir,
            &resolved.file_name,
            &resolved.installer_args,
        )
        .await?;
        let _ = std::fs::remove_file(&dest);
        // Forge/NeoForge installers leave a log file
        let _ = std::fs::remove_file(server_dir.join("installer.jar.log"));
    }

    // Write initial server.properties with configured port
    if !cfg.server_type.is_proxy() {
        let props_path = server_dir.join("server.properties");
        if !props_path.exists() {
            let content = format!(
                "server-port={}\nmotd={}\nmax-players=20\nonline-mode=true\n",
                cfg.port, cfg.name
            );
            let _ = std::fs::write(&props_path, content);
        }
        let _ = std::fs::write(server_dir.join("eula.txt"), "eula=true\n");
    }

    cfg.install_state = "ready".into();
    crate::state::save_server_config(&server_dir, &cfg)?;
    emit_progress(&app, &server_id, "done", 100.0, "Server ready");
    let _ = app.emit("install-done", json!({ "serverId": server_id }));
    Ok(())
}
