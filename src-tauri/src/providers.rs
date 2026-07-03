use crate::state::ServerType;
use serde_json::Value;

pub const USER_AGENT: &str = "Minc/0.1.0 (Minecraft Server Manager)";

pub fn http() -> reqwest::Client {
    reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .build()
        .expect("http client")
}

/// Pick the required Java major version for a Minecraft version string like "1.20.4".
pub fn java_major_for_mc(mc_version: &str, server_type: &ServerType) -> u32 {
    if server_type.is_proxy() {
        return 21;
    }
    let parts: Vec<u32> = mc_version
        .split('.')
        .map(|p| p.parse().unwrap_or(0))
        .collect();
    let major = *parts.first().unwrap_or(&0);
    let minor = *parts.get(1).unwrap_or(&0);
    let patch = *parts.get(2).unwrap_or(&0);

    if minecraft_at_least(&parts, 26, 1) {
        25
    } else if major == 1 && (minor > 20 || (minor == 20 && patch >= 5)) {
        21
    } else if major == 1 && minor >= 18 {
        17
    } else if major == 1 && minor == 17 {
        16
    } else {
        8
    }
}

fn minecraft_at_least(parts: &[u32], release_major: u32, release_minor: u32) -> bool {
    match parts {
        // Current Minecraft release scheme, e.g. 1.26.1.
        [1, minor, patch, ..] => {
            *minor > release_major || (*minor == release_major && *patch >= release_minor)
        }
        // Newer shorthand release scheme, e.g. 26.1.
        [major, minor, ..] => {
            *major > release_major || (*major == release_major && *minor >= release_minor)
        }
        [major] => *major > release_major,
        [] => false,
    }
}

/// List available Minecraft versions for a given server type (newest first).
pub async fn list_versions(server_type: &ServerType) -> Result<Vec<String>, String> {
    let client = http();
    match server_type {
        ServerType::Paper | ServerType::Velocity => {
            let project = if *server_type == ServerType::Paper {
                "paper"
            } else {
                "velocity"
            };
            let url = format!("https://fill.papermc.io/v3/projects/{project}");
            let v: Value = get_json(&client, &url).await?;
            // v3 returns versions grouped: {"versions": {"1.21": ["1.21.4", ...], ...}}
            let mut out = Vec::new();
            if let Some(groups) = v["versions"].as_object() {
                for (_k, arr) in groups {
                    if let Some(items) = arr.as_array() {
                        for it in items {
                            if let Some(s) = it.as_str() {
                                out.push(s.to_string());
                            }
                        }
                    }
                }
            } else if let Some(arr) = v["versions"].as_array() {
                for it in arr {
                    if let Some(s) = it.as_str() {
                        out.push(s.to_string());
                    }
                }
            }
            sort_versions_desc(&mut out);
            Ok(out)
        }
        ServerType::Purpur => {
            let v: Value = get_json(&client, "https://api.purpurmc.org/v2/purpur").await?;
            let mut out: Vec<String> = v["versions"]
                .as_array()
                .map(|a| {
                    a.iter()
                        .filter_map(|x| x.as_str().map(String::from))
                        .collect()
                })
                .unwrap_or_default();
            sort_versions_desc(&mut out);
            Ok(out)
        }
        ServerType::Vanilla | ServerType::Spigot | ServerType::Forge => {
            // Use Mojang manifest for the version list (releases only)
            let v: Value = get_json(
                &client,
                "https://launchermeta.mojang.com/mc/game/version_manifest_v2.json",
            )
            .await?;
            let out: Vec<String> = v["versions"]
                .as_array()
                .map(|a| {
                    a.iter()
                        .filter(|x| x["type"].as_str() == Some("release"))
                        .filter_map(|x| x["id"].as_str().map(String::from))
                        .collect()
                })
                .unwrap_or_default();
            Ok(out)
        }
        ServerType::NeoForge => {
            let v: Value = get_json(
                &client,
                "https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge",
            )
            .await?;
            // NeoForge versions look like "21.4.108" => MC 1.21.4
            let mut mc_versions: Vec<String> = Vec::new();
            if let Some(arr) = v["versions"].as_array() {
                for it in arr {
                    if let Some(s) = it.as_str() {
                        if s.contains("beta") {
                            continue;
                        }
                        let parts: Vec<&str> = s.split('.').collect();
                        if parts.len() >= 2 {
                            let mc = if parts[1] == "0" {
                                format!("1.{}", parts[0])
                            } else {
                                format!("1.{}.{}", parts[0], parts[1])
                            };
                            if !mc_versions.contains(&mc) {
                                mc_versions.push(mc);
                            }
                        }
                    }
                }
            }
            mc_versions.reverse();
            Ok(mc_versions)
        }
        ServerType::Fabric => {
            let v: Value = get_json(&client, "https://meta.fabricmc.net/v2/versions/game").await?;
            let out: Vec<String> = v
                .as_array()
                .map(|a| {
                    a.iter()
                        .filter(|x| x["stable"].as_bool() == Some(true))
                        .filter_map(|x| x["version"].as_str().map(String::from))
                        .collect()
                })
                .unwrap_or_default();
            Ok(out)
        }
        ServerType::Quilt => {
            let v: Value = get_json(&client, "https://meta.quiltmc.org/v3/versions/game").await?;
            let out: Vec<String> = v
                .as_array()
                .map(|a| {
                    a.iter()
                        .filter(|x| x["stable"].as_bool() == Some(true))
                        .filter_map(|x| x["version"].as_str().map(String::from))
                        .collect()
                })
                .unwrap_or_default();
            Ok(out)
        }
    }
}

