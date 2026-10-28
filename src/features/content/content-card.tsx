"use client";

import Link from "next/link";
import { ImageIcon, type LucideIcon } from "lucide-react";
import { createContext, useContext, useRef } from "react";
import { Avatar } from "@/components/ui/avatar";
import { rememberCardMedia, useCardMediaReturn } from "@/lib/card-transition";
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
  onOpen,
  variant = "box",
  className,
  children,
}: {
  href: string;
  /** Called when the card's own link is followed — a card hands its post to the detail page (`lib/detail-handoff.ts`). */
  onOpen?: () => void;
  /** "visual": the picture-first post card (`ContentCardPost`) — no box, the rounded picture is the card. "box": a surface with border + shadow. */
  variant?: "box" | "visual";
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  // Back from this card's own detail page: the hero shrinks back into the cover.
  useCardMediaReturn(href, ref);
  return (
    <article
      ref={ref}
      // A click that will navigate to this card's own page remembers where the cover is, so the detail
      // page can morph it (src/lib/card-transition.ts). Controls (like, menu…) stop their own clicks.
      onClickCapture={(event) => {
        if ((event.target as Element).closest("a[data-card-link]")) {
          rememberCardMedia(href, event.currentTarget.querySelector("[data-card-media]"));
          onOpen?.();
        }
      }}
      className={cn(
        variant === "visual"
          ? "group relative flex flex-col"
          : [
              "group relative flex flex-col rounded-xl border border-border-soft bg-surface shadow-card transition-[border-color,box-shadow] duration-300 ease-soft hover:border-border hover:shadow-card-hover",
              // Hover-capable pointers only (Tailwind's hover: variant): a hairline of the brand colour opens along the top edge.
              "before:pointer-events-none before:absolute before:inset-x-5 before:top-0 before:z-[1] before:h-px before:origin-center before:scale-x-0 before:rounded-full before:bg-primary/55 before:transition-transform before:duration-[var(--motion-emphasis)] before:ease-soft hover:before:scale-x-100",
            ],
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
    <Tag {...rest} className={cn("sm:gap-5", columns, className)}>
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

/** One cell of a `ContentGrid`: never split across columns; the gap between cards (20px on a phone, 24px from `sm`). */
export const CONTENT_GRID_ITEM_CLASS = "break-inside-avoid pb-5 sm:pb-6";

/**
 * The tinted layer behind an Albüm card's band: `backdrop` (a picture filling its box) enlarged and blurred under a veil of
 * the page colour, else the quiet brand tint. Put it first inside a `relative rounded-t-xl` band; the band's content goes
 * after it in a `relative` box. Shared by the content cards and the community / collection / creator cards (docs/history/203-*).
 */
export function CardBandBackdrop({
  backdrop,
  tint,
  className,
  as: Tag = "div",
}: {
  backdrop?: React.ReactNode;
  /**
   * The picture's stored average colour (`PromptMedia.color`, docs/history/209-*). When known it tints the band directly —
   * the same look without drawing an enlarged, blurred copy of the picture behind every card, and there before the picture loads.
   */
  tint?: string | null;
  className?: string;
  /** "span" inside a `<button>` band (a workflow's step card). */
  as?: "div" | "span";
}) {
  if (tint) {
    return <Tag aria-hidden className={cn("absolute inset-0 overflow-hidden rounded-t-xl", className)} style={{ backgroundColor: bandTint(tint) }} />;
  }
  return (
    <Tag aria-hidden className={cn("absolute inset-0 overflow-hidden rounded-t-xl bg-primary-soft", className)}>
      {backdrop && (
        <>
          <Tag className="absolute inset-0 scale-150 opacity-70 blur-2xl saturate-150">{backdrop}</Tag>
          <Tag className="absolute inset-0 bg-background/55" />
        </>
      )}
    </Tag>
  );
}

/** A band colour from a picture's average colour: about a third of it over the page colour (the blurred backdrop's strength). */
export function bandTint(color: string): string {
  return `color-mix(in srgb, ${color} 34%, var(--color-background))`;
}

/**
 * The one inner structure of every content card — the VISUAL card (picture first, the Dribbble-style post):
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ [status]                             ( ▶ )    │  ← the post's picture, rounded, no frame; the small round
 *   │                                               │    glyph is the type (video/audio/text/workflow/preset/
 *   │              (the picture / the art)          │    request — not shown for an image prompt)
 *   │  ░ on hover/focus: kicker, title, @user · time │
 *   └──────────────────────────────────────────────┘
 *   (·) Name                       ♥ 12  💬 3  🔖  ⋮
 *
 * No visible title or description: the title is revealed over the picture on hover/keyboard focus (it stays the card's real
 * link for keyboard and screen-reader users). `art` is whatever fills the picture (the output, a prompt text, the steps…) and
 * sets its height; `status` is always visible (Taslak, Açık/Kapandı, Alıntı…); `badges` (kicker, announced chip) and `meta`
 * appear with the title. `children` are extra lines (a request-response's provenance, a quote's note) between the picture and
 * the footer. Nothing here creates a stacking context outside the picture (no `isolate`/transform on the card), so the ⋮ menu
 * still opens over the next card; the controls are `relative z-10` above the card's stretched link and the menu `z-20`.
 */
export function ContentCardPost({
  author,
  meta,
  typeIcon: TypeIcon,
  titleInArt,
  status,
  badges,
  menu,
  art,
  title,
  footer,
  children,
}: {
  /** `null` = unknown/removed author (shown as a generic user, no profile link). */
  author: Pick<UserProfile, "username" | "displayName" | "avatarUrl"> | null;
  /** Muted part of the author line — e.g. "@carol · 3 gün önce" or "bir prompt paylaştı · dün"; shown with the title on hover. */
  meta: string;
  /** The small round glyph on the picture: what kind of post this is (skipped for an image prompt, whose picture says it). */
  typeIcon?: LucideIcon;
  /** The art already shows the title (a text surface): the hover layer keeps it only for assistive tech / keyboard focus. */
  titleInArt?: boolean;
  /** Always-visible chips in the picture's bottom-right corner (clear of the type glyph and of a text surface's title) (`Badge`s: Taslak, Açık/Kapandı, Alıntı, Sabit…). */
  status?: React.ReactNode;
  /** The kicker row shown with the title on hover (`ContentTypePill`, announced chip…). */
  badges?: React.ReactNode;
  menu?: React.ReactNode;
  /** What fills the picture: the output, a prompt box, the steps… It sets the picture's height. */
  art?: React.ReactNode;
  /** `ContentCardTitle`. */
  title: React.ReactNode;
  /** The compact counters (Beğeni · Yorum · Kaydet), right of the author. */
  footer?: React.ReactNode;
  /** Extra lines between the picture and the author row. */
  children?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const name = author?.displayName ?? t("common.genericUser");
  return (
    <>
      <div data-card-media className="relative overflow-hidden rounded-xl bg-primary-soft">
        {art ?? (
          <div aria-hidden className="flex aspect-[4/3] w-full items-center justify-center text-primary/40">
            {TypeIcon && <TypeIcon size={44} strokeWidth={1.5} />}
          </div>
        )}
        {status && <div className="absolute bottom-2.5 right-2.5 z-[3] flex flex-wrap items-center justify-end gap-1.5">{status}</div>}
        {art && TypeIcon && TypeIcon !== ImageIcon && (
          <span aria-hidden className="absolute right-2.5 top-2.5 z-[1] flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm">
            <TypeIcon size={18} strokeWidth={1.75} />
          </span>
        )}
        {/* Title + kicker over the picture on hover / keyboard focus. The overlay lets clicks through to the stretched link; the title link inside it is the keyboard way in. */}
        <div className={cn("pointer-events-none absolute inset-x-0 bottom-0 z-[2] space-y-1.5 bg-gradient-to-t from-black/75 via-black/45 to-transparent px-3.5 pb-3 pt-12 opacity-0 transition-opacity duration-200 ease-soft group-focus-within:opacity-100 group-hover:opacity-100 [&_a]:pointer-events-auto [&_h2]:text-white [&_p]:text-white/85 [&_span]:text-white", status && "pr-24", titleInArt && "sr-only")}>
          {badges && <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">{badges}</div>}
          {title}
          {meta && <p className="truncate text-small leading-tight">{meta}</p>}
        </div>
      </div>
      {children && <div className="space-y-2 px-0.5 pt-2.5 empty:hidden">{children}</div>}
      <div className="relative z-10 flex items-center gap-2 pb-0.5 pl-0.5 pt-2">
        {author ? (
          <Link href={profileHref(author)} className="flex min-w-0 flex-1 items-center gap-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <Avatar src={author.avatarUrl} alt="" size={28} className="shrink-0" />
            <span className="min-w-0 truncate text-body font-medium text-text hover:text-primary">{name}</span>
          </Link>
        ) : (
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <Avatar src={null} alt="" size={28} className="shrink-0" />
            <span className="min-w-0 truncate text-body font-medium text-text">{name}</span>
          </span>
        )}
        {(footer || menu) && (
          <div data-card-actions className="-mr-1.5 flex shrink-0 items-center gap-0">
            {footer}
            {menu && <div className="relative z-20 focus-within:z-30">{menu}</div>}
          </div>
        )}
      </div>
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
