import { Skeleton } from "@/components/ui/skeleton";

export function ProfileHeaderSkeleton() {
  return (
    <div className="flex flex-col items-center gap-3 px-4 pt-8 text-center lg:px-6">
      <Skeleton className="h-20 w-20 rounded-full" />
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-3 w-56" />
      <div className="flex items-center gap-4 pt-1">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-16" />
      </div>
      <Skeleton className="h-9 w-28 rounded-md" />
    </div>
  );
}
