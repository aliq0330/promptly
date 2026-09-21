"use client";

import { useEffect, useState } from "react";
import { Check, FolderPlus, Loader2, Plus, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { CollectionForm } from "./collection-form";
import { useAuth } from "@/features/auth/auth-provider";
import { useOwnProfile } from "@/features/auth/own-profile-provider";
import {
  addItemToCollection,
  createCollection,
  fetchCollectionIdsContaining,
  fetchOwnCollections,
  removeItemFromCollection,
} from "@/lib/supabase/collections";
import { placeholderArt } from "@/lib/placeholder-image";
import { cn } from "@/lib/utils";
import type { Collection } from "@/types";

/**
 * "Kaydet" — opened by the bookmark icon (SaveButton) instead of an instant
 * toggle. Lists the viewer's own collections with a real add/remove-per-row
 * toggle; "+ Yeni koleksiyon oluştur" swaps this SAME modal's content to the
 * create form (never a second, stacked modal — see `view` state below), and
 * a collection created from here auto-adds the current work so the user
 * never has to repeat the toggle.
 */
export function SaveToCollectionModal({
  promptId,
  onClose,
  onAdded,
}: {
  promptId: string;
  onClose: () => void;
  /** Called once after the first successful add to any collection — lets the caller (SaveButton) reflect the general bookmark filling in immediately, without waiting for a refetch. */
  onAdded?: () => void;
}) {
  const { user } = useAuth();
  const { profile } = useOwnProfile();

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
    Promise.all([fetchOwnCollections(user.id), fetchCollectionIdsContaining(promptId, user.id)]).then(
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
  }, [user, promptId]);

  async function handleToggle(collection: Collection) {
    if (!user || pendingIds.has(collection.id)) return;
    const isMember = memberIds.has(collection.id);
    setPendingIds((prev) => new Set(prev).add(collection.id));
    setError(null);

    // Optimistic.
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
        await removeItemFromCollection(collection.id, promptId);
      } else {
        await addItemToCollection(collection.id, promptId, user.id);
        onAdded?.();
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
    await addItemToCollection(created.id, promptId, user.id);
    onAdded?.();
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
                        <span className="block truncate text-sm font-medium text-text">{collection.name}</span>
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
              {error && <p className="text-sm text-red-500">{error}</p>}
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
