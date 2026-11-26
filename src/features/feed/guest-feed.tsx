"use client";

import Link from "next/link";
import { Clock } from "@/components/icons/clock";
import { Banner } from "@/components/ui/banner";
import { buttonClassName } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PromptCardSkeletonGrid } from "@/components/ui/prompt-card-skeleton";
import { LoadMoreButton } from "@/features/feed/load-more";
import { EMPTY_TAXONOMY_FILTER } from "@/lib/content-taxonomy";
import { GRID_COLUMNS_ASIDE } from "@/lib/grid-columns";
import { useTranslation } from "@/lib/i18n/language-provider";
import { authHref } from "@/lib/auth-redirect";
import { FeedGrid } from "./feed-grid";
import { useFeedPages } from "./use-feed-pages";
import { useAuth } from "@/features/auth/auth-provider";
import { FeedTabs } from "./feed-tabs";
import { StaleFeedNotice } from "./stale-feed-notice";

/** The guest feed asks the same public query as Keşfet's "Tümü · Önerilen": everyone's public posts, ranked by engagement. */
const GUEST_QUERY = { scope: "all", order: "recommended", kind: "all", taxonomy: EMPTY_TAXONOMY_FILTER } as const;

/**
 * Ana Sayfa's feed for someone who is not signed in (docs/history/425-*). "Sana özel" and "Takip Ettiklerim" are about a person's own
 * follows and signals, so a guest used to see two tabs, a Filtre icon and a login prompt — an empty page under the showcase. Instead the
 * guest gets what Keşfet shows (the community's public posts, most engaging first) under a plain title and ONE quiet banner that says what
 * signing in adds. Tabs and Filtre are gone (they would do nothing). While the session is still being restored the signed-in feed's
 * skeleton is shown, so a returning member never sees this list flash.
 */
export function HomeFeed({ layout = "home" }: { layout?: "grid" | "home" } = {}) {
  const { user, loading } = useAuth();
  if (loading || user) return <FeedTabs layout={layout} />;
  return <GuestFeed layout={layout} />;
}

function GuestFeed({ layout }: { layout: "grid" | "home" }) {
  const { t } = useTranslation();
  const feed = useFeedPages(GUEST_QUERY, true);

  return (
    <section className="space-y-4" aria-label={t("feed.ariaLabel")} data-guest-feed>
      <h2 className="text-h2 text-text">{t("home.guestFeedTitle")}</h2>
      <Banner aria-label={t("home.guestFeedBannerLabel")} data-guest-feed-banner className="flex-wrap gap-x-3 gap-y-2 py-3">
        <span className="min-w-0 flex-1 basis-56 font-medium text-text">{t("home.guestFeedBanner")}</span>
        <span className="flex shrink-0 items-center gap-2">
          <Link href={authHref("/signup", "/")} className={buttonClassName({ size: "sm" })}>
            {t("auth.signUp")}
          </Link>
          <Link href={authHref("/login", "/")} className={buttonClassName({ variant: "outline", size: "sm" })}>
            {t("common.login")}
          </Link>
        </span>
      </Banner>

      {feed.loading ? (
        <PromptCardSkeletonGrid count={layout === "home" ? 4 : 6} columns={layout === "home" ? GRID_COLUMNS_ASIDE : undefined} />
      ) : feed.failed && feed.items.length === 0 ? (
        <EmptyState scene="feedStalled" icon={Clock} title={t("feed.loadFailed")} action={{ label: t("common.retry"), onClick: feed.retry }} />
      ) : (
        <div className="space-y-4">
          {feed.stale && feed.failed && <StaleFeedNotice onRetry={feed.retry} />}
          <FeedGrid
            items={feed.items}
            layout={layout}
            emptyScene="community"
            emptyTitle={t("home.guestFeedEmptyTitle")}
            emptyDescription={t("home.guestFeedEmptyDescription")}
            emptyAction={{ label: t("feed.goToDiscover"), href: "/discover" }}
          />
          {feed.failed && !feed.stale && <p className="text-center text-small text-danger">{t("feed.loadFailed")}</p>}
          {feed.hasMore && <LoadMoreButton onLoadMore={() => void feed.loadMore()} loading={feed.loadingMore} error={feed.failed} />}
        </div>
      )}
    </section>
  );
}
