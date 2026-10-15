"use client";

import { useEffect, useRef, useState } from "react";
import { Check, FolderPlus, Loader2, Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import type { LikeableContentType } from "@/lib/supabase/likes";
import { applyMembershipResult, diffMembership, savedTransition } from "@/lib/saved-selection";

/** See `use-save-state.ts`'s identical note — saving never targets a request. */
type SaveableContentType = Extract<LikeableContentType, "prompt" | "workflow" | "preset">;
import { placeholderArt } from "@/lib/placeholder-image";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { Collection } from "@/types";
import { StorageBackground } from "@/components/ui/storage-media";

/**
 * The one place a work's collection memberships are changed. Opened from the
 * bookmark both when it is empty ("save it somewhere") and when it is filled
 * ("where is it saved? take it out of some of them"); "saved" means the work
 * is in at least one of the viewer's collections, so the modal lists every
 * collection with a tick on the ones that hold it.
 *
 * Ticks are a draft: nothing is written until "Kaydet", and closing the modal
 * any other way (Vazgeç, ✕, Escape, backdrop) changes nothing. Saving writes
 * only the collections whose tick actually changed — leaving one collection
 * never touches another. Each write is independent, so on a partial failure
 * the modal re-syncs to what really happened, keeps the failed rows as a
 * pending draft and says so, instead of claiming success. The bookmark is
 * told about the 0 ↔ 1+ memberships transition only (`onAdded`/`onRemoved`).
 * "+ Yeni koleksiyon oluştur" swaps this SAME modal's content to the create
 * form; the new collection (a real, explicit create) is ticked in the draft.
 *
 * Pass exactly one of `promptId`/`workflowId`/`presetId`.
 */
export function SaveToCollectionModal({
  promptId,
  workflowId,
  presetId,
  onClose,
  onAdded,
  onRemoved,
}: {
  promptId?: string;
  workflowId?: string;
  presetId?: string;
  onClose: () => void;
  /** Called when a save leaves the work in 1+ collections after it was in none — lets the caller (SaveButton) fill the bookmark without waiting for a refetch. */
  onAdded?: () => void;
  /** Called when a save leaves the work in no collection after it was in 1+ — empties the bookmark without a refetch. */
  onRemoved?: () => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { profile } = useOwnProfile();

  const contentId = (presetId ?? workflowId ?? promptId)!;
  const contentType: SaveableContentType = presetId ? "preset" : workflowId ? "workflow" : "prompt";

  const [view, setView] = useState<"list" | "create">("list");
  const [collections, setCollections] = useState<Collection[]>([]);
  /** What the database holds for this work right now (as last read or confirmed by a write). */
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  /** The draft: what the ticks currently say. */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The bookmark state the parent last heard about — so each commit reports a transition at most once. */
  const reportedSavedRef = useRef(false);
  const savingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- nothing to fetch while signed out
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadFailed(false);
    Promise.all([fetchOwnCollections(user.id), fetchCollectionIdsContaining(contentId, user.id, contentType)])
      .then(([ownCollections, ids]) => {
        if (cancelled) return;
        setCollections(ownCollections);
        setSavedIds(ids);
        setSelectedIds(new Set(ids));
        reportedSavedRef.current = ids.size > 0;
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, contentId, contentType]);

  const { add, remove } = diffMembership(savedIds, selectedIds);
  const isDirty = add.length > 0 || remove.length > 0;
  const wasSaved = savedIds.size > 0;

  function handleToggle(collectionId: string) {
    if (saving) return;
    setError(null);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(collectionId)) next.delete(collectionId);
      else next.add(collectionId);
      return next;
    });
  }

  /**
   * Writes the draft: only the changed rows, each on its own so one failure
   * can't undo or block the others. Whatever really went through becomes the
   * new `savedIds`; the modal closes only when everything did.
   */
  async function handleCommit() {
    if (!user || savingRef.current || !isDirty) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);

    const writes = [
      ...add.map((collectionId) => ({ collectionId, kind: "add" as const })),
      ...remove.map((collectionId) => ({ collectionId, kind: "remove" as const })),
    ];
    const results = await Promise.allSettled(
      writes.map((write) =>
        write.kind === "add"
          ? addItemToCollection(write.collectionId, contentId, contentType)
          : removeFromCollection(write.collectionId, contentId, contentType),
      ),
    );

    const appliedAdd: string[] = [];
    const appliedRemove: string[] = [];
    let firstError: unknown = null;
    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        (writes[index].kind === "add" ? appliedAdd : appliedRemove).push(writes[index].collectionId);
      } else {
        firstError ??= result.reason;
      }
    });

    const nextSaved = applyMembershipResult(savedIds, appliedAdd, appliedRemove);
    setSavedIds(nextSaved);
    setCollections((prev) =>
      prev.map((c) => ({
        ...c,
        itemCount: Math.max(0, c.itemCount + (appliedAdd.includes(c.id) ? 1 : 0) - (appliedRemove.includes(c.id) ? 1 : 0)),
      })),
    );

    const transition = savedTransition(reportedSavedRef.current, nextSaved.size);
    if (transition) {
      reportedSavedRef.current = nextSaved.size > 0;
      if (transition === "saved") onAdded?.();
      else onRemoved?.();
    }

    savingRef.current = false;
    setSaving(false);
    if (firstError) {
      setError(firstError instanceof Error && firstError.message ? firstError.message : t("common.actionFailedRetry"));
      return;
    }
    onClose();
  }

  /** Closing discards the draft, but never while a write is in flight (it would hide a failure). */
  function requestClose() {
    if (!savingRef.current) onClose();
  }

  async function handleCreate(values: { name: string; visibility: "public" | "private" }) {
    if (!user || !profile) throw new Error(t("collection.loginRequiredToCreate"));
    const created = await createCollection(values, user.id, profile);
    setCollections((prev) => [created, ...prev]);
    setSelectedIds((prev) => new Set(prev).add(created.id));
    setView("list");
  }

  return (
    <Modal onClose={requestClose} labelledBy="save-modal-title">
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col rounded-lg border border-border bg-surface p-5 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 id="save-modal-title" className="text-base font-semibold text-text">
              {view === "create" ? t("collection.createNewTitle") : wasSaved ? t("collection.manageTitle") : t("common.save")}
            </h2>
            {view === "list" && (
              <p className="text-xs text-text-muted">{wasSaved ? t("collection.manageHint") : t("collection.pickToSaveHint")}</p>
            )}
          </div>
          <button type="button" onClick={requestClose} aria-label={t("common.close")} className="rounded-md p-1 text-text-muted hover:bg-accent-surface hover:text-text">
            <X size={18} />
          </button>
        </div>

        {view === "create" ? (
          <div className="mt-4">
            <CollectionForm submitLabel={t("common.create")} onCancel={() => setView("list")} onSubmit={handleCreate} />
          </div>
        ) : (
          <>
            <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto">
              {loading ? (
                <p className="py-8 text-center text-sm text-text-muted">{t("common.loading")}</p>
              ) : loadFailed ? (
                <p className="py-8 text-center text-sm text-danger">{t("common.actionFailedRetry")}</p>
              ) : collections.length === 0 ? (
                <div className="space-y-3 py-4 text-center">
                  <FolderPlus size={28} className="mx-auto text-text-muted" />
                  <p className="text-sm text-text-muted">{t("collection.noneYetHint")}</p>
                </div>
              ) : (
                collections.map((collection) => {
                  const isMember = selectedIds.has(collection.id);
                  return (
                    <button
                      key={collection.id}
                      type="button"
                      onClick={() => handleToggle(collection.id)}
                      disabled={saving}
                      role="checkbox"
                      aria-checked={isMember}
                      className="flex w-full items-center gap-3 rounded-md border border-border p-2 text-left transition-colors hover:bg-accent-surface/50 disabled:opacity-70"
                    >
                      <StorageBackground
                        as="span"
                        url={collection.coverImage?.url}
                        fallback={placeholderArt(collection.id, 88, 88)}
                        className="h-11 w-11 shrink-0 rounded-md bg-cover bg-center"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="block truncate text-sm font-medium text-text">{collection.name}</span>
                          {collection.isDefault && (
                            <Badge variant="accent" className="shrink-0">
                              {t("collection.defaultBadge")}
                            </Badge>
                          )}
                        </span>
                        <span className="text-xs text-text-muted">{t("collection.itemCount", { count: collection.itemCount })}</span>
                      </span>
                      <span
                        className={cn(
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors",
                          isMember ? "border-primary bg-primary text-primary-foreground" : "border-border text-text-muted",
                        )}
                      >
                        {isMember ? <Check size={14} /> : <Plus size={14} />}
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
              disabled={saving || loadFailed}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-border py-2.5 text-sm font-medium text-text transition-colors hover:bg-accent-surface disabled:opacity-50"
            >
              <Plus size={16} />
              {t("collection.createNewTitle")}
            </button>

            <div className="mt-3 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={requestClose} disabled={saving}>
                {t("common.cancel")}
              </Button>
              <Button type="button" onClick={handleCommit} disabled={!isDirty || saving || loading || loadFailed}>
                {saving && <Loader2 size={14} className="animate-spin" />}
                {saving ? t("common.saving") : t("common.save")}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
