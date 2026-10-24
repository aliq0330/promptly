"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { useAuth } from "@/features/auth/auth-provider";
import { SheetChips, SheetSection } from "@/features/content/list-toolbar";
import { useFollowedTags } from "@/features/tags/followed-tags-store";
import { useFollowedTools } from "@/features/tools/followed-tools-store";
import { findTool } from "@/lib/ai-tool-catalog";
import { useTranslation } from "@/lib/i18n/language-provider";
import { normalizeTagLabel } from "@/lib/tag-normalize";
import { fetchFollowedProfiles } from "@/lib/supabase/profiles";
import type { UserProfile } from "@/types";

/**
 * Home's optional "takip ettiklerim" filters (docs/history/221-*): which of the people, tags and AI tools the viewer follows
 * narrow the feed. Following is the lasting preference; picking here is a temporary view (it never follows or unfollows, and
 * it is dropped with "Temizle"). How picks combine is the search chips' rule (`tokensToQuery`): different kinds AND,
 * people / tools are alternatives inside their kind, ALL picked tags must be present — the database applies it (`feed_page`).
 */
export interface FollowedFilterValue {
  people: string[];
  tags: string[];
  tools: string[];
}

export const EMPTY_FOLLOWED_FILTER: FollowedFilterValue = { people: [], tags: [], tools: [] };

export function followedFilterCount(value: FollowedFilterValue): number {
  return value.people.length + value.tags.length + value.tools.length;
}

/** How many people the picker loads (the viewer's follows are public rows; a long list gets a search box). */
const PEOPLE_LIMIT = 200;
const SEARCH_FROM = 12;

/** The viewer's followed people, loaded once per signed-in user while `enabled` (the filters are only shown on the following tab). */
export function useFollowedPeople(enabled: boolean) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [loaded, setLoaded] = useState<{ userId: string; people: UserProfile[] } | null>(null);

  useEffect(() => {
    if (!enabled || !userId || loaded?.userId === userId) return;
    let cancelled = false;
    fetchFollowedProfiles(userId, PEOPLE_LIMIT).then((list) => {
      if (!cancelled) setLoaded({ userId, people: [...list].sort((a, b) => a.displayName.localeCompare(b.displayName, "tr")) });
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, userId, loaded?.userId]);

  const current = loaded && loaded.userId === userId ? loaded.people : null;
  return { people: current ?? [], loaded: current !== null };
}

/** Picks that are no longer followed (unfollowed on another page) are dropped, so a filter never names something the viewer does not follow. */
export function useEffectiveFollowedFilter(
  picked: FollowedFilterValue,
  people: { people: UserProfile[]; loaded: boolean },
): FollowedFilterValue {
  const followedTags = useFollowedTags();
  const followedTools = useFollowedTools();
  return useMemo(() => {
    const peopleIds = new Set(people.people.map((person) => person.id));
    const tagSlugs = new Set(followedTags.tags.map((tag) => tag.slug));
    const toolIds = new Set(followedTools.tools);
    const next: FollowedFilterValue = {
      people: people.loaded ? picked.people.filter((id) => peopleIds.has(id)) : picked.people,
      tags: followedTags.loaded ? picked.tags.filter((slug) => tagSlugs.has(slug)) : picked.tags,
      tools: followedTools.loaded ? picked.tools.filter((id) => toolIds.has(id)) : picked.tools,
    };
    // Same content → same object, so an unchanged filter does not look like a new query.
    return next.people.length === picked.people.length && next.tags.length === picked.tags.length && next.tools.length === picked.tools.length ? picked : next;
  }, [picked, people.people, people.loaded, followedTags.tags, followedTags.loaded, followedTools.tools, followedTools.loaded]);
}

const toggled = (list: string[], value: string) => (list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value]);

