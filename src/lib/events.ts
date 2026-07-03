import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { useEffect } from "react";
import { useServers } from "../store/servers";
import { ServerStatus } from "./api";

export interface InstallProgress {
  serverId?: string;
  stage: string;
  pct: number;
  detail: string;
}

/** Global listeners keeping the servers store in sync. Mount once in App. */
export function useGlobalEvents() {
  const setStatus = useServers((s) => s.setStatus);
  const setPlayers = useServers((s) => s.setPlayers);
  const setInstallState = useServers((s) => s.setInstallState);
  const refresh = useServers((s) => s.refresh);

  useEffect(() => {
    const unsubs: Promise<UnlistenFn>[] = [
      listen<{ id: string; status: ServerStatus }>("server-status", (e) => {
        setStatus(e.payload.id, e.payload.status);
      }),
      listen<{ id: string; players: string[] }>("server-players", (e) => {
        setPlayers(e.payload.id, e.payload.players);
      }),
      listen<{ serverId: string }>("install-done", (e) => {
        setInstallState(e.payload.serverId, "ready");
        refresh();
      }),
      listen<{ serverId: string; error: string }>("install-error", (e) => {
        setInstallState(e.payload.serverId, "broken");
      }),
    ];
    return () => {
      unsubs.forEach((p) => p.then((u) => u()));
    };
  }, []);
}
