"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/language-provider";

/**
 * Failure line + "Load more" under a paged list (Keşfet's feed and creators, the topic pages, profile lists). With `auto` the next page also
 * starts by itself when the button scrolls near the screen (a failed page waits for the button, so a broken request does not loop).
 */
export function LoadMore({
  failed,
  hasMore,
  loadingMore,
  onLoadMore,
  auto = false,
}: {
  failed: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  auto?: boolean;
}) {
  const { t } = useTranslation();
  const anchor = useRef<HTMLDivElement>(null);
  const onLoadMoreRef = useRef(onLoadMore);
  useEffect(() => {
    onLoadMoreRef.current = onLoadMore;
  });

  useEffect(() => {
    const element = anchor.current;
    if (!auto || !hasMore || loadingMore || failed || !element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onLoadMoreRef.current();
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [auto, hasMore, loadingMore, failed]);

  return (
    <>
      {failed && <p className="text-center text-small text-danger">{t("feed.loadFailed")}</p>}
      {hasMore && (
        <div ref={anchor} className="flex justify-center pt-2">
          <Button variant="outline" onClick={onLoadMore} disabled={loadingMore} data-testid="load-more">
            {loadingMore ? t("common.loadingMore") : t("common.loadMore")}
          </Button>
        </div>
      )}
    </>
  );
}
