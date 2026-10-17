"use client";

import { PageContainer } from "@/components/ui/page-header";
import { DetailSkeleton, NotFoundBlock } from "@/components/ui/detail-skeleton";
import { CollectionCover } from "./collection-card";
import { CollectionEntryList } from "./collection-entry-list";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Globe, Lock } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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
import { profileHref } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import Link from "next/link";
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
    <PageContainer className="space-y-6">
      <header className="flex flex-col gap-4 rounded-lg border border-border-soft bg-surface p-4 shadow-card sm:flex-row sm:items-start sm:p-5">
        <CollectionCover collection={collection} className="h-24 w-24 shrink-0 rounded-md sm:h-28 sm:w-28" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h1 className="text-h1 font-semibold text-text">{collection.name}</h1>
              {collection.isDefault && <Badge variant="default">{t("collection.defaultBadge")}</Badge>}
            </div>
            {isOwner && (
              <CollectionMoreMenu
                collection={collection}
                onEdit={() => setEditing(true)}
                onDeleted={() => router.push(`/profile/real?username=${collection.owner.username}`)}
              />
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-text-muted">
            <span>{t("collection.itemCount", { count: collection.itemCount })}</span>
            {collection.visibility === "public" && (
              <span>{collection.followerCount === 1 ? t("collection.followerCountOne") : t("collection.followerCount", { count: collection.followerCount })}</span>
            )}
            <span className="flex items-center gap-1">
              {collection.visibility === "public" ? <Globe size={14} /> : <Lock size={14} />}
              {collection.visibility === "public" ? t("collection.visibilityPublicShort") : t("collection.visibilityPrivateShort")}
            </span>
          </div>
          <Link href={profileHref(collection.owner)} className="flex w-fit items-center gap-2 text-label font-medium text-text hover:text-primary">
            <Avatar src={collection.owner.avatarUrl} alt={collection.owner.displayName} size={20} />
            {collection.owner.displayName}
          </Link>
          {!isOwner && collection.visibility === "public" && (
            <CollectionFollowButton
              collectionId={collection.id}
              onCountChange={(delta) => setCollection((prev) => (prev ? { ...prev, followerCount: Math.max(0, prev.followerCount + delta) } : prev))}
            />
          )}
        </div>
      </header>

      <CollectionEntryList
        items={items}
        searchPlaceholderKey="collection.searchPlaceholder"
        emptyTitleKey="collection.emptyItemsTitle"
        emptyDescriptionKey="collection.emptyItemsDescription"
        removalFor={isOwner ? (entry) => ({ onRemove: () => handleRemoveItem(entry.data.id, entry.type) }) : undefined}
      />

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
    </PageContainer>
  );
}
