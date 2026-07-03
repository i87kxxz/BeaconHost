use crate::providers::{self, USER_AGENT};
use crate::state::{AppState, ServerType};
use futures_util::StreamExt;
use serde_json::json;
use tauri::{AppHandle, Emitter, Manager};

fn os_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "mac"
    } else {
        "linux"
    }
}

fn arch_name() -> &'static str {
    if cfg!(target_arch = "aarch64") {
        "aarch64"
    } else {
        "x64"
    }
}

fn java_bin(dir: &std::path::Path) -> std::path::PathBuf {
    if cfg!(target_os = "macos") {
        dir.join("Contents/Home/bin/java")
    } else if cfg!(windows) {
        dir.join("bin/java.exe")
    } else {
        dir.join("bin/java")
    }
}

/// Locate the extracted JRE home inside app_data/java/<major>/
fn find_installed(java_root: &std::path::Path, major: u32) -> Option<String> {
    let dir = java_root.join(major.to_string());
    if !dir.exists() {
        return None;
    }
    // The archive extracts to a single folder like jdk-21.0.5+11-jre
    for entry in std::fs::read_dir(&dir).ok()?.flatten() {
        if entry.path().is_dir() {
            let bin = java_bin(&entry.path());
            if bin.exists() {
                return Some(bin.to_string_lossy().to_string());
            }
        }
    }
    None
}

fn emit_progress(app: &AppHandle, stage: &str, pct: f64, detail: &str) {
    let _ = app.emit(
        "install-progress",
        json!({ "stage": stage, "pct": pct, "detail": detail }),
    );
}

async fn fetch_adoptium_binary(
    client: &reqwest::Client,
    major: u32,
    image_type: &str,
) -> Result<reqwest::Response, String> {
    let url = format!(
        "https://api.adoptium.net/v3/binary/latest/{major}/ga/{}/{}/{image_type}/hotspot/normal/eclipse",
        os_name(),
        arch_name()
    );
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("java download: {e}"))?;
    if resp.status().is_success() {
        Ok(resp)
    } else {
        Err(format!(
            "java {image_type} download failed: HTTP {}",
            resp.status()
        ))
    }
}

/// Ensure a suitable Java exists for the given MC version; download Temurin if needed.
/// Returns absolute path to the java binary.
pub async fn ensure_java(
    app: &AppHandle,
    mc_version: &str,
    server_type: &ServerType,
) -> Result<String, String> {
    let major = providers::java_major_for_mc(mc_version, server_type);
    let state = app.state::<AppState>();
    let java_root = state.java_dir();
    std::fs::create_dir_all(&java_root).map_err(|e| e.to_string())?;

    if let Some(path) = find_installed(&java_root, major) {
        return Ok(path);
    }

    emit_progress(app, "java", 0.0, &format!("Downloading Java {major}"));

    let client = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .build()
        .map_err(|e| e.to_string())?;
    let resp = match fetch_adoptium_binary(&client, major, "jre").await {
        Ok(resp) => resp,
        Err(jre_err) => {
            emit_progress(
                app,
                "java",
                0.0,
                &format!("Java {major} JRE unavailable; downloading JDK"),
            );
            fetch_adoptium_binary(&client, major, "jdk")
                .await
                .map_err(|jdk_err| format!("{jre_err}; {jdk_err}"))?
        }
    };
    let total = resp.content_length().unwrap_or(0);
    let is_zip = cfg!(target_os = "windows");
    let archive_name = if is_zip { "java.zip" } else { "java.tar.gz" };
    let target_dir = java_root.join(major.to_string());
    std::fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;
    let archive_path = java_root.join(archive_name);

    let mut file = std::fs::File::create(&archive_path).map_err(|e| e.to_string())?;
    let mut stream = resp.bytes_stream();
    let mut downloaded: u64 = 0;
    use std::io::Write;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        downloaded += chunk.len() as u64;
        if total > 0 {
            emit_progress(
                app,
                "java",
                (downloaded as f64 / total as f64) * 80.0,
                &format!("Downloading Java {major}"),
            );
        }
    }
    drop(file);

    emit_progress(app, "java", 85.0, "Extracting Java");
    let extract_dir = target_dir.clone();
    let archive = archive_path.clone();
    tokio::task::spawn_blocking(move || -> Result<(), String> {
        if is_zip {
            let f = std::fs::File::open(&archive).map_err(|e| e.to_string())?;
            let mut zip = zip::ZipArchive::new(f).map_err(|e| e.to_string())?;
            zip.extract(&extract_dir).map_err(|e| e.to_string())?;
        } else {
            let f = std::fs::File::open(&archive).map_err(|e| e.to_string())?;
            let gz = flate2::read::GzDecoder::new(f);
            let mut tar = tar::Archive::new(gz);
            tar.unpack(&extract_dir).map_err(|e| e.to_string())?;
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())??;

    let _ = std::fs::remove_file(&archive_path);
    emit_progress(app, "java", 100.0, "Java ready");

    find_installed(&java_root, major).ok_or("Java extraction failed".to_string())
}

#[tauri::command]
pub async fn check_java(
    app: AppHandle,
    mc_version: String,
    server_type: ServerType,
) -> Result<Option<String>, String> {
    let major = providers::java_major_for_mc(&mc_version, &server_type);
    let state = app.state::<AppState>();
    Ok(find_installed(&state.java_dir(), major))
}

#[tauri::command]
pub async fn download_java(
    app: AppHandle,
    mc_version: String,
    server_type: ServerType,
) -> Result<String, String> {
    ensure_java(&app, &mc_version, &server_type).await
}
