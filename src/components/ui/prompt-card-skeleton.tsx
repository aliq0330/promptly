"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";

/** Mirrors the visual card (`ContentCardPost`): a rounded picture, then the author row with the counters on the right. */
export function PromptCardSkeleton() {
  return (
    <div aria-hidden>
      <Skeleton className="aspect-[4/5] w-full rounded-xl" />
      <div className="flex items-center gap-2 pl-0.5 pt-2.5">
        <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
        <Skeleton className="h-4 w-28" />
        <Skeleton className="ml-auto h-4 w-10" />
        <Skeleton className="h-4 w-10" />
      </div>
    </div>
  );
}

export function PromptCardSkeletonGrid({ count = 6, columns = "sm:columns-2 xl:columns-3" }: { count?: number; columns?: string }) {
  const { t } = useTranslation();
  return (
    // Same layout as ContentGrid: boxes, one column on a phone and CSS columns from `sm`.
    <div
      className={cn("sm:gap-5", columns)}
      role="status"
      aria-label={t("common.loadingAriaLabel")}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="break-inside-avoid pb-5 sm:pb-6">
          <PromptCardSkeleton />
        </div>
      ))}
    </div>
  );
}
