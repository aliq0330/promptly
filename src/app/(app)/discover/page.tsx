"use client";

import { Suspense } from "react";
import { PageContainer } from "@/components/ui/page-header";
import { DiscoverFeed } from "@/features/feed/discover-feed";
import { useWeeklyStats } from "@/features/feed/discover-editorial";
import { useTranslation } from "@/lib/i18n/language-provider";
import { formatCount } from "@/lib/utils";

export default function DiscoverPage() {
  const { t } = useTranslation();
  const stats = useWeeklyStats();
  // docs/history/451-*: a visible editorial title with this week's real numbers (the sentence is left out until they arrive or if none).
  return (
    <PageContainer>
      <header className="mb-4 pt-2 sm:mb-6 sm:pt-4">
        <h1 className="font-display text-display font-extrabold tracking-[-0.04em] text-text">{t("nav.discover")}</h1>
        <p className="mt-1 min-h-6 text-body text-text-secondary">
          {stats && stats.prompts + stats.workflows + stats.skills > 0
            ? t("discover.hero.stats", { prompts: formatCount(stats.prompts), workflows: formatCount(stats.workflows), skills: formatCount(stats.skills) })
            : null}
        </p>
      </header>
      <Suspense fallback={null}>
        <DiscoverFeed />
      </Suspense>
    </PageContainer>
  );
}
