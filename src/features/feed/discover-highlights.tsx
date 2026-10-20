"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Flame, Heart } from "lucide-react";
import { StorageImg } from "@/components/ui/storage-media";
import { Avatar } from "@/components/ui/avatar";
import { CardBandBackdrop } from "@/features/content/content-card";
import { Eyebrow } from "@/features/content/detail-parts";
import { CopyPromptButton } from "@/features/prompts/copy-prompt-button";
import { CONTENT_TYPE_META } from "@/features/prompts/content-type-meta";
import { CONTENT_TYPE_IDS } from "@/lib/content-taxonomy";
import { fetchPublicPromptCounts, fetchTopPrompts } from "@/lib/supabase/prompts";
import { cn, formatCount, promptHref } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TaxonomyFilterValue } from "@/lib/content-taxonomy";
import type { Prompt, PromptContentType } from "@/types";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Fewer than this in a window and the strip falls back to the wider window (then hides) — never padded with older posts under a "this week" title. */
const POPULAR_MIN = 3;

type PopularWindow = "week" | "month";

/**
 * Discover's highlights (Meydan, docs/history/190-* Faz 6), all from real rows:
 * - the most liked public prompts of the last 7 days ("Bu hafta popüler"); if that window has fewer than three, the last 30 days
 *   ("Bu ay popüler"); fewer still and the strip is not drawn;
 * - per content type, the public prompt count and the most liked prompt as the tile's preview (an image prompt's output, a text
 *   prompt's text; audio/video keep their icon — their media may be the file itself, not a still).
 */
