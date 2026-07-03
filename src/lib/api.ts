import { invoke } from "@tauri-apps/api/core";

export type ServerType =
  | "vanilla"
  | "paper"
  | "purpur"
  | "spigot"
  | "forge"
  | "neoforge"
  | "fabric"
  | "quilt"
  | "velocity";

export type ServerStatus = "stopped" | "starting" | "running" | "stopping" | "crashed";

export interface ServerSummary {
  id: string;
  name: string;
  server_type: ServerType;
  mc_version: string;
  loader_version: string | null;
  ram_mb: number;
  port: number;
  java_path: string | null;
  auto_restart: boolean;
  backup_interval_hours: number;
  last_backup: number | null;
  extra_jvm_args: string | null;
  optimized: boolean;
  install_state: "installing" | "ready" | "broken";
  created_at: number;
  status: ServerStatus;
  online_players: string[];
  dir: string;
}

export interface ContentItem {
  id: string;
  slug: string;
  title: string;
  description: string;
  icon_url: string | null;
  downloads: number;
  source: string;
}

export interface ContentSearchResult {
  items: ContentItem[];
  total: number;
  offset: number;
  limit: number;
}

export interface InstalledContent {
  file_name: string;
  size: number;
  enabled: boolean;
}

export interface FileEntry {
  name: string;
  is_dir: boolean;
  size: number;
  modified: number | null;
}

export interface PlayerLists {
  whitelist: string[];
  ops: string[];
  banned: string[];
  online: string[];
  whitelist_enabled: boolean;
}

export interface NetworkInfo {
  public_ip: string | null;
  local_ip: string | null;
  host_os: string;
}

export interface FirewallResult {
  success: boolean;
  os: string;
  command: string;
  output: string;
  message: string;
}

export interface PortStatus {
  listening: boolean;
  details: string;
}

export interface BackupInfo {
  file_name: string;
  size: number;
  created: number;
}

export interface OptimizeResult {
  applied: string[];
  mods_installed: string[];
  warnings: string[];
  needs_restart: boolean;
}

export interface PerfStatus {
  optimized: boolean;
  pregen_installed: boolean;
  pregen_supported: boolean;
  ram_tier: "low" | "mid" | "high";
}

export interface PregenProgress {
  serverId: string;
  state: "running" | "paused" | "done" | "cancelled";
  world: string;
  chunks: number | null;
  pct: number | null;
  eta: string | null;
  rate: number | null;
}

