import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Editor from "@monaco-editor/react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Folder,
  File,
  ChevronRight,
  Home,
  Trash2,
  Pencil,
  FolderPlus,
  Upload,
  Save,
  X,
  ExternalLink,
} from "lucide-react";
import { api, ServerSummary, formatBytes } from "../../lib/api";
import { Button, GlassCard, PageLayout } from "../../components/ui";

function languageFor(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "json":
      return "json";
    case "yml":
    case "yaml":
      return "yaml";
    case "toml":
      return "ini";
    case "properties":
    case "cfg":
    case "conf":
    case "ini":
      return "ini";
    case "sh":
      return "shell";
    case "bat":
      return "bat";
    case "log":
    case "txt":
    default:
      return "plaintext";
  }
}

export default function FilesPage({ server }: { server: ServerSummary }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [path, setPath] = useState<string[]>([]);
  const [openFile, setOpenFile] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");

  const relPath = path.join("/");

  const { data: entries } = useQuery({
    queryKey: ["files", server.id, relPath],
    queryFn: () => api.listFiles(server.id, relPath),
  });

  const refresh = () =>
    qc.invalidateQueries({ queryKey: ["files", server.id, relPath] });

  const openTextFile = async (name: string) => {
    const filePath = [...path, name].join("/");
    setError("");
    try {
      const text = await api.readFile(server.id, filePath);
      setOpenFile(filePath);
      setContent(text);
      setDirty(false);
    } catch {
      setError(t("files.notText"));
    }
  };

  const saveFile = async () => {
    if (!openFile) return;
    await api.writeFile(server.id, openFile, content);
    setDirty(false);
  };

  const uploadFile = async () => {
    const src = await open({ multiple: false });
    if (typeof src === "string") {
      await api.importFile(server.id, src, relPath);
      refresh();
    }
  };

  return (
    <PageLayout className="!flex-row gap-4 !p-6">
      {/* Browser */}
      <div className={`flex min-h-0 flex-col ${openFile ? "w-80 shrink-0" : "flex-1"}`}>
        {/* Breadcrumbs + actions */}
        <div className="mb-3 flex items-center gap-1 text-sm">
          <button
            onClick={() => setPath([])}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-slate-300 hover:bg-white/8"
          >
            <Home size={14} />
            {!openFile && t("files.root")}
          </button>
          {path.map((seg, i) => (
            <span key={i} className="flex items-center gap-1">
              <ChevronRight size={13} className="text-slate-600 rtl:rotate-180" />
              <button
                onClick={() => setPath(path.slice(0, i + 1))}
                className="rounded-lg px-1.5 py-1 text-slate-300 hover:bg-white/8"
                dir="ltr"
              >
                {seg}
              </button>
            </span>
          ))}
          <div className="ms-auto flex gap-1.5">
            <Button
              className="!p-2"
              title={t("actions.newFolder")}
              onClick={async () => {
                const name = prompt(t("files.folderPrompt"));
                if (name) {
                  await api.createFolder(server.id, [...path, name].join("/"));
                  refresh();
                }
              }}
            >
              <FolderPlus size={14} />
            </Button>
            <Button className="!p-2" title={t("actions.upload")} onClick={uploadFile}>
              <Upload size={14} />
            </Button>
            <Button
              className="!p-2"
              title={t("actions.openFolder")}
              onClick={() => api.openServerFolder(server.id)}
            >
              <ExternalLink size={14} />
            </Button>
          </div>
        </div>

        {error && <p className="mb-2 text-xs text-slate-200">{error}</p>}

        {/* Entries */}
        <GlassCard className="min-h-0 flex-1 overflow-y-auto p-2">
          {(entries ?? []).map((entry) => (
            <div
              key={entry.name}
              className="group flex items-center gap-2.5 rounded-xl px-2.5 py-2 hover:bg-beacon-cyan/10"
            >
              <button
                className="flex min-w-0 flex-1 items-center gap-2.5 text-start"
                onClick={() =>
                  entry.is_dir
                    ? setPath([...path, entry.name])
                    : openTextFile(entry.name)
                }
              >
                {entry.is_dir ? (
                  <Folder size={16} className="shrink-0 text-white" />
                ) : (
                  <File size={16} className="shrink-0 text-slate-400" />
                )}
                <span className="truncate text-sm text-slate-200" dir="ltr">
                  {entry.name}
                </span>
                {!entry.is_dir && (
                  <span className="ms-auto shrink-0 text-[11px] text-slate-500">
                    {formatBytes(entry.size)}
                  </span>
                )}
              </button>
              <div className="hidden shrink-0 gap-1 group-hover:flex">
                <button
                  title={t("actions.rename")}
                  className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white"
                  onClick={async () => {
                    const name = prompt(t("files.renamePrompt"), entry.name);
                    if (name && name !== entry.name) {
                      await api.renamePath(
                        server.id,
                        [...path, entry.name].join("/"),
                        name
                      );
                      refresh();
                    }
                  }}
                >
                  <Pencil size={13} />
                </button>
                <button
                  title={t("actions.delete")}
                  className="rounded p-1 text-slate-300 hover:bg-white/12 hover:text-white"
                  onClick={async () => {
                    if (confirm(t("files.deleteConfirm", { name: entry.name }))) {
                      await api.deletePath(server.id, [...path, entry.name].join("/"));
                      refresh();
                    }
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </GlassCard>
      </div>

      {/* Editor */}
      {openFile && (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="mb-3 flex items-center gap-3">
            <span className="truncate font-mono text-sm text-slate-200" dir="ltr">
              {openFile}
            </span>
            {dirty && (
              <span className="shrink-0 rounded-full border border-white/18 bg-white/10 px-2 py-0.5 text-[11px] text-slate-200">
                {t("files.editorUnsaved")}
              </span>
            )}
            <div className="ms-auto flex gap-2">
              <Button
                variant="primary"
                className="!px-3 !py-1.5"
                disabled={!dirty}
                onClick={saveFile}
              >
                <Save size={14} />
                {t("actions.save")}
              </Button>
              <Button
                className="!px-3 !py-1.5"
                onClick={() => {
                  setOpenFile(null);
                  setDirty(false);
                }}
              >
                <X size={14} />
                {t("actions.close")}
              </Button>
            </div>
          </div>
          <GlassCard className="min-h-0 flex-1 overflow-hidden">
            <Editor
              height="100%"
              theme="vs-dark"
              language={languageFor(openFile)}
              value={content}
              onChange={(v) => {
                setContent(v ?? "");
                setDirty(true);
              }}
              options={{
                fontSize: 13,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                automaticLayout: true,
                padding: { top: 12 },
              }}
            />
          </GlassCard>
        </div>
      )}
    </PageLayout>
  );
}
