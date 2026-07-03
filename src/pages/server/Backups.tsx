import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Trash2, Plus, Clock } from "lucide-react";
import { api, ServerSummary, formatBytes } from "../../lib/api";
import {
  GlassCard,
  Button,
  Field,
  Select,
  Spinner,
  EmptyState,
  PageLayout,
  ScrollArea,
  StatusPill,
} from "../../components/ui";
import { useServers } from "../../store/servers";

const SCHEDULE_OPTIONS = [
  { hours: 0, key: "off" },
  { hours: 1, key: "hourly" },
  { hours: 6, key: "every6h" },
  { hours: 12, key: "every12h" },
  { hours: 24, key: "daily" },
  { hours: 168, key: "weekly" },
] as const;

function nearestSchedule(hours: number): number {
  if (hours <= 0) return 0;
  let best: number = SCHEDULE_OPTIONS[0].hours;
  for (const opt of SCHEDULE_OPTIONS) {
    if (Math.abs(opt.hours - hours) < Math.abs(best - hours)) {
      best = opt.hours;
    }
  }
  return best;
}

export default function BackupsPage({ server }: { server: ServerSummary }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const refreshServers = useServers((s) => s.refresh);
  const [creating, setCreating] = useState(false);
  const [intervalHours, setIntervalHours] = useState(
    nearestSchedule(server.backup_interval_hours)
  );

  const { data: backups } = useQuery({
    queryKey: ["backups", server.id],
    queryFn: () => api.listBackups(server.id),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["backups", server.id] });

  const createNow = async () => {
    setCreating(true);
    try {
      await api.createBackup(server.id);
      refresh();
    } catch (e) {
      alert(String(e));
    } finally {
      setCreating(false);
    }
  };

  const saveSchedule = async (hours: number) => {
    setIntervalHours(hours);
    await api.updateServerConfig({ id: server.id, backupIntervalHours: hours });
    refreshServers();
  };

  const scheduleActive = intervalHours > 0;

  return (
    <PageLayout>
      <ScrollArea>
        <div className="mx-auto flex max-w-3xl flex-col gap-5 pb-4">
          <GlassCard className="flex flex-col gap-4 p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-white">{t("backups.title")}</h3>
                <p className="mt-1 text-xs text-beacon-ice/45">{t("backups.autoNote")}</p>
              </div>
              <Button variant="primary" disabled={creating} onClick={createNow}>
                {creating ? <Spinner /> : <Plus size={15} />}
                {creating ? t("backups.creating") : t("backups.createNow")}
              </Button>
            </div>

            <Field label={t("backups.schedule")}>
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={String(intervalHours)}
                  onChange={(e) => saveSchedule(Number(e.target.value))}
                  className="min-w-[12rem] flex-1"
                >
                  {SCHEDULE_OPTIONS.map((opt) => (
                    <option key={opt.hours} value={opt.hours}>
                      {t(`backups.scheduleOptions.${opt.key}`)}
                    </option>
                  ))}
                </Select>
                {scheduleActive && (
                  <StatusPill tone="success">{t("backups.scheduleActive")}</StatusPill>
                )}
              </div>
            </Field>
          </GlassCard>

          <GlassCard className="p-4">
            {(backups ?? []).length === 0 ? (
              <EmptyState icon={<Archive size={32} />} text={t("backups.empty")} />
            ) : (
              <div className="flex flex-col gap-1.5">
                {(backups ?? []).map((b) => (
                  <div
                    key={b.file_name}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-white/5"
                  >
                    <Archive size={16} className="shrink-0 text-white" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-sm text-white" dir="ltr">
                        {b.file_name}
                      </p>
                      <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
                        <Clock size={11} />
                        {new Date(b.created * 1000).toLocaleString()} -{" "}
                        {formatBytes(b.size)}
                      </p>
                    </div>
                    <button
                      title={t("actions.delete")}
                      className="rounded-lg p-1.5 text-slate-300 hover:bg-white/12 hover:text-white"
                      onClick={async () => {
                        if (confirm(t("backups.deleteConfirm"))) {
                          await api.deleteBackup(server.id, b.file_name);
                          refresh();
                        }
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>
        </div>
      </ScrollArea>
    </PageLayout>
  );
}
