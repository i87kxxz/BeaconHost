import { useEffect, useMemo, useState } from "react";

import { useTranslation } from "react-i18next";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { listen } from "@tauri-apps/api/event";

import {

  Zap,

  Map,

  Check,

  AlertTriangle,

  Play,

  Pause,

  X,

  RotateCcw,

  Download,

} from "lucide-react";

import {

  api,

  OptimizeResult,

  PregenProgress,

  ServerSummary,

} from "../../lib/api";

import {

  Button,

  Toggle,

  Spinner,

  PageLayout,

  ScrollArea,

  SubTabs,

  PageSection,

  NumericUpDown,

  StatusPill,

} from "../../components/ui";

import { useServers } from "../../store/servers";



const RADIUS_PRESETS = [1000, 2000, 5000];

type PerfTab = "optimize" | "pregen";



export default function PerformancePage({ server }: { server: ServerSummary }) {

  const { t } = useTranslation();

  const qc = useQueryClient();

  const refreshServers = useServers((s) => s.refresh);

  const [tab, setTab] = useState<PerfTab>("optimize");



  const [optimizing, setOptimizing] = useState(false);

  const [result, setResult] = useState<OptimizeResult | null>(null);

  const [installingChunky, setInstallingChunky] = useState(false);

  const [chunkyJustInstalled, setChunkyJustInstalled] = useState(false);

  const [radius, setRadius] = useState(2000);

  const [setBorder, setSetBorder] = useState(true);

  const [progress, setProgress] = useState<PregenProgress | null>(null);

  const [pregenBusy, setPregenBusy] = useState(false);



  const isRunning = server.status === "running";

  const isVanilla = server.server_type === "vanilla";

  const isProxy = server.server_type === "velocity";

  const isModded = ["forge", "neoforge", "fabric", "quilt"].includes(server.server_type);

  const isBukkit = ["paper", "purpur", "spigot"].includes(server.server_type);



  const { data: status } = useQuery({

    queryKey: ["perf", server.id],

    queryFn: () => api.getPerfStatus(server.id),

  });



  useEffect(() => {

    const unlisten = listen<PregenProgress>("pregen-progress", (e) => {

      if (e.payload.serverId !== server.id) return;

      if (e.payload.state === "cancelled") {

        setProgress(null);

      } else {

        setProgress((prev) => ({

          ...e.payload,

          pct: e.payload.pct ?? prev?.pct ?? null,

          chunks: e.payload.chunks ?? prev?.chunks ?? null,

          eta: e.payload.state === "running" ? e.payload.eta : null,

          rate: e.payload.state === "running" ? e.payload.rate : null,

        }));

      }

    });

    return () => {

      unlisten.then((u) => u());

    };

  }, [server.id]);



  const estChunks = useMemo(

    () => Math.round(Math.pow((radius * 2) / 16, 2)),

    [radius]

  );



  const optimize = async () => {

    setOptimizing(true);

    setResult(null);

    try {

      const r = await api.optimizeServer(server.id);

      setResult(r);

      qc.invalidateQueries({ queryKey: ["perf", server.id] });

      qc.invalidateQueries({ queryKey: ["properties", server.id] });

      refreshServers();

    } catch (e) {

      alert(String(e));

    } finally {

      setOptimizing(false);

    }

  };



  const installChunky = async () => {

    setInstallingChunky(true);

    try {

      await api.installPregenTool(server.id);

      setChunkyJustInstalled(true);

      qc.invalidateQueries({ queryKey: ["perf", server.id] });

    } catch (e) {

      alert(String(e));

    } finally {

      setInstallingChunky(false);

    }

  };



  const startPregen = async () => {

    if (!radius) return;

    setPregenBusy(true);

    try {

      await api.startPregen(server.id, radius, setBorder);

    } catch (e) {

      alert(String(e));

    } finally {

      setPregenBusy(false);

    }

  };



  const doPregenAction = async (action: "pause" | "continue" | "cancel") => {

    setPregenBusy(true);

    try {

      await api.pregenAction(server.id, action);

      if (action === "cancel") setProgress(null);

    } catch (e) {

      alert(String(e));

    } finally {

      setPregenBusy(false);

    }

  };



  const willApply: string[] = [

    t("perf.will.jvm"),

    ...(!isProxy ? [t("perf.will.properties")] : []),

    ...(isBukkit ? [t("perf.will.yaml")] : []),

    ...(isModded ? [t("perf.will.mods")] : []),

  ];



  const pregenActive = progress?.state === "running";

  const pregenPaused = progress?.state === "paused";

  const pregenDone = progress?.state === "done";



  const tabs = [

    { id: "optimize" as const, label: t("perf.optimizeTitle"), icon: <Zap size={15} /> },

    { id: "pregen" as const, label: t("perf.pregenTitle"), icon: <Map size={15} /> },

  ];



  return (

    <PageLayout>

      <SubTabs tabs={tabs} active={tab} onChange={setTab} className="shrink-0" />



      <ScrollArea>

        <div className="mx-auto max-w-3xl pb-4">

          {tab === "optimize" && (

            <PageSection

              title={t("perf.optimizeTitle")}

              tip={t("perf.optimizeTip")}

              icon={<Zap size={17} className="text-beacon-cyan" />}

              badge={

                (status?.optimized || server.optimized) && (

                  <StatusPill tone="success">

                    <Check size={11} />

                    {t("perf.optimizedBadge")}

                  </StatusPill>

                )

              }

            >

              <div className="flex flex-col gap-5">

                <div className="rounded-xl border border-beacon-edge/25 bg-beacon-bg/25 p-4">

                  <p className="mb-3 text-xs font-medium text-beacon-ice/50">

                    {t("perf.ramTier", {

                      ram: (server.ram_mb / 1024).toFixed(1),

                      tier: t(`perf.tier.${status?.ram_tier ?? "mid"}`),

                    })}

                  </p>

                  <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">

                    {willApply.map((item) => (

                      <li

                        key={item}

                        className="flex items-start gap-2 rounded-lg border border-beacon-edge/15 bg-beacon-bg/20 px-3 py-2 text-sm text-beacon-ice/80"

                      >

                        <Check size={14} className="mt-0.5 shrink-0 text-beacon-cyan" />

                        {item}

                      </li>

                    ))}

                  </ul>

                </div>



                {isVanilla && (

                  <div className="flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-500/8 px-4 py-3 text-xs text-amber-100">

                    <AlertTriangle size={15} className="mt-0.5 shrink-0" />

                    {t("perf.vanillaHint")}

                  </div>

                )}



                <Button variant="primary" disabled={optimizing} onClick={optimize} className="self-start">

                  {optimizing ? <Spinner /> : <Zap size={15} />}

                  {optimizing

                    ? t("perf.optimizing")

                    : status?.optimized || server.optimized

                      ? t("perf.reapply")

                      : t("perf.optimizeNow")}

                </Button>



                {result && (

                  <div className="flex flex-col gap-2 rounded-xl border border-emerald-400/20 bg-emerald-500/8 p-4">

                    <p className="flex items-center gap-2 text-sm font-medium text-emerald-100">

                      <Check size={15} />

                      {t("perf.doneTitle")}

                    </p>

                    <ul className="flex flex-col gap-1">

                      {result.applied.map((key) => (

                        <li

                          key={key}

                          className="flex items-start gap-2 text-xs text-emerald-200/80"

                        >

                          <Check size={12} className="mt-0.5 shrink-0" />

                          {t(`perf.applied.${key}`)}

                        </li>

                      ))}

                    </ul>

                    {result.needs_restart && (

                      <div className="mt-1 flex items-center justify-between gap-3 rounded-lg border border-emerald-400/15 bg-emerald-500/10 p-3">

                        <span className="text-xs text-emerald-100">{t("perf.needsRestart")}</span>

                        <Button

                          className="shrink-0 !px-3 !py-1.5 text-xs"

                          onClick={() =>

                            api.restartServer(server.id).catch((e) => alert(String(e)))

                          }

                        >

                          <RotateCcw size={13} />

                          {t("perf.restartNow")}

                        </Button>

                      </div>

                    )}

                  </div>

                )}

              </div>

            </PageSection>

          )}



          {tab === "pregen" && (

            <PageSection

              title={t("perf.pregenTitle")}

              tip={t("perf.pregenTip")}

              icon={<Map size={17} className="text-beacon-light" />}

            >

              {!status ? (

                <div className="flex items-center gap-2 text-sm text-beacon-ice/50">

                  <Spinner />

                  {t("common.loading")}

                </div>

              ) : !status.pregen_supported ? (

                <div className="flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-500/8 px-4 py-3 text-xs text-amber-100">

                  <AlertTriangle size={15} className="mt-0.5 shrink-0" />

                  {t("perf.pregenUnsupported")}

                </div>

              ) : !status.pregen_installed ? (

                <Button

                  variant="primary"

                  disabled={installingChunky}

                  onClick={installChunky}

                  className="self-start"

                >

                  {installingChunky ? <Spinner /> : <Download size={15} />}

                  {installingChunky ? t("perf.installing") : t("perf.installChunky")}

                </Button>

              ) : (

                <div className="flex flex-col gap-5">

                  <StatusPill tone="success">

                    <Check size={11} />

                    {t("perf.chunkyInstalled")}

                  </StatusPill>



                  {chunkyJustInstalled && isRunning && (

                    <div className="flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-500/8 px-4 py-3 text-xs text-amber-100">

                      <AlertTriangle size={15} className="mt-0.5 shrink-0" />

                      {t("perf.chunkyRestart")}

                    </div>

                  )}



                  <div>

                    <p className="mb-2 text-sm font-medium text-beacon-ice/70">

                      {t("perf.radius")}

                    </p>

                    <div className="flex flex-wrap gap-2">

                      {RADIUS_PRESETS.map((r) => (

                        <button

                          key={r}

                          type="button"

                          onClick={() => setRadius(r)}

                          className={`rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${

                            radius === r

                              ? "border-beacon-cyan/40 bg-beacon-cyan/15 text-white"

                              : "border-beacon-edge/25 bg-beacon-bg/20 text-beacon-ice/50 hover:text-white"

                          }`}

                        >

                          {r.toLocaleString()}

                        </button>

                      ))}

                    </div>

                    <div className="mt-3">

                      <NumericUpDown

                        value={radius}

                        onChange={setRadius}

                        min={100}

                        max={50000}

                        step={100}

                        suffix={t("common.blocks")}

                      />

                      <p className="mt-1.5 text-xs text-beacon-ice/40">

                        {t("perf.estChunks", { n: estChunks.toLocaleString() })}

                      </p>

                    </div>

                  </div>



                  <div className="flex items-center justify-between rounded-xl border border-beacon-edge/25 bg-beacon-bg/25 px-4 py-3">

                    <span className="text-sm text-beacon-ice/70">{t("perf.setBorder")}</span>

                    <Toggle checked={setBorder} onChange={setSetBorder} />

                  </div>



                  {!isRunning && (

                    <p className="text-xs text-amber-200/80">{t("perf.needRunning")}</p>

                  )}



                  {!pregenActive && !pregenPaused && (

                    <Button

                      variant="primary"

                      disabled={!isRunning || pregenBusy || !radius}

                      onClick={startPregen}

                      className="self-start"

                    >

                      {pregenBusy ? <Spinner /> : <Play size={15} />}

                      {t("perf.startPregen")}

                    </Button>

                  )}



                  {progress && !pregenDone && (

                    <div className="flex flex-col gap-3 rounded-xl border border-beacon-edge/25 bg-beacon-bg/25 p-4">

                      <div className="flex items-center justify-between text-xs text-beacon-ice/70">

                        <span>

                          {pregenPaused

                            ? t("perf.paused")

                            : t("perf.world", { world: progress.world })}

                        </span>

                        <span className="font-semibold text-white">

                          {(progress.pct ?? 0).toFixed(1)}%

                        </span>

                      </div>

                      <div className="h-2 overflow-hidden rounded-full bg-beacon-edge/30">

                        <div

                          className="h-full rounded-full bg-beacon-cyan transition-all"

                          style={{ width: `${Math.max(1, progress.pct ?? 0)}%` }}

                        />

                      </div>

                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-beacon-ice/45" dir="ltr">

                        {progress.chunks != null && (

                          <span>{t("perf.chunksDone", { n: progress.chunks.toLocaleString() })}</span>

                        )}

                        {progress.eta && <span>{t("perf.eta", { eta: progress.eta })}</span>}

                        {progress.rate != null && (

                          <span>{t("perf.rate", { rate: progress.rate })}</span>

                        )}

                      </div>

                      <div className="flex gap-2">

                        {pregenActive && (

                          <Button

                            disabled={pregenBusy}

                            onClick={() => doPregenAction("pause")}

                            className="!px-3 !py-1.5 text-xs"

                          >

                            <Pause size={13} />

                            {t("perf.pause")}

                          </Button>

                        )}

                        {pregenPaused && (

                          <Button

                            disabled={pregenBusy || !isRunning}

                            onClick={() => doPregenAction("continue")}

                            className="!px-3 !py-1.5 text-xs"

                          >

                            <Play size={13} />

                            {t("perf.resume")}

                          </Button>

                        )}

                        <Button

                          variant="danger"

                          disabled={pregenBusy || !isRunning}

                          onClick={() => doPregenAction("cancel")}

                          className="!px-3 !py-1.5 text-xs"

                        >

                          <X size={13} />

                          {t("perf.cancelTask")}

                        </Button>

                      </div>

                    </div>

                  )}



                  {pregenDone && (

                    <div className="flex items-center gap-2.5 rounded-xl border border-emerald-400/20 bg-emerald-500/8 p-4 text-sm font-medium text-emerald-100">

                      <Check size={16} />

                      {t("perf.pregenDone")}

                    </div>

                  )}

                </div>

              )}

            </PageSection>

          )}


        </div>

      </ScrollArea>

    </PageLayout>

  );

}

