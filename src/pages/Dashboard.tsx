import { useState } from "react";

import { useNavigate } from "react-router-dom";

import { useTranslation } from "react-i18next";

import { motion, AnimatePresence } from "framer-motion";

import {

  Play,

  Square,

  RotateCcw,

  Trash2,

  Plus,

  Server,

  Users,

  Boxes,

  LayoutGrid,

  List,

} from "lucide-react";

import { api } from "../lib/api";

import { useServers } from "../store/servers";

import { GlassCard, Button, EmptyState, ScrollArea, PageLayout, PageHeader, IconBox } from "../components/ui";

import { StatusBadge } from "../components/StatusBadge";

import { CreateServerModal } from "../components/CreateServerModal";



type ViewMode = "grid" | "list";



const VIEW_KEY = "minc-dashboard-view";



function getViewMode(): ViewMode {

  try {

    const saved = localStorage.getItem(VIEW_KEY);

    if (saved === "grid") return "grid";

    if (saved === "list") return "list";

    return "list";

  } catch {

    return "list";

  }

}



export default function Dashboard() {

  const { t } = useTranslation();

  const { servers, refresh } = useServers();

  const [createOpen, setCreateOpen] = useState(false);

  const [busy, setBusy] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<ViewMode>(getViewMode);

  const navigate = useNavigate();



  const setView = (mode: ViewMode) => {

    setViewMode(mode);

    try {

      localStorage.setItem(VIEW_KEY, mode);

    } catch {

      /* ignore */

    }

  };



  const act = async (id: string, fn: () => Promise<unknown>) => {

    setBusy(id);

    try {

      await fn();

    } catch (e) {

      alert(String(e));

    } finally {

      setBusy(null);

      refresh();

    }

  };



  const ServerActions = ({ s }: { s: (typeof servers)[0] }) => (

    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>

      {s.install_state === "broken" ? (

        <Button

          variant="primary"

          className="!p-2"

          title={t("actions.retry")}

          disabled={busy === s.id}

          onClick={() => act(s.id, () => api.retryInstall(s.id))}

        >

          <RotateCcw size={15} strokeWidth={1.75} />

        </Button>

      ) : s.status === "stopped" || s.status === "crashed" ? (

        <Button

          variant="success"

          className="!p-2"

          title={t("actions.start")}

          disabled={busy === s.id || s.install_state !== "ready"}

          onClick={() => act(s.id, () => api.startServer(s.id))}

        >

          <Play size={15} strokeWidth={1.75} />

        </Button>

      ) : (

        <>

          <Button

            variant="danger"

            className="!p-2"

            title={t("actions.stop")}

            disabled={busy === s.id || s.status === "stopping"}

            onClick={() => act(s.id, () => api.stopServer(s.id))}

          >

            <Square size={15} strokeWidth={1.75} />

          </Button>

          <Button

            className="!p-2"

            title={t("actions.restart")}

            disabled={busy === s.id || s.status !== "running"}

            onClick={() => act(s.id, () => api.restartServer(s.id))}

          >

            <RotateCcw size={15} strokeWidth={1.75} />

          </Button>

        </>

      )}

      <Button

        className="!p-2 text-slate-200 hover:!bg-red-500/15 ms-auto"

        title={t("actions.delete")}

        disabled={busy === s.id}

        onClick={() => {

          if (confirm(t("dashboard.deleteConfirm"))) {

            act(s.id, () => api.deleteServer(s.id));

          }

        }}

      >

        <Trash2 size={15} strokeWidth={1.75} />

      </Button>

    </div>

  );



  return (
    <PageLayout>
      <PageHeader title={t("dashboard.title")}>
          {servers.length > 0 && (

            <div className="glass flex rounded-full p-1">

              <button

                onClick={() => setView("grid")}

                title={t("dashboard.gridView")}

                className={`rounded-full p-2 transition-colors ${

                  viewMode === "grid"

                    ? "bg-beacon-cyan/20 text-beacon-light"

                    : "text-slate-400 hover:text-white"

                }`}

              >

                <LayoutGrid size={16} />

              </button>

              <button

                onClick={() => setView("list")}

                title={t("dashboard.listView")}

                className={`rounded-full p-2 transition-colors ${

                  viewMode === "list"

                    ? "bg-beacon-cyan/20 text-beacon-light"

                    : "text-slate-400 hover:text-white"

                }`}

              >

                <List size={16} />

              </button>

            </div>

          )}

          <Button variant="primary" onClick={() => setCreateOpen(true)}>

            <Plus size={16} />

            {t("dashboard.newServer")}

          </Button>
      </PageHeader>

      <ScrollArea>

        {servers.length === 0 ? (

          <GlassCard className="p-4">

            <EmptyState icon={<Boxes size={40} />} text={t("dashboard.empty")} />

          </GlassCard>

        ) : (

          <AnimatePresence mode="wait">

            {viewMode === "grid" ? (

              <motion.div

                key="grid"

                initial={{ opacity: 0 }}

                animate={{ opacity: 1 }}

                exit={{ opacity: 0 }}

                className="grid grid-cols-1 gap-3 pb-3 lg:grid-cols-2 2xl:grid-cols-3"

              >

                {servers.map((s, i) => (

                  <motion.div

                    key={s.id}

                    className="h-full"

                    initial={{ opacity: 0, y: 6 }}

                    animate={{ opacity: 1, y: 0 }}

                    transition={{ duration: 0.18, delay: i * 0.02 }}

                  >

                    <GlassCard

                      hover

                      className="flex h-full flex-col p-4"

                      onClick={() => navigate(`/server/${s.id}`)}

                    >

                      <div className="mb-2.5 flex items-start justify-between gap-3">

                        <div className="flex min-w-0 items-center gap-2.5">

                          <IconBox icon={Server} tone="blue" size="sm" />

                          <div className="min-w-0">

                            <h3 className="truncate font-semibold text-white">{s.name}</h3>

                            <p className="text-xs text-slate-400">

                              {s.server_type} {s.mc_version}

                            </p>

                          </div>

                        </div>

                        <StatusBadge status={s.status} installState={s.install_state} />

                      </div>

                      <div className="mb-3 flex items-center gap-3 text-xs text-slate-400">

                        <span className="flex items-center gap-1.5">

                          <Users size={12} strokeWidth={1.75} className="text-cyan-400" />

                          {s.online_players.length} {t("dashboard.players")}

                        </span>

                        <span>

                          {t("dashboard.port")} {s.port}

                        </span>

                        <span>{Math.round(s.ram_mb / 1024)} GB RAM</span>

                      </div>

                      {s.install_state === "broken" && (

                        <p className="mb-2 text-xs text-red-300">

                          {t("dashboard.installFailedHint")}

                        </p>

                      )}

                      <div className="mt-auto border-t border-white/8 pt-2.5">

                        <ServerActions s={s} />

                      </div>

                    </GlassCard>

                  </motion.div>

                ))}

              </motion.div>

            ) : (

              <motion.div

                key="list"

                initial={{ opacity: 0 }}

                animate={{ opacity: 1 }}

                exit={{ opacity: 0 }}

                className="flex flex-col gap-2 pb-3"

              >

                {servers.map((s, i) => (

                  <motion.div

                    key={s.id}

                    initial={{ opacity: 0, x: -6 }}

                    animate={{ opacity: 1, x: 0 }}

                    transition={{ duration: 0.16, delay: i * 0.015 }}

                  >

                    <GlassCard

                      hover

                      className="flex flex-wrap items-center gap-3 p-3.5"

                      onClick={() => navigate(`/server/${s.id}`)}

                    >

                      <IconBox icon={Server} tone="blue" size="sm" />

                      <div className="min-w-[120px] flex-1">

                        <h3 className="font-semibold text-white">{s.name}</h3>

                        <p className="text-xs text-slate-400">

                          {s.server_type} {s.mc_version} · {t("dashboard.port")} {s.port}

                        </p>

                      </div>

                      <div className="flex items-center gap-3 text-xs text-slate-400">

                        <span className="flex items-center gap-1">

                          <Users size={12} strokeWidth={1.75} className="text-cyan-400" />

                          {s.online_players.length}

                        </span>

                        <span>{Math.round(s.ram_mb / 1024)} GB</span>

                      </div>

                      <StatusBadge status={s.status} installState={s.install_state} />

                      <div className="w-full sm:ms-auto sm:w-auto">

                        <ServerActions s={s} />

                      </div>

                    </GlassCard>

                  </motion.div>

                ))}

              </motion.div>

            )}

          </AnimatePresence>

        )}

      </ScrollArea>



      <CreateServerModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </PageLayout>
  );
}

