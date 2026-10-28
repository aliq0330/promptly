import { cn } from "@/lib/utils";
import type { ContentSummary } from "@/features/communities/content-summary";

/**
 * The surface of a card that has no picture (a prompt's text, a preset's parameters, a workflow's steps, a request's brief —
 * docs/history/266-*). Built only from theme tokens, so every palette and both modes recolour it; the tone is one of five SOFT
 * tints of the current theme (brand, accent, neutral, gradients), picked from the post's id so a feed of text cards is not one flat colour. Text inside uses `currentColor` (`border-current/15`, `bg-current/10`,
 * `opacity-*`) so it reads on every tone. The surface is exactly as tall as its content (a short text is a short card, capped by the excerpt's line clamp), with a small minimum.
 */
const TONES = [
  "bg-primary-soft",
  "bg-[color-mix(in_srgb,var(--color-secondary)_14%,var(--color-surface))]",
  "bg-gradient-to-br from-primary-soft to-[color-mix(in_srgb,var(--color-secondary)_16%,var(--color-surface))]",
  "bg-surface-soft",
  "bg-[color-mix(in_srgb,var(--color-primary)_7%,var(--color-surface-soft))]",
] as const;

export function textArtTone(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return TONES[hash % TONES.length];
}

export function TextArt({ seed, className, children }: { seed: string; className?: string; children: React.ReactNode }) {
  return <div className={cn("flex min-h-28 w-full flex-col gap-2.5 overflow-hidden py-4 pl-4 pr-14 text-text", textArtTone(seed), className)}>{children}</div>;
}

/** A title set big inside a text surface (the real title link stays in the card's hidden hover layer, so this is decoration for assistive tech). */
export function TextArtTitle({ children }: { children: React.ReactNode }) {
  return (
    <p aria-hidden className="line-clamp-2 break-words font-display text-h3 font-extrabold leading-[1.1] tracking-[-0.02em]">
      {children}
    </p>
  );
}

/** A mono excerpt: as many lines as the text has, up to 8, then an ellipsis. */
export function TextArtExcerpt({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("prompt-text line-clamp-8 break-words whitespace-pre-line", className)}>
      {children}
    </p>
  );
}

/** The text surface of a quoted / applied post whose content has no picture: its title and the most telling text it has. */
export function SummaryTextArt({ summary, seed }: { summary: ContentSummary; seed: string }) {
  const text = summary.promptText ?? summary.description ?? "";
  return (
    <TextArt seed={seed}>
      {summary.promptText ? null : <TextArtTitle>{summary.title}</TextArtTitle>}
      {text.trim() ? <TextArtExcerpt className={summary.promptText ? undefined : "line-clamp-4 font-sans text-small leading-relaxed"}>{text}</TextArtExcerpt> : null}
      {summary.creativeDirection && <p className="line-clamp-1 text-caption opacity-75">{summary.creativeDirection}</p>}
    </TextArt>
  );
}
