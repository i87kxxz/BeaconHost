import { useState } from "react";

import { useTranslation } from "react-i18next";

import { useQuery } from "@tanstack/react-query";

import { Copy, Check, Globe, Wifi } from "lucide-react";

import { api, ServerSummary } from "../../lib/api";

import { PageLayout, ScrollArea, PageSection, StatusPill, Tip } from "../../components/ui";

import { FirewallPanel } from "../../components/FirewallPanel";



export default function ServerNetworkPage({ server }: { server: ServerSummary }) {

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



  const AddressRow = ({

    icon,

    label,

    address,

    tip,

  }: {

    icon: React.ReactNode;

    label: string;

    address: string | null;

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

          {address ? `${address}:${server.port}` : "..."}

        </p>

      </div>

      {address && (

        <button

          onClick={() => copy(`${address}:${server.port}`)}

          className="rounded-lg p-2 text-beacon-ice/50 transition-colors hover:bg-beacon-cyan/10 hover:text-white"

        >

          {copied === `${address}:${server.port}` ? (

            <Check size={15} className="text-beacon-cyan" />

          ) : (

            <Copy size={15} />

          )}

        </button>

      )}

    </div>

  );



  return (

    <PageLayout>

      <ScrollArea>

        <div className="mx-auto flex max-w-3xl flex-col gap-5 pb-4">

          <PageSection

            title={t("network.title")}

            tip={t("network.addressesTip")}

            icon={<Globe size={17} className="text-beacon-cyan" />}

            badge={

              net?.public_ip && (

                <StatusPill tone="info">

                  {t("network.vpsHint", { address: `${net.public_ip}:${server.port}` })}

                </StatusPill>

              )

            }

          >

            <div className="flex flex-col gap-3">

              <AddressRow

                icon={<Globe size={16} className="text-beacon-light" />}

                label={t("network.publicIp")}

                address={net?.public_ip ?? null}

                tip={t("network.publicIpTip")}

              />

              <AddressRow

                icon={<Wifi size={16} className="text-beacon-medium" />}

                label={t("network.localIp")}

                address={net?.local_ip ?? null}

                tip={t("network.localIpTip")}

              />

            </div>

          </PageSection>



          <FirewallPanel port={server.port} serverId={server.id} />

        </div>

      </ScrollArea>

    </PageLayout>

  );

}

