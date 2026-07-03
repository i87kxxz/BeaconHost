import { useState } from "react";

import { useTranslation } from "react-i18next";

import { useQuery } from "@tanstack/react-query";

import { Copy, Check, Globe, Wifi } from "lucide-react";

import { api } from "../lib/api";

import { PageLayout, ScrollArea, PageSection, Tip } from "../components/ui";

import { FirewallPanel } from "../components/FirewallPanel";



export default function NetworkPage() {

  const { t } = useTranslation();

  const [copied, setCopied] = useState<string | null>(null);



  const { data: net } = useQuery({

    queryKey: ["network-info"],

    queryFn: api.getNetworkInfo,

    staleTime: 60_000,

  });



  const copy = (text: string) => {

    navigator.clipboard.writeText(text);

    setCopied(text);

    setTimeout(() => setCopied(null), 1500);

  };



  const Row = ({

    icon,

    label,

    value,

    tip,

  }: {

    icon: React.ReactNode;

    label: string;

    value: string | null;

    tip?: string;

  }) => (

    <div className="flex items-center gap-3 rounded-xl border border-beacon-edge/20 bg-beacon-bg/20 px-4 py-3">

      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-beacon-cyan/15 bg-beacon-cyan/10">

        {icon}

      </div>

      <div className="min-w-0 flex-1">

        <p className="flex items-center gap-1.5 text-xs text-beacon-ice/45">

          {label}

          {tip && <Tip text={tip} />}

        </p>

        <p className="truncate font-mono text-sm text-white" dir="ltr">

          {value ?? "..."}

        </p>

      </div>

      {value && (

        <button

          onClick={() => copy(value)}

          className="rounded-lg p-2 text-beacon-ice/50 transition-colors hover:bg-beacon-cyan/10 hover:text-white"

        >

          {copied === value ? (

            <Check size={15} className="text-beacon-cyan" />

          ) : (

            <Copy size={15} />

          )}

        </button>

      )}

    </div>

  );



  return (

    <PageLayout className="!p-8">

      <h1 className="mb-4 shrink-0 text-2xl font-bold text-white">{t("network.title")}</h1>

      <ScrollArea>

        <div className="mx-auto flex max-w-3xl flex-col gap-5 pb-4">

          <PageSection

            title={t("network.addressesTitle")}

            tip={t("network.addressesTip")}

            icon={<Globe size={17} className="text-beacon-cyan" />}

          >

            <div className="flex flex-col gap-3">

              <Row

                icon={<Globe size={16} className="text-beacon-light" />}

                label={t("network.publicIp")}

                value={net?.public_ip ?? null}

                tip={t("network.publicIpTip")}

              />

              <Row

                icon={<Wifi size={16} className="text-beacon-medium" />}

                label={t("network.localIp")}

                value={net?.local_ip ?? null}

                tip={t("network.localIpTip")}

              />

            </div>

          </PageSection>

          <FirewallPanel port={25565} />

        </div>

      </ScrollArea>

    </PageLayout>

  );

}