export const api = {
  // servers
  listServers: () => invoke<ServerSummary[]>("list_servers"),
  createServer: (args: {
    name: string;
    serverType: ServerType;
    mcVersion: string;
    ramMb: number;
    port: number;
  }) => invoke<ServerSummary>("create_server", args),
  retryInstall: (id: string) => invoke<void>("retry_install", { id }),
  deleteServer: (id: string) => invoke<void>("delete_server", { id }),
  startServer: (id: string) => invoke<void>("start_server", { id }),
  stopServer: (id: string) => invoke<void>("stop_server", { id }),
  restartServer: (id: string) => invoke<void>("restart_server", { id }),
  sendCommand: (id: string, command: string) =>
    invoke<void>("send_command", { id, command }),
  getLogs: (id: string) => invoke<string[]>("get_logs", { id }),
  updateServerConfig: (args: {
    id: string;
    name?: string;
    ramMb?: number;
    port?: number;
    autoRestart?: boolean;
    backupIntervalHours?: number;
    extraJvmArgs?: string;
  }) => invoke<ServerSummary>("update_server_config", args),
  getSystemRam: () => invoke<number>("get_system_ram"),

  // versions
  listMcVersions: (serverType: ServerType) =>
    invoke<string[]>("list_mc_versions", { serverType }),

  // properties
  getProperties: (id: string) =>
    invoke<Record<string, string>>("get_properties", { id }),
  setProperties: (id: string, entries: Record<string, string>) =>
    invoke<void>("set_properties", { id, entries }),

  // files
  listFiles: (id: string, relPath: string) =>
    invoke<FileEntry[]>("list_files", { id, relPath }),
  readFile: (id: string, relPath: string) =>
    invoke<string>("read_file", { id, relPath }),
  writeFile: (id: string, relPath: string, content: string) =>
    invoke<void>("write_file", { id, relPath, content }),
  deletePath: (id: string, relPath: string) =>
    invoke<void>("delete_path", { id, relPath }),
  renamePath: (id: string, relPath: string, newName: string) =>
    invoke<void>("rename_path", { id, relPath, newName }),
  createFolder: (id: string, relPath: string) =>
    invoke<void>("create_folder", { id, relPath }),
  importFile: (id: string, sourcePath: string, destRelDir: string) =>
    invoke<void>("import_file", { id, sourcePath, destRelDir }),
  saveTextFile: (path: string, content: string) =>
    invoke<void>("save_text_file", { path, content }),
  openServerFolder: (id: string) => invoke<void>("open_server_folder", { id }),

  // content
  searchContent: (id: string, query: string, offset = 0) =>
    invoke<ContentSearchResult>("search_content", { id, query, offset }),
  installContent: (id: string, projectId: string) =>
    invoke<string>("install_content", { id, projectId }),
  listInstalledContent: (id: string) =>
    invoke<InstalledContent[]>("list_installed_content", { id }),
  toggleContent: (id: string, fileName: string) =>
    invoke<void>("toggle_content", { id, fileName }),
  removeContent: (id: string, fileName: string) =>
    invoke<void>("remove_content", { id, fileName }),
  installContentFromUrl: (id: string, url: string) =>
    invoke<string>("install_content_from_url", { id, url }),
  installContentFromFile: (id: string, sourcePath: string) =>
    invoke<string>("install_content_from_file", { id, sourcePath }),

  // players
  getPlayers: (id: string) => invoke<PlayerLists>("get_players", { id }),
  playerAction: (id: string, action: string, player: string) =>
    invoke<void>("player_action", { id, action, player }),

  // network
  getNetworkInfo: () => invoke<NetworkInfo>("get_network_info"),
  setOnlineMode: (id: string, online: boolean) =>
    invoke<void>("set_online_mode", { id, online }),
  openFirewallPort: (port: number) =>
    invoke<FirewallResult>("open_firewall_port", { port }),
  checkPortStatus: (port: number) =>
    invoke<PortStatus>("check_port_status", { port }),
  getFirewallCommands: (port: number) =>
    invoke<string[]>("get_firewall_commands", { port }),
  prepareVpsNetwork: (id: string) =>
    invoke<void>("prepare_vps_network", { id }),

  // performance
  optimizeServer: (id: string) => invoke<OptimizeResult>("optimize_server", { id }),
  getPerfStatus: (id: string) => invoke<PerfStatus>("get_perf_status", { id }),
  installPregenTool: (id: string) => invoke<string>("install_pregen_tool", { id }),
  startPregen: (id: string, radius: number, setBorder: boolean) =>
    invoke<void>("start_pregen", { id, radius, setBorder }),
  pregenAction: (id: string, action: "pause" | "continue" | "cancel") =>
    invoke<void>("pregen_action", { id, action }),

  // backups
  listBackups: (id: string) => invoke<BackupInfo[]>("list_backups", { id }),
  createBackup: (id: string) => invoke<string>("create_backup", { id }),
  deleteBackup: (id: string, fileName: string) =>
    invoke<void>("delete_backup", { id, fileName }),
};

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export const SERVER_TYPES: { value: ServerType; label: string; kind: "plugin" | "mod" | "vanilla" | "proxy" }[] = [
  { value: "paper", label: "Paper", kind: "plugin" },
  { value: "purpur", label: "Purpur", kind: "plugin" },
  { value: "spigot", label: "Spigot", kind: "plugin" },
  { value: "vanilla", label: "Vanilla", kind: "vanilla" },
  { value: "forge", label: "Forge", kind: "mod" },
  { value: "neoforge", label: "NeoForge", kind: "mod" },
  { value: "fabric", label: "Fabric", kind: "mod" },
  { value: "quilt", label: "Quilt", kind: "mod" },
  { value: "velocity", label: "Velocity (Proxy)", kind: "proxy" },
];
