"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";

/**
 * Mirrors the Albüm card (`ContentCardPost`, docs/history/202-*): the tinted band (art → kicker → title → author line),
 * then the actions row (big action on the left, the icons on the right). Always a box, like a card in `ContentGrid`.
 */
export function PromptCardSkeleton() {
  return (
    <div className="rounded-xl border border-border-soft bg-surface shadow-card" aria-hidden>
      <div className="space-y-3.5 rounded-t-xl bg-primary-soft px-3.5 pb-4 pt-3.5">
        <Skeleton className="h-36 w-full rounded-lg" />
        <div className="space-y-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-6 w-4/5" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-[22px] w-[22px] shrink-0 rounded-full" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3 px-3.5 py-3">
        <Skeleton className="h-10 w-24 rounded-full" />
        <Skeleton className="ml-auto h-4 w-10" />
        <Skeleton className="h-4 w-10" />
        <Skeleton className="h-4 w-6" />
      </div>
    </div>
  );
}

export function PromptCardSkeletonGrid({ count = 6, columns = "sm:columns-2 xl:columns-3" }: { count?: number; columns?: string }) {
  const { t } = useTranslation();
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
