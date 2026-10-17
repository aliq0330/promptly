"use client";

import { PageContainer, PageHeader } from "@/components/ui/page-header";
import { DiscoverFeed } from "@/features/feed/discover-feed";
import { useTranslation } from "@/lib/i18n/language-provider";

export default function DiscoverPage() {
  const { t } = useTranslation();
  return (
    <PageContainer className="space-y-6">
      {/* Meydan (docs/history/190-*): a plain, large title — no illustrated card taking a third of the first screen. */}
      <PageHeader title={t("discover.pageTitle")} description={t("discover.pageDescription")} />
      <DiscoverFeed />
    </PageContainer>
  );
}
