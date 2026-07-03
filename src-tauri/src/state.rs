use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet, VecDeque};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;

pub const LOG_BUFFER_LINES: usize = 5000;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ServerType {
    Vanilla,
    Paper,
    Purpur,
    Spigot,
    Forge,
    NeoForge,
    Fabric,
    Quilt,
    Velocity,
}

impl ServerType {
    pub fn is_proxy(&self) -> bool {
        matches!(self, ServerType::Velocity)
    }

    pub fn is_modded(&self) -> bool {
        matches!(
            self,
            ServerType::Forge | ServerType::NeoForge | ServerType::Fabric | ServerType::Quilt
        )
    }

    pub fn is_plugin_based(&self) -> bool {
        matches!(
            self,
            ServerType::Paper | ServerType::Purpur | ServerType::Spigot | ServerType::Velocity
        )
    }

    pub fn content_dir(&self) -> &'static str {
        if self.is_plugin_based() {
            "plugins"
        } else {
            "mods"
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfig {
    pub id: String,
    pub name: String,
    pub server_type: ServerType,
    pub mc_version: String,
    /// Loader / build version when relevant (forge, neoforge, fabric loader...)
    #[serde(default)]
    pub loader_version: Option<String>,
    pub ram_mb: u64,
    pub port: u16,
    #[serde(default)]
    pub java_path: Option<String>,
    #[serde(default)]
    pub auto_restart: bool,
    #[serde(default)]
    pub backup_interval_hours: u32,
    #[serde(default)]
    pub last_backup: Option<i64>,
    #[serde(default)]
    pub extra_jvm_args: Option<String>,
    /// One-click performance optimization has been applied.
    #[serde(default)]
    pub optimized: bool,
    /// installing | ready | broken
    #[serde(default = "default_install_state")]
    pub install_state: String,
    pub created_at: i64,
}

fn default_install_state() -> String {
    "installing".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AppSettings {
    #[serde(default)]
    pub language: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ServerStatus {
    Stopped,
    Starting,
    Running,
    Stopping,
    Crashed,
}

pub struct RunningServer {
    pub stdin_tx: tokio::sync::mpsc::UnboundedSender<String>,
    pub status: ServerStatus,
    pub logs: Arc<Mutex<VecDeque<String>>>,
    pub online_players: HashSet<String>,
    pub stop_requested: Arc<std::sync::atomic::AtomicBool>,
    pub pid: Option<u32>,
}

#[derive(Default)]
pub struct AppStateInner {
    pub running: HashMap<String, RunningServer>,
}

pub struct AppState {
    pub inner: Arc<Mutex<AppStateInner>>,
    pub data_dir: PathBuf,
}

impl AppState {
    pub fn new(data_dir: PathBuf) -> Self {
        Self {
            inner: Arc::new(Mutex::new(AppStateInner::default())),
            data_dir,
        }
    }

    pub fn servers_dir(&self) -> PathBuf {
        self.data_dir.join("servers")
    }

    pub fn java_dir(&self) -> PathBuf {
        self.data_dir.join("java")
    }

    pub fn server_dir(&self, id: &str) -> PathBuf {
        self.servers_dir().join(id)
    }

    pub fn settings_path(&self) -> PathBuf {
        self.data_dir.join("settings.json")
    }
}

pub fn load_server_config(dir: &std::path::Path) -> Result<ServerConfig, String> {
    let path = dir.join("minc.json");
    let raw = std::fs::read_to_string(&path).map_err(|e| format!("read minc.json: {e}"))?;
    serde_json::from_str(&raw).map_err(|e| format!("parse minc.json: {e}"))
}

pub fn save_server_config(dir: &std::path::Path, cfg: &ServerConfig) -> Result<(), String> {
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let raw = serde_json::to_string_pretty(cfg).map_err(|e| e.to_string())?;
    std::fs::write(dir.join("minc.json"), raw).map_err(|e| e.to_string())
}
