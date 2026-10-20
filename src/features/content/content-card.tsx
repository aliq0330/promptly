"use client";

import Link from "next/link";
import { createContext, useContext } from "react";
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
        "group relative flex flex-col rounded-xl border border-border-soft bg-surface shadow-card transition-[border-color,box-shadow] duration-300 ease-soft hover:border-border hover:shadow-card-hover",
        // Hover-capable pointers only (Tailwind's hover: variant): a hairline of the brand colour opens along the top edge.
        "before:pointer-events-none before:absolute before:inset-x-5 before:top-0 before:z-[1] before:h-px before:origin-center before:scale-x-0 before:rounded-full before:bg-primary/55 before:transition-transform before:duration-[var(--motion-emphasis)] before:ease-soft hover:before:scale-x-100",
        className,
      )}
    >
      {children}
      {/* Mouse/touch convenience only: hidden from assistive tech and the tab
          order — the card title (ContentCardTitle) is the accessible link. */}
      <Link href={href} data-card-link className="absolute inset-0 z-0 rounded-xl" aria-hidden tabIndex={-1} />
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
  columns,
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLElement> & { as?: "div" | "ul"; columns?: string; [data: `data-${string}`]: string | undefined }) {
  const pageColumns = useContext(ContentGridColumnsContext);
  columns ??= pageColumns ?? "sm:columns-2 xl:columns-3";
  return (
    <Tag {...rest} className={cn("sm:gap-4", columns, className)}>
      {children}
    </Tag>
  );
}

/**
 * A page whose lists sit beside a side column (profile, collection: docs/history/203-*) sets the columns once for every
 * `ContentGrid` under it — its tabs' lists are separate components that each draw their own grid.
 */
const ContentGridColumnsContext = createContext<string | null>(null);
export const ContentGridColumns = ContentGridColumnsContext.Provider;

/** One cell of a `ContentGrid`: never split across columns; the gap between boxes (12px on a phone, 16px from `sm`). */
export const CONTENT_GRID_ITEM_CLASS = "break-inside-avoid pb-3 sm:pb-4";

/**
 * The one inner structure of every content card — the ALBÜM card (docs/history/202-*, the same language as the detail
 * pages' band, docs/history/201-*):
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ BAND (tinted by the post's picture)           │
 *   │   [art: the output / prompt / steps …]        │
 *   │   ▣ GÖRSEL PROMPT · tool  [status]         ⋮  │
 *   │   Big title                                    │
 *   │   (·) Name @user · 3 gün önce                  │
 *   └──────────────────────────────────────────────┘
 *   [ Kopyala ]                 ♥ 12  💬 3  🔖 1  📊  ↗
 *
 * `backdrop` (the post's picture) is shown enlarged and blurred under a veil of the page colour, so the band takes the
 * picture's colours; without one the band is the quiet brand tint. `primary` is the card's one big action (Kopyala /
 * Çalıştır / Studio'da aç / Yanıtla); with it the engagement icons (`footer`, the same components as before: Beğeni ·
 * Yorum · Kaydet · İstatistik … Paylaş) gather on the right, without it they keep their own row. Nothing here creates a
 * stacking context (no `isolate`/transform), so the ⋮ menu still opens over the next card; the controls are `relative z-10`
 * above the card's stretched link and the menu `z-20`.
 */
export function ContentCardPost({
  author,
  meta,
  badges,
  menu,
  art,
  backdrop,
  title,
  primary,
  footer,
  children,
}: {
  /** `null` = unknown/removed author (shown as a generic user, no profile link). */
  author: Pick<UserProfile, "username" | "displayName" | "avatarUrl"> | null;
  /** Muted part of the author line — e.g. "@carol · 3 gün önce" or "bir prompt paylaştı · dün". */
  meta: string;
  /** The kicker row (`ContentTypePill`, status, "Başvuru"…). */
  badges?: React.ReactNode;
  menu?: React.ReactNode;
  /** The band's picture: the output, a prompt box, the steps… */
  art?: React.ReactNode;
  /** The post's picture again (`<img>`/`StorageImage` filling its box) — tints the band. */
  backdrop?: React.ReactNode;
  /** `ContentCardTitle`. */
  title: React.ReactNode;
  /** The card's one big action. */
  primary?: React.ReactNode;
  footer?: React.ReactNode;
  /** Extra lines in the band above the kicker (a request-response's provenance, a community post's note). */
  children?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const name = author?.displayName ?? t("common.genericUser");
  return (
    <>
      <div className="relative rounded-t-xl px-3.5 pb-4 pt-3.5">
        <div aria-hidden className="absolute inset-0 overflow-hidden rounded-t-xl bg-primary-soft">
          {backdrop && (
            <>
              <div className="absolute inset-0 scale-150 opacity-70 blur-2xl saturate-150">{backdrop}</div>
              <div className="absolute inset-0 bg-background/55" />
            </>
          )}
        </div>
        <div className="relative space-y-3.5">
          {art}
          {children && <div className="space-y-2">{children}</div>}
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1 space-y-1.5">
              {badges && <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">{badges}</div>}
              {title}
              <p className="flex min-w-0 items-center gap-2 text-small leading-tight text-text-secondary">
                {author ? (
                  <Link href={profileHref(author)} aria-hidden tabIndex={-1} className="relative z-10 shrink-0 rounded-full">
                    <Avatar src={author.avatarUrl} alt={name} size={22} />
                  </Link>
                ) : (
                  <Avatar src={null} alt={name} size={22} className="shrink-0" />
                )}
                <span className="min-w-0 truncate">
                  {author ? (
                    <Link href={profileHref(author)} className="relative z-10 rounded-xs font-semibold text-text hover:text-primary">
                      {name}
                    </Link>
                  ) : (
                    <span className="font-semibold text-text">{name}</span>
                  )}{" "}
                  {meta}
                </span>
              </p>
            </div>
            {menu && <div className="relative z-20 -mr-1.5 -mt-1.5 shrink-0 focus-within:z-30">{menu}</div>}
          </div>
        </div>
      </div>
      {(primary || footer) && (
        <div data-card-actions className="relative z-10 flex items-center gap-0.5 px-2 py-2">
          {primary ? (
            <>
              <div className="flex shrink-0 items-center pl-1.5">{primary}</div>
              {/* Shrink-to-fit: the footer's own `ml-auto` spacer has no room here, so the icons gather on the right. */}
              <div className="ml-auto flex min-w-0 items-center gap-0.5">{footer}</div>
            </>
          ) : (
            footer
          )}
        </div>
      )}
    </>
  );
}

/** The class of a card's big primary action (a `Link`/button beside the engagement icons). */
export const CARD_PRIMARY_CLASS =
  "relative z-10 inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 text-label font-semibold text-primary-foreground transition-colors duration-200 hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background";

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
  // Credit lines ("Kaynak: …") belong on the detail page, not in the preview. The Albüm card passes no description
  // (title + author only); a caller that does gets two clamped lines.
  const cardBody = splitSourceNotes(description).body;
  return (
    <div className="space-y-1">
      <h2 className="font-display text-[1.3125rem] font-extrabold leading-[1.1] tracking-[-0.02em] text-text">
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
