"use client";

import { DetailSkeleton, NotFoundBlock } from "@/components/ui/detail-skeleton";
import { CollectionBand } from "./collection-band";
import { CollectionAside } from "./collection-aside";
import { CollectionEntryList } from "./collection-entry-list";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BAND_PRIMARY_CLASS, BandActionRow, DetailShell } from "@/features/content/detail-parts";
import { ContentGridColumns } from "@/features/content/content-card";
import { ShareButton } from "@/features/prompts/share-button";
import { Portal } from "@/components/ui/portal";
import { refreshSaveState } from "@/features/prompts/use-save-state";
import { CollectionFormModal } from "./collection-form-modal";
import { CollectionMoreMenu } from "./collection-more-menu";
import { CollectionFollowButton } from "./collection-follow-button";
import { useAuth } from "@/features/auth/auth-provider";
import {
  fetchCollectionById,
  fetchCollectionItems,
  removeFromCollection,
  updateCollection,
  type CollectionEntry,
} from "@/lib/supabase/collections";
import { collectionHref } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { Collection } from "@/types";

/**
 * `/collections/local?id=` — every collection is a real Supabase row, same
 * "unknown at build time, looked up client-side by query param" pattern as
 * `/prompts/local`/`/requests/local`/`/tags/local`. RLS already returns
 * `null` for a private collection the viewer doesn't own (Bölüm 19-style
 * "not found" and "private" collapse into the same honest empty state, same
 * ambiguity `fetchConversationForUser` already accepts) — this route never
 * needs its own extra access check, the query itself enforces it.
 *
 * A collection is one list among several: removing a work here takes it out
 * of THIS collection only — "Genel" is no exception — and it vanishes from
 * the list the moment the backend confirms, no refresh needed. Whether it is
 * still "saved" (and so still in "Kaydedilenler" with a filled bookmark)
 * depends only on whether another collection still holds it.
 */
export function CollectionDetailView() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get("id");

  const [collection, setCollection] = useState<Collection | null>(null);
  const [items, setItems] = useState<CollectionEntry[]>([]);
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
   * Calls the real backend removal FIRST and only on a confirmed success
   * splices the item out of local state — never optimistic. A failure leaves
   * the list as it was and shows an error instead of a false "removed".
   * Same single-collection removal for every collection, default or custom,
   * and every entry type; afterwards the shared bookmark state is re-read so
   * a work that is now in no collection stops showing as saved elsewhere.
   */
  async function handleRemoveItem(id: string, contentType: "prompt" | "workflow" | "preset" | "community_post") {
    if (!collection) return;
    await removeFromCollection(collection.id, id, contentType);
    setItems((prev) => prev.filter((entry) => !(entry.type === contentType && entry.data.id === id)));
    setCollection((prev) => (prev ? { ...prev, itemCount: Math.max(0, prev.itemCount - 1) } : prev));
    showToast(t("collection.removedFromCollectionToast"));
    if (user) void refreshSaveState(id, contentType, user.id);
  }

  if (!id || (loaded && !collection)) {
    return <NotFoundBlock title={t("collection.notFoundTitle")} description={t("collection.notFoundDescription")} />;
  }

  if (!loaded || !collection) {
    return <DetailSkeleton />;
  }

  const isOwner = user?.id === collection.owner.id;

  return (
    // Albüm (docs/history/203-*): band (collage art) · actions row · [the list | Hakkında + the owner's other collections from `lg`].
    <ContentGridColumns value="sm:columns-2">
      <DetailShell
        band={<CollectionBand collection={collection} items={items} />}
        actions={
          <BandActionRow label={t("collection.actionsAria")} data-collection-actions="">
            {isOwner ? (
              <Button type="button" size="lg" className={BAND_PRIMARY_CLASS} onClick={() => setEditing(true)}>
                <Pencil size={18} aria-hidden />
                {t("collection.editTitle")}
              </Button>
            ) : (
              collection.visibility === "public" && (
                <CollectionFollowButton
                  collectionId={collection.id}
                  className={BAND_PRIMARY_CLASS}
                  onCountChange={(delta) => setCollection((prev) => (prev ? { ...prev, followerCount: Math.max(0, prev.followerCount + delta) } : prev))}
                />
              )
            )}
            {collection.visibility === "public" && (
              <ShareButton url={collectionHref(collection)} title={collection.name} className="h-11 min-w-11 rounded-full px-3" />
            )}
            {isOwner && (
              <div className="ml-auto">
                <CollectionMoreMenu
                  collection={collection}
                  triggerClassName="h-10 w-10 bg-transparent text-text-secondary shadow-none"
                  onEdit={() => setEditing(true)}
                  onDeleted={() => router.push(`/profile/real?username=${collection.owner.username}`)}
                />
              </div>
            )}
          </BandActionRow>
        }
        aside={<CollectionAside collection={collection} />}
      >
        <div className="space-y-4">
          <CollectionEntryList
            items={items}
            searchPlaceholderKey="collection.searchPlaceholder"
            emptyTitleKey="collection.emptyItemsTitle"
            emptyDescriptionKey="collection.emptyItemsDescription"
            removalFor={isOwner ? (entry) => ({ onRemove: () => handleRemoveItem(entry.data.id, entry.type) }) : undefined}
          />
        </div>
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
              className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[60] flex justify-center px-4 md:bottom-6"
            >
              <div className="animate-pop-in rounded-md bg-text px-3.5 py-2 text-small text-background shadow-pop">{toast}</div>
            </div>
          </Portal>
        )}
      </DetailShell>
    </ContentGridColumns>
  );
}
