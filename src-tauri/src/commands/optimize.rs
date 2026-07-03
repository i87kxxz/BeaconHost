use crate::commands::properties::set_property_internal;
use crate::state::{load_server_config, save_server_config, AppState, ServerStatus, ServerType};
use serde::Serialize;
use tauri::{AppHandle, Manager};

/// Modrinth project slug for the Chunky pregeneration tool.
const CHUNKY_SLUG: &str = "fALzjamp";

#[derive(Serialize)]
pub struct OptimizeResult {
    /// Section keys that were applied: jvm | properties | spigot | bukkit | paper | purpur | mods
    pub applied: Vec<String>,
    pub mods_installed: Vec<String>,
    pub warnings: Vec<String>,
    pub needs_restart: bool,
}

#[derive(Serialize)]
pub struct PerfStatus {
    pub optimized: bool,
    pub pregen_installed: bool,
    pub pregen_supported: bool,
    /// low | mid | high
    pub ram_tier: String,
}

/// Tuning values for a RAM tier.
struct Tune {
    view_distance: u8,
    sim_distance: u8,
    mob_spawn_range: u8,
    ear_animals: u8,
    ear_monsters: u8,
    ear_raiders: u8,
    ear_misc: u8,
    ear_water: u8,
    ear_villagers: u8,
    merge_item: f32,
    merge_exp: f32,
    spawn_monsters: u8,
    spawn_animals: u8,
    spawn_water: u8,
    spawn_water_ambient: u8,
    spawn_ambient: u8,
    ticks_monster_spawns: u8,
    max_autosave_chunks: u8,
    max_entity_collisions: u8,
    grass_spread: u8,
    mob_spawner_rate: u8,
    despawn_soft: u8,
    despawn_hard: u8,
    alt_item_despawn: bool,
}

fn ram_tier(ram_mb: u64) -> &'static str {
    if ram_mb < 2048 {
        "low"
    } else if ram_mb <= 4096 {
        "mid"
    } else {
        "high"
    }
}

fn tune_for(ram_mb: u64) -> Tune {
    match ram_tier(ram_mb) {
        "low" => Tune {
            view_distance: 6,
            sim_distance: 4,
            mob_spawn_range: 3,
            ear_animals: 16,
            ear_monsters: 24,
            ear_raiders: 48,
            ear_misc: 8,
            ear_water: 8,
            ear_villagers: 16,
            merge_item: 3.5,
            merge_exp: 4.0,
            spawn_monsters: 20,
            spawn_animals: 5,
            spawn_water: 2,
            spawn_water_ambient: 2,
            spawn_ambient: 1,
            ticks_monster_spawns: 8,
            max_autosave_chunks: 6,
            max_entity_collisions: 2,
            grass_spread: 4,
            mob_spawner_rate: 2,
            despawn_soft: 28,
            despawn_hard: 56,
            alt_item_despawn: true,
        },
        "mid" => Tune {
            view_distance: 8,
            sim_distance: 5,
            mob_spawn_range: 4,
            ear_animals: 24,
            ear_monsters: 28,
            ear_raiders: 56,
            ear_misc: 12,
            ear_water: 12,
            ear_villagers: 24,
            merge_item: 3.0,
            merge_exp: 3.5,
            spawn_monsters: 40,
            spawn_animals: 8,
            spawn_water: 4,
            spawn_water_ambient: 4,
            spawn_ambient: 8,
            ticks_monster_spawns: 4,
            max_autosave_chunks: 8,
            max_entity_collisions: 4,
            grass_spread: 2,
            mob_spawner_rate: 2,
            despawn_soft: 30,
            despawn_hard: 96,
            alt_item_despawn: true,
        },
        _ => Tune {
            view_distance: 10,
            sim_distance: 7,
            mob_spawn_range: 6,
            ear_animals: 32,
            ear_monsters: 32,
            ear_raiders: 64,
            ear_misc: 16,
            ear_water: 16,
            ear_villagers: 32,
            merge_item: 2.5,
            merge_exp: 3.0,
            spawn_monsters: 50,
            spawn_animals: 10,
            spawn_water: 5,
            spawn_water_ambient: 5,
            spawn_ambient: 10,
            ticks_monster_spawns: 2,
            max_autosave_chunks: 12,
            max_entity_collisions: 8,
            grass_spread: 1,
            mob_spawner_rate: 1,
            despawn_soft: 32,
            despawn_hard: 128,
            alt_item_despawn: false,
        },
    }
}

