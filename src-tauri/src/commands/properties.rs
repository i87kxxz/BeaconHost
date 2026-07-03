use crate::state::AppState;
use std::collections::BTreeMap;
use std::path::Path;
use tauri::{AppHandle, Manager};

fn props_path(dir: &Path) -> std::path::PathBuf {
    dir.join("server.properties")
}

fn parse_properties(raw: &str) -> BTreeMap<String, String> {
    let mut map = BTreeMap::new();
    for line in raw.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        if let Some((k, v)) = line.split_once('=') {
            map.insert(k.trim().to_string(), v.trim().to_string());
        }
    }
    map
}

#[tauri::command]
pub async fn get_properties(
    app: AppHandle,
    id: String,
) -> Result<BTreeMap<String, String>, String> {
    let state = app.state::<AppState>();
    let path = props_path(&state.server_dir(&id));
    if !path.exists() {
        return Ok(BTreeMap::new());
    }
    let raw = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    Ok(parse_properties(&raw))
}

/// Update a single key preserving comments and unknown lines.
pub fn set_property_internal(dir: &Path, key: &str, value: &str) -> Result<(), String> {
    let path = props_path(dir);
    let raw = if path.exists() {
        std::fs::read_to_string(&path).map_err(|e| e.to_string())?
    } else {
        String::new()
    };
    let mut lines: Vec<String> = raw.lines().map(String::from).collect();
    let mut found = false;
    for line in lines.iter_mut() {
        let trimmed = line.trim();
        if trimmed.starts_with('#') {
            continue;
        }
        if let Some((k, _)) = trimmed.split_once('=') {
            if k.trim() == key {
                *line = format!("{key}={value}");
                found = true;
                break;
            }
        }
    }
    if !found {
        lines.push(format!("{key}={value}"));
    }
    std::fs::write(&path, lines.join("\n") + "\n").map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_properties(
    app: AppHandle,
    id: String,
    entries: BTreeMap<String, String>,
) -> Result<(), String> {
    let state = app.state::<AppState>();
    let dir = state.server_dir(&id);
    for (k, v) in entries {
        set_property_internal(&dir, &k, &v)?;
    }
    Ok(())
}
