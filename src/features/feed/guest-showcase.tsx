"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { buttonClassName } from "@/components/ui/button";
import { StorageAppearanceImage } from "@/components/ui/storage-media";
import { CopyPromptButton } from "@/features/prompts/copy-prompt-button";
import { EMPTY_TAXONOMY_FILTER } from "@/lib/content-taxonomy";
import { useTranslation } from "@/lib/i18n/language-provider";
import { fetchFeedPage } from "@/lib/supabase/feed";
import { cn, promptHref } from "@/lib/utils";
import type { Prompt } from "@/types";

/** Below this many picture prompts the wall would visibly repeat: the compact intro is shown instead. */
const MIN_ITEMS = 4;
const FETCH_LIMIT = 16;

/** The most liked public picture prompts that have both a picture and a prompt text. */
async function loadShowcase(): Promise<Prompt[]> {
  const page = await fetchFeedPage({
    scope: "all",
    order: "popular",
    kind: "prompt",
    taxonomy: { ...EMPTY_TAXONOMY_FILTER, contentType: "image" },
    limit: FETCH_LIMIT,
  });
  return page.items.flatMap((item) => (item.kind === "prompt" && item.data.media[0] && item.data.promptText.trim() ? [item.data] : []));
}

/**
 * The guest's first screen on Ana Sayfa (docs/history/209-*, "Canlı vitrin"): the pitch on one side, and on the other two
 * columns of the community's most liked picture prompts drifting slowly in opposite directions. Tapping a picture stops
 * the drift and slides up the exact prompt behind it — the thing Promptly is about — with Kopyala and a link to the post.
 * Signed-in members keep the compact composer (`HomeIntro`). `onUnavailable` hands back to the compact intro when there
 * are too few pictures or the request fails, so a guest never sees an empty wall.
 */
export function GuestShowcase({ onUnavailable }: { onUnavailable: () => void }) {
  const { t } = useTranslation();
  const [prompts, setPrompts] = useState<Prompt[] | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadShowcase()
      .then((items) => {
        if (!alive) return;
        if (items.length < MIN_ITEMS) onUnavailable();
        else setPrompts(items);
      })
      .catch((err) => {
        console.error("guest showcase", err);
        if (alive) onUnavailable();
      });
    return () => {
      alive = false;
    };
  }, [onUnavailable]);

  const columns = prompts ? [prompts.filter((_, i) => i % 2 === 0), prompts.filter((_, i) => i % 2 === 1)] : [[], []];

  return (
    <section
      aria-labelledby="guest-showcase-title"
      className="relative grid overflow-hidden rounded-xl border border-border-soft bg-surface shadow-card md:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)]"
    >
      <div className="relative z-10 space-y-3 self-center px-5 pb-5 pt-6 sm:px-8 sm:py-9">
        <p className="text-caption font-semibold uppercase tracking-[0.08em] text-primary">{t("nav.tagline")}</p>
        <h1 id="guest-showcase-title" className="text-h1 font-semibold text-text">
          {t("showcase.title")}
        </h1>
        <p className="text-small text-text-secondary sm:text-body">{t("showcase.description")}</p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Link href="/signup" className={buttonClassName({ size: "sm" })}>
            {t("showcase.join")}
          </Link>
          <Link href="/login" className={buttonClassName({ size: "sm", variant: "ghost" })}>
            {t("common.login")}
          </Link>
        </div>
      </div>

      <div
        className={cn(
          "showcase-wall relative grid h-[19rem] grid-cols-2 gap-2.5 overflow-hidden px-3 sm:h-[22rem] sm:px-4 md:h-[26rem]",
          openKey && "showcase-paused",
        )}
        aria-label={t("showcase.wallAria")}
        role="group"
      >
        {prompts === null
          ? [0, 1].map((col) => (
              <div key={col} className="space-y-2.5 pt-3">
                {[0, 1, 2].map((row) => (
                  <div key={row} className="skeleton-shimmer rounded-lg bg-surface-soft" style={{ aspectRatio: row % 2 === col % 2 ? 1.05 : 0.8 }} />
                ))}
              </div>
            ))
          : columns.map((column, col) => (
              <div key={col} className="min-w-0">
                {/* The list twice, so the drift loops seamlessly; the copy is invisible to assistive tech and the tab order. */}
                <div className={cn("showcase-track flex flex-col gap-2.5", col === 1 && "showcase-track-reverse")}>
                  {[0, 1].map((copy) => (
                    <div key={copy} className="flex flex-col gap-2.5" aria-hidden={copy === 1 || undefined} inert={copy === 1}>
                      {column.map((prompt, index) => {
                        const key = `${copy}-${prompt.id}`;
                        return (
                          <ShowcaseTile
                            key={key}
                            prompt={prompt}
                            tall={(index + col) % 2 === 1}
                            open={openKey === key}
                            onToggle={() => setOpenKey((current) => (current === key ? null : key))}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            ))}
      </div>
    </section>
  );
}

function ShowcaseTile({ prompt, tall, open, onToggle }: { prompt: Prompt; tall: boolean; open: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  const media = prompt.media[0];
  return (
    <div className="relative overflow-hidden rounded-lg bg-surface-soft" style={{ aspectRatio: tall ? 0.8 : 1.05 }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={t("showcase.tileAria", { title: prompt.title })}
        className="group absolute inset-0 block text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
      >
        <StorageAppearanceImage
          src={media.url}
          alt={media.alt}
          color={media.color}
          placeholder={media.placeholder}
          sizes="(min-width: 768px) 22vw, 45vw"
          className="object-cover transition-transform duration-700 ease-soft group-hover:scale-[1.04]"
        />
        <span
          className={cn(
            "absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 pb-2.5 pt-8 font-display text-[0.8125rem] font-bold leading-tight text-white transition-opacity duration-300",
            open && "opacity-0",
          )}
        >
          {prompt.title}
        </span>
      </button>
      {/* The prompt slides up over the picture; its controls only exist while it is open. */}
      <div
        className={cn(
          "absolute inset-0 flex flex-col justify-end gap-2 bg-black/80 p-3 text-white transition-[transform,visibility] duration-500 ease-soft",
          open ? "visible translate-y-0" : "invisible translate-y-full",
        )}
        onClick={onToggle}
      >
        <p className="line-clamp-5 font-mono text-[0.6875rem] leading-relaxed text-white/90">{prompt.promptText}</p>
        {open && (
          <div className="flex items-center gap-1.5" onClick={(event) => event.stopPropagation()}>
            <CopyPromptButton text={prompt.promptText} promptId={prompt.id} size="sm" variant="primary" className="h-8 min-w-0 rounded-full px-3" />
            <Link
              href={promptHref(prompt)}
              aria-label={t("showcase.open")}
              title={t("showcase.open")}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25"
            >
              <ArrowUpRight size={15} aria-hidden />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