/** The filter sheet's blocks: people, tags, AI tools — each a chip group of what the viewer follows. */
export function FollowedFilterSections({
  value,
  onChange,
  people,
}: {
  value: FollowedFilterValue;
  onChange: (next: FollowedFilterValue) => void;
  people: { people: UserProfile[]; loaded: boolean };
}) {
  const { t } = useTranslation();
  const followedTags = useFollowedTags();
  const followedTools = useFollowedTools();
  const [query, setQuery] = useState("");

  const needle = normalizeTagLabel(query);
  const shownPeople = needle
    ? people.people.filter((person) => normalizeTagLabel(person.displayName).includes(needle) || normalizeTagLabel(person.username).includes(needle))
    : people.people;

  return (
    <>
      <p className="text-caption text-text-muted">{t("feed.filterFollowedHint")}</p>

      <SheetSection title={t("feed.filterPeople")}>
        {!people.loaded ? (
          <p className="text-small text-text-muted">{t("feed.filterPeopleLoading")}</p>
        ) : people.people.length === 0 ? (
          <p className="text-small text-text-muted">{t("feed.filterPeopleNone")}</p>
        ) : (
          <>
            {people.people.length >= SEARCH_FROM && (
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("feed.filterPeopleSearch")}
                aria-label={t("feed.filterPeopleSearch")}
                className="h-10 w-full rounded-md border border-border bg-surface px-3 text-small text-text outline-none placeholder:text-text-muted focus-visible:ring-2 focus-visible:ring-primary"
              />
            )}
            {shownPeople.length === 0 ? (
              <p className="text-small text-text-muted">{t("feed.filterPeopleNoMatch")}</p>
            ) : (
              <SheetChips>
                {shownPeople.map((person) => (
                  <Chip key={person.id} selected={value.people.includes(person.id)} onClick={() => onChange({ ...value, people: toggled(value.people, person.id) })}>
                    {person.displayName}
                  </Chip>
                ))}
              </SheetChips>
            )}
          </>
        )}
      </SheetSection>

      <SheetSection title={t("nav.tags")}>
        {followedTags.loaded && followedTags.tags.length === 0 ? (
          <p className="text-small text-text-muted">{t("feed.filterTagsNone")}</p>
        ) : (
          <SheetChips>
            {followedTags.tags.map((tag) => (
              <Chip key={tag.slug} selected={value.tags.includes(tag.slug)} onClick={() => onChange({ ...value, tags: toggled(value.tags, tag.slug) })}>
                #{tag.label}
              </Chip>
            ))}
          </SheetChips>
        )}
      </SheetSection>

      <SheetSection title={t("feed.filterTools")}>
        {followedTools.loaded && followedTools.tools.length === 0 ? (
          <p className="text-small text-text-muted">{t("feed.filterToolsNone")}</p>
        ) : (
          <SheetChips>
            {followedTools.tools.map((toolId) => (
              <Chip key={toolId} selected={value.tools.includes(toolId)} onClick={() => onChange({ ...value, tools: toggled(value.tools, toolId) })}>
                {findTool(toolId)?.name ?? toolId}
              </Chip>
            ))}
          </SheetChips>
        )}
      </SheetSection>
    </>
  );
}

/** The picks as removable pills under the section tiles, so it is always visible (and one tap to undo) what narrows the feed. */
export function FollowedFilterSummary({
  value,
  people,
  onChange,
  onClear,
}: {
  value: FollowedFilterValue;
  people: UserProfile[];
  onChange: (next: FollowedFilterValue) => void;
  onClear: () => void;
}) {
  const { t } = useTranslation();
  const followedTags = useFollowedTags();
  const pills: { key: string; label: string; remove: () => void }[] = [
    ...value.people.map((id) => ({
      key: `p:${id}`,
      label: people.find((person) => person.id === id)?.displayName ?? "…",
      remove: () => onChange({ ...value, people: value.people.filter((entry) => entry !== id) }),
    })),
    ...value.tags.map((slug) => ({
      key: `t:${slug}`,
      label: `#${followedTags.tags.find((tag) => tag.slug === slug)?.label ?? slug}`,
      remove: () => onChange({ ...value, tags: value.tags.filter((entry) => entry !== slug) }),
    })),
    ...value.tools.map((id) => ({
      key: `a:${id}`,
      label: findTool(id)?.name ?? id,
      remove: () => onChange({ ...value, tools: value.tools.filter((entry) => entry !== id) }),
    })),
  ];
  if (pills.length === 0) return null;

  return (
    <div role="group" aria-label={t("feed.activeFiltersAria")} data-followed-filter-summary className="flex flex-wrap items-center gap-2">
      {pills.map((pill) => (
        <button
          key={pill.key}
          type="button"
          onClick={pill.remove}
          aria-label={t("feed.removeFilter", { name: pill.label })}
          className="inline-flex h-8 items-center gap-1.5 rounded-full bg-primary-soft px-3 text-label font-medium text-primary transition-colors hover:bg-primary-soft/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {pill.label}
          <X size={14} aria-hidden />
        </button>
      ))}
      <button type="button" onClick={onClear} className="px-1 text-label font-medium text-text-muted underline-offset-2 hover:text-text hover:underline">
        {t("feed.clearFilters")}
      </button>
    </div>
  );
}
