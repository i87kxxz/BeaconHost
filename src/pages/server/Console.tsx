import { useEffect, useRef, useState } from "react";

import { useTranslation } from "react-i18next";

import { listen } from "@tauri-apps/api/event";

import { motion } from "framer-motion";

import { Terminal } from "@xterm/xterm";

import { FitAddon } from "@xterm/addon-fit";

import { SearchAddon } from "@xterm/addon-search";

import "@xterm/xterm/css/xterm.css";

import { save } from "@tauri-apps/plugin-dialog";

import { Search, Download, Trash2, ChevronUp, ChevronDown, Send, Terminal as TerminalIcon } from "lucide-react";

import { api, ServerSummary } from "../../lib/api";

import { InstallProgress } from "../../lib/events";

import { Button, PageLayout, Panel } from "../../components/ui";



function colorize(line: string): string {

  if (/ERROR|SEVERE|Exception|error\[|FATAL/i.test(line)) {

    return `\x1b[91m${line}\x1b[0m`;

  }

  if (/WARN/i.test(line)) {

    return `\x1b[93m${line}\x1b[0m`;

  }

  if (/joined the game|Done \(/.test(line)) {

    return `\x1b[92m${line}\x1b[0m`;

  }

  if (/^\[BeaconHost\]/.test(line)) {

    return `\x1b[96m${line}\x1b[0m`;

  }

  return line;

}



export default function ConsolePage({ server }: { server: ServerSummary }) {

  const { t } = useTranslation();

  const containerRef = useRef<HTMLDivElement>(null);

  const termRef = useRef<Terminal | null>(null);

  const searchRef = useRef<SearchAddon | null>(null);

  const logBuffer = useRef<string[]>([]);

  const [command, setCommand] = useState("");

  const [search, setSearch] = useState("");

  const [history, setHistory] = useState<string[]>([]);

  const [histIdx, setHistIdx] = useState(-1);

  const [installMsg, setInstallMsg] = useState<InstallProgress | null>(null);



  useEffect(() => {

    if (!containerRef.current) return;

    const term = new Terminal({

      fontSize: 13,

      fontFamily: '"Cascadia Code", "JetBrains Mono", monospace',

      theme: {

        background: "#00000000",

        foreground: "#e2e8f0",

        cursor: "#2AB8F3",

        selectionBackground: "#2AB8F333",

      },

      allowTransparency: true,

      disableStdin: true,

      convertEol: true,

      scrollback: 5000,

    });

    const fit = new FitAddon();

    const searchAddon = new SearchAddon();

    term.loadAddon(fit);

    term.loadAddon(searchAddon);

    term.open(containerRef.current);

    fit.fit();

    termRef.current = term;

    searchRef.current = searchAddon;



    const onResize = () => fit.fit();

    window.addEventListener("resize", onResize);

    const resizeObserver = new ResizeObserver(() => fit.fit());

    resizeObserver.observe(containerRef.current);



    api.getLogs(server.id).then((lines) => {

      logBuffer.current = [...lines];

      for (const line of lines) {

        term.writeln(colorize(line));

      }

    });



    const unlisten = listen<string>(`server-log-${server.id}`, (e) => {

      logBuffer.current.push(e.payload);

      if (logBuffer.current.length > 10000) logBuffer.current.shift();

      term.writeln(colorize(e.payload));

    });



    const unlistenProgress = listen<InstallProgress>("install-progress", (e) => {

      if (e.payload.serverId !== server.id) return;

      setInstallMsg(e.payload);

      if (e.payload.pct < 0) {

        term.writeln(colorize(`[BeaconHost] ${e.payload.detail}`));

      }

    });

    const unlistenDone = listen<{ serverId: string }>("install-done", (e) => {

      if (e.payload.serverId === server.id) setInstallMsg(null);

    });



    return () => {

      window.removeEventListener("resize", onResize);

      resizeObserver.disconnect();

      unlisten.then((u) => u());

      unlistenProgress.then((u) => u());

      unlistenDone.then((u) => u());

      term.dispose();

      termRef.current = null;

    };

  }, [server.id]);



  const sendCmd = async () => {

    const cmd = command.trim();

    if (!cmd) return;

    try {

      await api.sendCommand(server.id, cmd);

      termRef.current?.writeln(`\x1b[94m> ${cmd}\x1b[0m`);

      setHistory((h) => [cmd, ...h.slice(0, 49)]);

      setHistIdx(-1);

      setCommand("");

    } catch (e) {

      termRef.current?.writeln(`\x1b[91m[BeaconHost] ${String(e)}\x1b[0m`);

    }

  };



  const saveLog = async () => {

    const path = await save({

      defaultPath: `${server.name}-log.txt`,

      filters: [{ name: "Log", extensions: ["txt", "log"] }],

    });

    if (path) {

      await api.saveTextFile(path, logBuffer.current.join("\n"));

    }

  };



  const doSearch = (dir: "next" | "prev") => {

    if (!search || !searchRef.current) return;

    if (dir === "next") searchRef.current.findNext(search);

    else searchRef.current.findPrevious(search);

  };



  const installing = server.install_state === "installing";

  const canSend = server.status === "running" || server.status === "starting";



  return (
    <PageLayout className="gap-3">
      <Panel
        className="min-h-0 flex-1"
        title={t("tabs.console")}
        icon={<TerminalIcon size={16} className="text-beacon-cyan" />}
        actions={
          <>
            <div className="relative w-44">
              <Search
                size={13}
                className="absolute top-1/2 -translate-y-1/2 text-slate-500 ltr:left-2.5 rtl:right-2.5"
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && doSearch("next")}
                placeholder={t("console.searchPlaceholder")}
                className="w-full rounded-full border border-white/10 bg-white/5 py-1 text-xs text-white placeholder-beacon-ice/35 outline-none focus:border-beacon-cyan/40 ltr:pl-7 ltr:pr-2 rtl:pr-7 rtl:pl-2"
              />
            </div>
            <Button className="!px-2 !py-1" onClick={() => doSearch("prev")}>
              <ChevronUp size={13} />
            </Button>
            <Button className="!px-2 !py-1" onClick={() => doSearch("next")}>
              <ChevronDown size={13} />
            </Button>
            <Button className="!px-2.5 !py-1 text-xs" onClick={saveLog}>
              <Download size={12} />
              {t("console.saveLog")}
            </Button>
            <Button
              className="!px-2.5 !py-1 text-xs"
              onClick={() => {
                termRef.current?.clear();
                logBuffer.current = [];
              }}
            >
              <Trash2 size={12} />
              {t("console.clear")}
            </Button>
          </>
        }
        bodyClassName="!p-0"
      >
        {installing && installMsg && installMsg.pct >= 0 && (
          <div className="shrink-0 border-b border-white/8 px-4 py-2">
            <div className="mb-1 flex justify-between text-[11px] text-slate-400">
              <span>{installMsg.detail}</span>
              <span>{Math.round(installMsg.pct)}%</span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-white/10">
              <motion.div
                className="h-full rounded-full bg-beacon-cyan"
                animate={{ width: `${Math.max(2, installMsg.pct)}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
          </div>
        )}
        <div className="console-term min-h-0 flex-1 overflow-hidden" dir="ltr">
          <div ref={containerRef} className="h-full w-full" />
        </div>
      </Panel>

      <div className="glass flex shrink-0 gap-2 rounded-2xl p-2" dir="ltr">
        <input
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") sendCmd();
            else if (e.key === "ArrowUp") {
              e.preventDefault();
              const ni = Math.min(histIdx + 1, history.length - 1);
              if (history[ni]) {
                setHistIdx(ni);
                setCommand(history[ni]);
              }
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              const ni = histIdx - 1;
              setHistIdx(ni);
              setCommand(ni >= 0 ? history[ni] : "");
            }
          }}
          placeholder={canSend ? t("console.placeholder") : t("console.notRunning")}
          disabled={!canSend}
          className="flex-1 rounded-full border border-white/10 bg-white/5 px-4 py-2 font-mono text-sm text-white placeholder-beacon-ice/35 outline-none focus:border-beacon-cyan/40 disabled:opacity-50"
        />
        <Button variant="primary" onClick={sendCmd} disabled={!canSend} className="!px-4">
          <Send size={16} />
        </Button>
      </div>
    </PageLayout>
  );
}

