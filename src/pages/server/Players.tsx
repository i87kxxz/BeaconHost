import { useState } from "react";

import { useTranslation } from "react-i18next";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import {

  Users,

  UserPlus,

  UserMinus,

  Shield,

  ShieldOff,

  Ban,

  DoorOpen,

  Circle,

} from "lucide-react";

import { api, ServerSummary } from "../../lib/api";

import {

  Button,

  TextInput,

  Toggle,

  EmptyState,

  PageLayout,

  ScrollArea,

  SubTabs,

  PageSection,

  StatusPill,

} from "../../components/ui";



type PlayerTab = "online" | "whitelist" | "ops" | "banned";



export default function PlayersPage({ server }: { server: ServerSummary }) {

  const { t } = useTranslation();

  const qc = useQueryClient();

  const [tab, setTab] = useState<PlayerTab>("online");

  const [error, setError] = useState("");

  const [inputs, setInputs] = useState({ whitelist: "", ops: "", banned: "" });



  const running = server.status === "running";



  const { data } = useQuery({

    queryKey: ["players", server.id],

    queryFn: () => api.getPlayers(server.id),

    refetchInterval: running ? 5000 : false,

  });



  const act = async (action: string, player: string) => {

    setError("");

    try {

      await api.playerAction(server.id, action, player);

      setTimeout(

        () => qc.invalidateQueries({ queryKey: ["players", server.id] }),

        700

      );

    } catch (e) {

      setError(String(e));

    }

  };



  const online = data?.online ?? [];

  const whitelist = data?.whitelist ?? [];

  const ops = data?.ops ?? [];

  const banned = data?.banned ?? [];



  const tabs = [

    {

      id: "online" as const,

      label: t("players.online"),

      icon: <Circle size={13} className="fill-emerald-400 text-emerald-400" />,

      count: online.length,

    },

    {

      id: "whitelist" as const,

      label: t("players.whitelist"),

      icon: <Shield size={13} />,

      count: whitelist.length,

    },

    { id: "ops" as const, label: t("players.ops"), icon: <Shield size={13} />, count: ops.length },

    {

      id: "banned" as const,

      label: t("players.banned"),

      icon: <ShieldOff size={13} />,

      count: banned.length,

    },

  ];



  const PlayerRow = ({

    name,

    children,

  }: {

    name: string;

    children?: React.ReactNode;

  }) => (

    <div className="flex items-center gap-2 rounded-xl border border-beacon-edge/15 bg-beacon-bg/15 px-3 py-2 transition-colors hover:border-beacon-cyan/15 hover:bg-beacon-cyan/5">

      <span className="flex-1 text-sm text-white">{name}</span>

      {children}

    </div>

  );



  const AddBar = ({

    value,

    onChange,

    onAdd,

    disabled,

  }: {

    value: string;

    onChange: (v: string) => void;

    onAdd: () => void;

    disabled?: boolean;

  }) => (

    <div className="mb-4 flex gap-2">

      <TextInput

        value={value}

        onChange={(e) => onChange(e.target.value)}

        placeholder={t("players.addPlaceholder")}

        onKeyDown={(e) => e.key === "Enter" && value.trim() && onAdd()}

      />

      <Button variant="primary" className="!px-3" disabled={disabled || !value.trim()} onClick={onAdd}>

        <UserPlus size={15} />

      </Button>

    </div>

  );



  return (

    <PageLayout>

      {!running && (

        <div className="mb-1 shrink-0 rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">

          {t("players.needRunning")}

        </div>

      )}

      {error && (

        <div className="mb-1 shrink-0 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">

          {error}

        </div>

      )}



      <SubTabs tabs={tabs} active={tab} onChange={setTab} className="shrink-0" />



      <ScrollArea>

        <div className="mx-auto max-w-2xl pb-4">

          {tab === "online" && (

            <PageSection

              title={t("players.online")}

              tip={t("players.onlineTip")}

              icon={<Users size={17} className="text-emerald-400" />}

              badge={

                <StatusPill tone={online.length ? "success" : "neutral"}>

                  {online.length} {t("players.onlineCount")}

                </StatusPill>

              }

            >

              {online.length === 0 ? (

                <EmptyState icon={<Users size={28} />} text={t("players.noneOnline")} />

              ) : (

                <div className="flex flex-col gap-1.5">

                  {online.map((p) => (

                    <PlayerRow key={p} name={p}>

                      <span className="h-2 w-2 rounded-full bg-emerald-400" />

                      <button

                        title={t("actions.kick")}

                        className="rounded-lg p-1.5 text-beacon-ice/50 hover:bg-white/10 hover:text-white"

                        onClick={() => act("kick", p)}

                      >

                        <DoorOpen size={14} />

                      </button>

                      <button

                        title={t("actions.ban")}

                        className="rounded-lg p-1.5 text-beacon-ice/50 hover:bg-red-500/15 hover:text-red-300"

                        onClick={() => act("ban", p)}

                      >

                        <Ban size={14} />

                      </button>

                    </PlayerRow>

                  ))}

                </div>

              )}

            </PageSection>

          )}



          {tab === "whitelist" && (

            <PageSection

              title={t("players.whitelist")}

              tip={t("players.whitelistTip")}

              icon={<Shield size={17} className="text-beacon-cyan" />}

              actions={

                <Toggle

                  checked={data?.whitelist_enabled ?? false}

                  onChange={(v) => act(v ? "whitelist_on" : "whitelist_off", "server")}

                  label={

                    data?.whitelist_enabled

                      ? t("players.whitelistEnabled")

                      : t("players.whitelistDisabled")

                  }

                />

              }

            >

              <AddBar

                value={inputs.whitelist}

                onChange={(v) => setInputs({ ...inputs, whitelist: v })}

                disabled={!running}

                onAdd={() => {

                  act("whitelist_add", inputs.whitelist.trim());

                  setInputs({ ...inputs, whitelist: "" });

                }}

              />

              <div className="flex flex-col gap-1.5">

                {whitelist.map((p) => (

                  <PlayerRow key={p} name={p}>

                    <button

                      title={t("actions.remove")}

                      className="rounded-lg p-1.5 text-beacon-ice/50 hover:bg-white/10 hover:text-white"

                      onClick={() => act("whitelist_remove", p)}

                    >

                      <UserMinus size={14} />

                    </button>

                  </PlayerRow>

                ))}

                {whitelist.length === 0 && (

                  <p className="py-4 text-center text-xs text-beacon-ice/35">-</p>

                )}

              </div>

            </PageSection>

          )}



          {tab === "ops" && (

            <PageSection

              title={t("players.ops")}

              tip={t("players.opsTip")}

              icon={<Shield size={17} className="text-beacon-light" />}

            >

              <AddBar

                value={inputs.ops}

                onChange={(v) => setInputs({ ...inputs, ops: v })}

                disabled={!running}

                onAdd={() => {

                  act("op", inputs.ops.trim());

                  setInputs({ ...inputs, ops: "" });

                }}

              />

              <div className="flex flex-col gap-1.5">

                {ops.map((p) => (

                  <PlayerRow key={p} name={p}>

                    <button

                      title={t("actions.remove")}

                      className="rounded-lg p-1.5 text-beacon-ice/50 hover:bg-white/10 hover:text-white"

                      onClick={() => act("deop", p)}

                    >

                      <UserMinus size={14} />

                    </button>

                  </PlayerRow>

                ))}

                {ops.length === 0 && (

                  <p className="py-4 text-center text-xs text-beacon-ice/35">-</p>

                )}

              </div>

            </PageSection>

          )}



          {tab === "banned" && (

            <PageSection

              title={t("players.banned")}

              tip={t("players.bannedTip")}

              icon={<ShieldOff size={17} className="text-beacon-medium" />}

            >

              <div className="flex flex-col gap-1.5">

                {banned.map((p) => (

                  <PlayerRow key={p} name={p}>

                    <button

                      title={t("actions.remove")}

                      className="rounded-lg p-1.5 text-beacon-ice/50 hover:bg-white/10 hover:text-white"

                      onClick={() => act("pardon", p)}

                    >

                      <UserMinus size={14} />

                    </button>

                  </PlayerRow>

                ))}

                {banned.length === 0 && (

                  <EmptyState icon={<ShieldOff size={28} />} text={t("players.noneBanned")} />

                )}

              </div>

            </PageSection>

          )}

        </div>

      </ScrollArea>

    </PageLayout>

  );

}

