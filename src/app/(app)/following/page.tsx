"use client";

import { CreatorList } from "@/features/profile/creator-list";
import { ViewModeControls } from "@/features/content/view-mode-switcher";
import { usePagedList } from "@/features/content/use-paged-list";
import { FeedItemsView } from "@/features/feed/feed-items-view";
import { LoadMore } from "@/features/feed/load-more";
import { PagedListState } from "@/features/feed/paged-list-state";
import { useFeedPages } from "@/features/feed/use-feed-pages";
import { useAuth } from "@/features/auth/auth-provider";
import { fetchFollowedProfilesPage } from "@/lib/supabase/profiles";
import { EMPTY_TAXONOMY_FILTER } from "@/lib/content-taxonomy";
import { useTranslation } from "@/lib/i18n/language-provider";

export default function FollowingPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  // Both lists are read a page at a time (docs/history/257-*): the people (50 per page) and their latest posts (`feed_page` "following" — the
  // database picks the posts of everyone followed; the client never sends the followed ids back).
  const followed = usePagedList(`following|${user?.id ?? ""}`, Boolean(user), (offset) => fetchFollowedProfilesPage(user?.id ?? "", offset));
  const feed = useFeedPages({ scope: "following", order: "newest", kind: "prompt", taxonomy: EMPTY_TAXONOMY_FILTER }, Boolean(user));

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 px-3 py-5 sm:px-5 sm:py-6 lg:px-8 lg:py-8">
      <section className="space-y-3">
        <h1 className="text-h1 font-semibold text-text">{t("nav.followingPeople")}</h1>
        <PagedListState list={followed} skeleton={<p className="py-10 text-center text-sm text-text-muted">{t("common.loading")}</p>}>
          <CreatorList users={followed.items} />
        </PagedListState>
      </section>
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-h3 font-semibold text-text">{t("following.recentPosts")}</h2>
          {feed.items.length > 0 && (
            <div className="flex items-center gap-2">
              <ViewModeControls />
            </div>
          )}
        </div>
        {!feed.loading && (
          <>
            <FeedItemsView items={feed.items} />
            <LoadMore failed={feed.failed} hasMore={feed.hasMore} loadingMore={feed.loadingMore} onLoadMore={() => void feed.loadMore()} />
          </>
        )}
      </section>
    </div>
  );
}