/// Aikar's flags, tuned per heap size (https://docs.papermc.io/paper/aikars-flags).
fn aikar_flags(ram_mb: u64) -> Vec<&'static str> {
    let big = ram_mb >= 12 * 1024;
    let mut f = vec![
        "-XX:+UseG1GC",
        "-XX:+ParallelRefProcEnabled",
        "-XX:MaxGCPauseMillis=200",
        "-XX:+UnlockExperimentalVMOptions",
        "-XX:+DisableExplicitGC",
        "-XX:+AlwaysPreTouch",
    ];
    if big {
        f.extend([
            "-XX:G1NewSizePercent=40",
            "-XX:G1MaxNewSizePercent=50",
            "-XX:G1HeapRegionSize=16M",
            "-XX:G1ReservePercent=15",
            "-XX:InitiatingHeapOccupancyPercent=20",
        ]);
    } else {
        f.extend([
            "-XX:G1NewSizePercent=30",
            "-XX:G1MaxNewSizePercent=40",
            "-XX:G1HeapRegionSize=8M",
            "-XX:G1ReservePercent=20",
            "-XX:InitiatingHeapOccupancyPercent=15",
        ]);
    }
    f.extend([
        "-XX:G1HeapWastePercent=5",
        "-XX:G1MixedGCCountTarget=4",
        "-XX:G1MixedGCLiveThresholdPercent=90",
        "-XX:G1RSetUpdatingPauseTimePercent=5",
        "-XX:SurvivorRatio=32",
        "-XX:+PerfDisableSharedMem",
        "-XX:MaxTenuringThreshold=1",
        "-Dusing.aikars.flags=https://mcflags.emc.gs",
        "-Daikars.new.flags=true",
    ]);
    f
}

/// Velocity's recommended flags (https://docs.papermc.io/velocity/tuning).
fn velocity_flags() -> Vec<&'static str> {
    vec![
        "-XX:+UseG1GC",
        "-XX:G1HeapRegionSize=4M",
        "-XX:+UnlockExperimentalVMOptions",
        "-XX:+ParallelRefProcEnabled",
        "-XX:+AlwaysPreTouch",
        "-XX:MaxInlineLevel=15",
    ]
}

