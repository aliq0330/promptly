"use client";

import { useMemo, useState } from "react";
import { FolderOpen, Search, SearchX, X } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Chip, ChipRow } from "@/components/ui/chip";
import { PromptCard } from "@/features/prompts/prompt-card";
import { WorkflowCard } from "@/features/workflows/workflow-card";
import { PresetCard } from "@/features/presets/preset-card";
import { SavedPostCard } from "@/features/communities/saved-post-card";
import { postFeedItem, summarizeContent } from "@/features/communities/content-summary";
import { useEngagementEntry } from "@/features/content/engagement-store";
import { normalizeTagLabel } from "@/lib/tag-normalize";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { CollectionEntry } from "@/lib/supabase/collections";
import type { TranslationKey } from "@/lib/i18n/translations";
import { CONTENT_GRID_ITEM_CLASS, ContentGrid } from "@/features/content/content-card";
import { useViewMode } from "@/features/content/view-mode-store";
import { ViewModeControls } from "@/features/content/view-mode-switcher";
import { FocusGrid } from "@/features/focus/focus-grid";
import type { FeedItem } from "@/features/feed/types";

export type EntryRemoval = { onRemove: () => Promise<void> };

/**
 * The searchable card grid shared by a collection's detail page and
 * "Kaydedilenler" — one list implementation, so both show the same cards,
 * search the same fields and handle every content type the same way.
 * Search runs over what's already loaded (title, description, creator, tags):
 * these are small personal lists, no extra request needed.
 *
 * `removalFor` is given only where a card gets a "Koleksiyondan kaldır" menu
 * item (a collection the viewer owns); "Kaydedilenler" leaves it out because
 * the bookmark on each card is its way to leave collections.
 * `dropWhenUnsaved` hides a card the moment its bookmark empties (the viewer
 * took it out of its last collection), without a refetch.
 */
export function CollectionEntryList({
  items,
  searchPlaceholderKey,
  emptyTitleKey,
  emptyDescriptionKey,
  removalFor,
  dropWhenUnsaved = false,
}: {
  items: CollectionEntry[];
  searchPlaceholderKey: TranslationKey;
  emptyTitleKey: TranslationKey;
  emptyDescriptionKey: TranslationKey;
  removalFor?: (entry: CollectionEntry) => EntryRemoval;
  dropWhenUnsaved?: boolean;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [type, setType] = useState<CollectionEntry["type"] | "all">("all");
  const [viewMode] = useViewMode();

  // Kind chips with their counts (docs/history/203-*), only when the list holds more than one kind.
  const typeCounts = useMemo(() => {
    const counts = new Map<CollectionEntry["type"], number>();
    items.forEach((entry) => counts.set(entry.type, (counts.get(entry.type) ?? 0) + 1));
    return ENTRY_TYPES.filter((key) => counts.has(key)).map((key) => ({ key, count: counts.get(key)! }));
  }, [items]);
  const activeType = typeCounts.some((item) => item.key === type) ? type : "all";

  const normalizedQuery = normalizeTagLabel(query);
  const visibleItems = useMemo(() => {
    const ofType = activeType === "all" ? items : items.filter((entry) => entry.type === activeType);
    if (!normalizedQuery) return ofType;
    return ofType.filter((entry) => {
      const fields = searchFields(entry);
      const haystack = normalizeTagLabel([fields.title, fields.description, fields.creator?.displayName ?? "", fields.creator?.username ?? "", ...fields.tags].join(" "));
      return haystack.includes(normalizedQuery);
    });
  }, [items, activeType, normalizedQuery]);

  return (
    <>
      {items.length > 0 && (
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t(searchPlaceholderKey)}
              aria-label={t(searchPlaceholderKey)}
              className="h-11 w-full rounded-full border border-border-soft bg-surface pl-10 pr-10 text-body text-text shadow-xs outline-none transition-colors placeholder:text-text-muted hover:border-border focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/30 [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label={t("common.clear")}
                className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-text-muted hover:bg-surface-soft hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <X size={15} aria-hidden />
              </button>
            )}
          </div>
          <ViewModeControls />
        </div>
      )}

      {typeCounts.length > 1 && (
        <ChipRow scroll aria-label={t("collection.typeFilterAria")}>
          <Chip selected={activeType === "all"} onClick={() => setType("all")}>
            {t("common.all")} <span className="tabular-nums opacity-70">{items.length}</span>
          </Chip>
          {typeCounts.map((item) => (
            <Chip key={item.key} selected={activeType === item.key} onClick={() => setType(item.key)}>
              {t(ENTRY_TYPE_LABELS[item.key])} <span className="tabular-nums opacity-70">{item.count}</span>
            </Chip>
          ))}
        </ChipRow>
      )}

      {items.length > 0 && visibleItems.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title={t("collection.searchNoResultsTitle")}
          description={t("collection.searchNoResultsDescription", { query: query.trim() })}
          action={{ label: t("common.clear"), onClick: () => setQuery("") }}
        />
      ) : items.length === 0 ? (
        <EmptyState icon={FolderOpen} title={t(emptyTitleKey)} description={t(emptyDescriptionKey)} action={{ label: t("feed.goToDiscover"), href: "/discover" }} />
      ) : viewMode === "focus" ? (
        <FocusGrid items={visibleItems.map(entryFeedItem).filter((item): item is FeedItem => item !== null)} />
      ) : (
        <ContentGrid>
          {visibleItems.map((entry) => (
            <EntryCell key={`${entry.type}:${entry.data.id}`} entry={entry} removal={removalFor?.(entry)} dropWhenUnsaved={dropWhenUnsaved} />
          ))}
        </ContentGrid>
      )}
    </>
  );
}

