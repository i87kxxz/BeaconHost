import { NavLink, Outlet, useOutletContext, useParams, Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import {
  Terminal,
  Puzzle,
  Blocks,
  FolderOpen,
  Users,
  Settings,
  Globe,
  Archive,
  Play,
  Square,
  RotateCcw,
  Gauge,
  Server,
  LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api, ServerSummary } from "../lib/api";
import { useServers } from "../store/servers";
import { Button, Spinner, TabIcon, IconBox } from "../components/ui";
import { StatusBadge } from "../components/StatusBadge";
import { MODDED_TYPES, PLUGIN_TYPES, TabColorKey } from "../theme/tokens";
import ConsolePage from "./server/Console";
import ModsPage from "./server/Mods";
import PluginsPage from "./server/Plugins";
import FilesPage from "./server/Files";
import PlayersPage from "./server/Players";
import SettingsPage from "./server/Settings";
import ServerNetworkPage from "./server/Network";
import BackupsPage from "./server/Backups";
import PerformancePage from "./server/Performance";

type TabDef = {
  path: string;
  icon: LucideIcon;
  key: string;
  colorKey: TabColorKey;
  show?: (server: ServerSummary) => boolean;
};

const allTabs: TabDef[] = [
  { path: "console", icon: Terminal, key: "console", colorKey: "console" },
  {
    path: "mods",
    icon: Blocks,
    key: "mods",
    colorKey: "mods",
    show: (s) => MODDED_TYPES.includes(s.server_type),
  },
  {
    path: "plugins",
    icon: Puzzle,
    key: "plugins",
    colorKey: "plugins",
    show: (s) => PLUGIN_TYPES.includes(s.server_type),
  },
  { path: "files", icon: FolderOpen, key: "files", colorKey: "files" },
  { path: "players", icon: Users, key: "players", colorKey: "players" },
  { path: "performance", icon: Gauge, key: "performance", colorKey: "performance" },
  { path: "settings", icon: Settings, key: "settings", colorKey: "settings" },
  { path: "network", icon: Globe, key: "network", colorKey: "network" },
  { path: "backups", icon: Archive, key: "backups", colorKey: "backups" },
];

/** Visual groups in the tab bar (flattened to single bar in UI) */
const TAB_GROUPS = [
  ["console"],
  ["mods", "plugins"],
  ["files", "players"],
  ["performance", "settings", "network", "backups"],
];

export type ServerOutletContext = { server: ServerSummary };

function makeTab(Component: React.ComponentType<{ server: ServerSummary }>) {
  return function ServerTab() {
    const { server } = useOutletContext<ServerOutletContext>();
    return <Component server={server} />;
  };
}

export const ServerConsoleTab = makeTab(ConsolePage);
export const ServerModsTab = makeTab(ModsPage);
export const ServerPluginsTab = makeTab(PluginsPage);
export const ServerPerformanceTab = makeTab(PerformancePage);
export const ServerFilesTab = makeTab(FilesPage);
export const ServerPlayersTab = makeTab(PlayersPage);
export const ServerSettingsTab = makeTab(SettingsPage);
export const ServerNetworkTab = makeTab(ServerNetworkPage);
export const ServerBackupsTab = makeTab(BackupsPage);

export default function ServerView() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const { servers, loaded, refresh } = useServers();
  const [busy, setBusy] = useState(false);
  const server = servers.find((s) => s.id === id);

  useEffect(() => {
    if (!loaded) refresh();
  }, [loaded, refresh]);

  const visibleTabs = useMemo(
    () => (server ? allTabs.filter((tab) => !tab.show || tab.show(server)) : []),
    [server]
  );

  const tabGroups = useMemo(() => {
    const visiblePaths = new Set(visibleTabs.map((t) => t.path));
    return TAB_GROUPS.map((group) =>
      group
        .filter((path) => visiblePaths.has(path))
        .map((path) => visibleTabs.find((t) => t.path === path)!)
        .filter(Boolean)
    ).filter((g) => g.length > 0);
  }, [visibleTabs]);

  const flatTabs = useMemo(() => tabGroups.flat(), [tabGroups]);

  if (!id) return <Navigate to="/" replace />;

  if (!server && !loaded) {
    return (
      <div className="flex h-full items-center justify-center text-slate-300">
        <Spinner className="me-2" />
        {t("create.loadingVersions")}
      </div>
    );
  }

  if (!server) return <Navigate to="/" replace />;

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      alert(String(e));
    } finally {
      setBusy(false);
      refresh();
    }
  };

  const canStart =
    (server.status === "stopped" || server.status === "crashed") &&
    server.install_state === "ready";
  const isUp = server.status === "running" || server.status === "starting";

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Server header */}
      <div className="shrink-0 border-b border-beacon-edge/30 bg-beacon-bg/55 px-4 py-2.5 backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <IconBox icon={Server} tone="blue" size="sm" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-base font-bold text-white">{server.name}</h1>
                <StatusBadge status={server.status} installState={server.install_state} />
              </div>
              <p className="text-[11px] text-slate-400">
                {server.server_type} · {server.mc_version} · {t("dashboard.port")}{" "}
                {server.port} · {Math.round(server.ram_mb / 1024)} GB RAM
              </p>
            </div>
          </div>

          <div className="glass flex shrink-0 items-center gap-1.5 rounded-full px-1.5 py-1">
            {canStart && (
              <Button
                variant="success"
                disabled={busy}
                className="!p-2"
                title={t("actions.start")}
                onClick={() => act(() => api.startServer(server.id))}
              >
                <Play size={15} strokeWidth={1.75} />
              </Button>
            )}
            {isUp && (
              <>
                <Button
                  variant="danger"
                  disabled={busy}
                  className="!p-2"
                  title={t("actions.stop")}
                  onClick={() => act(() => api.stopServer(server.id))}
                >
                  <Square size={15} strokeWidth={1.75} />
                </Button>
                <Button
                  disabled={busy || server.status !== "running"}
                  className="!p-2"
                  title={t("actions.restart")}
                  onClick={() => act(() => api.restartServer(server.id))}
                >
                  <RotateCcw size={15} strokeWidth={1.75} />
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Tab bar */}
        <div className="tab-scroll mt-2.5 overflow-x-auto">
          <div className="glass inline-flex gap-0.5 rounded-full p-1">
            {flatTabs.map((tab) => (
              <NavLink key={tab.path} to={`/server/${id}/${tab.path}`} className="relative">
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <motion.span
                        layoutId="server-tab-pill"
                        className="absolute inset-0 rounded-full bg-beacon-cyan/20"
                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                      />
                    )}
                    <span
                      className={`relative flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                        isActive ? "text-white" : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      <TabIcon
                        icon={tab.icon}
                        colorKey={tab.colorKey}
                        size={14}
                        active={isActive}
                      />
                      {t(`tabs.${tab.key}`)}
                    </span>
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </div>
      </div>

      {/* Page content */}
      <div className="min-h-0 flex-1 overflow-hidden bg-beacon-bg/20">
        <Outlet context={{ server } satisfies ServerOutletContext} />
      </div>
    </div>
  );
}