/// Replace GC-related args with our flags, keeping any unrelated user args.
fn merged_jvm_args(existing: Option<&str>, flags: &[&'static str]) -> String {
    let mut out: Vec<String> = flags.iter().map(|s| s.to_string()).collect();
    if let Some(e) = existing {
        for tok in e.split_whitespace() {
            let keep = !tok.starts_with("-XX:")
                && !tok.starts_with("-Xms")
                && !tok.starts_with("-Xmx")
                && !tok.starts_with("-Dusing.aikars")
                && !tok.starts_with("-Daikars.");
            if keep && !out.iter().any(|t| t == tok) {
                out.push(tok.to_string());
            }
        }
    }
    out.join(" ")
}

fn merge_yaml(dst: &mut serde_yaml::Value, patch: serde_yaml::Value) {
    match (dst, patch) {
        (serde_yaml::Value::Mapping(d), serde_yaml::Value::Mapping(p)) => {
            for (k, v) in p {
                match d.get_mut(&k) {
                    Some(dv) => merge_yaml(dv, v),
                    None => {
                        d.insert(k, v);
                    }
                }
            }
        }
        (d, p) => *d = p,
    }
}

/// Deep-merge a YAML patch into a file, creating it if missing.
/// Note: rewriting drops comments, but the server only reads values.
fn apply_yaml_patch(path: &std::path::Path, patch_src: &str) -> Result<(), String> {
    let patch: serde_yaml::Value = serde_yaml::from_str(patch_src)
        .map_err(|e| format!("internal yaml patch error: {e}"))?;
    let mut root = if path.exists() {
        let raw = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
        serde_yaml::from_str::<serde_yaml::Value>(&raw)
            .unwrap_or(serde_yaml::Value::Mapping(Default::default()))
    } else {
        serde_yaml::Value::Mapping(Default::default())
    };
    if !root.is_mapping() {
        root = serde_yaml::Value::Mapping(Default::default());
    }
    merge_yaml(&mut root, patch);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let raw = serde_yaml::to_string(&root).map_err(|e| e.to_string())?;
    std::fs::write(path, raw).map_err(|e| e.to_string())
}

/// Minor Minecraft version, e.g. "1.20.4" -> 20.
fn mc_minor(mc_version: &str) -> u32 {
    mc_version
        .split('.')
        .nth(1)
        .and_then(|s| s.parse::<u32>().ok())
        .unwrap_or(0)
}

fn alt_item_despawn_yaml(enabled: bool, indent: &str) -> String {
    if enabled {
        format!(
            "{i}alt-item-despawn-rate:\n{i}  enabled: true\n{i}  items:\n{i}    cobblestone: 300\n{i}    netherrack: 300\n{i}    sand: 300\n{i}    red_sand: 300\n{i}    gravel: 300\n{i}    dirt: 300\n",
            i = indent
        )
    } else {
        format!("{i}alt-item-despawn-rate:\n{i}  enabled: false\n", i = indent)
    }
}

async fn is_running(app: &AppHandle, id: &str) -> bool {
    let state = app.state::<AppState>();
    let inner = state.inner.lock().await;
    matches!(
        inner.running.get(id).map(|r| r.status.clone()),
        Some(ServerStatus::Running) | Some(ServerStatus::Starting)
    )
}

fn installed_jars(server_dir: &std::path::Path, server_type: &ServerType) -> Vec<String> {
    let dir = server_dir.join(server_type.content_dir());
    let mut out = Vec::new();
    if let Ok(read) = std::fs::read_dir(&dir) {
        for entry in read.flatten() {
            let name = entry.file_name().to_string_lossy().to_lowercase();
            if name.ends_with(".jar") {
                out.push(name);
            }
        }
    }
    out
}

/// Apply all performance optimizations for a server based on its RAM budget.
#[tauri::command]
pub async fn optimize_server(app: AppHandle, id: String) -> Result<OptimizeResult, String> {
    let state = app.state::<AppState>();
    let server_dir = state.server_dir(&id);
    let mut cfg = load_server_config(&server_dir)?;
    let tune = tune_for(cfg.ram_mb);

    let mut applied: Vec<String> = Vec::new();
    let mut warnings: Vec<String> = Vec::new();
    let mut mods_installed: Vec<String> = Vec::new();

    // 1. JVM flags
    let flags = if cfg.server_type.is_proxy() {
        velocity_flags()
    } else {
        aikar_flags(cfg.ram_mb)
    };
    cfg.extra_jvm_args = Some(merged_jvm_args(cfg.extra_jvm_args.as_deref(), &flags));
    cfg.optimized = true;
    save_server_config(&server_dir, &cfg)?;
    applied.push("jvm".into());

    // 2. server.properties (not applicable to proxies)
    if !cfg.server_type.is_proxy() {
        set_property_internal(&server_dir, "view-distance", &tune.view_distance.to_string())?;
        set_property_internal(
            &server_dir,
            "simulation-distance",
            &tune.sim_distance.to_string(),
        )?;
        set_property_internal(&server_dir, "network-compression-threshold", "256")?;
        set_property_internal(&server_dir, "sync-chunk-writes", "false")?;
        applied.push("properties".into());
    }

    // 3. YAML configs for Bukkit-family servers (Paper / Purpur / Spigot)
    let is_bukkit = matches!(
        cfg.server_type,
        ServerType::Paper | ServerType::Purpur | ServerType::Spigot
    );
    if is_bukkit {
        let spigot_patch = format!(
            r#"world-settings:
  default:
    mob-spawn-range: {msr}
    entity-activation-range:
      animals: {animals}
      monsters: {monsters}
      raiders: {raiders}
      misc: {misc}
      water: {water}
      villagers: {villagers}
    merge-radius:
      item: {mi}
      exp: {me}
"#,
            msr = tune.mob_spawn_range,
            animals = tune.ear_animals,
            monsters = tune.ear_monsters,
            raiders = tune.ear_raiders,
            misc = tune.ear_misc,
            water = tune.ear_water,
            villagers = tune.ear_villagers,
            mi = tune.merge_item,
            me = tune.merge_exp,
        );
        apply_yaml_patch(&server_dir.join("spigot.yml"), &spigot_patch)?;
        applied.push("spigot".into());

        let bukkit_patch = format!(
            r#"spawn-limits:
  monsters: {monsters}
  animals: {animals}
  water-animals: {water}
  water-ambient: {water_ambient}
  ambient: {ambient}
ticks-per:
  monster-spawns: {tms}
"#,
            monsters = tune.spawn_monsters,
            animals = tune.spawn_animals,
            water = tune.spawn_water,
            water_ambient = tune.spawn_water_ambient,
            ambient = tune.spawn_ambient,
            tms = tune.ticks_monster_spawns,
        );
        apply_yaml_patch(&server_dir.join("bukkit.yml"), &bukkit_patch)?;
        applied.push("bukkit".into());
    }

    // Paper-specific configs (Paper and Purpur)
    let is_paper_like = matches!(cfg.server_type, ServerType::Paper | ServerType::Purpur);
    if is_paper_like {
        if mc_minor(&cfg.mc_version) >= 19 {
            // Modern layout: config/paper-world-defaults.yml
            let paper_patch = format!(
                r#"chunks:
  max-auto-save-chunks-per-tick: {autosave}
environment:
  optimize-explosions: true
hopper:
  disable-move-event: true
  ignore-occluding-blocks: true
collisions:
  max-entity-collisions: {collisions}
misc:
  redstone-implementation: ALTERNATE_CURRENT
tick-rates:
  grass-spread: {grass}
  mob-spawner: {spawner}
entities:
  spawning:
    despawn-ranges:
      monster:
        hard: {hard}
        soft: {soft}
{alt}"#,
                autosave = tune.max_autosave_chunks,
                collisions = tune.max_entity_collisions,
                grass = tune.grass_spread,
                spawner = tune.mob_spawner_rate,
                hard = tune.despawn_hard,
                soft = tune.despawn_soft,
                alt = alt_item_despawn_yaml(tune.alt_item_despawn, "    "),
            );
            apply_yaml_patch(
                &server_dir.join("config").join("paper-world-defaults.yml"),
                &paper_patch,
            )?;
        } else {
            // Legacy layout: paper.yml with world-settings.default prefix.
            // despawn-ranges is written both flat (<=1.16.1) and per-category (1.16.2+);
            // each version reads its own shape and ignores the other.
            let paper_patch = format!(
                r#"world-settings:
  default:
    max-auto-save-chunks-per-tick: {autosave}
    optimize-explosions: true
    grass-spread-tick-rate: {grass}
    mob-spawner-tick-rate: {spawner}
    max-entity-collisions: {collisions}
    hopper:
      disable-move-event: true
      ignore-occluding-blocks: true
    despawn-ranges:
      soft: {soft}
      hard: {hard}
      monster:
        soft: {soft}
        hard: {hard}
{alt}"#,
                autosave = tune.max_autosave_chunks,
                grass = tune.grass_spread,
                spawner = tune.mob_spawner_rate,
                collisions = tune.max_entity_collisions,
                soft = tune.despawn_soft,
                hard = tune.despawn_hard,
                alt = alt_item_despawn_yaml(tune.alt_item_despawn, "    "),
            );
            apply_yaml_patch(&server_dir.join("paper.yml"), &paper_patch)?;
        }
        applied.push("paper".into());
    }

    // Purpur: alternate keepalive stops laggy/high-ping players being kicked
    if cfg.server_type == ServerType::Purpur {
        apply_yaml_patch(
            &server_dir.join("purpur.yml"),
            "settings:\n  use-alternate-keepalive: true\n",
        )?;
        applied.push("purpur".into());
    }

    // 4. Performance mods for modded servers (best effort)
    if cfg.server_type.is_modded() {
        let mods: &[(&str, &str, &str)] = match cfg.server_type {
            ServerType::Fabric | ServerType::Quilt => &[
                ("Lithium", "gvQqBUqZ", "lithium"),
                ("FerriteCore", "uXXizFIs", "ferritecore"),
                ("Krypton", "fQEb0iXm", "krypton"),
                ("C2ME", "VSNURh3q", "c2me"),
            ],
            _ => &[
                ("FerriteCore", "uXXizFIs", "ferritecore"),
                ("ModernFix", "nmDcB62a", "modernfix"),
            ],
        };
        let existing = installed_jars(&server_dir, &cfg.server_type);
        for (name, project_id, marker) in mods {
            if existing.iter().any(|j| j.contains(marker)) {
                continue;
            }
            match crate::commands::content::install_content(
                app.clone(),
                id.clone(),
                project_id.to_string(),
            )
            .await
            {
                Ok(_) => mods_installed.push(name.to_string()),
                Err(e) => warnings.push(format!("{name}: {e}")),
            }
        }
        if !mods_installed.is_empty() {
            applied.push("mods".into());
        }
    }

    Ok(OptimizeResult {
        applied,
        mods_installed,
        warnings,
        needs_restart: is_running(&app, &id).await,
    })
}

#[tauri::command]
pub async fn get_perf_status(app: AppHandle, id: String) -> Result<PerfStatus, String> {
    let state = app.state::<AppState>();
    let server_dir = state.server_dir(&id);
    let cfg = load_server_config(&server_dir)?;
    let pregen_supported =
        !cfg.server_type.is_proxy() && cfg.server_type != ServerType::Vanilla;
    let pregen_installed = pregen_supported
        && installed_jars(&server_dir, &cfg.server_type)
            .iter()
            .any(|j| j.contains("chunky"));
    Ok(PerfStatus {
        optimized: cfg.optimized,
        pregen_installed,
        pregen_supported,
        ram_tier: ram_tier(cfg.ram_mb).to_string(),
    })
}

/// Install the Chunky pregeneration plugin/mod from Modrinth.
#[tauri::command]
pub async fn install_pregen_tool(app: AppHandle, id: String) -> Result<String, String> {
    let state = app.state::<AppState>();
    let cfg = load_server_config(&state.server_dir(&id))?;
    if cfg.server_type.is_proxy() || cfg.server_type == ServerType::Vanilla {
        return Err("Pregeneration requires a plugin- or mod-capable server".into());
    }
    crate::commands::content::install_content(app, id, CHUNKY_SLUG.to_string()).await
}

/// Start pregenerating the map out to `radius` blocks around 0,0.
#[tauri::command]
pub async fn start_pregen(
    app: AppHandle,
    id: String,
    radius: u32,
    set_border: bool,
) -> Result<(), String> {
    if !(64..=1_000_000).contains(&radius) {
        return Err("radius must be between 64 and 1000000 blocks".into());
    }
    if set_border {
        crate::process::send_command(&app, &id, "worldborder center 0 0").await?;
        crate::process::send_command(&app, &id, &format!("worldborder set {}", radius as u64 * 2))
            .await?;
    }
    crate::process::send_command(&app, &id, "chunky shape square").await?;
    crate::process::send_command(&app, &id, "chunky center 0 0").await?;
    crate::process::send_command(&app, &id, &format!("chunky radius {radius}")).await?;
    crate::process::send_command(&app, &id, "chunky start").await
}

/// Control a running pregeneration task: pause | continue | cancel.
#[tauri::command]
pub async fn pregen_action(app: AppHandle, id: String, action: String) -> Result<(), String> {
    match action.as_str() {
        "pause" => crate::process::send_command(&app, &id, "chunky pause").await,
        "continue" => crate::process::send_command(&app, &id, "chunky continue").await,
        "cancel" => {
            crate::process::send_command(&app, &id, "chunky cancel").await?;
            tokio::time::sleep(std::time::Duration::from_millis(400)).await;
            crate::process::send_command(&app, &id, "chunky confirm").await
        }
        _ => Err("unknown action".into()),
    }
}
