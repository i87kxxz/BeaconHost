import { api, FirewallResult } from "./api";

const PORTS_KEY = "beaconhost-firewall-ports";

export function getConfiguredPorts(): Set<number> {
  try {
    const raw = localStorage.getItem(PORTS_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as number[]);
  } catch {
    return new Set();
  }
}

export function markPortConfigured(port: number) {
  const ports = getConfiguredPorts();
  ports.add(port);
  localStorage.setItem(PORTS_KEY, JSON.stringify([...ports]));
}

export function isPortConfigured(port: number) {
  return getConfiguredPorts().has(port);
}

/** Opens firewall once per port; later calls only verify the rule still applies. */
export async function ensureFirewallPort(
  port: number,
  serverId?: string
): Promise<{ configured: boolean; result?: FirewallResult; error?: string }> {
  try {
    if (serverId) {
      await api.prepareVpsNetwork(serverId);
    }
    const result = await api.openFirewallPort(port);
    markPortConfigured(port);
    return { configured: true, result };
  } catch (e) {
    const msg = String(e);
    if (msg.includes("already exists") || msg.includes("Duplicate")) {
      markPortConfigured(port);
      return { configured: true };
    }
    return { configured: isPortConfigured(port), error: msg };
  }
}

export async function runStartupFirewallSetup() {
  if (isPortConfigured(25565)) return;
  await ensureFirewallPort(25565);
}
