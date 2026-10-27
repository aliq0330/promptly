"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bookmark } from "lucide-react";
import { ScrollRow } from "@/components/ui/scroll-row";
import { StorageImage } from "@/components/ui/storage-media";
import { DetailSkeleton } from "@/components/ui/detail-skeleton";
import { CollectionEntryList } from "./collection-entry-list";
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
 * `/saved` — "Kaydedilenler": every distinct work in at least one of the
 * viewer's collections (Genel included), each once however many collections
 * hold it. It is a view over the same memberships the bookmark reads, not a
 * list of its own, so there is nothing here to delete: a card leaves the list
 * when its bookmark is emptied (taken out of its last collection) and
 * otherwise stays — leaving one of several collections doesn't remove it.
 */
export function SavedItemsView() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [collections, setCollections] = useState<Collection[]>([]);

  // "Koleksiyonlarım" shelf (docs/history/234-*): the viewer's own collections, each opening its own page; a failure just leaves the shelf out.
  useEffect(() => {
    let cancelled = false;
    if (!user) return;
    fetchOwnCollections(user.id).then((list) => !cancelled && setCollections(list));
    return () => {
      cancelled = true;
    };
  }, [user]);

  // The saved works, 24 at a time (a member can have thousands): the list grows as it is scrolled.
  const saved = usePagedList(`saved|${user?.id ?? ""}`, Boolean(user), (offset) => fetchSavedItemsPage(user?.id ?? "", offset), collectionEntryKey);
  const items = saved.items;

  // Everything listed here is in a collection: make the shared bookmark state say so, even if an earlier session-local guess differed.
  useEffect(() => {
    for (const entry of items) engagementStore.setActive(engagementStore.keyOf("save", entry.type, entry.data.id), true);
  }, [items]);

  const failed = saved.failed && items.length === 0;
  const loaded = !saved.loading;

  if (failed) {
    return <div className="mx-auto max-w-md px-4 py-16 text-center text-sm text-text-muted">{t("saved.loadFailed")}</div>;
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
          title={<DetailTitle>{t("nav.saved")}</DetailTitle>}
          byline={<p className="text-body text-text-secondary">{t("saved.subtitle")}</p>}
        />
      }
    >
      <div className="space-y-4">
        {collections.length > 0 && (
          <section aria-labelledby="saved-collections" data-saved-collections="" className="space-y-2">
            <h2 id="saved-collections" className="px-1 text-label font-semibold uppercase tracking-[0.08em] text-text-muted">
              {t("saved.myCollections")}
            </h2>
            <ScrollRow className="gap-3">
              {collections.map((collection) => (
                <Link key={collection.id} href={collectionHref(collection)} className="group w-[8.75rem] shrink-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                  <CollectionCover collection={collection} className="aspect-[7/5] w-full overflow-hidden rounded-2xl" />
                  <p className="mt-2 truncate text-small font-medium text-text group-hover:text-primary">{collection.name}</p>
                  <p className="text-caption tabular-nums text-text-muted">{t("collection.itemCount", { count: collection.itemCount })}</p>
                </Link>
              ))}
            </ScrollRow>
          </section>
        )}
        <CollectionEntryList
          items={items}
          searchPlaceholderKey="saved.searchPlaceholder"
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
