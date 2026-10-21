"use client";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/language-provider";

/** Failure line + "Load more" under a paged list (Keşfet's feed and creators, the topic pages). */
export function LoadMore({ failed, hasMore, loadingMore, onLoadMore }: { failed: boolean; hasMore: boolean; loadingMore: boolean; onLoadMore: () => void }) {
  const { t } = useTranslation();
  return (
    <>
      {failed && <p className="text-center text-small text-danger">{t("feed.loadFailed")}</p>}
      {hasMore && (
        <div className="flex justify-center pt-2">
          <Button variant="outline" onClick={onLoadMore} disabled={loadingMore}>
            {loadingMore ? t("common.loadingMore") : t("common.loadMore")}
          </Button>
        </div>
      )}
    </>
  );
}
