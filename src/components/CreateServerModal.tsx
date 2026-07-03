import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, ServerType, SERVER_TYPES } from "../lib/api";
import { useServers } from "../store/servers";
import { Modal, Field, TextInput, Select, Button, Spinner } from "./ui";

export function CreateServerModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const refresh = useServers((s) => s.refresh);

  const [name, setName] = useState("");
  const [type, setType] = useState<ServerType>("paper");
  const [version, setVersion] = useState("");
  const [ramMb, setRamMb] = useState(4096);
  const [port, setPort] = useState(25565);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const { data: totalRam } = useQuery({
    queryKey: ["system-ram"],
    queryFn: api.getSystemRam,
    staleTime: Infinity,
  });

  const { data: versions, isLoading: versionsLoading } = useQuery({
    queryKey: ["versions", type],
    queryFn: () => api.listMcVersions(type),
    enabled: open,
    staleTime: 10 * 60 * 1000,
  });

  useEffect(() => {
    if (versions && versions.length > 0) {
      setVersion(versions[0]);
    }
  }, [versions]);

  const maxRam = Math.max(2048, (totalRam ?? 8192) - 2048);

  const create = async () => {
    if (!name.trim() || !version) return;
    setCreating(true);
    setError("");
    try {
      const server = await api.createServer({
        name: name.trim(),
        serverType: type,
        mcVersion: version,
        ramMb,
        port,
      });
      await refresh();
      onClose();
      setName("");
      navigate(`/server/${server.id}`);
    } catch (e) {
      setError(String(e));
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t("create.title")}>
      <div className="flex flex-col gap-4">
        <Field label={t("create.name")}>
          <TextInput
            value={name}
            placeholder={t("create.namePlaceholder")}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>

        <Field
          label={t("create.type")}
          hint={
            type === "spigot"
              ? t("create.spigotWarning")
              : type === "velocity"
                ? t("create.proxyHint")
                : undefined
          }
        >
          <Select value={type} onChange={(e) => setType(e.target.value as ServerType)}>
            {SERVER_TYPES.map((st) => (
              <option key={st.value} value={st.value}>
                {st.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={t("create.version")}>
          {versionsLoading ? (
            <div className="flex items-center gap-2 py-2 text-sm text-slate-400">
              <Spinner /> {t("create.loadingVersions")}
            </div>
          ) : (
            <Select value={version} onChange={(e) => setVersion(e.target.value)}>
              {(versions ?? []).map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field label={`${t("create.ram")}: ${(ramMb / 1024).toFixed(1)} GB`}>
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

        <Field label={t("create.port")}>
          <TextInput
            type="number"
            value={port}
            onChange={(e) => setPort(Number(e.target.value))}
          />
        </Field>

        {error && <p className="text-sm text-slate-200">{error}</p>}

        <div className="mt-2 flex justify-end gap-2">
          <Button onClick={onClose}>{t("actions.cancel")}</Button>
          <Button
            variant="primary"
            disabled={creating || !name.trim() || !version}
            onClick={create}
          >
            {creating ? <Spinner /> : null}
            {creating ? t("create.creating") : t("actions.create")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
