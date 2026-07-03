import { useEffect, useState } from "react";

import { useTranslation } from "react-i18next";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import {

  Save,

  Globe2,

  AlertTriangle,

  Check,

  Settings2,

  Gamepad2,

  Shield,

  Cpu,

} from "lucide-react";

import { api, ServerSummary } from "../../lib/api";

import {

  Button,

  Field,

  TextInput,

  Select,

  Toggle,

  Modal,

  PageLayout,

  ScrollArea,

  SubTabs,

  PageSection,

  NumericUpDown,

  Tip,

} from "../../components/ui";

import { useServers } from "../../store/servers";



type SettingsTab = "general" | "world" | "security";



export default function SettingsPage({ server }: { server: ServerSummary }) {

  const { t } = useTranslation();

  const qc = useQueryClient();

  const refreshServers = useServers((s) => s.refresh);

  const [tab, setTab] = useState<SettingsTab>("general");



  const [name, setName] = useState(server.name);

  const [ramMb, setRamMb] = useState(server.ram_mb);

  const [port, setPort] = useState(server.port);

  const [autoRestart, setAutoRestart] = useState(server.auto_restart);

  const [jvmArgs, setJvmArgs] = useState(server.extra_jvm_args ?? "");

  const [saved, setSaved] = useState(false);



  const [maxPlayers, setMaxPlayers] = useState(20);

  const [gamemode, setGamemode] = useState("survival");

  const [difficulty, setDifficulty] = useState("normal");

  const [motd, setMotd] = useState("");

  const [viewDistance, setViewDistance] = useState(10);

  const [border, setBorder] = useState(0);

  const [onlineMode, setOnlineMode] = useState(true);

  const [warnOpen, setWarnOpen] = useState(false);



  const isProxy = server.server_type === "velocity";



  const { data: totalRam } = useQuery({

    queryKey: ["system-ram"],

    queryFn: api.getSystemRam,

    staleTime: Infinity,

  });



  const { data: props } = useQuery({

    queryKey: ["properties", server.id],

    queryFn: () => api.getProperties(server.id),

    enabled: !isProxy,

  });



  useEffect(() => {

    if (props) {

      setMaxPlayers(parseInt(props["max-players"] ?? "20", 10) || 20);

      setGamemode(props["gamemode"] ?? "survival");

      setDifficulty(props["difficulty"] ?? "normal");

      setMotd(props["motd"] ?? "");

      setViewDistance(parseInt(props["view-distance"] ?? "10", 10) || 10);

      setOnlineMode(props["online-mode"] !== "false");

    }

  }, [props]);



  const maxRam = Math.max(2048, (totalRam ?? 8192) - 1024);



  const saveAll = async () => {

    await api.updateServerConfig({

      id: server.id,

      name,

      ramMb,

      port,

      autoRestart,

      extraJvmArgs: jvmArgs,

    });

    if (!isProxy) {

      await api.setProperties(server.id, {

        "max-players": String(maxPlayers),

        gamemode,

        difficulty,

        motd,

        "view-distance": String(viewDistance),

      });

    }

    qc.invalidateQueries({ queryKey: ["properties", server.id] });

    refreshServers();

    setSaved(true);

    setTimeout(() => setSaved(false), 2000);

  };



  const applyBorder = async () => {

    if (!border || border <= 0) return;

    try {

      await api.sendCommand(server.id, `worldborder set ${border}`);

    } catch (e) {

      alert(String(e));

    }

  };



  const toggleOnlineMode = (v: boolean) => {

    if (!v) {

      setWarnOpen(true);

    } else {

      setOnlineMode(true);

      api.setOnlineMode(server.id, true);

    }

  };



  const confirmOffline = async () => {

    await api.setOnlineMode(server.id, false);

    setOnlineMode(false);

    setWarnOpen(false);

  };



  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [

    { id: "general", label: t("settings.general"), icon: <Settings2 size={15} /> },

    ...(isProxy

      ? []

      : [

          { id: "world" as const, label: t("settings.world"), icon: <Gamepad2 size={15} /> },

          { id: "security" as const, label: t("settings.security"), icon: <Shield size={15} /> },

        ]),

  ];



  return (

    <PageLayout>

      <div className="mb-1 flex shrink-0 flex-wrap items-center justify-between gap-3">

        <SubTabs tabs={tabs} active={tab} onChange={setTab} />

        <Button variant="primary" onClick={saveAll}>

          {saved ? <Check size={15} /> : <Save size={15} />}

          {saved ? t("settings.saved") : t("actions.save")}

        </Button>

      </div>



      <ScrollArea>

        <div className="mx-auto max-w-3xl pb-4">

          {tab === "general" && (

            <PageSection

              title={t("settings.general")}

              tip={t("settings.generalTip")}

              icon={<Cpu size={17} className="text-beacon-cyan" />}

            >

              <div className="flex flex-col gap-5">

                <Field label={t("settings.name")}>

                  <TextInput value={name} onChange={(e) => setName(e.target.value)} />

                </Field>



                <Field

                  label={`${t("settings.ram")}: ${(ramMb / 1024).toFixed(1)} GB`}

                  tip={t("settings.ramTip", { total: totalRam ?? "..." })}

                >

                  <input

                    type="range"

                    min={1024}

                    max={maxRam}

                    step={512}

                    value={ramMb}

                    onChange={(e) => setRamMb(Number(e.target.value))}

                    className="w-full"

                  />

                </Field>



                <Field label={t("settings.port")} tip={t("settings.portTip")}>

                  <NumericUpDown

                    value={port}

                    onChange={setPort}

                    min={1024}

                    max={65535}

                    step={1}

                  />

                </Field>



                <div className="flex items-center justify-between rounded-xl border border-beacon-edge/25 bg-beacon-bg/25 px-4 py-3">

                  <span className="flex items-center gap-1.5 text-sm font-medium text-beacon-ice/80">

                    {t("settings.autoRestart")}

                    <Tip text={t("settings.autoRestartTip")} />

                  </span>

                  <Toggle checked={autoRestart} onChange={setAutoRestart} />

                </div>



                <Field label={t("settings.jvmArgs")} tip={t("settings.jvmArgsTip")}>

                  <TextInput

                    value={jvmArgs}

                    onChange={(e) => setJvmArgs(e.target.value)}

                    placeholder="-XX:+UseG1GC"

                    dir="ltr"

                  />

                </Field>

              </div>

            </PageSection>

          )}



          {tab === "world" && !isProxy && (

            <PageSection

              title={t("settings.world")}

              tip={t("settings.worldTip")}

              icon={<Gamepad2 size={17} className="text-beacon-light" />}

            >

              <div className="flex flex-col gap-5">

                <Field label={t("settings.motd")} tip={t("settings.motdTip")}>

                  <TextInput value={motd} onChange={(e) => setMotd(e.target.value)} />

                </Field>



                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">

                  <Field label={t("settings.maxPlayers")} tip={t("settings.maxPlayersTip")}>

                    <NumericUpDown

                      value={maxPlayers}

                      onChange={setMaxPlayers}

                      min={1}

                      max={999}

                    />

                  </Field>

                  <Field label={t("settings.viewDistance")} tip={t("settings.viewDistanceTip")}>

                    <NumericUpDown

                      value={viewDistance}

                      onChange={setViewDistance}

                      min={3}

                      max={32}

                    />

                  </Field>

                </div>



                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">

                  <Field label={t("settings.gamemode")}>

                    <Select value={gamemode} onChange={(e) => setGamemode(e.target.value)}>

                      {["survival", "creative", "adventure", "spectator"].map((g) => (

                        <option key={g} value={g}>

                          {t(`settings.gamemodes.${g}`)}

                        </option>

                      ))}

                    </Select>

                  </Field>

                  <Field label={t("settings.difficulty")}>

                    <Select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>

                      {["peaceful", "easy", "normal", "hard"].map((d) => (

                        <option key={d} value={d}>

                          {t(`settings.difficulties.${d}`)}

                        </option>

                      ))}

                    </Select>

                  </Field>

                </div>



                <Field label={t("settings.worldBorder")} tip={t("settings.worldBorderHint")}>

                  <div className="flex gap-2">

                    <NumericUpDown

                      value={border || 1000}

                      onChange={setBorder}

                      min={1}

                      max={60000000}

                      step={100}

                      suffix={t("common.blocks")}

                      className="flex-1"

                    />

                    <Button

                      variant="primary"

                      disabled={server.status !== "running" || !border}

                      onClick={applyBorder}

                      className="shrink-0 self-stretch"

                    >

                      {t("settings.worldBorderApply")}

                    </Button>

                  </div>

                </Field>

              </div>

            </PageSection>

          )}



          {tab === "security" && !isProxy && (

            <PageSection

              title={t("settings.security")}

              tip={t("settings.securityTip")}

              icon={<Shield size={17} className="text-beacon-medium" />}

            >

              <div className="rounded-xl border border-beacon-edge/25 bg-beacon-bg/25 p-4">

                <div className="flex items-center justify-between gap-4">

                  <div className="flex items-center gap-3">

                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-beacon-cyan/15 bg-beacon-cyan/10">

                      <Globe2 size={18} className="text-beacon-cyan" />

                    </div>

                    <div>

                      <p className="text-sm font-medium text-white">{t("settings.onlineMode")}</p>

                      <p className="text-xs text-beacon-ice/45">

                        {onlineMode ? t("settings.onlineModeOn") : t("settings.onlineModeOff")}

                      </p>

                    </div>

                  </div>

                  <Toggle checked={onlineMode} onChange={toggleOnlineMode} />

                </div>

              </div>

            </PageSection>

          )}

        </div>

      </ScrollArea>



      <Modal

        open={warnOpen}

        onClose={() => setWarnOpen(false)}

        title={t("settings.onlineModeWarnTitle")}

      >

        <div className="flex flex-col gap-4">

          <div className="flex gap-3 rounded-xl border border-amber-400/20 bg-amber-500/10 p-4">

            <AlertTriangle size={20} className="shrink-0 text-amber-300" />

            <p className="text-sm leading-relaxed text-amber-100">{t("settings.onlineModeWarn")}</p>

          </div>

          <div className="flex justify-end gap-2">

            <Button onClick={() => setWarnOpen(false)}>{t("actions.cancel")}</Button>

            <Button variant="danger" onClick={confirmOffline}>

              {t("actions.confirm")}

            </Button>

          </div>

        </div>

      </Modal>

    </PageLayout>

  );

}

