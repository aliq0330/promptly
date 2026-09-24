import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors ContentCard's anatomy: header → type line → title → prompt block → actions. */
export function PromptCardSkeleton() {
  return (
    <div className="rounded-lg border border-border-soft bg-surface shadow-card" aria-hidden>
      <div className="space-y-3 p-4">
        <div className="flex items-center gap-2.5">
          <Skeleton className="h-8 w-8 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-2.5 w-20" />
          </div>
        </div>
        <Skeleton className="h-3 w-24" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-3 w-full" />
        </div>
        <Skeleton className="h-20 w-full rounded-md" />
        <div className="flex gap-2">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-3 w-14" />
        </div>
      </div>
      <div className="flex items-center gap-2 border-t border-border-soft px-4 py-3">
        <Skeleton className="h-4 w-10" />
        <Skeleton className="h-4 w-10" />
        <Skeleton className="ml-auto h-4 w-6" />
        <Skeleton className="h-4 w-6" />
      </div>
    </div>
  );
}

export function PromptCardSkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="columns-1 gap-3 sm:columns-2 sm:gap-4 xl:columns-3" role="status" aria-label="Yükleniyor">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="mb-3 break-inside-avoid sm:mb-4">
          <PromptCardSkeleton />
        </div>
      ))}
    </div>
  );
}
