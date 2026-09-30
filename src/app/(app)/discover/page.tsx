"use client";

import { Compass } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/ui/page-header";
import { DiscoverFeed } from "@/features/feed/discover-feed";
import { useTranslation } from "@/lib/i18n/language-provider";

export default function DiscoverPage() {
  const { t } = useTranslation();
  return (
    <PageContainer className="space-y-6">
      <PageHeader
        eyebrow={t("nav.discover")}
        icon={Compass}
        title={t("discover.pageTitle")}
        description={t("discover.pageDescription")}
      />
      <DiscoverFeed />
    </PageContainer>
  );
}
