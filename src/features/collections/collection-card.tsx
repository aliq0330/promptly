"use client";

import Link from "next/link";
import { Bookmark, FolderOpen, Globe, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CollectionMoreMenu } from "./collection-more-menu";
import { cn, collectionHref } from "@/lib/utils";
import type { Collection } from "@/types";

/** One collection in the profile "Koleksiyonlar" grid — cover, name, item count, visibility, and (owner-only) manage menu. */
export function CollectionCard({
  collection,
  onEdit,
  onDeleted,
}: {
  collection: Collection;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  return (
    <article className="group relative min-w-0">
      {/* Two offset "pages" behind the cover — a quiet library-stack motif. */}
      <div aria-hidden className="absolute inset-x-3 -top-1.5 h-4 rounded-t-md border border-border-soft bg-surface-soft" />
      <div aria-hidden className="absolute inset-x-1.5 -top-0.5 h-4 rounded-t-md border border-border-soft bg-surface" />
      <div className="relative overflow-hidden rounded-lg border border-border-soft bg-surface shadow-card transition-[border-color,box-shadow] duration-200 group-hover:border-border group-hover:shadow-card-hover">
        <Link href={collectionHref(collection)} className="block">
          <CollectionCover collection={collection} className="aspect-[4/3] w-full" />
          <div className="min-w-0 space-y-1 p-3">
            <div className="flex min-w-0 items-center gap-1.5">
              <p className="truncate text-label font-semibold text-text">{collection.name}</p>
              {collection.isDefault && (
                <Badge variant="default" className="shrink-0">
                  Varsayılan
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-caption text-text-muted">
              <span className="shrink-0 tabular-nums">{collection.itemCount} çalışma</span>
              <span className="flex shrink-0 items-center gap-1">
                {collection.visibility === "public" ? <Globe size={12} /> : <Lock size={12} />}
                {collection.visibility === "public" ? "Herkese açık" : "Sadece ben"}
              </span>
            </div>
          </div>
        </Link>
        <div className="absolute right-2 top-2 z-10 rounded-md bg-surface/90 backdrop-blur-sm">
          <CollectionMoreMenu collection={collection} onEdit={onEdit} onDeleted={onDeleted} />
        </div>
      </div>
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
    return <div className={cn("bg-surface-soft bg-cover bg-center", className)} style={{ backgroundImage: `url("${collection.coverImage.url}")` }} />;
  }
  return (
    <div className={cn("flex items-center justify-center bg-surface-soft text-primary", className)}>
      <span className="flex h-12 w-12 items-center justify-center rounded-md bg-primary-soft">
        {collection.isDefault ? <Bookmark size={22} strokeWidth={1.75} /> : <FolderOpen size={22} strokeWidth={1.75} />}
      </span>
    </div>
  );
}