export function useDiscoverHighlights() {
  const [popular, setPopular] = useState<{ window: PopularWindow; prompts: Prompt[] } | null>(null);
  const [counts, setCounts] = useState<Partial<Record<PromptContentType, number | null>>>({});
  const [previews, setPreviews] = useState<Partial<Record<PromptContentType, Prompt>>>({});

  useEffect(() => {
    let cancelled = false;
    const now = Date.now();
    (async () => {
      const week = await fetchTopPrompts({ since: new Date(now - 7 * DAY_MS).toISOString(), limit: 10 });
      if (week.length >= POPULAR_MIN) return { window: "week" as const, prompts: week };
      const month = await fetchTopPrompts({ since: new Date(now - 30 * DAY_MS).toISOString(), limit: 10 });
      return month.length >= POPULAR_MIN ? { window: "month" as const, prompts: month } : null;
    })().then((result) => !cancelled && setPopular(result));
    fetchPublicPromptCounts(CONTENT_TYPE_IDS).then((result) => !cancelled && setCounts(result));
    fetchTopPrompts({ limit: 40 }).then((top) => {
      if (cancelled) return;
      const picked: Partial<Record<PromptContentType, Prompt>> = {};
      for (const prompt of top) {
        // Video/audio media may be the file itself, not a still — those tiles keep their icon.
        const usable = prompt.contentType === "text" ? prompt.promptText.trim().length > 0 : prompt.contentType === "image" && prompt.media.length > 0;
        if (usable && !picked[prompt.contentType]) picked[prompt.contentType] = prompt;
      }
      setPreviews(picked);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { popular, counts, previews };
}

/** Image / Text / Audio / Video as large toggle tiles with a real preview and count; picking the selected one again clears the type filter. */
export function ContentTypeTiles({
  value,
  onChange,
  counts,
  previews,
}: {
  value: TaxonomyFilterValue;
  onChange: (next: TaxonomyFilterValue) => void;
  counts: Partial<Record<PromptContentType, number | null>>;
  previews: Partial<Record<PromptContentType, Prompt>>;
}) {
  const { t } = useTranslation();
  return (
    <div role="group" aria-label={t("toolbar.contentTypeAria")} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {CONTENT_TYPE_IDS.map((type) => {
        const meta = CONTENT_TYPE_META[type];
        const Icon = meta.icon;
        const selected = value.contentType === type;
        const preview = previews[type];
        const count = counts[type];
        return (
          <button
            key={type}
            type="button"
            aria-pressed={selected}
            data-type-tile={type}
            onClick={() => onChange({ contentType: selected ? null : type, category: null, subcategory: null })}
            className={cn(
              "relative flex h-32 flex-col justify-end overflow-hidden rounded-xl p-3 text-left transition-[background-color,box-shadow,transform] duration-200 ease-soft active:scale-[0.98] sm:h-36",
              selected ? "bg-primary-soft ring-2 ring-primary" : "bg-surface-soft hover:bg-border-soft",
            )}
          >
            {preview && type === "image" && preview.media[0] && (
              <StorageImg src={preview.media[0].url} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover" />
            )}
            {preview && type === "text" && (
              <span aria-hidden className="prompt-text absolute inset-x-3 top-3 line-clamp-3 text-[0.6875rem] leading-relaxed text-text-secondary">
                {preview.promptText}
              </span>
            )}
            {!preview && (
              <span className={cn("absolute left-3 top-3 flex h-9 w-9 items-center justify-center rounded-full", selected ? "bg-primary text-primary-foreground" : "bg-surface text-primary")}>
                <Icon size={18} strokeWidth={1.9} aria-hidden />
              </span>
            )}
            {/* The label sits on its own chip so it stays legible over any preview image. */}
            <span className="relative w-fit max-w-full rounded-lg bg-surface/95 px-2.5 py-1.5 shadow-xs">
              <span className="block font-display text-[1.0625rem] font-bold leading-tight tracking-[-0.02em] text-text">{t(meta.labelKey)}</span>
              {typeof count === "number" && <span className="block text-caption text-text-muted">{t("discover.typeCount", { count: formatCount(count) })}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** The popular strip: compact, horizontally scrolling prompt tiles (cover or text, title, author, likes). */
export function PopularStrip({ popular }: { popular: { window: PopularWindow; prompts: Prompt[] } | null }) {
  const { t } = useTranslation();
  if (!popular) return null;
  return (
    <section aria-labelledby="discover-popular" className="space-y-2.5" data-discover-popular={popular.window}>
      <h2 id="discover-popular" className="flex items-center gap-1.5 font-display text-h3 font-bold text-text">
        <Flame size={17} className="text-secondary" aria-hidden />
        {t(popular.window === "week" ? "discover.popularWeek" : "discover.popularMonth")}
      </h2>
      <PopularHero prompt={popular.prompts[0]} />
      <ul className="scrollbar-none -mx-3 flex touch-pan-x gap-3 overflow-x-auto overscroll-x-contain px-3 pb-1 sm:mx-0 sm:px-0">
        {popular.prompts.slice(1).map((prompt) => {
          const Icon = CONTENT_TYPE_META[prompt.contentType].icon;
          const cover = prompt.contentType === "image" ? prompt.media[0] : undefined;
          return (
            <li key={prompt.id} className="w-52 shrink-0">
              <Link href={promptHref(prompt)} className="group block overflow-hidden rounded-xl border border-border-soft bg-surface shadow-xs transition-shadow hover:shadow-card-hover">
                <span className="relative block h-28 bg-surface-soft">
                  {cover ? (
                    <StorageImg src={cover.url} alt="" className="h-full w-full object-cover" />
                  ) : prompt.promptText.trim() ? (
                    <span className="prompt-text block p-3 text-[0.6875rem] leading-relaxed text-text-secondary">
                      <span className="line-clamp-4">{prompt.promptText}</span>
                    </span>
                  ) : (
                    <span className="flex h-full items-center justify-center text-primary">
                      <Icon size={22} aria-hidden />
                    </span>
                  )}
                </span>
                <span className="block space-y-1 p-3">
                  <span className="line-clamp-2 text-small font-semibold leading-snug text-text group-hover:text-primary">{prompt.title}</span>
                  <span className="flex items-center gap-2 text-caption text-text-muted">
                    <span className="min-w-0 flex-1 truncate">@{prompt.author.username}</span>
                    <span className="inline-flex shrink-0 items-center gap-1">
                      <Heart size={12} aria-hidden /> {formatCount(prompt.likeCount)}
                    </span>
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

/**
 * The window's number one as an Albüm showcase (docs/history/203-*): a band tinted by its picture, the picture (or its prompt
 * text) as the art, "1 · Bu hafta popüler", the big title, the author and likes, and one big "Kopyala".
 */
function PopularHero({ prompt }: { prompt: Prompt }) {
  const { t } = useTranslation();
  const cover = prompt.contentType === "image" ? prompt.media[0] : undefined;
  const Icon = CONTENT_TYPE_META[prompt.contentType].icon;
  return (
    <article className="relative rounded-xl" data-discover-hero>
      <CardBandBackdrop className="rounded-xl" backdrop={cover ? <StorageImg src={cover.url} alt="" className="h-full w-full object-cover" /> : undefined} />
      <div className="relative flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:gap-6 sm:p-5">
        <Link href={promptHref(prompt)} aria-hidden tabIndex={-1} className="block w-full shrink-0 overflow-hidden rounded-[18px] bg-surface shadow-pop sm:w-60">
          {cover ? (
            <StorageImg src={cover.url} alt="" className="aspect-[4/3] h-full w-full object-cover" />
          ) : prompt.promptText.trim() ? (
            <span className="prompt-text block aspect-[4/3] p-4 text-[0.75rem] leading-relaxed text-text-secondary">
              <span className="line-clamp-6">{prompt.promptText}</span>
            </span>
          ) : (
            <span className="flex aspect-[4/3] items-center justify-center text-primary">
              <Icon size={40} strokeWidth={1.4} />
            </span>
          )}
        </Link>
        <div className="min-w-0 flex-1 space-y-2.5">
          <Eyebrow tone="primary">
            <Flame size={13} aria-hidden className="text-secondary" /> 1 · {t(CONTENT_TYPE_META[prompt.contentType].labelKey)}
          </Eyebrow>
          <h3 className="break-words font-display text-[1.625rem] font-extrabold leading-[1.05] tracking-[-0.03em] text-text sm:text-[2rem]">
            <Link href={promptHref(prompt)} className="hover:text-primary">
              {prompt.title}
            </Link>
          </h3>
          <p className="flex items-center gap-2 text-small text-text-secondary">
            <Avatar src={prompt.author.avatarUrl} alt={prompt.author.displayName} size={24} />
            <span className="min-w-0 truncate">
              <span className="font-semibold text-text">{prompt.author.displayName}</span> · <Heart size={12} aria-hidden className="inline" /> {formatCount(prompt.likeCount)}
            </span>
          </p>
          {prompt.promptText.trim() && (
            <CopyPromptButton text={prompt.promptText} promptId={prompt.id} size="md" variant="primary" label={t("common.copy")} className="h-11 rounded-full px-6 shadow-pop" />
          )}
        </div>
      </div>
    </article>
  );
}
