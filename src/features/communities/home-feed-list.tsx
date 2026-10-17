"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ErrorBox } from "./home-shared";
import { HomeFeedItem, useSeenTracker } from "./home-feed";
import type { useHomeFeed } from "./use-home-feed";
import type { EngageMode } from "./post-engagement";
import { useTranslation } from "@/lib/i18n/language-provider";

type Feed = ReturnType<typeof useHomeFeed>;

/**
 * İki akışın ortak çizimi: yükleniyor · hata · boş (çağıran verir) · liste + sonsuz kaydırma ("Daha fazla" düğmesi de her zaman var).
 * Görüldü izleme yalnız oturumlu kullanıcıda ve yalnız bu liste açıkken çalışır.
 */
export function HomeFeedList({ feed, empty, onToast, viewerIsMember }: { feed: Feed; empty: ReactNode; onToast: (message: string) => void; viewerIsMember: (source: Feed["entries"][number]["source"]) => boolean }) {
  const { t } = useTranslation();
  const tracker = useSeenTracker(true);
  const sentinel = useRef<HTMLDivElement>(null);
  const { loadMore, hasMore, loadingMore, moreError } = feed;

  // Sonsuz kaydırma: sonuncuya yaklaşınca sıradaki sayfa; hata sonrası otomatik tekrar denemez (düğmeyle).
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore || moreError || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && void loadMore(), { rootMargin: "400px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, moreError, loadMore, feed.entries.length]);

  if (feed.status === "loading") {
    return (
      <ul className="space-y-3" aria-busy="true" aria-label={t("common.loadingAriaLabel")} data-testid="home-feed-loading">
        {[0, 1].map((i) => (
          <li key={i} className="h-48 animate-pulse rounded-xl border border-border-soft bg-surface-soft" />
        ))}
      </ul>
    );
  }
  if (feed.status === "error") return <ErrorBox message={t("communities.home.feedError")} onRetry={feed.reload} />;
  if (feed.entries.length === 0) return <>{empty}</>;

  return (
    <div className="space-y-4">
      <ul className="space-y-4" data-testid="home-feed">
        {feed.entries.map((entry) => {
          const card = feed.cards.get(entry.post.communityId);
          const mode: EngageMode = card?.closedAt ? "closed" : viewerIsMember(entry.source) ? "open" : "join";
          return <HomeFeedItem key={entry.id} post={entry.post} community={card} mode={mode} source={entry.source} tracker={tracker} onToast={onToast} />;
        })}
      </ul>
      {hasMore && (
        <div ref={sentinel} className="flex flex-col items-center gap-2">
          {moreError && (
            <p role="alert" className="text-small text-danger">
              {t("communities.home.feedMoreError")}
            </p>
          )}
          <Button type="button" variant="outline" size="sm" onClick={() => void loadMore()} disabled={loadingMore}>
            {loadingMore ? t("common.loadingMore") : moreError ? t("common.retry") : t("common.loadMore")}
          </Button>
        </div>
      )}
    </div>
  );
}
