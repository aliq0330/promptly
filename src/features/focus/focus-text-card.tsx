"use client";

import { useMemo } from "react";
import { Video } from "lucide-react";
import { ContentCard } from "@/features/content/content-card";
import { CONTENT_TYPE_META } from "@/features/prompts/content-type-meta";
import { useTranslation } from "@/lib/i18n/language-provider";
import { promptHref } from "@/lib/utils";
import type { Prompt } from "@/types";
import { FocusActions, FocusCreator, FocusTitle, FocusTypeBadge } from "./focus-parts";

const EXCERPT_CHARS = 280;

/** A short, single-flow excerpt of the prompt — never the whole text. */
function excerptOf(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > EXCERPT_CHARS ? `${flat.slice(0, EXCERPT_CHARS).trimEnd()}…` : flat;
}

/** Deterministic bar heights (percent) from a seed — decoration only, so the same prompt always looks the same. */
function waveHeights(seed: string, bars = 26): number[] {
  let state = 0;
  for (let i = 0; i < seed.length; i += 1) state = (state * 31 + seed.charCodeAt(i)) >>> 0;
  const out: number[] = [];
  for (let i = 0; i < bars; i += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const envelope = 0.45 + 0.55 * Math.sin((Math.PI * (i + 0.5)) / bars);
    out.push(Math.round(18 + (state % 82) * envelope));
  }
  return out;
}

/**
 * Focus card for a prompt with no picture (text, audio, video — and the odd
 * image prompt without media): the prompt's own words are the hero. A real
 * excerpt of the prompt in display type, faded at the bottom, never the full
 * text. Audio gets a waveform and video a film glyph as a quiet visual cue —
 * both decorative (`aria-hidden`); there is no audio/video asset on a prompt
 * to play, so no play control is faked.
 */
export function FocusTextCard({ prompt }: { prompt: Prompt }) {
  const { t } = useTranslation();
  const href = promptHref(prompt);
  const meta = CONTENT_TYPE_META[prompt.contentType];
  const excerpt = useMemo(() => excerptOf(prompt.promptText || prompt.description), [prompt.promptText, prompt.description]);
  const heights = useMemo(() => (prompt.contentType === "audio" ? waveHeights(prompt.id) : []), [prompt.contentType, prompt.id]);

  return (
    <ContentCard href={href} className="overflow-hidden">
      <div className="flex flex-1 flex-col gap-3 p-3 sm:p-3.5">
        <FocusCreator user={prompt.author} />

        <div className="relative overflow-hidden rounded-md bg-surface-soft px-3 pb-3 pt-2.5">
          {prompt.contentType === "audio" ? (
            <div aria-hidden className="mb-2 flex h-10 items-center gap-[2px]">
              {heights.map((height, index) => (
                <span key={index} className="flex-1 rounded-full bg-primary/60" style={{ height: `${height}%` }} />
              ))}
            </div>
          ) : prompt.contentType === "video" ? (
            <div aria-hidden className="mb-2 flex h-10 items-center gap-2 text-primary/70">
              <Video size={18} strokeWidth={1.75} />
              <span className="h-px flex-1 bg-primary/25" />
              <span className="h-2.5 w-2.5 rounded-xs bg-primary/25" />
              <span className="h-2.5 w-2.5 rounded-xs bg-primary/25" />
              <span className="h-2.5 w-2.5 rounded-xs bg-primary/25" />
            </div>
          ) : (
            <span aria-hidden className="block font-display text-h1 leading-none text-primary/40">
              “
            </span>
          )}
          <p className="line-clamp-6 break-words font-display text-small leading-relaxed text-text sm:text-body">{excerpt}</p>
          <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-surface-soft to-transparent" />
        </div>

        <div className="space-y-1.5">
          <FocusTitle href={href} title={prompt.title} />
          <FocusTypeBadge icon={meta.icon} label={t(meta.labelKey)} />
        </div>
      </div>
      <FocusActions item={{ kind: "prompt", data: prompt }} />
    </ContentCard>
  );
}
