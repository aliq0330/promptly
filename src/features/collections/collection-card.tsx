"use client";

import Link from "next/link";
import { Bookmark, FolderOpen, Globe, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CollectionMoreMenu } from "./collection-more-menu";
import { cn, collectionHref } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { Collection } from "@/types";
import { StorageBackground, StorageImage } from "@/components/ui/storage-media";
import { CardBandBackdrop } from "@/features/content/content-card";

/** One collection in the profile "Koleksiyonlar" grid — cover, name, item count, visibility, and (owner-only) manage menu. */
export function CollectionCard({
  collection,
  onEdit,
  onDeleted,
  readOnly = false,
}: {
  collection: Collection;
  onEdit?: () => void;
  onDeleted?: () => void;
  /** Someone else's collection (a followed one, or on another profile): no manage menu, the owner is named instead of the visibility. */
  readOnly?: boolean;
}) {
  const { t } = useTranslation();
  return (
    // Albüm kartı (docs/history/203-*): the band takes the cover picture's colours; the cover as its art, the name big.
    <article className="group relative min-w-0 rounded-xl border border-border-soft bg-surface shadow-card transition-[border-color,box-shadow] duration-200 hover:border-border hover:shadow-card-hover">
      <Link href={collectionHref(collection)} className="block rounded-xl">
        <div className="relative rounded-t-xl p-2.5 pb-3">
          <CardBandBackdrop
            backdrop={collection.coverImage?.url ? <StorageImage src={collection.coverImage.url} alt="" fill sizes="240px" className="object-cover" /> : undefined}
          />
          <div className="relative space-y-2.5">
            <CollectionCover collection={collection} className="aspect-[4/3] w-full overflow-hidden rounded-lg shadow-pop" />
            <div className="min-w-0 space-y-0.5 px-1">
              <div className="flex min-w-0 items-center gap-1.5">
                <p className="truncate font-display text-[1.0625rem] font-extrabold leading-tight tracking-[-0.015em] text-text">{collection.name}</p>
                {collection.isDefault && (
                  <Badge variant="default" className="shrink-0">
                    {t("collection.defaultBadge")}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-3.5 py-2.5 text-caption text-text-muted">
          <span className="shrink-0 tabular-nums">{t("collection.itemCount", { count: collection.itemCount })}</span>
          {readOnly ? (
            <span className="min-w-0 truncate">{t("collection.byOwner", { name: collection.owner.displayName })}</span>
          ) : (
            <span className="flex shrink-0 items-center gap-1">
              {collection.visibility === "public" ? <Globe size={12} /> : <Lock size={12} />}
              {collection.visibility === "public" ? t("collection.visibilityPublicShort") : t("collection.visibilityPrivateShort")}
            </span>
          )}
        </div>
      </Link>
      {!readOnly && onEdit && onDeleted && (
        <div className="absolute right-4 top-4 z-10 rounded-full">
          <CollectionMoreMenu collection={collection} onEdit={onEdit} onDeleted={onDeleted} />
        </div>
      )}
    </article>
  );
}

/**
 * Collection cover: the most recent item's real image when there is one,
 * otherwise a calm token-colored tile (no decorative generated art — a
 * collection of prompts shouldn't pretend to be a photo album).
 */
export function CollectionCover({ collection, className }: { collection: Collection; className?: string }) {
  if (collection.coverImage?.url) {
    return <StorageBackground url={collection.coverImage.url} className={cn("bg-surface-soft bg-cover bg-center", className)} />;
  }
  return (
    <div className={cn("flex items-center justify-center bg-surface-soft text-primary", className)}>
      <span className="flex h-12 w-12 items-center justify-center rounded-md bg-primary-soft">
        {collection.isDefault ? <Bookmark size={22} strokeWidth={1.75} /> : <FolderOpen size={22} strokeWidth={1.75} />}
      </span>
    </div>
  );
}
