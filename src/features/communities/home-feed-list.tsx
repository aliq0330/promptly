"use client";

import type { ReactNode } from "react";
import { LoadMoreButton } from "@/features/feed/load-more";
import { PromptCardSkeleton } from "@/components/ui/prompt-card-skeleton";
import { CONTENT_GRID_ITEM_CLASS, ContentGrid } from "@/features/content/content-card";
import { FEED_GRID_COLUMNS } from "./community-layout";
import { postFeedItem } from "./content-summary";
import { useViewMode } from "@/features/content/view-mode-store";
import { FOCUS_GRID_NARROW_COLUMNS, FocusGrid } from "@/features/focus/focus-grid";
import type { FeedItem } from "@/features/feed/types";
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
  const [viewMode] = useViewMode();
  const tracker = useSeenTracker(true);
  const { loadMore, hasMore, loadingMore, moreError } = feed;

  if (feed.status === "loading") {
    return (
      <ContentGrid as="ul" columns={FEED_GRID_COLUMNS} aria-busy="true" aria-label={t("common.loadingAriaLabel")} data-testid="home-feed-loading">
        {[0, 1].map((i) => (
          <li key={i} className={CONTENT_GRID_ITEM_CLASS}>
            <PromptCardSkeleton />
          </li>
        ))}
      </ContentGrid>
    );
  }
  if (feed.status === "error") return <ErrorBox message={t("communities.home.feedError")} onRetry={feed.reload} />;
  if (feed.entries.length === 0) return <>{empty}</>;

  return (
    <div className="space-y-4">
      {/* Kart | Izgara anahtarı sayfanın kontrol satırındadır (docs/history/232-*); Izgara her gönderinin içeriğini gösterir (görüldü izleme kart görünümünde kalır). */}
      {viewMode === "focus" ? (
        <FocusGrid
          items={feed.entries.map((entry) => postFeedItem(entry.post.content)).filter((item): item is FeedItem => item !== null)}
          columns={FOCUS_GRID_NARROW_COLUMNS}
        />
      ) : (
        <ContentGrid as="ul" columns={FEED_GRID_COLUMNS} data-testid="home-feed">
          {feed.entries.map((entry) => {
            const card = feed.cards.get(entry.post.communityId);
            const mode: EngageMode = card?.closedAt ? "closed" : viewerIsMember(entry.source) ? "open" : "join";
            return <HomeFeedItem key={entry.id} post={entry.post} community={card} mode={mode} source={entry.source} tracker={tracker} onToast={onToast} />;
          })}
        </ContentGrid>
      )}
      {hasMore && (
        <div className="flex flex-col items-center gap-2">
          {moreError && (
            <p role="alert" className="text-small text-danger">
              {t("communities.home.feedMoreError")}
            </p>
          )}
          <LoadMoreButton size="sm" wrapperClassName="" onLoadMore={() => void loadMore()} loading={loadingMore} error={Boolean(moreError)} />
        </div>
      )}
    </div>
  );
}
