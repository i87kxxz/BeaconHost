import { NavLink, useLocation } from "react-router-dom";

import { useTranslation } from "react-i18next";

import { motion } from "framer-motion";

import {

  Boxes,

  Globe,

  Languages,

  Server,

  PanelLeftClose,

  PanelLeftOpen,

} from "lucide-react";

import { ServerSummary } from "../lib/api";

import { switchLanguage } from "../i18n";

import { SectionLabel, Divider } from "./ui";



const SIDEBAR_KEY = "minc-sidebar-collapsed";



const ACTIVE_SERVER =

  "border border-beacon-cyan/35 bg-beacon-cyan/20 text-white shadow-[inset_0_1px_0_rgba(234,251,255,0.08)]";



function isLive(s: ServerSummary) {

  return s.status === "running" || s.status === "starting" || s.status === "stopping";

}



export function getSidebarCollapsed(): boolean {

  try {

    return localStorage.getItem(SIDEBAR_KEY) === "true";

  } catch {

    return false;

  }

}



export function setSidebarCollapsed(v: boolean) {

  try {

    localStorage.setItem(SIDEBAR_KEY, String(v));

  } catch {

    /* ignore */

  }

}



export default function Sidebar({

  servers,

  collapsed,

  onToggle,

}: {

  servers: ServerSummary[];

  collapsed: boolean;

  onToggle: () => void;

}) {

  const { t } = useTranslation();

  const location = useLocation();

  const w = collapsed ? 68 : 240;



  const navClass = ({ isActive }: { isActive: boolean }) =>

    `flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-medium transition-colors ${

      isActive

        ? "bg-beacon-cyan/15 text-white"

        : "text-beacon-ice/55 hover:bg-white/5 hover:text-beacon-ice"

    } ${collapsed ? "justify-center" : ""}`;



  return (

    <motion.aside

      animate={{ width: w }}

      transition={{ duration: 0.2, ease: "easeInOut" }}

      className="flex shrink-0 flex-col gap-0.5 overflow-hidden border-e border-beacon-edge/40 bg-beacon-bg/70 p-2.5 backdrop-blur-2xl"

    >

      <div

        className={`mb-3 flex items-center gap-2.5 px-1 ${collapsed ? "justify-center" : ""}`}

      >

        <img

          src="/logo.png"

          alt={t("app.name")}

          className={`shrink-0 object-contain drop-shadow-[0_0_12px_rgba(42,184,243,0.25)] ${

            collapsed ? "h-9 w-9" : "h-10 w-10"

          }`}

          draggable={false}

        />

        {!collapsed && (

          <div className="min-w-0">

            <h1 className="truncate text-base font-bold text-white">{t("app.name")}</h1>

            <p className="truncate text-[10px] text-beacon-ice/45">{t("app.tagline")}</p>

          </div>

        )}

      </div>



      <NavLink to="/" className={navClass} title={collapsed ? t("nav.dashboard") : undefined}>

        <Boxes size={16} className="shrink-0 text-beacon-light" />

        {!collapsed && t("nav.dashboard")}

      </NavLink>

      <NavLink

        to="/network"

        className={navClass}

        title={collapsed ? t("nav.network") : undefined}

      >

        <Globe size={16} className="shrink-0 text-beacon-medium" />

        {!collapsed && t("nav.network")}

      </NavLink>



      {servers.length > 0 && (

        <>

          <Divider className="my-2" />

          {!collapsed && <SectionLabel>{t("dashboard.title")}</SectionLabel>}

          <div className="min-h-0 flex-1 overflow-y-auto">

            <div className="flex flex-col gap-1">

              {[

                {

                  key: "live",

                  label: t("sidebar.running"),

                  items: servers.filter(isLive),

                },

                {

                  key: "idle",

                  label: t("sidebar.stopped"),

                  items: servers.filter((s) => !isLive(s)),

                },

              ]

                .filter((g) => g.items.length > 0)

                .map((group) => (

                  <div key={group.key} className="mb-1">

                    {!collapsed && (

                      <p className="mb-0.5 px-2 text-[9px] font-medium uppercase tracking-wider text-beacon-edge">

                        {group.label}

                      </p>

                    )}

                    <div className="flex flex-col gap-0.5">

                      {group.items.map((s) => {

                        const active = location.pathname.startsWith(`/server/${s.id}`);

                        const dotColor =

                          s.status === "running"

                            ? "bg-emerald-400"

                            : s.status === "starting" || s.status === "stopping"

                              ? "animate-pulse bg-amber-400"

                              : s.status === "crashed"

                                ? "bg-red-400"

                                : "bg-beacon-edge";



                        return (

                          <NavLink

                            key={s.id}

                            to={`/server/${s.id}`}

                            title={collapsed ? s.name : undefined}

                            className={`flex items-center rounded-xl py-2 text-sm transition-colors ${

                              collapsed ? "justify-center px-2" : "gap-2 px-2.5"

                            } ${

                              active

                                ? ACTIVE_SERVER

                                : "text-beacon-ice/55 hover:bg-white/5 hover:text-beacon-ice"

                            }`}

                          >

                            <span className="relative shrink-0">

                              <Server size={14} strokeWidth={1.75} className="text-beacon-light" />

                              {collapsed && (

                                <span

                                  className={`absolute -end-0.5 -top-0.5 h-1.5 w-1.5 rounded-full ${dotColor}`}

                                />

                              )}

                            </span>

                            {!collapsed && (

                              <>

                                <span className="min-w-0 flex-1 truncate text-xs">{s.name}</span>

                                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotColor}`} />

                              </>

                            )}

                          </NavLink>

                        );

                      })}

                    </div>

                  </div>

                ))}

            </div>

          </div>

        </>

      )}



      <Divider className="mt-auto" />

      <div className="flex flex-col gap-0.5 pt-2">

        <button

          onClick={switchLanguage}

          title={collapsed ? t("nav.language") : undefined}

          className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm text-beacon-ice/55 transition-colors hover:bg-white/5 hover:text-beacon-ice ${collapsed ? "justify-center" : ""}`}

        >

          <Languages size={16} className="shrink-0" />

          {!collapsed && t("nav.language")}

        </button>

        <button

          onClick={onToggle}

          title={collapsed ? t("sidebar.expand") : t("sidebar.collapse")}

          className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm text-beacon-ice/55 transition-colors hover:bg-white/5 hover:text-beacon-ice ${collapsed ? "justify-center" : ""}`}

        >

          {collapsed ? (

            <PanelLeftOpen size={16} className="shrink-0" />

          ) : (

            <>

              <PanelLeftClose size={16} className="shrink-0" />

              <span className="text-xs">{t("sidebar.collapse")}</span>

            </>

          )}

        </button>

      </div>

    </motion.aside>

  );

}

