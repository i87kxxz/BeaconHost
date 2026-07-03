use crate::providers::USER_AGENT;
use crate::state::AppState;
use serde::Serialize;
use tauri::{AppHandle, Manager};

#[derive(Serialize)]
pub struct NetworkInfo {
    pub public_ip: Option<String>,
    pub local_ip: Option<String>,
    pub host_os: String,
}

#[derive(Serialize)]
pub struct FirewallResult {
    pub success: bool,
    pub os: String,
    pub command: String,
    pub output: String,
    pub message: String,
}

#[derive(Serialize)]
pub struct PortStatus {
    pub listening: bool,
    pub details: String,
}

fn host_os_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else {
        "linux"
    }
}

/// Commands shown in the UI (may differ slightly from what was auto-detected at runtime).
pub fn firewall_commands_for_os(os: &str, port: u16) -> Vec<String> {
    match os {
        "windows" => vec![format!(
            "New-NetFirewallRule -DisplayName \"BeaconHost-Minecraft-{port}\" -Direction Inbound -Protocol TCP -LocalPort {port} -Action Allow"
        )],
        "linux" => vec![
            format!("ufw allow {port}/tcp"),
            "ufw reload".into(),
            format!("# or with firewalld:\nfirewall-cmd --permanent --add-port={port}/tcp\nfirewall-cmd --reload"),
        ],
        _ => vec![format!("# No automatic firewall command for {os}")],
    }
}

#[tauri::command]
pub fn get_firewall_commands(port: u16) -> Vec<String> {
    firewall_commands_for_os(host_os_name(), port)
}

#[tauri::command]
pub async fn check_port_status(port: u16) -> Result<PortStatus, String> {
    let (listening, details) = tokio::task::spawn_blocking(move || check_port_listening(port))
        .await
        .map_err(|e| e.to_string())?;
    Ok(PortStatus { listening, details })
}

fn check_port_listening(port: u16) -> (bool, String) {
    #[cfg(windows)]
    {
        let out = std::process::Command::new("netstat")
            .args(["-an"])
            .output();
        if let Ok(o) = out {
            let text = String::from_utf8_lossy(&o.stdout);
            let needle = format!(":{port}");
            let listening = text.lines().any(|l| {
                l.contains(&needle) && (l.contains("LISTENING") || l.contains("LISTEN"))
            });
            return (listening, text.lines().take(20).collect::<Vec<_>>().join("\n"));
        }
        (false, "netstat failed".into())
    }
    #[cfg(not(windows))]
    {
        // Prefer ss, fall back to netstat
        if let Ok(o) = std::process::Command::new("ss")
            .args(["-tlnp"])
            .output()
        {
            let text = String::from_utf8_lossy(&o.stdout);
            let needle = format!(":{port}");
            let listening = text.lines().any(|l| l.contains(&needle));
            if listening || !text.is_empty() {
                return (listening, text.to_string());
            }
        }
        if let Ok(o) = std::process::Command::new("netstat")
            .args(["-tlnp"])
            .output()
        {
            let text = String::from_utf8_lossy(&o.stdout);
            let needle = format!(":{port}");
            let listening = text.lines().any(|l| l.contains(&needle) && l.contains("LISTEN"));
            return (listening, text.to_string());
        }
        (false, "Could not check port (ss/netstat unavailable)".into())
    }
}

/// Open the Minecraft port in the local OS firewall (ufw / firewalld / Windows Defender Firewall).
#[tauri::command]
pub async fn open_firewall_port(port: u16) -> Result<FirewallResult, String> {
    let result = tokio::task::spawn_blocking(move || open_firewall_port_sync(port))
        .await
        .map_err(|e| e.to_string())??;
    Ok(result)
}

