import { useEffect, useState } from "react";

import { Routes, Route, Navigate } from "react-router-dom";

import { useServers } from "./store/servers";

import { useGlobalEvents } from "./lib/events";

import AnimatedBackground from "./components/AnimatedBackground";

import SplashScreen from "./components/SplashScreen";

import Sidebar, { getSidebarCollapsed, setSidebarCollapsed } from "./components/Sidebar";

import Dashboard from "./pages/Dashboard";

import ServerView, {

  ServerBackupsTab,

  ServerConsoleTab,

  ServerFilesTab,

  ServerModsTab,

  ServerNetworkTab,

  ServerPerformanceTab,

  ServerPlayersTab,

  ServerPluginsTab,

  ServerSettingsTab,

} from "./pages/ServerView";

import TitleBar from "./components/TitleBar";
import NetworkPage from "./pages/Network";
import { runStartupFirewallSetup } from "./lib/firewallSetup";



export default function App() {

  const { servers, refresh } = useServers();

  const [splashDone, setSplashDone] = useState(false);

  const [sidebarCollapsed, setCollapsed] = useState(getSidebarCollapsed);

  useGlobalEvents();



  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (!splashDone) return;
    runStartupFirewallSetup().catch(() => {});
  }, [splashDone]);



  const toggleSidebar = () => {

    setCollapsed((c) => {

      const next = !c;

      setSidebarCollapsed(next);

      return next;

    });

  };



  if (!splashDone) {

    return <SplashScreen onDone={() => setSplashDone(true)} />;

  }



  return (

    <div className="flex h-screen">

      <AnimatedBackground />



      <Sidebar

        servers={servers}

        collapsed={sidebarCollapsed}

        onToggle={toggleSidebar}

      />



      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <TitleBar />

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">

        <Routes>

          <Route path="/" element={<Dashboard />} />

          <Route path="/network" element={<NetworkPage />} />

          <Route path="/server/:id" element={<ServerView />}>

            <Route index element={<Navigate to="console" replace />} />

            <Route path="console" element={<ServerConsoleTab />} />

            <Route path="mods" element={<ServerModsTab />} />

            <Route path="plugins" element={<ServerPluginsTab />} />

            <Route path="files" element={<ServerFilesTab />} />

            <Route path="players" element={<ServerPlayersTab />} />

            <Route path="performance" element={<ServerPerformanceTab />} />

            <Route path="settings" element={<ServerSettingsTab />} />

            <Route path="network" element={<ServerNetworkTab />} />

            <Route path="backups" element={<ServerBackupsTab />} />

            {/* Legacy redirect */}

            <Route path="content" element={<Navigate to="../mods" replace />} />

          </Route>

        </Routes>
        </div>
      </main>

    </div>

  );

}

