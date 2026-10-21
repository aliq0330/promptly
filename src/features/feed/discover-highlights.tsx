"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Flame, Heart, TrendingUp } from "lucide-react";
import { StorageImg } from "@/components/ui/storage-media";
import { Avatar } from "@/components/ui/avatar";
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

/** Shared horizontal strip: edge-to-edge scroll on phones, inside the column from `sm`. */
const STRIP_CLASS = "scrollbar-none -mx-3 flex touch-pan-x gap-2 overflow-x-auto overscroll-x-contain px-3 sm:mx-0 sm:px-0";

/**
 * Discover's compact top (docs/history/210-*: categories · rising tags · popular · creators, then the posts), all from real rows:
 * - the most liked public prompts of the last 7 days ("Bu hafta popüler"); if that window has fewer than three, the last 30 days
 *   ("Bu ay popüler"); fewer still and the strip is not drawn;
 * - the categories the most liked public prompts are filed under, most frequent first, with their covers as the collage;
 * - the tags of the real trending window (`trending_tags`), or — while that window is empty — the most used tags;
 * - the most followed creators.
 */
export function useDiscoverHighlights() {
  const [popular, setPopular] = useState<{ window: PopularWindow; prompts: Prompt[] } | null>(null);
  const [sample, setSample] = useState<Prompt[]>([]);
  const [tags, setTags] = useState<{ trending: boolean; tags: StripTag[] } | null>(null);
  const [creators, setCreators] = useState<UserProfile[]>([]);

  useEffect(() => {
    let cancelled = false;
    const now = Date.now();
    (async () => {
      const week = await fetchTopPrompts({ since: new Date(now - 7 * DAY_MS).toISOString(), limit: 10 });
      if (week.length >= POPULAR_MIN) return { window: "week" as const, prompts: week };
      const month = await fetchTopPrompts({ since: new Date(now - 30 * DAY_MS).toISOString(), limit: 10 });
      return month.length >= POPULAR_MIN ? { window: "month" as const, prompts: month } : null;
    })().then((result) => !cancelled && setPopular(result));
    fetchTopPrompts({ limit: CATEGORY_SAMPLE }).then((top) => !cancelled && setSample(top));
    (async () => {
      const trending = await fetchTrendingTags(10);
      if (trending.length > 0) return { trending: true, tags: trending as StripTag[] };
      return { trending: false, tags: (await fetchPopularTags(10)) as StripTag[] };
    })().then((result) => !cancelled && setTags(result));
    fetchCreatorsPage(null, CREATORS_MAX + 1)
      .then((page) => !cancelled && setCreators(page.creators))
      .catch((err) => console.error("fetchCreatorsPage (discover)", err));
    return () => {
      cancelled = true;
    };
  }, []);

  return { popular, sample, tags, creators };
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
  covers: string[];
  hits: number;
}

/**
 * The categories as one scrolling row of small pills (a 2×2 collage of real covers + name + type); each opens the category's
 * own page (`categoryHref`, docs/history/211-*).
 */
