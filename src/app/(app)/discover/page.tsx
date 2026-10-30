"use client";

import { Suspense } from "react";
import { PageContainer } from "@/components/ui/page-header";
import { DiscoverFeed } from "@/features/feed/discover-feed";
import { useTranslation } from "@/lib/i18n/language-provider";

export default function DiscoverPage() {
  const { t } = useTranslation();
  // docs/history/211-*: no visible title — the search box opens the page; the heading stays for screen readers.
  return (
    <PageContainer>
      <h1 className="sr-only">{t("nav.discover")}</h1>
      <Suspense fallback={null}>
        <DiscoverFeed />
      </Suspense>
    </PageContainer>
  );
}
