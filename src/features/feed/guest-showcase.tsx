"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "@/components/icons/arrow-up-right";
import { buttonClassName } from "@/components/ui/button";
import { Coverflow, CoverflowArrows } from "@/components/ui/coverflow";
import { StorageAppearanceImage } from "@/components/ui/storage-media";
import { CopyPromptButton } from "@/features/prompts/copy-prompt-button";
import { useTranslation } from "@/lib/i18n/language-provider";
import { stepIndex } from "@/lib/coverflow";
import { cn, promptHref } from "@/lib/utils";
import type { Prompt } from "@/types";
import { loadShowcase, SHOWCASE_MIN_ITEMS } from "./showcase-data";

const STAGE_HEIGHT = "h-[18rem] sm:h-[20rem] md:h-[23rem]";

/**
 * The guest's first screen on Ana Sayfa (docs/history/209-*, 346-*): the pitch on one side, and on the other a coverflow of the
 * community's most liked picture prompts. Tapping a side card brings it to the centre; tapping the centre card slides up the
 * exact prompt behind it — the thing Promptly is about — with Kopyala and a link to the post. Signed-in members see nothing
 * here (`HomeIntro`). `onUnavailable` hands back to the compact intro when there are too few pictures or the request fails,
 * so a guest never sees an empty gallery.
 */
export function GuestShowcase({ onUnavailable }: { onUnavailable: () => void }) {
  const { t } = useTranslation();
  const [prompts, setPrompts] = useState<Prompt[] | null>(null);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    loadShowcase()
      .then((items) => {
        if (!alive) return;
        if (items.length < SHOWCASE_MIN_ITEMS) onUnavailable();
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

  const go = useCallback((index: number) => {
    setActive(index);
    setOpen(false);
  }, []);
  const current = prompts?.[active];

  return (
    <section
      aria-labelledby="guest-showcase-title"
      className="relative grid overflow-hidden rounded-lg border border-border-soft bg-surface shadow-card md:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)]"
    >
      <div className="relative z-10 space-y-3 self-center px-5 pb-5 pt-6 sm:px-8 sm:py-9">
        <p className="text-caption font-semibold uppercase tracking-[0.08em] text-primary">{t("nav.tagline")}</p>
        <h1 id="guest-showcase-title" className="text-h1 font-bold text-text">
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

      <div className="flex min-w-0 flex-col bg-surface-soft">
        {prompts === null ? (
          <div className={cn("flex items-center justify-center gap-3 px-6", STAGE_HEIGHT)} aria-hidden>
            {[0.72, 1, 0.72].map((scale, index) => (
              <div key={index} className="skeleton-shimmer aspect-[4/5] h-[72%] rounded-lg bg-surface" style={{ transform: `scale(${scale})`, opacity: scale === 1 ? 1 : 0.6 }} />
            ))}
          </div>
        ) : (
          <Coverflow
            items={prompts}
            active={active}
            onActiveChange={go}
            itemKey={(prompt) => prompt.id}
            itemLabel={(prompt) => prompt.title}
            label={t("showcase.wallAria")}
            className={STAGE_HEIGHT}
            renderCard={(prompt, state) => <ShowcaseCard prompt={prompt} active={state.active} open={state.active && open} onToggle={() => setOpen((value) => !value)} />}
          />
        )}
        <div className="flex items-center gap-3 px-4 pb-4 pt-1 sm:px-5" aria-live="polite">
          <div className="min-w-0 flex-1">
            {current ? (
              <>
                <p className="truncate text-caption font-semibold uppercase tracking-[0.07em] text-text-muted">
                  {current.tool ? `${current.author.displayName} · ${current.tool}` : current.author.displayName}
                </p>
                <p className="truncate font-display text-body font-bold text-text">{current.title}</p>
                <p className="text-caption text-text-muted">{t("showcase.hint")}</p>
              </>
            ) : (
              <div className="space-y-1.5" aria-hidden>
                <div className="skeleton-shimmer h-3 w-1/3 rounded bg-surface" />
                <div className="skeleton-shimmer h-4 w-1/2 rounded bg-surface" />
              </div>
            )}
          </div>
          {prompts && <CoverflowArrows onPrev={() => go(stepIndex(active, -1, prompts.length))} onNext={() => go(stepIndex(active, 1, prompts.length))} />}
        </div>
      </div>
    </section>
  );
}

/** One card: the picture and its title; on the centre card a button slides the prompt up over the picture. */
function ShowcaseCard({ prompt, active, open, onToggle }: { prompt: Prompt; active: boolean; open: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  const media = prompt.media[0];
  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={active ? open : undefined}
        aria-label={t("showcase.tileAria", { title: prompt.title })}
        className="group absolute inset-0 block text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
      >
        <StorageAppearanceImage
          src={media.url}
          alt={media.alt}
          color={media.color}
          placeholder={media.placeholder}
          sizes="(min-width: 768px) 22vw, 45vw"
          className="object-cover"
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
      {active && (
        <div
          className={cn(
            "absolute inset-0 flex flex-col justify-end gap-2 bg-black/80 p-3 text-white transition-[transform,visibility] duration-500 ease-soft",
            open ? "visible translate-y-0" : "invisible translate-y-full",
          )}
          onClick={onToggle}
        >
          <p className="line-clamp-6 font-mono text-micro leading-relaxed text-white/90">{prompt.promptText}</p>
          {open && (
            <div className="flex items-center gap-1.5" onClick={(event) => event.stopPropagation()}>
              <CopyPromptButton text={prompt.promptText} promptId={prompt.id} size="sm" variant="primary" className="h-8 min-w-0 rounded-full px-3" />
              <Link
                href={promptHref(prompt)}
                aria-label={t("showcase.open")}
                title={t("showcase.open")}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25"
              >
                <ArrowUpRight size={16} aria-hidden />
              </Link>
            </div>
          )}
        </div>
      )}
    </>
  );
}
