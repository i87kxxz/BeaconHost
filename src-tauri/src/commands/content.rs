use crate::providers::{get_json, http};
use crate::state::{load_server_config, AppState, ServerType};
use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Manager};

#[derive(Serialize)]
pub struct ContentItem {
    pub id: String,
    pub slug: String,
    pub title: String,
    pub description: String,
    pub icon_url: Option<String>,
    pub downloads: u64,
    pub source: String,
}

#[derive(Serialize)]
pub struct InstalledContent {
    pub file_name: String,
    pub size: u64,
    pub enabled: bool,
}

#[derive(Serialize)]
pub struct ContentSearchResult {
    pub items: Vec<ContentItem>,
    pub total: u32,
    pub offset: u32,
    pub limit: u32,
}

/// Search Modrinth for mods or plugins compatible with this server.
#[tauri::command]
pub async fn search_content(
    app: AppHandle,
    id: String,
    query: String,
    offset: u32,
) -> Result<ContentSearchResult, String> {
    let state = app.state::<AppState>();
    let cfg = load_server_config(&state.server_dir(&id))?;

    let (project_type, loader_facet) = match cfg.server_type {
        ServerType::Paper | ServerType::Purpur | ServerType::Spigot => {
            ("plugin", Some("[\"categories:paper\",\"categories:spigot\",\"categories:bukkit\"]".to_string()))
        }
        ServerType::Velocity => ("plugin", Some("[\"categories:velocity\"]".to_string())),
        ServerType::Forge => ("mod", Some("[\"categories:forge\"]".to_string())),
        ServerType::NeoForge => ("mod", Some("[\"categories:neoforge\"]".to_string())),
        ServerType::Fabric => ("mod", Some("[\"categories:fabric\"]".to_string())),
        ServerType::Quilt => {
            ("mod", Some("[\"categories:quilt\",\"categories:fabric\"]".to_string()))
        }
        ServerType::Vanilla => return Err("Vanilla servers do not support mods or plugins".into()),
    };

    let mut facets = vec![format!("[\"project_type:{project_type}\"]")];
    if let Some(lf) = loader_facet {
        facets.push(lf);
    }
    if !cfg.server_type.is_proxy() {
        facets.push(format!("[\"versions:{}\"]", cfg.mc_version));
    }
    let facets_str = format!("[{}]", facets.join(","));

    let limit = 100u32;
    let url = format!(
        "https://api.modrinth.com/v2/search?query={}&facets={}&limit={limit}&offset={}",
        urlencoding_encode(&query),
        urlencoding_encode(&facets_str),
        offset
    );
    let v: Value = get_json(&http(), &url).await?;
    let mut out = Vec::new();
    if let Some(hits) = v["hits"].as_array() {
        for hit in hits {
            out.push(ContentItem {
                id: hit["project_id"].as_str().unwrap_or_default().to_string(),
                slug: hit["slug"].as_str().unwrap_or_default().to_string(),
                title: hit["title"].as_str().unwrap_or_default().to_string(),
                description: hit["description"].as_str().unwrap_or_default().to_string(),
                icon_url: hit["icon_url"].as_str().map(String::from),
                downloads: hit["downloads"].as_u64().unwrap_or(0),
                source: "modrinth".into(),
            });
        }
    }
    let total = v["total_hits"].as_u64().unwrap_or(out.len() as u64) as u32;
    Ok(ContentSearchResult {
        items: out,
        total,
        offset,
        limit,
    })
}

/// Install the best matching version of a Modrinth project into mods/ or plugins/.
#[tauri::command]
pub async fn install_content(
    app: AppHandle,
    id: String,
    project_id: String,
) -> Result<String, String> {
    let state = app.state::<AppState>();
    let server_dir = state.server_dir(&id);
    let cfg = load_server_config(&server_dir)?;

    let loaders: Vec<&str> = match cfg.server_type {
        ServerType::Paper | ServerType::Purpur => vec!["paper", "spigot", "bukkit"],
        ServerType::Spigot => vec!["spigot", "bukkit"],
        ServerType::Velocity => vec!["velocity"],
        ServerType::Forge => vec!["forge"],
        ServerType::NeoForge => vec!["neoforge"],
        ServerType::Fabric => vec!["fabric"],
        ServerType::Quilt => vec!["quilt", "fabric"],
        ServerType::Vanilla => return Err("Vanilla servers do not support mods".into()),
    };

    let url = format!("https://api.modrinth.com/v2/project/{project_id}/version");
    let versions: Value = get_json(&http(), &url).await?;
    let arr = versions.as_array().ok_or("bad versions response")?;

    let matching = arr
        .iter()
        .find(|v| {
            let loader_ok = v["loaders"]
                .as_array()
                .map(|ls| {
                    ls.iter()
                        .filter_map(|l| l.as_str())
                        .any(|l| loaders.contains(&l))
                })
                .unwrap_or(false);
            let version_ok = cfg.server_type.is_proxy()
                || v["game_versions"]
                    .as_array()
                    .map(|gs| {
                        gs.iter()
                            .filter_map(|g| g.as_str())
                            .any(|g| g == cfg.mc_version)
                    })
                    .unwrap_or(false);
            loader_ok && version_ok
        })
        .ok_or("No compatible version found for this server")?;

    let file = matching["files"]
        .as_array()
        .and_then(|fs| {
            fs.iter()
                .find(|f| f["primary"].as_bool() == Some(true))
                .or_else(|| fs.first())
        })
        .ok_or("no files in version")?;

    let dl_url = file["url"].as_str().ok_or("no file url")?;
    let file_name = file["filename"].as_str().ok_or("no filename")?.to_string();
    let sha512 = file["hashes"]["sha512"].as_str();
    let _ = sha512;

    let content_dir = server_dir.join(cfg.server_type.content_dir());
    std::fs::create_dir_all(&content_dir).map_err(|e| e.to_string())?;
    let dest = content_dir.join(&file_name);

    crate::commands::downloads::download_file(
        &app,
        &id,
        dl_url,
        &dest,
        None,
        "content",
        &format!("Downloading {file_name}"),
    )
    .await?;

    Ok(file_name)
}

