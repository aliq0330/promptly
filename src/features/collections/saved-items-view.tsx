"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bookmark } from "@/components/icons/bookmark";
import { Users } from "@/components/icons/users";
import { ScrollRow } from "@/components/ui/scroll-row";
import { StorageImage } from "@/components/ui/storage-media";
import { DetailSkeleton } from "@/components/ui/detail-skeleton";
import { CollectionEntryList } from "./collection-entry-list";
import { CollectionInvitesStrip } from "./collection-invites-strip";
import { entryImage } from "./collection-band";
import { CollectionCover } from "./collection-card";
import { CollageArt, DetailBand, DetailShell, DetailTitle, Eyebrow } from "@/features/content/detail-parts";
import { useAuth } from "@/features/auth/auth-provider";
import { engagementStore } from "@/features/content/engagement-store";
import { collectionEntryKey, fetchOwnCollections, fetchSavedItemsPage } from "@/lib/supabase/collections";
import { usePagedList } from "@/features/content/use-paged-list";
import { LoadMore } from "@/features/feed/load-more";
import { collectionHref } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { Collection, PromptMedia } from "@/types";

/**
 * `/saved` — "Kaydedilenlerin tümü" (docs/history/336-*): everything the viewer saved, each work once, whatever
 * collections it is in. It is the viewer's system collection — the same rows the bookmark reads — with the viewer's
 * own collections as a shelf above it. A card leaves the list only when its bookmark is emptied through
 * "Kaydedilenlerden kaldır"; filing it into or out of collections never removes it from here.
 */
export function SavedItemsView() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [shelfVersion, setShelfVersion] = useState(0);

  // "Koleksiyonlarım" shelf (docs/history/234-*): the viewer's own collections (and the ortak ones they are in, docs/history/386-*), each opening its own page; a failure just leaves the shelf out.
  useEffect(() => {
    let cancelled = false;
    if (!user) return;
    fetchOwnCollections(user.id).then((list) => !cancelled && setCollections(list));
    return () => {
      cancelled = true;
    };
  }, [user, shelfVersion]);

  // The saved works, 24 at a time (a member can have thousands): the list grows as it is scrolled.
  const saved = usePagedList(`saved|${user?.id ?? ""}`, Boolean(user), (offset) => fetchSavedItemsPage(user?.id ?? "", offset), collectionEntryKey);
  const items = saved.items;

  // Everything listed here is saved: make the shared bookmark state say so, even if an earlier session-local guess differed.
  useEffect(() => {
    for (const entry of items) engagementStore.setActive(engagementStore.keyOf("save", entry.type, entry.data.id), true);
  }, [items]);

  const failed = saved.failed && items.length === 0;
  const loaded = !saved.loading;

  if (failed) {
    return <div className="mx-auto max-w-md px-4 py-16 text-center text-small text-text-muted">{t("saved.loadFailed")}</div>;
  }
  if (!loaded) return <DetailSkeleton />;

  const images = items.map(entryImage).filter((media): media is PromptMedia => media !== null).slice(0, 4);

  return (
    // Albüm (docs/history/203-*): the same band as a collection — the newest saves' pictures as the collage.
    <DetailShell
      band={
        <DetailBand
          data-saved-band=""
          backdrop={images[0] ? <StorageImage src={images[0].url} alt="" fill sizes="100vw" className="object-cover" /> : undefined}
          art={<CollageArt images={images} icon={Bookmark} />}
          kicker={<Eyebrow tone="primary">{t("collection.visibilityPrivateShort")} · {t("collection.itemCount", { count: Math.max(items.length, saved.total ?? 0) })}</Eyebrow>}
          title={<DetailTitle>{t("saved.allTitle")}</DetailTitle>}
          byline={<p className="text-body text-text-secondary">{t("saved.subtitle")}</p>}
        />
      }
    >
      <div className="space-y-4">
        {user && <CollectionInvitesStrip onJoined={() => setShelfVersion((n) => n + 1)} />}
        {collections.length > 0 && (
          <section aria-labelledby="saved-collections" data-saved-collections="" className="space-y-2">
            <h2 id="saved-collections" className="px-1 text-label font-semibold uppercase tracking-[0.08em] text-text-muted">
              {t("saved.myCollections")}
            </h2>
            <ScrollRow className="gap-3">
              {collections.map((collection) => (
                <Link key={collection.id} href={collectionHref(collection)} className="group w-[8.75rem] shrink-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                  <CollectionCover collection={collection} className="aspect-[7/5] w-full overflow-hidden rounded-lg" />
                  <p className="mt-2 truncate text-small font-medium text-text group-hover:text-primary">{collection.name}</p>
                  <p className="text-caption tabular-nums text-text-muted">{t("collection.itemCount", { count: collection.itemCount })}</p>
                  {collection.isShared && (
                    <p className="flex items-center gap-1 truncate text-caption font-medium text-secondary" data-collection-shared-chip="">
                      <Users size={12} aria-hidden />
                      {collection.owner.id === user?.id ? (collection.visibility === "private" ? t("collab.privateShared") : t("collab.kicker")) : t("collab.withOwner", { name: collection.owner.displayName })}
                    </p>
                  )}
                </Link>
              ))}
            </ScrollRow>
          </section>
        )}
        <CollectionEntryList
          items={items}
          searchPlaceholderKey="saved.searchPlaceholder"
          emptyScene="saved"
          emptyTitleKey="saved.emptyTitle"
          emptyDescriptionKey="saved.emptyDescription"
          dropWhenUnsaved
          totalCount={saved.total}
          footer={<LoadMore failed={saved.failed} hasMore={saved.hasMore} loadingMore={saved.loadingMore} onLoadMore={() => void saved.loadMore()} auto />}
        />
      </div>
    </DetailShell>
  );
}
