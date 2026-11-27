"use client";

import type { IconComponent } from "@/components/icons/icon";
import { ContentRowSmall } from "@/features/content/content-row";
import { Skeleton } from "@/components/ui/skeleton";

export interface RelatedCardItem {
  id: string;
  href: string;
  title: string;
  meta: string;
  icon: IconComponent;
  /** The post's first picture, when it has one — shown instead of the icon. */
  image?: { url: string; alt: string } | null;
}

/**
 * The "Benzer" blocks' content (docs/history/477-*, "D · Yatay satır", small size): a column of rows — a 56 px cover (the type's icon on a
 * soft tile when the post has no picture), the title (two lines) and one meta line — which shows more posts in the 300 px side column
 * than the old two-up cards did and never cuts a title.
 */
export function RelatedCards({ items }: { items: RelatedCardItem[] }) {
  return (
    <ul className="divide-y divide-border-soft px-4" data-related-rows="">
      {items.map((item) => (
        <li key={item.id} className="min-w-0">
          <ContentRowSmall size="xs" href={item.href} icon={item.icon} image={item.image?.url ?? null} title={item.title} meta={item.meta} />
        </li>
      ))}
    </ul>
  );
}

/** Placeholder with the same footprint while a related list loads. */
export function RelatedCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="divide-y divide-border-soft px-4" aria-hidden>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex items-center gap-3 py-3">
          <Skeleton className="h-14 w-14 shrink-0 rounded-sm" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
