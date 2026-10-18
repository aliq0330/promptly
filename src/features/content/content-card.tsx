"use client";

import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { rememberCardMedia } from "@/lib/card-transition";
import { cn, profileHref } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { UserProfile } from "@/types";
import { splitSourceNotes } from "@/lib/source-notes";

/**
 * Shared shell of every content card on the platform —
 *
 *   ContentCard  (+ ContentCardPost — the Meydan post layout inside)
 *   ├── PromptCard     (image / text / video / audio prompts)
 *   ├── WorkflowCard · PresetCard · RequestCard
 *   └── ApplicationCard (community application post)
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
        "group relative flex flex-col rounded-lg border border-border-soft bg-surface shadow-card transition-[border-color,box-shadow] duration-300 ease-soft hover:border-border hover:shadow-card-hover",
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

/**
 * Every list of posts (Ana Sayfa, Topluluklar and a community's feed, Keşfet, type lists, profile, search,
 * saved/collections, my content — Meydan, docs/history/190-*): the same boxed cards on EVERY screen (a phone is one column with the
 * page's 12px gutter; from `sm` the boxes flow into CSS columns), so a post list looks the same everywhere
 * (docs/history/196-*; the brief flat-rows-on-phones experiment of Faz 6 eki was reverted). Wrap each card in an element with
 * `CONTENT_GRID_ITEM_CLASS`. No `overflow-hidden`: a card's ⋮ menu must be able to open past the list's edge.
 */
export function ContentGrid({
  as: Tag = "div",
  columns = "sm:columns-2 xl:columns-3",
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLElement> & { as?: "div" | "ul"; columns?: string; [data: `data-${string}`]: string | undefined }) {
  return (
    <Tag {...rest} className={cn("sm:gap-4", columns, className)}>
      {children}
    </Tag>
  );
}

/** One cell of a `ContentGrid`: never split across columns; the gap between boxes (12px on a phone, 16px from `sm`). */
export const CONTENT_GRID_ITEM_CLASS = "break-inside-avoid pb-3 sm:pb-4";

/**
 * Meydan post layout (docs/history/190-*) — the one inner structure of every content card:
 *
 *   [avatar]  Name  @user · 3s  [type pill]            ⋮
 *             title / description / media / prompt …
 *             ♥ 12   💬 3                    🔖  📊  ↗
 *
 * A 40px avatar column on the left; the identity line, body and action row all
 * share the column to its right (the action row is indented to line up with it).
 * The identity row sits above the stretched card link (`z-20`, and above its
 * siblings while a menu inside it is open) so the profile links and the ⋮ menu
 * stay clickable.
 */
export function ContentCardPost({
  author,
  meta,
  badges,
  menu,
  footer,
  children,
}: {
  /** `null` = unknown/removed author (shown as a generic user, no profile link). */
  author: Pick<UserProfile, "username" | "displayName" | "avatarUrl"> | null;
  /** Muted text after the name — e.g. "@carol · 3 gün önce" or "bir prompt paylaştı · dün". */
  meta: string;
  /** Pills shown inline on the identity line (content type, status, "Başvuru"…). */
  badges?: React.ReactNode;
  menu?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const name = author?.displayName ?? t("common.genericUser");
  return (
    <>
      <div className="flex gap-3 px-4 pt-4">
        {author ? (
          // The name next to it is the accessible profile link; the avatar is a mouse/touch shortcut to the same page.
          <Link href={profileHref(author)} aria-hidden tabIndex={-1} className="relative z-10 shrink-0 self-start rounded-full">
            <Avatar src={author.avatarUrl} alt={name} size={40} />
          </Link>
        ) : (
          <Avatar src={null} alt={name} size={40} className="shrink-0" />
        )}
        <div className="min-w-0 flex-1 space-y-2.5 pb-1">
          <div className="relative z-20 flex items-start gap-1 focus-within:z-30">
            <p className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-1 pt-0.5 text-small leading-snug">
              {author ? (
                <Link href={profileHref(author)} className="max-w-full truncate rounded-xs font-bold text-text hover:text-primary">
                  {name}
                </Link>
              ) : (
                <span className="font-bold text-text">{name}</span>
              )}
              <span className="min-w-0 truncate text-text-muted">{meta}</span>
              {badges}
            </p>
            {menu}
          </div>
          {children}
        </div>
      </div>
      {footer && <div className="relative z-10 flex items-center gap-0.5 pb-2 pl-[3.5rem] pr-2">{footer}</div>}
    </>
  );
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
      <h2 className="text-[1.0625rem] font-semibold leading-snug tracking-[-0.012em] text-text">
        <Link
          href={href}
          data-card-link
          className="relative z-10 rounded-xs outline-none decoration-primary/40 underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-primary"
        >
          {title}
        </Link>
      </h2>
      {cardBody && <p className="line-clamp-2 text-small leading-relaxed text-text-muted">{cardBody}</p>}
    </div>
  );
}