/// List installed mods/plugins (jar files, .disabled = disabled).
#[tauri::command]
pub async fn list_installed_content(
    app: AppHandle,
    id: String,
) -> Result<Vec<InstalledContent>, String> {
    let state = app.state::<AppState>();
    let server_dir = state.server_dir(&id);
    let cfg = load_server_config(&server_dir)?;
    let dir = server_dir.join(cfg.server_type.content_dir());
    let mut out = Vec::new();
    if dir.exists() {
        for entry in std::fs::read_dir(&dir).map_err(|e| e.to_string())?.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.ends_with(".jar") || name.ends_with(".jar.disabled") {
                let meta = entry.metadata().map_err(|e| e.to_string())?;
                out.push(InstalledContent {
                    enabled: name.ends_with(".jar"),
                    file_name: name,
                    size: meta.len(),
                });
            }
        }
    }
    out.sort_by(|a, b| a.file_name.to_lowercase().cmp(&b.file_name.to_lowercase()));
    Ok(out)
}

#[tauri::command]
pub async fn toggle_content(
    app: AppHandle,
    id: String,
    file_name: String,
) -> Result<(), String> {
    let state = app.state::<AppState>();
    let server_dir = state.server_dir(&id);
    let cfg = load_server_config(&server_dir)?;
    let dir = server_dir.join(cfg.server_type.content_dir());
    let path = dir.join(&file_name);
    if !path.exists() || file_name.contains('/') || file_name.contains('\\') {
        return Err("file not found".into());
    }
    let target = if file_name.ends_with(".disabled") {
        dir.join(file_name.trim_end_matches(".disabled"))
    } else {
        dir.join(format!("{file_name}.disabled"))
    };
    std::fs::rename(&path, &target).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn remove_content(
    app: AppHandle,
    id: String,
    file_name: String,
) -> Result<(), String> {
    if file_name.contains('/') || file_name.contains('\\') {
        return Err("invalid file".into());
    }
    let state = app.state::<AppState>();
    let server_dir = state.server_dir(&id);
    let cfg = load_server_config(&server_dir)?;
    let path = server_dir.join(cfg.server_type.content_dir()).join(&file_name);
    std::fs::remove_file(&path).map_err(|e| e.to_string())
}

/// Install content from a direct URL.
#[tauri::command]
pub async fn install_content_from_url(
    app: AppHandle,
    id: String,
    url: String,
) -> Result<String, String> {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("invalid URL".into());
    }
    let state = app.state::<AppState>();
    let server_dir = state.server_dir(&id);
    let cfg = load_server_config(&server_dir)?;
    let file_name = url
        .split('/')
        .last()
        .and_then(|s| s.split('?').next())
        .filter(|s| !s.is_empty())
        .unwrap_or("download.jar")
        .to_string();
    let file_name = if file_name.ends_with(".jar") {
        file_name
    } else {
        format!("{file_name}.jar")
    };
    let content_dir = server_dir.join(cfg.server_type.content_dir());
    std::fs::create_dir_all(&content_dir).map_err(|e| e.to_string())?;
    crate::commands::downloads::download_file(
        &app,
        &id,
        &url,
        &content_dir.join(&file_name),
        None,
        "content",
        &format!("Downloading {file_name}"),
    )
    .await?;
    Ok(file_name)
}

/// Import a local jar file into mods/plugins.
#[tauri::command]
pub async fn install_content_from_file(
    app: AppHandle,
    id: String,
    source_path: String,
) -> Result<String, String> {
    let state = app.state::<AppState>();
    let server_dir = state.server_dir(&id);
    let cfg = load_server_config(&server_dir)?;
    let src = std::path::PathBuf::from(&source_path);
    if !src.is_file() {
        return Err("file not found".into());
    }
    let name = src
        .file_name()
        .ok_or("invalid file")?
        .to_string_lossy()
        .to_string();
    if !name.ends_with(".jar") {
        return Err("only .jar files are supported".into());
    }
    let content_dir = server_dir.join(cfg.server_type.content_dir());
    std::fs::create_dir_all(&content_dir).map_err(|e| e.to_string())?;
    std::fs::copy(&src, content_dir.join(&name)).map_err(|e| e.to_string())?;
    Ok(name)
}

fn urlencoding_encode(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}
