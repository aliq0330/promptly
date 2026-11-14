"use client";

import { DetailSkeleton, NotFoundBlock } from "@/components/ui/detail-skeleton";
import { CollectionBand } from "./collection-band";
import { CollectionAside } from "./collection-aside";
import { CollectionEntryList } from "./collection-entry-list";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Pencil } from "@/components/icons/pencil";
import { Plus } from "@/components/icons/plus";
import { Users } from "@/components/icons/users";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import { CollectionAddContent } from "./collection-add-content";
import { CollectionMembersTab } from "./collection-members-tab";
import { BAND_PRIMARY_CLASS, BandActionRow, DetailShell } from "@/features/content/detail-parts";
import { ContentGridColumns } from "@/features/content/content-card";
import { ShareButton } from "@/features/prompts/share-button";
import { Portal } from "@/components/ui/portal";
import { CollectionFormModal } from "./collection-form-modal";
import { CollectionMoreMenu } from "./collection-more-menu";
import { CollectionFollowButton } from "./collection-follow-button";
import { useAuth } from "@/features/auth/auth-provider";
import { usePagedList } from "@/features/content/use-paged-list";
import { LoadMore } from "@/features/feed/load-more";
import {
  fetchCollectionById,
  collectionEntryKey,
  fetchCollectionItemsPage,
  removeFromCollection,
  saveCollectionSettings,
} from "@/lib/supabase/collections";
import { fetchCollectionMembers, type CollectionMember } from "@/lib/supabase/collection-members";
import { canAddItems, canFollowCollection, canManageCollection, canRemoveItem, collectionRole } from "@/lib/collection-permissions";
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
 * of THIS collection only and it vanishes from the list the moment the backend
 * confirms, no refresh needed. It stays saved ("Kaydedilenlerin tümü", filled
 * bookmark) — only "Kaydedilenlerden kaldır" in the collection sheet unsaves.
 */
