import { create } from "zustand";
import { api, ServerSummary, ServerStatus } from "../lib/api";

interface ServersState {
  servers: ServerSummary[];
  loaded: boolean;
  refresh: () => Promise<void>;
  setStatus: (id: string, status: ServerStatus) => void;
  setPlayers: (id: string, players: string[]) => void;
  setInstallState: (id: string, state: ServerSummary["install_state"]) => void;
}

export const useServers = create<ServersState>((set) => ({
  servers: [],
  loaded: false,
  refresh: async () => {
    const servers = await api.listServers();
    set({ servers, loaded: true });
  },
  setStatus: (id, status) =>
    set((s) => ({
      servers: s.servers.map((sv) => (sv.id === id ? { ...sv, status } : sv)),
    })),
  setPlayers: (id, players) =>
    set((s) => ({
      servers: s.servers.map((sv) =>
        sv.id === id ? { ...sv, online_players: players } : sv
      ),
    })),
  setInstallState: (id, install_state) =>
    set((s) => ({
      servers: s.servers.map((sv) =>
        sv.id === id ? { ...sv, install_state } : sv
      ),
    })),
}));
