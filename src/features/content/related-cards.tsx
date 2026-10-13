"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { StorageImage } from "@/components/ui/storage-media";
import { Skeleton } from "@/components/ui/skeleton";

export interface RelatedCardItem {
  id: string;
  href: string;
  title: string;
  meta: string;
  icon: LucideIcon;
  /** The post's first picture, when it has one — shown instead of the icon. */
  image?: { url: string; alt: string } | null;
}

/**
 * The "Benzer" blocks' content: two-up cards that lead with the post's picture
 * (an icon tile when it has none), then title and meta — pictures make a related
 * list scannable and give it more presence than a plain text list.
 */
export function RelatedCards({ items }: { items: RelatedCardItem[] }) {
  return (
    <ul className="grid grid-cols-2 gap-2.5 p-2.5">
      {items.map((item) => (
        <li key={item.id} className="min-w-0">
          <Link
            href={item.href}
            className="group block overflow-hidden rounded-md border border-border-soft bg-surface transition-colors duration-200 ease-soft hover:border-border-strong"
          >
            <span className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden bg-surface-soft">
              {item.image ? (
                <StorageImage src={item.image.url} alt={item.image.alt} fill sizes="(min-width: 1024px) 140px, 45vw" className="object-cover" />
              ) : (
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary-soft text-primary">
                  <item.icon size={18} strokeWidth={1.75} />
                </span>
              )}
            </span>
            <span className="block space-y-0.5 px-2.5 py-2 leading-tight">
              <span className="line-clamp-2 break-words text-label font-semibold text-text transition-colors group-hover:text-primary">{item.title}</span>
              <span className="block truncate text-caption text-text-muted">{item.meta}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Placeholder with the same footprint while a related list loads. */
export function RelatedCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 p-2.5" aria-hidden>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="space-y-2">
          <Skeleton className="aspect-[4/3] w-full rounded-md" />
          <Skeleton className="h-3 w-4/5" />
        </div>
      ))}
    </div>
  );
}
