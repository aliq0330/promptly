import { cn } from "@/lib/utils";
import type { ContentSummary } from "@/features/communities/content-summary";

/**
 * The surface of a card that has no picture (a prompt's text, a preset's parameters, a workflow's steps, a request's brief —
 * docs/history/266-*). Built only from theme tokens, so every palette and both modes recolour it; the tone is picked from the
 * post's id so a feed of text cards is not one flat pastel. Text inside uses `currentColor` (`border-current/15`, `bg-current/10`,
 * `opacity-*`) so it reads on every tone. Fixed 4:3 so these cards stay short and dense, never taller than a picture card.
 */
const TONES = [
  "bg-primary-soft text-text",
  "bg-primary text-primary-foreground",
  "bg-text text-background",
  "bg-[color-mix(in_srgb,var(--color-secondary)_18%,var(--color-surface))] text-text",
  "bg-gradient-to-br from-primary-soft to-[color-mix(in_srgb,var(--color-secondary)_24%,var(--color-surface))] text-text",
] as const;

export function textArtTone(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return TONES[hash % TONES.length];
}

export function TextArt({ seed, className, children }: { seed: string; className?: string; children: React.ReactNode }) {
  return <div className={cn("flex aspect-[4/3] w-full flex-col overflow-hidden p-4", textArtTone(seed), className)}>{children}</div>;
}

/** A title set big inside a text surface (the real title link stays in the card's hidden hover layer, so this is decoration for assistive tech). */
export function TextArtTitle({ children }: { children: React.ReactNode }) {
  return (
    <p aria-hidden className="line-clamp-2 break-words pr-10 font-display text-h3 font-extrabold leading-[1.1] tracking-[-0.02em]">
      {children}
    </p>
  );
}

/** A mono excerpt that fades out at the bottom where it is cut off. */
export function TextArtExcerpt({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("prompt-text min-h-0 flex-1 overflow-hidden break-words whitespace-pre-line [mask-image:linear-gradient(#000_62%,transparent_100%)]", className)}>
      {/* The type glyph sits in the corner: the first lines wrap around this spacer. */}
      <span aria-hidden className="float-right h-9 w-10" />
      {children}
    </p>
  );
}

/** The text surface of a quoted / applied post whose content has no picture: its title and the most telling text it has. */
export function SummaryTextArt({ summary, seed }: { summary: ContentSummary; seed: string }) {
  const text = summary.promptText ?? summary.description ?? "";
  return (
    <TextArt seed={seed} className="gap-2.5">
      {summary.promptText ? null : <TextArtTitle>{summary.title}</TextArtTitle>}
      {text.trim() ? <TextArtExcerpt className={summary.promptText ? undefined : "font-sans text-small leading-relaxed"}>{text}</TextArtExcerpt> : null}
      {summary.creativeDirection && <p className="line-clamp-1 shrink-0 text-caption opacity-75">{summary.creativeDirection}</p>}
    </TextArt>
  );
}
