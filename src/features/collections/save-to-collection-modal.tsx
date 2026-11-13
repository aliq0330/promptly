"use client";

import { useEffect, useRef, useState } from "react";
import { Bookmark } from "@/components/icons/bookmark";
import { Check } from "@/components/icons/check";
import { FolderPlus } from "@/components/icons/folder-plus";
import { Loader2 } from "@/components/icons/loader-2";
import { Plus } from "@/components/icons/plus";
import { X } from "@/components/icons/x";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { CollectionForm } from "./collection-form";
import { useAuth } from "@/features/auth/auth-provider";
import { useOwnProfile } from "@/features/auth/own-profile-provider";
import {
  addItemToCollection,
  createCollection,
  fetchCollectionIdsContaining,
  fetchIsSaved,
  fetchOwnCollections,
  removeFromCollection,
  unsaveWork,
} from "@/lib/supabase/collections";
import type { LikeableContentType } from "@/lib/supabase/likes";
import { applyMembershipResult, diffMembership, savedAfterCommit } from "@/lib/saved-selection";

/** See `use-save-state.ts`'s identical note — saving never targets a request. */
type SaveableContentType = Extract<LikeableContentType, "prompt" | "workflow" | "preset" | "community_post">;
import { placeholderArt } from "@/lib/placeholder-image";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { Collection } from "@/types";
import { StorageBackground } from "@/components/ui/storage-media";
import { iconButtonClassName } from "@/components/ui/icon-button";

/**
 * "Koleksiyona ekle" — the one place a work's collection memberships are changed (docs/history/336-*). Saving and
 * collections are separate: the bookmark saves a work on its own ("Kaydedilenlerin tümü"), and this sheet then files it
 * into any number of the viewer's collections. Every collection is listed with a tick on the ones holding the work;
 * leaving a collection only takes it out of that one, it stays saved. Adding an unsaved work to a collection saves it
 * as well (the database does it). The only way to stop a work being saved is "Kaydedilenlerden kaldır" at the bottom:
 * it removes the work from the saved area and from every collection.
 *
 * Ticks are a draft: nothing is written until "Kaydet", and closing the modal any other way (Vazgeç, ✕, Escape,
 * backdrop) changes nothing. Saving writes only the collections whose tick actually changed. Each write is
 * independent, so on a partial failure the modal re-syncs to what really happened, keeps the failed rows as a pending
 * draft and says so, instead of claiming success. The bookmark is told about unsaved → saved (`onAdded`) and
 * "Kaydedilenlerden kaldır" (`onRemoved`) only. "+ Yeni koleksiyon oluştur" swaps this SAME modal's content to the
 * create form; the new collection (a real, explicit create) is ticked in the draft.
 *
 * Pass exactly one of `promptId`/`workflowId`/`presetId`/`communityPostId`.
 */
