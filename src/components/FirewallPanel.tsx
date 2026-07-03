import { useEffect, useState } from "react";

import { useTranslation } from "react-i18next";

import { useQuery } from "@tanstack/react-query";

import { Shield, Terminal, Check, AlertCircle, RefreshCw } from "lucide-react";

import { api, FirewallResult } from "../lib/api";

import {

  ensureFirewallPort,

  isPortConfigured,

} from "../lib/firewallSetup";

import { Button, Spinner, PageSection, StatusPill, Tip } from "./ui";



export function FirewallPanel({

  port,

  serverId,

}: {

  port: number;

  serverId?: string;

}) {

  const { t } = useTranslation();

  const [busy, setBusy] = useState(false);

  const [autoBusy, setAutoBusy] = useState(false);

  const [configured, setConfigured] = useState(() => isPortConfigured(port));

  const [result, setResult] = useState<FirewallResult | null>(null);

  const [error, setError] = useState("");



  const { data: net } = useQuery({

    queryKey: ["network-info"],

    queryFn: api.getNetworkInfo,

    staleTime: 60_000,

  });



  const { data: portStatus, refetch: refetchPort } = useQuery({

    queryKey: ["port-status", port],

    queryFn: () => api.checkPortStatus(port),

    refetchInterval: 10_000,

  });



  const { data: commands } = useQuery({

    queryKey: ["firewall-commands", port],

    queryFn: () => api.getFirewallCommands(port),

    staleTime: Infinity,

  });



  const os = net?.host_os ?? "unknown";



  const runSetup = async (manual = false) => {

    if (manual) setBusy(true);

    else setAutoBusy(true);

    setError("");

    setResult(null);

    try {

      const res = await ensureFirewallPort(port, serverId);

      setConfigured(res.configured);

      if (res.result) setResult(res.result);

      refetchPort();

    } catch (e) {

      setError(String(e));

    } finally {

      setBusy(false);

      setAutoBusy(false);

    }

  };



  useEffect(() => {

    if (!isPortConfigured(port)) {

      runSetup(false);

    }

  }, [port, serverId]);



  return (

    <PageSection

      title={t("network.firewallTitle")}

      tip={t("network.firewallTip", { os, port })}

      icon={<Shield size={17} className="text-beacon-cyan" />}

      badge={

        <div className="flex flex-wrap items-center gap-2">

          <StatusPill tone={configured ? "success" : "info"}>

            {configured ? (

              <>

                <Check size={11} />

                {t("network.firewallConfigured")}

              </>

            ) : autoBusy ? (

              <>

                <Spinner className="!h-3 !w-3" />

                {t("network.firewallSettingUp")}

              </>

            ) : (

              t("network.firewallPending")

            )}

          </StatusPill>

          <StatusPill tone={portStatus?.listening ? "success" : "neutral"}>

            {portStatus?.listening

              ? t("network.portListening")

              : t("network.portNotListening")}

          </StatusPill>

          <Tip text={t("network.providerFirewallTip")} />

        </div>

      }

      actions={

        <Button

          className="!px-3 !py-1.5 text-xs"

          disabled={busy || autoBusy}

          onClick={() => runSetup(true)}

        >

          {busy ? <Spinner className="!h-3.5 !w-3.5" /> : <RefreshCw size={13} />}

          {configured ? t("network.verifyFirewall") : t("network.openPort", { port })}

        </Button>

      }

      collapsible

      defaultOpen

    >

      <div className="flex flex-col gap-4">

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">

          <div className="rounded-xl border border-beacon-edge/30 bg-beacon-bg/30 px-4 py-3">

            <p className="text-[10px] font-semibold uppercase tracking-wider text-beacon-ice/40">

              {t("network.firewallOs")}

            </p>

            <p className="mt-1 font-mono text-sm capitalize text-white">{os}</p>

          </div>

          <div className="rounded-xl border border-beacon-edge/30 bg-beacon-bg/30 px-4 py-3">

            <p className="text-[10px] font-semibold uppercase tracking-wider text-beacon-ice/40">

              {t("network.firewallPort")}

            </p>

            <p className="mt-1 font-mono text-sm text-beacon-light" dir="ltr">

              {port}

            </p>

          </div>

          <div className="rounded-xl border border-beacon-edge/30 bg-beacon-bg/30 px-4 py-3">

            <p className="text-[10px] font-semibold uppercase tracking-wider text-beacon-ice/40">

              {t("network.firewallMode")}

            </p>

            <p className="mt-1 text-sm text-white">

              {configured ? t("network.firewallModeVerify") : t("network.firewallModeSetup")}

            </p>

          </div>

        </div>



        <div className="rounded-xl border border-beacon-edge/25 bg-black/25 p-3 font-mono text-[11px] text-beacon-ice/55" dir="ltr">

          <div className="mb-2 flex items-center gap-1.5 text-beacon-ice/40">

            <Terminal size={12} />

            {t("network.commandsFor", { os })}

          </div>

          {(commands ?? []).map((cmd, i) => (

            <pre key={i} className="whitespace-pre-wrap break-all">

              {cmd}

            </pre>

          ))}

        </div>



        {result?.success && (

          <div className="flex items-start gap-2 rounded-xl border border-emerald-400/20 bg-emerald-500/8 p-3 text-sm text-emerald-100">

            <Check size={16} className="mt-0.5 shrink-0" />

            <div>

              <p>{result.message}</p>

              {result.output && (

                <pre className="mt-2 max-h-24 overflow-auto text-[10px] text-emerald-200/60" dir="ltr">

                  {result.output}

                </pre>

              )}

            </div>

          </div>

        )}



        {error && (

          <div className="flex items-start gap-2 rounded-xl border border-red-400/20 bg-red-500/8 p-3 text-sm text-red-200">

            <AlertCircle size={16} className="mt-0.5 shrink-0" />

            <pre className="whitespace-pre-wrap text-xs" dir="ltr">

              {error}

            </pre>

          </div>

        )}

      </div>

    </PageSection>

  );

}