export function CollectionDetailView() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get("id");

  const [collection, setCollection] = useState<Collection | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  // Ortak koleksiyon (docs/history/386-*): ortaklar yalnız `collection_members_list` RPC'sinden okunur; null = yükleniyor.
  const [members, setMembers] = useState<CollectionMember[] | null>(null);
  const [membersFailed, setMembersFailed] = useState(false);
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
    fetchCollectionById(id).then((foundCollection) => {
      if (cancelled) return;
      setCollection(foundCollection);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const loadMembers = useCallback(() => {
    if (!id) return;
    fetchCollectionMembers(id)
      .then((list) => {
        setMembers(list);
        setMembersFailed(false);
      })
      .catch((err) => {
        console.error("fetchCollectionMembers", err);
        setMembersFailed(true);
      });
  }, [id]);

  const isShared = collection?.isShared ?? false;
  useEffect(() => {
    if (!isShared) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- an unshared collection has no partners to wait for
      setMembers(null);
      return;
    }
    loadMembers();
  }, [isShared, loadMembers]);

  // The collection's works, 24 at a time (a collection can hold thousands): the list grows as it is scrolled.
  const entries = usePagedList(`collection|${id ?? ""}`, Boolean(id) && loaded && Boolean(collection), (offset) => fetchCollectionItemsPage(id ?? "", offset), collectionEntryKey);
  const items = entries.items;

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
   * Same single-collection removal for every collection and every entry
   * type; the work stays saved, so the shared bookmark state is untouched.
   */
  async function handleRemoveItem(id: string, contentType: "prompt" | "workflow" | "preset" | "community_post") {
    if (!collection) return;
    await removeFromCollection(collection.id, id, contentType);
    entries.removeItem(`${contentType}:${id}`);
    setCollection((prev) => (prev ? { ...prev, itemCount: Math.max(0, prev.itemCount - 1) } : prev));
    showToast(t("collection.removedFromCollectionToast"));
  }

  if (!id || (loaded && !collection)) {
    return <NotFoundBlock title={t("collection.notFoundTitle")} description={t("collection.notFoundDescription")} />;
  }

  if (!loaded || !collection || entries.loading) {
    return <DetailSkeleton />;
  }

  const isOwner = user?.id === collection.owner.id;
  const isPartner = Boolean(user && members?.some((member) => member.role === "member" && member.userId === user.id));
  const role = collectionRole({ ownerId: collection.owner.id, userId: user?.id, isMember: isPartner });
  // Ortak koleksiyonda ortaklar gelene kadar rol bilinmez: takip düğmesi gibi role bağlı eylemler o zamana kadar çizilmez.
  const roleKnown = !collection.isShared || members !== null || membersFailed;
  const tab: "items" | "members" = collection.isShared && searchParams.get("tab") === "members" ? "members" : "items";
  const alreadyKeys = new Set(items.map(collectionEntryKey));
  const adders = new Map((members ?? []).map((member) => [member.userId, { name: member.displayName, avatarUrl: member.avatarUrl }]));
  const reloadAfterChange = () => {
    fetchCollectionById(collection.id).then((fresh) => fresh && setCollection(fresh));
    loadMembers();
    void entries.refresh();
  };
  const collectionId = collection.id;
  const openTab = (next: "items" | "members") => router.replace(`${collectionHref({ id: collectionId })}${next === "members" ? "&tab=members" : ""}`, { scroll: false });

  return (
    // Albüm (docs/history/203-*): band (collage art) · actions row · [the list | Hakkında + the owner's other collections from `lg`].
    <ContentGridColumns value="sm:columns-2">
      <DetailShell
        band={<CollectionBand collection={collection} items={items} members={members} />}
        actions={
          <BandActionRow label={t("collection.actionsAria")} data-collection-actions="">
            {isOwner ? (
              <Button type="button" size="lg" className={BAND_PRIMARY_CLASS} onClick={() => setEditing(true)}>
                <Pencil size={18} aria-hidden />
                {t("collection.editTitle")}
              </Button>
            ) : role === "member" && canAddItems(role, collection.isShared) ? (
              <Button type="button" size="lg" className={BAND_PRIMARY_CLASS} onClick={() => setAdding(true)} data-collection-add="">
                <Plus size={18} aria-hidden />
                {t("collab.addContent")}
              </Button>
            ) : (
              roleKnown &&
              canFollowCollection(role, collection.visibility) && (
                <CollectionFollowButton
                  collectionId={collection.id}
                  className={BAND_PRIMARY_CLASS}
                  onCountChange={(delta) => setCollection((prev) => (prev ? { ...prev, followerCount: Math.max(0, prev.followerCount + delta) } : prev))}
                />
              )
            )}
            {isOwner && collection.isShared && (
              <>
                <Button type="button" size="lg" variant="outline" className="rounded-full" onClick={() => setAdding(true)} data-collection-add="">
                  <Plus size={18} aria-hidden />
                  {t("collab.addContent")}
                </Button>
                <Button type="button" size="lg" variant="outline" className="rounded-full" onClick={() => openTab("members")} data-collection-manage-partners="">
                  <Users size={18} aria-hidden />
                  {t("collab.managePartners")}
                </Button>
              </>
            )}
            {collection.visibility === "public" && (
              <ShareButton url={collectionHref(collection)} title={collection.name} className="h-11 min-w-11 rounded-full px-3" />
            )}
            {canManageCollection(role) && (
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
        aside={<CollectionAside collection={collection} members={members} role={role} />}
      >
        <div className="space-y-4">
          {collection.isShared && (
            <Tabs
              ariaLabel={t("collab.tabsAria")}
              active={tab}
              onChange={openTab}
              items={[
                { key: "items", label: t("collab.tabItems"), count: collection.itemCount },
                { key: "members", label: t("collab.tabPartners"), count: collection.memberCount + 1, attrs: { "data-collection-tab-members": "" } },
              ]}
            />
          )}
          {tab === "members" ? (
            <CollectionMembersTab
              collection={collection}
              members={members}
              failed={membersFailed}
              role={role}
              userId={user?.id}
              onChanged={reloadAfterChange}
              onLeft={() => router.push("/saved")}
            />
          ) : (
            <CollectionEntryList
              items={items}
              searchPlaceholderKey="collection.searchPlaceholder"
              emptyScene="collection"
              emptyTitleKey="collection.emptyItemsTitle"
              emptyDescriptionKey="collection.emptyItemsDescription"
              removalFor={(entry) => (canRemoveItem({ role, userId: user?.id, addedBy: entry.addedBy }) ? { onRemove: () => handleRemoveItem(entry.data.id, entry.type) } : undefined)}
              dropWhenUnsaved={isOwner}
              addedBy={collection.isShared ? adders : undefined}
              totalCount={collection.itemCount}
              footer={<LoadMore failed={entries.failed} hasMore={entries.hasMore} loadingMore={entries.loadingMore} onLoadMore={() => void entries.loadMore()} auto />}
            />
          )}
        </div>
        {editing && (
          <CollectionFormModal
            collection={collection}
            onClose={() => setEditing(false)}
            onSubmit={async (values) => {
              await saveCollectionSettings(collection, values);
              setCollection((prev) => (prev ? { ...prev, name: values.name, visibility: values.visibility, isShared: values.shared, memberCount: values.shared ? prev.memberCount : 0 } : prev));
              setEditing(false);
              if (values.shared !== collection.isShared) {
                setMembers(null);
                if (!values.shared) openTab("items");
              }
            }}
          />
        )}

        {adding && (
          <CollectionAddContent
            collectionId={collection.id}
            alreadyKeys={alreadyKeys}
            onClose={() => setAdding(false)}
            onAdded={reloadAfterChange}
          />
        )}

        {toast && (
          <Portal>
            <div
              role="status"
              className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-(--z-popover) flex justify-center px-4 md:bottom-6"
            >
              <div className="animate-pop-in rounded-md bg-text px-4 py-2 text-small text-background shadow-pop">{toast}</div>
            </div>
          </Portal>
        )}
      </DetailShell>
    </ContentGridColumns>
  );
}
