"use client";

import Link from "next/link";
import { rememberCardMedia } from "@/lib/card-transition";
import { cn } from "@/lib/utils";
import { splitSourceNotes } from "@/lib/source-notes";

/**
 * Shared shell of every content card on the platform —
 *
 *   ContentCard
 *   ├── PromptCard     (image / text / video / code / music prompts)
 *   ├── GeneratorCard
 *   └── RequestCard
 *
 * Same surface, border, radius, padding, hover and "stretched link" for all
 * of them, so the feed reads as one system and only the content block in
 * the middle differs per type. The full-card `<Link>` sits behind everything
 * (`z-0`); every real control inside (author link, menu, copy, actions) is
 * `relative z-10`, so it stays independently clickable.
 *
 * Hover is border + shadow only — no transform, because a transform would
 * create a stacking context and trap the card's own dropdown menu under the
 * next card in the column.
 */
export function ContentCard({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <article
      // A click that will navigate to this card's own page remembers where the cover is, so the detail
      // page can morph it (src/lib/card-transition.ts). Controls (like, menu…) stop their own clicks.
      onClickCapture={(event) => {
        if ((event.target as Element).closest("a[data-card-link]")) {
          rememberCardMedia(href, event.currentTarget.querySelector("[data-card-media]"));
        }
      }}
      className={cn(
        "group relative flex flex-col rounded-lg border border-border-soft bg-surface shadow-card",
        "transition-[border-color,box-shadow] duration-300 ease-soft hover:border-border hover:shadow-card-hover",
        // Hover-capable pointers only (Tailwind's hover: variant): a hairline of the brand colour opens along the top edge.
        "before:pointer-events-none before:absolute before:inset-x-5 before:top-0 before:z-[1] before:h-px before:origin-center before:scale-x-0 before:rounded-full before:bg-primary/55 before:transition-transform before:duration-[var(--motion-emphasis)] before:ease-soft hover:before:scale-x-100",
        className,
      )}
    >
      {children}
      {/* Mouse/touch convenience only: hidden from assistive tech and the tab
          order — the card title (ContentCardTitle) is the accessible link. */}
      <Link href={href} data-card-link className="absolute inset-0 z-0 rounded-lg" aria-hidden tabIndex={-1} />
    </article>
  );
}

/** Padded content column inside a ContentCard. */
export function ContentCardBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("flex flex-col gap-3 p-4", className)}>{children}</div>;
}

/**
 * Card title — a real link so keyboard users reach the item from its title
 * (the stretched link behind the card is `tabIndex=-1`, mouse-only).
 */
export function ContentCardTitle({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description?: string;
}) {
  // Credit lines ("Kaynak: …") belong on the detail page, not in the preview.
  const cardBody = splitSourceNotes(description).body;
  return (
    <div className="space-y-1">
      <h3 className="text-[1.0625rem] font-semibold leading-snug tracking-[-0.012em] text-text">
        <Link
          href={href}
          data-card-link
          className="relative z-10 rounded-xs outline-none decoration-primary/40 underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-primary"
        >
          {title}
        </Link>
      </h3>
      {cardBody && <p className="line-clamp-2 text-small leading-relaxed text-text-muted">{cardBody}</p>}
    </div>
  );
}