pub struct ResolvedDownload {
    pub url: String,
    pub file_name: String,
    pub sha256: Option<String>,
    /// True when the downloaded jar is an installer that must be executed with Java.
    pub is_installer: bool,
    /// Extra args passed to the installer.
    pub installer_args: Vec<String>,
}

/// Resolve the direct download for a server type + version.
pub async fn resolve_download(
    server_type: &ServerType,
    mc_version: &str,
) -> Result<ResolvedDownload, String> {
    let client = http();
    match server_type {
        ServerType::Paper | ServerType::Velocity => {
            let project = if *server_type == ServerType::Paper {
                "paper"
            } else {
                "velocity"
            };
            let url = format!(
                "https://fill.papermc.io/v3/projects/{project}/versions/{mc_version}/builds"
            );
            let v: Value = get_json(&client, &url).await?;
            let builds = v.as_array().ok_or("unexpected builds response")?;
            let build = builds
                .iter()
                .find(|b| b["channel"].as_str() == Some("STABLE"))
                .or_else(|| builds.first())
                .ok_or(format!("no builds for {project} {mc_version}"))?;
            let dl = &build["downloads"]["server:default"];
            let dl_url = dl["url"].as_str().ok_or("no download url")?.to_string();
            let sha = dl["checksums"]["sha256"].as_str().map(String::from);
            Ok(ResolvedDownload {
                url: dl_url,
                file_name: "server.jar".into(),
                sha256: sha,
                is_installer: false,
                installer_args: vec![],
            })
        }
        ServerType::Purpur => Ok(ResolvedDownload {
            url: format!("https://api.purpurmc.org/v2/purpur/{mc_version}/latest/download"),
            file_name: "server.jar".into(),
            sha256: None,
            is_installer: false,
            installer_args: vec![],
        }),
        ServerType::Vanilla => {
            let manifest: Value = get_json(
                &client,
                "https://launchermeta.mojang.com/mc/game/version_manifest_v2.json",
            )
            .await?;
            let ver = manifest["versions"]
                .as_array()
                .and_then(|a| a.iter().find(|x| x["id"].as_str() == Some(mc_version)))
                .ok_or(format!("version {mc_version} not found"))?;
            let ver_url = ver["url"].as_str().ok_or("no version url")?;
            let detail: Value = get_json(&client, ver_url).await?;
            let server = &detail["downloads"]["server"];
            let url = server["url"]
                .as_str()
                .ok_or(format!("no server jar for {mc_version}"))?
                .to_string();
            Ok(ResolvedDownload {
                url,
                file_name: "server.jar".into(),
                sha256: None, // mojang provides sha1 only
                is_installer: false,
                installer_args: vec![],
            })
        }
        ServerType::Fabric => {
            // Latest stable loader + installer
            let loaders: Value =
                get_json(&client, "https://meta.fabricmc.net/v2/versions/loader").await?;
            let loader = loaders
                .as_array()
                .and_then(|a| a.iter().find(|x| x["stable"].as_bool() == Some(true)))
                .and_then(|x| x["version"].as_str())
                .ok_or("no stable fabric loader")?
                .to_string();
            let installers: Value =
                get_json(&client, "https://meta.fabricmc.net/v2/versions/installer").await?;
            let installer = installers
                .as_array()
                .and_then(|a| a.iter().find(|x| x["stable"].as_bool() == Some(true)))
                .and_then(|x| x["version"].as_str())
                .ok_or("no stable fabric installer")?
                .to_string();
            Ok(ResolvedDownload {
                url: format!(
                    "https://meta.fabricmc.net/v2/versions/loader/{mc_version}/{loader}/{installer}/server/jar"
                ),
                file_name: "server.jar".into(),
                sha256: None,
                is_installer: false,
                installer_args: vec![],
            })
        }
        ServerType::Quilt => {
            let v: Value = get_json(&client, "https://meta.quiltmc.org/v3/versions/installer").await?;
            let installer_url = v
                .as_array()
                .and_then(|a| a.first())
                .and_then(|x| x["url"].as_str())
                .ok_or("no quilt installer")?
                .to_string();
            Ok(ResolvedDownload {
                url: installer_url,
                file_name: "quilt-installer.jar".into(),
                sha256: None,
                is_installer: true,
                installer_args: vec![
                    "install".into(),
                    "server".into(),
                    mc_version.to_string(),
                    "--download-server".into(),
                    "--install-dir=.".into(),
                ],
            })
        }
        ServerType::NeoForge => {
            let v: Value = get_json(
                &client,
                "https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge",
            )
            .await?;
            // Map mc version 1.21.4 -> neoforge versions starting with "21.4."
            let stripped = mc_version.strip_prefix("1.").unwrap_or(mc_version);
            let prefix = if stripped.contains('.') {
                format!("{stripped}.")
            } else {
                format!("{stripped}.0.")
            };
            let neo_ver = v["versions"]
                .as_array()
                .and_then(|a| {
                    a.iter()
                        .filter_map(|x| x.as_str())
                        .filter(|s| s.starts_with(&prefix) && !s.contains("beta"))
                        .last()
                })
                .ok_or(format!("no NeoForge build for {mc_version}"))?
                .to_string();
            Ok(ResolvedDownload {
                url: format!(
                    "https://maven.neoforged.net/releases/net/neoforged/neoforge/{neo_ver}/neoforge-{neo_ver}-installer.jar"
                ),
                file_name: "installer.jar".into(),
                sha256: None,
                is_installer: true,
                installer_args: vec!["--install-server".into(), ".".into()],
            })
        }
        ServerType::Forge => {
            let v: Value = get_json(
                &client,
                "https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json",
            )
            .await?;
            let promos = v["promos"].as_object().ok_or("bad forge promotions")?;
            let build = promos
                .get(&format!("{mc_version}-recommended"))
                .or_else(|| promos.get(&format!("{mc_version}-latest")))
                .and_then(|x| x.as_str())
                .ok_or(format!("no Forge build for {mc_version}"))?;
            let full = format!("{mc_version}-{build}");
            Ok(ResolvedDownload {
                url: format!(
                    "https://maven.minecraftforge.net/net/minecraftforge/forge/{full}/forge-{full}-installer.jar"
                ),
                file_name: "installer.jar".into(),
                sha256: None,
                is_installer: true,
                installer_args: vec!["--installServer".into(), ".".into()],
            })
        }
        ServerType::Spigot => {
            // BuildTools flow handled separately in downloads.rs
            Ok(ResolvedDownload {
                url: "https://hub.spigotmc.org/jenkins/job/BuildTools/lastSuccessfulBuild/artifact/target/BuildTools.jar".into(),
                file_name: "BuildTools.jar".into(),
                sha256: None,
                is_installer: true,
                installer_args: vec!["--rev".into(), mc_version.to_string()],
            })
        }
    }
}

pub async fn get_json(client: &reqwest::Client, url: &str) -> Result<Value, String> {
    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("GET {url}: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("GET {url}: HTTP {}", resp.status()));
    }
    resp.json().await.map_err(|e| format!("parse {url}: {e}"))
}

fn sort_versions_desc(versions: &mut [String]) {
    versions.sort_by(|a, b| {
        let pa: Vec<u32> = a.split('.').map(|x| x.parse().unwrap_or(0)).collect();
        let pb: Vec<u32> = b.split('.').map(|x| x.parse().unwrap_or(0)).collect();
        pb.cmp(&pa)
    });
}
