"use client";

import { PageContainer } from "@/components/ui/page-header";
import { CreatorList } from "@/features/profile/creator-list";
import { usePagedList } from "@/features/content/use-paged-list";
import { FeedGrid } from "@/features/feed/feed-grid";
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
    <PageContainer className="space-y-6">
      <section className="space-y-3">
        <h1 className="text-h1 font-bold text-text">{t("nav.followingPeople")}</h1>
        <PagedListState list={followed} skeleton={<p className="py-10 text-center text-small text-text-muted">{t("common.loading")}</p>}>
          <CreatorList users={followed.items} />
        </PagedListState>
      </section>
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-h3 font-bold text-text">{t("following.recentPosts")}</h2>
        </div>
        {!feed.loading && (
          <>
            <FeedGrid items={feed.items} />
            <LoadMore failed={feed.failed} hasMore={feed.hasMore} loadingMore={feed.loadingMore} onLoadMore={() => void feed.loadMore()} />
          </>
        )}
      </section>
    </PageContainer>
  );
}
