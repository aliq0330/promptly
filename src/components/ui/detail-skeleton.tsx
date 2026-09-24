import { Skeleton } from "@/components/ui/skeleton";

/** Loading placeholder for every detail page (prompt, generator, request, tag, collection). */
export function DetailSkeleton() {
  return (
    <div className="mx-auto w-full max-w-6xl px-3 py-5 sm:px-5 sm:py-6 lg:px-8 lg:py-8" role="status" aria-label="Yükleniyor">
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-8">
        <div className="space-y-5">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-4 w-full max-w-xl" />
          <div className="flex items-center gap-2.5">
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-3.5 w-32" />
          </div>
          <Skeleton className="h-11 w-full rounded-md" />
          <Skeleton className="h-44 w-full rounded-lg" />
        </div>
        <div className="mt-6 hidden space-y-4 lg:mt-0 lg:block">
          <Skeleton className="h-36 w-full rounded-lg" />
          <Skeleton className="h-48 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}

/** Centered "not found" block for detail pages. */
export function NotFoundBlock({ title, description }: { title: string; description: string }) {
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-h2 font-semibold text-text">{title}</h1>
      <p className="mt-2 text-small text-text-muted">{description}</p>
    </div>
  );
}
