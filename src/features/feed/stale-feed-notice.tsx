"use client";

import { Banner } from "@/components/ui/banner";
import { useTranslation } from "@/lib/i18n/language-provider";

/**
 * Cihazda saklanan son liste ekrandayken gerçek liste yüklenemediğinde (docs/history/466-*): büyük "yüklenemedi" ekranı yerine liste kalır,
 * üstünde bu tek satırlık band ve "Tekrar dene". Gerçek liste gelince band kendiliğinden kalkar.
 */
export function StaleFeedNotice({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <Banner as="div" tone="warning" data-stale-feed-notice="" className="justify-between gap-3">
      <span role="status" className="min-w-0">
        {t("feed.staleNotice")}
      </span>
      <button
        type="button"
        onClick={onRetry}
        className="shrink-0 rounded-full px-3 py-2 font-semibold text-primary-text transition-colors hover:text-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        {t("common.retry")}
      </button>
    </Banner>
  );
}
