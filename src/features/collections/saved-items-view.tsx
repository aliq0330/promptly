"use client";

import { useEffect, useState } from "react";
import { PageContainer } from "@/components/ui/page-header";
import { DetailSkeleton } from "@/components/ui/detail-skeleton";
import { CollectionEntryList } from "./collection-entry-list";
import { useAuth } from "@/features/auth/auth-provider";
import { engagementStore } from "@/features/content/engagement-store";
import { fetchSavedItems, type CollectionEntry } from "@/lib/supabase/collections";
import { useTranslation } from "@/lib/i18n/language-provider";

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
  const [items, setItems] = useState<CollectionEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!user) return;
    fetchSavedItems(user.id)
      .then((entries) => {
        if (cancelled) return;
        // Everything listed here is in a collection: make the shared bookmark state say so, even if an earlier session-local guess differed.
        for (const entry of entries) engagementStore.setActive(engagementStore.keyOf("save", entry.type, entry.data.id), true);
        setItems(entries);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (failed) {
    return <div className="mx-auto max-w-md px-4 py-16 text-center text-sm text-text-muted">{t("saved.loadFailed")}</div>;
  }
  if (!loaded) return <DetailSkeleton />;

  return (
    <PageContainer className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-h1 font-semibold text-text">{t("nav.saved")}</h1>
        <p className="text-small text-text-muted">{t("saved.subtitle")}</p>
      </header>
      <CollectionEntryList
        items={items}
        searchPlaceholderKey="saved.searchPlaceholder"
        emptyTitleKey="saved.emptyTitle"
        emptyDescriptionKey="saved.emptyDescription"
        dropWhenUnsaved
      />
    </PageContainer>
  );
}
