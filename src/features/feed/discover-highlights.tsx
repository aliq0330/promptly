"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Flame, TrendingUp } from "lucide-react";
import { StorageAppearanceImage } from "@/components/ui/storage-media";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollRow } from "@/components/ui/scroll-row";
import { FollowButton } from "@/features/profile/follow-button";
import { useTaxonomyVersion } from "@/features/content/taxonomy-hydrator";
import { CONTENT_TYPE_META } from "@/features/prompts/content-type-meta";
import { findCategory, taxonomyLabel } from "@/lib/content-taxonomy";
import { fetchTopPrompts } from "@/lib/supabase/prompts";
import { fetchPopularTags, fetchTrendingTags } from "@/lib/supabase/tags";
import { fetchCreatorsPage } from "@/lib/supabase/profiles";
import { useAuth } from "@/features/auth/auth-provider";
import { categoryHref, cn, formatCount, profileHref, promptHref, tagHref } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { Prompt, PromptContentType, Tag, UserProfile } from "@/types";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Fewer than this in a window and the strip falls back to the wider window (then hides) — never padded with older posts under a "this week" title. */
const POPULAR_MIN = 3;
/** How many of the most liked public prompts the category strip is built from (order + covers). */
const CATEGORY_SAMPLE = 60;
const CATEGORY_MAX = 12;
const CREATORS_MAX = 10;

type PopularWindow = "week" | "month";

/** A tag in the compact strip: `recentCount` only when it came from the real trending window. */
type StripTag = Tag & { recentCount?: number };

/** Shared horizontal strip (`ScrollRow`: wheel, drag and arrows on a desktop): edge-to-edge scroll on phones, inside the column from `sm`. */
const STRIP_CLASS = "-mx-3 gap-2 px-3 sm:mx-0 sm:px-0";

/**
 * Discover's compact top (docs/history/210-*, slimmed in 227-*: ONE chip row of rising tags + categories, then the popular strip, then the
 * posts; the creators and rising tags also sit in the right column from `xl`), all from real rows:
 * - the most liked public prompts of the last 7 days ("Bu hafta popüler"); if that window has fewer than three, the last 30 days
 *   ("Bu ay popüler"); fewer still and the strip is not drawn;
 * - the categories the most liked public prompts are filed under, most frequent first, with their covers as the collage;
 * - the tags of the real trending window (`trending_tags`), or — while that window is empty — the most used tags;
 * - the most followed creators (right column from `xl`; below that the Yaratıcılar section is one tab away).
 */
