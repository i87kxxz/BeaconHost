import { useTranslation } from "react-i18next";

import { ServerStatus } from "../lib/api";



const colors: Record<string, string> = {

  running: "bg-emerald-500/15 text-emerald-300 border-emerald-400/30",

  starting: "bg-amber-500/15 text-amber-300 border-amber-400/30",

  stopping: "bg-amber-500/15 text-amber-300 border-amber-400/30",

  stopped: "bg-white/5 text-slate-400 border-white/12",

  crashed: "bg-red-500/15 text-red-300 border-red-400/30",

  installing: "bg-beacon-cyan/15 text-beacon-light border-beacon-cyan/30",

  broken: "bg-red-500/15 text-red-300 border-red-400/30",

};



export function StatusBadge({

  status,

  installState,

}: {

  status: ServerStatus;

  installState?: string;

}) {

  const { t } = useTranslation();

  const key =

    installState === "installing"

      ? "installing"

      : installState === "broken"

        ? "broken"

        : status;

  const pulse = key === "starting" || key === "stopping" || key === "installing";

  return (

    <span

      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${colors[key] ?? colors.stopped}`}

    >

      <span

        className={`h-1.5 w-1.5 rounded-full bg-current ${pulse ? "animate-pulse" : ""}`}

      />

      {t(`status.${key}`)}

    </span>

  );

}