fn open_firewall_port_sync(port: u16) -> Result<FirewallResult, String> {
    #[cfg(windows)]
    {
        let cmd = format!(
            "New-NetFirewallRule -DisplayName \"BeaconHost-Minecraft-{port}\" -Direction Inbound -Protocol TCP -LocalPort {port} -Action Allow -ErrorAction Stop"
        );
        let out = std::process::Command::new("powershell")
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                &cmd,
            ])
            .output()
            .map_err(|e| format!("powershell: {e}"))?;
        let stdout = String::from_utf8_lossy(&out.stdout).to_string();
        let stderr = String::from_utf8_lossy(&out.stderr).to_string();
        let combined = format!("{stdout}\n{stderr}").trim().to_string();
        if out.status.success() {
            Ok(FirewallResult {
                success: true,
                os: "windows".into(),
                command: cmd,
                output: combined,
                message: format!("Port {port} opened in Windows Firewall"),
            })
        } else if combined.contains("already exists") || combined.contains("Duplicate") {
            Ok(FirewallResult {
                success: true,
                os: "windows".into(),
                command: cmd,
                output: combined,
                message: format!("Firewall rule for port {port} already exists"),
            })
        } else {
            Err(format!(
                "Failed to open port {port}. Run BeaconHost as Administrator.\n{combined}"
            ))
        }
    }

    #[cfg(target_os = "linux")]
    {
        // Try ufw first
        if command_exists("ufw") {
            let allow = std::process::Command::new("ufw")
                .args(["allow", &format!("{port}/tcp")])
                .output()
                .map_err(|e| e.to_string())?;
            let reload = std::process::Command::new("ufw")
                .arg("reload")
                .output()
                .map_err(|e| e.to_string())?;
            let out = format!(
                "ufw allow:\n{}\nufw reload:\n{}",
                String::from_utf8_lossy(&allow.stdout),
                String::from_utf8_lossy(&reload.stdout)
            );
            if allow.status.success() || reload.status.success() {
                return Ok(FirewallResult {
                    success: true,
                    os: "linux".into(),
                    command: format!("ufw allow {port}/tcp && ufw reload"),
                    output: out,
                    message: format!("Port {port} opened via ufw"),
                });
            }
        }

        // Try firewalld
        if command_exists("firewall-cmd") {
            let add = std::process::Command::new("firewall-cmd")
                .args([
                    "--permanent",
                    "--add-port",
                    &format!("{port}/tcp"),
                ])
                .output()
                .map_err(|e| e.to_string())?;
            let reload = std::process::Command::new("firewall-cmd")
                .arg("--reload")
                .output()
                .map_err(|e| e.to_string())?;
            let out = format!(
                "firewall-cmd:\n{}\nreload:\n{}",
                String::from_utf8_lossy(&add.stdout),
                String::from_utf8_lossy(&reload.stdout)
            );
            if add.status.success() {
                return Ok(FirewallResult {
                    success: true,
                    os: "linux".into(),
                    command: format!(
                        "firewall-cmd --permanent --add-port={port}/tcp && firewall-cmd --reload"
                    ),
                    output: out,
                    message: format!("Port {port} opened via firewalld"),
                });
            }
        }

        Err(format!(
            "Could not open port {port}. Install ufw or firewalld, or run as root:\n  sudo ufw allow {port}/tcp && sudo ufw reload"
        ))
    }

    #[cfg(target_os = "macos")]
    {
        Err("macOS firewall must be configured manually in System Settings > Network > Firewall".into())
    }

    #[cfg(not(any(windows, target_os = "linux", target_os = "macos")))]
    {
        Err("Unsupported operating system for automatic firewall configuration".into())
    }
}

#[cfg(not(windows))]
fn command_exists(name: &str) -> bool {
    std::process::Command::new("sh")
        .args(["-c", &format!("command -v {name}")])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Ensure server.properties binds to all interfaces (server-ip empty).
#[tauri::command]
pub async fn prepare_vps_network(app: AppHandle, id: String) -> Result<(), String> {
    let state = app.state::<AppState>();
    let dir = state.server_dir(&id);
    crate::commands::properties::set_property_internal(&dir, "server-ip", "")?;
    Ok(())
}

#[tauri::command]
pub async fn get_network_info(_app: AppHandle) -> Result<NetworkInfo, String> {
    let client = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .map_err(|e| e.to_string())?;
    let public_ip = match client.get("https://api.ipify.org").send().await {
        Ok(r) => r.text().await.ok(),
        Err(_) => None,
    };

    let local_ip = local_ip_address();

    Ok(NetworkInfo {
        public_ip,
        local_ip,
        host_os: host_os_name().to_string(),
    })
}

fn local_ip_address() -> Option<String> {
    // Connect a UDP socket to a public address to discover the outbound interface IP.
    let socket = std::net::UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    socket.local_addr().ok().map(|a| a.ip().to_string())
}

#[tauri::command]
pub async fn set_online_mode(app: AppHandle, id: String, online: bool) -> Result<(), String> {
    let state = app.state::<AppState>();
    let dir = state.server_dir(&id);
    crate::commands::properties::set_property_internal(
        &dir,
        "online-mode",
        if online { "true" } else { "false" },
    )
}