export function useDiscoverHighlights() {
  const [data, setData] = useState<DiscoverHighlights | null>(() => readCachedHighlights());

  useEffect(() => {
    if (readCachedHighlights()) return;
    let cancelled = false;
    loadHighlights().then((loaded) => {
      highlightsCache = { data: loaded, at: Date.now() };
      if (!cancelled) setData(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { loading: data === null, popular: data?.popular ?? null, sample: data?.sample ?? [], tags: data?.tags ?? null, creators: data?.creators ?? [] };
}

interface DiscoverHighlights {
  popular: { window: PopularWindow; prompts: Prompt[] } | null;
  sample: Prompt[];
  tags: { trending: boolean; tags: StripTag[] };
  creators: UserProfile[];
}

/** The strips arrive TOGETHER (docs/history/220-*): one reveal instead of four pop-ins that each pushed the posts down. Kept a few minutes so Back does not reload them. */
const HIGHLIGHTS_TTL_MS = 3 * 60 * 1000;
let highlightsCache: { data: DiscoverHighlights; at: number } | null = null;

function readCachedHighlights(): DiscoverHighlights | null {
  return highlightsCache && Date.now() - highlightsCache.at < HIGHLIGHTS_TTL_MS ? highlightsCache.data : null;
}

/** All queries at once (the wider-window / fallback ones too, so no second round trip waits behind the first); a failed one leaves its strip empty. */
async function loadHighlights(): Promise<DiscoverHighlights> {
  const now = Date.now();
  const [week, month, sample, trending, popularTags, creators] = await Promise.all([
    fetchTopPrompts({ since: new Date(now - 7 * DAY_MS).toISOString(), limit: 10 }),
    fetchTopPrompts({ since: new Date(now - 30 * DAY_MS).toISOString(), limit: 10 }),
    fetchTopPrompts({ limit: CATEGORY_SAMPLE }),
    fetchTrendingTags(10).catch(() => []),
    fetchPopularTags(10).catch(() => []),
    fetchCreatorsPage(null, CREATORS_MAX + 1)
      .then((page) => page.creators)
      .catch((err) => {
        console.error("fetchCreatorsPage (discover)", err);
        return [] as UserProfile[];
      }),
  ]);
  const popular = week.length >= POPULAR_MIN ? { window: "week" as const, prompts: week } : month.length >= POPULAR_MIN ? { window: "month" as const, prompts: month } : null;
  const tags = trending.length > 0 ? { trending: true, tags: trending as StripTag[] } : { trending: false, tags: popularTags as StripTag[] };
  return { popular, sample, tags, creators };
}

/**
 * Stand-ins while the strips load, each as tall as the strip it holds, so nothing below moves when the real ones arrive
 * (docs/history/220-*). Rows are clipped, not scrollable.
 */
export function DiscoverHighlightsSkeleton() {
  const { t } = useTranslation();
  return (
    <div className="space-y-4" aria-busy="true" aria-label={t("common.loadingAriaLabel")} data-discover-highlights-loading="">
      <div className={cn(STRIP_CLASS, "flex items-center overflow-hidden")}>
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-10 w-28 shrink-0 rounded-full" />
        ))}
      </div>
      <div className="space-y-2">
        <Skeleton className="h-7 w-40 rounded-md" />
        <div className={cn(STRIP_CLASS, "flex overflow-hidden")}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="aspect-square w-32 shrink-0 rounded-[14px]" />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Section title of a strip, with an optional "Tümü" action on the right. */
function StripHeader({ id, children, action }: { id: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 id={id} className="flex items-center gap-1.5 font-display text-[1.125rem] font-bold text-text">
        {children}
      </h2>
      {action}
    </div>
  );
}

interface CategoryEntry {
  type: PromptContentType;
  id: string;
  labelKey: string;
  hits: number;
}

const TOPIC_CHIP =
  "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-small font-semibold whitespace-nowrap transition-colors duration-200";

/**
 * ONE row of chips under the search box (docs/history/227-*; it was a category strip and a tag strip, two rows): the rising tags first
 * (the number is the real post count of the trending window, absent for the most-used fallback; from `xl` they live in the right column
 * instead), then the categories the most liked public prompts are filed under, most frequent first. A category opens its own page
 * (`categoryHref`, docs/history/211-*), a tag its tag page.
 */
export function TopicStrip({ sample, tags }: { sample: Prompt[]; tags: { trending: boolean; tags: StripTag[] } | null }) {
  const { t, language } = useTranslation();
  // The taxonomy arrives from the database after the first paint; subscribing re-renders once it does (60 rows: no memo).
  useTaxonomyVersion();
  const entries = (() => {
    const byKey = new Map<string, CategoryEntry>();
    for (const prompt of sample) {
      if (!prompt.category) continue;
      const category = findCategory(prompt.contentType, prompt.category);
      if (!category) continue;
      const key = `${prompt.contentType}:${category.id}`;
      const entry = byKey.get(key) ?? { type: prompt.contentType, id: category.id, labelKey: category.labelKey, hits: 0 };
      entry.hits += 1;
      byKey.set(key, entry);
    }
    return [...byKey.values()].sort((a, b) => b.hits - a.hits).slice(0, CATEGORY_MAX);
  })();
  const tagList = tags?.tags ?? [];

  if (entries.length === 0 && tagList.length === 0) return null;
  return (
    <ScrollRow as="section" aria-labelledby="discover-topics" className={cn(STRIP_CLASS, "items-center")}>
      <h2 id="discover-topics" className="sr-only">
        {t("discover.categories")}
      </h2>
      {tagList.length > 0 && (
        <h3 id="discover-trending" className="sr-only">
          {t(tags?.trending ? "discover.rising" : "discover.trending")}
        </h3>
      )}
      {tagList.map((tag) => (
        <Link
          key={tag.slug}
          href={tagHref(tag)}
          data-discover-tag={tag.slug}
          title={tag.recentCount !== undefined ? t("home.railTrendCount", { count: tag.recentCount }) : undefined}
          className={cn(TOPIC_CHIP, "bg-surface-soft text-text hover:bg-primary-soft hover:text-primary xl:hidden")}
        >
          <TrendingUp size={14} className="text-secondary" aria-hidden />
          #{tag.label}
          {tag.recentCount !== undefined && <span className="text-caption font-semibold tabular-nums text-secondary">{formatCount(tag.recentCount)}</span>}
        </Link>
      ))}
      {entries.map((entry) => (
        <Link
          key={`${entry.type}:${entry.id}`}
          href={categoryHref(entry.type, entry.id)}
          data-discover-category={`${entry.type}:${entry.id}`}
          title={t(CONTENT_TYPE_META[entry.type].labelKey)}
          className={cn(TOPIC_CHIP, "border border-border-soft bg-surface text-text hover:border-border")}
        >
          {taxonomyLabel(entry.labelKey, language)}
        </Link>
      ))}
    </ScrollRow>
  );
}

/** The popular strip: small, horizontally scrolling prompt tiles (cover or prompt text, with title and likes over the foot of the tile). */
export function PopularStrip({ popular }: { popular: { window: PopularWindow; prompts: Prompt[] } | null }) {
  const { t } = useTranslation();
  if (!popular) return null;
  return (
    <section aria-labelledby="discover-popular" className="space-y-2" data-discover-popular={popular.window}>
      <StripHeader id="discover-popular">
        <Flame size={16} className="text-secondary" aria-hidden />
        {t(popular.window === "week" ? "discover.popularWeek" : "discover.popularMonth")}
      </StripHeader>
      <ScrollRow as="ul" className={STRIP_CLASS}>
        {popular.prompts.map((prompt) => {
          const Icon = CONTENT_TYPE_META[prompt.contentType].icon;
          const cover = prompt.contentType === "image" ? prompt.media[0] : undefined;
          return (
            <li key={prompt.id} className="w-32 shrink-0">
              <Link href={promptHref(prompt)} className="group relative block aspect-square overflow-hidden rounded-[14px] border border-border-soft bg-surface-soft">
                {cover ? (
                  <StorageAppearanceImage
                    src={cover.url}
                    alt=""
                    color={cover.color}
                    placeholder={cover.placeholder}
                    sizes="128px"
                    className="object-cover transition-transform duration-200 ease-soft group-hover:scale-[1.03]"
                  />
                ) : prompt.promptText.trim() ? (
                  <span className="prompt-text block p-2.5 text-[0.6875rem] leading-relaxed text-text-secondary">
                    <span className="line-clamp-5">{prompt.promptText}</span>
                  </span>
                ) : (
                  <span className="flex h-full items-center justify-center text-primary">
                    <Icon size={22} aria-hidden />
                  </span>
                )}
                <span className="absolute inset-x-0 bottom-0 block bg-gradient-to-t from-black/75 to-transparent px-2 pb-1.5 pt-6 text-white">
                  <span className="block truncate text-caption font-semibold leading-snug">{prompt.title}</span>
                  <span className="block text-[0.6875rem] leading-tight opacity-90">{t("discover.likesCount", { count: formatCount(prompt.likeCount) })}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ScrollRow>
    </section>
  );
}

/** A card of Keşfet's right column — the same quiet panel as Ana Sayfa's (`HomeRail`). */
function AsideCard({ id, title, action, children }: { id: string; title: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="rounded-xl bg-surface-soft p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id={id} className="flex items-center gap-1.5 font-display text-[1.1875rem] font-bold tracking-[-0.02em] text-text">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * Keşfet's right column from `xl` (docs/history/227-*; the creators strip and the rising-tag chips left the top of the page for it):
 * the most followed creators with a follow button, and the rising tags. Both come from the highlights already loaded for the page.
 */
export function DiscoverAside({ creators, tags, onSeeAllCreators }: { creators: UserProfile[]; tags: { trending: boolean; tags: StripTag[] } | null; onSeeAllCreators: () => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const visible = creators.filter((creator) => creator.id !== user?.id).slice(0, 5);
  const tagList = tags?.tags.slice(0, 8) ?? [];
  if (visible.length === 0 && tagList.length === 0) return null;
  return (
    <div className="space-y-4">
      {visible.length > 0 && (
        <AsideCard
          id="discover-creators"
          title={t("discover.featuredCreators")}
          action={
            <button type="button" onClick={onSeeAllCreators} className="shrink-0 text-small font-medium text-primary hover:text-primary-hover">
              {t("common.all")}
            </button>
          }
        >
          <ul className="space-y-3">
            {visible.map((creator) => (
              <li key={creator.id} className="flex items-center gap-3">
                <Link href={profileHref(creator)} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-full">
                  <Avatar src={creator.avatarUrl} alt={creator.displayName} size={40} />
                  <span className="min-w-0 leading-tight">
                    <span className="block truncate text-small font-semibold text-text">{creator.displayName}</span>
                    <span className="block truncate text-caption text-text-muted">
                      {formatCount(creator.followerCount)} {t("profile.followersSuffix")}
                    </span>
                  </span>
                </Link>
                <FollowButton user={creator} />
              </li>
            ))}
          </ul>
        </AsideCard>
      )}
      {tagList.length > 0 && (
        <AsideCard
          id="discover-trending-aside"
          title={
            <>
              <TrendingUp size={16} className="text-secondary" aria-hidden />
              {t(tags?.trending ? "discover.rising" : "discover.trending")}
            </>
          }
        >
          <div className="flex flex-wrap gap-2">
            {tagList.map((tag) => (
              <Link
                key={tag.slug}
                href={tagHref(tag)}
                title={tag.recentCount !== undefined ? t("home.railTrendCount", { count: tag.recentCount }) : undefined}
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-surface px-3 text-small font-semibold text-text transition-colors duration-200 hover:bg-primary-soft hover:text-primary"
              >
                #{tag.label}
                {tag.recentCount !== undefined && <span className="text-caption font-semibold tabular-nums text-secondary">{formatCount(tag.recentCount)}</span>}
              </Link>
            ))}
          </div>
        </AsideCard>
      )}
    </div>
  );
}
