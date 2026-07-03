import { useTranslation } from "react-i18next";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, X } from "lucide-react";

export default function TitleBar() {
  const { t } = useTranslation();
  const win = getCurrentWindow();

  return (
    <header className="titlebar flex h-9 shrink-0 items-center border-b border-white/8 bg-beacon-bg/80 backdrop-blur-md">
      <div
        className="flex min-w-0 flex-1 items-center gap-2 px-4"
        data-tauri-drag-region
      >
        <img src="/logo.png" alt="" className="h-4 w-4 shrink-0 opacity-90" />
        <span
          className="truncate text-xs font-medium text-beacon-ice/70"
          data-tauri-drag-region
        >
          BeaconHost
        </span>
      </div>
      <div className="flex shrink-0 items-center">
        <button
          type="button"
          title={t("titlebar.hide")}
          onClick={() => win.hide()}
          className="flex h-9 w-11 items-center justify-center text-beacon-ice/55 transition-colors hover:bg-white/8 hover:text-white"
        >
          <Minus size={15} />
        </button>
        <button
          type="button"
          title={t("titlebar.close")}
          onClick={() => win.close()}
          className="flex h-9 w-11 items-center justify-center text-beacon-ice/55 transition-colors hover:bg-red-500/80 hover:text-white"
        >
          <X size={15} />
        </button>
      </div>
    </header>
  );
}
