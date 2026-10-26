"use client";

import Link from "next/link";
import { Bookmark, FolderOpen } from "lucide-react";
import { CollectionCover } from "@/features/collections/collection-card";
import { collectionHref } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { Collection } from "@/types";

/**
 * A profile's public collections as a strip of round covers (Meydan, docs/history/192-*) — the same
 * shape as Home's community rings, but the ring is the brand colour and the picture is the collection's
 * own cover (its newest item's media, else a calm icon tile). Each ring opens the collection. Nothing is
 * drawn without a collection to show: only public, non-empty ones are passed in (`fetchPublicCollectionsByOwner`).
 * The second group of the profile's `ProfileRail` (docs/history/243-*): no scroll row of its own.
 */
export function CollectionRings({ collections }: { collections: Collection[] }) {
  const { t } = useTranslation();
  if (collections.length === 0) return null;
  return (
    // Hikâye öne çıkanlarından ince çizgiyle ayrılır; onlar yoksa (şeridin ilk grubuysa) çizgi de yoktur.
    <div
      role="group"
      aria-label={t("profile.collectionRingsLabel")}
      data-collection-rings
      data-rail-group=""
      className="flex shrink-0 gap-4 border-l border-border-soft pl-4 first:border-l-0 first:pl-0"
    >
      {collections.map((collection) => (
        <Link
          key={collection.id}
          href={collectionHref(collection)}
          title={t("collection.itemCount", { count: collection.itemCount })}
          className="group flex w-[68px] shrink-0 flex-col items-center gap-1.5 rounded-md text-center"
        >
          <span className="flex rounded-full border-[2.5px] border-primary/70 p-[3px] transition-transform duration-200 ease-soft group-active:scale-95">
            {collection.coverImage?.url ? (
              <CollectionCover collection={collection} className="h-[54px] w-[54px] overflow-hidden rounded-full" />
            ) : (
              <span className="flex h-[54px] w-[54px] items-center justify-center rounded-full bg-primary-soft text-primary">
                {collection.isDefault ? <Bookmark size={22} strokeWidth={1.75} aria-hidden /> : <FolderOpen size={22} strokeWidth={1.75} aria-hidden />}
              </span>
            )}
          </span>
          <span className="w-full truncate text-caption text-text-secondary">{collection.name}</span>
        </Link>
      ))}
    </div>
  );
}
