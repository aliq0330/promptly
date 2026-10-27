"use client";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CONTENT_GRID_ITEM_CLASS, ContentGrid } from "@/features/content/content-card";
import { useTranslation } from "@/lib/i18n/language-provider";
import { LoadMore } from "./load-more";

export function PagedListSkeleton() {
  return (
    <ContentGrid>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className={CONTENT_GRID_ITEM_CLASS}>
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ))}
    </ContentGrid>
  );
}

/** A paged list's state (`usePagedList`): skeleton while the first page loads, a retry when it failed, the list, then the auto "Daha fazla" under it. */
export function PagedListState({
  list,
  children,
  skeleton,
}: {
  /** Shown while the first page loads (default: content-card skeletons). */
  skeleton?: React.ReactNode;
  list: { loading: boolean; failed: boolean; items: unknown[]; hasMore: boolean; loadingMore: boolean; loadMore: () => Promise<void>; retry: () => void };
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  if (list.loading) return <>{skeleton ?? <PagedListSkeleton />}</>;
  if (list.failed && list.items.length === 0) {
    return (
      <div className="space-y-3 py-8 text-center" role="alert">
        <p className="text-small text-danger">{t("feed.loadFailed")}</p>
        <Button variant="outline" onClick={list.retry}>
          {t("common.retry")}
        </Button>
      </div>
    );
  }
  return (
    <>
      {children}
      <LoadMore failed={list.failed} hasMore={list.hasMore} loadingMore={list.loadingMore} onLoadMore={() => void list.loadMore()} />
    </>
  );
}
