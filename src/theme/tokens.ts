export const colors = {
  glow: "#EAFBFF",
  ice: "#B9F1FF",
  light: "#69D8FF",
  cyan: "#2AB8F3",
  medium: "#197CCB",
  dark: "#0D4E8A",
  bg: "#0B1222",
  surface: "#152238",
  edge: "#2F3745",
  white: "#FFFFFF",
  bgMidnight: "#0B1222",
  bgSurface: "rgba(21, 34, 56, 0.55)",
  accentBlue: "#2AB8F3",
  accentBlueGlow: "rgba(42, 184, 243, 0.25)",
  textPrimary: "#FFFFFF",
  textMuted: "#B9F1FF",
} as const;

export type TabColorKey =
  | "console"
  | "mods"
  | "plugins"
  | "files"
  | "players"
  | "performance"
  | "settings"
  | "network"
  | "backups";

export const tabColors: Record<TabColorKey, string> = {
  console: colors.cyan,
  mods: colors.light,
  plugins: colors.medium,
  files: colors.ice,
  players: colors.cyan,
  performance: colors.dark,
  settings: colors.edge,
  network: colors.light,
  backups: colors.medium,
};

export const MODDED_TYPES = ["forge", "neoforge", "fabric", "quilt"];
export const PLUGIN_TYPES = ["paper", "purpur", "spigot", "velocity"];
