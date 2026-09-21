"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Globe, Lock } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { PromptGrid } from "@/features/prompts/prompt-grid";
import { CollectionFormModal } from "./collection-form-modal";
import { CollectionMoreMenu } from "./collection-more-menu";
import { useAuth } from "@/features/auth/auth-provider";
import { fetchCollectionById, fetchCollectionItems, updateCollection } from "@/lib/supabase/collections";
import { placeholderArt } from "@/lib/placeholder-image";
import { profileHref } from "@/lib/utils";
import Link from "next/link";
import type { Collection, Prompt } from "@/types";

/**
 * `/collections/local?id=` — every collection is a real Supabase row, same
 * "unknown at build time, looked up client-side by query param" pattern as
 * `/prompts/local`/`/requests/local`/`/tags/local`. RLS already returns
 * `null` for a private collection the viewer doesn't own (Bölüm 19-style
 * "not found" and "private" collapse into the same honest empty state, same
 * ambiguity `fetchConversationForUser` already accepts) — this route never
 * needs its own extra access check, the query itself enforces it.
 */
export function CollectionDetailView() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get("id");

  const [collection, setCollection] = useState<Collection | null>(null);
  const [items, setItems] = useState<Prompt[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- no id to look up, nothing async to wait on
      setLoaded(true);
      return;
    }
    setLoaded(false);
    Promise.all([fetchCollectionById(id), fetchCollectionItems(id)]).then(([foundCollection, foundItems]) => {
      if (cancelled) return;
      setCollection(foundCollection);
      setItems(foundCollection ? foundItems : []);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!id || (loaded && !collection)) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center text-sm text-text-muted">
        Koleksiyon bulunamadı — silinmiş veya sadece sahibine görünür olabilir.
      </div>
    );
  }

  if (!loaded || !collection) {
    return <p className="py-16 text-center text-sm text-text-muted">Yükleniyor…</p>;
  }

  const isOwner = user?.id === collection.owner.id;

  return (
    <div className="space-y-6 px-4 py-6 lg:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div
          className="h-32 w-32 shrink-0 rounded-lg bg-cover bg-center"
          style={{ backgroundImage: `url("${collection.coverImage?.url ?? placeholderArt(collection.id, 320, 320)}")` }}
        />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <h1 className="text-lg font-semibold text-text">{collection.name}</h1>
            {isOwner && (
              <CollectionMoreMenu
                collection={collection}
                onEdit={() => setEditing(true)}
                onDeleted={() => router.push(`/profile/real?username=${collection.owner.username}`)}
              />
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-muted">
            <span>{collection.itemCount} çalışma</span>
            <span className="flex items-center gap-1">
              {collection.visibility === "public" ? <Globe size={14} /> : <Lock size={14} />}
              {collection.visibility === "public" ? "Herkese açık" : "Sadece ben"}
            </span>
          </div>
          <Link href={profileHref(collection.owner)} className="flex w-fit items-center gap-2 text-sm text-text hover:underline">
            <Avatar src={collection.owner.avatarUrl} alt={collection.owner.displayName} size={20} />
            {collection.owner.displayName}
          </Link>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="py-10 text-center text-sm text-text-muted">Bu koleksiyonda henüz çalışma yok.</p>
      ) : (
        <PromptGrid prompts={items} />
      )}

      {editing && (
        <CollectionFormModal
          collection={collection}
          onClose={() => setEditing(false)}
          onSubmit={async (values) => {
            await updateCollection(collection.id, values);
            setCollection((prev) => (prev ? { ...prev, name: values.name, visibility: values.visibility } : prev));
            setEditing(false);
          }}
        />
      )}
    </div>
  );
}
