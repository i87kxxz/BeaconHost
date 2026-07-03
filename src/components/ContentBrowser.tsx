import { useState, useCallback, useEffect, useRef } from "react";

import { useTranslation } from "react-i18next";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { open } from "@tauri-apps/plugin-dialog";

import { motion } from "framer-motion";

import {

  Search,

  Download,

  Link,

  FileUp,

  Trash2,

  Package,

  Power,

  Blocks,

  Puzzle,

  ChevronDown,

} from "lucide-react";

import { api, ServerSummary, formatBytes, ContentItem } from "../lib/api";

import {

  Button,

  TextInput,

  Spinner,

  EmptyState,

  Modal,

  PageLayout,

  ScrollArea,

  Panel,

  StatusPill,

} from "./ui";



type ContentType = "mod" | "plugin";



export default function ContentBrowser({

  server,

  contentType,

}: {

  server: ServerSummary;

  contentType: ContentType;

}) {

  const { t } = useTranslation();

  const qc = useQueryClient();

  const [query, setQuery] = useState("");

  const [submitted, setSubmitted] = useState("");

  const [results, setResults] = useState<ContentItem[]>([]);

  const [total, setTotal] = useState(0);

  const [searching, setSearching] = useState(false);

  const [loadingMore, setLoadingMore] = useState(false);

  const [installing, setInstalling] = useState<string | null>(null);

  const [urlModal, setUrlModal] = useState(false);

  const [url, setUrl] = useState("");

  const [error, setError] = useState("");



  const isMod = contentType === "mod";

  const titleKey = isMod ? "content.modsTitle" : "content.pluginsTitle";

  const searchPlaceholderKey = isMod

    ? "content.modsSearchPlaceholder"

    : "content.pluginsSearchPlaceholder";

  const BrowseIcon = isMod ? Blocks : Puzzle;

  const accentClass = isMod ? "text-beacon-light" : "text-beacon-medium";



  const { data: installed } = useQuery({

    queryKey: ["content-installed", server.id],

    queryFn: () => api.listInstalledContent(server.id),

  });



  const refreshInstalled = () =>

    qc.invalidateQueries({ queryKey: ["content-installed", server.id] });



  const initialLoadDone = useRef(false);

  const fetchPage = useCallback(

    async (q: string, offset: number, append: boolean) => {

      const page = await api.searchContent(server.id, q, offset);

      setTotal(page.total);

      setResults((prev) => (append ? [...prev, ...page.items] : page.items));

      return page;

    },

    [server.id]

  );



  const runSearch = async (q: string, autoLoadMore = false) => {
    setSubmitted(q);
    setSearching(true);
    setError("");
    setResults([]);
    setTotal(0);
    try {
      const page = await fetchPage(q, 0, false);
      if (autoLoadMore && page.total > page.items.length) {
        let offset = page.items.length;
        let merged = [...page.items];
        while (offset < page.total && offset < 500) {
          const next = await api.searchContent(server.id, q, offset);
          merged = [...merged, ...next.items];
          offset = merged.length;
          setTotal(next.total);
          setResults(merged);
          if (next.items.length === 0) break;
        }
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    initialLoadDone.current = false;
  }, [server.id]);

  useEffect(() => {
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;
    runSearch("", true);
  }, [server.id]);



  const loadMore = async () => {

    if (!submitted || results.length >= total) return;

    setLoadingMore(true);

    try {

      await fetchPage(submitted, results.length, true);

    } catch (e) {

      setError(String(e));

    } finally {

      setLoadingMore(false);

    }

  };



  const loadAll = async () => {

    if (!submitted || results.length >= total) return;

    setLoadingMore(true);

    try {

      let offset = results.length;

      let merged = [...results];

      while (offset < total) {

        const page = await api.searchContent(server.id, submitted, offset);

        merged = [...merged, ...page.items];

        offset = merged.length;

        setTotal(page.total);

        setResults(merged);

        if (page.items.length === 0) break;

      }

    } catch (e) {

      setError(String(e));

    } finally {

      setLoadingMore(false);

    }

  };



  const install = async (projectId: string) => {

    setInstalling(projectId);

    setError("");

    try {

      await api.installContent(server.id, projectId);

      refreshInstalled();

    } catch (e) {

      setError(String(e));

    } finally {

      setInstalling(null);

    }

  };



  const installFromUrl = async () => {

    if (!url.trim()) return;

    setInstalling("url");

    setError("");

    try {

      await api.installContentFromUrl(server.id, url.trim());

      setUrlModal(false);

      setUrl("");

      refreshInstalled();

    } catch (e) {

      setError(String(e));

    } finally {

      setInstalling(null);

    }

  };



  const installFromFile = async () => {

    const path = await open({

      multiple: false,

      filters: [{ name: "Java Archive", extensions: ["jar"] }],

    });

    if (typeof path === "string") {

      setInstalling("file");

      setError("");

      try {

        await api.installContentFromFile(server.id, path);

        refreshInstalled();

      } catch (e) {

        setError(String(e));

      } finally {

        setInstalling(null);

      }

    }

  };



  const hasMore = submitted.length > 0 && results.length < total;



  const searchBar = (

    <div className="flex gap-2">

      <div className="relative min-w-0 flex-1">

        <Search

          size={15}

          className="absolute top-1/2 -translate-y-1/2 text-beacon-ice/40 ltr:left-3.5 rtl:right-3.5"

        />

        <TextInput

          value={query}

          onChange={(e) => setQuery(e.target.value)}

          onKeyDown={(e) => e.key === "Enter" && runSearch(query)}

          placeholder={t(searchPlaceholderKey)}

          className="ltr:!pl-10 rtl:!pr-10"

        />

      </div>

      <Button variant="primary" onClick={() => runSearch(query)}>

        {t("actions.search")}

      </Button>

    </div>

  );



  return (

    <PageLayout>

      {error && (

        <p className="shrink-0 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">

          {error}

        </p>

      )}



      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-12">

        <Panel

          className="xl:col-span-7"

          title={t(titleKey)}

          icon={<BrowseIcon size={16} className={accentClass} />}

          header={searchBar}

          actions={

            submitted ? (

              <StatusPill tone="info">

                {t("content.resultsCount", { shown: results.length, total })}

              </StatusPill>

            ) : undefined

          }

        >

          <ScrollArea>

            {searching ? (

              <div className="flex justify-center py-12">

                <Spinner />

              </div>

            ) : !submitted && !searching ? (

              <EmptyState

                icon={<Search size={32} className="text-beacon-edge" />}

                text={t(searchPlaceholderKey)}

              />

            ) : results.length === 0 ? (

              <EmptyState icon={<Package size={32} />} text={t("content.noResults")} />

            ) : (

              <div className="flex flex-col gap-2">

                {results.map((item, i) => (

                  <motion.div

                    key={item.id}

                    initial={{ opacity: 0, y: 6 }}

                    animate={{ opacity: 1, y: 0 }}

                    transition={{ delay: Math.min(i * 0.015, 0.3) }}

                    className="flex items-center gap-3 rounded-xl border border-beacon-edge/20 bg-beacon-bg/20 px-3 py-2.5 transition-colors hover:border-beacon-cyan/20 hover:bg-beacon-cyan/5"

                  >

                    {item.icon_url ? (

                      <img

                        src={item.icon_url}

                        alt=""

                        className="h-10 w-10 shrink-0 rounded-xl bg-white/5 object-cover"

                      />

                    ) : (

                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-beacon-cyan/8">

                        <Package size={16} className="text-beacon-ice/50" />

                      </div>

                    )}

                    <div className="min-w-0 flex-1">

                      <h3 className="truncate text-sm font-medium text-white">{item.title}</h3>

                      <p className="line-clamp-2 text-xs text-beacon-ice/45">{item.description}</p>

                      <p className="text-[10px] text-beacon-ice/30">

                        {t("content.downloadsCount", { count: item.downloads })}

                      </p>

                    </div>

                    <Button

                      variant="primary"

                      className="!px-3 !py-1.5 shrink-0"

                      disabled={installing !== null}

                      onClick={() => install(item.id)}

                    >

                      {installing === item.id ? <Spinner /> : <Download size={14} />}

                      {t("actions.install")}

                    </Button>

                  </motion.div>

                ))}



                {hasMore && (

                  <div className="mt-2 flex flex-wrap justify-center gap-2 border-t border-beacon-edge/20 pt-4">

                    <Button disabled={loadingMore} onClick={loadMore}>

                      {loadingMore ? <Spinner /> : <ChevronDown size={14} />}

                      {t("content.loadMore", { remaining: total - results.length })}

                    </Button>

                    <Button variant="primary" disabled={loadingMore} onClick={loadAll}>

                      {loadingMore ? <Spinner /> : <Download size={14} />}

                      {t("content.loadAll")}

                    </Button>

                  </div>

                )}

              </div>

            )}

          </ScrollArea>

        </Panel>



        <Panel

          className="xl:col-span-5"

          title={t("content.installedTitle")}

          subtitle={t("content.restartHint")}

          icon={<Package size={16} className="text-beacon-ice/50" />}

          actions={

            <>

              <Button className="!px-3 !py-1.5 text-xs" onClick={() => setUrlModal(true)}>

                <Link size={13} />

                {t("content.fromUrl")}

              </Button>

              <Button

                className="!px-3 !py-1.5 text-xs"

                disabled={installing === "file"}

                onClick={installFromFile}

              >

                <FileUp size={13} />

                {t("content.fromFile")}

              </Button>

            </>

          }

        >

          <ScrollArea>

            {(installed ?? []).length === 0 ? (

              <EmptyState icon={<Package size={28} />} text={t("content.empty")} />

            ) : (

              <div className="flex flex-col gap-1.5">

                {(installed ?? []).map((c) => (

                  <div

                    key={c.file_name}

                    className={`flex items-center gap-2.5 rounded-xl border border-beacon-edge/15 bg-beacon-bg/15 px-3 py-2 transition-colors hover:bg-beacon-cyan/5 ${!c.enabled ? "opacity-50" : ""}`}

                  >

                    <Package size={14} className="shrink-0 text-beacon-ice/45" />

                    <div className="min-w-0 flex-1">

                      <p className="truncate text-sm text-white" dir="ltr">

                        {c.file_name.replace(/\.disabled$/, "")}

                      </p>

                      <p className="text-[10px] text-beacon-ice/35">{formatBytes(c.size)}</p>

                    </div>

                    <motion.button

                      whileTap={{ scale: 0.9 }}

                      title={c.enabled ? t("actions.disable") : t("actions.enable")}

                      onClick={async () => {

                        await api.toggleContent(server.id, c.file_name);

                        refreshInstalled();

                      }}

                      className={`rounded-full p-1.5 transition-colors ${

                        c.enabled

                          ? "text-emerald-400 hover:bg-emerald-500/15"

                          : "text-beacon-ice/40 hover:bg-white/10"

                      }`}

                    >

                      <Power size={14} />

                    </motion.button>

                    <motion.button

                      whileTap={{ scale: 0.9 }}

                      title={t("actions.remove")}

                      onClick={async () => {

                        await api.removeContent(server.id, c.file_name);

                        refreshInstalled();

                      }}

                      className="rounded-full p-1.5 text-beacon-ice/45 transition-colors hover:bg-red-500/15 hover:text-red-300"

                    >

                      <Trash2 size={14} />

                    </motion.button>

                  </div>

                ))}

              </div>

            )}

          </ScrollArea>

        </Panel>

      </div>



      <Modal open={urlModal} onClose={() => setUrlModal(false)} title={t("content.fromUrl")}>

        <div className="flex flex-col gap-4">

          <TextInput

            value={url}

            onChange={(e) => setUrl(e.target.value)}

            placeholder={t("content.urlPrompt")}

            dir="ltr"

          />

          <div className="flex justify-end gap-2">

            <Button onClick={() => setUrlModal(false)}>{t("actions.cancel")}</Button>

            <Button

              variant="primary"

              disabled={installing === "url" || !url.trim()}

              onClick={installFromUrl}

            >

              {installing === "url" ? <Spinner /> : <Download size={14} />}

              {t("actions.install")}

            </Button>

          </div>

        </div>

      </Modal>

    </PageLayout>

  );

}

