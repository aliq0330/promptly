"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import { GRID_COLUMNS } from "@/lib/grid-columns";
import { useContentRowsScope } from "@/features/content/content-card";

/** Mirrors the feed post (`ContentCardPost`, docs/history/477-*): a 12 px picture, the kicker, the title and summary lines, then the author row with the counters on the right. */
export function PromptCardSkeleton() {
  return (
    <div aria-hidden>
      <Skeleton className="aspect-[4/5] w-full rounded-md max-sm:aspect-square" />
      <Skeleton className="mt-3 h-3 w-40" />
      <Skeleton className="mt-2 h-5 w-4/5" />
      <Skeleton className="mt-2 h-4 w-full" />
      <div className="flex min-h-[2.375rem] items-center gap-2 pl-0.5 pt-3">
        <Skeleton className="h-6 w-6 shrink-0 rounded-full" />
        <Skeleton className="h-4 w-28" />
        <Skeleton className="ml-auto h-4 w-10" />
        <Skeleton className="h-4 w-10" />
      </div>
    </div>
  );
}

/** Mirrors the horizontal row (D, docs/history/477-*): a square picture, kicker, title and summary lines, the author. */
export function PromptRowSkeleton() {
  return (
    <div aria-hidden className="flex items-start gap-3 border-b border-border py-4 sm:gap-4">
      <Skeleton className="aspect-square w-26 shrink-0 rounded-md sm:w-36 lg:w-48" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-5 w-4/5" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-6 w-28" />
      </div>
    </div>
  );
}

export function PromptCardSkeletonGrid({ count = 6, columns = GRID_COLUMNS }: { count?: number; columns?: string }) {
  const { t } = useTranslation();
  const rows = useContentRowsScope();
  if (rows) {
    return (
      <div className="grid gap-x-10 [grid-template-columns:repeat(auto-fill,minmax(min(100%,30rem),1fr))]" role="status" aria-label={t("common.loadingAriaLabel")}>
        {Array.from({ length: count }).map((_, i) => (
          <PromptRowSkeleton key={i} />
        ))}
      </div>
    );
  }
  return (
    // Same layout as ContentGrid: boxes, one column on a phone and CSS columns from `sm`.
    <div
      className={cn("sm:gap-4", columns)}
      role="status"
      aria-label={t("common.loadingAriaLabel")}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="break-inside-avoid pb-3 sm:pb-4">
          <PromptCardSkeleton />
        </div>
      ))}
    </div>
  );
}
