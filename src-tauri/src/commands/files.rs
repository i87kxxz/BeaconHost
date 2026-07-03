use crate::state::AppState;
use serde::Serialize;
use std::path::{Component, Path, PathBuf};
use tauri::{AppHandle, Manager};

#[derive(Serialize)]
pub struct FileEntry {
    pub name: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: Option<i64>,
}

/// Resolve a relative path safely inside the server dir (no traversal outside).
fn resolve(server_dir: &Path, rel: &str) -> Result<PathBuf, String> {
    let rel_path = Path::new(rel);
    let mut out = server_dir.to_path_buf();
    for comp in rel_path.components() {
        match comp {
            Component::Normal(c) => out.push(c),
            Component::CurDir => {}
            _ => return Err("invalid path".into()),
        }
    }
    Ok(out)
}

fn server_dir(app: &AppHandle, id: &str) -> PathBuf {
    app.state::<AppState>().server_dir(id)
}

#[tauri::command]
pub async fn list_files(
    app: AppHandle,
    id: String,
    rel_path: String,
) -> Result<Vec<FileEntry>, String> {
    let dir = resolve(&server_dir(&app, &id), &rel_path)?;
    if !dir.exists() {
        return Ok(vec![]);
    }
    let mut out = Vec::new();
    for entry in std::fs::read_dir(&dir).map_err(|e| e.to_string())?.flatten() {
        let meta = entry.metadata().map_err(|e| e.to_string())?;
        out.push(FileEntry {
            name: entry.file_name().to_string_lossy().to_string(),
            is_dir: meta.is_dir(),
            size: meta.len(),
            modified: meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs() as i64),
        });
    }
    out.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then(a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    Ok(out)
}

#[tauri::command]
pub async fn read_file(app: AppHandle, id: String, rel_path: String) -> Result<String, String> {
    let path = resolve(&server_dir(&app, &id), &rel_path)?;
    let meta = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    if meta.len() > 5 * 1024 * 1024 {
        return Err("File is too large to open in the editor (max 5 MB)".into());
    }
    std::fs::read_to_string(&path).map_err(|e| format!("not a text file: {e}"))
}

#[tauri::command]
pub async fn write_file(
    app: AppHandle,
    id: String,
    rel_path: String,
    content: String,
) -> Result<(), String> {
    let path = resolve(&server_dir(&app, &id), &rel_path)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_path(app: AppHandle, id: String, rel_path: String) -> Result<(), String> {
    if rel_path.trim().is_empty() || rel_path == "." {
        return Err("cannot delete server root".into());
    }
    let path = resolve(&server_dir(&app, &id), &rel_path)?;
    if path.is_dir() {
        std::fs::remove_dir_all(&path).map_err(|e| e.to_string())
    } else {
        std::fs::remove_file(&path).map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub async fn rename_path(
    app: AppHandle,
    id: String,
    rel_path: String,
    new_name: String,
) -> Result<(), String> {
    if new_name.contains('/') || new_name.contains('\\') {
        return Err("invalid name".into());
    }
    let sdir = server_dir(&app, &id);
    let path = resolve(&sdir, &rel_path)?;
    let target = path
        .parent()
        .ok_or("invalid path")?
        .join(&new_name);
    std::fs::rename(&path, &target).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_folder(app: AppHandle, id: String, rel_path: String) -> Result<(), String> {
    let path = resolve(&server_dir(&app, &id), &rel_path)?;
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())
}

/// Copy an external file (chosen via dialog) into the server dir.
#[tauri::command]
pub async fn import_file(
    app: AppHandle,
    id: String,
    source_path: String,
    dest_rel_dir: String,
) -> Result<(), String> {
    let src = PathBuf::from(&source_path);
    if !src.is_file() {
        return Err("source is not a file".into());
    }
    let name = src
        .file_name()
        .ok_or("invalid source file")?
        .to_string_lossy()
        .to_string();
    let dest_dir = resolve(&server_dir(&app, &id), &dest_rel_dir)?;
    std::fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;
    std::fs::copy(&src, dest_dir.join(&name)).map_err(|e| e.to_string())?;
    Ok(())
}

/// Save arbitrary text to a user-chosen absolute path (used for log export).
#[tauri::command]
pub async fn save_text_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn open_server_folder(app: AppHandle, id: String) -> Result<(), String> {
    let dir = server_dir(&app, &id);
    tauri_plugin_opener::open_path(dir.to_string_lossy().to_string(), None::<String>)
        .map_err(|e| e.to_string())
}