export function SaveToCollectionModal({
  promptId,
  workflowId,
  presetId,
  communityPostId,
  onClose,
  onAdded,
  onRemoved,
}: {
  promptId?: string;
  workflowId?: string;
  presetId?: string;
  communityPostId?: string;
  onClose: () => void;
  /** Called when adding to a collection saved a work that was not saved yet — lets the caller (SaveButton) fill the bookmark without waiting for a refetch. */
  onAdded?: () => void;
  /** Called after "Kaydedilenlerden kaldır" — empties the bookmark without a refetch. */
  onRemoved?: () => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { profile } = useOwnProfile();

  const contentId = (communityPostId ?? presetId ?? workflowId ?? promptId)!;
  const contentType: SaveableContentType = communityPostId ? "community_post" : presetId ? "preset" : workflowId ? "workflow" : "prompt";

  const [view, setView] = useState<"list" | "create">("list");
  const [collections, setCollections] = useState<Collection[]>([]);
  /** Whether the work is saved at all ("Kaydedilenlerin tümü"), as last read or confirmed by a write. */
  const [isSaved, setIsSaved] = useState(false);
  /** The collections the database holds the work in right now (as last read or confirmed by a write). */
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  /** The draft: what the ticks currently say. */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmingUnsave, setConfirmingUnsave] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The saved state the parent last heard about — so each commit reports a transition at most once. */
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
    Promise.all([fetchOwnCollections(user.id), fetchCollectionIdsContaining(contentId, user.id, contentType), fetchIsSaved(contentId, user.id, contentType)])
      .then(([ownCollections, ids, saved]) => {
        if (cancelled) return;
        setCollections(ownCollections);
        setSavedIds(ids);
        setSelectedIds(new Set(ids));
        setIsSaved(saved);
        reportedSavedRef.current = saved;
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

  function handleToggle(collectionId: string) {
    if (saving) return;
    setError(null);
    setConfirmingUnsave(false);
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

    // Adding an unsaved work to a collection saved it too; removing from collections never changes the saved state.
    if (savedAfterCommit(reportedSavedRef.current, appliedAdd.length)) {
      reportedSavedRef.current = true;
      setIsSaved(true);
      onAdded?.();
    }

    savingRef.current = false;
    setSaving(false);
    if (firstError) {
      setError(firstError instanceof Error && firstError.message ? firstError.message : t("common.actionFailedRetry"));
      return;
    }
    onClose();
  }

  /** "Kaydedilenlerden kaldır": two taps (the second confirms), then the work leaves the saved area and every collection. */
  async function handleUnsave() {
    if (!user || savingRef.current) return;
    if (!confirmingUnsave) {
      setConfirmingUnsave(true);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      await unsaveWork(contentId, contentType);
      reportedSavedRef.current = false;
      onRemoved?.();
      savingRef.current = false;
      setSaving(false);
      onClose();
    } catch (err) {
      savingRef.current = false;
      setSaving(false);
      setConfirmingUnsave(false);
      setError(err instanceof Error && err.message ? err.message : t("common.actionFailedRetry"));
    }
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
        className="flex max-h-[85dvh] w-full max-w-md flex-col rounded-lg border border-border bg-surface p-5 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 id="save-modal-title" className="text-body font-semibold text-text">
              {view === "create" ? t("collection.createNewTitle") : t("collection.addToTitle")}
            </h2>
            {view === "list" && (
              <p className="text-caption text-text-muted">{isSaved ? t("collection.manageHint") : t("collection.pickToSaveHint")}</p>
            )}
          </div>
          <button type="button" onClick={requestClose} aria-label={t("common.close")} className={iconButtonClassName(false, "h-8 w-8 rounded-md")}>
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
                <p className="py-8 text-center text-small text-text-muted">{t("common.loading")}</p>
              ) : loadFailed ? (
                <p className="py-8 text-center text-small text-danger">{t("common.actionFailedRetry")}</p>
              ) : collections.length === 0 ? (
                <div className="space-y-3 py-4 text-center">
                  <FolderPlus size={28} className="mx-auto text-text-muted" />
                  <p className="text-small text-text-muted">{t("collection.noneYetHint")}</p>
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
                      className="flex w-full items-center gap-3 rounded-md border border-border p-2 text-left transition-colors hover:bg-accent-surface/50 disabled:opacity-50"
                    >
                      <StorageBackground
                        as="span"
                        url={collection.coverImage?.url}
                        fallback={placeholderArt(collection.id, 88, 88)}
                        className="h-11 w-11 shrink-0 rounded-md bg-cover bg-center"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="block truncate text-small font-medium text-text">{collection.name}</span>
                        </span>
                        <span className="text-caption text-text-muted">{t("collection.itemCount", { count: collection.itemCount })}</span>
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
              {error && <p className="text-small text-danger">{error}</p>}
            </div>

            <button
              type="button"
              onClick={() => setView("create")}
              disabled={saving || loadFailed}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-border py-2.5 text-small font-medium text-text transition-colors hover:bg-accent-surface disabled:opacity-50"
            >
              <Plus size={16} />
              {t("collection.createNewTitle")}
            </button>

            {isSaved && !loading && !loadFailed && (
              <button
                type="button"
                onClick={handleUnsave}
                disabled={saving}
                data-unsave-button=""
                className={cn(
                  "mt-2 flex w-full items-center justify-center gap-2 rounded-md py-2.5 text-small font-medium transition-colors disabled:opacity-50",
                  confirmingUnsave ? "bg-danger text-danger-foreground" : "text-danger hover:bg-surface-soft",
                )}
              >
                <Bookmark size={16} />
                {confirmingUnsave ? t("collection.removeFromSavedConfirm") : t("collection.removeFromSaved")}
              </button>
            )}

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
