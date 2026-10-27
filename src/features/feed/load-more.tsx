"use client";

import { useEffect, useRef } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";

/**
 * The "Daha fazla yükle" button under every paged list — and the page after it starts BY ITSELF when the button scrolls near the screen
 * (docs/history/255-*): scrolling down is the way to read a list, the button stays as the visible fallback (no scroll event, a failed page, an
 * IntersectionObserver-less browser). While a page is loading, or after a failed one (`error`: the button then says "Tekrar dene" and waits for
 * a tap, so a broken request never loops), nothing fires on its own.
 *
 * Every "load more" in the app is this component (or `LoadMore` below, which adds the failure line) — never a bare `<Button>`.
 */
export function LoadMoreButton({
  onLoadMore,
  loading = false,
  error = false,
  disabled = false,
  auto = true,
  label,
  variant = "outline",
  size,
  wrapperClassName = "flex justify-center pt-2",
  className,
}: {
  onLoadMore: () => void;
  /** A page is on its way: the button reads "Yükleniyor…" and is disabled. */
  loading?: boolean;
  /** The last page failed: the button reads "Tekrar dene" and the next page waits for a tap. */
  error?: boolean;
  disabled?: boolean;
  auto?: boolean;
  /** Replaces "Daha fazla yükle" (e.g. "Daha eski sonuçlar"). */
  label?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  wrapperClassName?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const anchor = useRef<HTMLDivElement>(null);
  const onLoadMoreRef = useRef(onLoadMore);
  useEffect(() => {
    onLoadMoreRef.current = onLoadMore;
  });

  useEffect(() => {
    const element = anchor.current;
    if (!auto || loading || error || disabled || !element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onLoadMoreRef.current();
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [auto, loading, error, disabled]);

  return (
    <div ref={anchor} className={cn(wrapperClassName)}>
      <Button type="button" variant={variant} size={size} onClick={onLoadMore} disabled={loading || disabled} className={className} data-testid="load-more">
        {loading ? t("common.loadingMore") : error ? t("common.retry") : (label ?? t("common.loadMore"))}
      </Button>
    </div>
  );
}

/** Failure line + the auto "Load more" button under a paged list (Keşfet's feed and creators, topic pages, profile lists). */
export function LoadMore({
  failed,
  hasMore,
  loadingMore,
  onLoadMore,
  auto = true,
}: {
  failed: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  auto?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <>
      {failed && <p className="text-center text-small text-danger">{t("feed.loadFailed")}</p>}
      {hasMore && <LoadMoreButton onLoadMore={onLoadMore} loading={loadingMore} error={failed} auto={auto} />}
    </>
  );
}