export function CategoryStrip({ sample }: { sample: Prompt[] }) {
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
      const entry = byKey.get(key) ?? { type: prompt.contentType, id: category.id, labelKey: category.labelKey, covers: [], hits: 0 };
      entry.hits += 1;
      const cover = prompt.contentType === "image" ? prompt.media[0]?.url : undefined;
      if (cover && entry.covers.length < 2) entry.covers.push(cover);
      byKey.set(key, entry);
    }
    return [...byKey.values()].sort((a, b) => b.hits - a.hits).slice(0, CATEGORY_MAX);
  })();

  if (entries.length === 0) return null;
  return (
    <section aria-labelledby="discover-categories" className="space-y-2">
      <h2 id="discover-categories" className="sr-only">
        {t("discover.categories")}
      </h2>
      <div className={STRIP_CLASS}>
        {entries.map((entry) => {
          const Icon = CONTENT_TYPE_META[entry.type].icon;
          // Two covers make a diagonal (a b / b a); one fills all four cells.
          const cells = entry.covers.length === 0 ? [] : [0, 1, 1, 0].map((i) => entry.covers[i % entry.covers.length]);
          return (
            <Link
              key={`${entry.type}:${entry.id}`}
              href={categoryHref(entry.type, entry.id)}
              data-discover-category={`${entry.type}:${entry.id}`}
              className="flex shrink-0 items-center gap-2 rounded-[14px] border border-border-soft bg-surface py-1.5 pl-1.5 pr-3 text-left transition-colors duration-200 ease-soft hover:border-border"
            >
              {cells.length > 0 ? (
                <span aria-hidden className="grid h-8 w-8 shrink-0 grid-cols-2 gap-0.5 overflow-hidden rounded-lg">
                  {cells.map((url, index) => (
                    <StorageImg key={index} src={url} alt="" className="h-full w-full object-cover" />
                  ))}
                </span>
              ) : (
                <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  <Icon size={16} strokeWidth={1.9} />
                </span>
              )}
              <span className="leading-tight">
                <span className="block whitespace-nowrap text-small font-semibold text-text">{taxonomyLabel(entry.labelKey, language)}</span>
                <span className="block whitespace-nowrap text-caption text-text-muted">{t(CONTENT_TYPE_META[entry.type].labelKey)}</span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

/** Rising tags as one row of chips; the number is the real post count of the trending window (absent for the fallback). */
export function TagStrip({ tags }: { tags: { trending: boolean; tags: StripTag[] } | null }) {
  const { t } = useTranslation();
  if (!tags || tags.tags.length === 0) return null;
  return (
    <section aria-labelledby="discover-trending" className={cn(STRIP_CLASS, "items-center")}>
      <h2 id="discover-trending" className="flex shrink-0 items-center gap-1 text-caption font-semibold text-text-muted">
        <TrendingUp size={14} className="text-secondary" aria-hidden />
        {t(tags.trending ? "discover.rising" : "discover.trending")}
      </h2>
      {tags.tags.map((tag) => (
        <Link
          key={tag.slug}
          href={tagHref(tag)}
          title={tag.recentCount !== undefined ? t("home.railTrendCount", { count: tag.recentCount }) : undefined}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-surface-soft px-3 text-small font-semibold text-text transition-colors duration-200 hover:bg-primary-soft hover:text-primary"
        >
          #{tag.label}
          {tag.recentCount !== undefined && <span className="text-caption font-semibold tabular-nums text-secondary">{formatCount(tag.recentCount)}</span>}
        </Link>
      ))}
    </section>
  );
}

/** The popular strip: small, horizontally scrolling prompt tiles (cover or prompt text, title, author, likes). */
export function PopularStrip({ popular }: { popular: { window: PopularWindow; prompts: Prompt[] } | null }) {
  const { t } = useTranslation();
  if (!popular) return null;
  return (
    <section aria-labelledby="discover-popular" className="space-y-2" data-discover-popular={popular.window}>
      <StripHeader id="discover-popular">
        <Flame size={16} className="text-secondary" aria-hidden />
        {t(popular.window === "week" ? "discover.popularWeek" : "discover.popularMonth")}
      </StripHeader>
      <ul className={STRIP_CLASS}>
        {popular.prompts.map((prompt) => {
          const Icon = CONTENT_TYPE_META[prompt.contentType].icon;
          const cover = prompt.contentType === "image" ? prompt.media[0] : undefined;
          return (
            <li key={prompt.id} className="w-28 shrink-0 sm:w-36">
              <Link href={promptHref(prompt)} className="group block space-y-1">
                <span className="relative block aspect-square overflow-hidden rounded-[14px] border border-border-soft bg-surface-soft">
                  {cover ? (
                    <StorageImg src={cover.url} alt="" className="h-full w-full object-cover transition-transform duration-200 ease-soft group-hover:scale-[1.03]" />
                  ) : prompt.promptText.trim() ? (
                    <span className="prompt-text block p-2.5 text-[0.6875rem] leading-relaxed text-text-secondary">
                      <span className="line-clamp-5">{prompt.promptText}</span>
                    </span>
                  ) : (
                    <span className="flex h-full items-center justify-center text-primary">
                      <Icon size={22} aria-hidden />
                    </span>
                  )}
                </span>
                <span className="block truncate text-small font-semibold leading-snug text-text group-hover:text-primary">{prompt.title}</span>
                <span className="flex items-center gap-1.5 text-caption text-text-muted">
                  <span className="min-w-0 flex-1 truncate">@{prompt.author.username}</span>
                  <span className="inline-flex shrink-0 items-center gap-0.5">
                    <Heart size={11} aria-hidden /> {formatCount(prompt.likeCount)}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Most followed creators as compact pills (avatar · name · followers · Takip et); "Tümü" opens the Yaratıcılar section. */
export function CreatorStrip({ creators, onSeeAll }: { creators: UserProfile[]; onSeeAll: () => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const visible = creators.filter((creator) => creator.id !== user?.id).slice(0, CREATORS_MAX);
  if (visible.length === 0) return null;
  return (
    <section aria-labelledby="discover-creators" className="space-y-2">
      <StripHeader
        id="discover-creators"
        action={
          <button type="button" onClick={onSeeAll} className="text-small font-medium text-primary hover:text-primary-hover">
            {t("common.viewAll")}
          </button>
        }
      >
        {t("discover.featuredCreators")}
      </StripHeader>
      <ul className={STRIP_CLASS}>
        {visible.map((creator) => (
          <li key={creator.id} className="flex shrink-0 items-center gap-2 rounded-full border border-border-soft bg-surface py-1.5 pl-1.5 pr-1.5">
            <Link href={profileHref(creator)} className="flex min-w-0 items-center gap-2 rounded-full">
              <Avatar src={creator.avatarUrl} alt={creator.displayName} size={36} />
              <span className="max-w-[8.5rem] leading-tight">
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
    </section>
  );
}
