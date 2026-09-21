"use client";

import Link from "next/link";
import { Globe, Lock } from "lucide-react";
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
    <div className="group relative overflow-hidden rounded-lg border border-border bg-surface">
      <Link href={collectionHref(collection)} className="block">
        <div
          className="aspect-square w-full bg-cover bg-center"
          style={{ backgroundImage: `url("${collection.coverImage?.url ?? placeholderArt(collection.id, 320, 320)}")` }}
        />
        <div className="space-y-1 p-3">
          <p className="truncate text-sm font-medium text-text">{collection.name}</p>
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <span>{collection.itemCount} çalışma</span>
            <span className="flex items-center gap-1">
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
