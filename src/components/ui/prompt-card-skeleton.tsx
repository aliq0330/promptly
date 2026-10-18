"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";

/**
 * Mirrors ContentCardPost's anatomy: avatar column → identity line → title → prompt block → actions.
 * `flat` = a row of a stream; `responsive` = a row on phones, a box from `sm` (like a card in `ContentGrid`).
 */
export function PromptCardSkeleton({ flat = false, responsive = false }: { flat?: boolean; responsive?: boolean }) {
  return (
    <div
      className={cn(
        "flex gap-3 px-4 pb-3 pt-4",
        !flat && (responsive ? "sm:rounded-lg sm:border sm:border-border-soft sm:bg-surface sm:shadow-card" : "rounded-lg border border-border-soft bg-surface shadow-card"),
      )}
      aria-hidden
    >
      <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex items-center gap-2 pt-1">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-3 w-full" />
        </div>
        <Skeleton className="h-20 w-full rounded-xl" />
        <div className="flex items-center gap-3 pt-1">
          <Skeleton className="h-4 w-10" />
          <Skeleton className="h-4 w-10" />
          <Skeleton className="ml-auto h-4 w-6" />
          <Skeleton className="h-4 w-6" />
        </div>
      </div>
    </div>
  );
}

export function PromptCardSkeletonGrid({ count = 6, layout = "grid" }: { count?: number; layout?: "grid" | "stream" }) {
  const { t } = useTranslation();
  if (layout === "stream") {
    // Same surface as ContentStream (Meydan Faz 6).
    return (
      <div
        className="-mx-3 divide-y divide-border-soft border-y border-border-soft bg-surface sm:mx-0 sm:rounded-lg sm:border sm:shadow-card"
        role="status"
        aria-label={t("common.loadingAriaLabel")}
      >
        {Array.from({ length: count }).map((_, i) => (
          <PromptCardSkeleton key={i} flat />
        ))}
      </div>
    );
  }
  return (
    // Same surface as ContentGrid: stream rows on phones, boxes in columns from `sm`.
    <div
      className="-mx-3 divide-y divide-border-soft border-y border-border-soft bg-surface sm:mx-0 sm:columns-2 sm:gap-4 sm:divide-y-0 sm:border-0 sm:bg-transparent xl:columns-3"
      role="status"
      aria-label={t("common.loadingAriaLabel")}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="break-inside-avoid sm:pb-4">
          <PromptCardSkeleton responsive />
        </div>
      ))}
    </div>
  );
}
