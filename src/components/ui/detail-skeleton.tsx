"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "@/lib/i18n/language-provider";

/** Loading placeholder for every detail page (prompt, generator, request, tag, collection). */
export function DetailSkeleton() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto w-full max-w-6xl px-3 py-5 sm:px-5 sm:py-7 lg:px-8 lg:py-10" role="status" aria-label={t("common.loadingAriaLabel")}>
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-10">
        <div className="space-y-6">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-9 w-3/4" />
          <Skeleton className="h-4 w-full max-w-xl" />
          <div className="flex items-center gap-2.5">
            <Skeleton className="h-9 w-9 rounded-full" />
            <Skeleton className="h-3.5 w-32" />
          </div>
          <Skeleton className="h-11 w-full rounded-xl" />
          <Skeleton className="h-44 w-full rounded-xl" />
        </div>
        <div className="mt-8 hidden space-y-6 lg:mt-0 lg:block">
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}

/** Centered "not found" block for detail pages. */
export function NotFoundBlock({ title, description }: { title: string; description: string }) {
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-h2 text-text">{title}</h1>
      <p className="mt-2 text-small text-text-muted">{description}</p>
    </div>
  );
}
