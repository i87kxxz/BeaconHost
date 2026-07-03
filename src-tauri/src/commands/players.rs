use crate::process;
use crate::state::AppState;
use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Manager};

#[derive(Serialize)]
pub struct PlayerLists {
    pub whitelist: Vec<String>,
    pub ops: Vec<String>,
    pub banned: Vec<String>,
    pub online: Vec<String>,
    pub whitelist_enabled: bool,
}

fn read_name_list(path: &std::path::Path) -> Vec<String> {
    let Ok(raw) = std::fs::read_to_string(path) else {
        return vec![];
    };
    let Ok(v) = serde_json::from_str::<Value>(&raw) else {
        return vec![];
    };
    v.as_array()
        .map(|a| {
            a.iter()
                .filter_map(|x| x["name"].as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default()
}

#[tauri::command]
pub async fn get_players(app: AppHandle, id: String) -> Result<PlayerLists, String> {
    let state = app.state::<AppState>();
    let dir = state.server_dir(&id);

    let online = {
        let inner = state.inner.lock().await;
        inner
            .running
            .get(&id)
            .map(|r| {
                let mut p: Vec<String> = r.online_players.iter().cloned().collect();
                p.sort();
                p
            })
            .unwrap_or_default()
    };

    let whitelist_enabled = std::fs::read_to_string(dir.join("server.properties"))
        .map(|raw| {
            raw.lines().any(|l| {
                let l = l.trim();
                l == "white-list=true" || l == "enforce-whitelist=true"
            })
        })
        .unwrap_or(false);

    Ok(PlayerLists {
        whitelist: read_name_list(&dir.join("whitelist.json")),
        ops: read_name_list(&dir.join("ops.json")),
        banned: read_name_list(&dir.join("banned-players.json")),
        online,
        whitelist_enabled,
    })
}

/// Run a player action. When the server is running, use console commands (live).
/// Fails with a clear message if the server is offline (json editing while offline
/// would need UUID lookup; keep it simple and reliable).
#[tauri::command]
pub async fn player_action(
    app: AppHandle,
    id: String,
    action: String,
    player: String,
) -> Result<(), String> {
    let player = player.trim();
    if player.is_empty() || player.contains(' ') {
        return Err("invalid player name".into());
    }
    let cmd = match action.as_str() {
        "whitelist_add" => format!("whitelist add {player}"),
        "whitelist_remove" => format!("whitelist remove {player}"),
        "whitelist_on" => "whitelist on".to_string(),
        "whitelist_off" => "whitelist off".to_string(),
        "op" => format!("op {player}"),
        "deop" => format!("deop {player}"),
        "ban" => format!("ban {player}"),
        "pardon" => format!("pardon {player}"),
        "kick" => format!("kick {player}"),
        _ => return Err("unknown action".into()),
    };
    process::send_command(&app, &id, &cmd)
        .await
        .map_err(|_| "The server must be running to manage players".to_string())
}
