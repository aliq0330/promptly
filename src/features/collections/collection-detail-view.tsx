"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Globe, Lock } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Portal } from "@/components/ui/portal";
import { PromptCard } from "@/features/prompts/prompt-card";
import { CollectionFormModal } from "./collection-form-modal";
import { CollectionMoreMenu } from "./collection-more-menu";
import { useAuth } from "@/features/auth/auth-provider";
import {
  fetchCollectionById,
  fetchCollectionItems,
  removeFromCollection,
  removeFromSavedEverywhere,
  updateCollection,
} from "@/lib/supabase/collections";
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
 *
 * This is also where the bottom-nav "Kaydedilenler" shortcut (`/saved`)
 * redirects to for the viewer's own default collection — so removal here
 * has to be instant and correct for BOTH entry points at once (CLAUDE.md
 * Bölüm 9.22 §13, the "most critical UI bug": a removed post must vanish
 * from the list the moment the backend confirms it, no refresh needed).
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
  const [toast, setToast] = useState<string | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  function showToast(message: string) {
    setToast(message);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setToast(null), 2200);
  }

  /**
   * The critical fix (Bölüm 9.22 §13/§14): removal calls the real backend
   * operation FIRST, and only on a real, confirmed success does it splice
   * the item out of local state — never before, never optimistically. A
   * failure leaves the list exactly as it was and shows an error instead
   * of a false "removed" message. Which operation runs depends on whether
   * this IS the viewer's default collection (§9: removing from inside
   * Genel's own detail screen is the general cascade, not a scoped
   * single-collection removal) — two distinct, clearly separate backend
   * calls (§19), never the same one reused for both.
   */
  async function handleRemoveItem(promptId: string) {
    if (!collection) return;
    if (collection.isDefault) {
      await removeFromSavedEverywhere(promptId);
    } else {
      await removeFromCollection(collection.id, promptId);
    }
    setItems((prev) => prev.filter((prompt) => prompt.id !== promptId));
    setCollection((prev) => (prev ? { ...prev, itemCount: Math.max(0, prev.itemCount - 1) } : prev));
    showToast(collection.isDefault ? "Kaydedilenlerden kaldırıldı." : "Koleksiyondan kaldırıldı.");
  }

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
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold text-text">{collection.name}</h1>
              {collection.isDefault && <Badge variant="accent">Varsayılan</Badge>}
            </div>
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
        <div className="columns-1 gap-4 sm:columns-2 xl:columns-3">
          {items.map((prompt) => (
            <div key={prompt.id} className="mb-4 break-inside-avoid">
              <PromptCard
                prompt={prompt}
                collectionRemoval={
                  isOwner
                    ? { isDefault: collection.isDefault, onRemove: () => handleRemoveItem(prompt.id) }
                    : undefined
                }
              />
            </div>
          ))}
        </div>
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

      {toast && (
        <Portal>
          <div
            role="status"
            className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[60] flex justify-center px-4 lg:bottom-6"
          >
            <div className="rounded-md bg-text px-3 py-2 text-sm text-background shadow-lg">{toast}</div>
          </div>
        </Portal>
      )}
    </div>
  );
}
