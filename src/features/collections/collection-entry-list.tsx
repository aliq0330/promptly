"use client";

import { useMemo, useState } from "react";
import { FolderOpen, Search, SearchX, X } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PromptCard } from "@/features/prompts/prompt-card";
import { WorkflowCard } from "@/features/workflows/workflow-card";
import { PresetCard } from "@/features/presets/preset-card";
import { useEngagementEntry } from "@/features/content/engagement-store";
import { normalizeTagLabel } from "@/lib/tag-normalize";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { CollectionEntry } from "@/lib/supabase/collections";
import type { TranslationKey } from "@/lib/i18n/translations";

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

  const normalizedQuery = normalizeTagLabel(query);
  const visibleItems = useMemo(() => {
    if (!normalizedQuery) return items;
    return items.filter((entry) => {
      const data = entry.data;
      const creator = "author" in data ? data.author : data.creator;
      const haystack = normalizeTagLabel(
        [data.title, data.description, creator.displayName, creator.username, ...data.tags.map((tag) => tag.label)].join(" "),
      );
      return haystack.includes(normalizedQuery);
    });
  }, [items, normalizedQuery]);

  return (
    <>
      {items.length > 0 && (
        <div className="relative">
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
      ) : (
        <div className="columns-1 gap-3 sm:columns-2 sm:gap-4 xl:columns-3">
          {visibleItems.map((entry) => (
            <EntryCell key={`${entry.type}:${entry.data.id}`} entry={entry} removal={removalFor?.(entry)} dropWhenUnsaved={dropWhenUnsaved} />
          ))}
        </div>
      )}
    </>
  );
}

function EntryCell({ entry, removal, dropWhenUnsaved }: { entry: CollectionEntry; removal?: EntryRemoval; dropWhenUnsaved: boolean }) {
  // Seeded with the real count so reading the shared entry first can't pin it at 0 for the card's own bookmark.
  const save = useEngagementEntry("save", entry.type, entry.data.id, entry.data.saveCount);
  if (dropWhenUnsaved && save.activeChecked && !save.active) return null;
  return (
    <div className="pb-3 break-inside-avoid sm:pb-4">
      {entry.type === "prompt" ? (
        <PromptCard prompt={entry.data} collectionRemoval={removal} />
      ) : entry.type === "preset" ? (
        <PresetCard preset={entry.data} collectionRemoval={removal} />
      ) : (
        <WorkflowCard workflow={entry.data} collectionRemoval={removal} />
      )}
    </div>
  );
}
