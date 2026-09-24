"use client";

import { useEffect, useState } from "react";
import { Check, FolderPlus, Loader2, Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { CollectionForm } from "./collection-form";
import { useAuth } from "@/features/auth/auth-provider";
import { useOwnProfile } from "@/features/auth/own-profile-provider";
import {
  addItemToCollection,
  createCollection,
  fetchCollectionIdsContaining,
  fetchOwnCollections,
  removeFromCollection,
} from "@/lib/supabase/collections";
import type { LikeableContentType as SaveableContentType } from "@/lib/supabase/likes";
import { placeholderArt } from "@/lib/placeholder-image";
import { cn } from "@/lib/utils";
import type { Collection } from "@/types";

/**
 * "Kaydet" — opened only from an outline (not-yet-saved) bookmark; a filled
 * bookmark never opens this again, it removes directly (see SaveButton).
 * Lists the viewer's own collections — the default "Genel" one always
 * included and shown first (`fetchOwnCollections` sorts it first and
 * self-heals it into existence if it's somehow missing) — with a real
 * add/remove-per-row toggle. Every row behaves symmetrically now (Bölüm
 * 9.38): adding to ANY collection — default or custom — fills the outer
 * bookmark, and it only unfills again once the item has been removed from
 * every collection this modal shows (tracked via `memberIds.size`
 * transitioning to/from zero, not by checking `collection.isDefault`).
 * This replaced the original Bölüm 9.22 rule, where only the default row
 * controlled the bookmark and a custom-collection-only save left it
 * unfilled — confirmed as an explicit, intentional reversal with the user
 * (AskUserQuestion) rather than assumed. "+ Yeni koleksiyon oluştur" swaps
 * this SAME modal's content to the create form (never a second, stacked
 * modal — see `view` state below), and a collection created from here
 * auto-adds the current work so the user never has to repeat the toggle.
 *
 * Pass exactly one of `promptId`/`generatorId` — a generator saves through
 * this SAME multi-collection modal a prompt does (Bölüm 9.36's Prompt/
 * Generator parity pass), so the same "Film fikirleri" collection can hold
 * both.
 */
export function SaveToCollectionModal({
  promptId,
  generatorId,
  onClose,
  onAdded,
  onRemoved,
}: {
  promptId?: string;
  generatorId?: string;
  onClose: () => void;
  /** Called once when the item's collection-membership count goes from 0 to 1+ (first save into ANY collection, Bölüm 9.38) — lets the caller (SaveButton) reflect the general bookmark filling in immediately, without waiting for a refetch. */
  onAdded?: () => void;
  /** Called once when the item's collection-membership count drops from 1+ to 0 (removed from the LAST collection that still had it, Bölüm 9.38) — mirrors `onAdded`, keeps the outer bookmark icon's state honest without a refetch. */
  onRemoved?: () => void;
}) {
  const { user } = useAuth();
  const { profile } = useOwnProfile();

  const isGenerator = Boolean(generatorId);
  const contentId = (generatorId ?? promptId)!;
  const contentType: SaveableContentType = isGenerator ? "generator" : "prompt";

  const [view, setView] = useState<"list" | "create">("list");
  const [collections, setCollections] = useState<Collection[]>([]);
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- nothing to fetch while signed out
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([fetchOwnCollections(user.id), fetchCollectionIdsContaining(contentId, user.id, contentType)]).then(
      ([ownCollections, ids]) => {
        if (cancelled) return;
        setCollections(ownCollections);
        setMemberIds(ids);
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [user, contentId, contentType]);

  /**
   * Every row — default ("Genel") or custom — toggles symmetrically: a
   * plain per-collection add/remove, never a cascade (Bölüm 9.38). The
   * outer bookmark's `onAdded`/`onRemoved` fire only on the two real
   * transitions that matter to it: going from zero collections to one-plus
   * (first save anywhere), and dropping from one-plus back to zero (no
   * longer saved anywhere) — checked from `memberIds.size` before and after
   * the toggle, not from `collection.isDefault`. Cascading removal from
   * EVERY collection at once is still a real, separate action
   * (`removeFromSavedEverywhere`) — it's what tapping the already-filled
   * bookmark icon itself does (see SaveButton), and what removing an item
   * from inside the "Kaydedilenler" (Genel) detail page does
   * (CollectionDetailView) — this modal's own per-row toggle deliberately
   * doesn't duplicate that here.
   */
  async function handleToggle(collection: Collection) {
    if (!user || pendingIds.has(collection.id)) return;
    const isMember = memberIds.has(collection.id);
    const wasSavedAnywhere = memberIds.size > 0;
    setPendingIds((prev) => new Set(prev).add(collection.id));
    setError(null);

    // Optimistic (single-collection add/remove).
    setMemberIds((prev) => {
      const next = new Set(prev);
      if (isMember) next.delete(collection.id);
      else next.add(collection.id);
      return next;
    });
    setCollections((prev) =>
      prev.map((c) => (c.id === collection.id ? { ...c, itemCount: c.itemCount + (isMember ? -1 : 1) } : c)),
    );

    try {
      if (isMember) {
        await removeFromCollection(collection.id, contentId, contentType);
        if (wasSavedAnywhere && memberIds.size - 1 === 0) onRemoved?.();
      } else {
        await addItemToCollection(collection.id, contentId, contentType);
        if (!wasSavedAnywhere) onAdded?.();
      }
    } catch (err) {
      // Rollback.
      setMemberIds((prev) => {
        const next = new Set(prev);
        if (isMember) next.add(collection.id);
        else next.delete(collection.id);
        return next;
      });
      setCollections((prev) =>
        prev.map((c) => (c.id === collection.id ? { ...c, itemCount: c.itemCount + (isMember ? 1 : -1) } : c)),
      );
      setError(err instanceof Error ? err.message : "İşlem başarısız oldu, lütfen tekrar dene.");
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(collection.id);
        return next;
      });
    }
  }

  async function handleCreate(values: { name: string; visibility: "public" | "private" }) {
    if (!user || !profile) throw new Error("Koleksiyon oluşturmak için giriş yapmalısın.");
    const created = await createCollection(values, user.id, profile);
    await addItemToCollection(created.id, contentId, contentType);
    setCollections((prev) => [{ ...created, itemCount: 1 }, ...prev]);
    setMemberIds((prev) => new Set(prev).add(created.id));
    setView("list");
  }

  return (
    <Modal onClose={onClose} labelledBy="save-modal-title">
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col rounded-lg border border-border bg-surface p-5 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 id="save-modal-title" className="text-base font-semibold text-text">
              {view === "create" ? "Yeni koleksiyon oluştur" : "Kaydet"}
            </h2>
            {view === "list" && <p className="text-xs text-text-muted">Bu çalışmayı kaydetmek için bir koleksiyon seç.</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Kapat" className="rounded-md p-1 text-text-muted hover:bg-accent-surface hover:text-text">
            <X size={18} />
          </button>
        </div>

        {view === "create" ? (
          <div className="mt-4">
            <CollectionForm submitLabel="Oluştur" onCancel={() => setView("list")} onSubmit={handleCreate} />
          </div>
        ) : (
          <>
            <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto">
              {loading ? (
                <p className="py-8 text-center text-sm text-text-muted">Yükleniyor…</p>
              ) : collections.length === 0 ? (
                <div className="space-y-3 py-4 text-center">
                  <FolderPlus size={28} className="mx-auto text-text-muted" />
                  <p className="text-sm text-text-muted">Henüz bir koleksiyonun yok. İlk koleksiyonunu oluşturarak başla.</p>
                </div>
              ) : (
                collections.map((collection) => {
                  const isMember = memberIds.has(collection.id);
                  const isPending = pendingIds.has(collection.id);
                  return (
                    <button
                      key={collection.id}
                      type="button"
                      onClick={() => handleToggle(collection)}
                      disabled={isPending}
                      className="flex w-full items-center gap-3 rounded-md border border-border p-2 text-left transition-colors hover:bg-accent-surface/50 disabled:opacity-70"
                    >
                      <span
                        className="h-11 w-11 shrink-0 rounded-md bg-cover bg-center"
                        style={{
                          backgroundImage: `url("${collection.coverImage?.url ?? placeholderArt(collection.id, 88, 88)}")`,
                        }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="block truncate text-sm font-medium text-text">{collection.name}</span>
                          {collection.isDefault && (
                            <Badge variant="accent" className="shrink-0">
                              Varsayılan
                            </Badge>
                          )}
                        </span>
                        <span className="text-xs text-text-muted">{collection.itemCount} çalışma</span>
                      </span>
                      <span
                        className={cn(
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors",
                          isMember ? "border-primary bg-primary text-primary-foreground" : "border-border text-text-muted",
                        )}
                      >
                        {isPending ? <Loader2 size={14} className="animate-spin" /> : isMember ? <Check size={14} /> : <Plus size={14} />}
                      </span>
                    </button>
                  );
                })
              )}
              {error && <p className="text-sm text-danger">{error}</p>}
            </div>

            <button
              type="button"
              onClick={() => setView("create")}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-border py-2.5 text-sm font-medium text-text transition-colors hover:bg-accent-surface"
            >
              <Plus size={16} />
              Yeni koleksiyon oluştur
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}
