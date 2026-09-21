"use client";

import Link from "next/link";
import { Globe, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CollectionMoreMenu } from "./collection-more-menu";
import { placeholderArt } from "@/lib/placeholder-image";
import { collectionHref } from "@/lib/utils";
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
    <div className="group relative min-w-0 overflow-hidden rounded-lg border border-border bg-surface">
      <Link href={collectionHref(collection)} className="block">
        <div
          className="aspect-square w-full bg-cover bg-center"
          style={{ backgroundImage: `url("${collection.coverImage?.url ?? placeholderArt(collection.id, 320, 320)}")` }}
        />
        <div className="min-w-0 space-y-1 p-3">
          <div className="flex min-w-0 items-center gap-1.5">
            <p className="truncate text-sm font-medium text-text">{collection.name}</p>
            {collection.isDefault && (
              <Badge variant="accent" className="shrink-0">
                Varsayılan
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-text-muted">
            <span className="shrink-0">{collection.itemCount} çalışma</span>
            <span className="flex shrink-0 items-center gap-1">
              {collection.visibility === "public" ? <Globe size={12} /> : <Lock size={12} />}
              {collection.visibility === "public" ? "Herkese açık" : "Sadece ben"}
            </span>
          </div>
        </div>
      </Link>
      <div className="absolute right-2 top-2 z-10">
        <CollectionMoreMenu collection={collection} onEdit={onEdit} onDeleted={onDeleted} />
      </div>
    </div>
  );
}