const ENTRY_TYPES: CollectionEntry["type"][] = ["prompt", "workflow", "preset", "community_post"];
const ENTRY_TYPE_LABELS: Record<CollectionEntry["type"], TranslationKey> = {
  prompt: "feed.filterPrompts",
  workflow: "nav.workflows",
  preset: "nav.presets",
  community_post: "collection.typeCommunityPosts",
};

/** One entry in the Izgara view: the content itself; a saved community post shows the content it applies with. */
function entryFeedItem(entry: CollectionEntry): FeedItem | null {
  if (entry.type === "community_post") return postFeedItem(entry.data.content);
  return { kind: entry.type, data: entry.data } as FeedItem;
}

/** The searchable text of one entry. A community post is searched by the content it applies with, its note and its applicant. */
function searchFields(entry: CollectionEntry) {
  if (entry.type === "community_post") {
    const summary = entry.data.content ? summarizeContent(entry.data.content) : null;
    return {
      title: summary?.title ?? "",
      description: [summary?.description ?? "", entry.data.note ?? ""].join(" "),
      creator: entry.data.author,
      tags: summary?.tags.map((tag) => tag.label) ?? [],
    };
  }
  const data = entry.data;
  return { title: data.title, description: data.description, creator: "author" in data ? data.author : data.creator, tags: data.tags.map((tag) => tag.label) };
}

function EntryCell({ entry, removal, dropWhenUnsaved }: { entry: CollectionEntry; removal?: EntryRemoval; dropWhenUnsaved: boolean }) {
  // Seeded with the real count so reading the shared entry first can't pin it at 0 for the card's own bookmark.
  const save = useEngagementEntry("save", entry.type, entry.data.id, entry.data.saveCount);
  if (dropWhenUnsaved && save.activeChecked && !save.active) return null;
  return (
    <div className={CONTENT_GRID_ITEM_CLASS}>
      {entry.type === "community_post" ? (
        <SavedPostCard post={entry.data} collectionRemoval={removal} />
      ) : entry.type === "prompt" ? (
        <PromptCard prompt={entry.data} collectionRemoval={removal} />
      ) : entry.type === "preset" ? (
        <PresetCard preset={entry.data} collectionRemoval={removal} />
      ) : (
        <WorkflowCard workflow={entry.data} collectionRemoval={removal} />
      )}
    </div>
  );
}
