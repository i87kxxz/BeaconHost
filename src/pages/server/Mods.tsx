import { useTranslation } from "react-i18next";
import { Package } from "lucide-react";
import { ServerSummary } from "../../lib/api";
import { GlassCard, EmptyState, PageLayout } from "../../components/ui";
import ContentBrowser from "../../components/ContentBrowser";

export default function ModsPage({ server }: { server: ServerSummary }) {
  const { t } = useTranslation();

  if (server.server_type === "vanilla") {
    return (
      <PageLayout>
        <GlassCard className="p-4">
          <EmptyState icon={<Package size={40} />} text={t("content.vanillaUnsupported")} />
        </GlassCard>
      </PageLayout>
    );
  }

  return <ContentBrowser server={server} contentType="mod" />;
}
